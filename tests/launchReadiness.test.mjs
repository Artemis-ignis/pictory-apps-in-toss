import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
      expect(formatted).toContain("tools/write-production-env-draft.mjs --guide-only");
      expect(formatted).toContain("qa-evidence/screens/README.md");
      expect(formatted).not.toMatch(
        /sk-[a-zA-Z0-9]{16,}|PICTORY_SERVER_SECRET=/,
      );
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it("passes when release, production env, and device evidence all pass", () => {
    const dir = mkdtempSync(join(tmpdir(), "pictory-launch-"));

    try {
      const aitBundle = writePackedAit(dir, validClientBundleText());
      writeFileSync(join(dir, "client-cert.pem"), "cert");
      writeFileSync(join(dir, "client-key.pem"), "key");
      writeFileSync(join(dir, ".env.production"), validEnvText());
      writeClientBundle(dir, validClientBundleText());
      mkdirSync(join(dir, "qa-evidence", "screens"), { recursive: true });
      for (const id of requiredIds()) {
        writeFileSync(join(dir, "qa-evidence", "screens", `${id}.png`), id);
      }
      writeFileSync(
        join(dir, "qa-evidence", "device-smoke.json"),
        JSON.stringify(validDeviceEvidence(aitBundle), null, 2),
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

  it("blocks launch when the release bundle was built with placeholder client env", () => {
    const dir = mkdtempSync(join(tmpdir(), "pictory-launch-"));

    try {
      const staleAitBundle = writePackedAit(
        dir,
        "https://your-api.example.com/pictory/classify replace_with_toss_plus_subscription_sku",
      );
      writeFileSync(join(dir, "client-cert.pem"), "cert");
      writeFileSync(join(dir, "client-key.pem"), "key");
      writeFileSync(join(dir, ".env.production"), validEnvText());
      writeClientBundle(
        dir,
        "https://your-api.example.com/pictory/classify replace_with_toss_plus_subscription_sku",
      );
      mkdirSync(join(dir, "qa-evidence", "screens"), { recursive: true });
      for (const id of requiredIds()) {
        writeFileSync(join(dir, "qa-evidence", "screens", `${id}.png`), id);
      }
      writeFileSync(
        join(dir, "qa-evidence", "device-smoke.json"),
        JSON.stringify(validDeviceEvidence(staleAitBundle), null, 2),
      );

      const report = buildLaunchReadinessReport({
        cwd: dir,
        releaseResult: { ok: true, issues: [] },
      });
      const formatted = formatLaunchReadinessReport(report);

      expect(report.ok).toBe(false);
      expect(formatted).toContain("[FAIL] release bundle env");
      expect(formatted).toContain("dist contains placeholder client config");
      expect(formatted).toContain("pictory.ait contains placeholder client config");
      expect(formatted).toContain(
        "VITE_PICTORY_CLASSIFY_ENDPOINT: rebuild dist",
      );
      expect(formatted).toContain(
        "VITE_PICTORY_CLASSIFY_ENDPOINT: rebuild pictory.ait",
      );
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it("scans packed .ait bundles even when native members exceed Node's default buffer", () => {
    const dir = mkdtempSync(join(tmpdir(), "pictory-launch-"));

    try {
      writeFileSync(join(dir, "client-cert.pem"), "cert");
      writeFileSync(join(dir, "client-key.pem"), "key");
      writeFileSync(join(dir, ".env.production"), validEnvText());
      writeClientBundle(dir, validClientBundleText());
      mkdirSync(join(dir, "ait-src", "web", "assets"), { recursive: true });
      writeFileSync(join(dir, "ait-src", "bundle.ios.js"), "x".repeat(1024 * 1024 + 1));
      writeFileSync(
        join(dir, "ait-src", "web", "assets", "app.js"),
        `${validClientBundleText()}\nreplace_with_toss_plus_subscription_sku`,
      );
      execFileSync("tar", [
        "-cf",
        join(dir, "pictory.ait"),
        "-C",
        join(dir, "ait-src"),
        "bundle.ios.js",
        "web/assets/app.js",
      ]);
      mkdirSync(join(dir, "qa-evidence", "screens"), { recursive: true });
      for (const id of requiredIds()) {
        writeFileSync(join(dir, "qa-evidence", "screens", `${id}.png`), id);
      }
      writeFileSync(
        join(dir, "qa-evidence", "device-smoke.json"),
        JSON.stringify(
          validDeviceEvidence(readFileSync(join(dir, "pictory.ait"))),
          null,
          2,
        ),
      );

      const report = buildLaunchReadinessReport({
        cwd: dir,
        releaseResult: { ok: true, issues: [] },
      });
      const releaseBundleEnv = report.sections.find(
        (section) => section.id === "releaseBundleEnv",
      );

      expect(releaseBundleEnv.issues).toContain(
        "pictory.ait contains placeholder client config",
      );
      expect(releaseBundleEnv.issues).not.toContain(
        "pictory.ait client artifacts are readable",
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
PICTORY_REWARD_UNIT_TYPE=ai_credit
APPS_IN_TOSS_MTLS_CERT_PATH=client-cert.pem
APPS_IN_TOSS_MTLS_KEY_PATH=client-key.pem
PICTORY_AI_PROVIDER=gemini
GEMINI_API_KEY=${"AIza" + "a".repeat(32)}
GEMINI_MODEL=gemini-2.5-flash-lite
OPENAI_API_KEY=${"sk-" + "a".repeat(32)}
OPENAI_MODEL=gpt-4.1-mini
OPENAI_IMAGE_DETAIL=low
PICTORY_AI_FREE_MONTHLY_QUOTA=0
PICTORY_AI_AD_CREDIT_QUOTA=30
PICTORY_AI_PLUS_MONTHLY_QUOTA=500
PICTORY_AI_PRO_MONTHLY_QUOTA=2000
PICTORY_AI_DAILY_LIMIT_PER_USER=300
PICTORY_AI_DAILY_GLOBAL_LIMIT=5000
PICTORY_AI_RATE_LIMIT_PER_MINUTE=30
PICTORY_AI_LOG_RAW_IMAGES=false
`;
}

function validClientBundleText() {
  return `
ait.prod.rewarded
ait.plus.monthly
ait.pro.monthly
https://api.pictory.app/pictory/classify
https://api.pictory.app/pictory/reward
https://api.pictory.app/pictory/entitlement
https://api.pictory.app/pictory/account
`;
}

function writeClientBundle(dir, text) {
  mkdirSync(join(dir, "dist", "assets"), { recursive: true });
  writeFileSync(join(dir, "dist", "assets", "app.js"), text);
}

function writePackedAit(dir, text) {
  const srcDir = mkdtempSync(join(dir, "ait-src-"));
  mkdirSync(join(srcDir, "web", "assets"), { recursive: true });
  writeFileSync(join(srcDir, "web", "assets", "app.js"), text);
  execFileSync("tar", [
    "-cf",
    join(dir, "pictory.ait"),
    "-C",
    srcDir,
    "web/assets/app.js",
  ]);
  return readFileSync(join(dir, "pictory.ait"));
}

function validDeviceEvidence(aitBundle = "ait-bundle") {
  return {
    schemaVersion: 1,
    testedAt: "2026-06-16T01:00:00.000Z",
    release: {
      gitCommit: "abcdef123456",
      aitSha256: createHash("sha256").update(aitBundle).digest("hex"),
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
      tossAppVersion: "5.261.0",
      model: "iPhone QA device",
    },
    monetization: {
      rewardedAd: {
        adGroupId: "ait.prod.rewarded",
        unitType: "ai_credit",
        unitAmount: 30,
        serverGrantedCredits: 30,
        usingTestAdGroup: false,
      },
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
