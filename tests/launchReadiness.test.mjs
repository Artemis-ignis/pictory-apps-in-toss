import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildLaunchReadinessReport,
  formatLaunchReadinessReport,
} from "../tools/check-launch-readiness.mjs";

describe("launch readiness preflight", () => {
  it("summarizes missing production and device gates without leaking values", () => {
    const dir = mkdtempSync(join(tmpdir(), "pictory-launch-"));

    try {
      const report = buildLaunchReadinessReport({
        cwd: dir,
        releaseResult: { ok: false, issues: ["pictory.ait is missing"] },
      });
      const formatted = formatLaunchReadinessReport(report);

      expect(report.ok).toBe(false);
      expect(formatted).toContain("Launch readiness: BLOCKED");
      expect(formatted).toContain("[FAIL] release package: 1 issue(s)");
      expect(formatted).toContain(".env.production is missing");
      expect(formatted).toContain("qa-evidence/device-smoke.json is missing");
      expect(formatted).not.toMatch(/sk-[a-zA-Z0-9]{16,}|PICTORY_SERVER_SECRET=/);
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it("passes when release, production env, and device evidence all pass", () => {
    const dir = mkdtempSync(join(tmpdir(), "pictory-launch-"));

    try {
      writeFileSync(join(dir, "pictory.ait"), "ait-bundle");
      writeFileSync(join(dir, "client-cert.pem"), "cert");
      writeFileSync(join(dir, "client-key.pem"), "key");
      writeFileSync(join(dir, ".env.production"), validEnvText());
      mkdirSync(join(dir, "qa-evidence", "screens"), { recursive: true });
      for (const id of requiredIds()) {
        writeFileSync(join(dir, "qa-evidence", "screens", `${id}.png`), id);
      }
      writeFileSync(
        join(dir, "qa-evidence", "device-smoke.json"),
        JSON.stringify(validDeviceEvidence(), null, 2),
      );

      const report = buildLaunchReadinessReport({
        cwd: dir,
        releaseResult: { ok: true, issues: [] },
      });

      expect(report.ok).toBe(true);
      expect(formatLaunchReadinessReport(report)).toContain(
        "Launch readiness: PASSED",
      );
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });
});

function validEnvText() {
  return `
VITE_TOSS_REWARDED_AD_GROUP_ID=ait.prod.rewarded
VITE_PICTORY_PLUS_SUBSCRIPTION_SKU=ait.plus.monthly
VITE_PICTORY_PRO_SUBSCRIPTION_SKU=ait.pro.monthly
VITE_PICTORY_CLASSIFY_ENDPOINT=https://api.pictory.app/pictory/classify
VITE_PICTORY_REWARD_ENDPOINT=https://api.pictory.app/pictory/reward
VITE_PICTORY_ENTITLEMENT_ENDPOINT=https://api.pictory.app/pictory/entitlement
VITE_PICTORY_DELETE_ENDPOINT=https://api.pictory.app/pictory/account
PICTORY_SERVER_SECRET=${"s".repeat(40)}
PICTORY_SESSION_SECRET=${"t".repeat(40)}
PICTORY_PLUS_SUBSCRIPTION_SKU=ait.plus.monthly
PICTORY_PRO_SUBSCRIPTION_SKU=ait.pro.monthly
PICTORY_SUBSCRIPTION_VALID_DAYS=32
PICTORY_REWARD_REQUIRE_NATIVE_EVENT=true
APPS_IN_TOSS_MTLS_CERT_PATH=client-cert.pem
APPS_IN_TOSS_MTLS_KEY_PATH=client-key.pem
OPENAI_API_KEY=${"sk-" + "a".repeat(32)}
OPENAI_MODEL=gpt-4.1-mini
OPENAI_IMAGE_DETAIL=low
PICTORY_AI_FREE_MONTHLY_QUOTA=0
PICTORY_AI_AD_CREDIT_QUOTA=100
PICTORY_AI_PLUS_MONTHLY_QUOTA=500
PICTORY_AI_PRO_MONTHLY_QUOTA=2000
PICTORY_AI_DAILY_LIMIT_PER_USER=300
PICTORY_AI_DAILY_GLOBAL_LIMIT=5000
PICTORY_AI_RATE_LIMIT_PER_MINUTE=30
PICTORY_AI_LOG_RAW_IMAGES=false
`;
}

function validDeviceEvidence() {
  return {
    schemaVersion: 1,
    testedAt: "2026-06-16T01:00:00.000Z",
    release: {
      gitCommit: "abcdef123456",
      aitSha256: createHash("sha256").update("ait-bundle").digest("hex"),
    },
    app: {
      appName: "pictory",
      consoleAppVersion: "2026.06.16-1",
      qrGeneratedAt: "2026-06-16T00:55:00.000Z",
      qrScanned: true,
    },
    device: {
      os: "ios",
      osVersion: "18.5",
      tossAppVersion: "5.247.0",
      model: "iPhone QA device",
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
