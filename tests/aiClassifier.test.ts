import { describe, expect, it } from "vitest";
import { applyAiClassificationPatch } from "../src/features/album/aiClassifier";
import type { ClassifiedItem } from "../src/features/album/types";

const item: ClassifiedItem = {
  id: "photo-1",
  type: "PHOTO",
  dataUri: "data:image/jpeg;base64,",
  source: "local-file",
  createdAt: "2026-06-15T09:00:00+09:00",
  categoryId: "memory",
  cleanBucketId: "needsReview",
  confidence: 0.42,
  reasons: ["기록 패턴"],
  privacy: "review",
  periodKey: "2026-06",
  periodLabel: "2026. 6.",
  status: "inbox",
  hints: ["photo"],
};

describe("aiClassifier", () => {
  it("applies server AI classification patches to local results", () => {
    const result = applyAiClassificationPatch(
      item,
      new Map([
        [
          "photo-1",
          {
            id: "photo-1",
            categoryId: "receipt",
            cleanBucketId: "sensitive",
            confidence: 1.4,
            privacy: "sensitive",
            reasons: ["영수증", "카드 결제", "개인정보 가능"],
            hints: ["receipt", "영수증"],
          },
        ],
      ]),
    );

    expect(result.categoryId).toBe("receipt");
    expect(result.cleanBucketId).toBe("sensitive");
    expect(result.privacy).toBe("sensitive");
    expect(result.confidence).toBe(0.99);
    expect(result.reasons).toEqual(["영수증", "카드 결제", "개인정보 가능"]);
    expect(result.hints).toContain("photo");
    expect(result.hints).toContain("영수증");
  });
});
