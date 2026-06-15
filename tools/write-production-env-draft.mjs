import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

export function buildProductionEnvDraft({
  serverSecret = randomSecret(),
  sessionSecret = randomSecret(),
} = {}) {
  return `# 로컬 운영 후보 초안입니다. 실제 값으로 채운 뒤 서버 배포 환경에만 넣으세요.
# 이 파일은 Git에 커밋하지 않습니다.
VITE_TOSS_REWARDED_AD_GROUP_ID=replace_with_toss_rewarded_ad_group_id
VITE_PICTORY_PLUS_SUBSCRIPTION_SKU=replace_with_toss_plus_subscription_sku
VITE_PICTORY_PRO_SUBSCRIPTION_SKU=replace_with_toss_pro_subscription_sku
VITE_PICTORY_CLASSIFY_ENDPOINT=https://your-api.example.com/pictory/classify
VITE_PICTORY_REWARD_ENDPOINT=https://your-api.example.com/pictory/reward
VITE_PICTORY_ENTITLEMENT_ENDPOINT=https://your-api.example.com/pictory/entitlement
VITE_PICTORY_DELETE_ENDPOINT=https://your-api.example.com/pictory/account

PICTORY_SERVER_SECRET=${serverSecret}
PICTORY_SESSION_SECRET=${sessionSecret}
PICTORY_PLUS_SUBSCRIPTION_SKU=replace_with_toss_plus_subscription_sku
PICTORY_PRO_SUBSCRIPTION_SKU=replace_with_toss_pro_subscription_sku
PICTORY_SUBSCRIPTION_VALID_DAYS=32
PICTORY_REWARD_REQUIRE_NATIVE_EVENT=true
APPS_IN_TOSS_MTLS_CERT_PATH=replace_with_server_only_mtls_cert_path
APPS_IN_TOSS_MTLS_KEY_PATH=replace_with_server_only_mtls_key_path
OPENAI_API_KEY=replace_with_openai_api_key_server_only
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
`;
}

export function writeProductionEnvDraft({
  outPath = resolve(rootDir, ".env.production"),
  force = false,
  draft = buildProductionEnvDraft(),
} = {}) {
  if (existsSync(outPath) && !force) {
    throw new Error(`${outPath} already exists. Use --force to overwrite.`);
  }

  writeFileSync(outPath, draft, "utf8");
  return outPath;
}

export function run(argv = process.argv.slice(2), io = console) {
  const outArg = readArg(argv, "--out");
  const force = argv.includes("--force");
  const outPath = resolve(rootDir, outArg ?? ".env.production");

  try {
    writeProductionEnvDraft({ outPath, force });
  } catch (error) {
    io.error(`[FAIL] ${error.message}`);
    return 1;
  }

  io.log(`draft=${outPath}`);
  io.log("Generated random server/session secrets. Replace Toss, API, OpenAI, and mTLS placeholders before production.");
  return 0;
}

function randomSecret() {
  return randomBytes(32).toString("base64url");
}

function readArg(argv, name) {
  const index = argv.indexOf(name);
  if (index >= 0) {
    return argv[index + 1];
  }

  const inline = argv.find((arg) => arg.startsWith(`${name}=`));
  return inline?.slice(name.length + 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = run();
}
