import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { join } from "node:path";
import { cwd, env as processEnv } from "node:process";
import { createPictoryClassifyHttpHandler } from "./pictoryHttpAdapter";
import { createPictoryRewardHttpHandler } from "./pictoryRewardHttpAdapter";
import { createPictoryAccountHttpHandler } from "./pictoryAccountHttpAdapter";
import { createPictoryEntitlementHttpHandler } from "./pictoryEntitlementHttpAdapter";
import { PictoryFileUsageLedgerStore } from "./pictoryFileUsageStore";
import type { PictoryIapOrderStatusFetcher } from "./pictoryIapOrderStatus";
import {
  assertPictoryRuntimeEnv,
  PictoryRuntimeEnvError,
} from "./pictoryRuntimeEnvGuard";
import type {
  PictoryClassifyDeps,
  PictoryClassifyRequestContext,
} from "./pictoryClassify";
import type { PictoryUsageLedgerStore } from "./pictoryUsageLedger";

const DEFAULT_BODY_LIMIT_BYTES = 4 * 1024 * 1024;
type MaybePromise<T> = T | Promise<T>;

export interface PictoryNodeRuntimeOptions {
  store?: PictoryUsageLedgerStore;
  env?: Record<string, string | undefined>;
  classifyItems?: PictoryClassifyDeps["classifyItems"];
  fetchOrderStatus?: PictoryIapOrderStatusFetcher;
  resolveSubjectId?: (
    context: PictoryClassifyRequestContext,
  ) => MaybePromise<string | null | undefined>;
  bodyLimitBytes?: number;
}

export function createPictoryNodeRequestListener({
  store,
  env = processEnv,
  classifyItems,
  fetchOrderStatus,
  resolveSubjectId,
  bodyLimitBytes = DEFAULT_BODY_LIMIT_BYTES,
}: PictoryNodeRuntimeOptions = {}) {
  const usageStore = store ?? createDefaultFileStore(env);
  const corsOrigin = env.PICTORY_CORS_ORIGIN;
  const classifyHandler = createPictoryClassifyHttpHandler({
    store: usageStore,
    env,
    classifyItems,
    resolveSubjectId,
    corsOrigin,
  });
  const rewardHandler = createPictoryRewardHttpHandler({
    store: usageStore,
    env,
    resolveSubjectId,
    corsOrigin,
  });
  const accountHandler = createPictoryAccountHttpHandler({
    store: usageStore,
    env,
    resolveSubjectId,
    corsOrigin,
  });
  const entitlementHandler = createPictoryEntitlementHttpHandler({
    store: usageStore,
    env,
    fetchOrderStatus,
    corsOrigin,
  });

  return async function pictoryNodeRequestListener(
    request: IncomingMessage,
    response: ServerResponse,
  ) {
    try {
      const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
      if (request.method === "GET" && path === "/healthz") {
        writeJson(response, 200, { ok: true });
        return;
      }

      if (
        path !== "/pictory/classify" &&
        path !== "/pictory/reward" &&
        path !== "/pictory/account" &&
        path !== "/pictory/entitlement"
      ) {
        writeJson(response, 404, {
          error: { code: "not_found", message: "Endpoint not found." },
        });
        return;
      }

      const body = await readBody(request, bodyLimitBytes);
      const httpRequest = {
        method: request.method ?? "GET",
        headers: request.headers,
        body,
        bodySizeBytes: Buffer.byteLength(body, "utf8"),
      };
      const result =
        path === "/pictory/classify"
          ? await classifyHandler(httpRequest)
          : path === "/pictory/reward"
            ? await rewardHandler(httpRequest)
            : path === "/pictory/account"
              ? await accountHandler(httpRequest)
              : await entitlementHandler(httpRequest);

      writeResponse(response, result.status, result.headers, result.body);
    } catch (error) {
      const status = error instanceof BodyTooLargeError ? 413 : 500;
      const code =
        error instanceof BodyTooLargeError ? "body_too_large" : "server_error";
      writeJson(response, status, {
        error: {
          code,
          message:
            error instanceof BodyTooLargeError
              ? "Request body is too large."
              : "Pictory server failed.",
        },
      });
    }
  };
}

export function startPictoryNodeServer(
  options: PictoryNodeRuntimeOptions = {},
) {
  const env = options.env ?? processEnv;
  if (env.PICTORY_SKIP_RUNTIME_ENV_CHECK !== "true") {
    assertPictoryRuntimeEnv(env);
  }

  const port = Number.parseInt(env.PORT ?? "8787", 10);
  const server = createServer(createPictoryNodeRequestListener(options));
  server.listen(port, "127.0.0.1", () => {
    console.log(`Pictory server listening on http://127.0.0.1:${port}`);
  });
  return server;
}

function createDefaultFileStore(env: Record<string, string | undefined>) {
  return new PictoryFileUsageLedgerStore(
    env.PICTORY_LEDGER_FILE ?? join(cwd(), ".pictory-ledger.json"),
  );
}

function readBody(request: IncomingMessage, limitBytes: number) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;

    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limitBytes) {
        tooLarge = true;
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (tooLarge) {
        reject(new BodyTooLargeError());
        return;
      }
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    request.on("error", reject);
  });
}

function writeJson(response: ServerResponse, status: number, body: unknown) {
  writeResponse(
    response,
    status,
    { "Content-Type": "application/json" },
    JSON.stringify(body),
  );
}

function writeResponse(
  response: ServerResponse,
  status: number,
  headers: Record<string, string>,
  body: string,
) {
  response.writeHead(status, headers);
  response.end(body);
}

class BodyTooLargeError extends Error {}

if (/pictoryNodeRuntime\.(ts|js)$/.test(process.argv[1] ?? "")) {
  try {
    startPictoryNodeServer();
  } catch (error) {
    if (error instanceof PictoryRuntimeEnvError) {
      console.error(error.message);
      for (const issue of error.issues) {
        console.error(`- ${issue}`);
      }
      process.exitCode = 1;
    } else {
      throw error;
    }
  }
}
