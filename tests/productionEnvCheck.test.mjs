import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  parseEnvText,
  validateProductionEnv,
} from "../tools/check-production-env.mjs";

describe("production env preflight", () => {
  it("accepts a production-like configuration with matching client/server SKUs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pictory-prod-env-"));
    await writeFile(join(dir, "client-cert.pem"), "cert");
    await writeFile(join(dir, "client-key.pem"), "key");

    const result = validateProductionEnv(
      parseEnvText(`
VITE_TOSS_REWARDED_AD_GROUP_ID=ait.prod.rewarded
VITE_PICTORY_PLUS_SUBSCRIPTION_SKU=ait.plus.monthly
VITE_PICTORY_PRO_SUBSCRIPTION_SKU=ait.pro.monthly
VITE_PICTORY_CLASSIFY_ENDPOINT=https://api.pictory.app/pictory/classify
VITE_PICTORY_REWARD_ENDPOINT=https://api.pictory.app/pictory/reward
VITE_PICTORY_ENTITLEMENT_ENDPOINT=https://api.pictory.app/pictory/entitlement
VITE_PICTORY_DELETE_ENDPOINT=https://api.pictory.app/pictory/account
PICTORY_SERVER_SECRET=${"s".repeat(40)}
PICTORY_SESSION_SECRET=${"t".repeat(40)}
PICTORY_PLUS_SUBSCRIPTION_SKU=ait.plus.monthly
PICTORY_PRO_SUBSCRIPTION_SKU=ait.pro.monthly
PICTORY_SUBSCRIPTION_VALID_DAYS=32
PICTORY_REWARD_REQUIRE_NATIVE_EVENT=true
APPS_IN_TOSS_MTLS_CERT_PATH=client-cert.pem
APPS_IN_TOSS_MTLS_KEY_PATH=client-key.pem
OPENAI_API_KEY=${"sk-" + "a".repeat(32)}
OPENAI_MODEL=gpt-4.1-mini
OPENAI_IMAGE_DETAIL=low
PICTORY_AI_FREE_MONTHLY_QUOTA=0
PICTORY_AI_AD_CREDIT_QUOTA=100
PICTORY_AI_PLUS_MONTHLY_QUOTA=500
PICTORY_AI_PRO_MONTHLY_QUOTA=2000
PICTORY_AI_DAILY_LIMIT_PER_USER=300
PICTORY_AI_DAILY_GLOBAL_LIMIT=5000
PICTORY_AI_RATE_LIMIT_PER_MINUTE=30
PICTORY_AI_LOG_RAW_IMAGES=false
`),
      { cwd: dir },
    );

    expect(result.ok).toBe(true);
  });

  it("rejects test ad ids, placeholder endpoints, and SKU mismatches", () => {
    const result = validateProductionEnv(
      parseEnvText(`
VITE_TOSS_REWARDED_AD_GROUP_ID=ait-ad-test-rewarded-id
VITE_PICTORY_PLUS_SUBSCRIPTION_SKU=client-plus
VITE_PICTORY_PRO_SUBSCRIPTION_SKU=client-pro
VITE_PICTORY_CLASSIFY_ENDPOINT=https://your-api.example.com/pictory/classify
VITE_PICTORY_REWARD_ENDPOINT=http://localhost:8787/pictory/reward
VITE_PICTORY_ENTITLEMENT_ENDPOINT=https://billing.pictory.app/pictory/entitlement
VITE_PICTORY_DELETE_ENDPOINT=https://api.pictory.app/pictory/delete
PICTORY_SERVER_SECRET=short
PICTORY_SESSION_SECRET=short
PICTORY_PLUS_SUBSCRIPTION_SKU=server-plus
PICTORY_PRO_SUBSCRIPTION_SKU=server-plus
PICTORY_SUBSCRIPTION_VALID_DAYS=0
PICTORY_REWARD_REQUIRE_NATIVE_EVENT=false
APPS_IN_TOSS_MTLS_CERT_PATH=missing-cert.pem
APPS_IN_TOSS_MTLS_KEY_PATH=missing-key.pem
OPENAI_API_KEY=replace_with_openai_api_key_server_only
OPENAI_MODEL=gpt-4.1-mini
OPENAI_IMAGE_DETAIL=high
PICTORY_AI_FREE_MONTHLY_QUOTA=1
PICTORY_AI_AD_CREDIT_QUOTA=0
PICTORY_AI_PLUS_MONTHLY_QUOTA=0
PICTORY_AI_PRO_MONTHLY_QUOTA=0
PICTORY_AI_DAILY_LIMIT_PER_USER=0
PICTORY_AI_DAILY_GLOBAL_LIMIT=0
PICTORY_AI_RATE_LIMIT_PER_MINUTE=0
PICTORY_AI_LOG_RAW_IMAGES=true
PICTORY_SKIP_RUNTIME_ENV_CHECK=true
`),
      { cwd: tmpdir() },
    );

    expect(result.ok).toBe(false);
    expect(result.failures.map((failure) => failure.message)).toEqual(
      expect.arrayContaining([
        "rewarded ad id is not the Apps-in-Toss test id",
        "VITE_PICTORY_CLASSIFY_ENDPOINT is not a placeholder",
        "VITE_PICTORY_REWARD_ENDPOINT is an HTTPS URL",
        "client and server Plus SKU match",
        "Plus and Pro SKUs differ",
        "client API endpoints share one HTTPS origin",
        "delete endpoint path is /pictory/account",
        "OPENAI_API_KEY is not a placeholder",
        "raw image logging is disabled",
        "free server AI quota is zero",
        "reward grants require native ad evidence",
        "runtime env check is not skipped",
        "APPS_IN_TOSS_MTLS_CERT_PATH file is not empty",
      ]),
    );
  });
});
