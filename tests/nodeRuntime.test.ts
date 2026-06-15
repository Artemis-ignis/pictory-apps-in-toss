import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPictoryNodeRequestListener } from "../server/pictoryNodeRuntime";
import {
  createNewUsageAccount,
  type PictoryUsageAccount,
  type PictoryUsageLedgerStore,
} from "../server/pictoryUsageLedger";
import { createSignedPictorySessionToken } from "../server/pictorySessionAuth";

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

  it("serves health, reward, classify, and account delete routes over HTTP", async () => {
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
        VITE_TOSS_REWARDED_AD_GROUP_ID: "ait.prod.rewarded",
      },
    });

    const health = await fetch(`${baseUrl}/healthz`);
    const reward = await postJson(`${baseUrl}/pictory/reward`, {
      body: rewardEvidence(),
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
    const accountDelete = await deleteAccount(`${baseUrl}/pictory/account`);
    expect(accountDelete.status).toBe(200);
    expect(await accountDelete.json()).toMatchObject({
      subjectId: "user-1",
      deleted: true,
    });
    expect(await store.readAccount("user-1")).toBeNull();
    expect(classifyItems).toHaveBeenCalledOnce();
  });

  it("uses one injected session resolver for reward, classify, and account delete", async () => {
    const store = createMemoryStore(
      createNewUsageAccount("session-user", "plus"),
    );
    const classifyItems = vi.fn(async () => [
      {
        id: "photo-1",
        categoryId: "receipt" as const,
        cleanBucketId: "needsReview" as const,
        confidence: 0.9,
        privacy: "review" as const,
      },
    ]);
    const resolveSubjectId = vi.fn(async (context) =>
      context.headers.cookie?.includes("pictory_session=session-token")
        ? "session-user"
        : null,
    );
    const baseUrl = await listen({
      store,
      classifyItems,
      resolveSubjectId,
      env: {
        PICTORY_AI_PLUS_MONTHLY_QUOTA: "500",
        PICTORY_AI_AD_CREDIT_QUOTA: "100",
        VITE_TOSS_REWARDED_AD_GROUP_ID: "ait.prod.rewarded",
      },
    });
    const headers = {
      Cookie: "pictory_session=session-token",
      "Content-Type": "application/json",
    };

    const reward = await fetch(`${baseUrl}/pictory/reward`, {
      method: "POST",
      headers,
      body: JSON.stringify(rewardEvidence()),
    });
    const classify = await fetch(`${baseUrl}/pictory/classify`, {
      method: "POST",
      headers,
      body: JSON.stringify(classifyBody),
    });
    const accountDelete = await fetch(`${baseUrl}/pictory/account`, {
      method: "DELETE",
      headers,
    });

    expect(reward.status).toBe(200);
    expect(classify.status).toBe(200);
    expect(accountDelete.status).toBe(200);
    expect(await accountDelete.json()).toMatchObject({
      subjectId: "session-user",
      deleted: true,
    });
    expect(await store.readAccount("session-user")).toBeNull();
    expect(resolveSubjectId).toHaveBeenCalledTimes(3);
  });

  it("uses signed session cookies without exposing server subject headers", async () => {
    const store = createMemoryStore(
      createNewUsageAccount("signed-user", "plus"),
    );
    const token = createSignedPictorySessionToken(
      { sub: "signed-user", exp: 4_000_000_000, aud: "pictory" },
      "session-secret",
    );
    const baseUrl = await listen({
      store,
      classifyItems: vi.fn(async () => [
        {
          id: "photo-1",
          categoryId: "receipt" as const,
          cleanBucketId: "needsReview" as const,
          confidence: 0.9,
          privacy: "review" as const,
        },
      ]),
      env: {
        PICTORY_SESSION_SECRET: "session-secret",
        PICTORY_SESSION_AUDIENCE: "pictory",
        PICTORY_AI_PLUS_MONTHLY_QUOTA: "500",
        PICTORY_AI_AD_CREDIT_QUOTA: "100",
        VITE_TOSS_REWARDED_AD_GROUP_ID: "ait.prod.rewarded",
      },
    });
    const headers = {
      Cookie: `pictory_session=${token}`,
      "Content-Type": "application/json",
    };

    const reward = await fetch(`${baseUrl}/pictory/reward`, {
      method: "POST",
      headers,
      body: JSON.stringify(rewardEvidence()),
    });
    const classify = await fetch(`${baseUrl}/pictory/classify`, {
      method: "POST",
      headers,
      body: JSON.stringify(classifyBody),
    });
    const accountDelete = await fetch(`${baseUrl}/pictory/account`, {
      method: "DELETE",
      headers,
    });

    expect(reward.status).toBe(200);
    expect(classify.status).toBe(200);
    expect(accountDelete.status).toBe(200);
    expect(await accountDelete.json()).toMatchObject({
      subjectId: "signed-user",
      deleted: true,
    });
  });

  it("syncs verified paid entitlement before allowing session-based server AI", async () => {
    const store = createMemoryStore(createNewUsageAccount("paid-user", "free"));
    const classifyItems = vi.fn(async () => [
      {
        id: "photo-1",
        categoryId: "receipt" as const,
        cleanBucketId: "needsReview" as const,
        confidence: 0.9,
        privacy: "review" as const,
      },
    ]);
    const token = createSignedPictorySessionToken(
      { sub: "paid-user", exp: 4_000_000_000, aud: "pictory" },
      "session-secret",
    );
    const baseUrl = await listen({
      store,
      classifyItems,
      env: {
        PICTORY_SERVER_SECRET: "server-secret",
        PICTORY_SESSION_SECRET: "session-secret",
        PICTORY_SESSION_AUDIENCE: "pictory",
        PICTORY_AI_PLUS_MONTHLY_QUOTA: "500",
      },
    });

    const sync = await fetch(`${baseUrl}/pictory/entitlement`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-pictory-server-secret": "server-secret",
        "x-pictory-subject-id": "paid-user",
      },
      body: JSON.stringify({
        planId: "plus",
        subscriptionExpiresAt: "2026-07-15T00:00:00.000Z",
      }),
    });
    const classify = await fetch(`${baseUrl}/pictory/classify`, {
      method: "POST",
      headers: {
        Cookie: `pictory_session=${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(classifyBody),
    });

    expect(sync.status).toBe(200);
    expect(await sync.json()).toMatchObject({
      subjectId: "paid-user",
      planId: "plus",
    });
    expect(classify.status).toBe(200);
    expect(await classify.json()).toMatchObject({
      items: [{ id: "photo-1", categoryId: "receipt" }],
    });
    expect(await store.readAccount("paid-user")).toMatchObject({
      planId: "plus",
      monthlyServerAiUsed: 1,
    });
  });

  it("verifies an Apps-in-Toss order through the entitlement route", async () => {
    const store = createMemoryStore(createNewUsageAccount("order-user", "free"));
    const token = createSignedPictorySessionToken(
      { sub: "order-user", exp: 4_000_000_000, aud: "pictory" },
      "session-secret",
    );
    const baseUrl = await listen({
      store,
      fetchOrderStatus: async () => ({
        orderId: "order-plus-1",
        sku: "pictory.plus.monthly",
        status: "PAYMENT_COMPLETED",
        statusDeterminedAt: "2026-06-15T12:00:00",
      }),
      env: {
        PICTORY_SESSION_SECRET: "session-secret",
        PICTORY_SESSION_AUDIENCE: "pictory",
        PICTORY_PLUS_SUBSCRIPTION_SKU: "pictory.plus.monthly",
        PICTORY_SUBSCRIPTION_VALID_DAYS: "30",
      },
    });

    const sync = await fetch(`${baseUrl}/pictory/entitlement`, {
      method: "POST",
      headers: {
        Cookie: `pictory_session=${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        orderId: "order-plus-1",
        expectedPlanId: "plus",
      }),
    });

    expect(sync.status).toBe(200);
    expect(await sync.json()).toMatchObject({
      subjectId: "order-user",
      planId: "plus",
      orderId: "order-plus-1",
      orderStatus: "PAYMENT_COMPLETED",
      subscriptionExpiresAt: "2026-07-15T03:00:00.000Z",
    });
    expect(await store.readAccount("order-user")).toMatchObject({
      planId: "plus",
      subscriptionExpiresAt: "2026-07-15T03:00:00.000Z",
    });
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

function deleteAccount(url: string) {
  return fetch(url, {
    method: "DELETE",
    headers: {
      "x-pictory-server-secret": "server-secret",
      "x-pictory-subject-id": "user-1",
    },
  });
}

function rewardEvidence() {
  return {
    rewardId: "ad-event-1",
    adGroupId: "ait.prod.rewarded",
    source: "native",
    unitType: "scan",
    unitAmount: 100,
    usingTestAdGroup: false,
  };
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
    deleteAccount: async (subjectId) => {
      if (current.subjectId !== subjectId) {
        return false;
      }
      current = createNewUsageAccount("__deleted__");
      return true;
    },
  };
}
