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
      tossAppVersion: "5.247.0",
      model: "실기기_모델명",
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
  mkdirSync(resolve(dirname(outPath), "screens"), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(draft, null, 2)}\n`, "utf8");
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
