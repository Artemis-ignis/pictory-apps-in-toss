import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const serverEntry = join(rootDir, "dist-server", "pictoryNodeRuntime.js");

if (!existsSync(serverEntry)) {
  throw new Error("dist-server/pictoryNodeRuntime.js is missing. Run server:build first.");
}

const port = await findFreePort();
const ledgerFile = join(tmpdir(), `pictory-built-${process.pid}-${Date.now()}.json`);
const server = spawn(process.execPath, [serverEntry], {
  cwd: rootDir,
  env: {
    ...process.env,
    PORT: String(port),
    PICTORY_SKIP_RUNTIME_ENV_CHECK: "true",
    PICTORY_LEDGER_FILE: ledgerFile,
    PICTORY_SERVER_SECRET: "server-secret",
    VITE_TOSS_REWARDED_AD_GROUP_ID: "ait.prod.rewarded",
    PICTORY_REWARD_REQUIRE_NATIVE_EVENT: "true",
    PICTORY_AI_PLUS_MONTHLY_QUOTA: "10",
    PICTORY_AI_RATE_LIMIT_PER_MINUTE: "10",
    PICTORY_AI_LOG_RAW_IMAGES: "false",
    OPENAI_API_KEY: "sk-placeholder-built-server-qa",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
const output = [];
server.stdout.on("data", (chunk) => output.push(String(chunk)));
server.stderr.on("data", (chunk) => output.push(String(chunk)));

try {
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForHealth(`${baseUrl}/healthz`);

  const reward = await postJson(`${baseUrl}/pictory/reward`, {
    headers: internalHeaders(),
    body: {
      rewardId: "ad-event-built-qa",
      adGroupId: "ait.prod.rewarded",
      source: "native",
      unitType: "scan",
      unitAmount: 100,
      usingTestAdGroup: false,
    },
  });
  assertStatus(reward, 200, "reward");

  const entitlement = await postJson(`${baseUrl}/pictory/entitlement`, {
    headers: internalHeaders(),
    body: {
      planId: "plus",
      subscriptionExpiresAt: "2026-07-15T00:00:00.000Z",
    },
  });
  assertStatus(entitlement, 200, "entitlement sync");

  const classify = await postJson(`${baseUrl}/pictory/classify`, {
    headers: internalHeaders(),
    body: {
      schemaVersion: 1,
      items: [
        {
          id: "sensitive-photo-id",
          hints: ["id", "sensitive"],
          signals: {
            width: 720,
            height: 960,
            aspectRatio: 0.75,
            brightness: 0.7,
            saturation: 0.15,
            edgeDensity: 0.4,
            textLineScore: 0.6,
            colorVariance: 0.2,
          },
          redacted: true,
        },
      ],
    },
  });
  assertStatus(classify, 200, "classify");

  const accountDelete = await fetch(`${baseUrl}/pictory/account`, {
    method: "DELETE",
    headers: internalHeaders(),
  });
  assertStatus(accountDelete, 200, "account delete");

  console.log(
    JSON.stringify(
      {
        ok: true,
        url: baseUrl,
        checked: [
          "healthz",
          "reward",
          "entitlement",
          "classify",
          "account-delete",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  server.kill();
  await unlink(ledgerFile).catch(() => undefined);
}

function internalHeaders() {
  return {
    "Content-Type": "application/json",
    "x-pictory-server-secret": "server-secret",
    "x-pictory-subject-id": "built-user",
  };
}

async function postJson(url, { headers, body }) {
  return fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function assertStatus(response, expected, label) {
  if (response.status !== expected) {
    throw new Error(
      `${label} failed with ${response.status}. Server output:\n${output.join("")}`,
    );
  }
}

async function waitForHealth(url) {
  const deadline = Date.now() + 10_000;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = new Error(`health returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }

  throw new Error(`Built server did not become ready: ${lastError}`);
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === "object" && address != null) {
          resolve(address.port);
          return;
        }
        reject(new Error("No TCP port assigned"));
      });
    });
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
