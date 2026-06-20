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

  it("does not redact non-sensitive document-like categories before local persistence", async () => {
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

    expect(items[0].dataUri).toBe("");
    expect(items[0].dataUri).not.toContain("receipt-raw-image");
    expect(items[1].dataUri).toBe("");
    expect(items[1].dataUri).not.toContain("review-raw-image");
  });

  it("sanitizes loaded previews without hiding non-sensitive thumbnails", () => {
    const [sensitive, receipt, oversizedNormal, thumbnail] =
      sanitizeLoadedRecentItems([
        {
          ...baseItem,
          id: "sensitive-legacy",
          cleanBucketId: "sensitive",
          privacy: "sensitive",
          dataUri: "data:image/png;base64,legacy-sensitive-raw",
        },
        {
          ...baseItem,
          id: "receipt-legacy",
          categoryId: "receipt",
          dataUri: "data:image/png;base64,legacy-receipt-thumbnail",
        },
        {
          ...baseItem,
          id: "normal-legacy",
          categoryId: "food",
          cleanBucketId: "keep",
          privacy: "normal",
          dataUri: `data:image/jpeg;base64,${"a".repeat(200_000)}`,
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

    expect(sensitive.dataUri).toContain("data:image/svg+xml");
    expect(sensitive.dataUri).not.toContain("legacy-sensitive-raw");
    expect(receipt.dataUri).toBe(
      "data:image/png;base64,legacy-receipt-thumbnail",
    );
    expect(oversizedNormal.dataUri).toBe("");
    expect(thumbnail.dataUri).toBe("data:image/jpeg;base64,small-thumbnail");
  });

  it("drops internal QA screenshots from persisted local demo state", () => {
    const items = sanitizeLoadedRecentItems([
      {
        ...baseItem,
        id: "qa-shot",
        source: "local-file",
        fileName: "02-home-shortcut-folder.png",
      },
      {
        ...baseItem,
        id: "real-shot",
        source: "local-file",
        fileName: "screenshot-bank.png",
      },
    ]);

    expect(items.map((item) => item.id)).toEqual(["real-shot"]);
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
