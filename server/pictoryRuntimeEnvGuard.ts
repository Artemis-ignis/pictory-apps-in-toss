import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

const PLACEHOLDER_PREFIX = "replace_with_";

export function validatePictoryRuntimeEnv(
  env: Record<string, string | undefined>,
  { cwd = process.cwd() }: { cwd?: string } = {},
) {
  const issues: string[] = [];
  const value = (key: string) => env[key]?.trim() ?? "";
  const require = (condition: boolean, message: string) => {
    if (!condition) {
      issues.push(message);
    }
  };

  require(value("NODE_ENV") === "production", "NODE_ENV must be production.");
  require(
    value("PICTORY_SERVER_SECRET").length >= 32,
    "PICTORY_SERVER_SECRET must be at least 32 chars.",
  );
  require(
    value("PICTORY_SESSION_SECRET").length >= 32,
    "PICTORY_SESSION_SECRET must be at least 32 chars.",
  );
  require(
    value("PICTORY_SERVER_SECRET") !== value("PICTORY_SESSION_SECRET"),
    "PICTORY_SERVER_SECRET and PICTORY_SESSION_SECRET must differ.",
  );
  require(
    value("PICTORY_REWARD_REQUIRE_NATIVE_EVENT") === "true",
    "PICTORY_REWARD_REQUIRE_NATIVE_EVENT must be true.",
  );
  require(
    value("PICTORY_AI_FREE_MONTHLY_QUOTA") === "0",
    "PICTORY_AI_FREE_MONTHLY_QUOTA must be 0.",
  );
  require(
    value("PICTORY_AI_LOG_RAW_IMAGES") === "false",
    "PICTORY_AI_LOG_RAW_IMAGES must be false.",
  );
  require(value("OPENAI_API_KEY").startsWith("sk-"), "OPENAI_API_KEY is missing.");
  require(value("OPENAI_IMAGE_DETAIL") === "low", "OPENAI_IMAGE_DETAIL must be low.");

  for (const key of [
    "PICTORY_AI_AD_CREDIT_QUOTA",
    "PICTORY_AI_PLUS_MONTHLY_QUOTA",
    "PICTORY_AI_PRO_MONTHLY_QUOTA",
    "PICTORY_AI_DAILY_LIMIT_PER_USER",
    "PICTORY_AI_DAILY_GLOBAL_LIMIT",
    "PICTORY_AI_RATE_LIMIT_PER_MINUTE",
    "PICTORY_SUBSCRIPTION_VALID_DAYS",
  ]) {
    require(readPositiveInteger(value(key)) > 0, `${key} must be a positive integer.`);
  }

  for (const key of [
    "PICTORY_PLUS_SUBSCRIPTION_SKU",
    "PICTORY_PRO_SUBSCRIPTION_SKU",
  ]) {
    require(!isPlaceholder(value(key)), `${key} must be a real Toss SKU.`);
  }
  require(
    value("PICTORY_PLUS_SUBSCRIPTION_SKU") !==
      value("PICTORY_PRO_SUBSCRIPTION_SKU"),
    "PICTORY_PLUS_SUBSCRIPTION_SKU and PICTORY_PRO_SUBSCRIPTION_SKU must differ.",
  );

  for (const key of [
    "APPS_IN_TOSS_MTLS_CERT_PATH",
    "APPS_IN_TOSS_MTLS_KEY_PATH",
  ]) {
    require(!isPlaceholder(value(key)), `${key} must be a real file path.`);
    require(fileHasContent(resolve(cwd, value(key))), `${key} file must exist and not be empty.`);
  }
  require(
    value("APPS_IN_TOSS_MTLS_CERT_PATH") !==
      value("APPS_IN_TOSS_MTLS_KEY_PATH"),
    "APPS_IN_TOSS_MTLS_CERT_PATH and APPS_IN_TOSS_MTLS_KEY_PATH must differ.",
  );

  return { ok: issues.length === 0, issues };
}

export function assertPictoryRuntimeEnv(
  env: Record<string, string | undefined>,
  options?: { cwd?: string },
) {
  const result = validatePictoryRuntimeEnv(env, options);
  if (!result.ok) {
    throw new PictoryRuntimeEnvError(result.issues);
  }
}

export class PictoryRuntimeEnvError extends Error {
  constructor(readonly issues: string[]) {
    super(`Pictory runtime env check failed: ${issues.length} issue(s).`);
  }
}

function isPlaceholder(value: string) {
  return !value || value.startsWith(PLACEHOLDER_PREFIX) || value.includes("example.com");
}

function fileHasContent(path: string) {
  return existsSync(path) && statSync(path).size > 0;
}

function readPositiveInteger(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
