import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const scenarioIds = [
  "qr-scan",
  "photos-permission",
  "album-pick",
  "classification-tabs",
  "privacy-mask",
  "reward-ad-earned",
  "iap-purchase-grant",
  "pending-order-restore",
  "account-delete",
];
const scenarioGuide = {
  "qr-scan": "앱인토스 콘솔 테스트하기 QR을 실제 토스 앱으로 스캔한 진입 화면",
  "photos-permission": "사진 읽기 권한 요청 또는 권한 허용 후 상태 화면",
  "album-pick": "토스/OS 앨범 선택 UI에서 실제 사진을 고르는 화면",
  "classification-tabs": "실제 사진 큐레이션 뒤 홈/묶음/선별 탭 결과가 보이는 화면",
  "privacy-mask": "민감정보 후보가 흐림/확인 상태로 표시되는 화면",
  "reward-ad-earned": "보상형 광고를 끝까지 보고 AI 30장 크레딧이 지급된 화면",
  "iap-purchase-grant": "Plus/Pro 결제 후 킵앨범/월 큐레이션 한도가 반영된 화면",
  "pending-order-restore": "미결 주문 또는 복원 흐름이 권한 원장에 반영된 화면",
  "account-delete": "픽토리 데이터 삭제 후 앱 내부 기록/서버 원장이 비워진 화면",
};

export function buildDeviceEvidenceDraft({
  cwd = rootDir,
  now = () => new Date(),
  git = (args) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim(),
  aitPath = "pictory.ait",
} = {}) {
  return {
    schemaVersion: 1,
    testedAt: now().toISOString(),
    release: {
      gitCommit: safeGit(git, ["rev-parse", "--short=12", "HEAD"]),
      aitSha256: sha256File(resolve(cwd, aitPath)),
    },
    app: {
      appName: "pictory",
      consoleAppVersion: "앱인토스_콘솔_버전",
      qrGeneratedAt: now().toISOString(),
      qrScanned: false,
    },
    device: {
      os: "ios",
      osVersion: "실기기_OS_버전",
      tossAppVersion: "실기기_TOSS앱_버전",
      model: "실기기_모델명",
    },
    monetization: {
      rewardedAd: {
        adGroupId: "운영_보상형_광고_그룹_ID",
        unitType: "ai_credit",
        unitAmount: 30,
        serverGrantedCredits: 30,
        usingTestAdGroup: false,
      },
    },
    scenarios: scenarioIds.map((id) => ({
      id,
      status: "pending",
      evidenceFiles: [`qa-evidence/screens/${id}.png`],
    })),
  };
}

export function writeDeviceEvidenceDraft(
  draft,
  { outPath = resolve(rootDir, "qa-evidence/device-smoke.json"), force = false } = {},
) {
  if (existsSync(outPath) && !force) {
    throw new Error(`${outPath} already exists. Use --force to overwrite.`);
  }

  mkdirSync(dirname(outPath), { recursive: true });
  const screensDir = resolve(dirname(outPath), "screens");
  mkdirSync(screensDir, { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(draft, null, 2)}\n`, "utf8");
  writeFileSync(
    resolve(screensDir, "README.md"),
    buildScreensReadme(draft),
    "utf8",
  );
  return outPath;
}

export function run(argv = process.argv.slice(2), io = console) {
  const outArg = readArg(argv, "--out");
  const force = argv.includes("--force");
  const outPath = resolve(rootDir, outArg ?? "qa-evidence/device-smoke.json");
  const draft = buildDeviceEvidenceDraft();

  try {
    writeDeviceEvidenceDraft(draft, { outPath, force });
  } catch (error) {
    io.error(`[FAIL] ${error.message}`);
    return 1;
  }

  io.log(`draft=${outPath}`);
  io.log("Fill real console/device values, add screenshots, then mark scenarios passed.");
  return 0;
}

function buildScreensReadme(draft) {
  const lines = [
    "# 픽토리 실기기 QA 증거",
    "",
    "이 폴더에는 실제 Toss 앱 QR 테스트에서 캡처한 화면만 넣습니다.",
    "가짜/데모/로컬 브라우저 스크린샷으로는 출시 게이트를 통과시키지 않습니다.",
    "",
    "## 캡처 파일",
    "",
  ];

  for (const scenario of draft.scenarios ?? []) {
    const file = scenario.evidenceFiles?.[0] ?? `qa-evidence/screens/${scenario.id}.png`;
    lines.push(`- \`${file}\`: ${scenarioGuide[scenario.id] ?? scenario.id}`);
  }

  lines.push(
    "",
    "## JSON 수정",
    "",
    "- `qa-evidence/device-smoke.json`의 `app.consoleAppVersion`, `device.osVersion`, `device.tossAppVersion`, `device.model`을 실제 값으로 바꿉니다.",
    "- `monetization.rewardedAd.adGroupId`에는 운영 보상형 광고 그룹 ID를 넣고, 보상 단위는 `ai_credit`, 지급량은 30으로 유지합니다.",
    "- `fetchAlbumItems` 앨범 선택을 쓰므로 Toss 앱 버전은 5.261.0 이상이어야 합니다.",
    "- QR 스캔을 완료한 뒤 `app.qrScanned`를 `true`로 바꿉니다.",
    "- 각 화면을 확인하고 캡처 파일을 저장한 뒤 해당 scenario의 `status`를 `passed`로 바꿉니다.",
    "- 모든 증거에는 API 키, mTLS 경로, raw base64 이미지가 들어가면 안 됩니다.",
    "",
  );

  return `${lines.join("\n")}\n`;
}

function safeGit(git, args) {
  try {
    return git(args);
  } catch {
    return "";
  }
}

function sha256File(path) {
  if (!existsSync(path)) {
    return "";
  }

  return createHash("sha256").update(readFileSync(path)).digest("hex");
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
