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
}

export interface PictoryClassifyQuota {
  remaining: number;
}

export interface PictoryClassifyDeps {
  verifyEntitlement: (
    context: PictoryClassifyRequestContext,
  ) => MaybePromise<PictoryClassifyEntitlement | null | undefined>;
  verifyQuota: (
    context: PictoryClassifyQuotaContext,
  ) => MaybePromise<PictoryClassifyQuota | null | undefined>;
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
const DEFAULT_MAX_BODY_BYTES = 4 * 1024 * 1024;
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

    const quota = await deps.verifyQuota({ ...requestContext, entitlement });
    if (
      !quota ||
      !Number.isFinite(quota.remaining) ||
      quota.remaining < payload.items.length
    ) {
      return errorResponse(
        429,
        "quota_exceeded",
        "Server AI classification quota is not enough for this batch.",
      );
    }

    const env = deps.env ?? process.env;
    const classifyItems = deps.classifyItems ?? defaultClassifyItems;
    const classified = await classifyItems(payload.items, {
      ...requestContext,
      entitlement,
      quota,
      env,
    });

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: {
        items: normalizeResponseItems(classified, payload.items),
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
  _items: readonly PictoryClassifyRequestItem[],
  context: PictoryClassifyItemsContext,
): Promise<readonly PictoryClassifyResponseItem[]> {
  if (!context.env.OPENAI_API_KEY && !context.env.PICTORY_OPENAI_API_KEY) {
    throw new PictoryClassifyHttpError(
      503,
      "classifier_unconfigured",
      "OpenAI API key is not configured.",
    );
  }

  throw new PictoryClassifyHttpError(
    503,
    "classifier_unconfigured",
    "Inject deps.classifyItems to enable server AI classification.",
  );
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
  return items
    .map((item) => normalizeResponseItem(item, requestIds))
    .filter((item): item is PictoryClassifyResponseItem => item !== null);
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

function hasPaidEntitlement(
  entitlement: PictoryClassifyEntitlement | null | undefined,
) {
  return (
    entitlement?.active === true &&
    typeof entitlement.subjectId === "string" &&
    PAID_PLAN_IDS.has(entitlement.planId) &&
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
