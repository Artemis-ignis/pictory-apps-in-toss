import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const MIN_TOSS_APP_VERSION = "5.247.0";
const requiredScenarioIds = [
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
const sensitivePatterns = [
  /sk-[a-zA-Z0-9]{16,}/,
  /OPENAI_API_KEY\s*=/i,
  /PICTORY_(?:SERVER|SESSION)_SECRET\s*=/i,
  /APPS_IN_TOSS_MTLS_(?:CERT|KEY)_PATH\s*=/i,
  /data:image\/[a-zA-Z+.-]+;base64,/,
];

export function validateDeviceEvidence(
  evidence,
  { cwd = rootDir, aitPath = "pictory.ait" } = {},
) {
  const checks = [];
  const add = (ok, message) => checks.push({ ok, message });
  const fileRoot = resolve(cwd);
  const aitFullPath = resolve(fileRoot, aitPath);

  add(evidence?.schemaVersion === 1, "schemaVersion is 1");
  add(isIsoDate(evidence?.testedAt), "testedAt is an ISO date");
  add(
    isNonEmptyString(evidence?.release?.gitCommit),
    "release gitCommit is recorded",
  );
  add(existsSync(aitFullPath), "pictory.ait exists for hash check");
  add(
    evidence?.release?.aitSha256 === sha256File(aitFullPath),
    "release aitSha256 matches current pictory.ait",
  );
  add(
    evidence?.app?.appName === "pictory",
    "Apps-in-Toss appName is pictory",
  );
  add(Boolean(evidence?.app?.qrScanned), "Apps-in-Toss QR was scanned");
  add(
    isNonEmptyString(evidence?.app?.consoleAppVersion),
    "console app version is recorded",
  );
  add(
    isNonEmptyString(evidence?.app?.qrGeneratedAt) &&
      isIsoDate(evidence.app.qrGeneratedAt),
    "QR generated time is recorded",
  );
  add(
    ["android", "ios"].includes(String(evidence?.device?.os).toLowerCase()),
    "device OS is android or ios",
  );
  add(
    compareVersions(evidence?.device?.tossAppVersion, MIN_TOSS_APP_VERSION) >= 0,
    `Toss app version is at least ${MIN_TOSS_APP_VERSION}`,
  );
  add(
    isNonEmptyString(evidence?.device?.model),
    "device model is recorded",
  );

  const scenarios = Array.isArray(evidence?.scenarios)
    ? evidence.scenarios
    : [];
  for (const id of requiredScenarioIds) {
    const scenario = scenarios.find((item) => item?.id === id);
    add(Boolean(scenario), `${id} scenario exists`);
    add(scenario?.status === "passed", `${id} scenario passed`);
    add(
      Array.isArray(scenario?.evidenceFiles) &&
        scenario.evidenceFiles.length > 0,
      `${id} has evidence files`,
    );
    for (const file of scenario?.evidenceFiles ?? []) {
      add(isSafeEvidenceFile(file), `${id} evidence file path is safe`);
      add(fileExists(fileRoot, file), `${id} evidence file exists: ${file}`);
    }
  }

  const rawText = JSON.stringify(evidence);
  add(
    !sensitivePatterns.some((pattern) => pattern.test(rawText)),
    "evidence JSON does not contain secrets or raw base64 images",
  );

  const failures = checks.filter((check) => !check.ok);
  return { ok: failures.length === 0, checks, failures };
}

export function run(argv = process.argv.slice(2), io = console) {
  const file = readArg(argv, "--file") ?? "qa-evidence/device-smoke.json";
  const aitPath = readArg(argv, "--ait") ?? "pictory.ait";
  const fullPath = resolve(rootDir, file);
  if (!existsSync(fullPath)) {
    io.error(`[FAIL] ${file} is missing`);
    return 1;
  }

  const evidence = JSON.parse(readFileSync(fullPath, "utf8"));
  const result = validateDeviceEvidence(evidence, {
    cwd: rootDir,
    aitPath,
  });

  for (const check of result.checks) {
    io.log(`${check.ok ? "[OK]" : "[FAIL]"} ${check.message}`);
  }

  if (!result.ok) {
    io.error(
      `Device evidence check failed: ${result.failures.length} issue(s).`,
    );
    return 1;
  }

  io.log("Device evidence check passed.");
  return 0;
}

function readArg(argv, name) {
  const index = argv.indexOf(name);
  if (index >= 0) {
    return argv[index + 1];
  }

  const inline = argv.find((arg) => arg.startsWith(`${name}=`));
  return inline?.slice(name.length + 1);
}

function isIsoDate(value) {
  return (
    typeof value === "string" &&
    value.includes("T") &&
    !Number.isNaN(new Date(value).getTime())
  );
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function sha256File(path) {
  if (!existsSync(path)) {
    return "";
  }

  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function compareVersions(value, minimum) {
  const left = parseVersion(value);
  const right = parseVersion(minimum);
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] - right[index];
    }
  }

  return 0;
}

function parseVersion(value) {
  const parts = String(value ?? "")
    .split(".")
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10));
  return [0, 1, 2].map((index) =>
    Number.isFinite(parts[index]) ? parts[index] : 0,
  );
}

function isSafeEvidenceFile(file) {
  if (!isNonEmptyString(file)) {
    return false;
  }

  const normalized = file.replaceAll("\\", "/");
  return (
    !normalized.startsWith("/") &&
    !normalized.includes("../") &&
    /\.(png|jpg|jpeg|webp|json|txt)$/i.test(normalized)
  );
}

function fileExists(root, file) {
  if (!isSafeEvidenceFile(file)) {
    return false;
  }

  const fullPath = resolve(root, file);
  return existsSync(fullPath) && statSync(fullPath).size > 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = run();
}
