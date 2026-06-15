import type { PictoryClassifyRequestContext } from "./pictoryClassify";
import {
  resolveSubjectIdFromTrustedRequest,
  type PictoryHttpRequest,
  type PictoryHttpResponse,
} from "./pictoryHttpAdapter";
import {
  deleteUsageAccount,
  type PictoryUsageLedgerStore,
} from "./pictoryUsageLedger";

type MaybePromise<T> = T | Promise<T>;

interface PictoryAccountHttpHandlerOptions {
  store: PictoryUsageLedgerStore;
  env?: Record<string, string | undefined>;
  resolveSubjectId?: (
    context: PictoryClassifyRequestContext,
  ) => MaybePromise<string | null | undefined>;
  corsOrigin?: string;
}

export function createPictoryAccountHttpHandler({
  store,
  env = process.env,
  resolveSubjectId = (context) =>
    resolveSubjectIdFromTrustedRequest(context, env),
  corsOrigin,
}: PictoryAccountHttpHandlerOptions) {
  return async function pictoryAccountHttpHandler(
    request: PictoryHttpRequest,
  ): Promise<PictoryHttpResponse> {
    const responseHeaders = createResponseHeaders(corsOrigin);

    if (request.method.toUpperCase() === "OPTIONS") {
      return { status: 204, headers: responseHeaders, body: "" };
    }

    if (request.method.toUpperCase() !== "DELETE") {
      return jsonResponse(
        405,
        { error: { code: "method_not_allowed", message: "Use DELETE." } },
        responseHeaders,
      );
    }

    const headers = normalizeHeaders(request.headers);
    const subjectId = await resolveSubjectId({
      schemaVersion: 1,
      itemCount: 0,
      headers,
      requestId:
        headers["x-pictory-request-id"] ?? headers["x-request-id"] ?? undefined,
    });
    if (!subjectId) {
      return jsonResponse(
        401,
        {
          error: { code: "unauthorized", message: "Authentication required." },
        },
        responseHeaders,
      );
    }

    const result = await deleteUsageAccount(store, subjectId);
    if (!result.supported) {
      return jsonResponse(
        501,
        {
          error: {
            code: "delete_not_supported",
            message: "The configured ledger store cannot delete accounts.",
          },
        },
        responseHeaders,
      );
    }

    return jsonResponse(
      200,
      {
        subjectId,
        deleted: result.deleted,
      },
      responseHeaders,
    );
  };
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
    headers["Access-Control-Allow-Methods"] = "DELETE, OPTIONS";
  }

  return headers;
}

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string>,
): PictoryHttpResponse {
  return {
    status,
    headers,
    body: JSON.stringify(body),
  };
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
