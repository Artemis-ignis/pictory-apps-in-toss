import { describe, expect, it, vi } from "vitest";
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
const verifiedEnv = {
  ...env,
  VITE_PICTORY_ENTITLEMENT_ENDPOINT:
    "https://api.example.com/pictory/entitlement",
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
    createSubscriptionPurchaseOrder: ({ onError, onEvent, options }) => {
      void Promise.resolve(
        options.processProductGrant({
          orderId: "order-plus-1",
          subscriptionId: "sub-plus-1",
        }),
      ).then((granted) => {
        if (granted) {
          void onEvent({
            type: "success",
            data: { orderId: "order-plus-1" },
          });
          return;
        }

        void onError({ code: "PRODUCT_NOT_GRANTED_BY_PARTNER" });
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
        env: verifiedEnv,
        fetch: vi.fn(async () =>
          Response.json({
            planId: "plus",
            orderId: "order-plus-1",
          }),
        ),
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

  it("does not start paid purchase without an entitlement endpoint", async () => {
    await expect(
      purchaseSubscriptionPlan("plus", {
        env,
        client: createMockClient(),
        timeoutMs: 100,
      }),
    ).resolves.toMatchObject({
      status: "unsupported",
      message: "구독 권한 서버가 아직 설정되지 않았어요.",
    });
  });

  it("verifies a purchased order with the server before granting the plan", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        planId: "plus",
        orderId: "order-plus-1",
        subscriptionExpiresAt: "2026-07-15T00:00:00.000Z",
      }),
    );

    const result = await purchaseSubscriptionPlan("plus", {
      env: verifiedEnv,
      fetch: fetchImpl,
      client: createMockClient(),
      timeoutMs: 100,
    });

    expect(result).toMatchObject({
      status: "purchased",
      entitlement: {
        planId: "plus",
        orderId: "order-plus-1",
        expiresAt: "2026-07-15T00:00:00.000Z",
      },
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.example.com/pictory/entitlement",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          orderId: "order-plus-1",
          expectedPlanId: "plus",
        }),
      }),
    );
  });

  it("fails the grant when server order verification fails", async () => {
    const result = await purchaseSubscriptionPlan("plus", {
      env: verifiedEnv,
      fetch: vi.fn(async () => Response.json({}, { status: 409 })),
      client: createMockClient(),
      timeoutMs: 100,
    });

    expect(result).toMatchObject({
      status: "failed",
      message:
        "결제는 완료됐지만 플랜 지급에 실패했어요. 복원을 다시 시도해주세요.",
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
        env: verifiedEnv,
        fetch: vi.fn(async () =>
          Response.json({
            planId: "plus",
            orderId: "order-plus-1",
            subscriptionExpiresAt: "2026-07-15T00:00:00.000Z",
          }),
        ),
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
      env: verifiedEnv,
      fetch: vi.fn(async () =>
        Response.json({
          planId: "pro",
          orderId: "pending-pro-1",
        }),
      ),
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
