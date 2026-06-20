import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const DEFAULT_ARTIFACT_PATHS = ["pictory.ait", "dist", "dist-server"];
const aitTarMaxBuffer = 64 * 1024 * 1024;

const serverOnlyKeys = [
  "GEMINI_API_KEY",
  "PICTORY_GEMINI_API_KEY",
  "OPENAI_API_KEY",
  "PICTORY_OPENAI_API_KEY",
  "PICTORY_SERVER_SECRET",
  "PICTORY_SESSION_SECRET",
  "APPS_IN_TOSS_MTLS_CERT_PATH",
  "APPS_IN_TOSS_MTLS_KEY_PATH",
];

const artifactWidePatterns = [
  {
    label: "live OpenAI API key",
    pattern: /\bsk-(?!(?:placeholder|test)\b)[A-Za-z0-9_-]{20,}\b/,
  },
  {
    label: "live Gemini API key",
    pattern: /\bAIza[A-Za-z0-9_-]{20,}\b/,
  },
  {
    label: "server-only env assignment",
    pattern: new RegExp(
      `\\b(?:${serverOnlyKeys.join("|")})\\s*=\\s*[^\\s"'` + "`" + `]+`,
      "i",
    ),
  },
  {
    label: "server-only JSON env value",
    pattern: new RegExp(
      `"(?:${serverOnlyKeys.join("|")})"\\s*:\\s*"[^"]+"`,
      "i",
    ),
  },
];

const clientOnlyPatterns = [
  {
    label: "server-only env name in client artifact",
    pattern: new RegExp(`\\b(?:${serverOnlyKeys.join("|")})\\b`, "i"),
  },
];

export function scanReleasePrivacy({
  cwd = rootDir,
  artifactPaths = DEFAULT_ARTIFACT_PATHS,
} = {}) {
  const checks = [];
  const failures = [];

  for (const artifactPath of artifactPaths) {
    const files = listArtifactFiles(cwd, artifactPath);
    const exists = files.length > 0;
    checks.push({ ok: exists, message: `${artifactPath} privacy artifact exists` });

    if (!exists) {
      failures.push(`${artifactPath} is missing`);
      continue;
    }

    for (const file of files) {
      const scan = scanFile(cwd, file);
      for (const finding of scan.findings) {
        failures.push(`${finding.label}: ${finding.file ?? file}`);
      }
    }

    checks.push({
      ok: true,
      message: `${artifactPath} privacy artifact scanned (${files.length} file(s))`,
    });
  }

  checks.push({
    ok: failures.length === 0,
    message: "release artifacts contain no server secrets or client server-env references",
  });

  return {
    ok: failures.length === 0,
    checks,
    failures,
  };
}

export function run(_argv = process.argv.slice(2), io = console) {
  const result = scanReleasePrivacy();

  for (const check of result.checks) {
    io.log(`${check.ok ? "[OK]" : "[FAIL]"} ${check.message}`);
  }

  for (const failure of result.failures) {
    io.log(`[FAIL] ${failure}`);
  }

  if (result.ok) {
    io.log("Release privacy scan passed.");
    return 0;
  }

  io.error(`Release privacy scan failed: ${result.failures.length} issue(s).`);
  return 1;
}

function listArtifactFiles(cwd, artifactPath) {
  const fullPath = join(cwd, artifactPath);
  if (!existsSync(fullPath)) {
    return [];
  }

  const stats = statSync(fullPath);
  if (stats.isFile()) {
    return [normalizePath(artifactPath)];
  }

  if (!stats.isDirectory()) {
    return [];
  }

  return readdirSync(fullPath, { withFileTypes: true }).flatMap((entry) => {
    const childPath = join(artifactPath, entry.name);
    if (entry.isDirectory()) {
      return listArtifactFiles(cwd, childPath);
    }
    return [normalizePath(childPath)];
  });
}

function scanFile(cwd, file) {
  const patterns = isClientArtifact(file)
    ? [...artifactWidePatterns, ...clientOnlyPatterns]
    : artifactWidePatterns;

  if (normalizePath(file) === "pictory.ait") {
    const memberFindings = scanAitMembers(cwd, file, patterns);
    if (memberFindings.length > 0) {
      return { findings: memberFindings };
    }
  }

  const findings = scanText(readFileSync(join(cwd, file)).toString("utf8"), patterns);
  return { findings };
}

function scanText(text, patterns) {
  const findings = [];

  for (const { label, pattern } of patterns) {
    if (pattern.test(text)) {
      findings.push({ label });
    }
  }

  return findings;
}

function scanAitMembers(cwd, file, patterns) {
  const aitPath = join(cwd, file);
  try {
    const members = execFileSync("tar", ["-tf", aitPath], {
      cwd,
      encoding: "utf8",
      maxBuffer: aitTarMaxBuffer,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split(/\r?\n/)
      .filter((member) => /\.(?:html|js|json)$/i.test(member));

    return members.flatMap((member) => {
      const text = execFileSync("tar", ["-xOf", aitPath, member], {
        cwd,
        encoding: "utf8",
        maxBuffer: aitTarMaxBuffer,
        stdio: ["ignore", "pipe", "ignore"],
      });
      return scanText(text, patterns).map((finding) => ({
        ...finding,
        file: `${file}:${member}`,
      }));
    });
  } catch {
    return [];
  }
}

function isClientArtifact(file) {
  const normalized = normalizePath(file);
  return normalized === "pictory.ait" || normalized.startsWith("dist/");
}

function normalizePath(path) {
  return relative(rootDir, join(rootDir, path)).replace(/\\/g, "/");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = run();
}
