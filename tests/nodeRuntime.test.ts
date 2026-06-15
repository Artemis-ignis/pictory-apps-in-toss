import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPictoryNodeRequestListener } from "../server/pictoryNodeRuntime";
import {
  createNewUsageAccount,
  type PictoryUsageAccount,
  type PictoryUsageLedgerStore,
} from "../server/pictoryUsageLedger";

const classifyBody = {
  schemaVersion: 1,
  items: [
    {
      id: "photo-1",
      hints: ["receipt"],
      signals: { width: 720, height: 960 },
      redacted: true,
    },
  ],
};

let server: Server | undefined;

describe("pictoryNodeRuntime", () => {
  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server?.close((error) => (error ? reject(error) : resolve()));
      });
      server = undefined;
    }
  });

  it("serves health, reward, and classify routes over HTTP", async () => {
    const store = createMemoryStore(createNewUsageAccount("user-1", "plus"));
    const classifyItems = vi.fn(async () => [
      {
        id: "photo-1",
        categoryId: "receipt" as const,
        cleanBucketId: "needsReview" as const,
        confidence: 0.9,
        privacy: "review" as const,
      },
    ]);
    const baseUrl = await listen({
      store,
      classifyItems,
      env: {
        PICTORY_SERVER_SECRET: "server-secret",
        PICTORY_AI_PLUS_MONTHLY_QUOTA: "500",
        PICTORY_AI_AD_CREDIT_QUOTA: "100",
      },
    });

    const health = await fetch(`${baseUrl}/healthz`);
    const reward = await postJson(`${baseUrl}/pictory/reward`, {
      body: { rewardId: "ad-event-1" },
    });
    const classify = await postJson(`${baseUrl}/pictory/classify`, {
      body: classifyBody,
    });

    expect(await health.json()).toEqual({ ok: true });
    expect(reward.status).toBe(200);
    expect(await reward.json()).toMatchObject({
      granted: 100,
      serverAiCredits: 100,
    });
    expect(classify.status).toBe(200);
    expect(await classify.json()).toMatchObject({
      items: [{ id: "photo-1", categoryId: "receipt" }],
    });
    expect((await store.readAccount("user-1"))?.monthlyServerAiUsed).toBe(1);
    expect(classifyItems).toHaveBeenCalledOnce();
  });

  it("rejects unknown routes and oversized bodies", async () => {
    const baseUrl = await listen({
      store: createMemoryStore(createNewUsageAccount("user-1", "plus")),
      bodyLimitBytes: 8,
    });

    const missing = await fetch(`${baseUrl}/missing`);
    const tooLarge = await fetch(`${baseUrl}/pictory/reward`, {
      method: "POST",
      body: "0123456789",
    });

    expect(missing.status).toBe(404);
    expect(tooLarge.status).toBe(413);
  });
});

async function listen(
  options: Parameters<typeof createPictoryNodeRequestListener>[0],
) {
  server = createServer(createPictoryNodeRequestListener(options));
  await new Promise<void>((resolve) => {
    server?.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (typeof address !== "object" || address == null) {
    throw new Error("Server did not expose a TCP address");
  }
  return `http://127.0.0.1:${address.port}`;
}

function postJson(url: string, { body }: { body: unknown }) {
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-pictory-server-secret": "server-secret",
      "x-pictory-subject-id": "user-1",
    },
    body: JSON.stringify(body),
  });
}

function createMemoryStore(
  account: PictoryUsageAccount,
): PictoryUsageLedgerStore {
  let current = account;
  return {
    readAccount: async (subjectId) =>
      current.subjectId === subjectId ? current : null,
    writeAccount: async (account) => {
      current = account;
    },
  };
}
