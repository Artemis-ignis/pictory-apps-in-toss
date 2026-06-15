import { readFileSync } from "node:fs";
import { request as httpsRequest } from "node:https";
import { URL } from "node:url";

export type PictoryIapOrderStatus =
  | "PURCHASED"
  | "PAYMENT_COMPLETED"
  | "FAILED"
  | "REFUNDED"
  | "ORDER_IN_PROGRESS"
  | "NOT_FOUND"
  | "MINIAPP_MISMATCH"
  | "ERROR";

export interface PictoryIapOrderStatusResult {
  orderId: string;
  sku: string;
  statusDeterminedAt?: string;
  status: PictoryIapOrderStatus;
  reason?: string;
}

export interface PictoryIapOrderStatusContext {
  env?: Record<string, string | undefined>;
}

export type PictoryIapOrderStatusFetcher = (
  orderId: string,
  context?: PictoryIapOrderStatusContext,
) => Promise<PictoryIapOrderStatusResult>;

export class PictoryIapOrderStatusError extends Error {
  constructor(
    readonly code: "mtls_not_configured" | "request_failed" | "invalid_response",
    message: string,
  ) {
    super(message);
  }
}

export const GRANTABLE_IAP_ORDER_STATUSES = new Set<PictoryIapOrderStatus>([
  "PAYMENT_COMPLETED",
  "PURCHASED",
]);

export async function fetchAppsInTossOrderStatus(
  orderId: string,
  { env = process.env }: PictoryIapOrderStatusContext = {},
): Promise<PictoryIapOrderStatusResult> {
  const certPath = env.APPS_IN_TOSS_MTLS_CERT_PATH?.trim();
  const keyPath = env.APPS_IN_TOSS_MTLS_KEY_PATH?.trim();
  if (!certPath || !keyPath) {
    throw new PictoryIapOrderStatusError(
      "mtls_not_configured",
      "Apps-in-Toss mTLS certificate and key paths are required.",
    );
  }

  const baseUrl = env.APPS_IN_TOSS_API_BASE_URL?.trim() || "https://apps-in-toss-api.toss.im";
  const url = new URL("/api-partner/v1/apps-in-toss/order/get-order-status", baseUrl);
  const payload = JSON.stringify({ orderId });
  const response = await postMtlsJson(url, payload, {
    cert: readFileSync(certPath),
    key: readFileSync(keyPath),
  });
  const parsed = parseOrderStatusResponse(response);
  if (parsed == null) {
    throw new PictoryIapOrderStatusError(
      "invalid_response",
      "Apps-in-Toss order status response was invalid.",
    );
  }

  return parsed;
}

function postMtlsJson(
  url: URL,
  body: string,
  tls: { cert: Buffer; key: Buffer },
) {
  return new Promise<string>((resolve, reject) => {
    const request = httpsRequest(
      url,
      {
        method: "POST",
        cert: tls.cert,
        key: tls.key,
        rejectUnauthorized: true,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (response) => {
        let data = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          data += chunk;
        });
        response.on("end", () => {
          if ((response.statusCode ?? 500) >= 400) {
            reject(
              new PictoryIapOrderStatusError(
                "request_failed",
                `Apps-in-Toss order status request failed with ${response.statusCode}.`,
              ),
            );
            return;
          }

          resolve(data);
        });
      },
    );

    request.on("error", (error) => {
      reject(
        new PictoryIapOrderStatusError(
          "request_failed",
          error instanceof Error ? error.message : "Request failed.",
        ),
      );
    });
    request.write(body);
    request.end();
  });
}

function parseOrderStatusResponse(
  text: string,
): PictoryIapOrderStatusResult | null {
  try {
    const parsed = JSON.parse(text) as {
      resultType?: string;
      success?: Partial<PictoryIapOrderStatusResult>;
    };
    const success = parsed.resultType === "SUCCESS" ? parsed.success : null;
    if (
      typeof success?.orderId !== "string" ||
      typeof success.sku !== "string" ||
      !isOrderStatus(success.status)
    ) {
      return null;
    }

    return {
      orderId: success.orderId,
      sku: success.sku,
      statusDeterminedAt: success.statusDeterminedAt,
      status: success.status,
      reason: success.reason,
    };
  } catch {
    return null;
  }
}

function isOrderStatus(value: unknown): value is PictoryIapOrderStatus {
  return (
    value === "PURCHASED" ||
    value === "PAYMENT_COMPLETED" ||
    value === "FAILED" ||
    value === "REFUNDED" ||
    value === "ORDER_IN_PROGRESS" ||
    value === "NOT_FOUND" ||
    value === "MINIAPP_MISMATCH" ||
    value === "ERROR"
  );
}
