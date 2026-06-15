import type { ImageSignals } from "./types";

const EMPTY_SIGNALS: ImageSignals = {
  width: 1,
  height: 1,
  aspectRatio: 1,
  brightness: 0.5,
  saturation: 0.3,
  edgeDensity: 0,
  textLineScore: 0,
  colorVariance: 0,
  perceptualHash: "",
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

  return calculateSignals(pixels, sampleWidth, sampleHeight, width, height);
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

  return {
    width: originalWidth,
    height: originalHeight,
    aspectRatio: originalWidth / originalHeight,
    brightness: clamp01(brightnessTotal / pixelCount),
    saturation: clamp01(saturationTotal / pixelCount),
    edgeDensity: comparisons === 0 ? 0 : clamp01(edgeHits / comparisons),
    textLineScore: clamp01(denseRows / sampleHeight),
    colorVariance: clamp01(varianceTotal / (pixelCount * 2)),
    perceptualHash: buildPerceptualHash(lumas, sampleWidth, sampleHeight),
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

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}
