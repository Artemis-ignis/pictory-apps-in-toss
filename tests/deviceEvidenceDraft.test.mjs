import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateDeviceEvidence } from "../tools/check-device-evidence.mjs";
import {
  buildDeviceEvidenceDraft,
  writeDeviceEvidenceDraft,
} from "../tools/write-device-evidence-draft.mjs";

describe("device evidence draft writer", () => {
  it("prefills current release metadata without pretending device QA passed", () => {
    const dir = mkdtempSync(join(tmpdir(), "pictory-device-draft-"));

    try {
      writeFileSync(join(dir, "pictory.ait"), "ait-bundle");

      const draft = buildDeviceEvidenceDraft({
        cwd: dir,
        now: () => new Date("2026-06-16T01:00:00.000Z"),
        git: () => "abcdef123456",
      });

      expect(draft).toMatchObject({
        schemaVersion: 1,
        testedAt: "2026-06-16T01:00:00.000Z",
        release: {
          gitCommit: "abcdef123456",
          aitSha256: createHash("sha256").update("ait-bundle").digest("hex"),
        },
        app: {
          appName: "pictory",
          qrScanned: false,
        },
        monetization: {
          rewardedAd: {
            unitType: "ai_credit",
            unitAmount: 30,
            serverGrantedCredits: 30,
            usingTestAdGroup: false,
          },
        },
      });
      expect(draft.scenarios).toHaveLength(9);
      expect(draft.scenarios.every((scenario) => scenario.status === "pending")).toBe(
        true,
      );

      const result = validateDeviceEvidence(draft, { cwd: dir });
      expect(result.ok).toBe(false);
      expect(result.failures.map((failure) => failure.message)).toContain(
        "qr-scan scenario passed",
      );
      expect(result.failures.map((failure) => failure.message)).toContain(
        "rewarded ad group id is production",
      );
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it("writes the draft and creates the screenshots directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "pictory-device-draft-"));

    try {
      const outPath = join(dir, "qa-evidence", "device-smoke.json");
      const writtenPath = writeDeviceEvidenceDraft(
        buildDeviceEvidenceDraft({
          cwd: dir,
          now: () => new Date("2026-06-16T01:00:00.000Z"),
          git: () => "abcdef123456",
        }),
        { outPath },
      );

      expect(writtenPath).toBe(outPath);
      expect(existsSync(outPath)).toBe(true);
      expect(existsSync(join(dir, "qa-evidence", "screens"))).toBe(true);
      const guide = readFileSync(
        join(dir, "qa-evidence", "screens", "README.md"),
        "utf8",
      );
      expect(guide).toContain("실제 Toss 앱 QR 테스트");
      expect(guide).toContain("qa-evidence/screens/qr-scan.png");
      expect(guide).toContain("app.qrScanned");
      expect(JSON.parse(readFileSync(outPath, "utf8")).release.gitCommit).toBe(
        "abcdef123456",
      );
      expect(() =>
        writeDeviceEvidenceDraft({ schemaVersion: 1 }, { outPath }),
      ).toThrow(/already exists/);
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });
});
