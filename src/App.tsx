import { useEffect, useMemo, useState } from "react";
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
  MapBucketId,
  PersistedPictoryState,
} from "./features/album/types";
import { showRewardedScanAd } from "./features/ads/rewardAd";

function App() {
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [items, setItems] = useState<ClassifiedItem[]>([]);
  const [state, setState] =
    useState<PersistedPictoryState>(defaultPictoryState);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState(
    "개발 환경이라도 실제 파일 선택으로 동작을 확인할 수 있어요.",
  );
  const [selectedMapBucket, setSelectedMapBucket] = useState<
    MapBucketId | "all"
  >("all");
  const [selectedCleanBucket, setSelectedCleanBucket] = useState<
    CleanBucketId | "all"
  >("all");

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

  async function analyzeIncoming(nextItems: AlbumItem[], message: string) {
    setIsScanning(true);
    setScanMessage("픽토리가 사진 신호를 읽고 있어요.");
    const classified = await classifyAlbumItems(nextItems, statusMap);
    const recentItems = await prepareRecentItemsForStorage(classified);
    const scannedAt = new Date().toISOString();
    setItems(classified);
    setState((previous) => ({
      ...previous,
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
    }));
    setScanMessage(message);
    setIsScanning(false);
  }

  async function handleScan() {
    try {
      setIsScanning(true);
      const result = await requestAlbumScan(Math.max(40, state.credits || 40));
      await analyzeIncoming(result.items, result.message);
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
      const result = await pickAlbumItems(40);
      if (result.items.length === 0) {
        setScanMessage(result.message);
        return;
      }
      await analyzeIncoming(result.items, result.message);
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
      credits: Math.min(500, previous.credits + result.reward),
    }));
    setScanMessage(
      result.source === "localFallback"
        ? `${result.reward}장 테스트 스캔권을 받았어요.`
        : `${result.reward}장 스캔권을 받았어요.`,
    );
  }

  function updateItemStatus(id: string, status: ClassifiedItem["status"]) {
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
    setScanMessage("픽토리 내부 기록을 비웠어요.");
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

  return (
    <div className="app-shell">
      <AppHeader />
      <div className="screen-frame">
        {activeTab === "home" ? (
          <HomePage
            items={visibleItems}
            credits={state.credits}
            isScanning={isScanning}
            scanMessage={scanMessage}
            onScan={handleScan}
            onPick={handlePick}
            onReward={handleReward}
            onViewAll={() => setActiveTab("map")}
          />
        ) : null}
        {activeTab === "map" ? (
          <MapPage
            items={visibleItems}
            selectedBucket={selectedMapBucket}
            onSelectBucket={setSelectedMapBucket}
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
            onClear={handleClear}
            onShare={handleShare}
          />
        ) : null}
      </div>
      <BottomNav activeTab={activeTab} onChange={setActiveTab} />
    </div>
  );
}

function countCleanCandidates(items: ClassifiedItem[]) {
  return items.filter(
    (item) =>
      item.cleanBucketId !== "keep" ||
      item.privacy !== "normal" ||
      item.status === "queued",
  ).length;
}

export default App;
