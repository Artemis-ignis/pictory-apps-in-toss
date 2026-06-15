import { describe, expect, it } from "vitest";
import {
  classifyAlbumItems,
  classifyItem,
  hammingDistance,
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
      },
    });

    expect(item.cleanBucketId).toBe("dark");
  });

  it("calculates hamming distance for duplicate grouping", () => {
    expect(hammingDistance("1010", "1001")).toBe(2);
    expect(hammingDistance("1010", "1010")).toBe(0);
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
