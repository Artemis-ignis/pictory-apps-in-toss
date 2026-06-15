import type { ClassifiedItem, CleanBucketId, MapBucketId } from "./types";

interface AiClassifierEnv {
  VITE_PICTORY_CLASSIFY_ENDPOINT?: string;
}

export interface AiClassificationPatch {
  id: string;
  categoryId?: MapBucketId;
  cleanBucketId?: CleanBucketId;
  confidence?: number;
  privacy?: ClassifiedItem["privacy"];
  reasons?: string[];
  hints?: string[];
}

interface AiClassificationResponse {
  items?: AiClassificationPatch[];
}

type AiClassificationRequestSignals =
  | NonNullable<ClassifiedItem["signals"]>
  | Omit<NonNullable<ClassifiedItem["signals"]>, "perceptualHash">;

interface AiClassificationRequestItem {
  id: string;
  fileName?: string;
  createdAt?: string;
  hints: string[];
  signals: AiClassificationRequestSignals | undefined;
  imageDataUri?: string;
  redacted?: boolean;
}

const MAX_AI_REFINEMENT_ITEMS = 40;
const AI_IMAGE_MAX_EDGE = 512;

export async function refineWithAiClassifier(
  items: ClassifiedItem[],
  env: AiClassifierEnv = import.meta.env as AiClassifierEnv,
): Promise<ClassifiedItem[]> {
  const endpoint = env.VITE_PICTORY_CLASSIFY_ENDPOINT?.trim();
  if (!endpoint || items.length === 0 || typeof fetch === "undefined") {
    return items;
  }

  const candidates = items
    .filter(needsAiRefinement)
    .slice(0, MAX_AI_REFINEMENT_ITEMS);
  if (candidates.length === 0) {
    return items;
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Pictory-Request-Id": createAiRequestId(),
      },
      body: JSON.stringify({
        schemaVersion: 1,
        items: await Promise.all(candidates.map(toAiClassificationRequestItem)),
      }),
    });

    if (!response.ok) {
      return items;
    }

    const data = (await response.json()) as AiClassificationResponse;
    const patches = new Map(
      (data.items ?? []).map((patch) => [patch.id, patch] as const),
    );

    return items.map((item) => applyAiClassificationPatch(item, patches));
  } catch {
    return items;
  }
}

function createAiRequestId() {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `pictory-${Date.now()}-${random}`;
}

async function toAiClassificationRequestItem(
  item: ClassifiedItem,
): Promise<AiClassificationRequestItem> {
  const imageDataUri = canAttachImageForAi(item)
    ? await shrinkImageForAi(item.dataUri)
    : undefined;

  if (!imageDataUri) {
    return toRedactedAiClassificationRequestItem(item);
  }

  return {
    id: item.id,
    fileName: item.fileName,
    createdAt: item.createdAt,
    hints: item.hints ?? [],
    signals: item.signals,
    imageDataUri,
  };
}

function canAttachImageForAi(item: ClassifiedItem) {
  return item.privacy === "normal" && item.cleanBucketId !== "sensitive";
}

function toRedactedAiClassificationRequestItem(
  item: ClassifiedItem,
): AiClassificationRequestItem {
  return {
    id: item.id,
    hints: item.hints ?? [],
    signals: withoutPerceptualHash(item.signals),
    redacted: true,
  };
}

function withoutPerceptualHash(
  signals: ClassifiedItem["signals"],
): Omit<NonNullable<ClassifiedItem["signals"]>, "perceptualHash"> | undefined {
  if (!signals) {
    return undefined;
  }

  const { perceptualHash, ...redactedSignals } = signals;
  void perceptualHash;
  return redactedSignals;
}

function needsAiRefinement(item: ClassifiedItem) {
  return (
    item.confidence < 0.72 ||
    item.privacy !== "normal" ||
    item.cleanBucketId === "needsReview" ||
    item.cleanBucketId === "sensitive" ||
    item.categoryId === "receipt" ||
    item.categoryId === "document" ||
    item.categoryId === "coupon" ||
    item.categoryId === "people"
  );
}

export function applyAiClassificationPatch(
  item: ClassifiedItem,
  patches: Map<string, AiClassificationPatch>,
): ClassifiedItem {
  const patch = patches.get(item.id);
  if (!patch) {
    return item;
  }

  const confidence = clampConfidence(patch.confidence ?? item.confidence);
  return {
    ...item,
    categoryId: patch.categoryId ?? item.categoryId,
    cleanBucketId: resolveCleanBucketPatch(
      item.cleanBucketId,
      patch.cleanBucketId,
    ),
    confidence,
    privacy: resolvePrivacyPatch(item.privacy, patch.privacy),
    reasons:
      patch.reasons && patch.reasons.length > 0
        ? patch.reasons.slice(0, 3)
        : item.reasons,
    hints: Array.from(new Set([...(item.hints ?? []), ...(patch.hints ?? [])])),
  };
}

const privacyStrength: Record<ClassifiedItem["privacy"], number> = {
  normal: 0,
  review: 1,
  sensitive: 2,
};

const cleanBucketStrength: Record<CleanBucketId, number> = {
  keep: 0,
  similar: 0,
  dark: 0,
  capturePile: 0,
  needsReview: 1,
  sensitive: 2,
};

function resolvePrivacyPatch(
  current: ClassifiedItem["privacy"],
  patched: ClassifiedItem["privacy"] | undefined,
) {
  if (!patched) {
    return current;
  }

  return privacyStrength[patched] < privacyStrength[current]
    ? current
    : patched;
}

function resolveCleanBucketPatch(
  current: CleanBucketId,
  patched: CleanBucketId | undefined,
) {
  if (!patched) {
    return current;
  }

  return cleanBucketStrength[patched] < cleanBucketStrength[current]
    ? current
    : patched;
}

function clampConfidence(value: number) {
  return Math.max(0.32, Math.min(0.99, value));
}

async function shrinkImageForAi(dataUri: string) {
  if (
    typeof document === "undefined" ||
    typeof Image === "undefined" ||
    !dataUri.startsWith("data:image/")
  ) {
    return undefined;
  }

  try {
    const image = await loadImage(dataUri);
    const scale = Math.min(
      1,
      AI_IMAGE_MAX_EDGE / Math.max(image.width, image.height),
    );
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      return undefined;
    }
    context.drawImage(image, 0, 0, width, height);
    const encoded = canvas.toDataURL("image/jpeg", 0.72);
    return encoded.startsWith("data:image/") ? encoded : undefined;
  } catch {
    return undefined;
  }
}

function loadImage(dataUri: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("AI image shrink failed"));
    image.src = dataUri;
  });
}
