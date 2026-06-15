import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
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
  const device = checkDeviceEvidence(cwd, deviceEvidenceFile);
  const sections = [
    { id: "release", label: "release package", ...releaseResult },
    { id: "productionEnv", label: "production env", ...production },
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
  }

  return `${lines.join("\n")}\n`;
}

function formatIssue(issue) {
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
