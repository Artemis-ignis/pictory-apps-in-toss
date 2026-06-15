import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { AppHeader } from "./components/AppHeader";
import { BottomNav, type TabId } from "./components/BottomNav";
import { HomePage } from "./pages/HomePage";
import { MapPage } from "./pages/MapPage";
import { CleanPage } from "./pages/CleanPage";
import { SavedPage } from "./pages/SavedPage";
import { PhotoDetailPage } from "./pages/PhotoDetailPage";
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
  applyItemStatusChange,
  loadPictoryState,
  mergeStoredItemStatuses,
  prepareRecentItemsForStorage,
  savePictoryState,
} from "./features/album/storage";
import {
  CLEAN_BUCKETS,
  MAP_BUCKETS,
  type AlbumItem,
  type AiRefinementResult,
  type ClassifiedItem,
  type CleanBucketId,
  type MapFolderId,
  type MapBucketId,
  type PersistedPictoryState,
  type PlanId,
} from "./features/album/types";
import {
  preloadRewardedScanAd,
  showRewardedScanAd,
} from "./features/ads/rewardAd";
import { grantRewardCredits } from "./features/ads/rewardCredit";
import {
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
import { deletePictoryServerData } from "./features/privacy/pictoryDataDelete";

interface PictoryViewState {
  scope: "pictory-view";
  tab: TabId;
  mapFolder: MapFolderId | "all";
  cleanBucket: CleanBucketId | "all";
  savedBucket: MapBucketId | "all";
  photoId: string | null;
}

type MapViewMode = "category" | "period";

const DEFAULT_VIEW_STATE: PictoryViewState = {
  scope: "pictory-view",
  tab: "home",
  mapFolder: "all",
  cleanBucket: "all",
  savedBucket: "all",
  photoId: null,
};

const TAB_IDS = new Set<TabId>(["home", "map", "clean", "saved"]);
const MAP_BUCKET_IDS = new Set(MAP_BUCKETS.map((bucket) => bucket.id));
const CLEAN_BUCKET_IDS = new Set(CLEAN_BUCKETS.map((bucket) => bucket.id));

function App() {
  const screenFrameRef = useRef<HTMLDivElement>(null);
  const initialViewStateRef = useRef<PictoryViewState | null>(null);
  if (initialViewStateRef.current == null) {
    initialViewStateRef.current = getInitialViewState();
  }
  const initialViewState = initialViewStateRef.current;
  const skipNextHistoryWriteRef = useRef(false);
  const replaceNextHistoryRef = useRef(false);
  const didWriteInitialHistoryRef = useRef(false);
  const lastHistoryKeyRef = useRef("");
  const [activeTab, setActiveTab] = useState<TabId>(initialViewState.tab);
  const [items, setItems] = useState<ClassifiedItem[]>([]);
  const [state, setState] =
    useState<PersistedPictoryState>(defaultPictoryState);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [verifiedPlanId, setVerifiedPlanId] = useState<PlanId>("free");
  const restoreAttemptedRef = useRef(false);
  const [scanMessage, setScanMessage] = useState(
    "사진을 선택하거나 앨범 지도를 만들 수 있어요.",
  );
  const [selectedMapFolder, setSelectedMapFolder] = useState<
    MapFolderId | "all"
  >(initialViewState.mapFolder);
  const [mapViewMode, setMapViewMode] = useState<MapViewMode>("category");
  const [selectedCleanBucket, setSelectedCleanBucket] = useState<
    CleanBucketId | "all"
  >(initialViewState.cleanBucket);
  const [selectedSavedBucket, setSelectedSavedBucket] = useState<
    MapBucketId | "all"
  >(initialViewState.savedBucket);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(
    initialViewState.photoId,
  );
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
  }, [
    activeTab,
    selectedCleanBucket,
    selectedMapFolder,
    selectedPhotoId,
    selectedSavedBucket,
  ]);

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
  const selectedPhoto =
    selectedPhotoId == null
      ? undefined
      : visibleItems.find((item) => item.id === selectedPhotoId);
  const queuedCount = visibleItems.filter(
    (item) => item.status === "queued",
  ).length;
  const entitledState = useMemo(
    () => getEntitledBillingState(state, billingRuntime, verifiedPlanId),
    [billingRuntime, state, verifiedPlanId],
  );
  const scanAllowance = getScanAllowance(entitledState);
  const currentPlan = getPlan(entitledState.planId);
  const viewState = useMemo<PictoryViewState>(
    () => ({
      scope: "pictory-view",
      tab: activeTab,
      mapFolder: selectedMapFolder,
      cleanBucket: selectedCleanBucket,
      savedBucket: selectedSavedBucket,
      photoId: selectedPhotoId,
    }),
    [
      activeTab,
      selectedCleanBucket,
      selectedMapFolder,
      selectedPhotoId,
      selectedSavedBucket,
    ],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    function handlePopState() {
      const nextView = readBrowserViewState() ?? DEFAULT_VIEW_STATE;
      skipNextHistoryWriteRef.current = true;
      replaceNextHistoryRef.current = false;
      setActiveTab(nextView.tab);
      setSelectedMapFolder(nextView.mapFolder);
      setSelectedCleanBucket(nextView.cleanBucket);
      setSelectedSavedBucket(nextView.savedBucket);
      setSelectedPhotoId(nextView.photoId);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const nextKey = serializeViewState(viewState);
    if (skipNextHistoryWriteRef.current) {
      skipNextHistoryWriteRef.current = false;
      lastHistoryKeyRef.current = nextKey;
      return;
    }

    if (lastHistoryKeyRef.current === nextKey) {
      replaceNextHistoryRef.current = false;
      return;
    }

    const method =
      !didWriteInitialHistoryRef.current || replaceNextHistoryRef.current
        ? "replaceState"
        : "pushState";
    window.history[method](viewState, "", buildViewUrl(viewState));
    didWriteInitialHistoryRef.current = true;
    replaceNextHistoryRef.current = false;
    lastHistoryKeyRef.current = nextKey;
  }, [viewState]);

  useEffect(() => {
    if (isHydrated && selectedPhotoId != null && selectedPhoto == null) {
      replaceNextHistoryRef.current = true;
      setSelectedPhotoId(null);
    }
  }, [isHydrated, selectedPhoto, selectedPhotoId]);

  async function analyzeIncoming(nextItems: AlbumItem[], message: string) {
    setIsScanning(true);
    setScanMessage("픽토리가 사진 신호를 읽고 있어요.");
    let aiRefinementResult: AiRefinementResult | undefined;
    const classified = await classifyAlbumItems(nextItems, statusMap, {
      refineWithServerAi: canUseServerAiRefinement(
        entitledState,
        nextItems.length,
      ),
      onAiRefinementResult: (result) => {
        aiRefinementResult = result;
      },
    });
    const recentItems = await prepareRecentItemsForStorage(classified);
    const scannedAt = new Date().toISOString();
    setItems(classified);
    setState((previous) => {
      const consumedState = consumeScanAllowance(
        getEntitledBillingState(previous, billingRuntime, verifiedPlanId),
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
        lastAiRefinement: aiRefinementResult,
        lastScanAt: scannedAt,
        lastScanCount: classified.length,
      };
    });
    setScanMessage(formatScanMessage(message, aiRefinementResult));
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

    const grant = await grantRewardCredits(result);
    if (grant.granted <= 0) {
      setScanMessage(
        grant.duplicated
          ? "이미 지급된 광고 보상이에요."
          : "광고 보상을 서버에 확인하지 못했어요. 잠시 후 다시 시도해주세요.",
      );
      return;
    }

    setState((previous) => ({
      ...previous,
      credits:
        grant.serverAiCredits != null
          ? Math.min(3000, grant.serverAiCredits)
          : Math.min(3000, previous.credits + grant.granted),
    }));
    setScanMessage(
      grant.source === "localFallback"
        ? `${grant.granted}장 보너스 스캔권을 받았어요.`
        : `${grant.granted}장 스캔권을 받았어요.`,
    );
  }

  function updateItemStatus(id: string, status: ClassifiedItem["status"]) {
    updateItemsStatus([id], status);
  }

  function updateItemsStatus(ids: string[], status: ClassifiedItem["status"]) {
    if (ids.length === 0) {
      return;
    }

    const result = applyItemStatusChange(
      state,
      ids,
      status,
      currentPlan.storageLimit,
    );
    if (result.changedCount === 0) {
      setScanMessage(`${currentPlan.label} 플랜의 보관 한도에 도달했어요.`);
      return;
    }

    setState(result.state);

    if (status === "saved") {
      setScanMessage(
        result.skippedSaveCount > 0
          ? `${result.changedCount}장만 보관했어요. ${currentPlan.label} 보관 한도에 걸렸어요.`
          : `${result.changedCount}장을 보관했어요.`,
      );
      return;
    }

    if (status === "queued") {
      setScanMessage(`${result.changedCount}장을 정리 후보로 표시했어요.`);
      return;
    }

    if (status === "ignored") {
      setScanMessage(`${result.changedCount}장을 이번 정리에서 제외했어요.`);
      return;
    }

    setScanMessage(`${result.changedCount}장을 원래 상태로 돌렸어요.`);
  }

  async function handleClear() {
    const serverDelete = await deletePictoryServerData();
    await clearPictoryState();
    replaceNextHistoryRef.current = true;
    setState(defaultPictoryState);
    setItems([]);
    setSelectedPhotoId(null);
    setSelectedMapFolder("all");
    setSelectedCleanBucket("all");
    setSelectedSavedBucket("all");
    setScanMessage(
      serverDelete.status === "serverFailed"
        ? "기기 안 기록은 비웠어요. 서버 기록 삭제 확인은 실패했어요."
        : "픽토리 기록을 비웠어요.",
    );
  }

  function handleTabChange(tabId: TabId) {
    if (tabId === activeTab) {
      replaceNextHistoryRef.current = true;
    }
    setSelectedPhotoId(null);
    if (tabId === activeTab) {
      if (tabId === "map") {
        setSelectedMapFolder("all");
      }
      if (tabId === "clean") {
        setSelectedCleanBucket("all");
      }
      if (tabId === "saved") {
        setSelectedSavedBucket("all");
      }
    }
    setActiveTab(tabId);
  }

  function handleViewAll() {
    setSelectedPhotoId(null);
    setSelectedMapFolder("all");
    setActiveTab("map");
  }

  function handleOpenMapFolder(folderId: MapFolderId) {
    setSelectedPhotoId(null);
    setSelectedMapFolder(folderId);
    setActiveTab("map");
  }

  function handleSelectMapFolder(folderId: MapFolderId | "all") {
    if (folderId === "all") {
      replaceNextHistoryRef.current = true;
    }
    setSelectedPhotoId(null);
    setSelectedMapFolder(folderId);
  }

  function handleSelectCleanBucket(bucketId: CleanBucketId | "all") {
    if (bucketId === "all") {
      replaceNextHistoryRef.current = true;
    }
    setSelectedPhotoId(null);
    setSelectedCleanBucket(bucketId);
  }

  function handleSelectSavedBucket(bucketId: MapBucketId | "all") {
    if (bucketId === "all") {
      replaceNextHistoryRef.current = true;
    }
    setSelectedPhotoId(null);
    setSelectedSavedBucket(bucketId);
  }

  function handleOpenPhoto(photoId: string) {
    setSelectedPhotoId(photoId);
  }

  function handleClosePhoto() {
    replaceNextHistoryRef.current = true;
    setSelectedPhotoId(null);
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
        {selectedPhoto != null ? (
          <PhotoDetailPage
            item={selectedPhoto}
            onBack={handleClosePhoto}
            onSave={(id) => updateItemStatus(id, "saved")}
            onUnsave={(id) => updateItemStatus(id, "inbox")}
            onQueue={(id) => updateItemStatus(id, "queued")}
            onIgnore={(id) => updateItemStatus(id, "ignored")}
          />
        ) : null}
        {selectedPhoto == null && activeTab === "home" ? (
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
        {selectedPhoto == null && activeTab === "map" ? (
          <MapPage
            items={visibleItems}
            selectedFolder={selectedMapFolder}
            viewMode={mapViewMode}
            onSelectFolder={handleSelectMapFolder}
            onViewModeChange={setMapViewMode}
            onSave={(id) => updateItemStatus(id, "saved")}
            onQueue={(id) => updateItemStatus(id, "queued")}
            onIgnore={(id) => updateItemStatus(id, "ignored")}
            onOpenPhoto={handleOpenPhoto}
            onApplyFolderStatus={updateItemsStatus}
          />
        ) : null}
        {selectedPhoto == null && activeTab === "clean" ? (
          <CleanPage
            items={visibleItems}
            selectedBucket={selectedCleanBucket}
            queuedCount={queuedCount}
            onSelectBucket={handleSelectCleanBucket}
            onQueue={(id) => updateItemStatus(id, "queued")}
            onSave={(id) => updateItemStatus(id, "saved")}
            onIgnore={(id) => updateItemStatus(id, "ignored")}
            onOpenPhoto={handleOpenPhoto}
            onApplyFolderStatus={updateItemsStatus}
          />
        ) : null}
        {selectedPhoto == null && activeTab === "saved" ? (
          <SavedPage
            savedItems={savedItems}
            historyEntries={state.scanHistory}
            plan={currentPlan}
            selectedBucket={selectedSavedBucket}
            onSelectBucket={handleSelectSavedBucket}
            onOpenPhoto={handleOpenPhoto}
            onUnsave={(ids) => updateItemsStatus(ids, "inbox")}
            onClear={handleClear}
            onShare={handleShare}
          />
        ) : null}
      </div>
      <BottomNav activeTab={activeTab} onChange={handleTabChange} />
    </div>
  );
}

function getInitialViewState() {
  if (typeof window === "undefined") {
    return DEFAULT_VIEW_STATE;
  }

  return readBrowserViewState() ?? DEFAULT_VIEW_STATE;
}

function readBrowserViewState() {
  const historyState = window.history.state;
  if (isPictoryViewState(historyState)) {
    return historyState;
  }

  return parseViewHash(window.location.hash);
}

function isPictoryViewState(value: unknown): value is PictoryViewState {
  if (typeof value !== "object" || value == null) {
    return false;
  }

  const candidate = value as Partial<PictoryViewState>;
  return (
    candidate.scope === "pictory-view" &&
    isTabId(candidate.tab) &&
    isMapFolder(candidate.mapFolder) &&
    isCleanBucket(candidate.cleanBucket) &&
    isSavedBucket(candidate.savedBucket) &&
    (typeof candidate.photoId === "string" || candidate.photoId == null)
  );
}

function parseViewHash(hash: string) {
  if (!hash.startsWith("#tab=")) {
    return null;
  }

  const params = new URLSearchParams(hash.slice(1));
  const tab = params.get("tab");
  const mapFolder = params.get("map");
  const cleanBucket = params.get("clean");
  const savedBucket = params.get("saved");
  const photoId = params.get("photo");

  return {
    scope: "pictory-view",
    tab: isTabId(tab) ? tab : DEFAULT_VIEW_STATE.tab,
    mapFolder: isMapFolder(mapFolder)
      ? mapFolder
      : DEFAULT_VIEW_STATE.mapFolder,
    cleanBucket: isCleanBucket(cleanBucket)
      ? cleanBucket
      : DEFAULT_VIEW_STATE.cleanBucket,
    savedBucket: isSavedBucket(savedBucket)
      ? savedBucket
      : DEFAULT_VIEW_STATE.savedBucket,
    photoId: photoId && photoId.length > 0 ? photoId : null,
  } satisfies PictoryViewState;
}

function buildViewUrl(viewState: PictoryViewState) {
  const params = new URLSearchParams({
    tab: viewState.tab,
    map: viewState.mapFolder,
    clean: viewState.cleanBucket,
    saved: viewState.savedBucket,
  });

  if (viewState.photoId != null) {
    params.set("photo", viewState.photoId);
  }

  return `${window.location.pathname}${window.location.search}#${params.toString()}`;
}

function serializeViewState(viewState: PictoryViewState) {
  return [
    viewState.tab,
    viewState.mapFolder,
    viewState.cleanBucket,
    viewState.savedBucket,
    viewState.photoId ?? "",
  ].join("|");
}

function isTabId(value: unknown): value is TabId {
  return typeof value === "string" && TAB_IDS.has(value as TabId);
}

function isMapFolder(value: unknown): value is MapFolderId | "all" {
  if (value === "all") {
    return true;
  }

  if (typeof value !== "string") {
    return false;
  }

  if (value.startsWith("period:")) {
    return value.length > "period:".length;
  }

  if (!value.startsWith("category:")) {
    return false;
  }

  return MAP_BUCKET_IDS.has(value.slice("category:".length) as MapBucketId);
}

function isCleanBucket(value: unknown): value is CleanBucketId | "all" {
  return (
    value === "all" ||
    (typeof value === "string" &&
      CLEAN_BUCKET_IDS.has(value as CleanBucketId))
  );
}

function isSavedBucket(value: unknown): value is MapBucketId | "all" {
  return (
    value === "all" ||
    (typeof value === "string" && MAP_BUCKET_IDS.has(value as MapBucketId))
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

function formatScanMessage(
  message: string,
  aiRefinementResult?: AiRefinementResult,
) {
  if (!aiRefinementResult) {
    return message;
  }

  if (
    aiRefinementResult.status === "applied" &&
    aiRefinementResult.refinedCount > 0
  ) {
    return `${message} 서버 AI가 ${aiRefinementResult.refinedCount}장 더 확인했어요.`;
  }

  if (aiRefinementResult.status === "failed") {
    return `${message} 서버 AI 보정은 플랜/크레딧 확인 후 다시 시도해요.`;
  }

  return message;
}

export default App;
