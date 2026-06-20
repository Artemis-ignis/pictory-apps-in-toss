import { describe, expect, it } from "vitest";
import {
  classifyAlbumItems,
  classifyItem,
  cleanBucketMatches,
  getCleanSummary,
  hammingDistance,
  isCleanTabItem,
} from "../src/features/album/classifier";
import type { AlbumItem } from "../src/features/album/types";

const baseItem: AlbumItem = {
  id: "test",
  type: "PHOTO",
  source: "sample",
  createdAt: "2026-06-15T09:00:00+09:00",
  dataUri: "",
  signals: {
    width: 160,
    height: 160,
    aspectRatio: 1,
    brightness: 0.8,
    saturation: 0.16,
    edgeDensity: 0.32,
    textLineScore: 0.35,
    colorVariance: 0.12,
    whiteRatio: 0.62,
    darkRatio: 0.02,
    skinToneRatio: 0.01,
    natureColorRatio: 0.04,
    perceptualHash:
      "1111000011110000111100001111000011110000111100001111000011110000",
  },
};

describe("classifier", () => {
  it("classifies receipt-like images from hints and text signal", () => {
    const item = classifyItem({
      ...baseItem,
      id: "receipt",
      fileName: "market-receipt.png",
      hints: ["영수증", "결제"],
    });

    expect(item.categoryId).toBe("receipt");
    expect(item.cleanBucketId).not.toBe("dark");
    expect(item.confidence).toBeGreaterThan(0.55);
  });

  it("marks identity or account screenshots as sensitive", () => {
    const item = classifyItem({
      ...baseItem,
      id: "sensitive",
      fileName: "bank-account-capture.png",
      hints: ["계좌", "신분증", "캡처"],
    });

    expect(item.privacy).toBe("sensitive");
    expect(item.cleanBucketId).toBe("sensitive");
  });

  it("marks low-light images as dark candidates", () => {
    const item = classifyItem({
      ...baseItem,
      id: "dark",
      fileName: "night-room.jpg",
      hints: ["photo"],
      signals: {
        ...baseItem.signals!,
        brightness: 0.12,
        textLineScore: 0.02,
        saturation: 0.25,
        darkRatio: 0.72,
      },
    });

    expect(item.cleanBucketId).toBe("dark");
  });

  it("uses cheap pixel ratios to classify people and outdoor places", () => {
    const person = classifyItem({
      ...baseItem,
      id: "person",
      fileName: "daily-photo.jpg",
      hints: [],
      signals: {
        ...baseItem.signals!,
        textLineScore: 0.02,
        saturation: 0.38,
        whiteRatio: 0.1,
        skinToneRatio: 0.18,
        natureColorRatio: 0.04,
      },
    });
    const place = classifyItem({
      ...baseItem,
      id: "place",
      fileName: "walk-photo.jpg",
      hints: [],
      signals: {
        ...baseItem.signals!,
        textLineScore: 0.02,
        saturation: 0.44,
        whiteRatio: 0.08,
        skinToneRatio: 0.01,
        natureColorRatio: 0.4,
      },
    });

    expect(person.categoryId).toBe("people");
    expect(person.reasons).toContain("사람색 영역");
    expect(place.categoryId).toBe("place");
    expect(place.reasons).toContain("야외색 영역");
  });

  it("sorts common album photos into practical buckets", () => {
    const phoneCapture = classifyItem({
      ...baseItem,
      id: "phone-capture",
      fileName: "IMG_0042.jpg",
      hints: [],
      signals: {
        ...baseItem.signals!,
        width: 1080,
        height: 2340,
        aspectRatio: 0.46,
        brightness: 0.82,
        saturation: 0.18,
        edgeDensity: 0.18,
        textLineScore: 0.28,
        colorVariance: 0.1,
        whiteRatio: 0.38,
        darkRatio: 0.02,
        skinToneRatio: 0.01,
        natureColorRatio: 0.02,
      },
    });
    const paperScan = classifyItem({
      ...baseItem,
      id: "paper-scan",
      fileName: "IMG_0043.jpg",
      hints: [],
      signals: {
        ...baseItem.signals!,
        aspectRatio: 0.7,
        brightness: 0.86,
        saturation: 0.12,
        edgeDensity: 0.24,
        textLineScore: 0.3,
        colorVariance: 0.08,
        whiteRatio: 0.68,
        darkRatio: 0.01,
        skinToneRatio: 0.01,
        natureColorRatio: 0,
      },
    });
    const ticket = classifyItem({
      ...baseItem,
      id: "ticket",
      fileName: "boarding-pass-qr.png",
      hints: ["ticket", "qr"],
    });
    const food = classifyItem({
      ...baseItem,
      id: "food",
      fileName: "IMG_0044.jpg",
      hints: [],
      signals: {
        ...baseItem.signals!,
        aspectRatio: 1.32,
        brightness: 0.58,
        saturation: 0.34,
        edgeDensity: 0.04,
        textLineScore: 0.02,
        colorVariance: 0.16,
        whiteRatio: 0.04,
        darkRatio: 0.07,
        skinToneRatio: 0.12,
        natureColorRatio: 0.05,
      },
    });
    const landscape = classifyItem({
      ...baseItem,
      id: "landscape",
      fileName: "IMG_0045.jpg",
      hints: [],
      signals: {
        ...baseItem.signals!,
        brightness: 0.6,
        saturation: 0.42,
        edgeDensity: 0.06,
        textLineScore: 0.02,
        colorVariance: 0.2,
        whiteRatio: 0.06,
        darkRatio: 0.08,
        skinToneRatio: 0.01,
        natureColorRatio: 0.45,
      },
    });
    const pet = classifyItem({
      ...baseItem,
      id: "pet",
      fileName: "puppy-home.jpg",
      hints: ["강아지"],
      signals: {
        ...baseItem.signals!,
        brightness: 0.62,
        saturation: 0.34,
        edgeDensity: 0.05,
        textLineScore: 0.01,
        colorVariance: 0.12,
        whiteRatio: 0.12,
        darkRatio: 0.05,
        skinToneRatio: 0.03,
        natureColorRatio: 0.1,
      },
    });
    const blurry = classifyItem({
      ...baseItem,
      id: "blurry",
      fileName: "IMG_0046.jpg",
      hints: [],
      signals: {
        ...baseItem.signals!,
        brightness: 0.55,
        contrast: 0.1,
        saturation: 0.2,
        edgeDensity: 0.02,
        textLineScore: 0.01,
        colorVariance: 0.05,
        whiteRatio: 0.08,
        darkRatio: 0.04,
        skinToneRatio: 0.02,
        natureColorRatio: 0.02,
        blurVariance: 0.02,
      },
    });

    expect(phoneCapture.categoryId).toBe("capture");
    expect(phoneCapture.cleanBucketId).toBe("capturePile");
    expect(paperScan.categoryId).toBe("document");
    expect(paperScan.cleanBucketId).toBe("needsReview");
    expect(ticket.categoryId).toBe("coupon");
    expect(ticket.cleanBucketId).toBe("needsReview");
    expect(food.categoryId).toBe("food");
    expect(food.confidence).toBeGreaterThan(0.55);
    expect(landscape.categoryId).toBe("place");
    expect(pet.categoryId).toBe("memory");
    expect(pet.cleanBucketId).toBe("keep");
    expect(blurry.categoryId).toBe("memory");
    expect(blurry.cleanBucketId).toBe("dark");
    expect(blurry.reasons).toContain("흐린 사진");
  });

  it("recognizes a photographed receipt without filename hints", () => {
    const receipt = classifyItem({
      ...baseItem,
      id: "visual-receipt",
      fileName: "a91f2c74.jpg",
      hints: [],
      signals: {
        ...baseItem.signals!,
        width: 233,
        height: 350,
        aspectRatio: 0.6657142857142857,
        brightness: 0.54,
        contrast: 0.44,
        saturation: 0.25,
        edgeDensity: 0.008,
        textLineScore: 0,
        colorVariance: 0.118,
        whiteRatio: 0.137,
        darkRatio: 0.056,
        skinToneRatio: 0.318,
        natureColorRatio: 0,
        blurVariance: 0.25,
      },
    });

    expect(receipt.categoryId).toBe("receipt");
    expect(receipt.cleanBucketId).toBe("needsReview");
  });

  it("does not treat every warm beige image as a person", () => {
    const document = classifyItem({
      ...baseItem,
      id: "warm-document",
      fileName: "IMG_1200.jpg",
      hints: [],
      signals: {
        ...baseItem.signals!,
        aspectRatio: 0.67,
        brightness: 0.54,
        saturation: 0.25,
        edgeDensity: 0.01,
        textLineScore: 0,
        colorVariance: 0.11,
        whiteRatio: 0.14,
        darkRatio: 0.05,
        skinToneRatio: 0.32,
        natureColorRatio: 0,
      },
    });
    const coupon = classifyItem({
      ...baseItem,
      id: "bright-coupon",
      fileName: "coupon-qr.jpg",
      hints: ["coupon", "qr"],
      signals: {
        ...baseItem.signals!,
        brightness: 0.24,
        saturation: 0.53,
        colorVariance: 0.16,
        whiteRatio: 0,
        darkRatio: 0.48,
        skinToneRatio: 0.3,
      },
    });

    expect(document.categoryId).toBe("document");
    expect(document.cleanBucketId).toBe("needsReview");
    expect(coupon.categoryId).toBe("coupon");
    expect(coupon.cleanBucketId).toBe("needsReview");
  });

  it("calculates hamming distance for duplicate grouping", () => {
    expect(hammingDistance("1010", "1001")).toBe(2);
    expect(hammingDistance("1010", "1010")).toBe(0);
  });

  it("keeps the best similar photo as representative", async () => {
    const [sharp, blurry] = await classifyAlbumItems([
      {
        ...baseItem,
        id: "sharp-food",
        fileName: "IMG_3001.jpg",
        hints: ["food"],
        signals: {
          ...baseItem.signals!,
          saturation: 0.48,
          colorVariance: 0.42,
          textLineScore: 0.02,
          perceptualHash:
            "1111000011110000111100001111000011110000111100001111000011110000",
          differenceHash:
            "1010101010101010101010101010101010101010101010101010101010101010",
          blurVariance: 0.9,
          contrast: 0.5,
        },
      },
      {
        ...baseItem,
        id: "blurry-food",
        fileName: "IMG_3002.jpg",
        hints: ["food"],
        signals: {
          ...baseItem.signals!,
          saturation: 0.48,
          colorVariance: 0.42,
          textLineScore: 0.02,
          perceptualHash:
            "1111000011110000111100001111000011110000111100001111000011110000",
          differenceHash:
            "1010101010101010101010101010101010101010101010101010101010101010",
          blurVariance: 0.1,
          contrast: 0.2,
        },
      },
    ]);

    expect(sharp.duplicateGroup).toBeDefined();
    expect(sharp.isDuplicateRepresentative).toBe(true);
    expect(sharp.cleanBucketId).toBe("keep");
    expect(cleanBucketMatches(sharp, "similar")).toBe(false);
    expect(blurry.duplicateGroup).toBe(sharp.duplicateGroup);
    expect(blurry.isDuplicateRepresentative).toBe(false);
    expect(blurry.cleanBucketId).toBe("similar");
    expect(cleanBucketMatches(blurry, "similar")).toBe(true);
  });

  it("reports progress while classifying a batch", async () => {
    const progress: string[] = [];

    await classifyAlbumItems(
      [baseItem, { ...baseItem, id: "second" }],
      new Map(),
      {
        onProgress: (nextProgress) => progress.push(nextProgress.stage),
      },
    );

    expect(progress).toContain("사진 불러오는 중");
    expect(progress).toContain("밝기와 선명도 확인 중");
    expect(progress).toContain("비슷한 사진 묶는 중");
    expect(progress).toContain("사진 분류 중");
  });

  it("removes saved and ignored items from clean candidates", () => {
    const item = classifyItem({
      ...baseItem,
      id: "candidate",
      fileName: "receipt.png",
      hints: ["영수증"],
    });

    expect(isCleanTabItem(item)).toBe(true);
    expect(cleanBucketMatches(item, "needsReview")).toBe(true);
    expect(isCleanTabItem({ ...item, status: "saved" })).toBe(false);
    expect(
      cleanBucketMatches({ ...item, status: "saved" }, "needsReview"),
    ).toBe(false);
    expect(isCleanTabItem({ ...item, status: "ignored" })).toBe(false);
    expect(
      cleanBucketMatches({ ...item, status: "ignored" }, "needsReview"),
    ).toBe(false);
  });

  it("summarizes cleanup buckets without counting saved items", () => {
    const sensitive = classifyItem({
      ...baseItem,
      id: "summary-sensitive",
      fileName: "bank-account-capture.png",
      hints: ["계좌", "캡처"],
    });
    const similar = {
      ...classifyItem({
        ...baseItem,
        id: "summary-similar",
        fileName: "food-copy.jpg",
        hints: ["food"],
        signals: {
          ...baseItem.signals!,
          saturation: 0.48,
          colorVariance: 0.42,
          textLineScore: 0.02,
        },
      }),
      duplicateGroup: "similar-1",
      isDuplicateRepresentative: false,
    };
    const saved = {
      ...classifyItem({
        ...baseItem,
        id: "summary-saved",
        fileName: "receipt.png",
        hints: ["영수증"],
      }),
      status: "saved" as const,
    };

    const summary = getCleanSummary([sensitive, similar, saved]);

    expect(summary.sensitive).toBe(1);
    expect(summary.similar).toBe(1);
    expect(summary.needsReview ?? 0).toBe(0);
  });

  it("keeps sensitive priority above duplicate grouping", async () => {
    const [first, second] = await classifyAlbumItems([
      {
        ...baseItem,
        id: "sensitive-1",
        fileName: "account-copy-a.png",
        hints: ["계좌", "캡처"],
      },
      {
        ...baseItem,
        id: "sensitive-2",
        fileName: "account-copy-b.png",
        hints: ["계좌", "캡처"],
      },
    ]);

    expect(first.duplicateGroup).toBeDefined();
    expect(second.duplicateGroup).toBeDefined();
    expect(first.cleanBucketId).toBe("sensitive");
    expect(second.cleanBucketId).toBe("sensitive");
  });
});
