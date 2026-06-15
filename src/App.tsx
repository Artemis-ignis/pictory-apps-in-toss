import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { AppHeader } from "./components/AppHeader";
import { BottomNav, type TabId } from "./components/BottomNav";
import { HomePage } from "./pages/HomePage";
import { MapPage } from "./pages/MapPage";
import { CleanPage } from "./pages/CleanPage";
import { SavedPage } from "./pages/SavedPage";
import {
  pickAlbumItems,
  requestAlbumScan,
} from "./features/album/albumAdapter";
import {
  classifyAlbumItems,
  getCategorySummary,
  getCleanSummary,
  isCleanTabItem,
} from "./features/album/classifier";
import {
  clearPictoryState,
  defaultPictoryState,
  loadPictoryState,
  mergeStoredItemStatuses,
  prepareRecentItemsForStorage,
  savePictoryState,
} from "./features/album/storage";
import type {
  AlbumItem,
  ClassifiedItem,
  CleanBucketId,
  MapFolderId,
  MapBucketId,
  PersistedPictoryState,
  PlanId,
} from "./features/album/types";
import {
  preloadRewardedScanAd,
  showRewardedScanAd,
} from "./features/ads/rewardAd";
import {
  canSaveMore,
  canUseServerAiRefinement,
  canUseLocalPaidPlanPreview,
  consumeScanAllowance,
  getBillingRuntime,
  getEntitledBillingState,
  getPlan,
  getScanAllowance,
} from "./features/billing/plans";
import {
  purchaseSubscriptionPlan,
  restoreIapEntitlement,
} from "./features/billing/iap";

function App() {
  const screenFrameRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [items, setItems] = useState<ClassifiedItem[]>([]);
  const [state, setState] =
    useState<PersistedPictoryState>(defaultPictoryState);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [verifiedPlanId, setVerifiedPlanId] = useState<PlanId>("free");
  const restoreAttemptedRef = useRef(false);
  const [scanMessage, setScanMessage] = useState(
    "개발 환경이라도 실제 파일 선택으로 동작을 확인할 수 있어요.",
  );
  const [selectedMapFolder, setSelectedMapFolder] = useState<
    MapFolderId | "all"
  >("all");
  const [selectedCleanBucket, setSelectedCleanBucket] = useState<
    CleanBucketId | "all"
  >("all");
  const [selectedSavedBucket, setSelectedSavedBucket] = useState<
    MapBucketId | "all"
  >("all");
  const billingRuntime = useMemo(() => getBillingRuntime(), []);

  useEffect(() => {
    loadPictoryState()
      .then((storedState) => {
        setState(storedState);
        setItems(mergeStoredItemStatuses(storedState.recentItems, storedState));
      })
      .catch(() => setState(defaultPictoryState))
      .finally(() => setIsHydrated(true));
  }, []);

  useEffect(() => {
    if (isHydrated) {
      savePictoryState(state).catch(() => undefined);
    }
  }, [isHydrated, state]);

  useEffect(() => {
    screenFrameRef.current?.scrollTo({ top: 0 });
  }, [activeTab, selectedCleanBucket, selectedMapFolder, selectedSavedBucket]);

  useEffect(() => {
    preloadRewardedScanAd().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (
      !isHydrated ||
      restoreAttemptedRef.current ||
      canUseLocalPaidPlanPreview(billingRuntime)
    ) {
      return;
    }

    restoreAttemptedRef.current = true;
    restoreIapEntitlement(state).then((result) => {
      if (result.status === "restored") {
        setVerifiedPlanId(result.entitlement.planId);
        setState((previous) => ({
          ...previous,
          planId: result.entitlement.planId,
          iapEntitlement: result.entitlement,
        }));
        setScanMessage(
          `${getPlan(result.entitlement.planId).label} 플랜 권한을 복원했어요.`,
        );
        return;
      }

      if (result.status === "expired") {
        setVerifiedPlanId("free");
        setState((previous) => ({
          ...previous,
          planId: "free",
          iapEntitlement: undefined,
        }));
        setScanMessage(result.message);
      }
    });
  }, [billingRuntime, isHydrated, state]);

  const statusMap = useMemo(() => {
    const map = new Map<string, ClassifiedItem["status"]>();
    state.savedIds.forEach((id) => map.set(id, "saved"));
    state.queuedIds.forEach((id) => map.set(id, "queued"));
    state.ignoredIds.forEach((id) => map.set(id, "ignored"));
    return map;
  }, [state.ignoredIds, state.queuedIds, state.savedIds]);

  const visibleItems = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        status: statusMap.get(item.id) ?? item.status,
      })),
    [items, statusMap],
  );

  const summaries = useMemo(
    () => ({
      map: getCategorySummary(visibleItems),
      clean: getCleanSummary(visibleItems),
    }),
    [visibleItems],
  );

  const savedItems = visibleItems.filter((item) => item.status === "saved");
  const queuedCount = visibleItems.filter(
    (item) => item.status === "queued",
  ).length;
  const entitledState = useMemo(
    () => getEntitledBillingState(state, billingRuntime, verifiedPlanId),
    [billingRuntime, state, verifiedPlanId],
  );
  const scanAllowance = getScanAllowance(entitledState);
  const currentPlan = getPlan(entitledState.planId);

  async function analyzeIncoming(nextItems: AlbumItem[], message: string) {
    setIsScanning(true);
    setScanMessage("픽토리가 사진 신호를 읽고 있어요.");
    const classified = await classifyAlbumItems(nextItems, statusMap, {
      refineWithServerAi: canUseServerAiRefinement(entitledState),
    });
    const recentItems = await prepareRecentItemsForStorage(classified);
    const scannedAt = new Date().toISOString();
    setItems(classified);
    setState((previous) => {
      const consumedState = consumeScanAllowance(
        getEntitledBillingState(previous, billingRuntime),
        classified.length,
      );

      return {
        ...previous,
        ...consumedState,
        recentItems,
        scanHistory: [
          {
            id: scannedAt,
            scannedAt,
            totalCount: classified.length,
            cleanCandidateCount: countCleanCandidates(classified),
            mapBucketCount: Object.keys(getCategorySummary(classified)).length,
          },
          ...previous.scanHistory,
        ].slice(0, 8),
        lastScanAt: scannedAt,
        lastScanCount: classified.length,
      };
    });
    setScanMessage(message);
    setIsScanning(false);
  }

  async function handleScan() {
    try {
      setIsScanning(true);
      const allowance = getScanAllowance(entitledState);
      if (allowance.nextBatchLimit <= 0) {
        setScanMessage(
          "이번 달 정리 가능 장수를 다 썼어요. 광고나 플랜으로 늘릴 수 있어요.",
        );
        setIsScanning(false);
        return;
      }

      const result = await requestAlbumScan(allowance.nextBatchLimit);
      await analyzeIncoming(result.items, result.message);
      setSelectedMapFolder("all");
      setActiveTab("map");
    } catch {
      setScanMessage(
        "앨범을 열지 못했어요. 사진 권한이나 토스 앱 버전을 확인해주세요.",
      );
      setIsScanning(false);
    }
  }

  async function handlePick() {
    try {
      const allowance = getScanAllowance(entitledState);
      if (allowance.nextBatchLimit <= 0) {
        setScanMessage(
          "이번 달 정리 가능 장수를 다 썼어요. 광고나 플랜으로 늘릴 수 있어요.",
        );
        return;
      }

      const result = await pickAlbumItems(allowance.nextBatchLimit);
      if (result.items.length === 0) {
        setScanMessage(result.message);
        return;
      }
      await analyzeIncoming(result.items, result.message);
      setSelectedMapFolder("all");
      setActiveTab("map");
    } catch {
      setScanMessage(
        "사진 선택을 열지 못했어요. 사진 권한이나 토스 앱 버전을 확인해주세요.",
      );
    }
  }

  async function handleReward() {
    setScanMessage("광고 보상 확인 중이에요.");
    const result = await showRewardedScanAd();

    if (result.reward <= 0) {
      const nextMessage =
        result.source === "dismissed"
          ? "광고를 끝까지 보면 스캔권이 지급돼요."
          : "지금은 광고를 불러오지 못했어요. 잠시 후 다시 시도해주세요.";
      setScanMessage(nextMessage);
      return;
    }

    setState((previous) => ({
      ...previous,
      credits: Math.min(3000, previous.credits + result.reward),
    }));
    setScanMessage(
      result.source === "localFallback"
        ? `${result.reward}장 테스트 스캔권을 받았어요.`
        : `${result.reward}장 스캔권을 받았어요.`,
    );
  }

  function updateItemStatus(id: string, status: ClassifiedItem["status"]) {
    if (
      status === "saved" &&
      !state.savedIds.includes(id) &&
      !canSaveMore(entitledState, state.savedIds.length)
    ) {
      setScanMessage(`${currentPlan.label} 플랜의 보관 한도에 도달했어요.`);
      return;
    }

    setState((previous) => {
      const remove = (ids: string[]) => ids.filter((itemId) => itemId !== id);
      return {
        ...previous,
        savedIds:
          status === "saved"
            ? [...remove(previous.savedIds), id]
            : remove(previous.savedIds),
        queuedIds:
          status === "queued"
            ? [...remove(previous.queuedIds), id]
            : remove(previous.queuedIds),
        ignoredIds:
          status === "ignored"
            ? [...remove(previous.ignoredIds), id]
            : remove(previous.ignoredIds),
        recentItems: previous.recentItems.map((item) =>
          item.id === id ? { ...item, status } : item,
        ),
      };
    });
  }

  async function handleClear() {
    await clearPictoryState();
    setState(defaultPictoryState);
    setItems([]);
    setSelectedMapFolder("all");
    setSelectedCleanBucket("all");
    setSelectedSavedBucket("all");
    setScanMessage("픽토리 내부 기록을 비웠어요.");
  }

  function handleTabChange(tabId: TabId) {
    if (tabId === "map") {
      setSelectedMapFolder("all");
    }
    if (tabId === "clean") {
      setSelectedCleanBucket("all");
    }
    if (tabId === "saved") {
      setSelectedSavedBucket("all");
    }
    setActiveTab(tabId);
  }

  function handleViewAll() {
    setSelectedMapFolder("all");
    setActiveTab("map");
  }

  function handleOpenMapFolder(folderId: MapFolderId) {
    setSelectedMapFolder(folderId);
    setActiveTab("map");
  }

  function handleNotify() {
    setScanMessage("정리 완료 알림은 토스 알림 권한 연결 후 켤 수 있어요.");
  }

  function handleShare() {
    const text = `픽토리 요약: ${visibleItems.length}장, 종류 ${
      Object.keys(summaries.map).length
    }개, 정리 후보 ${Object.values(summaries.clean).reduce(
      (sum, count) => sum + count,
      0,
    )}장`;

    if (navigator.share) {
      navigator.share({ title: "픽토리 요약", text }).catch(() => undefined);
      return;
    }

    navigator.clipboard?.writeText(text).catch(() => undefined);
    setScanMessage("요약을 클립보드에 복사했어요.");
  }

  async function handleSelectPlan(planId: PlanId) {
    if (planId === "free") {
      setVerifiedPlanId("free");
      setState((previous) => ({
        ...previous,
        planId,
      }));
      setScanMessage("무료 플랜으로 전환했어요.");
      return;
    }

    if (canUseLocalPaidPlanPreview(billingRuntime)) {
      setState((previous) => ({ ...previous, planId }));
      setScanMessage(
        `${getPlan(planId).label} 플랜 기준으로 한도 미리보기를 적용했어요. 실제 결제는 토스 결제 연동 후 활성화해요.`,
      );
      return;
    }

    setScanMessage(`${getPlan(planId).label} 구독 결제를 준비하고 있어요.`);
    const result = await purchaseSubscriptionPlan(planId);

    if (result.status === "purchased") {
      setVerifiedPlanId(result.entitlement.planId);
      setState((previous) => ({
        ...previous,
        planId: result.entitlement.planId,
        iapEntitlement: result.entitlement,
      }));
      setScanMessage(
        `${getPlan(result.entitlement.planId).label} 플랜이 활성화됐어요.`,
      );
      return;
    }

    setScanMessage(result.message);
  }

  return (
    <div className="app-shell">
      <AppHeader onNotify={handleNotify} />
      <div className="screen-frame" ref={screenFrameRef}>
        {activeTab === "home" ? (
          <HomePage
            items={visibleItems}
            credits={state.credits}
            plan={currentPlan}
            scanAllowance={scanAllowance}
            savedCount={savedItems.length}
            selectedPlanId={entitledState.planId}
            isScanning={isScanning}
            scanMessage={scanMessage}
            onScan={handleScan}
            onPick={handlePick}
            onReward={handleReward}
            onSelectPlan={handleSelectPlan}
            onViewAll={handleViewAll}
            onOpenMapFolder={handleOpenMapFolder}
          />
        ) : null}
        {activeTab === "map" ? (
          <MapPage
            items={visibleItems}
            selectedFolder={selectedMapFolder}
            onSelectFolder={setSelectedMapFolder}
            onSave={(id) => updateItemStatus(id, "saved")}
            onQueue={(id) => updateItemStatus(id, "queued")}
            onIgnore={(id) => updateItemStatus(id, "ignored")}
          />
        ) : null}
        {activeTab === "clean" ? (
          <CleanPage
            items={visibleItems}
            selectedBucket={selectedCleanBucket}
            queuedCount={queuedCount}
            onSelectBucket={setSelectedCleanBucket}
            onQueue={(id) => updateItemStatus(id, "queued")}
            onSave={(id) => updateItemStatus(id, "saved")}
            onIgnore={(id) => updateItemStatus(id, "ignored")}
          />
        ) : null}
        {activeTab === "saved" ? (
          <SavedPage
            savedItems={savedItems}
            historyEntries={state.scanHistory}
            plan={currentPlan}
            selectedBucket={selectedSavedBucket}
            onSelectBucket={setSelectedSavedBucket}
            onClear={handleClear}
            onShare={handleShare}
          />
        ) : null}
      </div>
      <BottomNav activeTab={activeTab} onChange={handleTabChange} />
    </div>
  );
}

function countCleanCandidates(items: ClassifiedItem[]) {
  return items.filter(
    (item) =>
      isCleanTabItem(item) &&
      (item.cleanBucketId !== "keep" ||
        item.privacy !== "normal" ||
        item.status === "queued"),
  ).length;
}

export default App;
