import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { scanReleasePrivacy } from "./check-release-privacy.mjs";
import { validateUploadAssets } from "./check-upload-assets.mjs";
import { requiredReleaseChecks } from "./write-release-snapshot.mjs";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const results = [];
const AIT_UNPACKED_SIZE_LIMIT_BYTES = 100 * 1024 * 1024;
const APP_FUNCTION_TABS = new Set(["home", "map", "clean", "saved"]);

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
    "PICTORY_REWARD_REQUIRE_NATIVE_EVENT",
    "PICTORY_REWARD_UNIT_TYPE",
    "APPS_IN_TOSS_MTLS_CERT_PATH",
    "APPS_IN_TOSS_MTLS_KEY_PATH",
    "PICTORY_AI_PROVIDER",
    "GEMINI_API_KEY",
    "GEMINI_MODEL",
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
    env.get("PICTORY_AI_PROVIDER") === "gemini",
    ".env.example uses Gemini as the default AI provider",
  );
  record(
    /^replace_with_/.test(env.get("GEMINI_API_KEY") ?? "") &&
      !/^AIza/.test(env.get("GEMINI_API_KEY") ?? ""),
    ".env.example Gemini key is a placeholder, not a live key",
  );
  record(
    Boolean(env.get("GEMINI_MODEL")),
    ".env.example Gemini model is explicit",
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
    env.get("PICTORY_REWARD_REQUIRE_NATIVE_EVENT") === "true",
    ".env.example requires native reward evidence",
  );
  record(
    env.get("PICTORY_REWARD_UNIT_TYPE") === "ai_credit",
    ".env.example reward unit type is ai_credit",
  );
  record(
    env.get("PICTORY_AI_AD_CREDIT_QUOTA") === "30",
    ".env.example ad reward AI credit quota is 30",
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
    "PICTORY_AI_DAILY_LIMIT_PER_USER",
    "PICTORY_AI_DAILY_GLOBAL_LIMIT",
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
    const entries = readArchiveEntries(aitPath);
    record(entries.length > 0, "pictory.ait has unpackable tar entries");
    record(
      entries.length > 0 &&
        getTarUnpackedSize(entries) <= AIT_UNPACKED_SIZE_LIMIT_BYTES,
      "pictory.ait unpacked size is at most 100MB",
    );
  }
}

function checkReleaseSnapshot() {
  const snapshotText = readText("docs/release-snapshot.json");
  if (!snapshotText) {
    return;
  }

  try {
    const snapshot = JSON.parse(snapshotText);
    const currentAitSha = sha256File(projectPath("pictory.ait"));
    const snapshotAitSha = String(snapshot.release?.aitSha256 ?? "");
    const snapshotCommit = safeFileSegment(snapshot.release?.gitCommit);
    const archivePath = projectPath(
      "docs",
      "release-snapshots",
      `${snapshotCommit}-${safeFileSegment(snapshotAitSha).slice(0, 12)}.json`,
    );

    record(snapshot.schemaVersion === 1, "release snapshot schemaVersion");
    record(Boolean(snapshot.release?.gitCommit), "release snapshot gitCommit");
    record(
      snapshotAitSha === currentAitSha,
      "release snapshot matches current pictory.ait hash",
    );
    record(existsSync(archivePath), "release snapshot archive matches latest");
    record(
      snapshot.github?.isPrivate === true ||
        snapshot.github?.visibility === "PRIVATE",
      "release snapshot records private GitHub repo",
    );
    for (const command of requiredReleaseChecks) {
      record(
        Array.isArray(snapshot.requiredChecks) &&
          snapshot.requiredChecks.includes(command),
        `release snapshot requires ${command}`,
      );
    }
  } catch {
    record(false, "docs/release-snapshot.json is valid JSON");
  }
}

function checkRuntimeFlowEvidence() {
  const evidenceText = readText("qa-evidence/runtime-flow.json");
  if (!evidenceText) {
    return;
  }

  try {
    const evidence = JSON.parse(evidenceText);
    for (const check of validateRuntimeFlowEvidence(evidence)) {
      record(check.ok, check.message);
    }
  } catch {
    record(false, "qa-evidence/runtime-flow.json is valid JSON");
  }

  const builtEvidenceText = readText("qa-evidence/built-flow.json");
  if (!builtEvidenceText) {
    return;
  }

  try {
    const evidence = JSON.parse(builtEvidenceText);
    for (const check of validateBuiltFlowEvidence(evidence)) {
      record(check.ok, check.message);
    }
  } catch {
    record(false, "qa-evidence/built-flow.json is valid JSON");
  }
}

export function validateRuntimeFlowEvidence(evidence) {
  const requiredFlowFlags = [
    "appFunctionHomeDeepLink",
    "appFunctionMapDeepLink",
    "appFunctionCleanDeepLink",
    "appFunctionSavedDeepLink",
    "homeShortcutOpened",
    "importModesReady",
    "mapCategoryFolderOpened",
    "periodFolderOpened",
    "periodFolderPreservedAcrossTabs",
    "cleanFolderOpened",
    "savedFolderOpened",
    "mapFolderActionsReady",
    "cleanFolderActionsReady",
    "savedFolderActionsReady",
    "mapPhotoDetailOpened",
    "cleanPhotoDetailOpened",
    "savedPhotoDetailOpened",
    "savedDetailHasUnsave",
    "detailProtectedMask",
    "detailPreviewRevealable",
    "photoDetailHashSynced",
    "browserBackReturnedToMapFolder",
  ];
  const navItems = evidence?.dom?.navItems ?? [];

  return [
    { ok: evidence?.ok === true, message: "runtime flow QA passed" },
    {
      ok: Number(evidence?.recentItems ?? 0) >= 20,
      message: "runtime flow QA imported at least 20 items",
    },
    {
      ok: Number(evidence?.savedIds ?? 0) >= 1,
      message: "runtime flow QA saved at least one item",
    },
    {
      ok: requiredFlowFlags.every((flag) => evidence?.flow?.[flag] === true),
      message: "runtime flow QA covers home/map/clean/saved/detail flows",
    },
    {
      ok: Number(evidence?.dom?.brokenImages ?? -1) === 0,
      message: "runtime flow QA has no broken images",
    },
    {
      ok: navItems.join(",") === "홈,분류,정리,보관",
      message: "runtime flow QA bottom navigation is complete",
    },
    {
      ok: Array.isArray(evidence?.consoleIssues) && evidence.consoleIssues.length === 0,
      message: "runtime flow QA has no browser console issues",
    },
  ];
}

export function validateBuiltFlowEvidence(evidence) {
  const requiredFlowFlags = [
    "appFunctionHomeDeepLink",
    "appFunctionMapDeepLink",
    "appFunctionCleanDeepLink",
    "appFunctionSavedDeepLink",
    "importModesReady",
    "mapFolderOpened",
    "mapPhotoDetailOpened",
    "cleanFolderOpened",
    "detailProtectedMask",
    "storedSensitivePreviewKeptPrivate",
    "savedFolderOpened",
    "savedDetailHasUnsave",
  ];
  const navItems = evidence?.dom?.navItems ?? [];

  return [
    { ok: evidence?.ok === true, message: "built web flow QA passed" },
    {
      ok: Number(evidence?.recentItems ?? 0) >= 8,
      message: "built web flow QA seeded stored classification items",
    },
    {
      ok: Number(evidence?.savedIds ?? 0) >= 1,
      message: "built web flow QA seeded saved items",
    },
    {
      ok: requiredFlowFlags.every((flag) => evidence?.flow?.[flag] === true),
      message: "built web flow QA covers built map/clean/saved/detail flows",
    },
    {
      ok: Number(evidence?.dom?.brokenImages ?? -1) === 0,
      message: "built web flow QA has no broken images",
    },
    {
      ok: navItems.join(",") === "홈,분류,정리,보관",
      message: "built web flow QA bottom navigation is complete",
    },
    {
      ok:
        Array.isArray(evidence?.consoleIssues) &&
        evidence.consoleIssues.length === 0,
      message: "built web flow QA has no browser console issues",
    },
  ];
}

function checkReleasePrivacy() {
  const result = scanReleasePrivacy({ cwd: rootDir });

  for (const check of result.checks) {
    record(check.ok, check.message);
  }

  for (const failure of result.failures) {
    record(false, failure);
  }
}

function checkUploadAssets() {
  const result = validateUploadAssets({ cwd: rootDir });
  for (const check of result.checks) {
    record(check.ok, check.message);
  }
}

function checkAppFunctions() {
  const manifestText = readText("docs/apps-in-toss-app-functions.json");
  if (!manifestText) {
    return;
  }

  try {
    const manifest = JSON.parse(manifestText);
    for (const check of validateAppFunctionManifest(manifest)) {
      record(check.ok, check.message);
    }
  } catch {
    record(false, "apps-in-toss app functions manifest is valid JSON");
  }
}

export function validateAppFunctionManifest(manifest) {
  const checks = [];
  const add = (ok, message) => checks.push({ ok, message });
  const functions = Array.isArray(manifest?.functions)
    ? manifest.functions
    : [];

  add(manifest?.schemaVersion === 1, "app functions manifest schemaVersion");
  add(manifest?.appName === "pictory", "app functions manifest appName");
  add(functions.length >= 1, "app functions manifest has at least one entry");

  for (const tab of APP_FUNCTION_TABS) {
    add(
      functions.some((entry) => entry?.targetTab === tab),
      `app functions manifest includes ${tab} entry`,
    );
  }

  const seenIds = new Set();
  for (const entry of functions) {
    const id = String(entry?.id ?? "");
    const koreanName = String(entry?.koreanName ?? "");
    const englishName = String(entry?.englishName ?? "");
    const targetTab = String(entry?.targetTab ?? "");
    const url = String(entry?.url ?? "");

    add(Boolean(id), "app function entry has id");
    add(!seenIds.has(id), `app function id is unique: ${id || "(blank)"}`);
    seenIds.add(id);
    add(
      textLength(koreanName) > 0 && textLength(koreanName) <= 10,
      `app function Korean name length is valid: ${koreanName || "(blank)"}`,
    );
    add(
      isAppFunctionText(koreanName),
      `app function Korean name has allowed characters: ${koreanName || "(blank)"}`,
    );
    add(
      textLength(englishName) > 0 && textLength(englishName) <= 15,
      `app function English name length is valid: ${englishName || "(blank)"}`,
    );
    add(
      /^[A-Z]/.test(englishName),
      `app function English name starts with uppercase: ${englishName || "(blank)"}`,
    );
    add(
      isAppFunctionText(englishName),
      `app function English name has allowed characters: ${englishName || "(blank)"}`,
    );
    add(APP_FUNCTION_TABS.has(targetTab), `app function target tab is valid: ${targetTab}`);

    try {
      const parsedUrl = new URL(url);
      add(parsedUrl.protocol === "intoss:", `app function URL uses intoss scheme: ${id}`);
      add(
        parsedUrl.hostname === "pictory",
        `app function URL host is pictory: ${id}`,
      );
      add(
        parsedUrl.searchParams.get("tab") === targetTab,
        `app function URL tab matches target: ${id}`,
      );
    } catch {
      add(false, `app function URL is parseable: ${id || "(blank)"}`);
    }
  }

  return checks;
}

function textLength(value) {
  return Array.from(value).length;
}

function isAppFunctionText(value) {
  return value.length > 0 && !/[^\p{L}\p{N} .:]/u.test(value);
}

function checkNoDemoAlbumInRelease() {
  const aitPath = projectPath("pictory.ait");
  const aitScan = readAitMembers(aitPath);
  record(
    aitScan.ok,
    "pictory.ait contents are readable for release artifact scan",
  );

  const demoFiles = listReleaseDemoAlbumArtifacts(aitScan.members);
  record(
    demoFiles.length === 0,
    "release artifacts exclude local demo album files",
  );
}

export function listReleaseDemoAlbumArtifacts(aitMembers = []) {
  const distDemoFiles = listFiles("dist").filter(isDemoAlbumPath);
  const aitDemoFiles = aitMembers
    .filter(isDemoAlbumPath)
    .map((file) => `pictory.ait:${file}`);
  return [...distDemoFiles, ...aitDemoFiles];
}

function readAitMembers(aitPath) {
  if (!existsSync(aitPath)) {
    return { ok: false, members: [] };
  }

  const entries = readArchiveEntries(aitPath);
  return {
    ok: entries.length > 0,
    members: entries.map((entry) => entry.name).filter(Boolean),
  };
}

function readArchiveEntries(archivePath) {
  try {
    return readArchiveEntriesWithTar(archivePath);
  } catch {
    try {
      return readTarEntries(readFileSync(archivePath));
    } catch {
      return [];
    }
  }
}

function readArchiveEntriesWithTar(archivePath) {
  return execFileSync("tar", ["-tvf", archivePath], {
    cwd: rootDir,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  })
    .split(/\r?\n/)
    .filter(Boolean)
    .map(parseTarListLine)
    .filter(Boolean);
}

function parseTarListLine(line) {
  const match = line.match(
    /^(\S+)\s+\d+\s+\S+\s+\S+\s+(\d+)\s+\S+\s+\S+\s+\S+\s+(.+)$/,
  );
  if (!match) {
    return null;
  }

  return {
    name: match[3],
    size: Number.parseInt(match[2], 10) || 0,
    type: match[1].startsWith("d") ? "5" : "0",
  };
}

export function readTarEntries(buffer) {
  const entries = [];
  let offset = 0;
  let pendingLongName = "";

  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    if (isZeroBlock(header)) {
      break;
    }

    const type = readTarString(header, 156, 1) || "0";
    const size = readTarOctal(header, 124, 12);
    const name = pendingLongName || readTarPath(header);
    pendingLongName = "";
    const dataOffset = offset + 512;

    if (type === "L") {
      pendingLongName = readTarString(buffer, dataOffset, size);
    } else {
      entries.push({ name, size, type, dataOffset });
    }

    offset = dataOffset + Math.ceil(size / 512) * 512;
  }

  return entries;
}

export function getTarUnpackedSize(entries) {
  return entries
    .filter((entry) => !["5", "L", "K", "x", "g"].includes(entry.type))
    .reduce((sum, entry) => sum + entry.size, 0);
}

function readTarPath(header) {
  const name = readTarString(header, 0, 100);
  const prefix = readTarString(header, 345, 155);
  return prefix ? `${prefix}/${name}` : name;
}

function readTarString(buffer, start, length) {
  return buffer
    .subarray(start, start + length)
    .toString("utf8")
    .replace(/\0.*$/, "")
    .trim();
}

function readTarOctal(buffer, start, length) {
  const text = readTarString(buffer, start, length).replace(/\s/g, "");
  const parsed = Number.parseInt(text || "0", 8);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isZeroBlock(block) {
  return block.every((byte) => byte === 0);
}

function isDemoAlbumPath(file) {
  return file.replaceAll("\\", "/").includes("/demo-album/");
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
    "check:launch",
    "check:submission",
    "server:build",
    "server:start",
    "check:release",
    "check:privacy",
    "check:upload-assets",
    "check:production-env",
    "check:device-evidence",
    "snapshot:release",
    "qa:server",
    "qa:server:built",
    "qa:flow",
    "qa:real-upload",
    "qa:flow:built",
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
    existsSync(projectPath("server", "pictoryRuntimeEnvGuard.ts")),
    "server runtime env guard exists",
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
    existsSync(projectPath("tools", "check-release-privacy.mjs")),
    "release privacy preflight exists",
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
  record(
    existsSync(projectPath("tests", "releasePrivacy.test.mjs")),
    "release privacy tests exist",
  );
  record(
    existsSync(projectPath("tests", "releaseReadiness.test.mjs")),
    "release readiness tests exist",
  );
  record(
    existsSync(projectPath("tests", "runtimeEnvGuard.test.ts")),
    "runtime env guard tests exist",
  );
}

export function run(io = console) {
  results.length = 0;
  checkEnvExample();
  checkAitBundle();
  checkGraniteConfig();
  checkPackageScripts();
  checkReleaseSnapshot();
  checkRuntimeFlowEvidence();
  checkReleasePrivacy();
  checkUploadAssets();
  checkAppFunctions();
  checkNoDemoAlbumInRelease();

  const failures = results.filter((result) => !result.ok);

  for (const result of results) {
    io.log(`${result.ok ? "[OK]" : "[FAIL]"} ${result.message}`);
  }

  if (failures.length > 0) {
    io.error(`Release readiness failed: ${failures.length} issue(s).`);
    return 1;
  }

  io.log("Release readiness passed.");
  return 0;
}

function sha256File(path) {
  if (!existsSync(path)) {
    return "";
  }

  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function safeFileSegment(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = run();
}
