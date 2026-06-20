import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseEnvText,
  validateProductionEnv,
} from "../tools/check-production-env.mjs";
import {
  buildProductionEnvGuide,
  buildProductionEnvDraft,
  writeProductionEnvGuide,
  writeProductionEnvDraft,
} from "../tools/write-production-env-draft.mjs";

describe("production env draft writer", () => {
  it("generates strong local secrets while keeping external production values explicit", () => {
    const draft = buildProductionEnvDraft({
      serverSecret: "s".repeat(43),
      sessionSecret: "t".repeat(43),
    });
    const env = parseEnvText(draft);

    expect(env.has("NODE_ENV")).toBe(false);
    expect(env.get("PICTORY_SERVER_SECRET")).toHaveLength(43);
    expect(env.get("PICTORY_SESSION_SECRET")).toHaveLength(43);
    expect(env.get("PICTORY_SERVER_SECRET")).not.toBe(
      env.get("PICTORY_SESSION_SECRET"),
    );
    expect(env.get("PICTORY_AI_LOG_RAW_IMAGES")).toBe("false");
    expect(env.get("PICTORY_REWARD_REQUIRE_NATIVE_EVENT")).toBe("true");
    expect(env.get("PICTORY_REWARD_UNIT_TYPE")).toBe("ai_credit");
    expect(env.get("PICTORY_AI_FREE_MONTHLY_QUOTA")).toBe("0");
    expect(env.get("PICTORY_AI_PROVIDER")).toBe("gemini");
    expect(env.get("GEMINI_MODEL")).toBe("gemini-2.5-flash-lite");

    const result = validateProductionEnv(env, { cwd: tmpdir() });
    expect(result.ok).toBe(false);
    expect(result.failures.map((failure) => failure.message)).toEqual(
      expect.arrayContaining([
        "VITE_TOSS_REWARDED_AD_GROUP_ID is not a placeholder",
        "GEMINI_API_KEY is not a placeholder",
        "APPS_IN_TOSS_MTLS_CERT_PATH file exists",
      ]),
    );
  });

  it("writes .env.production draft without overwriting by default", () => {
    const dir = mkdtempSync(join(tmpdir(), "pictory-prod-env-draft-"));
    const outPath = join(dir, ".env.production");

    try {
      expect(writeProductionEnvDraft({ outPath })).toBe(outPath);
      expect(existsSync(outPath)).toBe(true);
      expect(existsSync(`${outPath}.README.md`)).toBe(true);
      expect(readFileSync(outPath, "utf8")).toContain(
        "VITE_PICTORY_CLASSIFY_ENDPOINT=https://your-api.example.com/pictory/classify",
      );
      expect(readFileSync(`${outPath}.README.md`, "utf8")).toContain(
        "NODE_ENV=production은 Vite가 읽는",
      );
      expect(() => writeProductionEnvDraft({ outPath })).toThrow(
        /already exists/,
      );
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it("writes a production env guide without overwriting the env file", () => {
    const dir = mkdtempSync(join(tmpdir(), "pictory-prod-env-guide-"));
    const guidePath = join(dir, ".env.production.README.md");

    try {
      const writtenPath = writeProductionEnvGuide({
        guidePath,
        envFileName: ".env.production",
      });

      expect(writtenPath).toBe(guidePath);
      const guide = readFileSync(guidePath, "utf8");
      expect(guide).toContain("VITE_TOSS_REWARDED_AD_GROUP_ID");
      expect(guide).toContain("GEMINI_API_KEY");
      expect(guide).toContain(
        "npm run check:production-env -- --file .env.production",
      );
      expect(buildProductionEnvGuide()).not.toContain("replace_with_");
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });
});
