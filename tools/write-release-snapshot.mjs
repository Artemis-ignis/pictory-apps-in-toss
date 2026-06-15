import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const latestOutputPath = join(rootDir, "docs", "release-snapshot.json");
const archiveDirectory = join(rootDir, "docs", "release-snapshots");

export function buildReleaseSnapshot({
  git = runGit,
  now = () => new Date(),
  repo = readGitHubRepoInfo(),
  aitPath = join(rootDir, "pictory.ait"),
} = {}) {
  return {
    schemaVersion: 1,
    generatedAt: now().toISOString(),
    release: {
      gitCommit: git(["rev-parse", "--short=12", "HEAD"]),
      branch: git(["branch", "--show-current"]),
      remote: git(["remote", "get-url", "origin"]),
      aitFile: "pictory.ait",
      aitSha256: sha256File(aitPath),
    },
    github: repo,
    requiredChecks: [
      "npm run test",
      "npm run typecheck",
      "npm run lint",
      "npm run qa:server",
      "npm run qa:server:built",
      "npm run check:production-env -- --file .env.production",
      "npm run check:device-evidence -- --file qa-evidence/device-smoke.json",
      "npm run build",
      "npm run check:privacy",
      "npm run check:release",
    ],
  };
}

export function writeReleaseSnapshot(
  snapshot = buildReleaseSnapshot(),
  {
    latestPath = latestOutputPath,
    archiveDir = archiveDirectory,
  } = {},
) {
  const payload = `${JSON.stringify(snapshot, null, 2)}\n`;
  const archivePath = getReleaseSnapshotArchivePath(snapshot, archiveDir);

  mkdirSync(dirname(latestPath), { recursive: true });
  mkdirSync(dirname(archivePath), { recursive: true });
  writeFileSync(latestPath, payload);
  writeFileSync(archivePath, payload);

  return {
    latestPath,
    archivePath,
  };
}

export function getReleaseSnapshotArchivePath(
  snapshot,
  archiveDir = archiveDirectory,
) {
  const commit = safeFileSegment(snapshot.release?.gitCommit, "unknown-commit");
  const aitSha = safeFileSegment(snapshot.release?.aitSha256, "no-ait-sha");
  return join(archiveDir, `${commit}-${aitSha.slice(0, 12)}.json`);
}

function runGit(args) {
  return execFileSync("git", args, {
    cwd: rootDir,
    encoding: "utf8",
  }).trim();
}

function readGitHubRepoInfo() {
  try {
    return JSON.parse(
      execFileSync(
        "gh",
        [
          "repo",
          "view",
          "Artemis-ignis/pictory-apps-in-toss",
          "--json",
          "nameWithOwner,visibility,isPrivate,defaultBranchRef,url,pushedAt",
        ],
        { cwd: rootDir, encoding: "utf8" },
      ),
    );
  } catch {
    return {
      nameWithOwner: "Artemis-ignis/pictory-apps-in-toss",
      visibility: "UNKNOWN",
      isPrivate: null,
    };
  }
}

function sha256File(path) {
  if (!existsSync(path)) {
    return "";
  }

  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function safeFileSegment(value, fallback) {
  const segment = String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return segment || fallback;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const paths = writeReleaseSnapshot();
  console.log(`latest=${paths.latestPath}`);
  console.log(`archive=${paths.archivePath}`);
}
