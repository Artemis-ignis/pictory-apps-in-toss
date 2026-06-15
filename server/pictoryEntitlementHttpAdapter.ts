import type { PictoryClassifyRequestContext } from "./pictoryClassify";
import {
  resolveSubjectIdFromHeaders,
  type PictoryHttpRequest,
  type PictoryHttpResponse,
} from "./pictoryHttpAdapter";
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
  now?: () => Date;
}

interface EntitlementRequestBody {
  planId?: unknown;
  subscriptionExpiresAt?: unknown;
}

export function createPictoryEntitlementHttpHandler({
  store,
  env = process.env,
  resolveSubjectId = (context) => resolveSubjectIdFromHeaders(context, env),
  now,
}: PictoryEntitlementHttpHandlerOptions) {
  return async function pictoryEntitlementHttpHandler(
    request: PictoryHttpRequest,
  ): Promise<PictoryHttpResponse> {
    const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };

    if (request.method.toUpperCase() !== "POST") {
      return jsonResponse(
        405,
        { error: { code: "method_not_allowed", message: "Use POST." } },
        headers,
      );
    }

    const normalizedHeaders = normalizeHeaders(request.headers);
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

    const body = parseBody(await readRequestBody(request.body));
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
