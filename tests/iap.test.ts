import { describe, expect, it } from "vitest";
import { defaultPictoryState } from "../src/features/album/storage";
import {
  getConfiguredPlanSku,
  getPlanIdBySku,
  purchaseSubscriptionPlan,
  restoreIapEntitlement,
  type IapClient,
} from "../src/features/billing/iap";

const env = {
  VITE_PICTORY_PLUS_SUBSCRIPTION_SKU: "pictory.plus.monthly",
  VITE_PICTORY_PRO_SUBSCRIPTION_SKU: "pictory.pro.monthly",
};

function createMockClient(overrides: Partial<IapClient> = {}): IapClient {
  return {
    getProductItemList: async () => ({
      products: [
        {
          sku: "pictory.plus.monthly",
          type: "SUBSCRIPTION",
          displayName: "픽토리 플러스",
          displayAmount: "월 2,900원",
          iconUrl: "",
          description: "월 정리 500장",
          renewalCycle: "MONTHLY",
          offers: [],
        },
      ],
    }),
    createSubscriptionPurchaseOrder: ({ onEvent, options }) => {
      void Promise.resolve(
        options.processProductGrant({
          orderId: "order-plus-1",
          subscriptionId: "sub-plus-1",
        }),
      ).then(() => {
        void onEvent({
          type: "success",
          data: { orderId: "order-plus-1" },
        });
      });
      return () => undefined;
    },
    getPendingOrders: async () => ({ orders: [] }),
    completeProductGrant: async () => true,
    getSubscriptionInfo: async () => undefined,
    ...overrides,
  };
}

describe("pictory iap adapter", () => {
  it("maps configured plan skus", () => {
    expect(getConfiguredPlanSku("plus", env)).toBe("pictory.plus.monthly");
    expect(getConfiguredPlanSku("pro", env)).toBe("pictory.pro.monthly");
    expect(getPlanIdBySku("pictory.plus.monthly", env)).toBe("plus");
    expect(getPlanIdBySku("unknown", env)).toBeNull();
  });

  it("does not start paid purchase without a configured sku", async () => {
    await expect(
      purchaseSubscriptionPlan("plus", {
        env: {},
        client: createMockClient(),
        timeoutMs: 10,
      }),
    ).resolves.toMatchObject({ status: "missingSku" });
  });

  it("grants a plan only after subscription purchase success", async () => {
    await expect(
      purchaseSubscriptionPlan("plus", {
        env,
        client: createMockClient(),
        timeoutMs: 100,
      }),
    ).resolves.toMatchObject({
      status: "purchased",
      entitlement: {
        planId: "plus",
        sku: "pictory.plus.monthly",
        orderId: "order-plus-1",
      },
    });
  });

  it("restores an accessible stored subscription", async () => {
    const result = await restoreIapEntitlement(
      {
        ...defaultPictoryState,
        iapEntitlement: {
          planId: "plus",
          sku: "pictory.plus.monthly",
          orderId: "order-plus-1",
          verifiedAt: "2026-06-15T00:00:00.000Z",
        },
      },
      {
        env,
        client: createMockClient({
          getSubscriptionInfo: async () => ({
            subscription: {
              status: "ACTIVE",
              expiresAt: "2026-07-15T00:00:00.000Z",
              isAccessible: true,
            },
          }),
        }),
      },
    );

    expect(result).toMatchObject({
      status: "restored",
      entitlement: {
        planId: "plus",
        orderId: "order-plus-1",
        status: "ACTIVE",
      },
    });
  });

  it("restores a pending completed payment by sku", async () => {
    const result = await restoreIapEntitlement(defaultPictoryState, {
      env,
      client: createMockClient({
        getPendingOrders: async () => ({
          orders: [
            {
              orderId: "pending-pro-1",
              sku: "pictory.pro.monthly",
              paymentCompletedDate: "2026-06-15T12:00:00",
            },
          ],
        }),
      }),
    });

    expect(result).toMatchObject({
      status: "restored",
      entitlement: {
        planId: "pro",
        orderId: "pending-pro-1",
      },
    });
  });
});
