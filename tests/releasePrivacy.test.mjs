import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scanReleasePrivacy } from "../tools/check-release-privacy.mjs";

async function makeReleaseArtifacts(files) {
  const dir = await mkdtemp(join(tmpdir(), "pictory-release-privacy-"));

  for (const [file, content] of Object.entries(files)) {
    const fullPath = join(dir, file);
    await mkdir(join(fullPath, ".."), { recursive: true });
    await writeFile(fullPath, content);
  }

  return dir;
}

describe("release privacy scan", () => {
  it("allows server env names in the server bundle but not in client artifacts", async () => {
    const dir = await makeReleaseArtifacts({
      "pictory.ait": "client bundle",
      "dist/app.js": "const publicValue = 'ok';",
      "dist-server/runtime.js":
        'const apiKey = process.env.GEMINI_API_KEY; value("PICTORY_SERVER_SECRET");',
    });

    const result = scanReleasePrivacy({ cwd: dir });

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("blocks server env references from client artifacts", async () => {
    const dir = await makeReleaseArtifacts({
      "pictory.ait": "client bundle",
      "dist/app.js": "console.log('GEMINI_API_KEY');",
      "dist-server/runtime.js": "process.env.GEMINI_API_KEY",
    });

    const result = scanReleasePrivacy({ cwd: dir });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain(
      "server-only env name in client artifact: dist/app.js",
    );
  });

  it("blocks live key and dotenv-style secret values in release artifacts", async () => {
    const dir = await makeReleaseArtifacts({
      "pictory.ait": "client bundle",
      "dist/app.js": "const publicValue = 'ok';",
      "dist-server/runtime.js": `GEMINI_API_KEY=AIza${"a".repeat(32)}`,
    });

    const result = scanReleasePrivacy({ cwd: dir });

    expect(result.ok).toBe(false);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        "live Gemini API key: dist-server/runtime.js",
        "server-only env assignment: dist-server/runtime.js",
      ]),
    );
    expect(JSON.stringify(result.failures)).not.toContain(`AIza${"a".repeat(32)}`);
  });

  it("scans text files packaged inside the .ait upload artifact", async () => {
    const dir = await makeReleaseArtifacts({
      "dist/app.js": "const publicValue = 'ok';",
      "dist-server/runtime.js": "const publicValue = 'ok';",
    });
    await mkdir(join(dir, "ait-src", "web", "assets"), { recursive: true });
    await writeFile(join(dir, "ait-src", "bundle.ios.js"), "x".repeat(1024 * 1024 + 1));
    await writeFile(
      join(dir, "ait-src", "web", "assets", "app.js"),
      "console.log('GEMINI_API_KEY')",
    );
    execFileSync("tar", [
      "-cf",
      join(dir, "pictory.ait"),
      "-C",
      join(dir, "ait-src"),
      "bundle.ios.js",
      "web/assets/app.js",
    ]);

    const result = scanReleasePrivacy({ cwd: dir });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain(
      "server-only env name in client artifact: pictory.ait:web/assets/app.js",
    );
  });
});
