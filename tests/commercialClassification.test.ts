import { describe, expect, it } from "vitest";
import { sampleAlbumItems } from "../src/data/sampleAlbum";
import {
  classifyAlbumItems,
  classifyItem,
  getCategorySummary,
} from "../src/features/album/classifier";
import type {
  AlbumItem,
  CleanBucketId,
  MapBucketId,
} from "../src/features/album/types";

const baseItem: AlbumItem = {
  id: "fixture",
  type: "PHOTO",
  source: "sample",
  createdAt: "2026-06-15T09:00:00+09:00",
  dataUri: "",
  signals: {
    width: 720,
    height: 960,
    aspectRatio: 0.75,
    brightness: 0.72,
    saturation: 0.2,
    edgeDensity: 0.26,
    textLineScore: 0.24,
    colorVariance: 0.18,
    whiteRatio: 0.56,
    darkRatio: 0.04,
    skinToneRatio: 0.02,
    natureColorRatio: 0.04,
    perceptualHash:
      "1111000011110000111100001111000011110000111100001111000011110000",
  },
};

const fixtures: Array<{
  name: string;
  input: Partial<AlbumItem>;
  categoryId: MapBucketId;
  cleanBucketId?: CleanBucketId;
  privacy?: "normal" | "review" | "sensitive";
}> = [
  {
    name: "receipt",
    input: {
      fileName: "store-payment.jpg",
      hints: ["영수증", "카드", "결제"],
    },
    categoryId: "receipt",
    privacy: "normal",
  },
  {
    name: "document",
    input: {
      fileName: "contract-document.jpg",
      hints: ["문서", "계약"],
      signals: {
        ...baseItem.signals!,
        aspectRatio: 0.71,
        whiteRatio: 0.7,
        textLineScore: 0.36,
        saturation: 0.12,
      },
    },
    categoryId: "document",
    cleanBucketId: "sensitive",
    privacy: "sensitive",
  },
  {
    name: "coupon",
    input: {
      fileName: "mart-coupon.png",
      hints: ["barcode", "qr", "쿠폰"],
    },
    categoryId: "coupon",
    cleanBucketId: "needsReview",
  },
  {
    name: "capture",
    input: {
      fileName: "screenshot-bank.png",
      hints: ["screenshot", "캡처"],
      signals: {
        ...baseItem.signals!,
        aspectRatio: 0.46,
        textLineScore: 0.31,
      },
    },
    categoryId: "capture",
  },
  {
    name: "food",
    input: {
      fileName: "dinner.jpg",
      hints: ["food", "음식"],
      signals: {
        ...baseItem.signals!,
        textLineScore: 0.03,
        saturation: 0.58,
        colorVariance: 0.46,
        whiteRatio: 0.08,
      },
    },
    categoryId: "food",
  },
  {
    name: "place",
    input: {
      fileName: "walk.jpg",
      hints: [],
      signals: {
        ...baseItem.signals!,
        textLineScore: 0.02,
        saturation: 0.44,
        whiteRatio: 0.06,
        natureColorRatio: 0.42,
      },
    },
    categoryId: "place",
  },
  {
    name: "people",
    input: {
      fileName: "friends.jpg",
      hints: [],
      signals: {
        ...baseItem.signals!,
        textLineScore: 0.02,
        saturation: 0.4,
        whiteRatio: 0.08,
        skinToneRatio: 0.2,
        natureColorRatio: 0.02,
      },
    },
    categoryId: "people",
  },
  {
    name: "sensitive account capture",
    input: {
      fileName: "bank-transfer-capture.png",
      hints: ["계좌", "송금", "캡처"],
    },
    categoryId: "capture",
    cleanBucketId: "sensitive",
    privacy: "sensitive",
  },
];

describe("commercial classification fixtures", () => {
  it.each(fixtures)(
    "classifies $name for paid photo organization flows",
    ({ input, categoryId, cleanBucketId, privacy }) => {
      const item = classifyItem({
        ...baseItem,
        ...input,
        signals: input.signals ?? baseItem.signals,
      });

      expect(item.categoryId).toBe(categoryId);
      if (cleanBucketId) {
        expect(item.cleanBucketId).toBe(cleanBucketId);
      }
      if (privacy) {
        expect(item.privacy).toBe(privacy);
      }
      expect(item.confidence).toBeGreaterThan(0.55);
    },
  );

  it("keeps sample album useful across core map buckets", async () => {
    const classified = await classifyAlbumItems(sampleAlbumItems);
    const summary = getCategorySummary(classified);

    expect(classified).toHaveLength(20);
    expect(summary.capture).toBeGreaterThanOrEqual(3);
    expect(summary.document).toBeGreaterThanOrEqual(2);
    expect(summary.receipt).toBeGreaterThanOrEqual(1);
    expect(summary.food).toBeGreaterThanOrEqual(3);
    expect(summary.place).toBeGreaterThanOrEqual(1);
    expect(summary.people).toBeGreaterThanOrEqual(2);
    expect(summary.coupon).toBeGreaterThanOrEqual(1);
  });
});
