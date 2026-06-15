import {
  handlePictoryClassifyRequest,
  type PictoryClassifyDeps,
  type PictoryClassifyRequestContext,
} from "./pictoryClassify";
import { resolveSubjectIdFromSignedSession } from "./pictorySessionAuth";
import {
  createPictoryUsageLedgerDeps,
  type PictoryUsageLedgerStore,
} from "./pictoryUsageLedger";

type MaybePromise<T> = T | Promise<T>;

export interface PictoryHttpRequest {
  method: string;
  headers?: Headers | Record<string, string | string[] | undefined>;
  body?: unknown;
  bodySizeBytes?: number;
}

export interface PictoryHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface PictoryClassifyHttpHandlerOptions {
  store: PictoryUsageLedgerStore;
  env?: Record<string, string | undefined>;
  classifyItems?: PictoryClassifyDeps["classifyItems"];
  resolveSubjectId?: (
    context: PictoryClassifyRequestContext,
  ) => MaybePromise<string | null | undefined>;
  corsOrigin?: string;
  now?: () => Date;
}

export function createPictoryClassifyHttpHandler({
  store,
  env = process.env,
  classifyItems,
  resolveSubjectId = (context) =>
    resolveSubjectIdFromTrustedRequest(context, env),
  corsOrigin,
  now,
}: PictoryClassifyHttpHandlerOptions) {
  const ledgerDeps = createPictoryUsageLedgerDeps({
    store,
    env,
    now,
    resolveSubjectId,
  });

  return async function pictoryClassifyHttpHandler(
    request: PictoryHttpRequest,
  ): Promise<PictoryHttpResponse> {
    const responseHeaders = createResponseHeaders(corsOrigin);

    if (request.method.toUpperCase() === "OPTIONS") {
      return { status: 204, headers: responseHeaders, body: "" };
    }

    if (request.method.toUpperCase() !== "POST") {
      return jsonResponse(
        405,
        { error: { code: "method_not_allowed", message: "Use POST." } },
        responseHeaders,
      );
    }

    const bodyText = await readRequestBody(request.body);
    const result = await handlePictoryClassifyRequest(
      {
        body: bodyText,
        bodySizeBytes:
          request.bodySizeBytes ?? Buffer.byteLength(bodyText, "utf8"),
        headers: normalizeHeaders(request.headers),
        requestId:
          readHeader(request.headers, "x-pictory-request-id") ??
          readHeader(request.headers, "x-request-id"),
      },
      {
        ...ledgerDeps,
        classifyItems,
        env,
      },
    );

    return jsonResponse(result.status, result.body, {
      ...responseHeaders,
      ...result.headers,
    });
  };
}

export function resolveSubjectIdFromHeaders(
  context: PictoryClassifyRequestContext,
  env: Record<string, string | undefined> = process.env,
) {
  if (!canResolveSubjectIdFromHeaders(env)) {
    return null;
  }

  const configuredSecret = env.PICTORY_SERVER_SECRET?.trim();
  const requestSecret = context.headers["x-pictory-server-secret"]?.trim();
  if (!configuredSecret || requestSecret !== configuredSecret) {
    return null;
  }

  const subjectId = context.headers["x-pictory-subject-id"]?.trim();
  return subjectId || null;
}

export function canResolveSubjectIdFromHeaders(
  env: Record<string, string | undefined> = process.env,
) {
  return env.NODE_ENV !== "production";
}

export function resolveSubjectIdFromTrustedRequest(
  context: PictoryClassifyRequestContext,
  env: Record<string, string | undefined> = process.env,
) {
  return (
    resolveSubjectIdFromSignedSession(context, env) ??
    resolveSubjectIdFromHeaders(context, env)
  );
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

async function readRequestBody(body: unknown) {
  if (typeof body === "string") {
    return body;
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body).toString("utf8");
  }

  return JSON.stringify(body ?? {});
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

function readHeader(headers: PictoryHttpRequest["headers"], name: string) {
  return normalizeHeaders(headers)[name.toLowerCase()];
}
