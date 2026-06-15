import type { PictoryClassifyRequestContext } from "./pictoryClassify";
import {
  resolveSubjectIdFromHeaders,
  resolveSubjectIdFromTrustedRequest,
  type PictoryHttpRequest,
  type PictoryHttpResponse,
} from "./pictoryHttpAdapter";
import {
  fetchAppsInTossOrderStatus,
  GRANTABLE_IAP_ORDER_STATUSES,
  PictoryIapOrderStatusError,
  type PictoryIapOrderStatusFetcher,
} from "./pictoryIapOrderStatus";
import {
  syncUsageAccountPlan,
  type PictoryUsageLedgerStore,
} from "./pictoryUsageLedger";

type MaybePromise<T> = T | Promise<T>;
type PlanId = "free" | "plus" | "pro";

interface PictoryEntitlementHttpHandlerOptions {
  store: PictoryUsageLedgerStore;
  env?: Record<string, string | undefined>;
  resolveSubjectId?: (
    context: PictoryClassifyRequestContext,
  ) => MaybePromise<string | null | undefined>;
  resolveOrderSubjectId?: (
    context: PictoryClassifyRequestContext,
  ) => MaybePromise<string | null | undefined>;
  fetchOrderStatus?: PictoryIapOrderStatusFetcher;
  corsOrigin?: string;
  now?: () => Date;
}

interface EntitlementRequestBody {
  planId?: unknown;
  expectedPlanId?: unknown;
  orderId?: unknown;
  subscriptionExpiresAt?: unknown;
}

export function createPictoryEntitlementHttpHandler({
  store,
  env = process.env,
  resolveSubjectId = (context) => resolveSubjectIdFromHeaders(context, env),
  resolveOrderSubjectId = (context) =>
    resolveSubjectIdFromTrustedRequest(context, env),
  fetchOrderStatus = fetchAppsInTossOrderStatus,
  corsOrigin,
  now,
}: PictoryEntitlementHttpHandlerOptions) {
  return async function pictoryEntitlementHttpHandler(
    request: PictoryHttpRequest,
  ): Promise<PictoryHttpResponse> {
    const headers = createResponseHeaders(corsOrigin);

    if (request.method.toUpperCase() === "OPTIONS") {
      return { status: 204, headers, body: "" };
    }

    if (request.method.toUpperCase() !== "POST") {
      return jsonResponse(
        405,
        { error: { code: "method_not_allowed", message: "Use POST." } },
        headers,
      );
    }

    const normalizedHeaders = normalizeHeaders(request.headers);
    const body = parseBody(await readRequestBody(request.body));
    const orderId = normalizeString(body.orderId);
    if (orderId) {
      return syncVerifiedOrder({
        body,
        env,
        fetchOrderStatus,
        headers,
        normalizedHeaders,
        now,
        orderId,
        resolveOrderSubjectId,
        store,
      });
    }

    const subjectId = await resolveSubjectId({
      schemaVersion: 1,
      itemCount: 0,
      headers: normalizedHeaders,
      requestId:
        normalizedHeaders["x-pictory-request-id"] ??
        normalizedHeaders["x-request-id"] ??
        undefined,
    });
    if (!subjectId) {
      return jsonResponse(
        401,
        { error: { code: "unauthorized", message: "Authentication required." } },
        headers,
      );
    }

    if (!isPlanId(body.planId)) {
      return jsonResponse(
        400,
        { error: { code: "invalid_plan", message: "planId is required." } },
        headers,
      );
    }

    const expiresAt = normalizeExpiresAt(body.subscriptionExpiresAt);
    if (expiresAt === false) {
      return jsonResponse(
        400,
        {
          error: {
            code: "invalid_expiry",
            message: "subscriptionExpiresAt must be an ISO date.",
          },
        },
        headers,
      );
    }

    const account = await syncUsageAccountPlan({
      store,
      subjectId,
      planId: body.planId,
      subscriptionExpiresAt: expiresAt,
      now,
    });

    return jsonResponse(
      200,
      {
        subjectId: account.subjectId,
        planId: account.planId,
        subscriptionExpiresAt: account.subscriptionExpiresAt,
        serverAiCredits: account.serverAiCredits,
        monthlyServerAiUsed: account.monthlyServerAiUsed,
      },
      headers,
    );
  };
}

async function syncVerifiedOrder({
  body,
  env,
  fetchOrderStatus,
  headers,
  normalizedHeaders,
  now = () => new Date(),
  orderId,
  resolveOrderSubjectId,
  store,
}: {
  body: EntitlementRequestBody;
  env: Record<string, string | undefined>;
  fetchOrderStatus: PictoryIapOrderStatusFetcher;
  headers: Record<string, string>;
  normalizedHeaders: Record<string, string | undefined>;
  now?: () => Date;
  orderId: string;
  resolveOrderSubjectId: (
    context: PictoryClassifyRequestContext,
  ) => MaybePromise<string | null | undefined>;
  store: PictoryUsageLedgerStore;
}) {
  const subjectId = await resolveOrderSubjectId({
    schemaVersion: 1,
    itemCount: 0,
    headers: normalizedHeaders,
    requestId:
      normalizedHeaders["x-pictory-request-id"] ??
      normalizedHeaders["x-request-id"] ??
      undefined,
  });
  if (!subjectId) {
    return jsonResponse(
      401,
      { error: { code: "unauthorized", message: "Authentication required." } },
      headers,
    );
  }

  let orderStatus;
  try {
    orderStatus = await fetchOrderStatus(orderId, { env });
  } catch (error) {
    const status =
      error instanceof PictoryIapOrderStatusError &&
      error.code === "mtls_not_configured"
        ? 503
        : 502;
    return jsonResponse(
      status,
      {
        error: {
          code:
            status === 503
              ? "iap_verification_unconfigured"
              : "iap_verification_failed",
          message: "Could not verify Apps-in-Toss order status.",
        },
      },
      headers,
    );
  }

  if (orderStatus.orderId !== orderId) {
    return jsonResponse(
      409,
      {
        error: {
          code: "order_mismatch",
          message: "Verified order does not match the requested order.",
        },
      },
      headers,
    );
  }

  const planId = getPlanIdBySku(orderStatus.sku, env);
  if (planId == null) {
    return jsonResponse(
      409,
      {
        error: {
          code: "unknown_sku",
          message: "Order SKU is not configured for Pictory.",
        },
      },
      headers,
    );
  }

  if (isPlanId(body.expectedPlanId) && body.expectedPlanId !== planId) {
    return jsonResponse(
      409,
      {
        error: {
          code: "plan_mismatch",
          message: "Verified order SKU does not match the requested plan.",
        },
      },
      headers,
    );
  }

  if (!GRANTABLE_IAP_ORDER_STATUSES.has(orderStatus.status)) {
    return jsonResponse(
      409,
      {
        error: {
          code: "order_not_grantable",
          message: "Order status is not grantable.",
          orderStatus: orderStatus.status,
        },
      },
      headers,
    );
  }

  const account = await syncUsageAccountPlan({
    store,
    subjectId,
    planId,
    subscriptionExpiresAt: deriveSubscriptionExpiresAt(
      orderStatus.statusDeterminedAt,
      planId,
      env,
      now(),
    ),
    now,
  });

  return jsonResponse(
    200,
    {
      subjectId: account.subjectId,
      planId: account.planId,
      orderId: orderStatus.orderId,
      orderStatus: orderStatus.status,
      subscriptionExpiresAt: account.subscriptionExpiresAt,
      serverAiCredits: account.serverAiCredits,
      monthlyServerAiUsed: account.monthlyServerAiUsed,
    },
    headers,
  );
}

function parseBody(text: string): EntitlementRequestBody {
  try {
    const parsed = JSON.parse(text) as EntitlementRequestBody;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

async function readRequestBody(body: unknown) {
  if (typeof body === "string") {
    return body;
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body).toString("utf8");
  }

  return JSON.stringify(body ?? {});
}

function isPlanId(value: unknown): value is PlanId {
  return value === "free" || value === "plus" || value === "pro";
}

function normalizeExpiresAt(value: unknown) {
  if (value == null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    return false;
  }

  return Number.isNaN(new Date(value).getTime()) ? false : value;
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getPlanIdBySku(
  sku: string,
  env: Record<string, string | undefined>,
): PlanId | null {
  const plusSku =
    env.PICTORY_PLUS_SUBSCRIPTION_SKU?.trim() ||
    env.VITE_PICTORY_PLUS_SUBSCRIPTION_SKU?.trim();
  const proSku =
    env.PICTORY_PRO_SUBSCRIPTION_SKU?.trim() ||
    env.VITE_PICTORY_PRO_SUBSCRIPTION_SKU?.trim();

  if (sku && sku === plusSku) {
    return "plus";
  }
  if (sku && sku === proSku) {
    return "pro";
  }

  return null;
}

function deriveSubscriptionExpiresAt(
  statusDeterminedAt: string | undefined,
  planId: PlanId,
  env: Record<string, string | undefined>,
  fallbackDate: Date,
) {
  if (planId === "free") {
    return undefined;
  }

  const days = readPositiveInteger(
    planId === "plus"
      ? env.PICTORY_PLUS_SUBSCRIPTION_DAYS
      : env.PICTORY_PRO_SUBSCRIPTION_DAYS,
    readPositiveInteger(env.PICTORY_SUBSCRIPTION_VALID_DAYS, 32),
  );
  const anchor = parseAppsInTossTimestamp(statusDeterminedAt) ?? fallbackDate;
  return new Date(anchor.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

function parseAppsInTossTimestamp(value: string | undefined) {
  if (!value) {
    return null;
  }

  const normalized = /(?:Z|[+-]\d\d:\d\d)$/.test(value)
    ? value
    : `${value}+09:00`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function readPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function createResponseHeaders(corsOrigin: string | undefined) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };

  if (corsOrigin) {
    headers["Access-Control-Allow-Origin"] = corsOrigin;
    headers["Access-Control-Allow-Credentials"] = "true";
    headers["Access-Control-Allow-Headers"] =
      "Content-Type, Authorization, X-Pictory-Request-Id, X-Request-Id";
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
  }

  return headers;
}

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string>,
): PictoryHttpResponse {
  return { status, headers, body: JSON.stringify(body) };
}

function normalizeHeaders(
  headers: PictoryHttpRequest["headers"],
): Record<string, string | undefined> {
  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    return Object.fromEntries(
      Array.from(headers.entries()).map(([key, value]) => [
        key.toLowerCase(),
        value,
      ]),
    );
  }

  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key.toLowerCase(),
      Array.isArray(value) ? value.join(",") : value,
    ]),
  );
}
