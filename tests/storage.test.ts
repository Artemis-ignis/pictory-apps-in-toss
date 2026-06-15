import { describe, expect, it } from "vitest";
import {
  defaultPictoryState,
  mergeStoredItemStatuses,
  prepareRecentItemsForStorage,
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

  it("drops raw normal image data when thumbnailing is unavailable", async () => {
    const [stored] = await prepareRecentItemsForStorage([baseItem]);

    expect(stored.dataUri).toBe("");
  });
});
