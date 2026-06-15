import { describe, expect, it } from "vitest";
import {
  applyItemStatusChange,
  defaultPictoryState,
  mergeStoredItemStatuses,
  prepareRecentItemsForStorage,
  sanitizeLoadedRecentItems,
} from "../src/features/album/storage";
import type { ClassifiedItem } from "../src/features/album/types";

const baseItem: ClassifiedItem = {
  id: "item-1",
  type: "PHOTO",
  source: "sample",
  createdAt: "2026-06-15T09:00:00+09:00",
  dataUri: "data:image/png;base64,raw-image",
  fileName: "receipt.png",
  hints: ["receipt"],
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
  categoryId: "receipt",
  cleanBucketId: "keep",
  confidence: 0.82,
  reasons: ["영수증 패턴", "글자 줄이 많음"],
  privacy: "normal",
  periodKey: "2026-06",
  periodLabel: "2026. 6.",
  status: "inbox",
};

describe("album storage helpers", () => {
  it("restores item status from persisted id lists", () => {
    const [restored] = mergeStoredItemStatuses([baseItem], {
      ...defaultPictoryState,
      savedIds: [baseItem.id],
    });

    expect(restored.status).toBe("saved");
  });

  it("does not persist raw image data for sensitive items", async () => {
    const [stored] = await prepareRecentItemsForStorage([
      {
        ...baseItem,
        id: "sensitive-1",
        dataUri: "data:image/png;base64,sensitive-raw-image",
        cleanBucketId: "sensitive",
        privacy: "sensitive",
      },
    ]);

    expect(stored.dataUri).toContain("data:image/svg+xml");
    expect(stored.dataUri).not.toContain("sensitive-raw-image");
  });

  it("redacts protected document-like categories before local persistence", async () => {
    const items = await prepareRecentItemsForStorage([
      {
        ...baseItem,
        id: "receipt-1",
        dataUri: "data:image/png;base64,receipt-raw-image",
        categoryId: "receipt",
        privacy: "normal",
      },
      {
        ...baseItem,
        id: "review-1",
        dataUri: "data:image/png;base64,review-raw-image",
        categoryId: "memory",
        cleanBucketId: "needsReview",
        privacy: "normal",
      },
    ]);

    expect(items[0].dataUri).toContain("data:image/svg+xml");
    expect(items[0].dataUri).not.toContain("receipt-raw-image");
    expect(items[1].dataUri).toContain("data:image/svg+xml");
    expect(items[1].dataUri).not.toContain("review-raw-image");
  });

  it("sanitizes legacy loaded previews that may contain raw images", () => {
    const [receipt, oversizedNormal, thumbnail] = sanitizeLoadedRecentItems([
      {
        ...baseItem,
        id: "receipt-legacy",
        categoryId: "receipt",
        dataUri: "data:image/png;base64,legacy-receipt-raw",
      },
      {
        ...baseItem,
        id: "normal-legacy",
        categoryId: "food",
        cleanBucketId: "keep",
        privacy: "normal",
        dataUri: `data:image/jpeg;base64,${"a".repeat(50_000)}`,
      },
      {
        ...baseItem,
        id: "thumbnail",
        categoryId: "food",
        cleanBucketId: "keep",
        privacy: "normal",
        dataUri: "data:image/jpeg;base64,small-thumbnail",
      },
    ]);

    expect(receipt.dataUri).toContain("data:image/svg+xml");
    expect(receipt.dataUri).not.toContain("legacy-receipt-raw");
    expect(oversizedNormal.dataUri).toBe("");
    expect(thumbnail.dataUri).toBe("data:image/jpeg;base64,small-thumbnail");
  });

  it("drops raw normal image data when thumbnailing is unavailable", async () => {
    const [stored] = await prepareRecentItemsForStorage([
      {
        ...baseItem,
        categoryId: "food",
        cleanBucketId: "keep",
        privacy: "normal",
      },
    ]);

    expect(stored.dataUri).toBe("");
  });

  it("applies bulk status changes without exceeding saved limit", () => {
    const secondItem = { ...baseItem, id: "item-2", status: "queued" as const };
    const result = applyItemStatusChange(
      {
        ...defaultPictoryState,
        queuedIds: [secondItem.id],
        recentItems: [baseItem, secondItem],
      },
      [baseItem.id, secondItem.id],
      "saved",
      1,
    );

    expect(result.changedCount).toBe(1);
    expect(result.skippedSaveCount).toBe(1);
    expect(result.state.savedIds).toEqual([baseItem.id]);
    expect(result.state.queuedIds).toEqual([secondItem.id]);
    expect(result.state.recentItems[0].status).toBe("saved");
    expect(result.state.recentItems[1].status).toBe("queued");
  });

  it("moves a folder batch between queued, ignored, and inbox states", () => {
    const secondItem = { ...baseItem, id: "item-2" };
    const queued = applyItemStatusChange(
      { ...defaultPictoryState, recentItems: [baseItem, secondItem] },
      [baseItem.id, secondItem.id],
      "queued",
    ).state;
    const ignored = applyItemStatusChange(
      queued,
      [secondItem.id],
      "ignored",
    ).state;
    const restored = applyItemStatusChange(
      ignored,
      [baseItem.id],
      "inbox",
    ).state;

    expect(ignored.queuedIds).toEqual([baseItem.id]);
    expect(ignored.ignoredIds).toEqual([secondItem.id]);
    expect(restored.queuedIds).toEqual([]);
    expect(restored.recentItems[0].status).toBe("inbox");
    expect(restored.recentItems[1].status).toBe("ignored");
  });
});
