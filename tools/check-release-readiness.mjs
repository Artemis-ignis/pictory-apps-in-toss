import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const results = [];

function projectPath(...segments) {
  return join(rootDir, ...segments);
}

function record(ok, message) {
  results.push({ ok, message });
}

function readText(relativePath) {
  const fullPath = projectPath(relativePath);
  if (!existsSync(fullPath)) {
    record(false, `${relativePath} is missing`);
    return "";
  }

  return readFileSync(fullPath, "utf8");
}

function parseEnvExample() {
  const envText = readText(".env.example");
  const env = new Map();

  for (const line of envText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) {
      env.set(match[1], match[2].trim());
    }
  }

  return env;
}

function checkEnvExample() {
  const env = parseEnvExample();
  const requiredClientEnv = [
    "VITE_TOSS_REWARDED_AD_GROUP_ID",
    "VITE_PICTORY_PLUS_SUBSCRIPTION_SKU",
    "VITE_PICTORY_PRO_SUBSCRIPTION_SKU",
    "VITE_PICTORY_CLASSIFY_ENDPOINT",
    "VITE_PICTORY_REWARD_ENDPOINT",
    "VITE_PICTORY_ENTITLEMENT_ENDPOINT",
    "VITE_PICTORY_DELETE_ENDPOINT",
  ];
  const requiredServerEnv = [
    "PICTORY_SERVER_SECRET",
    "PICTORY_SESSION_SECRET",
    "PICTORY_PLUS_SUBSCRIPTION_SKU",
    "PICTORY_PRO_SUBSCRIPTION_SKU",
    "PICTORY_SUBSCRIPTION_VALID_DAYS",
    "APPS_IN_TOSS_MTLS_CERT_PATH",
    "APPS_IN_TOSS_MTLS_KEY_PATH",
    "OPENAI_API_KEY",
    "OPENAI_MODEL",
    "OPENAI_IMAGE_DETAIL",
    "PICTORY_AI_FREE_MONTHLY_QUOTA",
    "PICTORY_AI_AD_CREDIT_QUOTA",
    "PICTORY_AI_PLUS_MONTHLY_QUOTA",
    "PICTORY_AI_PRO_MONTHLY_QUOTA",
    "PICTORY_AI_RATE_LIMIT_PER_MINUTE",
    "PICTORY_AI_LOG_RAW_IMAGES",
  ];

  for (const key of [...requiredClientEnv, ...requiredServerEnv]) {
    const value = env.get(key);
    record(Boolean(value), `.env.example contains ${key}`);
  }

  record(
    env.get("VITE_TOSS_REWARDED_AD_GROUP_ID") === "ait-ad-test-rewarded-id",
    ".env.example uses the Apps in Toss test ad id by default",
  );
  record(
    /your-api\.example\.com/.test(
      env.get("VITE_PICTORY_CLASSIFY_ENDPOINT") ?? "",
    ),
    ".env.example classify endpoint is a placeholder URL",
  );
  record(
    /your-api\.example\.com/.test(
      env.get("VITE_PICTORY_REWARD_ENDPOINT") ?? "",
    ),
    ".env.example reward endpoint is a placeholder URL",
  );
  record(
    /your-api\.example\.com/.test(
      env.get("VITE_PICTORY_ENTITLEMENT_ENDPOINT") ?? "",
    ),
    ".env.example entitlement endpoint is a placeholder URL",
  );
  record(
    /your-api\.example\.com/.test(
      env.get("VITE_PICTORY_DELETE_ENDPOINT") ?? "",
    ),
    ".env.example delete endpoint is a placeholder URL",
  );
  record(
    /^replace_with_/.test(env.get("PICTORY_SERVER_SECRET") ?? ""),
    ".env.example server secret is a placeholder",
  );
  record(
    /^replace_with_/.test(env.get("PICTORY_SESSION_SECRET") ?? ""),
    ".env.example session secret is a placeholder",
  );
  record(
    /^replace_with_/.test(env.get("PICTORY_PLUS_SUBSCRIPTION_SKU") ?? ""),
    ".env.example plus SKU is a placeholder",
  );
  record(
    /^replace_with_/.test(env.get("PICTORY_PRO_SUBSCRIPTION_SKU") ?? ""),
    ".env.example pro SKU is a placeholder",
  );
  record(
    /^replace_with_/.test(env.get("APPS_IN_TOSS_MTLS_CERT_PATH") ?? ""),
    ".env.example mTLS cert path is a placeholder",
  );
  record(
    /^replace_with_/.test(env.get("APPS_IN_TOSS_MTLS_KEY_PATH") ?? ""),
    ".env.example mTLS key path is a placeholder",
  );
  record(
    /^replace_with_/.test(env.get("OPENAI_API_KEY") ?? "") &&
      !/^sk-/.test(env.get("OPENAI_API_KEY") ?? ""),
    ".env.example OpenAI key is a placeholder, not a live key",
  );
  record(
    env.get("PICTORY_AI_LOG_RAW_IMAGES") === "false",
    ".env.example keeps raw image logging disabled",
  );
  record(
    ["low", "auto", "high"].includes(env.get("OPENAI_IMAGE_DETAIL") ?? ""),
    ".env.example OpenAI image detail is explicit",
  );

  for (const key of [
    "PICTORY_AI_FREE_MONTHLY_QUOTA",
    "PICTORY_AI_AD_CREDIT_QUOTA",
    "PICTORY_AI_PLUS_MONTHLY_QUOTA",
    "PICTORY_AI_PRO_MONTHLY_QUOTA",
    "PICTORY_AI_RATE_LIMIT_PER_MINUTE",
    "PICTORY_SUBSCRIPTION_VALID_DAYS",
  ]) {
    record(/^\d+$/.test(env.get(key) ?? ""), `.env.example ${key} is numeric`);
  }
}

function checkAitBundle() {
  const aitPath = projectPath("pictory.ait");
  record(existsSync(aitPath), "pictory.ait exists");

  if (existsSync(aitPath)) {
    record(statSync(aitPath).size > 0, "pictory.ait is not empty");
  }
}

function checkGraniteConfig() {
  const graniteConfig = readText("granite.config.ts");
  const graniteApp = readText(".granite/app.json");

  const requiredPatterns = [
    ["granite.config.ts appName", /appName:\s*["']pictory["']/],
    [
      "granite.config.ts brand.displayName",
      /brand:\s*{[\s\S]*displayName:\s*["'][^"']+["']/,
    ],
    [
      "granite.config.ts brand.primaryColor",
      /brand:\s*{[\s\S]*primaryColor:\s*["']#[0-9a-fA-F]{6}["']/,
    ],
    ["granite.config.ts brand.icon", /brand:\s*{[\s\S]*icon:\s*["'][^"']+["']/],
    ["granite.config.ts web host", /web:\s*{[\s\S]*host:\s*["'][^"']+["']/],
    ["granite.config.ts web port", /web:\s*{[\s\S]*port:\s*\d+/],
    [
      "granite.config.ts web dev command",
      /commands:\s*{[\s\S]*dev:\s*["'][^"']+["']/,
    ],
    [
      "granite.config.ts web build command",
      /commands:\s*{[\s\S]*build:\s*["'][^"']+["']/,
    ],
    [
      "granite.config.ts webViewProps.type",
      /webViewProps:\s*{[\s\S]*type:\s*["'][^"']+["']/,
    ],
    [
      "granite.config.ts photos read permission",
      /permissions:\s*\[[\s\S]*name:\s*["']photos["'][\s\S]*access:\s*["']read["']/,
    ],
    ["granite.config.ts outdir", /outdir:\s*["']dist["']/],
  ];

  for (const [label, pattern] of requiredPatterns) {
    record(pattern.test(graniteConfig), label);
  }

  try {
    const app = JSON.parse(graniteApp);
    record(app.appName === "pictory", ".granite/app.json appName");
    record(
      Array.isArray(app.permissions) &&
        app.permissions.some(
          (permission) =>
            permission.name === "photos" && permission.access === "read",
        ),
      ".granite/app.json photos read permission",
    );
  } catch {
    record(false, ".granite/app.json is valid JSON");
  }
}

function listFiles(relativePath) {
  const fullPath = projectPath(relativePath);
  if (!existsSync(fullPath)) {
    return [];
  }

  return readdirSync(fullPath, { withFileTypes: true }).flatMap((entry) => {
    const childPath = join(relativePath, entry.name);
    return entry.isDirectory() ? listFiles(childPath) : [childPath];
  });
}

function checkPackageScripts() {
  const packageJson = JSON.parse(readText("package.json"));
  const scripts = packageJson.scripts ?? {};

  for (const scriptName of [
    "test",
    "typecheck",
    "lint",
    "build",
    "server:build",
    "server:start",
    "check:release",
    "check:production-env",
    "check:device-evidence",
    "snapshot:release",
    "qa:server",
    "qa:server:built",
  ]) {
    record(
      Boolean(scripts[scriptName]),
      `package.json has ${scriptName} script`,
    );
  }

  record(
    listFiles("tests").some((file) => /\.test\.[cm]?[jt]sx?$/.test(file)),
    "tests directory contains test files",
  );
  record(
    existsSync(projectPath("server", "pictoryUsageLedger.ts")),
    "server usage ledger exists",
  );
  record(
    existsSync(projectPath("server", "pictoryHttpAdapter.ts")),
    "server classify HTTP adapter exists",
  );
  record(
    existsSync(projectPath("server", "pictoryRewardHttpAdapter.ts")),
    "server reward HTTP adapter exists",
  );
  record(
    existsSync(projectPath("server", "pictoryAccountHttpAdapter.ts")),
    "server account HTTP adapter exists",
  );
  record(
    existsSync(projectPath("server", "pictoryEntitlementHttpAdapter.ts")),
    "server entitlement HTTP adapter exists",
  );
  record(
    existsSync(projectPath("server", "pictoryIapOrderStatus.ts")),
    "server IAP order status verifier exists",
  );
  record(
    existsSync(projectPath("server", "pictoryNodeRuntime.ts")),
    "server Node runtime exists",
  );
  record(
    existsSync(projectPath("server", "pictoryFileUsageStore.ts")),
    "server file usage store exists",
  );
  record(
    existsSync(projectPath("server", "pictorySessionAuth.ts")),
    "server session auth helper exists",
  );
  record(
    existsSync(projectPath("tools", "qa-built-server.mjs")),
    "built server smoke QA exists",
  );
  record(
    existsSync(projectPath("tools", "check-production-env.mjs")),
    "production env preflight exists",
  );
  record(
    existsSync(projectPath("tools", "check-device-evidence.mjs")),
    "device evidence preflight exists",
  );
  record(
    existsSync(projectPath("tools", "write-release-snapshot.mjs")),
    "release snapshot writer exists",
  );
  record(
    listFiles("docs/release-snapshots").some((file) => /\.json$/.test(file)),
    "release snapshot archive exists",
  );
  record(
    existsSync(projectPath("tests", "httpAdapter.test.ts")),
    "server classify HTTP adapter tests exist",
  );
  record(
    existsSync(projectPath("tests", "rewardHttpAdapter.test.ts")),
    "server reward HTTP adapter tests exist",
  );
  record(
    existsSync(projectPath("tests", "accountHttpAdapter.test.ts")),
    "server account HTTP adapter tests exist",
  );
  record(
    existsSync(projectPath("tests", "entitlementHttpAdapter.test.ts")),
    "server entitlement HTTP adapter tests exist",
  );
  record(
    existsSync(projectPath("tests", "pictorySessionAuth.test.ts")),
    "server session auth tests exist",
  );
  record(
    existsSync(projectPath("tests", "usageLedger.test.ts")),
    "server usage ledger tests exist",
  );
  record(
    existsSync(projectPath("tests", "nodeRuntime.test.ts")),
    "server Node runtime tests exist",
  );
  record(
    existsSync(projectPath("tests", "fileUsageStore.test.ts")),
    "server file usage store tests exist",
  );
  record(
    existsSync(projectPath("tests", "productionEnvCheck.test.mjs")),
    "production env preflight tests exist",
  );
  record(
    existsSync(projectPath("tests", "deviceEvidenceCheck.test.mjs")),
    "device evidence preflight tests exist",
  );
  record(
    existsSync(projectPath("tests", "releaseSnapshot.test.mjs")),
    "release snapshot tests exist",
  );
}

checkEnvExample();
checkAitBundle();
checkGraniteConfig();
checkPackageScripts();

const failures = results.filter((result) => !result.ok);

for (const result of results) {
  console.log(`${result.ok ? "[OK]" : "[FAIL]"} ${result.message}`);
}

if (failures.length > 0) {
  console.error(`Release readiness failed: ${failures.length} issue(s).`);
  process.exitCode = 1;
} else {
  console.log("Release readiness passed.");
}
