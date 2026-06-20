import { Storage } from "@apps-in-toss/web-framework";
import type { ClassifiedItem, PersistedPictoryState } from "./types";
import { currentUsageMonth, normalizeBillingState } from "../billing/plans";

const STORAGE_KEY = "pictory:v1";
const LEGACY_STORAGE_KEY = "pictory-state-v1";
const MAX_RECENT_ITEMS = 1000;
const MAX_SCAN_HISTORY = 8;
const THUMBNAIL_SIZE = 256;
const MAX_PERSISTED_PREVIEW_BYTES = 100_000;

export const defaultPictoryState: PersistedPictoryState = {
  savedIds: [],
  queuedIds: [],
  ignoredIds: [],
  credits: 0,
  planId: "free",
  usageMonth: currentUsageMonth(),
  monthlyScanUsed: 0,
  recentItems: [],
  scanHistory: [],
};

export async function loadPictoryState(): Promise<PersistedPictoryState> {
  const raw =
    (await getStoredItem(STORAGE_KEY)) ??
    (await getStoredItem(LEGACY_STORAGE_KEY));
  if (raw == null) {
    return defaultPictoryState;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedPictoryState>;
    return normalizeBillingState({
      ...defaultPictoryState,
      ...parsed,
      savedIds: parsed.savedIds ?? [],
      queuedIds: parsed.queuedIds ?? [],
      ignoredIds: parsed.ignoredIds ?? [],
      planId: parsed.planId ?? defaultPictoryState.planId,
      iapEntitlement: parsed.iapEntitlement,
      usageMonth: parsed.usageMonth ?? defaultPictoryState.usageMonth,
      monthlyScanUsed: parsed.monthlyScanUsed ?? 0,
      recentItems: sanitizeLoadedRecentItems(parsed.recentItems ?? []),
      scanHistory: parsed.scanHistory ?? [],
      lastAiRefinement: parsed.lastAiRefinement,
    });
  } catch {
    return defaultPictoryState;
  }
}

export async function savePictoryState(state: PersistedPictoryState) {
  const payload = {
    savedIds: state.savedIds,
    queuedIds: state.queuedIds,
    ignoredIds: state.ignoredIds,
    credits: state.credits,
    planId: state.planId,
    iapEntitlement: state.iapEntitlement,
    usageMonth: state.usageMonth,
    monthlyScanUsed: state.monthlyScanUsed,
    recentItems: state.recentItems.slice(0, MAX_RECENT_ITEMS),
    scanHistory: state.scanHistory.slice(0, MAX_SCAN_HISTORY),
    lastAiRefinement: state.lastAiRefinement,
    lastScanAt: state.lastScanAt,
    lastScanCount: state.lastScanCount,
  };

  try {
    await setStoredItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    await setStoredItem(
      STORAGE_KEY,
      JSON.stringify({
        ...payload,
        recentItems: payload.recentItems.slice(0, 20).map((item) => ({
          ...item,
          dataUri: shouldRedactStoredImage(item)
            ? redactedDataUri()
            : item.dataUri,
        })),
      }),
    );
  }
}

export async function clearPictoryState() {
  await removeStoredItem(STORAGE_KEY);
  await removeStoredItem(LEGACY_STORAGE_KEY);
}

export async function prepareRecentItemsForStorage(
  items: ClassifiedItem[],
): Promise<ClassifiedItem[]> {
  const limited = items.slice(0, MAX_RECENT_ITEMS);
  return Promise.all(limited.map(prepareRecentItemForStorage));
}

export function mergeStoredItemStatuses(
  items: ClassifiedItem[],
  state: PersistedPictoryState,
) {
  const savedIds = new Set(state.savedIds);
  const queuedIds = new Set(state.queuedIds);
  const ignoredIds = new Set(state.ignoredIds);

  return items.map((item) => ({
    ...item,
    status: savedIds.has(item.id)
      ? "saved"
      : queuedIds.has(item.id)
        ? "queued"
        : ignoredIds.has(item.id)
          ? "ignored"
          : item.status,
  }));
}

export function applyItemStatusChange(
  state: PersistedPictoryState,
  ids: string[],
  status: ClassifiedItem["status"],
  saveLimit = Number.POSITIVE_INFINITY,
) {
  const uniqueIds = Array.from(new Set(ids));
  const savedIds = new Set(state.savedIds);
  let remainingSaveSlots = Math.max(0, saveLimit - state.savedIds.length);
  const targetIds =
    status === "saved"
      ? uniqueIds.filter((id) => {
          if (savedIds.has(id)) {
            return true;
          }
          if (remainingSaveSlots <= 0) {
            return false;
          }
          remainingSaveSlots -= 1;
          return true;
        })
      : uniqueIds;
  const targetSet = new Set(targetIds);
  const removeTargetIds = (storedIds: string[]) =>
    storedIds.filter((id) => !targetSet.has(id));
  const appendTargetIds = (storedIds: string[]) =>
    Array.from(new Set([...removeTargetIds(storedIds), ...targetIds]));

  return {
    state: {
      ...state,
      savedIds:
        status === "saved"
          ? appendTargetIds(state.savedIds)
          : removeTargetIds(state.savedIds),
      queuedIds:
        status === "queued"
          ? appendTargetIds(state.queuedIds)
          : removeTargetIds(state.queuedIds),
      ignoredIds:
        status === "ignored"
          ? appendTargetIds(state.ignoredIds)
          : removeTargetIds(state.ignoredIds),
      recentItems: state.recentItems.map((item) =>
        targetSet.has(item.id) ? { ...item, status } : item,
      ),
    },
    changedCount: targetIds.length,
    skippedSaveCount:
      status === "saved" ? uniqueIds.length - targetIds.length : 0,
  };
}

async function prepareRecentItemForStorage(
  item: ClassifiedItem,
): Promise<ClassifiedItem> {
  return {
    ...item,
    dataUri: shouldRedactStoredImage(item)
      ? redactedDataUri()
      : await thumbnailDataUri(item.dataUri),
    hints: item.hints?.slice(0, 8),
    reasons: item.reasons.slice(0, 3),
  };
}

function shouldRedactStoredImage(item: ClassifiedItem) {
  return item.privacy === "sensitive" || item.cleanBucketId === "sensitive";
}

export function sanitizeLoadedRecentItems(items: ClassifiedItem[]) {
  return items
    .filter((item) => !isInternalQaArtifact(item))
    .slice(0, MAX_RECENT_ITEMS)
    .map((item) => {
      if (shouldRedactStoredImage(item)) {
        return { ...item, dataUri: redactedDataUri() };
      }

      if (byteLength(item.dataUri) > MAX_PERSISTED_PREVIEW_BYTES) {
        return { ...item, dataUri: "" };
      }

      return item;
    });
}

function thumbnailDataUri(dataUri: string) {
  if (!dataUri || typeof document === "undefined") {
    return Promise.resolve("");
  }

  return new Promise<string>((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = THUMBNAIL_SIZE;
        canvas.height = THUMBNAIL_SIZE;
        const context = canvas.getContext("2d");
        if (context == null) {
          resolve("");
          return;
        }

        const scale = Math.min(
          THUMBNAIL_SIZE / image.naturalWidth,
          THUMBNAIL_SIZE / image.naturalHeight,
        );
        const width = Math.round(image.naturalWidth * scale);
        const height = Math.round(image.naturalHeight * scale);
        const x = (THUMBNAIL_SIZE - width) / 2;
        const y = (THUMBNAIL_SIZE - height) / 2;

        context.fillStyle = "#eff5ff";
        context.fillRect(0, 0, THUMBNAIL_SIZE, THUMBNAIL_SIZE);
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(image, x, y, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.78));
      } catch {
        resolve("");
      }
    };
    image.onerror = () => resolve("");
    image.src = dataUri;
  });
}

function byteLength(value: string) {
  return new Blob([value]).size;
}

function redactedDataUri() {
  return `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <rect width="96" height="96" rx="22" fill="#eef4ff"/>
  <rect x="25" y="22" width="46" height="52" rx="14" fill="#2f80ff" opacity=".16"/>
  <path d="M34 45h28M34 55h18" stroke="#2f80ff" stroke-width="6" stroke-linecap="round"/>
  <circle cx="63" cy="34" r="7" fill="#2f80ff"/>
</svg>
`)}`;
}

function isInternalQaArtifact(item: ClassifiedItem) {
  const fileName = item.fileName?.toLowerCase() ?? "";
  return (
    item.source === "local-file" &&
    (/^\d{2}-(?:home|map|clean|saved).*\.png$/.test(fileName) ||
      /(?:photo-detail|runtime-qa)/.test(fileName))
  );
}

async function getStoredItem(key: string) {
  try {
    return await Storage.getItem(key);
  } catch {
    return window.localStorage.getItem(key);
  }
}

async function setStoredItem(key: string, value: string) {
  try {
    await Storage.setItem(key, value);
  } catch {
    window.localStorage.setItem(key, value);
  }
}

async function removeStoredItem(key: string) {
  try {
    await Storage.removeItem(key);
  } catch {
    window.localStorage.removeItem(key);
  }
}
