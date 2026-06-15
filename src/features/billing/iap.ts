import { IAP, type IapProductListItem } from "@apps-in-toss/web-framework";
import type {
  IapEntitlement,
  PersistedPictoryState,
  PlanId,
} from "../album/types";

type PaidPlanId = Exclude<PlanId, "free">;

interface IapEnv {
  VITE_PICTORY_PLUS_SUBSCRIPTION_SKU?: string;
  VITE_PICTORY_PRO_SUBSCRIPTION_SKU?: string;
}

export interface IapClient {
  getProductItemList: () => Promise<
    { products: IapProductListItem[] } | undefined
  >;
  createSubscriptionPurchaseOrder: (params: {
    options: {
      sku: string;
      offerId?: string | null;
      processProductGrant: (params: {
        orderId: string;
        subscriptionId?: string;
      }) => boolean | Promise<boolean>;
    };
    onEvent: (event: {
      type: string;
      data?: { orderId?: string; displayName?: string; displayAmount?: string };
    }) => void | Promise<void>;
    onError: (error: unknown) => void | Promise<void>;
  }) => () => void;
  getPendingOrders: () => Promise<
    | {
        orders: {
          orderId: string;
          sku: string;
          paymentCompletedDate?: string;
        }[];
      }
    | undefined
  >;
  completeProductGrant: (params: {
    params: { orderId: string };
  }) => Promise<boolean | undefined>;
  getSubscriptionInfo: (params: { params: { orderId: string } }) => Promise<
    | {
        subscription: {
          status: string;
          expiresAt: string | null;
          isAccessible: boolean;
        };
      }
    | undefined
  >;
}

export interface PurchasePlanOptions {
  timeoutMs?: number;
  env?: IapEnv;
  client?: IapClient;
}

export type PurchasePlanResult =
  | { status: "purchased"; entitlement: IapEntitlement }
  | { status: "missingSku"; message: string }
  | { status: "unsupported"; message: string }
  | { status: "canceled"; message: string }
  | { status: "failed"; message: string };

export type RestorePlanResult =
  | { status: "restored"; entitlement: IapEntitlement }
  | { status: "none" }
  | { status: "expired"; message: string }
  | { status: "unsupported"; message: string };

const DEFAULT_PURCHASE_TIMEOUT_MS = 30_000;

export function getConfiguredPlanSku(
  planId: PlanId,
  env: IapEnv = import.meta.env as IapEnv,
) {
  if (planId === "plus") {
    return env.VITE_PICTORY_PLUS_SUBSCRIPTION_SKU?.trim() ?? "";
  }

  if (planId === "pro") {
    return env.VITE_PICTORY_PRO_SUBSCRIPTION_SKU?.trim() ?? "";
  }

  return "";
}

export function getPlanIdBySku(
  sku: string,
  env: IapEnv = import.meta.env as IapEnv,
): PaidPlanId | null {
  if (sku === getConfiguredPlanSku("plus", env)) {
    return "plus";
  }

  if (sku === getConfiguredPlanSku("pro", env)) {
    return "pro";
  }

  return null;
}

export async function fetchIapProducts(client: IapClient = IAP) {
  try {
    return (await client.getProductItemList())?.products ?? [];
  } catch {
    return [];
  }
}

export async function purchaseSubscriptionPlan(
  planId: PaidPlanId,
  options: PurchasePlanOptions = {},
): Promise<PurchasePlanResult> {
  const env = options.env ?? (import.meta.env as IapEnv);
  const client = options.client ?? IAP;
  const sku = getConfiguredPlanSku(planId, env);

  if (!sku) {
    return {
      status: "missingSku",
      message: "앱인토스 콘솔 구독 상품 SKU가 아직 설정되지 않았어요.",
    };
  }

  const products = await fetchIapProducts(client);
  const offerId = findProductOfferId(products, sku);

  return new Promise((resolve) => {
    let cleanup: (() => void) | undefined;
    let purchasedOrder:
      | { orderId: string; subscriptionId?: string; verifiedAt: string }
      | undefined;
    let finished = false;

    const finish = (result: PurchasePlanResult) => {
      if (finished) {
        return;
      }

      finished = true;
      globalThis.clearTimeout(timerId);
      cleanup?.();
      resolve(result);
    };

    const timerId = globalThis.setTimeout(() => {
      finish({
        status: "unsupported",
        message: "현재 토스 앱 환경에서 구독 결제를 시작하지 못했어요.",
      });
    }, options.timeoutMs ?? DEFAULT_PURCHASE_TIMEOUT_MS);

    try {
      cleanup = client.createSubscriptionPurchaseOrder({
        options: {
          sku,
          offerId,
          processProductGrant: ({ orderId, subscriptionId }) => {
            purchasedOrder = {
              orderId,
              subscriptionId,
              verifiedAt: new Date().toISOString(),
            };
            return true;
          },
        },
        onEvent: (event) => {
          if (event.type !== "success") {
            return;
          }

          const orderId = event.data?.orderId ?? purchasedOrder?.orderId;
          if (!orderId) {
            finish({
              status: "failed",
              message: "결제는 완료됐지만 주문 정보를 확인하지 못했어요.",
            });
            return;
          }

          finish({
            status: "purchased",
            entitlement: {
              planId,
              sku,
              orderId,
              subscriptionId: purchasedOrder?.subscriptionId,
              verifiedAt:
                purchasedOrder?.verifiedAt ?? new Date().toISOString(),
              status: "PURCHASED",
            },
          });
        },
        onError: (error) => finish(classifyPurchaseError(error)),
      });
    } catch (error) {
      finish(classifyPurchaseError(error));
    }
  });
}

export async function restoreIapEntitlement(
  state: PersistedPictoryState,
  options: PurchasePlanOptions = {},
): Promise<RestorePlanResult> {
  const env = options.env ?? (import.meta.env as IapEnv);
  const client = options.client ?? IAP;

  try {
    const stored = state.iapEntitlement;
    if (stored?.orderId != null) {
      const subscription = (
        await client.getSubscriptionInfo({
          params: { orderId: stored.orderId },
        })
      )?.subscription;

      if (subscription?.isAccessible === true) {
        return {
          status: "restored",
          entitlement: {
            ...stored,
            verifiedAt: new Date().toISOString(),
            expiresAt: subscription.expiresAt,
            status: subscription.status,
          },
        };
      }

      if (subscription != null) {
        return {
          status: "expired",
          message: "구독 권한이 만료되었거나 접근할 수 없어요.",
        };
      }
    }

    const pendingOrders = (await client.getPendingOrders())?.orders ?? [];
    const pendingOrder = pendingOrders
      .map((order) => ({
        order,
        planId: getPlanIdBySku(order.sku, env),
      }))
      .find(({ planId }) => planId != null);

    if (pendingOrder?.planId == null) {
      return { status: "none" };
    }

    await client.completeProductGrant({
      params: { orderId: pendingOrder.order.orderId },
    });

    return {
      status: "restored",
      entitlement: {
        planId: pendingOrder.planId,
        sku: pendingOrder.order.sku,
        orderId: pendingOrder.order.orderId,
        verifiedAt: new Date().toISOString(),
        status: "PAYMENT_COMPLETED",
      },
    };
  } catch {
    return {
      status: "unsupported",
      message: "현재 환경에서 인앱결제 권한을 복원하지 못했어요.",
    };
  }
}

function findProductOfferId(products: IapProductListItem[], sku: string) {
  const product = products.find((item) => item.sku === sku);
  if (product?.type !== "SUBSCRIPTION") {
    return null;
  }

  return product.offers?.[0]?.offerId ?? null;
}

function classifyPurchaseError(error: unknown): PurchasePlanResult {
  const code =
    typeof error === "object" && error != null && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";

  if (code === "USER_CANCELED") {
    return {
      status: "canceled",
      message: "결제가 취소되었어요.",
    };
  }

  if (code === "PRODUCT_NOT_GRANTED_BY_PARTNER") {
    return {
      status: "failed",
      message:
        "결제는 완료됐지만 플랜 지급에 실패했어요. 복원을 다시 시도해주세요.",
    };
  }

  return {
    status: "failed",
    message: "결제를 완료하지 못했어요. 잠시 후 다시 시도해주세요.",
  };
}
