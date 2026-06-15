import { Storage } from "@apps-in-toss/web-framework";
import type { PersistedPictoryState } from "./types";

const STORAGE_KEY = "pictory-state-v1";

export const defaultPictoryState: PersistedPictoryState = {
  savedIds: [],
  queuedIds: [],
  ignoredIds: [],
  credits: 0,
};

export async function loadPictoryState(): Promise<PersistedPictoryState> {
  const raw = await getStoredItem(STORAGE_KEY);
  if (raw == null) {
    return defaultPictoryState;
  }

  try {
    return { ...defaultPictoryState, ...JSON.parse(raw) };
  } catch {
    return defaultPictoryState;
  }
}

export async function savePictoryState(state: PersistedPictoryState) {
  await setStoredItem(
    STORAGE_KEY,
    JSON.stringify({
      savedIds: state.savedIds,
      queuedIds: state.queuedIds,
      ignoredIds: state.ignoredIds,
      credits: state.credits,
      lastScanAt: state.lastScanAt,
      lastScanCount: state.lastScanCount,
    }),
  );
}

export async function clearPictoryState() {
  await removeStoredItem(STORAGE_KEY);
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
