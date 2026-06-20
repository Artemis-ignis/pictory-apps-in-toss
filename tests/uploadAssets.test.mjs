import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  validatePngDimensions,
  validatePngOpaqueCanvas,
  validateUploadAssets,
} from "../tools/check-upload-assets.mjs";

describe("Apps in Toss upload assets", () => {
  it("validates PNG dimensions without image dependencies", () => {
    const dir = mkdtempSync(join(tmpdir(), "pictory-upload-assets-"));
    const file = join(dir, "asset.png");

    try {
      writeFileSync(file, pngHeader(636, 1048));

      expect(validatePngDimensions(file, 636, 1048).ok).toBe(true);
      expect(validatePngDimensions(file, 1932, 828).ok).toBe(false);
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it("rejects transparent icon and thumbnail canvases", () => {
    const dir = mkdtempSync(join(tmpdir(), "pictory-upload-assets-"));
    const file = join(dir, "asset.png");

    try {
      writeFileSync(file, pngHeader(600, 600, { colorType: 6 }));

      expect(validatePngOpaqueCanvas(file).ok).toBe(false);
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it("accepts the required console upload asset set", () => {
    const dir = mkdtempSync(join(tmpdir(), "pictory-upload-assets-"));
    const assetDir = join(dir, "apps-in-toss-upload-images");

    try {
      mkdirSync(assetDir, { recursive: true });
      writeFileSync(join(assetDir, "pictory-icon.png"), pngHeader(600, 600));
      writeFileSync(join(assetDir, "썸네일.png"), pngHeader(1932, 828));
      writeFileSync(join(assetDir, "홈.png"), pngHeader(636, 1048));
      writeFileSync(join(assetDir, "지도.png"), pngHeader(636, 1048));
      writeFileSync(join(assetDir, "정리.png"), pngHeader(636, 1048));
      writeFileSync(join(assetDir, "보관.png"), pngHeader(636, 1048));

      expect(validateUploadAssets({ cwd: dir }).ok).toBe(true);
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });
});

function pngHeader(width, height, { colorType = 2 } = {}) {
  const bytes = Buffer.alloc(33);
  bytes[0] = 0x89;
  bytes.write("PNG", 1, "ascii");
  bytes[4] = 0x0d;
  bytes[5] = 0x0a;
  bytes[6] = 0x1a;
  bytes[7] = 0x0a;
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  bytes[24] = 8;
  bytes[25] = colorType;
  return bytes;
}
