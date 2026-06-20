import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validatePictoryRuntimeEnv } from "../server/pictoryRuntimeEnvGuard";

describe("pictory runtime env guard", () => {
  it("accepts the minimum production server environment", () => {
    const dir = mkdtempSync(join(tmpdir(), "pictory-runtime-env-"));

    try {
      writeFileSync(join(dir, "client-cert.pem"), "cert");
      writeFileSync(join(dir, "client-key.pem"), "key");

      const result = validatePictoryRuntimeEnv(validEnv(), { cwd: dir });

      expect(result.ok).toBe(true);
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it("blocks unsafe production server startup values", () => {
    const result = validatePictoryRuntimeEnv({
      ...validEnv(),
      NODE_ENV: "development",
      PICTORY_SERVER_SECRET: "short",
      PICTORY_SESSION_SECRET: "short",
      PICTORY_REWARD_REQUIRE_NATIVE_EVENT: "false",
      PICTORY_REWARD_UNIT_TYPE: "scan",
      PICTORY_AI_FREE_MONTHLY_QUOTA: "1",
      PICTORY_AI_AD_CREDIT_QUOTA: "100",
      PICTORY_AI_LOG_RAW_IMAGES: "true",
      GEMINI_API_KEY: "replace_with_gemini_api_key_server_only",
      GEMINI_MODEL: "",
      PICTORY_PLUS_SUBSCRIPTION_SKU: "replace_with_plus",
      PICTORY_PRO_SUBSCRIPTION_SKU: "replace_with_plus",
      APPS_IN_TOSS_MTLS_CERT_PATH: "replace_with_cert",
      APPS_IN_TOSS_MTLS_KEY_PATH: "replace_with_key",
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        "NODE_ENV must be production.",
        "PICTORY_SERVER_SECRET must be at least 32 chars.",
        "PICTORY_REWARD_REQUIRE_NATIVE_EVENT must be true.",
        "PICTORY_REWARD_UNIT_TYPE must be ai_credit.",
        "PICTORY_AI_FREE_MONTHLY_QUOTA must be 0.",
        "PICTORY_AI_AD_CREDIT_QUOTA must be 30.",
        "PICTORY_AI_LOG_RAW_IMAGES must be false.",
        "GEMINI_API_KEY is missing.",
        "GEMINI_MODEL is required.",
        "PICTORY_PLUS_SUBSCRIPTION_SKU must be a real Toss SKU.",
        "APPS_IN_TOSS_MTLS_CERT_PATH file must exist and not be empty.",
      ]),
    );
  });
});

function validEnv() {
  return {
    NODE_ENV: "production",
    PICTORY_SERVER_SECRET: "s".repeat(40),
    PICTORY_SESSION_SECRET: "t".repeat(40),
    PICTORY_REWARD_REQUIRE_NATIVE_EVENT: "true",
    PICTORY_REWARD_UNIT_TYPE: "ai_credit",
    PICTORY_AI_FREE_MONTHLY_QUOTA: "0",
    PICTORY_AI_LOG_RAW_IMAGES: "false",
    PICTORY_AI_PROVIDER: "gemini",
    GEMINI_API_KEY: `AIza${"a".repeat(32)}`,
    GEMINI_MODEL: "gemini-2.5-flash-lite",
    OPENAI_API_KEY: `sk-${"a".repeat(32)}`,
    OPENAI_IMAGE_DETAIL: "low",
    PICTORY_AI_AD_CREDIT_QUOTA: "30",
    PICTORY_AI_PLUS_MONTHLY_QUOTA: "500",
    PICTORY_AI_PRO_MONTHLY_QUOTA: "2000",
    PICTORY_AI_DAILY_LIMIT_PER_USER: "300",
    PICTORY_AI_DAILY_GLOBAL_LIMIT: "5000",
    PICTORY_AI_RATE_LIMIT_PER_MINUTE: "30",
    PICTORY_SUBSCRIPTION_VALID_DAYS: "32",
    PICTORY_PLUS_SUBSCRIPTION_SKU: "pictory.plus.monthly",
    PICTORY_PRO_SUBSCRIPTION_SKU: "pictory.pro.monthly",
    APPS_IN_TOSS_MTLS_CERT_PATH: "client-cert.pem",
    APPS_IN_TOSS_MTLS_KEY_PATH: "client-key.pem",
  };
}
