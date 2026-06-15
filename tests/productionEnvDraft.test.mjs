import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseEnvText,
  validateProductionEnv,
} from "../tools/check-production-env.mjs";
import {
  buildProductionEnvDraft,
  writeProductionEnvDraft,
} from "../tools/write-production-env-draft.mjs";

describe("production env draft writer", () => {
  it("generates strong local secrets while keeping external production values explicit", () => {
    const draft = buildProductionEnvDraft({
      serverSecret: "s".repeat(43),
      sessionSecret: "t".repeat(43),
    });
    const env = parseEnvText(draft);

    expect(env.get("NODE_ENV")).toBe("production");
    expect(env.get("PICTORY_SERVER_SECRET")).toHaveLength(43);
    expect(env.get("PICTORY_SESSION_SECRET")).toHaveLength(43);
    expect(env.get("PICTORY_SERVER_SECRET")).not.toBe(
      env.get("PICTORY_SESSION_SECRET"),
    );
    expect(env.get("PICTORY_AI_LOG_RAW_IMAGES")).toBe("false");
    expect(env.get("PICTORY_REWARD_REQUIRE_NATIVE_EVENT")).toBe("true");
    expect(env.get("PICTORY_AI_FREE_MONTHLY_QUOTA")).toBe("0");

    const result = validateProductionEnv(env, { cwd: tmpdir() });
    expect(result.ok).toBe(false);
    expect(result.failures.map((failure) => failure.message)).toEqual(
      expect.arrayContaining([
        "VITE_TOSS_REWARDED_AD_GROUP_ID is not a placeholder",
        "OPENAI_API_KEY is not a placeholder",
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
      expect(readFileSync(outPath, "utf8")).toContain(
        "VITE_PICTORY_CLASSIFY_ENDPOINT=https://your-api.example.com/pictory/classify",
      );
      expect(() => writeProductionEnvDraft({ outPath })).toThrow(
        /already exists/,
      );
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });
});
