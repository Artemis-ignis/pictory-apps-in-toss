import { refineWithAiClassifier } from "./aiClassifier";
import { analyzeImageSource, emptySignals } from "./imageSignals";
import { inferNativeDetectorHints } from "./nativeDetectors";
import { inferVisualHints } from "./visualClassifier";
import type {
  AiRefinementResult,
  AlbumItem,
  ClassifiedItem,
  CleanBucketId,
  ImageSignals,
  MapBucketId,
} from "./types";

const TOKEN_RULES: Record<MapBucketId, string[]> = {
  capture: [
    "screenshot",
    "screen",
    "capture",
    "캡처",
    "스크린샷",
    "카톡",
    "chat",
    "송금",
  ],
  document: [
    "document",
    "doc",
    "pdf",
    "계약",
    "문서",
    "메모",
    "기록",
    "증명",
    "수납",
    "청구",
  ],
  receipt: [
    "receipt",
    "영수증",
    "결제",
    "카드",
    "승인",
    "마트",
    "편의점",
    "invoice",
  ],
  food: ["food", "menu", "meal", "음식", "식당", "메뉴", "카페", "맛집"],
  place: [
    "place",
    "travel",
    "trip",
    "map",
    "landscape",
    "장소",
    "여행",
    "풍경",
    "산책",
  ],
  people: ["people", "person", "portrait", "face", "selfie", "사람", "친구"],
  coupon: ["coupon", "barcode", "qr", "쿠폰", "할인", "마감"],
  memory: ["memory", "record", "note", "기록", "메모", "일상"],
};

const SENSITIVE_TOKENS = [
  "주민",
  "신분증",
  "면허",
  "여권",
  "계좌",
  "카드번호",
  "비밀번호",
  "otp",
  "인증",
  "계약",
  "등본",
  "민감",
];

interface ClassifyOptions {
  refineWithServerAi?: boolean;
  onAiRefinementResult?: (result: AiRefinementResult) => void;
}

export async function classifyAlbumItems(
  items: AlbumItem[],
  existingStatuses = new Map<string, ClassifiedItem["status"]>(),
  options: ClassifyOptions = {},
): Promise<ClassifiedItem[]> {
  const classified = await Promise.all(
    items.map(async (item) => {
      const useLiveDetectors = item.source !== "sample";
      const [signals, nativeHints, visualHints] = await Promise.all([
        item.signals ?? analyzeImageSource(item.dataUri),
        useLiveDetectors ? inferNativeDetectorHints(item.dataUri) : [],
        useLiveDetectors ? inferVisualHints(item.dataUri) : [],
      ]);
      const hints = Array.from(
        new Set([...(item.hints ?? []), ...nativeHints, ...visualHints]),
      );

      return classifyItem({
        ...item,
        hints,
        signals: signals ?? item.signals,
      });
    }),
  );

  const duplicateGroups = findDuplicateGroups(classified);

  const locallyClassified = classified.map((item) => {
    const duplicateGroup = duplicateGroups.get(item.id);
    const baseCleanBucket = chooseCleanBucket(
      item.cleanBucketId,
      item.signals ?? emptySignals(),
    );
    const cleanBucketId =
      duplicateGroup &&
      baseCleanBucket !== "sensitive" &&
      baseCleanBucket !== "needsReview"
        ? "similar"
        : baseCleanBucket;

    return {
      ...item,
      cleanBucketId,
      duplicateGroup,
      status: existingStatuses.get(item.id) ?? item.status,
    };
  });

  return options.refineWithServerAi
    ? refineWithAiClassifier(locallyClassified, undefined, {
        onResult: options.onAiRefinementResult,
      })
    : locallyClassified;
}

export function classifyItem(item: AlbumItem): ClassifiedItem {
  const signals = withSignalDefaults(item.signals);
  const tokens = tokenize(item);
  const scores = scoreCategories(tokens, signals);
  const [categoryId, rawScore] = Object.entries(scores).sort(
    (a, b) => b[1] - a[1],
  )[0] as [MapBucketId, number];
  const sensitivityScore = scoreSensitivity(tokens, signals, categoryId);
  const privacy =
    sensitivityScore >= 0.82
      ? "sensitive"
      : rawScore < 0.52
        ? "review"
        : "normal";
  const cleanBucketId = initialCleanBucket(
    categoryId,
    rawScore,
    sensitivityScore,
    signals,
  );
  const period = getPeriod(item.createdAt);

  return {
    ...item,
    signals,
    categoryId,
    cleanBucketId,
    confidence: Math.max(0.32, Math.min(0.97, rawScore)),
    reasons: buildReasons(categoryId, cleanBucketId, tokens, signals),
    privacy,
    periodKey: period.key,
    periodLabel: period.label,
    status: "inbox",
  };
}

export function getCategorySummary(items: ClassifiedItem[]) {
  return items.reduce(
    (summary, item) => {
      summary[item.categoryId] = (summary[item.categoryId] ?? 0) + 1;
      return summary;
    },
    {} as Record<MapBucketId, number>,
  );
}

export function getCleanSummary(items: ClassifiedItem[]) {
  const bucketIds: CleanBucketId[] = [
    "sensitive",
    "needsReview",
    "similar",
    "dark",
    "capturePile",
    "keep",
  ];

  return items.reduce(
    (summary, item) => {
      for (const bucketId of bucketIds) {
        if (cleanBucketMatches(item, bucketId)) {
          summary[bucketId] = (summary[bucketId] ?? 0) + 1;
        }
      }
      return summary;
    },
    {} as Record<CleanBucketId, number>,
  );
}

export function cleanBucketMatches(
  item: ClassifiedItem,
  bucketId: CleanBucketId,
) {
  if (!isCleanTabItem(item)) {
    return false;
  }

  const joinedSignals = [item.fileName, ...(item.hints ?? []), ...item.reasons]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  switch (bucketId) {
    case "sensitive":
      return (
        item.privacy === "sensitive" ||
        item.categoryId === "document" ||
        item.categoryId === "receipt" ||
        (item.categoryId === "capture" &&
          /계좌|송금|카드|결제|bank|account|pay/.test(joinedSignals)) ||
        (item.categoryId === "coupon" &&
          !/screenshot|screen|캡처/.test(joinedSignals))
      );
    case "needsReview":
      return true;
    case "similar":
      if (item.source === "sample") {
        return !cleanBucketMatches(item, "dark");
      }
      return Boolean(item.duplicateGroup) || item.cleanBucketId === "similar";
    case "dark":
      return (
        item.cleanBucketId === "dark" ||
        (item.source === "sample" && item.cleanBucketId === "needsReview")
      );
    case "capturePile":
      return item.categoryId === "capture";
    case "keep":
      return item.cleanBucketId === "keep";
  }
}

export function isCleanTabItem(item: ClassifiedItem) {
  return item.status !== "saved" && item.status !== "ignored";
}

export function hammingDistance(a: string, b: string) {
  if (a.length !== b.length || a.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  let distance = 0;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) {
      distance += 1;
    }
  }
  return distance;
}

function tokenize(item: AlbumItem) {
  return [item.fileName, ...(item.hints ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .split(/[\s._/\\-]+/)
    .filter(Boolean);
}

function withSignalDefaults(signals?: ImageSignals | null): ImageSignals {
  return { ...emptySignals(), ...(signals ?? {}) };
}

function scoreCategories(tokens: string[], signals: ImageSignals) {
  const scores: Record<MapBucketId, number> = {
    capture: 0.24,
    document: 0.24,
    receipt: 0.25,
    food: 0.24,
    place: 0.24,
    people: 0.24,
    coupon: 0.24,
    memory: 0.26,
  };

  for (const bucketId of Object.keys(TOKEN_RULES) as MapBucketId[]) {
    const matches = TOKEN_RULES[bucketId].filter((token) =>
      tokens.some((value) => value.includes(token) || token.includes(value)),
    );
    scores[bucketId] += Math.min(0.52, matches.length * 0.17);
  }

  boostFileNameToken(scores, tokens);

  if (signals.textLineScore > 0.22 && signals.edgeDensity > 0.2) {
    scores.document += 0.21;
    scores.receipt += 0.12;
    scores.capture += 0.16;
  }

  if (signals.whiteRatio > 0.48 && signals.textLineScore > 0.18) {
    scores.document += 0.18;
    scores.receipt += 0.14;
    scores.capture += 0.08;
  }

  if (
    signals.whiteRatio > 0.6 &&
    signals.saturation < 0.26 &&
    signals.textLineScore > 0.24
  ) {
    scores.document += 0.14;
  }

  if (signals.aspectRatio < 0.62 || signals.aspectRatio > 1.85) {
    scores.capture += 0.16;
    scores.coupon += 0.08;
  }

  if (
    tokens.some((value) =>
      ["coupon", "barcode", "qr", "쿠폰", "할인", "마감"].some((token) =>
        value.includes(token),
      ),
    )
  ) {
    scores.coupon += 0.5;
  }

  if (signals.saturation > 0.42 && signals.colorVariance > 0.32) {
    scores.food += 0.12;
    scores.place += 0.14;
    scores.people += 0.1;
  }

  if (signals.textLineScore < 0.08 && signals.saturation > 0.35) {
    scores.place += 0.11;
    scores.people += 0.08;
    scores.memory += 0.06;
  }

  if (signals.skinToneRatio > 0.08) {
    scores.people += 0.25;
  }

  if (signals.natureColorRatio > 0.26 && signals.textLineScore < 0.12) {
    scores.place += 0.22;
    scores.memory += 0.05;
  }

  return scores;
}

function boostFileNameToken(
  scores: Record<MapBucketId, number>,
  tokens: string[],
) {
  if (tokens.some((value) => /receipt|영수증|invoice/.test(value))) {
    scores.receipt += 0.38;
  }
  if (
    tokens.some((value) =>
      /screenshot|screen|capture|캡처|스크린샷/.test(value),
    )
  ) {
    scores.capture += 0.38;
  }
  if (
    tokens.some((value) =>
      /food|meal|menu|음식|식당|메뉴|카페|맛집|brunch|dinner|dessert/.test(
        value,
      ),
    )
  ) {
    scores.food += 0.22;
  }
}

function scoreSensitivity(
  tokens: string[],
  signals: ImageSignals,
  categoryId: MapBucketId,
) {
  let score = SENSITIVE_TOKENS.some((token) =>
    tokens.some((value) => isSensitiveTokenMatch(value, token)),
  )
    ? 0.82
    : 0.16;

  if (categoryId === "document" && signals.textLineScore > 0.26) {
    score += 0.18;
  }

  if (categoryId === "capture" && signals.textLineScore > 0.24) {
    score += 0.1;
  }

  return Math.min(1, score);
}

function initialCleanBucket(
  categoryId: MapBucketId,
  score: number,
  sensitivityScore: number,
  signals: ImageSignals,
): CleanBucketId {
  if (sensitivityScore >= 0.82) {
    return "sensitive";
  }

  if (signals.brightness < 0.24) {
    return "dark";
  }

  if (score < 0.56) {
    return "needsReview";
  }

  if (categoryId === "coupon") {
    return "needsReview";
  }

  if (categoryId === "capture") {
    return "capturePile";
  }

  return "keep";
}

function chooseCleanBucket(
  current: CleanBucketId,
  signals: ImageSignals,
): CleanBucketId {
  if (current === "sensitive" || current === "needsReview") {
    return current;
  }

  if (signals.brightness < 0.24) {
    return "dark";
  }

  return current;
}

function findDuplicateGroups(items: ClassifiedItem[]) {
  const groups = new Map<string, string>();

  for (let left = 0; left < items.length; left += 1) {
    const leftHash = items[left].signals?.perceptualHash ?? "";
    if (leftHash.length === 0) {
      continue;
    }

    for (let right = left + 1; right < items.length; right += 1) {
      const rightHash = items[right].signals?.perceptualHash ?? "";
      const leftName = items[left].fileName?.replace(/copy|복사|-\d+/gi, "");
      const rightName = items[right].fileName?.replace(/copy|복사|-\d+/gi, "");
      const sameHint = Boolean(leftName && rightName && leftName === rightName);
      const visuallySimilar =
        items[left].categoryId === items[right].categoryId &&
        hammingDistance(leftHash, rightHash) <= 4;

      if (visuallySimilar || sameHint) {
        const groupId = `similar-${left + 1}`;
        groups.set(items[left].id, groupId);
        groups.set(items[right].id, groupId);
      }
    }
  }

  return groups;
}

function buildReasons(
  categoryId: MapBucketId,
  cleanBucketId: CleanBucketId,
  tokens: string[],
  signals: ImageSignals,
) {
  const reasons = [`${labelForCategory(categoryId)} 패턴`];

  if (signals.textLineScore > 0.22) {
    reasons.push("글자 줄이 많음");
  }

  if (signals.brightness < 0.24) {
    reasons.push("어두운 사진");
  }

  if (signals.whiteRatio > 0.48 && signals.textLineScore > 0.18) {
    reasons.push("문서형 배경");
  }

  if (signals.skinToneRatio > 0.08) {
    reasons.push("사람색 영역");
  }

  if (signals.natureColorRatio > 0.26) {
    reasons.push("야외색 영역");
  }

  if (cleanBucketId === "sensitive") {
    reasons.push("민감 키워드");
  }

  if (tokens.length > 0) {
    reasons.push(tokens.slice(0, 2).join(", "));
  }

  return reasons.slice(0, 3);
}

function labelForCategory(categoryId: MapBucketId) {
  const labels: Record<MapBucketId, string> = {
    capture: "캡처",
    document: "문서",
    receipt: "영수증",
    food: "음식",
    place: "장소",
    people: "사람",
    coupon: "쿠폰",
    memory: "기록",
  };
  return labels[categoryId];
}

function isSensitiveTokenMatch(value: string, token: string) {
  if (value.length <= 2 || token.length <= 2) {
    return value === token;
  }

  return value.includes(token) || token.includes(value);
}

function getPeriod(isoDate: string) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return { key: "unknown", label: "날짜 없음" };
  }

  return {
    key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
    label: `${date.getFullYear()}. ${date.getMonth() + 1}.`,
  };
}
