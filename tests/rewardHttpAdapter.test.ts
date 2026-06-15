import { describe, expect, it, vi } from "vitest";
import { createPictoryRewardHttpHandler } from "../server/pictoryRewardHttpAdapter";
import {
  createNewUsageAccount,
  type PictoryUsageAccount,
  type PictoryUsageLedgerStore,
} from "../server/pictoryUsageLedger";

describe("pictoryRewardHttpAdapter", () => {
  it("grants ad credits to a server-authenticated subject", async () => {
    const store = createMemoryStore();
    const handler = createPictoryRewardHttpHandler({
      store,
      env: {
        PICTORY_SERVER_SECRET: "server-secret",
        PICTORY_AI_AD_CREDIT_QUOTA: "100",
      },
    });

    const response = await handler({
      method: "POST",
      headers: {
        "x-pictory-server-secret": "server-secret",
        "x-pictory-subject-id": "user-1",
      },
      body: JSON.stringify({ rewardId: "ad-event-1" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers["Cache-Control"]).toBe("no-store");
    expect(JSON.parse(response.body)).toMatchObject({
      subjectId: "user-1",
      rewardId: "ad-event-1",
      granted: 100,
      duplicated: false,
      serverAiCredits: 100,
    });
    expect((await store.readAccount("user-1"))?.serverAiCredits).toBe(100);
  });

  it("does not grant the same reward event twice", async () => {
    const store = createMemoryStore(createNewUsageAccount("user-1", "free"));
    const handler = createPictoryRewardHttpHandler({
      store,
      env: {
        PICTORY_SERVER_SECRET: "server-secret",
        PICTORY_AI_AD_CREDIT_QUOTA: "100",
      },
    });
    const request = {
      method: "POST",
      headers: {
        "x-pictory-server-secret": "server-secret",
        "x-pictory-subject-id": "user-1",
      },
      body: JSON.stringify({ rewardId: "ad-event-1" }),
    };

    const first = await handler(request);
    const second = await handler(request);

    expect(JSON.parse(first.body).granted).toBe(100);
    expect(JSON.parse(second.body)).toMatchObject({
      granted: 0,
      duplicated: true,
      serverAiCredits: 100,
    });
  });

  it("ignores client-supplied reward amounts and uses server policy", async () => {
    const handler = createPictoryRewardHttpHandler({
      store: createMemoryStore(),
      env: {
        PICTORY_SERVER_SECRET: "server-secret",
        PICTORY_AI_AD_CREDIT_QUOTA: "25",
      },
    });

    const response = await handler({
      method: "POST",
      headers: {
        "x-pictory-server-secret": "server-secret",
        "x-pictory-subject-id": "user-1",
      },
      body: JSON.stringify({ rewardId: "ad-event-1", rewardCredits: 9999 }),
    });

    expect(JSON.parse(response.body)).toMatchObject({
      granted: 25,
      serverAiCredits: 25,
    });
  });

  it("rejects unauthenticated reward grants", async () => {
    const handler = createPictoryRewardHttpHandler({
      store: createMemoryStore(),
      env: { PICTORY_SERVER_SECRET: "server-secret" },
    });

    const response = await handler({
      method: "POST",
      headers: { "x-pictory-subject-id": "user-1" },
      body: JSON.stringify({ rewardId: "ad-event-1" }),
    });

    expect(response.status).toBe(401);
    expect(JSON.parse(response.body).error.code).toBe("unauthorized");
  });

  it("supports injected auth resolver and CORS preflight", async () => {
    const store = createMemoryStore();
    const handler = createPictoryRewardHttpHandler({
      store,
      corsOrigin: "https://pictory.example.com",
      resolveSubjectId: vi.fn(async (context) =>
        context.headers.authorization === "Bearer session-token"
          ? "auth-user"
          : null,
      ),
    });

    const preflight = await handler({ method: "OPTIONS" });
    const response = await handler({
      method: "POST",
      headers: { Authorization: "Bearer session-token" },
      body: JSON.stringify({ rewardId: "ad-event-1" }),
    });

    expect(preflight.status).toBe(204);
    expect(preflight.headers["Access-Control-Allow-Origin"]).toBe(
      "https://pictory.example.com",
    );
    expect(response.status).toBe(200);
    expect((await store.readAccount("auth-user"))?.serverAiCredits).toBe(100);
  });

  it("rejects missing reward ids and non-POST methods", async () => {
    const handler = createPictoryRewardHttpHandler({
      store: createMemoryStore(),
      resolveSubjectId: vi.fn(async () => "user-1"),
    });

    const missingReward = await handler({ method: "POST", body: "{}" });
    const getResponse = await handler({ method: "GET" });

    expect(missingReward.status).toBe(400);
    expect(JSON.parse(missingReward.body).error.code).toBe("invalid_reward");
    expect(getResponse.status).toBe(405);
  });
});

function createMemoryStore(
  initialAccount?: PictoryUsageAccount,
): PictoryUsageLedgerStore {
  const accounts = new Map<string, PictoryUsageAccount>();
  if (initialAccount) {
    accounts.set(initialAccount.subjectId, initialAccount);
  }

  return {
    readAccount: async (subjectId) => accounts.get(subjectId),
    writeAccount: async (account) => {
      accounts.set(account.subjectId, account);
    },
  };
}
