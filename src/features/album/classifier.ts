import { analyzeImageSource, emptySignals } from "./imageSignals";
import { inferNativeDetectorHints } from "./nativeDetectors";
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
    "message",
    "messenger",
    "notification",
    "mobile",
    "송금",
    "이체",
    "bank",
    "login",
    "로그인",
    "알림",
    "메시지",
    "결제화면",
  ],
  document: [
    "document",
    "doc",
    "pdf",
    "scan",
    "paper",
    "form",
    "certificate",
    "resume",
    "계약",
    "문서",
    "서류",
    "스캔",
    "증서",
    "증빙",
    "메모",
    "기록",
    "증명",
    "수납",
    "청구",
    "고지서",
    "명세서",
    "세금계산서",
    "진단서",
    "처방전",
    "보험",
    "bill",
    "statement",
    "tax",
    "medical",
  ],
  receipt: [
    "receipt",
    "store",
    "order",
    "purchase",
    "pos",
    "영수증",
    "결제",
    "카드",
    "승인",
    "승인번호",
    "합계",
    "금액",
    "매출",
    "사업자",
    "상호",
    "total",
    "amount",
    "payment",
    "approved",
    "마트",
    "편의점",
    "invoice",
  ],
  food: [
    "food",
    "menu",
    "meal",
    "dish",
    "plate",
    "pizza",
    "burger",
    "coffee",
    "espresso",
    "dessert",
    "cake",
    "bowl",
    "bakery",
    "음식",
    "식당",
    "메뉴",
    "카페",
    "맛집",
    "디저트",
  ],
  place: [
    "place",
    "travel",
    "trip",
    "map",
    "landscape",
    "mountain",
    "beach",
    "lake",
    "street",
    "building",
    "bridge",
    "city",
    "museum",
    "hotel",
    "airport",
    "station",
    "road",
    "park",
    "forest",
    "river",
    "sea",
    "sky",
    "tree",
    "trail",
    "장소",
    "여행",
    "풍경",
    "공원",
    "숲",
    "바다",
    "하늘",
    "나무",
    "산책",
    "도시",
    "건물",
    "거리",
    "공항",
    "호텔",
    "전시",
    "박물관",
  ],
  people: [
    "people",
    "person",
    "portrait",
    "face",
    "selfie",
    "family",
    "group",
    "profile",
    "wedding",
    "party",
    "baby",
    "child",
    "사람",
    "친구",
    "가족",
    "프로필",
    "웨딩",
    "아기",
    "아이",
  ],
  coupon: [
    "coupon",
    "barcode",
    "qr",
    "ticket",
    "voucher",
    "boarding",
    "pass",
    "쿠폰",
    "할인",
    "마감",
    "예매",
    "예약",
    "입장권",
    "탑승권",
  ],
  memory: [
    "memory",
    "record",
    "note",
    "dark",
    "blurry",
    "기록",
    "메모",
    "일상",
    "pet",
    "dog",
    "puppy",
    "kitten",
    "kitty",
    "animal",
    "반려",
    "강아지",
    "고양이",
    "동물",
    "차량",
    "자동차",
    "어두움",
    "흐림",
  ],
};

const SENSITIVE_TOKENS = [
  "주민",
  "신분증",
  "면허",
  "여권",
  "계좌",
  "카드번호",
  "전화번호",
  "휴대폰",
  "주소",
  "생년월일",
  "주문번호",
  "거래",
  "입금",
  "송금",
  "이체",
  "은행",
  "bank",
  "account",
  "transfer",
  "비밀번호",
  "password",
  "login",
  "로그인",
  "보안",
  "otp",
  "인증",
  "인증번호",
  "verification",
  "계약",
  "등본",
  "진단서",
  "처방전",
  "medical",
  "insurance",
  "민감",
];

interface ClassifyOptions {
  refineWithServerAi?: boolean;
  onAiRefinementResult?: (result: AiRefinementResult) => void;
  onProgress?: (progress: ClassifyProgress) => void;
  signal?: AbortSignal;
}

export interface ClassifyProgress {
  done: number;
  total: number;
  stage:
    | "사진 불러오는 중"
    | "밝기와 선명도 확인 중"
    | "비슷한 사진 묶는 중"
    | "사진 분류 중";
}

interface DuplicateGroupEntry {
  groupId: string;
  isRepresentative: boolean;
}

export async function classifyAlbumItems(
  items: AlbumItem[],
  existingStatuses = new Map<string, ClassifiedItem["status"]>(),
  options: ClassifyOptions = {},
): Promise<ClassifiedItem[]> {
  const total = items.length;
  const classified: ClassifiedItem[] = [];

  options.onProgress?.({ done: 0, total, stage: "사진 불러오는 중" });
  for (let index = 0; index < items.length; index += 1) {
    throwIfAborted(options.signal);
    classified.push(await classifyAlbumItem(items[index]));
    options.onProgress?.({
      done: index + 1,
      total,
      stage: "밝기와 선명도 확인 중",
    });
    await yieldToBrowser();
  }

  options.onProgress?.({ done: total, total, stage: "비슷한 사진 묶는 중" });
  const duplicateGroups = findDuplicateGroups(classified);

  options.onProgress?.({ done: total, total, stage: "사진 분류 중" });
  const locallyClassified = classified.map((item) => {
    const duplicateGroup = duplicateGroups.get(item.id);
    const baseCleanBucket = chooseCleanBucket(
      item.cleanBucketId,
      item.signals ?? emptySignals(),
    );
    const cleanBucketId =
      duplicateGroup &&
      !duplicateGroup.isRepresentative &&
      baseCleanBucket !== "sensitive" &&
      baseCleanBucket !== "needsReview" &&
      baseCleanBucket !== "dark"
        ? "similar"
        : baseCleanBucket;

    return {
      ...item,
      cleanBucketId,
      duplicateGroup: duplicateGroup?.groupId,
      isDuplicateRepresentative: duplicateGroup?.isRepresentative,
      status: existingStatuses.get(item.id) ?? item.status,
    };
  });

  if (!options.refineWithServerAi) {
    return locallyClassified;
  }

  const { refineWithAiClassifier } = await import("./aiClassifier");
  return refineWithAiClassifier(locallyClassified, undefined, {
    onResult: options.onAiRefinementResult,
  });
}

async function classifyAlbumItem(item: AlbumItem) {
  const useLiveDetectors = item.source !== "sample";
  const [signals, nativeHints] = await Promise.all([
    item.signals ?? analyzeImageSource(item.dataUri),
    useLiveDetectors ? inferNativeDetectorHints(item.dataUri) : [],
  ]);
  const hints = Array.from(new Set([...(item.hints ?? []), ...nativeHints]));

  return classifyItem({
    ...item,
    hints,
    signals: signals ?? item.signals,
  });
}

export function classifyItem(item: AlbumItem): ClassifiedItem {
  const signals = withSignalDefaults(item.signals);
  const tokens = tokenize(item);
  const scores = scoreCategories(tokens, signals);
  const [rawCategoryId, rawScore] = Object.entries(scores).sort(
    (a, b) => b[1] - a[1],
  )[0] as [MapBucketId, number];
  const categoryId = isLowQualityPhoto(signals) ? "memory" : rawCategoryId;
  const sensitivityScore = scoreSensitivity(tokens, signals, categoryId);
  const privacy =
    sensitivityScore >= 0.82
      ? "sensitive"
      : rawScore < 0.52 && categoryId !== "memory"
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

  switch (bucketId) {
    case "sensitive":
      return item.privacy === "sensitive" || item.cleanBucketId === "sensitive";
    case "needsReview":
      return item.cleanBucketId === "needsReview" || item.privacy === "review";
    case "similar":
      return (
        (Boolean(item.duplicateGroup) && !item.isDuplicateRepresentative) ||
        item.cleanBucketId === "similar"
      );
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

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("Pictory scan canceled", "AbortError");
  }
}

function yieldToBrowser() {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
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

  if (
    signals.aspectRatio < 0.56 &&
    signals.whiteRatio > 0.42 &&
    signals.textLineScore > 0.18
  ) {
    scores.receipt += 0.24;
    scores.document += 0.06;
  }

  if (
    signals.textLineScore > 0.18 &&
    signals.edgeDensity > 0.08 &&
    (signals.aspectRatio < 0.62 || signals.whiteRatio > 0.32)
  ) {
    scores.capture += 0.18;
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

  if (
    tokens.some((value) =>
      /ticket|voucher|boarding|pass|예매|예약|입장권|탑승권/.test(value),
    )
  ) {
    scores.coupon += 0.32;
  }

  if (signals.saturation > 0.42 && signals.colorVariance > 0.32) {
    scores.food += 0.12;
    scores.place += 0.14;
    scores.people += 0.1;
  }

  if (
    signals.aspectRatio < 0.78 &&
    signals.textLineScore < 0.1 &&
    signals.colorVariance < 0.13 &&
    signals.saturation < 0.42 &&
    signals.brightness > 0.32
  ) {
    scores.document += 0.3;
  }

  if (isReceiptLikePaperPhoto(signals)) {
    scores.receipt += 0.34;
  }

  if (
    signals.saturation > 0.3 &&
    signals.colorVariance > 0.14 &&
    signals.whiteRatio < 0.1 &&
    signals.darkRatio < 0.18 &&
    signals.skinToneRatio < 0.18
  ) {
    scores.food += 0.24;
  }

  if (
    signals.saturation > 0.28 &&
    signals.colorVariance > 0.13 &&
    signals.whiteRatio < 0.12 &&
    signals.darkRatio < 0.22 &&
    signals.skinToneRatio < 0.18 &&
    signals.natureColorRatio < 0.22 &&
    signals.textLineScore < 0.08
  ) {
    scores.food += 0.34;
  }

  if (
    signals.saturation > 0.48 &&
    signals.darkRatio > 0.32 &&
    signals.skinToneRatio > 0.18
  ) {
    scores.coupon += 0.3;
  }

  if (
    signals.darkRatio > 0.32 &&
    signals.textLineScore > 0.1 &&
    signals.saturation < 0.28
  ) {
    scores.place += 0.32;
  }

  if (signals.textLineScore < 0.08 && signals.saturation > 0.35) {
    scores.place += 0.11;
    scores.people += 0.08;
    scores.memory += 0.06;
  }

  if (signals.skinToneRatio > 0.08 && signals.saturation > 0.36) {
    scores.people += 0.16;
  }

  if (
    signals.skinToneRatio > 0.16 &&
    signals.saturation > 0.36 &&
    signals.whiteRatio > 0.07
  ) {
    scores.people += 0.14;
  }

  if (
    signals.natureColorRatio > 0.3 &&
    signals.textLineScore > 0.18 &&
    signals.skinToneRatio > 0.02
  ) {
    scores.people += 0.32;
  }

  if (signals.natureColorRatio > 0.26 && signals.textLineScore < 0.12) {
    scores.place += 0.22;
    scores.memory += 0.05;
  }

  if (isLowQualityPhoto(signals)) {
    scores.memory += 0.52;
    scores.capture -= 0.18;
    scores.people -= 0.12;
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
      /total|amount|payment|approved|승인번호|합계|금액|매출|사업자|상호/.test(
        value,
      ),
    )
  ) {
    scores.receipt += 0.24;
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

  if (isLowQualityPhoto(signals)) {
    return "dark";
  }

  if (
    categoryId === "document" ||
    categoryId === "receipt" ||
    categoryId === "coupon"
  ) {
    return "needsReview";
  }

  if (
    score < 0.56 &&
    categoryId !== "food" &&
    categoryId !== "place" &&
    categoryId !== "people" &&
    categoryId !== "memory"
  ) {
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

  if (isLowQualityPhoto(signals)) {
    return "dark";
  }

  return current;
}

function findDuplicateGroups(items: ClassifiedItem[]) {
  const groupSets: Array<Set<string>> = [];

  for (let left = 0; left < items.length; left += 1) {
    for (let right = left + 1; right < items.length; right += 1) {
      if (areSimilarPhotos(items[left], items[right])) {
        mergeDuplicatePair(groupSets, items[left].id, items[right].id);
      }
    }
  }

  const groups = new Map<string, DuplicateGroupEntry>();
  groupSets.forEach((group, index) => {
    if (group.size < 2) {
      return;
    }

    const groupItems = Array.from(group)
      .map((id) => items.find((item) => item.id === id))
      .filter((item): item is ClassifiedItem => item != null);
    const representative = groupItems.sort(
      (left, right) => qualityScore(right) - qualityScore(left),
    )[0];
    const groupId = `similar-${index + 1}`;

    for (const item of groupItems) {
      groups.set(item.id, {
        groupId,
        isRepresentative: item.id === representative.id,
      });
    }
  });

  return groups;
}

function areSimilarPhotos(left: ClassifiedItem, right: ClassifiedItem) {
  const leftName = normalizeDuplicateFileName(left.fileName);
  const rightName = normalizeDuplicateFileName(right.fileName);
  const sameHint = Boolean(leftName && rightName && leftName === rightName);
  if (sameHint) {
    return true;
  }

  if (left.categoryId !== right.categoryId) {
    return false;
  }

  const leftHash = left.signals?.perceptualHash ?? "";
  const rightHash = right.signals?.perceptualHash ?? "";
  if (leftHash.length === 0 || rightHash.length === 0) {
    return false;
  }

  const leftDiffHash = left.signals?.differenceHash ?? "";
  const rightDiffHash = right.signals?.differenceHash ?? "";
  const aHashClose = hammingDistance(leftHash, rightHash) <= 8;
  const dHashClose =
    leftDiffHash.length > 0 && rightDiffHash.length > 0
      ? hammingDistance(leftDiffHash, rightDiffHash) <= 10
      : hammingDistance(leftHash, rightHash) <= 2;

  return aHashClose && dHashClose;
}

function mergeDuplicatePair(
  groups: Array<Set<string>>,
  leftId: string,
  rightId: string,
) {
  const leftGroup = groups.find((group) => group.has(leftId));
  const rightGroup = groups.find((group) => group.has(rightId));

  if (leftGroup && rightGroup && leftGroup !== rightGroup) {
    for (const id of rightGroup) {
      leftGroup.add(id);
    }
    groups.splice(groups.indexOf(rightGroup), 1);
    return;
  }

  if (leftGroup) {
    leftGroup.add(rightId);
    return;
  }

  if (rightGroup) {
    rightGroup.add(leftId);
    return;
  }

  groups.push(new Set([leftId, rightId]));
}

function qualityScore(item: ClassifiedItem) {
  const signals = item.signals ?? emptySignals();
  const brightnessPenalty = Math.abs((signals.brightness ?? 0.5) - 0.52);
  const blur = signals.blurVariance ?? signals.edgeDensity;
  const contrast = signals.contrast ?? signals.colorVariance;

  return (
    blur * 0.45 +
    contrast * 0.25 +
    (1 - signals.darkRatio) * 0.2 -
    brightnessPenalty * 0.2
  );
}

function normalizeDuplicateFileName(fileName?: string) {
  if (!fileName) {
    return "";
  }

  const stem = fileName
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/\s*\(\d+\)$/, "")
    .replace(/(?:[-_\s]+(?:copy|복사본?|복사))$/, "")
    .trim();

  return /^(img|image|photo|screenshot|scan|pick|local|download|pexels)$/.test(
    stem,
  )
    ? ""
    : stem;
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

  if (isBlurryPhoto(signals)) {
    reasons.push("흐린 사진");
  }

  if (signals.whiteRatio > 0.48 && signals.textLineScore > 0.18) {
    reasons.push("문서형 배경");
  }

  if (categoryId === "people" && signals.skinToneRatio > 0.08) {
    reasons.push("사람색 영역");
  }

  if (
    (categoryId === "place" || categoryId === "people") &&
    signals.natureColorRatio > 0.26
  ) {
    reasons.push("야외색 영역");
  }

  if (cleanBucketId === "sensitive") {
    reasons.push("민감 키워드");
  }

  const visibleTokens = tokens.filter(isMeaningfulReasonToken);
  if (visibleTokens.length > 0) {
    reasons.push(visibleTokens.slice(0, 2).join(", "));
  }

  return reasons.slice(0, 3);
}

function isMeaningfulReasonToken(token: string) {
  return (
    !/^\d+$/.test(token) &&
    !/^(img|image|photo|screenshot|scan|pick|local|download|pexels|jpg|jpeg|png|heic|webp)$/.test(
      token,
    )
  );
}

function isLowQualityPhoto(signals: ImageSignals) {
  return isDarkPhoto(signals) || isBlurryPhoto(signals);
}

function isDarkPhoto(signals: ImageSignals) {
  return (
    signals.brightness < 0.28 &&
    signals.saturation < 0.36 &&
    (signals.darkRatio > 0.16 || signals.whiteRatio < 0.08)
  );
}

function isBlurryPhoto(signals: ImageSignals) {
  const blurVariance = signals.blurVariance ?? 0;
  const contrast = signals.contrast ?? 0;

  return (
    blurVariance > 0 &&
    blurVariance < 0.035 &&
    signals.edgeDensity < 0.08 &&
    signals.textLineScore < 0.1 &&
    contrast < 0.22
  );
}

function isReceiptLikePaperPhoto(signals: ImageSignals) {
  const contrast = signals.contrast ?? 0;

  return (
    signals.aspectRatio > 0.56 &&
    signals.aspectRatio < 0.78 &&
    signals.textLineScore < 0.08 &&
    signals.whiteRatio > 0.08 &&
    signals.whiteRatio < 0.24 &&
    signals.darkRatio < 0.12 &&
    signals.skinToneRatio > 0.24 &&
    signals.saturation > 0.18 &&
    signals.saturation < 0.32 &&
    signals.colorVariance > 0.09 &&
    signals.colorVariance < 0.14 &&
    contrast > 0.32 &&
    contrast < 0.56
  );
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

  if (/^[a-z0-9]+$/.test(value) && /^[a-z0-9]+$/.test(token)) {
    return value === token || value.includes(token);
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
