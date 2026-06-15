import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { validateDeviceEvidence } from "../tools/check-device-evidence.mjs";

describe("device evidence preflight", () => {
  it("accepts complete Apps-in-Toss QR device evidence", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pictory-device-evidence-"));
    await writeFile(join(dir, "pictory.ait"), "ait-bundle");
    await mkdir(join(dir, "qa-evidence", "screens"), { recursive: true });
    for (const id of requiredIds()) {
      await writeFile(join(dir, "qa-evidence", "screens", `${id}.png`), id);
    }

    const result = validateDeviceEvidence(completeEvidence(), { cwd: dir });

    expect(result.ok).toBe(true);
  });

  it("rejects missing device evidence, old Toss app versions, and raw image payloads", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pictory-device-evidence-"));
    await writeFile(join(dir, "pictory.ait"), "ait-bundle");

    const evidence = completeEvidence();
    evidence.device.tossAppVersion = "5.200.0";
    evidence.scenarios = evidence.scenarios.slice(0, 1);
    evidence.notes = "debug data:image/jpeg;base64,abc";

    const result = validateDeviceEvidence(evidence, { cwd: dir });

    expect(result.ok).toBe(false);
    expect(result.failures.map((failure) => failure.message)).toEqual(
      expect.arrayContaining([
        "Toss app version is at least 5.247.0",
        "photos-permission scenario exists",
        "evidence JSON does not contain secrets or raw base64 images",
      ]),
    );
  });

  it("rejects stale git commits and placeholder metadata", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pictory-device-evidence-"));
    await writeFile(join(dir, "pictory.ait"), "ait-bundle");
    await writeFile(join(dir, "tracked.txt"), "tracked");
    execFileSync("git", ["init"], { cwd: dir });
    execFileSync("git", ["add", "."], { cwd: dir });
    execFileSync(
      "git",
      [
        "-c",
        "user.name=Pictory QA",
        "-c",
        "user.email=pictory@example.com",
        "commit",
        "-m",
        "init",
      ],
      { cwd: dir },
    );
    await mkdir(join(dir, "qa-evidence", "screens"), { recursive: true });
    for (const id of requiredIds()) {
      await writeFile(join(dir, "qa-evidence", "screens", `${id}.png`), id);
    }

    const evidence = completeEvidence();
    evidence.release.gitCommit = "deadbeef";
    evidence.app.consoleAppVersion = "앱인토스_콘솔_버전";
    evidence.device.model = "실기기_모델명";

    const result = validateDeviceEvidence(evidence, { cwd: dir });

    expect(result.ok).toBe(false);
    expect(result.failures.map((failure) => failure.message)).toEqual(
      expect.arrayContaining([
        "release gitCommit matches current checkout",
        "console app version is not a placeholder",
        "device model is not a placeholder",
      ]),
    );
  });
});

function completeEvidence() {
  return {
    schemaVersion: 1,
    testedAt: "2026-06-15T13:05:00.000Z",
    release: {
      gitCommit: "c94b517",
      aitSha256: createHash("sha256").update("ait-bundle").digest("hex"),
    },
    app: {
      appName: "pictory",
      consoleAppVersion: "2026.06.15-1",
      qrGeneratedAt: "2026-06-15T13:00:00.000Z",
      qrScanned: true,
    },
    device: {
      os: "ios",
      osVersion: "18.5",
      tossAppVersion: "5.247.0",
      model: "iPhone test device",
    },
    scenarios: requiredIds().map((id) => ({
      id,
      status: "passed",
      evidenceFiles: [`qa-evidence/screens/${id}.png`],
    })),
  };
}

function requiredIds() {
  return [
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
}
