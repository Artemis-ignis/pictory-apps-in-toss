import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const TEST_REWARDED_AD_ID = "ait-ad-test-rewarded-id";

const requiredKeys = [
  "VITE_TOSS_REWARDED_AD_GROUP_ID",
  "VITE_PICTORY_PLUS_SUBSCRIPTION_SKU",
  "VITE_PICTORY_PRO_SUBSCRIPTION_SKU",
  "VITE_PICTORY_CLASSIFY_ENDPOINT",
  "VITE_PICTORY_REWARD_ENDPOINT",
  "VITE_PICTORY_ENTITLEMENT_ENDPOINT",
  "VITE_PICTORY_DELETE_ENDPOINT",
  "PICTORY_SERVER_SECRET",
  "PICTORY_SESSION_SECRET",
  "PICTORY_PLUS_SUBSCRIPTION_SKU",
  "PICTORY_PRO_SUBSCRIPTION_SKU",
  "PICTORY_SUBSCRIPTION_VALID_DAYS",
  "PICTORY_REWARD_REQUIRE_NATIVE_EVENT",
  "APPS_IN_TOSS_MTLS_CERT_PATH",
  "APPS_IN_TOSS_MTLS_KEY_PATH",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "OPENAI_IMAGE_DETAIL",
  "PICTORY_AI_FREE_MONTHLY_QUOTA",
  "PICTORY_AI_AD_CREDIT_QUOTA",
  "PICTORY_AI_PLUS_MONTHLY_QUOTA",
  "PICTORY_AI_PRO_MONTHLY_QUOTA",
  "PICTORY_AI_DAILY_LIMIT_PER_USER",
  "PICTORY_AI_DAILY_GLOBAL_LIMIT",
  "PICTORY_AI_RATE_LIMIT_PER_MINUTE",
  "PICTORY_AI_LOG_RAW_IMAGES",
];

const endpointKeys = [
  "VITE_PICTORY_CLASSIFY_ENDPOINT",
  "VITE_PICTORY_REWARD_ENDPOINT",
  "VITE_PICTORY_ENTITLEMENT_ENDPOINT",
  "VITE_PICTORY_DELETE_ENDPOINT",
];

export function parseEnvText(text) {
  const env = new Map();

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) {
      continue;
    }

    env.set(match[1], unquote(match[2].trim()));
  }

  return env;
}

export function validateProductionEnv(env, { cwd = rootDir } = {}) {
  const checks = [];
  const add = (ok, message) => checks.push({ ok, message });
  const value = (key) => env.get(key)?.trim() ?? "";

  for (const key of requiredKeys) {
    add(Boolean(value(key)), `${key} is set`);
  }

  for (const key of requiredKeys) {
    add(!isPlaceholder(value(key)), `${key} is not a placeholder`);
  }

  add(
    value("VITE_TOSS_REWARDED_AD_GROUP_ID") !== TEST_REWARDED_AD_ID,
    "rewarded ad id is not the Apps-in-Toss test id",
  );
  add(
    value("VITE_PICTORY_PLUS_SUBSCRIPTION_SKU") ===
      value("PICTORY_PLUS_SUBSCRIPTION_SKU"),
    "client and server Plus SKU match",
  );
  add(
    value("VITE_PICTORY_PRO_SUBSCRIPTION_SKU") ===
      value("PICTORY_PRO_SUBSCRIPTION_SKU"),
    "client and server Pro SKU match",
  );
  add(
    value("PICTORY_PLUS_SUBSCRIPTION_SKU") !==
      value("PICTORY_PRO_SUBSCRIPTION_SKU"),
    "Plus and Pro SKUs differ",
  );

  for (const key of endpointKeys) {
    const endpoint = value(key);
    add(isHttpsUrl(endpoint), `${key} is an HTTPS URL`);
    add(!hasLocalOrExampleHost(endpoint), `${key} is not local/example host`);
  }
  add(
    endpointKeys
      .map((key) => urlOrigin(value(key)))
      .every((origin) => origin && origin === urlOrigin(value(endpointKeys[0]))),
    "client API endpoints share one HTTPS origin",
  );
  add(
    endpointPath(value("VITE_PICTORY_CLASSIFY_ENDPOINT")) ===
      "/pictory/classify",
    "classify endpoint path is /pictory/classify",
  );
  add(
    endpointPath(value("VITE_PICTORY_REWARD_ENDPOINT")) === "/pictory/reward",
    "reward endpoint path is /pictory/reward",
  );
  add(
    endpointPath(value("VITE_PICTORY_ENTITLEMENT_ENDPOINT")) ===
      "/pictory/entitlement",
    "entitlement endpoint path is /pictory/entitlement",
  );
  add(
    endpointPath(value("VITE_PICTORY_DELETE_ENDPOINT")) ===
      "/pictory/account",
    "delete endpoint path is /pictory/account",
  );

  add(
    value("PICTORY_SERVER_SECRET").length >= 32,
    "PICTORY_SERVER_SECRET is at least 32 chars",
  );
  add(
    value("PICTORY_SESSION_SECRET").length >= 32,
    "PICTORY_SESSION_SECRET is at least 32 chars",
  );
  add(
    value("PICTORY_SERVER_SECRET") !== value("PICTORY_SESSION_SECRET"),
    "server and session secrets differ",
  );
  add(value("OPENAI_API_KEY").startsWith("sk-"), "OPENAI_API_KEY looks real");
  add(value("OPENAI_IMAGE_DETAIL") === "low", "OpenAI image detail stays low");
  add(
    value("PICTORY_AI_LOG_RAW_IMAGES") === "false",
    "raw image logging is disabled",
  );
  add(
    value("PICTORY_AI_FREE_MONTHLY_QUOTA") === "0",
    "free server AI quota is zero",
  );
  add(
    value("PICTORY_REWARD_REQUIRE_NATIVE_EVENT") === "true",
    "reward grants require native ad evidence",
  );

  for (const key of [
    "PICTORY_AI_AD_CREDIT_QUOTA",
    "PICTORY_AI_PLUS_MONTHLY_QUOTA",
    "PICTORY_AI_PRO_MONTHLY_QUOTA",
    "PICTORY_AI_DAILY_LIMIT_PER_USER",
    "PICTORY_AI_DAILY_GLOBAL_LIMIT",
    "PICTORY_AI_RATE_LIMIT_PER_MINUTE",
    "PICTORY_SUBSCRIPTION_VALID_DAYS",
  ]) {
    add(readPositiveInteger(value(key)) > 0, `${key} is a positive integer`);
  }

  for (const key of [
    "APPS_IN_TOSS_MTLS_CERT_PATH",
    "APPS_IN_TOSS_MTLS_KEY_PATH",
  ]) {
    const fullPath = resolve(cwd, value(key));
    add(existsSync(fullPath), `${key} file exists`);
    add(fileHasContent(fullPath), `${key} file is not empty`);
  }
  add(
    value("APPS_IN_TOSS_MTLS_CERT_PATH") !==
      value("APPS_IN_TOSS_MTLS_KEY_PATH"),
    "mTLS cert and key paths differ",
  );

  const failures = checks.filter((check) => !check.ok);
  return { ok: failures.length === 0, checks, failures };
}

export function run(argv = process.argv.slice(2), io = console) {
  const file = readFileArg(argv) ?? ".env.production";
  const fullPath = resolve(rootDir, file);
  if (!existsSync(fullPath)) {
    io.error(`[FAIL] ${file} is missing`);
    return 1;
  }

  const result = validateProductionEnv(parseEnvText(readFileSync(fullPath, "utf8")), {
    cwd: rootDir,
  });
  for (const check of result.checks) {
    io.log(`${check.ok ? "[OK]" : "[FAIL]"} ${check.message}`);
  }

  if (!result.ok) {
    io.error(
      `Production env check failed: ${result.failures.length} issue(s).`,
    );
    return 1;
  }

  io.log("Production env check passed.");
  return 0;
}

function readFileArg(argv) {
  const fileIndex = argv.indexOf("--file");
  if (fileIndex >= 0) {
    return argv[fileIndex + 1];
  }

  const inline = argv.find((arg) => arg.startsWith("--file="));
  return inline?.slice("--file=".length);
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function isPlaceholder(value) {
  return (
    !value ||
    value.startsWith("replace_with_") ||
    value.includes("your-api.example.com") ||
    value.includes("example.com")
  );
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function hasLocalOrExampleHost(value) {
  try {
    const host = new URL(value).hostname;
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".example.com") ||
      host === "example.com"
    );
  } catch {
    return true;
  }
}

function urlOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function endpointPath(value) {
  try {
    return new URL(value).pathname.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function fileHasContent(path) {
  return existsSync(path) && statSync(path).size > 0;
}

function readPositiveInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = run();
}
