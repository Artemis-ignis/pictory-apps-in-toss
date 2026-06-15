import { fetchAlbumItems, fetchAlbumPhotos } from "@apps-in-toss/web-framework";
import { sampleAlbumItems } from "../../data/sampleAlbum";
import type { AlbumItem, ScanResult } from "./types";

type NativeAlbumItem = {
  id: string;
  dataUri: string;
  type?: "PHOTO" | "VIDEO";
};

export async function requestAlbumScan(maxCount = 120): Promise<ScanResult> {
  try {
    const response = await fetchAlbumPhotos({
      maxCount,
      maxWidth: 720,
      base64: true,
    });

    const items = response.map((item, index) =>
      fromNativeItem(
        { ...item, type: "PHOTO" },
        "native-scan",
        `scan-${index}`,
      ),
    );

    return {
      items,
      source: "native-scan",
      message: `${items.length}장을 앨범에서 가져왔어요.`,
    };
  } catch {
    return {
      items: sampleAlbumItems,
      source: "sample",
      message: "샘플 앨범으로 열었어요. 사진 테스트도 가능해요.",
    };
  }
}

export async function pickAlbumItems(maxCount = 20): Promise<ScanResult> {
  try {
    const response = await fetchAlbumItems({
      types: ["PHOTO"],
      maxCount,
      maxWidth: 720,
      base64: true,
    });

    const items = response.map((item, index) =>
      fromNativeItem(item, "native-picker", `pick-${index}`),
    );

    return {
      items,
      source: "native-picker",
      message:
        items.length === 0
          ? "선택된 사진이 없어요."
          : `${items.length}장을 선택했어요.`,
    };
  } catch {
    const localItems = await pickLocalFiles(maxCount);
    return {
      items: localItems,
      source: "local-file",
      message:
        localItems.length === 0
          ? "선택된 사진이 없어요."
          : `${localItems.length}장을 직접 넣었어요.`,
    };
  }
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

function readFileAsAlbumItem(file: File): Promise<AlbumItem> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("파일 읽기 실패"));
    reader.onload = () => {
      resolve({
        id: `local-${file.name}-${file.lastModified}-${file.size}`,
        type: "PHOTO",
        dataUri: String(reader.result ?? ""),
        source: "local-file",
        createdAt: new Date(file.lastModified || Date.now()).toISOString(),
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
  return {
    id: `${source}-${item.id || fallbackId}`,
    type: item.type ?? "PHOTO",
    dataUri: normalizeNativeDataUri(item.dataUri),
    source,
    createdAt: new Date().toISOString(),
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

function tokenizeFileName(fileName: string) {
  return fileName
    .toLowerCase()
    .split(/[\s._/\\-]+/)
    .filter(Boolean);
}
