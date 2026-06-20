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
PICTORY_REWARD_UNIT_TYPE=ai_credit
APPS_IN_TOSS_MTLS_CERT_PATH=replace_with_server_only_mtls_cert_path
APPS_IN_TOSS_MTLS_KEY_PATH=replace_with_server_only_mtls_key_path
PICTORY_AI_PROVIDER=gemini
GEMINI_API_KEY=replace_with_gemini_api_key_server_only
GEMINI_MODEL=gemini-2.5-flash-lite
OPENAI_API_KEY=replace_with_openai_api_key_server_only
OPENAI_MODEL=gpt-4.1-mini
OPENAI_IMAGE_DETAIL=low
PICTORY_AI_FREE_MONTHLY_QUOTA=0
PICTORY_AI_AD_CREDIT_QUOTA=30
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
  guidePath = `${outPath}.README.md`,
} = {}) {
  if (existsSync(outPath) && !force) {
    throw new Error(`${outPath} already exists. Use --force to overwrite.`);
  }

  writeFileSync(outPath, draft, "utf8");
  writeProductionEnvGuide({ guidePath, envFileName: outPath });
  return outPath;
}

export function buildProductionEnvGuide({
  envFileName = ".env.production",
} = {}) {
  return `# 픽토리 운영 환경값 채우기

이 파일은 ${envFileName}에 실제 값을 넣을 때 보는 로컬 안내서입니다.
API 키, mTLS 인증서 경로, 서버 secret 값을 이 문서에 적지 마세요.

## 클라이언트 공개값

- VITE_TOSS_REWARDED_AD_GROUP_ID: 앱인토스 콘솔의 운영 보상형 광고 그룹 ID
- VITE_PICTORY_PLUS_SUBSCRIPTION_SKU: 앱인토스 콘솔의 Plus 구독 SKU
- VITE_PICTORY_PRO_SUBSCRIPTION_SKU: 앱인토스 콘솔의 Pro 구독 SKU
- VITE_PICTORY_CLASSIFY_ENDPOINT: https://<운영 API 호스트>/pictory/classify
- VITE_PICTORY_REWARD_ENDPOINT: https://<운영 API 호스트>/pictory/reward
- VITE_PICTORY_ENTITLEMENT_ENDPOINT: https://<운영 API 호스트>/pictory/entitlement
- VITE_PICTORY_DELETE_ENDPOINT: https://<운영 API 호스트>/pictory/account

네 endpoint는 같은 HTTPS origin을 사용해야 합니다.

## 서버 전용값

- PICTORY_SERVER_SECRET, PICTORY_SESSION_SECRET: 서로 다른 32자 이상 랜덤 값
- PICTORY_PLUS_SUBSCRIPTION_SKU, PICTORY_PRO_SUBSCRIPTION_SKU: 클라이언트 SKU와 동일한 값
- PICTORY_REWARD_UNIT_TYPE: 앱인토스 보상형 광고 콘솔의 보상 단위. 픽토리는 ai_credit을 사용
- APPS_IN_TOSS_MTLS_CERT_PATH, APPS_IN_TOSS_MTLS_KEY_PATH: 운영 서버에서 읽을 수 있는 실제 mTLS 인증서/키 파일 경로
- PICTORY_AI_PROVIDER: 기본값 gemini
- GEMINI_API_KEY: 서버 환경에만 저장하는 실제 Gemini API 키
- GEMINI_MODEL: gemini-2.5-flash-lite

NODE_ENV=production은 Vite가 읽는 ${envFileName}에 넣지 말고 실제 서버 프로세스 환경에서 설정하세요.

## 확인 명령

\`\`\`powershell
npm run check:production-env -- --file ${envFileName}
npm run check:launch
\`\`\`
`;
}

export function writeProductionEnvGuide({
  guidePath = resolve(rootDir, ".env.production.README.md"),
  envFileName = ".env.production",
} = {}) {
  writeFileSync(guidePath, buildProductionEnvGuide({ envFileName }), "utf8");
  return guidePath;
}

export function run(argv = process.argv.slice(2), io = console) {
  const outArg = readArg(argv, "--out");
  const force = argv.includes("--force");
  const guideOnly = argv.includes("--guide-only");
  const outPath = resolve(rootDir, outArg ?? ".env.production");
  const guidePath = `${outPath}.README.md`;

  if (guideOnly) {
    writeProductionEnvGuide({ guidePath, envFileName: outPath });
    io.log(`guide=${guidePath}`);
    return 0;
  }

  try {
    writeProductionEnvDraft({ outPath, force });
  } catch (error) {
    io.error(`[FAIL] ${error.message}`);
    return 1;
  }

  io.log(`draft=${outPath}`);
  io.log(`guide=${guidePath}`);
  io.log(
    "Generated random server/session secrets. Replace Toss, API, AI provider, and mTLS placeholders before production.",
  );
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
