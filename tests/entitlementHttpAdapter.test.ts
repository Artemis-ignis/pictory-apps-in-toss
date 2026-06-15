import { describe, expect, it, vi } from "vitest";
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

  it("verifies an Apps-in-Toss order before syncing a session entitlement", async () => {
    const store = createMemoryStore(createNewUsageAccount("user-1", "free"));
    const token = createSignedPictorySessionToken(
      { sub: "user-1", exp: 4_000_000_000, aud: "pictory" },
      "session-secret",
    );
    const fetchOrderStatus = vi.fn(async () => ({
      orderId: "order-plus-1",
      sku: "pictory.plus.monthly",
      status: "PAYMENT_COMPLETED" as const,
      statusDeterminedAt: "2026-06-15T12:00:00",
      reason: "결제가 완료되었어요.",
    }));
    const handler = createPictoryEntitlementHttpHandler({
      store,
      fetchOrderStatus,
      env: {
        PICTORY_SESSION_SECRET: "session-secret",
        PICTORY_SESSION_AUDIENCE: "pictory",
        PICTORY_PLUS_SUBSCRIPTION_SKU: "pictory.plus.monthly",
        PICTORY_SUBSCRIPTION_VALID_DAYS: "30",
      },
    });

    const response = await handler({
      method: "POST",
      headers: { Cookie: `pictory_session=${token}` },
      body: JSON.stringify({
        orderId: "order-plus-1",
        expectedPlanId: "plus",
      }),
    });

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      subjectId: "user-1",
      planId: "plus",
      orderId: "order-plus-1",
      orderStatus: "PAYMENT_COMPLETED",
      subscriptionExpiresAt: "2026-07-15T03:00:00.000Z",
    });
    expect(fetchOrderStatus).toHaveBeenCalledWith("order-plus-1", {
      env: expect.any(Object),
    });
    expect(await store.readAccount("user-1")).toMatchObject({
      planId: "plus",
      subscriptionExpiresAt: "2026-07-15T03:00:00.000Z",
    });
  });

  it("rejects ungrantable or mismatched verified orders", async () => {
    const token = createSignedPictorySessionToken(
      { sub: "user-1", exp: 4_000_000_000 },
      "session-secret",
    );
    const store = createMemoryStore(createNewUsageAccount("user-1", "free"));
    const handler = createPictoryEntitlementHttpHandler({
      store,
      fetchOrderStatus: async () => ({
        orderId: "order-1",
        sku: "pictory.pro.monthly",
        status: "REFUNDED",
      }),
      env: {
        PICTORY_SESSION_SECRET: "session-secret",
        PICTORY_PRO_SUBSCRIPTION_SKU: "pictory.pro.monthly",
      },
    });

    const response = await handler({
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        orderId: "order-1",
        expectedPlanId: "plus",
      }),
    });

    expect(response.status).toBe(409);
    expect(JSON.parse(response.body).error.code).toBe("plan_mismatch");
    expect((await store.readAccount("user-1"))?.planId).toBe("free");
  });

  it("returns a service error when order verification is not configured", async () => {
    const token = createSignedPictorySessionToken(
      { sub: "user-1", exp: 4_000_000_000 },
      "session-secret",
    );
    const handler = createPictoryEntitlementHttpHandler({
      store: createMemoryStore(createNewUsageAccount("user-1", "free")),
      env: { PICTORY_SESSION_SECRET: "session-secret" },
    });

    const response = await handler({
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ orderId: "order-1" }),
    });

    expect(response.status).toBe(503);
    expect(JSON.parse(response.body).error.code).toBe(
      "iap_verification_unconfigured",
    );
  });

  it("rejects an order status response for a different order id", async () => {
    const token = createSignedPictorySessionToken(
      { sub: "user-1", exp: 4_000_000_000 },
      "session-secret",
    );
    const store = createMemoryStore(createNewUsageAccount("user-1", "free"));
    const handler = createPictoryEntitlementHttpHandler({
      store,
      fetchOrderStatus: async () => ({
        orderId: "other-order",
        sku: "pictory.plus.monthly",
        status: "PAYMENT_COMPLETED",
      }),
      env: {
        PICTORY_SESSION_SECRET: "session-secret",
        PICTORY_PLUS_SUBSCRIPTION_SKU: "pictory.plus.monthly",
      },
    });

    const response = await handler({
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ orderId: "order-plus-1" }),
    });

    expect(response.status).toBe(409);
    expect(JSON.parse(response.body).error.code).toBe("order_mismatch");
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
