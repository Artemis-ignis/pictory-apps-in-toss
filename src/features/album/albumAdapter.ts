import { fetchAlbumItems, fetchAlbumPhotos } from "@apps-in-toss/web-framework";
import type { AlbumItem, ScanResult } from "./types";

export type AlbumImportMode = "recent" | "oldest" | "date" | "instagram";

export interface AlbumImportOptions {
  maxCount?: number;
  mode?: AlbumImportMode;
  date?: string;
}

type NativeAlbumItem = {
  id: string;
  dataUri: string;
  type?: "PHOTO" | "VIDEO";
};

interface AlbumFallbackEnv {
  DEV?: boolean;
}

type AlbumPermissionStatus = "notDetermined" | "denied" | "allowed";
type PermissionAwareAlbumFetcher = typeof fetchAlbumPhotos & {
  getPermission?: () => Promise<AlbumPermissionStatus>;
  openPermissionDialog?: () => Promise<
    Exclude<AlbumPermissionStatus, "notDetermined">
  >;
};
const NATIVE_SCAN_PREFETCH_LIMIT = 300;

export async function requestAlbumScan(
  options: number | AlbumImportOptions = 120,
): Promise<ScanResult> {
  const importOptions = normalizeAlbumImportOptions(options, 120);
  try {
    await ensureAlbumPermission();
    const response = await fetchAlbumPhotos({
      maxCount: getNativeAlbumFetchCount(importOptions),
      maxWidth: 720,
      base64: true,
    });

    const items = selectImportBatch(
      response.map((item, index) =>
        fromNativeItem(
          { ...item, type: "PHOTO" },
          "native-scan",
          `scan-${index}`,
        ),
      ),
      importOptions,
    );

    return {
      items,
      source: "native-scan",
      message: createImportMessage(items.length, importOptions, "앨범에서"),
    };
  } catch (error) {
    if (isAlbumPermissionDenied(error)) {
      throw error;
    }

    if (import.meta.env.DEV === true && isLocalAlbumFallbackAllowed()) {
      const items = selectImportBatch(
        await getLocalSampleAlbumItems(),
        importOptions,
      );
      return {
        items,
        source: "sample",
        message:
          items.length === 0
            ? "조건에 맞는 예시 사진이 없어요."
            : "예시 앨범으로 열었어요. 직접 사진 선택도 가능해요.",
      };
    }

    throw new Error("ALBUM_SCAN_FAILED");
  }
}

export async function pickAlbumItems(
  options: number | AlbumImportOptions = 20,
): Promise<ScanResult> {
  const importOptions = normalizeAlbumImportOptions(options, 20);
  try {
    await ensureAlbumPermission();
    const response = await fetchAlbumItems({
      types: ["PHOTO"],
      maxCount: importOptions.maxCount,
      maxWidth: 720,
      base64: true,
    });

    const items = selectImportBatch(
      response.map((item, index) =>
        fromNativeItem(item, "native-picker", `pick-${index}`),
      ),
      importOptions,
    );

    return {
      items,
      source: "native-picker",
      message:
        items.length === 0
          ? createEmptyImportMessage(importOptions)
          : createImportMessage(items.length, importOptions, "선택한 사진에서"),
    };
  } catch (error) {
    if (isAlbumPermissionDenied(error)) {
      throw error;
    }

    if (import.meta.env.DEV === true && isLocalAlbumFallbackAllowed()) {
      const localItems = await pickLocalFiles(importOptions.maxCount);
      const items = selectImportBatch(localItems, importOptions);
      return {
        items,
        source: "local-file",
        message:
          items.length === 0
            ? createEmptyImportMessage(importOptions)
            : createImportMessage(
                items.length,
                importOptions,
                "직접 넣은 사진에서",
              ),
      };
    }

    throw new Error("ALBUM_PICK_FAILED");
  }
}

export function isLocalAlbumFallbackAllowed(
  env: AlbumFallbackEnv = import.meta.env,
) {
  return env.DEV === true;
}

export function isAlbumPermissionDenied(error: unknown) {
  return (
    error instanceof Error && error.message === "ALBUM_PERMISSION_DENIED"
  );
}

export function mergeAlbumItems(
  current: AlbumItem[],
  incoming: AlbumItem[],
): AlbumItem[] {
  const map = new Map<string, AlbumItem>();

  for (const item of [...incoming, ...current]) {
    map.set(item.id, item);
  }

  return Array.from(map.values());
}

export function filterAndOrderAlbumItems(
  items: AlbumItem[],
  options: AlbumImportOptions = {},
) {
  const mode = options.mode ?? "recent";
  const filtered = items.filter((item) => {
    if (mode === "date" && options.date) {
      return toLocalDateKey(item.createdAt) === options.date;
    }

    if (mode === "instagram") {
      return isInstagramFeedCandidate(item);
    }

    return true;
  });

  return filtered
    .slice()
    .sort((left, right) =>
      mode === "oldest"
        ? dateValue(left.createdAt) - dateValue(right.createdAt)
        : dateValue(right.createdAt) - dateValue(left.createdAt),
    );
}

export function selectImportBatch(
  items: AlbumItem[],
  options: Required<Pick<AlbumImportOptions, "maxCount" | "mode">> &
    Pick<AlbumImportOptions, "date">,
) {
  return filterAndOrderAlbumItems(items, options).slice(0, options.maxCount);
}

export function getNativeAlbumFetchCount(options: AlbumImportOptions) {
  const maxCount = Math.max(1, options.maxCount ?? 120);
  const mode = options.mode ?? "recent";
  if (mode === "recent") {
    return maxCount;
  }

  return Math.max(
    maxCount,
    Math.min(NATIVE_SCAN_PREFETCH_LIMIT, Math.max(120, maxCount * 3)),
  );
}

async function pickLocalFiles(maxCount: number): Promise<AlbumItem[]> {
  if (typeof document === "undefined") {
    return [];
  }

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.multiple = true;

  const files = await new Promise<File[]>((resolve) => {
    input.onchange = () => {
      const selected = Array.from(input.files ?? []).slice(0, maxCount);
      resolve(selected);
    };
    input.click();
  });

  return Promise.all(files.map(readFileAsAlbumItem));
}

async function getLocalSampleAlbumItems() {
  if (import.meta.env.DEV !== true) {
    return [];
  }

  const { sampleAlbumItems } = await import("../../data/sampleAlbum");
  return sampleAlbumItems;
}

function readFileAsAlbumItem(file: File): Promise<AlbumItem> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("파일 읽기 실패"));
    reader.onload = () => {
      const dataUri = String(reader.result ?? "");
      resolve({
        id: `local-${file.name}-${file.lastModified}-${file.size}`,
        type: "PHOTO",
        dataUri,
        source: "local-file",
        createdAt:
          extractCapturedAtFromDataUri(dataUri) ??
          new Date(file.lastModified || Date.now()).toISOString(),
        fileName: file.name,
        size: file.size,
        hints: tokenizeFileName(file.name),
      });
    };
    reader.readAsDataURL(file);
  });
}

function fromNativeItem(
  item: NativeAlbumItem,
  source: AlbumItem["source"],
  fallbackId: string,
): AlbumItem {
  const dataUri = normalizeNativeDataUri(item.dataUri);
  return {
    id: `${source}-${item.id || fallbackId}`,
    type: item.type ?? "PHOTO",
    dataUri,
    source,
    createdAt:
      extractCapturedAtFromDataUri(dataUri) ??
      dateFromNativeId(item.id) ??
      new Date().toISOString(),
    fileName: item.id,
    hints: tokenizeFileName(item.id),
  };
}

function normalizeNativeDataUri(dataUri: string) {
  if (dataUri.startsWith("data:")) {
    return dataUri;
  }

  return `data:image/jpeg;base64,${dataUri}`;
}

export function extractCapturedAtFromDataUri(dataUri: string) {
  const base64 = dataUri.includes(",") ? dataUri.split(",").pop() : dataUri;
  if (!base64) {
    return undefined;
  }

  try {
    const sampleLength = Math.min(base64.length, 262144);
    const safeLength = sampleLength - (sampleLength % 4);
    const decoded = atob(base64.slice(0, safeLength));
    const match = decoded.match(
      /(20\d{2}):(0[1-9]|1[0-2]):(0[1-9]|[12]\d|3[01])\s+([01]\d|2[0-3]):([0-5]\d):([0-5]\d)/,
    );
    if (!match) {
      return undefined;
    }

    const [, year, month, day, hour, minute, second] = match;
    return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  } catch {
    return undefined;
  }
}

function tokenizeFileName(fileName: string) {
  return fileName
    .toLowerCase()
    .split(/[\s._/\\-]+/)
    .filter(Boolean);
}

function normalizeAlbumImportOptions(
  options: number | AlbumImportOptions,
  fallbackMaxCount: number,
): Required<Pick<AlbumImportOptions, "maxCount" | "mode">> &
  Pick<AlbumImportOptions, "date"> {
  if (typeof options === "number") {
    return { maxCount: options, mode: "recent" };
  }

  return {
    maxCount: options.maxCount ?? fallbackMaxCount,
    mode: options.mode ?? "recent",
    date: options.date,
  };
}

function createImportMessage(
  count: number,
  options: AlbumImportOptions,
  sourceLabel: string,
) {
  if (options.mode === "oldest") {
    return `${sourceLabel} 오래된 후보 ${count}장을 가져왔어요.`;
  }

  if (options.mode === "date" && options.date) {
    return `${sourceLabel} ${options.date} 후보 ${count}장을 찾았어요.`;
  }

  if (options.mode === "instagram") {
    return `${sourceLabel} 인스타 후보 ${count}장을 찾았어요.`;
  }

  return `${sourceLabel} 최신순으로 ${count}장을 가져왔어요.`;
}

function createEmptyImportMessage(options: AlbumImportOptions) {
  if (options.mode === "date" && options.date) {
    return `${options.date}에 맞는 사진이 없어요.`;
  }

  if (options.mode === "instagram") {
    return "인스타 업로드 비율에 맞는 사진이 없어요.";
  }

  return "선택된 사진이 없어요.";
}

function dateFromNativeId(id: string | undefined) {
  const match = id?.match(
    /(20\d{2})[-_:.]?(0[1-9]|1[0-2])[-_:.]?([0-2]\d|3[01])/,
  );
  if (!match) {
    return undefined;
  }

  return new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00`).toISOString();
}

function toLocalDateKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function dateValue(value: string) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function isInstagramFeedCandidate(item: AlbumItem) {
  const aspectRatio = item.signals?.aspectRatio;
  if (typeof aspectRatio !== "number" || !Number.isFinite(aspectRatio)) {
    return true;
  }

  return aspectRatio >= 0.8 && aspectRatio <= 1.91;
}

async function ensureAlbumPermission() {
  const albumFetcher = fetchAlbumPhotos as PermissionAwareAlbumFetcher;
  const getPermission = albumFetcher.getPermission;
  const openPermissionDialog = albumFetcher.openPermissionDialog;
  if (!getPermission || !openPermissionDialog) {
    return;
  }

  const current = await getPermission();
  if (current === "allowed") {
    return;
  }

  const next = await openPermissionDialog();
  if (next !== "allowed") {
    throw new Error("ALBUM_PERMISSION_DENIED");
  }
}
