import { describe, expect, it } from "vitest";
import { createPictoryEntitlementHttpHandler } from "../server/pictoryEntitlementHttpAdapter";
import {
  createNewUsageAccount,
  type PictoryUsageAccount,
  type PictoryUsageLedgerStore,
} from "../server/pictoryUsageLedger";
import { createSignedPictorySessionToken } from "../server/pictorySessionAuth";

describe("pictoryEntitlementHttpAdapter", () => {
  it("syncs a server-authenticated subscription plan into the usage ledger", async () => {
    const store = createMemoryStore({
      ...createNewUsageAccount("user-1", "free"),
      serverAiCredits: 25,
    });
    const handler = createPictoryEntitlementHttpHandler({
      store,
      env: { PICTORY_SERVER_SECRET: "server-secret" },
      now: () => new Date("2026-06-15T00:00:00.000Z"),
    });

    const response = await handler({
      method: "POST",
      headers: {
        "x-pictory-server-secret": "server-secret",
        "x-pictory-subject-id": "user-1",
      },
      body: JSON.stringify({
        planId: "plus",
        subscriptionExpiresAt: "2026-07-15T00:00:00.000Z",
      }),
    });

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      subjectId: "user-1",
      planId: "plus",
      subscriptionExpiresAt: "2026-07-15T00:00:00.000Z",
      serverAiCredits: 25,
    });
    expect(await store.readAccount("user-1")).toMatchObject({
      planId: "plus",
      serverAiCredits: 25,
    });
  });

  it("does not trust public session auth for plan upgrades by default", async () => {
    const store = createMemoryStore(createNewUsageAccount("user-1", "free"));
    const token = createSignedPictorySessionToken(
      { sub: "user-1", exp: 4_000_000_000 },
      "session-secret",
    );
    const handler = createPictoryEntitlementHttpHandler({
      store,
      env: { PICTORY_SESSION_SECRET: "session-secret" },
    });

    const response = await handler({
      method: "POST",
      headers: { Cookie: `pictory_session=${token}` },
      body: JSON.stringify({ planId: "pro" }),
    });

    expect(response.status).toBe(401);
    expect((await store.readAccount("user-1"))?.planId).toBe("free");
  });

  it("rejects invalid plans, invalid expiry values, and non-POST methods", async () => {
    const handler = createPictoryEntitlementHttpHandler({
      store: createMemoryStore(),
      env: { PICTORY_SERVER_SECRET: "server-secret" },
    });
    const headers = {
      "x-pictory-server-secret": "server-secret",
      "x-pictory-subject-id": "user-1",
    };

    const invalidPlan = await handler({
      method: "POST",
      headers,
      body: JSON.stringify({ planId: "vip" }),
    });
    const invalidExpiry = await handler({
      method: "POST",
      headers,
      body: JSON.stringify({ planId: "plus", subscriptionExpiresAt: "soon" }),
    });
    const getResponse = await handler({ method: "GET" });

    expect(invalidPlan.status).toBe(400);
    expect(JSON.parse(invalidPlan.body).error.code).toBe("invalid_plan");
    expect(invalidExpiry.status).toBe(400);
    expect(JSON.parse(invalidExpiry.body).error.code).toBe("invalid_expiry");
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
    readAccount: async (subjectId) => accounts.get(subjectId) ?? null,
    writeAccount: async (account) => {
      accounts.set(account.subjectId, account);
    },
  };
}
