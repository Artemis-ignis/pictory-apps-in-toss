import { describe, expect, it, vi } from "vitest";
import { createPictoryClassifyHttpHandler } from "../server/pictoryHttpAdapter";
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
      signals: { width: 720, height: 960, brightness: 0.8 },
      redacted: true,
    },
  ],
};

describe("pictoryHttpAdapter", () => {
  it("handles a paid classify HTTP request and debits server ledger quota", async () => {
    const store = createMemoryStore(createNewUsageAccount("user-1", "plus"));
    const classifyItems = vi.fn(async (_items, context) => {
      expect(context.requestId).toBe("req-1");
      expect(context.quota.remaining).toBe(499);
      return [
        {
          id: "photo-1",
          categoryId: "receipt" as const,
          cleanBucketId: "needsReview" as const,
          confidence: 0.9,
          privacy: "review" as const,
        },
      ];
    });
    const handler = createPictoryClassifyHttpHandler({
      store,
      classifyItems,
      env: {
        PICTORY_SERVER_SECRET: "server-secret",
        PICTORY_AI_PLUS_MONTHLY_QUOTA: "500",
      },
    });

    const response = await handler({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-pictory-server-secret": "server-secret",
        "x-pictory-subject-id": "user-1",
        "X-Pictory-Request-Id": "req-1",
      },
      body: JSON.stringify(classifyBody),
    });

    expect(response.status).toBe(200);
    expect(response.headers["Cache-Control"]).toBe("no-store");
    expect(JSON.parse(response.body).items[0]).toMatchObject({
      id: "photo-1",
      categoryId: "receipt",
      cleanBucketId: "needsReview",
    });
    expect((await store.readAccount("user-1"))?.monthlyServerAiUsed).toBe(1);
    expect(response.body).not.toContain("imageDataUri");
  });

  it("blocks server AI classification before upstream work when rate limit is exceeded", async () => {
    const store = createMemoryStore(createNewUsageAccount("user-1", "plus"));
    const classifyItems = vi.fn(async () => []);
    const handler = createPictoryClassifyHttpHandler({
      store,
      classifyItems,
      env: {
        PICTORY_SERVER_SECRET: "server-secret",
        PICTORY_AI_PLUS_MONTHLY_QUOTA: "500",
        PICTORY_AI_RATE_LIMIT_PER_MINUTE: "1",
      },
      now: () => new Date("2026-06-15T00:00:30.000Z"),
    });
    const request = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-pictory-server-secret": "server-secret",
        "x-pictory-subject-id": "user-1",
      },
      body: JSON.stringify(classifyBody),
    };

    const first = await handler(request);
    const second = await handler(request);

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(JSON.parse(second.body).error.code).toBe("quota_exceeded");
    expect(classifyItems).toHaveBeenCalledOnce();
    expect((await store.readAccount("user-1"))?.monthlyServerAiUsed).toBe(1);
  });

  it("rejects classify requests without the server secret", async () => {
    const handler = createPictoryClassifyHttpHandler({
      store: createMemoryStore({
        ...createNewUsageAccount("user-1", "free"),
        serverAiCredits: 10,
      }),
      classifyItems: vi.fn(async () => []),
      env: { PICTORY_SERVER_SECRET: "server-secret" },
    });

    const response = await handler({
      method: "POST",
      headers: {
        "x-pictory-subject-id": "user-1",
      },
      body: JSON.stringify(classifyBody),
    });

    expect(response.status).toBe(402);
    expect(JSON.parse(response.body).error.code).toBe("payment_required");
  });

  it("supports injected subject resolution for real auth providers", async () => {
    const store = createMemoryStore({
      ...createNewUsageAccount("auth-user", "free"),
      serverAiCredits: 2,
    });
    const handler = createPictoryClassifyHttpHandler({
      store,
      classifyItems: vi.fn(async () => []),
      resolveSubjectId: vi.fn(async (context) =>
        context.headers.authorization === "Bearer session-token"
          ? "auth-user"
          : null,
      ),
    });

    const response = await handler({
      method: "POST",
      headers: { Authorization: "Bearer session-token" },
      body: JSON.stringify(classifyBody),
    });

    expect(response.status).toBe(200);
    expect((await store.readAccount("auth-user"))?.serverAiCredits).toBe(1);
  });

  it("returns CORS preflight response without touching the ledger", async () => {
    const store = createMemoryStore(createNewUsageAccount("user-1", "plus"));
    const handler = createPictoryClassifyHttpHandler({
      store,
      corsOrigin: "https://pictory.example.com",
    });

    const response = await handler({ method: "OPTIONS" });

    expect(response.status).toBe(204);
    expect(response.headers["Access-Control-Allow-Origin"]).toBe(
      "https://pictory.example.com",
    );
    expect((await store.readAccount("user-1"))?.monthlyServerAiUsed).toBe(0);
  });

  it("rejects non-POST methods", async () => {
    const handler = createPictoryClassifyHttpHandler({
      store: createMemoryStore(createNewUsageAccount("user-1", "plus")),
    });

    const response = await handler({ method: "GET" });

    expect(response.status).toBe(405);
    expect(JSON.parse(response.body).error.code).toBe("method_not_allowed");
  });
});

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
