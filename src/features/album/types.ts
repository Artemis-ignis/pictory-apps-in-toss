export type MediaType = "PHOTO" | "VIDEO";

export type AlbumSource =
  | "native-scan"
  | "native-picker"
  | "local-file"
  | "sample";

export type MapBucketId =
  | "capture"
  | "document"
  | "receipt"
  | "food"
  | "place"
  | "people"
  | "coupon"
  | "memory";

export type CleanBucketId =
  | "sensitive"
  | "needsReview"
  | "similar"
  | "dark"
  | "capturePile"
  | "keep";

export type ItemStatus = "inbox" | "queued" | "saved" | "ignored";

export interface ImageSignals {
  width: number;
  height: number;
  aspectRatio: number;
  brightness: number;
  saturation: number;
  edgeDensity: number;
  textLineScore: number;
  colorVariance: number;
  perceptualHash: string;
}

export interface AlbumItem {
  id: string;
  type: MediaType;
  dataUri: string;
  source: AlbumSource;
  createdAt: string;
  fileName?: string;
  size?: number;
  hints?: string[];
  signals?: ImageSignals;
}

export interface ClassifiedItem extends AlbumItem {
  categoryId: MapBucketId;
  cleanBucketId: CleanBucketId;
  confidence: number;
  reasons: string[];
  privacy: "normal" | "review" | "sensitive";
  periodKey: string;
  periodLabel: string;
  duplicateGroup?: string;
  status: ItemStatus;
}

export interface BucketMeta<T extends string = string> {
  id: T;
  label: string;
  shortLabel: string;
  tone: string;
}

export interface ScanResult {
  items: AlbumItem[];
  source: AlbumSource;
  message: string;
}

export interface ScanHistoryEntry {
  id: string;
  scannedAt: string;
  totalCount: number;
  cleanCandidateCount: number;
  mapBucketCount: number;
}

export interface PersistedPictoryState {
  savedIds: string[];
  queuedIds: string[];
  ignoredIds: string[];
  credits: number;
  recentItems: ClassifiedItem[];
  scanHistory: ScanHistoryEntry[];
  lastScanAt?: string;
  lastScanCount?: number;
}

export const MAP_BUCKETS: BucketMeta<MapBucketId>[] = [
  { id: "capture", label: "캡처", shortLabel: "캡처", tone: "violet" },
  { id: "document", label: "문서", shortLabel: "문서", tone: "slate" },
  { id: "receipt", label: "영수증", shortLabel: "영수증", tone: "cyan" },
  { id: "food", label: "음식", shortLabel: "음식", tone: "orange" },
  { id: "place", label: "장소", shortLabel: "장소", tone: "green" },
  { id: "people", label: "사람", shortLabel: "사람", tone: "blue" },
  { id: "coupon", label: "쿠폰", shortLabel: "쿠폰", tone: "red" },
  { id: "memory", label: "기록", shortLabel: "기록", tone: "slate" },
];

export const CLEAN_BUCKETS: BucketMeta<CleanBucketId>[] = [
  {
    id: "sensitive",
    label: "민감정보 후보",
    shortLabel: "민감",
    tone: "blue",
  },
  {
    id: "needsReview",
    label: "AI 확인 필요",
    shortLabel: "확인",
    tone: "purple",
  },
  {
    id: "similar",
    label: "비슷한 사진",
    shortLabel: "유사",
    tone: "red",
  },
  { id: "dark", label: "어두운 사진", shortLabel: "어두움", tone: "dark" },
  {
    id: "capturePile",
    label: "캡처 더미",
    shortLabel: "캡처",
    tone: "violet",
  },
  { id: "keep", label: "보관 후보", shortLabel: "보관", tone: "cyan" },
];
