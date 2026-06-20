import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseEnvText,
  validateProductionEnv,
} from "./check-production-env.mjs";
import { validateDeviceEvidence } from "./check-device-evidence.mjs";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

export function buildLaunchReadinessReport({
  cwd = rootDir,
  productionEnvFile = ".env.production",
  deviceEvidenceFile = "qa-evidence/device-smoke.json",
  releaseResult = runReleaseCheck(cwd),
} = {}) {
  const production = checkProductionEnv(cwd, productionEnvFile);
  const bundleEnv = checkReleaseBundleEnv(cwd, productionEnvFile);
  const device = checkDeviceEvidence(cwd, deviceEvidenceFile);
  const sections = [
    { id: "release", label: "release package", ...releaseResult },
    { id: "productionEnv", label: "production env", ...production },
    { id: "releaseBundleEnv", label: "release bundle env", ...bundleEnv },
    { id: "deviceEvidence", label: "device evidence", ...device },
  ];

  return {
    ok: sections.every((section) => section.ok),
    sections,
  };
}

export function formatLaunchReadinessReport(report) {
  const lines = [`Launch readiness: ${report.ok ? "PASSED" : "BLOCKED"}`];

  for (const section of report.sections) {
    const issues = section.issues ?? [];
    lines.push(
      `[${section.ok ? "OK" : "FAIL"}] ${section.label}: ${issues.length} issue(s)`,
    );

    for (const issue of issues) {
      lines.push(`  - ${formatIssue(issue)}`);
    }

    const hint = sectionHint(section);
    if (!section.ok && hint) {
      lines.push(`  next: ${hint}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function sectionHint(section) {
  if (section.id === "productionEnv") {
    return "run `node tools/write-production-env-draft.mjs --guide-only` and fill `.env.production` with real Toss/API/Gemini/mTLS values";
  }

  if (section.id === "deviceEvidence") {
    return "run `npm run evidence:device:draft -- --force`, follow `qa-evidence/screens/README.md`, then mark real-device scenarios passed";
  }

  if (section.id === "releaseBundleEnv") {
    return "after filling `.env.production`, run `npm run build`, `npm run snapshot:release`, and `npm run evidence:device:draft -- --force`";
  }

  return "";
}

function formatIssue(issue) {
  const requiredMatch = issue.match(/^(.+) is set$/);
  if (requiredMatch) {
    return `${requiredMatch[1]}: set the real production value`;
  }

  const placeholderMatch = issue.match(/^(.+) is not a placeholder$/);
  if (placeholderMatch) {
    return `${placeholderMatch[1]}: replace placeholder with the real production value`;
  }

  const hostMatch = issue.match(/^(.+) is not local\/example host$/);
  if (hostMatch) {
    return `${hostMatch[1]}: use the production HTTPS API host`;
  }

  if (issue === "OPENAI_API_KEY looks real") {
    return "OPENAI_API_KEY: set a real server-only OpenAI key";
  }

  if (issue === "GEMINI_API_KEY looks real") {
    return "GEMINI_API_KEY: set a real server-only Gemini key";
  }

  const bundleMatch = issue.match(/^(.+) is embedded in (.+)$/);
  if (bundleMatch) {
    return `${bundleMatch[1]}: rebuild ${bundleMatch[2]} after filling .env.production`;
  }

  if (issue === "Apps-in-Toss QR was scanned") {
    return "Apps-in-Toss QR: scan the console QR on a real Toss device";
  }

  const scenarioMatch = issue.match(/^(.+) scenario passed$/);
  if (scenarioMatch) {
    return `${scenarioMatch[1]}: mark passed after the real-device check`;
  }

  return issue;
}

export function run(argv = process.argv.slice(2), io = console) {
  const report = buildLaunchReadinessReport({
    productionEnvFile: readArg(argv, "--env") ?? ".env.production",
    deviceEvidenceFile: readArg(argv, "--device") ?? "qa-evidence/device-smoke.json",
  });

  io.log(formatLaunchReadinessReport(report).trimEnd());
  return report.ok ? 0 : 1;
}

function runReleaseCheck(cwd) {
  try {
    execFileSync(process.execPath, [resolve(cwd, "tools/check-release-readiness.mjs")], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, issues: [] };
  } catch (error) {
    const output = `${error.stdout ?? ""}\n${error.stderr ?? ""}`;
    return {
      ok: false,
      issues: collectFailures(output, "Release readiness failed"),
    };
  }
}

function checkProductionEnv(cwd, file) {
  const fullPath = resolve(cwd, file);
  if (!existsSync(fullPath)) {
    return { ok: false, issues: [`${file} is missing`] };
  }

  const result = validateProductionEnv(
    parseEnvText(readFileSync(fullPath, "utf8")),
    { cwd },
  );
  return {
    ok: result.ok,
    issues: result.failures.map((failure) => failure.message),
  };
}

const clientEnvKeys = [
  "VITE_TOSS_REWARDED_AD_GROUP_ID",
  "VITE_PICTORY_PLUS_SUBSCRIPTION_SKU",
  "VITE_PICTORY_PRO_SUBSCRIPTION_SKU",
  "VITE_PICTORY_CLASSIFY_ENDPOINT",
  "VITE_PICTORY_REWARD_ENDPOINT",
  "VITE_PICTORY_ENTITLEMENT_ENDPOINT",
  "VITE_PICTORY_DELETE_ENDPOINT",
];

const forbiddenClientBundleValues = [
  "ait-ad-test-rewarded-id",
  "replace_with_toss_rewarded_ad_group_id",
  "replace_with_toss_plus_subscription_sku",
  "replace_with_toss_pro_subscription_sku",
  "your-api.example.com",
];
const aitTarMaxBuffer = 64 * 1024 * 1024;

function checkReleaseBundleEnv(cwd, envFile) {
  const envPath = resolve(cwd, envFile);
  const distPath = resolve(cwd, "dist");
  const issues = [];

  if (!existsSync(envPath)) {
    return { ok: false, issues: [`${envFile} is missing`] };
  }

  if (!existsSync(distPath)) {
    return { ok: false, issues: ["dist client artifacts are missing"] };
  }

  const env = parseEnvText(readFileSync(envPath, "utf8"));
  const artifacts = [
    { label: "dist", text: readDistClientText(cwd) },
    { label: "pictory.ait", text: readAitClientText(cwd) },
  ];

  for (const artifact of artifacts) {
    if (!artifact.text) {
      issues.push(`${artifact.label} client artifacts are readable`);
      continue;
    }

    if (
      forbiddenClientBundleValues.some((value) => artifact.text.includes(value))
    ) {
      issues.push(`${artifact.label} contains placeholder client config`);
    }

    for (const key of clientEnvKeys) {
      const value = env.get(key)?.trim() ?? "";
      if (!value || isClientPlaceholder(value)) {
        continue;
      }

      if (!artifact.text.includes(value)) {
        issues.push(`${key} is embedded in ${artifact.label}`);
      }
    }
  }

  return { ok: issues.length === 0, issues };
}

function readDistClientText(cwd) {
  return listFiles(resolve(cwd, "dist"))
    .filter((file) => /\.(?:html|js|json)$/i.test(file))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
}

function readAitClientText(cwd) {
  const aitPath = resolve(cwd, "pictory.ait");
  if (!existsSync(aitPath)) {
    return "";
  }

  try {
    const files = execFileSync("tar", ["-tf", aitPath], {
      cwd,
      encoding: "utf8",
      maxBuffer: aitTarMaxBuffer,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split(/\r?\n/)
      .filter((file) => /\.(?:html|js|json)$/i.test(file));
    return files
      .map((file) =>
        execFileSync("tar", ["-xOf", aitPath, file], {
          cwd,
          encoding: "utf8",
          maxBuffer: aitTarMaxBuffer,
          stdio: ["ignore", "pipe", "ignore"],
        }),
      )
      .join("\n");
  } catch {
    return "";
  }
}

function listFiles(dir) {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
  });
}

function isClientPlaceholder(value) {
  return (
    value.startsWith("replace_with_") ||
    value.includes("your-api.example.com") ||
    value === "ait-ad-test-rewarded-id"
  );
}

function checkDeviceEvidence(cwd, file) {
  const fullPath = resolve(cwd, file);
  if (!existsSync(fullPath)) {
    return { ok: false, issues: [`${file} is missing`] };
  }

  try {
    const result = validateDeviceEvidence(
      JSON.parse(readFileSync(fullPath, "utf8")),
      { cwd },
    );
    return {
      ok: result.ok,
      issues: result.failures.map((failure) => failure.message),
    };
  } catch {
    return { ok: false, issues: [`${file} is not valid JSON`] };
  }
}

function collectFailures(output, fallback) {
  const failures = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("[FAIL]"))
    .map((line) => line.replace(/^\[FAIL\]\s*/, ""));

  return failures.length > 0 ? failures : [fallback];
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
