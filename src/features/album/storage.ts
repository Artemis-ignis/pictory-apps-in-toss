import { Storage } from "@apps-in-toss/web-framework";
import type { ClassifiedItem, PersistedPictoryState } from "./types";
import { currentUsageMonth, normalizeBillingState } from "../billing/plans";

const STORAGE_KEY = "pictory-state-v1";
const MAX_RECENT_ITEMS = 1000;
const MAX_SCAN_HISTORY = 8;
const THUMBNAIL_SIZE = 96;

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
  const raw = await getStoredItem(STORAGE_KEY);
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
      recentItems: parsed.recentItems ?? [],
      scanHistory: parsed.scanHistory ?? [],
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
          dataUri: item.privacy === "sensitive" ? redactedDataUri() : "",
        })),
      }),
    );
  }
}

export async function clearPictoryState() {
  await removeStoredItem(STORAGE_KEY);
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

async function prepareRecentItemForStorage(
  item: ClassifiedItem,
): Promise<ClassifiedItem> {
  return {
    ...item,
    dataUri:
      item.privacy === "sensitive"
        ? redactedDataUri()
        : await thumbnailDataUri(item.dataUri),
    hints: item.hints?.slice(0, 8),
    reasons: item.reasons.slice(0, 3),
  };
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

        const scale = Math.max(
          THUMBNAIL_SIZE / image.naturalWidth,
          THUMBNAIL_SIZE / image.naturalHeight,
        );
        const width = image.naturalWidth * scale;
        const height = image.naturalHeight * scale;
        const x = (THUMBNAIL_SIZE - width) / 2;
        const y = (THUMBNAIL_SIZE - height) / 2;

        context.fillStyle = "#eff5ff";
        context.fillRect(0, 0, THUMBNAIL_SIZE, THUMBNAIL_SIZE);
        context.drawImage(image, x, y, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.62));
      } catch {
        resolve("");
      }
    };
    image.onerror = () => resolve("");
    image.src = dataUri;
  });
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
