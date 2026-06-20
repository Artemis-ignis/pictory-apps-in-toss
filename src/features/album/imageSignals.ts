import type { ImageSignals } from "./types";

const EMPTY_SIGNALS: ImageSignals = {
  width: 1,
  height: 1,
  aspectRatio: 1,
  brightness: 0.5,
  contrast: 0,
  saturation: 0.3,
  edgeDensity: 0,
  textLineScore: 0,
  colorVariance: 0,
  whiteRatio: 0,
  darkRatio: 0,
  skinToneRatio: 0,
  natureColorRatio: 0,
  blurVariance: 0,
  perceptualHash: "",
  differenceHash: "",
};

export async function analyzeImageSource(
  dataUri: string,
): Promise<ImageSignals | null> {
  if (
    !dataUri ||
    typeof window === "undefined" ||
    typeof Image === "undefined"
  ) {
    return null;
  }

  const image = new Image();
  image.decoding = "async";
  image.src = normalizeDataUri(dataUri);

  try {
    await image.decode();
  } catch {
    try {
      await new Promise<void>((resolve, reject) => {
        if (image.complete && image.naturalWidth > 0) {
          resolve();
          return;
        }

        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Image load failed"));
      });
    } catch {
      return null;
    }
  }

  const width = Math.max(1, image.naturalWidth || image.width);
  const height = Math.max(1, image.naturalHeight || image.height);
  const sampleWidth = 64;
  const sampleHeight = Math.max(1, Math.round((height / width) * sampleWidth));
  const canvas = document.createElement("canvas");
  canvas.width = sampleWidth;
  canvas.height = sampleHeight;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context == null) {
    return null;
  }

  context.drawImage(image, 0, 0, sampleWidth, sampleHeight);

  let pixels: Uint8ClampedArray;
  try {
    pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
  } catch {
    return null;
  }

  const signals = calculateSignals(
    pixels,
    sampleWidth,
    sampleHeight,
    width,
    height,
  );
  canvas.width = 0;
  canvas.height = 0;
  image.src = "";
  return signals;
}

export function calculateSignals(
  pixels: Uint8ClampedArray,
  sampleWidth: number,
  sampleHeight: number,
  originalWidth = sampleWidth,
  originalHeight = sampleHeight,
): ImageSignals {
  const lumas: number[] = [];
  const rowEdges = Array.from({ length: sampleHeight }, () => 0);
  let brightnessTotal = 0;
  let saturationTotal = 0;
  let varianceTotal = 0;
  let edgeHits = 0;
  let comparisons = 0;
  let whitePixels = 0;
  let darkPixels = 0;
  let skinTonePixels = 0;
  let natureColorPixels = 0;

  for (let y = 0; y < sampleHeight; y += 1) {
    for (let x = 0; x < sampleWidth; x += 1) {
      const index = (y * sampleWidth + x) * 4;
      const r = pixels[index] / 255;
      const g = pixels[index + 1] / 255;
      const b = pixels[index + 2] / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const saturation = max === 0 ? 0 : (max - min) / max;

      brightnessTotal += luma;
      saturationTotal += saturation;
      varianceTotal += Math.abs(r - g) + Math.abs(g - b) + Math.abs(b - r);
      lumas.push(luma);

      if (luma > 0.82 && saturation < 0.28) {
        whitePixels += 1;
      }
      if (luma < 0.18) {
        darkPixels += 1;
      }
      if (isSkinTone(r, g, b, saturation, luma)) {
        skinTonePixels += 1;
      }
      if (isNatureColor(r, g, b, saturation, luma)) {
        natureColorPixels += 1;
      }

      if (x > 0) {
        const prev = lumas[lumas.length - 2];
        const edge = Math.abs(luma - prev);
        if (edge > 0.22) {
          edgeHits += 1;
          rowEdges[y] += 1;
        }
        comparisons += 1;
      }
    }
  }

  const pixelCount = Math.max(1, sampleWidth * sampleHeight);
  const denseRows = rowEdges.filter(
    (count) => count >= sampleWidth * 0.18,
  ).length;
  const meanLuma = brightnessTotal / pixelCount;
  const lumaVariance =
    lumas.reduce((sum, value) => sum + (value - meanLuma) ** 2, 0) / pixelCount;

  return {
    width: originalWidth,
    height: originalHeight,
    aspectRatio: originalWidth / originalHeight,
    brightness: clamp01(meanLuma),
    contrast: clamp01(Math.sqrt(lumaVariance) * 2),
    saturation: clamp01(saturationTotal / pixelCount),
    edgeDensity: comparisons === 0 ? 0 : clamp01(edgeHits / comparisons),
    textLineScore: clamp01(denseRows / sampleHeight),
    colorVariance: clamp01(varianceTotal / (pixelCount * 2)),
    whiteRatio: clamp01(whitePixels / pixelCount),
    darkRatio: clamp01(darkPixels / pixelCount),
    skinToneRatio: clamp01(skinTonePixels / pixelCount),
    natureColorRatio: clamp01(natureColorPixels / pixelCount),
    blurVariance: buildBlurVariance(lumas, sampleWidth, sampleHeight),
    perceptualHash: buildPerceptualHash(lumas, sampleWidth, sampleHeight),
    differenceHash: buildDifferenceHash(lumas, sampleWidth, sampleHeight),
  };
}

export function normalizeDataUri(dataUri: string): string {
  if (dataUri.startsWith("data:")) {
    return dataUri;
  }

  return `data:image/jpeg;base64,${dataUri}`;
}

export function emptySignals(): ImageSignals {
  return { ...EMPTY_SIGNALS };
}

function buildPerceptualHash(
  lumas: number[],
  sampleWidth: number,
  sampleHeight: number,
) {
  const hashSize = 8;
  const cellWidth = sampleWidth / hashSize;
  const cellHeight = sampleHeight / hashSize;
  const cells: number[] = [];

  for (let cy = 0; cy < hashSize; cy += 1) {
    for (let cx = 0; cx < hashSize; cx += 1) {
      let total = 0;
      let count = 0;
      const startX = Math.floor(cx * cellWidth);
      const endX = Math.max(startX + 1, Math.floor((cx + 1) * cellWidth));
      const startY = Math.floor(cy * cellHeight);
      const endY = Math.max(startY + 1, Math.floor((cy + 1) * cellHeight));

      for (let y = startY; y < Math.min(sampleHeight, endY); y += 1) {
        for (let x = startX; x < Math.min(sampleWidth, endX); x += 1) {
          total += lumas[y * sampleWidth + x] ?? 0;
          count += 1;
        }
      }

      cells.push(count === 0 ? 0 : total / count);
    }
  }

  const average = cells.reduce((sum, value) => sum + value, 0) / cells.length;
  return cells.map((value) => (value >= average ? "1" : "0")).join("");
}

function buildDifferenceHash(
  lumas: number[],
  sampleWidth: number,
  sampleHeight: number,
) {
  const rows = 8;
  const cols = 9;
  const cellWidth = sampleWidth / cols;
  const cellHeight = sampleHeight / rows;
  const cells: number[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      cells.push(
        averageCell(
          lumas,
          sampleWidth,
          sampleHeight,
          col,
          row,
          cellWidth,
          cellHeight,
        ),
      );
    }
  }

  const bits: string[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols - 1; col += 1) {
      const index = row * cols + col;
      bits.push((cells[index] ?? 0) <= (cells[index + 1] ?? 0) ? "1" : "0");
    }
  }
  return bits.join("");
}

function buildBlurVariance(
  lumas: number[],
  sampleWidth: number,
  sampleHeight: number,
) {
  const values: number[] = [];

  for (let y = 1; y < sampleHeight - 1; y += 1) {
    for (let x = 1; x < sampleWidth - 1; x += 1) {
      const center = lumas[y * sampleWidth + x] ?? 0;
      const laplacian =
        (lumas[(y - 1) * sampleWidth + x] ?? 0) +
        (lumas[(y + 1) * sampleWidth + x] ?? 0) +
        (lumas[y * sampleWidth + x - 1] ?? 0) +
        (lumas[y * sampleWidth + x + 1] ?? 0) -
        center * 4;
      values.push(laplacian);
    }
  }

  if (values.length === 0) {
    return 0;
  }

  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
    values.length;
  return clamp01(variance * 18);
}

function averageCell(
  lumas: number[],
  sampleWidth: number,
  sampleHeight: number,
  cellX: number,
  cellY: number,
  cellWidth: number,
  cellHeight: number,
) {
  let total = 0;
  let count = 0;
  const startX = Math.floor(cellX * cellWidth);
  const endX = Math.max(startX + 1, Math.floor((cellX + 1) * cellWidth));
  const startY = Math.floor(cellY * cellHeight);
  const endY = Math.max(startY + 1, Math.floor((cellY + 1) * cellHeight));

  for (let y = startY; y < Math.min(sampleHeight, endY); y += 1) {
    for (let x = startX; x < Math.min(sampleWidth, endX); x += 1) {
      total += lumas[y * sampleWidth + x] ?? 0;
      count += 1;
    }
  }

  return count === 0 ? 0 : total / count;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function isSkinTone(
  r: number,
  g: number,
  b: number,
  saturation: number,
  luma: number,
) {
  return (
    r > 0.36 &&
    g > 0.22 &&
    b > 0.14 &&
    r > g &&
    g > b &&
    saturation > 0.12 &&
    saturation < 0.62 &&
    luma > 0.28 &&
    luma < 0.86
  );
}

function isNatureColor(
  r: number,
  g: number,
  b: number,
  saturation: number,
  luma: number,
) {
  const greenDominant = g > r * 1.04 && g > b * 0.9;
  const skyOrWater = b > r * 1.08 && b > g * 0.82;

  return (greenDominant || skyOrWater) && saturation > 0.18 && luma > 0.2;
}
