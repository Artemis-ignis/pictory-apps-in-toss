import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

const requiredAssets = [
  ["apps-in-toss-upload-images/pictory-icon.png", 600, 600, true],
  ["apps-in-toss-upload-images/썸네일.png", 1932, 828, true],
  ["apps-in-toss-upload-images/홈.png", 636, 1048, false],
  ["apps-in-toss-upload-images/지도.png", 636, 1048, false],
  ["apps-in-toss-upload-images/정리.png", 636, 1048, false],
  ["apps-in-toss-upload-images/보관.png", 636, 1048, false],
];

export function validateUploadAssets({ cwd = rootDir } = {}) {
  const checks = [];
  const failures = [];

  for (const [file, width, height, requireOpaqueCanvas] of requiredAssets) {
    const path = join(cwd, file);
    const dimensionResult = validatePngDimensions(path, width, height);
    checks.push({ ok: dimensionResult.ok, message: dimensionResult.message });
    if (!dimensionResult.ok) {
      failures.push(dimensionResult.message);
      continue;
    }

    if (requireOpaqueCanvas) {
      const canvasResult = validatePngOpaqueCanvas(path);
      checks.push({ ok: canvasResult.ok, message: canvasResult.message });
      if (!canvasResult.ok) {
        failures.push(canvasResult.message);
      }
    }
  }

  return {
    ok: failures.length === 0,
    checks,
    failures,
  };
}

export function validatePngDimensions(path, expectedWidth, expectedHeight) {
  if (!existsSync(path)) {
    return { ok: false, message: `${path} exists` };
  }

  const bytes = readFileSync(path);
  if (!isPng(bytes)) {
    return { ok: false, message: `${path} is a PNG file` };
  }

  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  return {
    ok: width === expectedWidth && height === expectedHeight,
    message: `${path} is ${expectedWidth}x${expectedHeight}`,
  };
}

export function validatePngOpaqueCanvas(path) {
  if (!existsSync(path)) {
    return { ok: false, message: `${path} exists` };
  }

  const bytes = readFileSync(path);
  if (!isPng(bytes)) {
    return { ok: false, message: `${path} is a PNG file` };
  }

  const colorType = bytes[25];
  if (colorType === 4 || colorType === 6) {
    return { ok: false, message: `${path} has no alpha channel` };
  }

  if (hasChunk(bytes, "tRNS")) {
    return { ok: false, message: `${path} has no transparent PNG chunk` };
  }

  return { ok: true, message: `${path} has an opaque square canvas` };
}

function isPng(bytes) {
  return (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes.toString("ascii", 1, 4) === "PNG" &&
    bytes.toString("ascii", 12, 16) === "IHDR"
  );
}

function hasChunk(bytes, chunkName) {
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (type === chunkName) {
      return true;
    }
    offset += 12 + length;
  }
  return false;
}

export function run(io = console) {
  const result = validateUploadAssets();
  for (const check of result.checks) {
    io.log(`${check.ok ? "[OK]" : "[FAIL]"} ${check.message}`);
  }
  if (!result.ok) {
    io.error(`Upload asset check failed: ${result.failures.length} issue(s).`);
    return 1;
  }
  io.log("Upload asset check passed.");
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = run();
}
