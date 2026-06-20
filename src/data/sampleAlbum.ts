import type { AlbumItem, ImageSignals } from "../features/album/types";

const now = new Date("2026-06-15T09:00:00+09:00");

type DemoKind =
  | "receipt"
  | "document"
  | "food"
  | "place"
  | "people"
  | "coupon"
  | "dark";

const demoPhotos: Record<DemoKind, string> = {
  receipt: "/demo-album/receipt.jpg",
  document: "/demo-album/document.jpg",
  food: "/demo-album/food.jpg",
  place: "/demo-album/place.jpg",
  people: "/demo-album/people.jpg",
  coupon: "/demo-album/coupon.jpg",
  dark: "/demo-album/dark.jpg",
};

export const sampleAlbumItems: AlbumItem[] = [
  createSample("receipt-cafe", "receipt", ["receipt", "결제", "영수증"]),
  createSample("capture-bank", "document", ["screenshot", "송금", "계좌"]),
  createSample("document-contract", "document", ["document", "계약", "문서"]),
  createSample("food-menu", "food", ["food", "menu", "음식"]),
  createSample("place-trip", "place", ["travel", "place", "풍경"]),
  createSample("people-friends", "people", ["people", "portrait"]),
  createSample("sensitive-id", "document", ["주민등록", "신분증", "sensitive"]),
  createSample("capture-coupon", "coupon", ["coupon", "barcode", "screenshot"]),
  createSample("dark-room", "dark", ["dark", "low light", "memory"]),
  createSample("document-note", "document", ["document", "record"]),
  createSample("memory-trip-copy", "place", ["memory", "note", "duplicate"]),
  createSample("coupon-market", "coupon", ["coupon", "barcode", "마감"]),
  createSample("food-brunch", "food", ["food", "음식"]),
  createSample("food-dessert", "food", ["food", "카페"]),
  createSample("food-dinner", "food", ["food", "menu"]),
  createSample("food-market", "food", ["food", "마트"]),
  createSample("capture-chat", "document", ["screenshot", "chat", "캡처"]),
  createSample("capture-ticket", "coupon", ["screenshot", "ticket", "캡처"]),
  createSample("people-family", "people", ["people", "portrait"]),
  createSample("memory-daily", "people", ["memory", "note", "일상", "기록"]),
];

function createSample(id: string, photo: DemoKind, hints: string[]): AlbumItem {
  const offset = sampleAlbumItemsLengthGuess(id);
  const createdAt = new Date(now.getTime() - offset * 24 * 60 * 60 * 1000);

  return {
    id: `sample-${id}`,
    type: "PHOTO",
    source: "sample",
    createdAt: createdAt.toISOString(),
    hints,
    dataUri: demoPhotos[photo],
    signals: sampleSignals(photo, hints),
  };
}

function sampleAlbumItemsLengthGuess(id: string) {
  return (
    Array.from(id).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 100
  );
}

function sampleSignals(photo: DemoKind, hints: string[]): ImageSignals {
  if (photo === "dark") {
    return {
      width: 640,
      height: 960,
      aspectRatio: 0.67,
      brightness: 0.16,
      contrast: 0.12,
      saturation: 0.28,
      edgeDensity: 0.04,
      textLineScore: 0.02,
      colorVariance: 0.12,
      whiteRatio: 0.02,
      darkRatio: 0.72,
      skinToneRatio: 0.01,
      natureColorRatio: 0.1,
      blurVariance: 0.02,
      perceptualHash:
        "0000111100001111000011110000111100001111000011110000111100001111",
      differenceHash:
        "0001111000011110000111100001111000011110000111100001111000011110",
    };
  }

  if (photo === "food") {
    return {
      width: 960,
      height: 720,
      aspectRatio: 1.33,
      brightness: 0.58,
      contrast: 0.34,
      saturation: 0.45,
      edgeDensity: 0.06,
      textLineScore: 0.02,
      colorVariance: 0.22,
      whiteRatio: 0.04,
      darkRatio: 0.07,
      skinToneRatio: 0.12,
      natureColorRatio: 0.05,
      blurVariance: 0.28,
      perceptualHash: hashFor(photo, hints),
      differenceHash: diffHashFor(photo, hints),
    };
  }

  if (photo === "place") {
    return {
      width: 960,
      height: 720,
      aspectRatio: 1.33,
      brightness: 0.6,
      contrast: 0.3,
      saturation: 0.42,
      edgeDensity: 0.06,
      textLineScore: 0.02,
      colorVariance: 0.2,
      whiteRatio: 0.06,
      darkRatio: 0.08,
      skinToneRatio: 0.01,
      natureColorRatio: 0.45,
      blurVariance: 0.24,
      perceptualHash: hashFor(photo, hints),
      differenceHash: diffHashFor(photo, hints),
    };
  }

  if (photo === "people") {
    return {
      width: 720,
      height: 960,
      aspectRatio: 0.75,
      brightness: 0.62,
      contrast: 0.28,
      saturation: 0.4,
      edgeDensity: 0.06,
      textLineScore: 0.02,
      colorVariance: 0.18,
      whiteRatio: 0.08,
      darkRatio: 0.05,
      skinToneRatio: 0.2,
      natureColorRatio: 0.04,
      blurVariance: 0.26,
      perceptualHash: hashFor(photo, hints),
      differenceHash: diffHashFor(photo, hints),
    };
  }

  if (photo === "coupon") {
    return {
      width: 1200,
      height: 720,
      aspectRatio: 1.67,
      brightness: 0.74,
      contrast: 0.42,
      saturation: 0.4,
      edgeDensity: 0.22,
      textLineScore: 0.2,
      colorVariance: 0.2,
      whiteRatio: 0.3,
      darkRatio: 0.05,
      skinToneRatio: 0.02,
      natureColorRatio: 0.04,
      blurVariance: 0.32,
      perceptualHash: hashFor(photo, hints),
      differenceHash: diffHashFor(photo, hints),
    };
  }

  return {
    width: 720,
    height: 960,
    aspectRatio: 0.75,
    brightness: photo === "receipt" ? 0.7 : 0.84,
    contrast: 0.32,
    saturation: photo === "receipt" ? 0.2 : 0.16,
    edgeDensity: 0.28,
    textLineScore: 0.32,
    colorVariance: 0.12,
    whiteRatio: photo === "receipt" ? 0.52 : 0.68,
    darkRatio: 0.02,
    skinToneRatio: 0.01,
    natureColorRatio: 0.04,
    blurVariance: 0.3,
    perceptualHash: hashFor(photo, hints),
    differenceHash: diffHashFor(photo, hints),
  };
}

function hashFor(photo: DemoKind, hints: string[]) {
  if (hints.includes("duplicate")) {
    return "1010101010101010101010101010101010101010101010101010101010101010";
  }

  const hashes: Record<DemoKind, string> = {
    receipt: "1111110011111100111111001111110011111100111111001111110011111100",
    document:
      "1111000011110000111100001111000011110000111100001111000011110000",
    food: "1100110011001100110011001100110011001100110011001100110011001100",
    place: "1010100010101000101010001010100010101000101010001010100010101000",
    people: "1001100110011001100110011001100110011001100110011001100110011001",
    coupon: "1110001111100011111000111110001111100011111000111110001111100011",
    dark: "0000111100001111000011110000111100001111000011110000111100001111",
  };
  return hashes[photo];
}

function diffHashFor(photo: DemoKind, hints: string[]) {
  if (hints.includes("duplicate")) {
    return "0101010101010101010101010101010101010101010101010101010101010101";
  }

  const hashes: Record<DemoKind, string> = {
    receipt: "0101100111111001111000101101000110000011111000010011111110001110",
    document:
      "1010101010101010101010101010101010101010101010101010101010101010",
    food: "0011001100110011001100110011001100110011001100110011001100110011",
    place: "1111000011110000111100001111000011110000111100001111000011110000",
    people: "0000111100001111000011110000111100001111000011110000111100001111",
    coupon: "1100001111000011110000111100001111000011110000111100001111000011",
    dark: "0001111000011110000111100001111000011110000111100001111000011110",
  };
  return hashes[photo];
}
