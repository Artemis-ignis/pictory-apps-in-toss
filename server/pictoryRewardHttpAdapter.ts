import type { PictoryClassifyRequestContext } from "./pictoryClassify";
import {
  resolveSubjectIdFromTrustedRequest,
  type PictoryHttpRequest,
  type PictoryHttpResponse,
} from "./pictoryHttpAdapter";
import {
  createNewUsageAccount,
  DEFAULT_SERVER_AI_CREDITS,
  grantRewardCredits,
  normalizeUsageMonth,
  type PictoryUsageLedgerStore,
} from "./pictoryUsageLedger";

type MaybePromise<T> = T | Promise<T>;

interface PictoryRewardHttpHandlerOptions {
  store: PictoryUsageLedgerStore;
  env?: Record<string, string | undefined>;
  resolveSubjectId?: (
    context: PictoryClassifyRequestContext,
  ) => MaybePromise<string | null | undefined>;
  corsOrigin?: string;
  now?: () => Date;
}

interface RewardRequestBody {
  rewardId?: string;
}

export function createPictoryRewardHttpHandler({
  store,
  env = process.env,
  resolveSubjectId = (context) =>
    resolveSubjectIdFromTrustedRequest(context, env),
  corsOrigin,
  now = () => new Date(),
}: PictoryRewardHttpHandlerOptions) {
  return async function pictoryRewardHttpHandler(
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

    const body = parseRewardRequestBody(await readRequestBody(request.body));
    if (!body.rewardId) {
      return jsonResponse(
        400,
        {
          error: {
            code: "invalid_reward",
            message: "rewardId is required.",
          },
        },
        responseHeaders,
      );
    }

    const account =
      (await store.readAccount(subjectId)) ??
      createNewUsageAccount(subjectId, "free", now());
    const reward = grantRewardCredits({
      account: normalizeUsageMonth(account, now()),
      rewardId: body.rewardId,
      rewardCredits: readRewardCredits(env),
    });
    await store.writeAccount(reward.account);

    return jsonResponse(
      200,
      {
        subjectId,
        rewardId: body.rewardId,
        granted: reward.granted,
        duplicated: reward.granted === 0,
        serverAiCredits: reward.account.serverAiCredits,
      },
      responseHeaders,
    );
  };
}

function parseRewardRequestBody(text: string): RewardRequestBody {
  try {
    const parsed = JSON.parse(text) as RewardRequestBody;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function readRewardCredits(env: Record<string, string | undefined>) {
  const parsed = Number.parseInt(env.PICTORY_AI_AD_CREDIT_QUOTA ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_SERVER_AI_CREDITS.rewardCredits;
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
