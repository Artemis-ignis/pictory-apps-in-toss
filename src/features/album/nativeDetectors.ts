type DetectorConstructor<T> = new () => {
  detect(source: CanvasImageSource): Promise<T[]>;
};

type BrowserDetectorGlobal = typeof globalThis & {
  BarcodeDetector?: DetectorConstructor<{ format?: string }>;
  FaceDetector?: DetectorConstructor<unknown>;
  TextDetector?: DetectorConstructor<unknown>;
};

export async function inferNativeDetectorHints(dataUri: string) {
  if (!canUseNativeDetectors(dataUri)) {
    return [];
  }

  const image = await loadImage(dataUri).catch(() => null);
  if (image == null) {
    return [];
  }

  const browser = globalThis as BrowserDetectorGlobal;
  const [barcodeHints, faceHints, textHints] = await Promise.all([
    detectBarcodes(browser, image),
    detectFaces(browser, image),
    detectText(browser, image),
  ]);

  return Array.from(new Set([...barcodeHints, ...faceHints, ...textHints]));
}

export function mapBarcodeFormatsToHints(formats: string[]) {
  const hints = new Set<string>();

  for (const format of formats.map((value) => value.toLowerCase())) {
    hints.add("coupon");
    hints.add("barcode");
    hints.add("쿠폰");

    if (format.includes("qr")) {
      hints.add("qr");
    }
  }

  return Array.from(hints);
}

function canUseNativeDetectors(dataUri: string) {
  return (
    Boolean(dataUri) &&
    typeof window !== "undefined" &&
    typeof Image !== "undefined"
  );
}

async function detectBarcodes(
  browser: BrowserDetectorGlobal,
  image: HTMLImageElement,
) {
  if (browser.BarcodeDetector == null) {
    return [];
  }

  try {
    const detector = new browser.BarcodeDetector();
    const codes = await detector.detect(image);
    return mapBarcodeFormatsToHints(
      codes.map((code) => code.format ?? "barcode"),
    );
  } catch {
    return [];
  }
}

async function detectFaces(
  browser: BrowserDetectorGlobal,
  image: HTMLImageElement,
) {
  if (browser.FaceDetector == null) {
    return [];
  }

  try {
    const faces = await new browser.FaceDetector().detect(image);
    return faces.length > 0 ? ["people", "person", "face", "사람"] : [];
  } catch {
    return [];
  }
}

async function detectText(
  browser: BrowserDetectorGlobal,
  image: HTMLImageElement,
) {
  if (browser.TextDetector == null) {
    return [];
  }

  try {
    const textBlocks = await new browser.TextDetector().detect(image);
    return textBlocks.length > 0 ? ["document", "screen", "문서", "캡처"] : [];
  } catch {
    return [];
  }
}

function loadImage(dataUri: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("Native detector image load failed"));
    image.src = dataUri.startsWith("data:")
      ? dataUri
      : `data:image/jpeg;base64,${dataUri}`;
  });
}
