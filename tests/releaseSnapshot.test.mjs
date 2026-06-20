import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildReleaseSnapshot,
  writeReleaseSnapshot,
} from "../tools/write-release-snapshot.mjs";

describe("release snapshot", () => {
  it("records the current release package metadata without secrets", () => {
    const snapshot = buildReleaseSnapshot({
      git: (args) => {
        const command = args.join(" ");
        if (command === "rev-parse --short=12 HEAD") {
          return "abcdef123456";
        }
        if (command === "branch --show-current") {
          return "main";
        }
        if (command === "remote get-url origin") {
          return "https://github.com/Artemis-ignis/pictory-apps-in-toss.git";
        }
        return "";
      },
      now: () => new Date("2026-06-16T00:00:00.000Z"),
      repo: {
        nameWithOwner: "Artemis-ignis/pictory-apps-in-toss",
        visibility: "PRIVATE",
        isPrivate: true,
      },
      aitPath: "missing.ait",
    });

    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      generatedAt: "2026-06-16T00:00:00.000Z",
      release: {
        gitCommit: "abcdef123456",
        branch: "main",
        aitFile: "pictory.ait",
      },
      github: {
        nameWithOwner: "Artemis-ignis/pictory-apps-in-toss",
        visibility: "PRIVATE",
        isPrivate: true,
      },
    });
    expect(JSON.stringify(snapshot)).not.toMatch(
      /GEMINI_API_KEY|OPENAI_API_KEY|PICTORY_SERVER_SECRET|AIza[A-Za-z0-9_-]{20,}|sk-[a-zA-Z0-9]{16,}/,
    );
    expect(snapshot.requiredChecks).toContain(
      "npm run check:device-evidence -- --file qa-evidence/device-smoke.json",
    );
    expect(snapshot.requiredChecks).toContain("npm run qa:flow");
    expect(snapshot.requiredChecks).toContain("npm run qa:real-upload");
    expect(snapshot.requiredChecks).toContain("npm run qa:flow:built");
    expect(snapshot.requiredChecks).toContain("npm run check:launch");
    expect(snapshot.requiredChecks).toContain("npm run check:submission");
  });

  it("writes a latest snapshot and a git-preservable archive snapshot", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "pictory-release-"));

    try {
      const snapshot = {
        schemaVersion: 1,
        generatedAt: "2026-06-16T00:00:00.000Z",
        release: {
          gitCommit: "ABCDEF123456",
          branch: "main",
          remote: "https://github.com/Artemis-ignis/pictory-apps-in-toss.git",
          aitFile: "pictory.ait",
          aitSha256: "1234567890abcdef",
        },
        github: {
          nameWithOwner: "Artemis-ignis/pictory-apps-in-toss",
          visibility: "PRIVATE",
          isPrivate: true,
        },
        requiredChecks: [],
      };

      const paths = writeReleaseSnapshot(snapshot, {
        latestPath: join(tempDir, "release-snapshot.json"),
        archiveDir: join(tempDir, "release-snapshots"),
      });

      expect(existsSync(paths.latestPath)).toBe(true);
      expect(existsSync(paths.archivePath)).toBe(true);
      expect(paths.archivePath.endsWith("abcdef123456-1234567890ab.json")).toBe(
        true,
      );
      expect(JSON.parse(readFileSync(paths.archivePath, "utf8"))).toMatchObject(
        snapshot,
      );
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });
});
