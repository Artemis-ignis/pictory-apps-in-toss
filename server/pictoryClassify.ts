import { createHash } from "node:crypto";

type MaybePromise<T> = T | Promise<T>;

export type PictoryCategoryId =
  | "capture"
  | "document"
  | "receipt"
  | "food"
  | "place"
  | "people"
  | "coupon"
  | "memory";

export type PictoryCleanBucketId =
  | "sensitive"
  | "needsReview"
  | "similar"
  | "dark"
  | "capturePile"
  | "keep";

export type PictoryPrivacy = "normal" | "review" | "sensitive";

export interface PictoryClassifyRequestInput {
  body: unknown;
  bodySizeBytes?: number;
  headers?: Record<string, string | undefined>;
  requestId?: string;
}

export interface PictoryClassifySignals {
  width?: number;
  height?: number;
  aspectRatio?: number;
  brightness?: number;
  saturation?: number;
  edgeDensity?: number;
  textLineScore?: number;
  colorVariance?: number;
  whiteRatio?: number;
  darkRatio?: number;
  skinToneRatio?: number;
  natureColorRatio?: number;
  perceptualHash?: string;
}

export interface PictoryClassifyRequestItem {
  id: string;
  fileName?: string;
  createdAt?: string;
  hints: string[];
  signals?: PictoryClassifySignals;
  imageDataUri?: string;
  redacted?: true;
}

export interface PictoryClassifyResponseItem {
  id: string;
  categoryId?: PictoryCategoryId;
  cleanBucketId?: PictoryCleanBucketId;
  confidence?: number;
  privacy?: PictoryPrivacy;
  reasons?: string[];
  hints?: string[];
}

export interface PictoryClassifyEntitlement {
  subjectId: string;
  planId: string;
  active: boolean;
  serverAiAccess?: "paid" | "credit";
}

export interface PictoryClassifyQuotaReservation {
  monthlyUsed?: number;
  creditUsed?: number;
  globalDailyUsed?: number;
}

export interface PictoryClassifyQuota {
  remaining: number;
  reservation?: PictoryClassifyQuotaReservation;
}

export interface PictoryClassifyDeps {
  verifyEntitlement: (
    context: PictoryClassifyRequestContext,
  ) => MaybePromise<PictoryClassifyEntitlement | null | undefined>;
  verifyQuota: (
    context: PictoryClassifyQuotaContext,
  ) => MaybePromise<PictoryClassifyQuota | null | undefined>;
  consumeQuota?: (
    context: PictoryClassifyConsumeQuotaContext,
  ) => MaybePromise<PictoryClassifyQuota | null | undefined>;
  refundQuota?: (
    context: PictoryClassifyRefundQuotaContext,
  ) => MaybePromise<void>;
  classifyItems?: PictoryClassifyItems;
  env?: Record<string, string | undefined>;
  maxBodyBytes?: number;
}

export interface PictoryClassifyRequestContext {
  schemaVersion: 1;
  itemCount: number;
  headers: Record<string, string | undefined>;
  requestId?: string;
}

export interface PictoryClassifyQuotaContext extends PictoryClassifyRequestContext {
  entitlement: PictoryClassifyEntitlement;
}

export interface PictoryClassifyConsumeQuotaContext extends PictoryClassifyQuotaContext {
  quota: PictoryClassifyQuota;
}

export interface PictoryClassifyRefundQuotaContext extends PictoryClassifyConsumeQuotaContext {
  reason: string;
}

export interface PictoryClassifyItemsContext extends PictoryClassifyQuotaContext {
  quota: PictoryClassifyQuota;
  env: Record<string, string | undefined>;
}

export type PictoryClassifyItems = (
  items: readonly PictoryClassifyRequestItem[],
  context: PictoryClassifyItemsContext,
) => MaybePromise<readonly PictoryClassifyResponseItem[]>;

export interface PictoryClassifyHandlerResult {
  status: number;
  headers?: Record<string, string>;
  body: {
    items?: PictoryClassifyResponseItem[];
    error?: {
      code: string;
      message: string;
    };
  };
}

const SCHEMA_VERSION = 1;
const MAX_ITEMS = 40;
const MAX_AI_IMAGE_ITEMS = 8;
const DEFAULT_MAX_BODY_BYTES = 4 * 1024 * 1024;
const DEFAULT_AI_PROVIDER = "gemini";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";
const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const PAID_PLAN_IDS = new Set(["plus", "pro"]);
const CATEGORY_IDS = new Set<PictoryCategoryId>([
  "capture",
  "document",
  "receipt",
  "food",
  "place",
  "people",
  "coupon",
  "memory",
]);
const CLEAN_BUCKET_IDS = new Set<PictoryCleanBucketId>([
  "sensitive",
  "needsReview",
  "similar",
  "dark",
  "capturePile",
  "keep",
]);
const PRIVACY_VALUES = new Set<PictoryPrivacy>([
  "normal",
  "review",
  "sensitive",
]);
const SIGNAL_NUMBER_FIELDS = [
  "width",
  "height",
  "aspectRatio",
  "brightness",
  "saturation",
  "edgeDensity",
  "textLineScore",
  "colorVariance",
  "whiteRatio",
  "darkRatio",
  "skinToneRatio",
  "natureColorRatio",
] as const;

export async function handlePictoryClassifyRequest(
  input: PictoryClassifyRequestInput,
  deps: PictoryClassifyDeps,
): Promise<PictoryClassifyHandlerResult> {
  try {
    const bodySizeBytes = getBodySizeBytes(input);
    if (bodySizeBytes > (deps.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES)) {
      return errorResponse(413, "body_too_large", "Request body is too large.");
    }

    const payload = parseRequestBody(input.body);
    const requestContext: PictoryClassifyRequestContext = {
      schemaVersion: SCHEMA_VERSION,
      itemCount: payload.items.length,
      headers: input.headers ?? {},
      requestId: input.requestId,
    };
    const entitlement = await deps.verifyEntitlement(requestContext);
    if (!hasPaidEntitlement(entitlement)) {
      return errorResponse(
        402,
        "payment_required",
        "Paid entitlement is required for server AI classification.",
      );
    }

    const quotaContext = { ...requestContext, entitlement };
    const quota = await deps.verifyQuota(quotaContext);
    if (!hasEnoughQuota(quota, payload.items.length)) {
      return errorResponse(
        429,
        "quota_exceeded",
        "Server AI classification quota is not enough for this batch.",
      );
    }

    const reservedQuota = deps.consumeQuota
      ? await deps.consumeQuota({ ...quotaContext, quota })
      : quota;
    if (!hasEnoughQuota(reservedQuota, 0)) {
      return errorResponse(
        429,
        "quota_exceeded",
        "Server AI classification quota could not be reserved.",
      );
    }

    const env = deps.env ?? process.env;
    const classifyItems = deps.classifyItems ?? defaultClassifyItems;
    let classified: PictoryClassifyResponseItem[];
    try {
      classified = normalizeResponseItems(
        await classifyItems(payload.items, {
          ...requestContext,
          entitlement,
          quota: reservedQuota,
          env,
        }),
        payload.items,
      );
    } catch (error) {
      if (deps.refundQuota) {
        try {
          await deps.refundQuota({
            ...quotaContext,
            quota: reservedQuota,
            reason: "classification_failed",
          });
        } catch {
          // Keep returning the classification failure; operators reconcile from the ledger.
        }
      }
      throw error;
    }

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: {
        items: classified,
      },
    };
  } catch (error) {
    if (error instanceof PictoryClassifyHttpError) {
      return errorResponse(error.status, error.code, error.message);
    }

    return errorResponse(
      500,
      "classification_failed",
      "Server AI classification failed.",
    );
  }
}

export async function defaultClassifyItems(
  items: readonly PictoryClassifyRequestItem[],
  context: PictoryClassifyItemsContext,
): Promise<readonly PictoryClassifyResponseItem[]> {
  const attachedImageItems = items.filter(hasAttachedImage);
  const imageItems = attachedImageItems.slice(0, MAX_AI_IMAGE_ITEMS);
  const overBudgetImageItems = attachedImageItems
    .slice(MAX_AI_IMAGE_ITEMS)
    .map((item) => ({
      ...item,
      imageDataUri: undefined,
      redacted: true as const,
    }));
  const redactedItems = [
    ...items.filter((item) => !hasAttachedImage(item)),
    ...overBudgetImageItems,
  ];
  const redactedClassifications = redactedItems.map(classifyRedactedItem);

  if (imageItems.length === 0) {
    return redactedClassifications;
  }

  const provider = readAiProvider(context.env);
  if (provider === "gemini") {
    const apiKey =
      context.env.GEMINI_API_KEY ?? context.env.PICTORY_GEMINI_API_KEY;
    if (!apiKey) {
      throw new PictoryClassifyHttpError(
        503,
        "classifier_unconfigured",
        "Gemini API key is not configured.",
      );
    }

    return [
      ...(await classifyImageItemsWithGemini(imageItems, context, apiKey)),
      ...redactedClassifications,
    ];
  }

  const apiKey =
    context.env.OPENAI_API_KEY ?? context.env.PICTORY_OPENAI_API_KEY;
  if (!apiKey) {
    throw new PictoryClassifyHttpError(
      503,
      "classifier_unconfigured",
      "OpenAI API key is not configured.",
    );
  }

  return [
    ...(await classifyImageItemsWithOpenAi(imageItems, context, apiKey)),
    ...redactedClassifications,
  ];
}

type AiProvider = "gemini" | "openai";

function readAiProvider(env: Record<string, string | undefined>): AiProvider {
  const provider = (
    env.PICTORY_AI_PROVIDER ??
    env.PICTORY_AI_CLASSIFIER ??
    DEFAULT_AI_PROVIDER
  )
    .trim()
    .toLocaleLowerCase();

  if (provider === "gemini" || provider === "openai") {
    return provider;
  }

  throw new PictoryClassifyHttpError(
    503,
    "classifier_unconfigured",
    "AI classifier provider must be gemini or openai.",
  );
}

function hasAttachedImage(
  item: PictoryClassifyRequestItem,
): item is PictoryClassifyRequestItem & { imageDataUri: string } {
  return (
    !item.redacted && item.imageDataUri?.startsWith("data:image/") === true
  );
}

async function classifyImageItemsWithOpenAi(
  items: readonly (PictoryClassifyRequestItem & { imageDataUri: string })[],
  context: PictoryClassifyItemsContext,
  apiKey: string,
) {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(createOpenAiClassificationBody(items, context)),
  });

  if (!response.ok) {
    throw new PictoryClassifyHttpError(
      502,
      "classifier_upstream_error",
      "OpenAI classification request failed.",
    );
  }

  return parseOpenAiClassificationResponse(await response.json());
}

async function classifyImageItemsWithGemini(
  items: readonly (PictoryClassifyRequestItem & { imageDataUri: string })[],
  context: PictoryClassifyItemsContext,
  apiKey: string,
) {
  const response = await fetch(
    createGeminiGenerateContentUrl(readGeminiModel(context.env), apiKey),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createGeminiClassificationBody(items)),
    },
  );

  if (!response.ok) {
    throw new PictoryClassifyHttpError(
      502,
      "classifier_upstream_error",
      "Gemini classification request failed.",
    );
  }

  return parseGeminiClassificationResponse(await response.json());
}

function createGeminiGenerateContentUrl(model: string, apiKey: string) {
  return `${GEMINI_API_BASE_URL}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
}

function readGeminiModel(env: Record<string, string | undefined>) {
  return (
    env.GEMINI_MODEL ??
    env.PICTORY_GEMINI_MODEL ??
    DEFAULT_GEMINI_MODEL
  ).trim();
}

function createGeminiClassificationBody(
  items: readonly (PictoryClassifyRequestItem & { imageDataUri: string })[],
) {
  return {
    contents: [
      {
        role: "user",
        parts: createGeminiInputParts(items),
      },
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 1200,
      responseMimeType: "application/json",
    },
  };
}

function createGeminiInputParts(
  items: readonly (PictoryClassifyRequestItem & { imageDataUri: string })[],
) {
  const parts: GeminiInputPart[] = [
    {
      text: createClassificationPrompt(items),
    },
  ];

  for (const item of items) {
    const image = parseImageDataUri(item.imageDataUri);
    parts.push(
      {
        text: `Image item id: ${item.id}`,
      },
      {
        inlineData: {
          mimeType: image.mimeType,
          data: image.data,
        },
      },
    );
  }

  return parts;
}

type GeminiInputPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

function createOpenAiClassificationBody(
  items: readonly (PictoryClassifyRequestItem & { imageDataUri: string })[],
  context: PictoryClassifyItemsContext,
) {
  return {
    model:
      context.env.OPENAI_MODEL ??
      context.env.PICTORY_OPENAI_MODEL ??
      DEFAULT_OPENAI_MODEL,
    input: [
      {
        role: "user",
        content: createOpenAiInputContent(items, context.env),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "pictory_classification",
        strict: true,
        schema: OPENAI_CLASSIFICATION_SCHEMA,
      },
      verbosity: "low",
    },
    max_output_tokens: 1200,
    safety_identifier: hashSafetyIdentifier(context.entitlement.subjectId),
    store: false,
    temperature: 0,
  };
}

function createOpenAiInputContent(
  items: readonly (PictoryClassifyRequestItem & { imageDataUri: string })[],
  env: Record<string, string | undefined>,
) {
  const content: OpenAiInputContent[] = [
    {
      type: "input_text",
      text: createClassificationPrompt(items),
    },
  ];

  for (const item of items) {
    content.push(
      {
        type: "input_text",
        text: `Image item id: ${item.id}`,
      },
      {
        type: "input_image",
        image_url: item.imageDataUri,
        detail: readImageDetail(env),
      },
    );
  }

  return content;
}

function createClassificationPrompt(
  items: readonly (PictoryClassifyRequestItem & { imageDataUri: string })[],
) {
  const manifest = items.map((item) => ({
    id: item.id,
    hints: item.hints,
    signals: withoutPerceptualHash(item.signals),
  }));

  return (
    "Classify each Pictory photo into exactly one categoryId and one cleanBucketId. " +
    "Return only JSON shaped as {\"items\":[...]}; do not use markdown. " +
    "Return Korean reasons. Mark IDs, payment cards, bank documents, medical/financial documents, passwords, one-time codes, and contracts as privacy review or sensitive. " +
    "Allowed categoryId values: capture, document, receipt, food, place, people, coupon, memory. " +
    "Allowed cleanBucketId values: sensitive, needsReview, similar, dark, capturePile, keep. " +
    "Allowed privacy values: normal, review, sensitive. " +
    `Items: ${JSON.stringify(manifest)}`
  );
}

type OpenAiInputContent =
  | { type: "input_text"; text: string }
  | {
      type: "input_image";
      image_url: string;
      detail: "low" | "high" | "auto";
    };

const OPENAI_CLASSIFICATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      maxItems: MAX_ITEMS,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "categoryId",
          "cleanBucketId",
          "confidence",
          "privacy",
          "reasons",
          "hints",
        ],
        properties: {
          id: { type: "string" },
          categoryId: {
            type: "string",
            enum: [...CATEGORY_IDS],
          },
          cleanBucketId: {
            type: "string",
            enum: [...CLEAN_BUCKET_IDS],
          },
          confidence: {
            type: "number",
            minimum: 0,
            maximum: 1,
          },
          privacy: {
            type: "string",
            enum: [...PRIVACY_VALUES],
          },
          reasons: {
            type: "array",
            maxItems: 3,
            items: { type: "string" },
          },
          hints: {
            type: "array",
            maxItems: 8,
            items: { type: "string" },
          },
        },
      },
    },
  },
} as const;

function parseOpenAiClassificationResponse(
  value: unknown,
): PictoryClassifyResponseItem[] {
  const text = readOpenAiOutputText(value);
  if (!text) {
    throw new PictoryClassifyHttpError(
      502,
      "classifier_invalid_response",
      "OpenAI classification response did not include JSON text.",
    );
  }

  return parseAiClassificationJson(text, "OpenAI");
}

function parseGeminiClassificationResponse(
  value: unknown,
): PictoryClassifyResponseItem[] {
  const text = readGeminiOutputText(value);
  if (!text) {
    throw new PictoryClassifyHttpError(
      502,
      "classifier_invalid_response",
      "Gemini classification response did not include JSON text.",
    );
  }

  return parseAiClassificationJson(text, "Gemini");
}

function parseAiClassificationJson(
  text: string,
  providerName: string,
): PictoryClassifyResponseItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new PictoryClassifyHttpError(
      502,
      "classifier_invalid_response",
      `${providerName} classification response was not valid JSON.`,
    );
  }

  const payload = assertRecord(parsed, `${providerName} response`);
  if (!Array.isArray(payload.items)) {
    throw new PictoryClassifyHttpError(
      502,
      "classifier_invalid_response",
      `${providerName} classification response items must be an array.`,
    );
  }

  return payload.items.filter(isRecord).map((item) => ({
    id: readOptionalString(item.id) ?? "",
    categoryId: CATEGORY_IDS.has(item.categoryId as PictoryCategoryId)
      ? (item.categoryId as PictoryCategoryId)
      : undefined,
    cleanBucketId: CLEAN_BUCKET_IDS.has(
      item.cleanBucketId as PictoryCleanBucketId,
    )
      ? (item.cleanBucketId as PictoryCleanBucketId)
      : undefined,
    confidence:
      typeof item.confidence === "number" && Number.isFinite(item.confidence)
        ? item.confidence
        : undefined,
    privacy: PRIVACY_VALUES.has(item.privacy as PictoryPrivacy)
      ? (item.privacy as PictoryPrivacy)
      : undefined,
    reasons: readStringArray(item.reasons),
    hints: readStringArray(item.hints),
  }));
}

function readGeminiOutputText(value: unknown): string | undefined {
  if (!isRecord(value) || !Array.isArray(value.candidates)) {
    return undefined;
  }

  for (const candidate of value.candidates) {
    if (!isRecord(candidate) || !isRecord(candidate.content)) {
      continue;
    }

    const parts = candidate.content.parts;
    if (!Array.isArray(parts)) {
      continue;
    }

    const text = parts
      .map((part) => (isRecord(part) && typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim();
    if (text) {
      return text;
    }
  }

  return undefined;
}

function readOpenAiOutputText(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (typeof value.output_text === "string") {
    return value.output_text;
  }

  if (!Array.isArray(value.output)) {
    return undefined;
  }

  for (const output of value.output) {
    if (!isRecord(output) || !Array.isArray(output.content)) {
      continue;
    }

    for (const content of output.content) {
      if (
        isRecord(content) &&
        content.type === "output_text" &&
        typeof content.text === "string"
      ) {
        return content.text;
      }
    }
  }

  return undefined;
}

function classifyRedactedItem(
  item: PictoryClassifyRequestItem,
): PictoryClassifyResponseItem {
  const categoryId = classifyCategoryFromHints(item);
  const isSensitive = hasAnyHint(item, [
    "id",
    "card",
    "bank",
    "account",
    "password",
    "otp",
    "sensitive",
    "민감",
    "신분증",
    "카드",
    "계좌",
    "인증",
    "비밀번호",
  ]);

  return {
    id: item.id,
    categoryId,
    cleanBucketId: isSensitive ? "sensitive" : "needsReview",
    confidence: isSensitive ? 0.82 : 0.68,
    privacy: isSensitive ? "sensitive" : "review",
    reasons: isSensitive
      ? ["민감 후보", "원본 제외", "확인 필요"]
      : ["원본 제외", "신호 기반", "확인 필요"],
    hints: Array.from(new Set([...item.hints, "redacted"])).slice(0, 8),
  };
}

function classifyCategoryFromHints(
  item: PictoryClassifyRequestItem,
): PictoryCategoryId {
  if (hasAnyHint(item, ["receipt", "영수증"])) {
    return "receipt";
  }
  if (hasAnyHint(item, ["coupon", "쿠폰"])) {
    return "coupon";
  }
  if (hasAnyHint(item, ["document", "doc", "id", "문서", "신분증"])) {
    return "document";
  }
  if (hasAnyHint(item, ["screenshot", "capture", "캡처", "스크린샷"])) {
    return "capture";
  }
  if (hasAnyHint(item, ["food", "meal", "음식"])) {
    return "food";
  }
  if (hasAnyHint(item, ["place", "map", "장소", "지도"])) {
    return "place";
  }
  if (hasAnyHint(item, ["people", "person", "face", "사람", "인물"])) {
    return "people";
  }

  return "memory";
}

function hasAnyHint(item: PictoryClassifyRequestItem, tokens: string[]) {
  const text = item.hints.join(" ").toLocaleLowerCase();
  return tokens.some((token) => text.includes(token.toLocaleLowerCase()));
}

function readImageDetail(
  env: Record<string, string | undefined>,
): "low" | "high" | "auto" {
  const detail = env.OPENAI_IMAGE_DETAIL ?? env.PICTORY_OPENAI_IMAGE_DETAIL;
  return detail === "high" || detail === "auto" ? detail : "low";
}

function parseImageDataUri(dataUri: string) {
  const match = dataUri.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new PictoryClassifyHttpError(
      400,
      "invalid_image",
      "Image data URI must be base64 encoded.",
    );
  }

  return { mimeType: match[1], data: match[2] };
}

function withoutPerceptualHash(signals?: PictoryClassifySignals) {
  if (!signals) {
    return undefined;
  }

  const { perceptualHash, ...redactedSignals } = signals;
  void perceptualHash;
  return redactedSignals;
}

function hashSafetyIdentifier(subjectId: string) {
  return createHash("sha256").update(subjectId).digest("hex").slice(0, 64);
}

function getBodySizeBytes(input: PictoryClassifyRequestInput) {
  if (typeof input.bodySizeBytes === "number") {
    return input.bodySizeBytes;
  }

  if (typeof input.body === "string") {
    return Buffer.byteLength(input.body, "utf8");
  }

  const encoded = JSON.stringify(input.body) ?? "";
  return Buffer.byteLength(encoded, "utf8");
}

function parseRequestBody(body: unknown) {
  let parsed: unknown;
  try {
    parsed = typeof body === "string" ? JSON.parse(body) : body;
  } catch {
    throw new PictoryClassifyHttpError(
      400,
      "invalid_json",
      "Request body must be valid JSON.",
    );
  }

  const payload = assertRecord(parsed, "body");
  if (payload.schemaVersion !== SCHEMA_VERSION) {
    throw new PictoryClassifyHttpError(
      400,
      "invalid_schema_version",
      "schemaVersion must be 1.",
    );
  }
  if (!Array.isArray(payload.items)) {
    throw new PictoryClassifyHttpError(
      400,
      "invalid_items",
      "items must be an array.",
    );
  }
  if (payload.items.length === 0 || payload.items.length > MAX_ITEMS) {
    throw new PictoryClassifyHttpError(
      400,
      "invalid_items",
      "items must contain 1 to 40 entries.",
    );
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    items: payload.items.map(parseRequestItem),
  };
}

function parseRequestItem(value: unknown, index: number) {
  const item = assertRecord(value, `items[${index}]`);
  const id = assertString(item.id, `items[${index}].id`);
  const redacted = item.redacted === true;
  const parsed: PictoryClassifyRequestItem = {
    id,
    hints: readStringArray(item.hints),
    signals: readSignals(item.signals, redacted),
  };

  if (redacted) {
    return { ...parsed, redacted: true as const };
  }

  const imageDataUri = readOptionalString(item.imageDataUri);
  if (!imageDataUri?.startsWith("data:image/")) {
    throw new PictoryClassifyHttpError(
      400,
      "invalid_image",
      "Non-redacted items must include an image data URI.",
    );
  }

  return {
    ...parsed,
    fileName: readOptionalString(item.fileName),
    createdAt: readOptionalString(item.createdAt),
    imageDataUri,
  };
}

function readSignals(value: unknown, redacted: boolean) {
  if (value === undefined) {
    return undefined;
  }

  const source = assertRecord(value, "signals");
  const signals: PictoryClassifySignals = {};
  for (const field of SIGNAL_NUMBER_FIELDS) {
    const numberValue = source[field];
    if (typeof numberValue === "number" && Number.isFinite(numberValue)) {
      signals[field] = numberValue;
    }
  }

  if (!redacted) {
    const perceptualHash = readOptionalString(source.perceptualHash);
    if (perceptualHash) {
      signals.perceptualHash = perceptualHash;
    }
  }

  return Object.keys(signals).length > 0 ? signals : undefined;
}

function normalizeResponseItems(
  items: readonly PictoryClassifyResponseItem[],
  requestItems: readonly PictoryClassifyRequestItem[],
) {
  const requestIds = new Set(requestItems.map((item) => item.id));
  const seenIds = new Set<string>();
  const normalized = items.map((item) => {
    const normalizedItem = normalizeResponseItem(item, requestIds);
    if (!normalizedItem) {
      throw new PictoryClassifyHttpError(
        502,
        "classifier_invalid_response",
        "Server AI response included an unknown or invalid item.",
      );
    }
    if (seenIds.has(normalizedItem.id)) {
      throw new PictoryClassifyHttpError(
        502,
        "classifier_invalid_response",
        "Server AI response included duplicate item ids.",
      );
    }
    seenIds.add(normalizedItem.id);
    return normalizedItem;
  });

  for (const id of requestIds) {
    if (!seenIds.has(id)) {
      throw new PictoryClassifyHttpError(
        502,
        "classifier_invalid_response",
        "Server AI response did not cover every requested item.",
      );
    }
  }

  return normalized;
}

function normalizeResponseItem(
  value: unknown,
  requestIds: ReadonlySet<string>,
) {
  if (!isRecord(value)) {
    return null;
  }

  const id = readOptionalString(value.id);
  if (!id || !requestIds.has(id)) {
    return null;
  }

  const item: PictoryClassifyResponseItem = { id };
  if (CATEGORY_IDS.has(value.categoryId as PictoryCategoryId)) {
    item.categoryId = value.categoryId as PictoryCategoryId;
  }
  if (CLEAN_BUCKET_IDS.has(value.cleanBucketId as PictoryCleanBucketId)) {
    item.cleanBucketId = value.cleanBucketId as PictoryCleanBucketId;
  }
  if (
    typeof value.confidence === "number" &&
    Number.isFinite(value.confidence)
  ) {
    item.confidence = Math.max(0, Math.min(0.99, value.confidence));
  }
  if (PRIVACY_VALUES.has(value.privacy as PictoryPrivacy)) {
    item.privacy = value.privacy as PictoryPrivacy;
  }
  const reasons = readStringArray(value.reasons).slice(0, 3);
  if (reasons.length > 0) {
    item.reasons = reasons;
  }
  const hints = readStringArray(value.hints);
  if (hints.length > 0) {
    item.hints = hints;
  }

  return item;
}

function hasEnoughQuota(
  quota: PictoryClassifyQuota | null | undefined,
  required: number,
) {
  return (
    !!quota && Number.isFinite(quota.remaining) && quota.remaining >= required
  );
}

function hasPaidEntitlement(
  entitlement: PictoryClassifyEntitlement | null | undefined,
) {
  return (
    entitlement?.active === true &&
    typeof entitlement.subjectId === "string" &&
    (PAID_PLAN_IDS.has(entitlement.planId) ||
      entitlement.serverAiAccess === "credit") &&
    entitlement.subjectId.trim().length > 0
  );
}

function assertRecord(value: unknown, name: string) {
  if (!isRecord(value)) {
    throw new PictoryClassifyHttpError(
      400,
      "invalid_request",
      `${name} must be an object.`,
    );
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertString(value: unknown, name: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new PictoryClassifyHttpError(
      400,
      "invalid_request",
      `${name} must be a non-empty string.`,
    );
  }

  return value;
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function errorResponse(
  status: number,
  code: string,
  message: string,
): PictoryClassifyHandlerResult {
  return {
    status,
    headers: { "Content-Type": "application/json" },
    body: { error: { code, message } },
  };
}

class PictoryClassifyHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
