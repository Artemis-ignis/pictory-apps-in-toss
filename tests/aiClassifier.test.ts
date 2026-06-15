import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyAiClassificationPatch,
  refineWithAiClassifier,
} from "../src/features/album/aiClassifier";
import type { ClassifiedItem } from "../src/features/album/types";

const item: ClassifiedItem = {
  id: "photo-1",
  type: "PHOTO",
  dataUri: "data:image/jpeg;base64,",
  source: "local-file",
  createdAt: "2026-06-15T09:00:00+09:00",
  fileName: "id-card-original.jpg",
  signals: {
    width: 720,
    height: 960,
    aspectRatio: 0.75,
    brightness: 0.7,
    saturation: 0.15,
    edgeDensity: 0.4,
    textLineScore: 0.6,
    colorVariance: 0.2,
    whiteRatio: 0.2,
    darkRatio: 0.1,
    skinToneRatio: 0.05,
    natureColorRatio: 0.03,
    perceptualHash: "private-hash",
  },
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

interface AiRequestTestItem {
  fileName?: string;
  createdAt?: string;
  imageDataUri?: string;
  redacted?: boolean;
  signals?: {
    width?: number;
    perceptualHash?: string;
  };
}

describe("aiClassifier", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it("keeps local privacy and review buckets when server patches are weaker", () => {
    const reviewResult = applyAiClassificationPatch(
      item,
      new Map([
        [
          "photo-1",
          {
            id: "photo-1",
            categoryId: "food",
            cleanBucketId: "keep",
            privacy: "normal",
          },
        ],
      ]),
    );
    const sensitiveResult = applyAiClassificationPatch(
      {
        ...item,
        cleanBucketId: "sensitive",
        privacy: "sensitive",
      },
      new Map([
        [
          "photo-1",
          {
            id: "photo-1",
            cleanBucketId: "needsReview",
            privacy: "review",
          },
        ],
      ]),
    );

    expect(reviewResult.categoryId).toBe("food");
    expect(reviewResult.cleanBucketId).toBe("needsReview");
    expect(reviewResult.privacy).toBe("review");
    expect(sensitiveResult.cleanBucketId).toBe("sensitive");
    expect(sensitiveResult.privacy).toBe("sensitive");
  });

  it("redacts non-normal and sensitive photos before calling the server AI endpoint", async () => {
    const requestItems = await captureAiRequestItems([
      item,
      {
        ...item,
        id: "photo-2",
        cleanBucketId: "sensitive",
        privacy: "normal",
      },
    ]);

    expect(requestItems).toHaveLength(2);
    requestItems.forEach((requestItem) => {
      expect(requestItem.imageDataUri).toBeUndefined();
      expect(requestItem.redacted).toBe(true);
      expect(requestItem.fileName).toBeUndefined();
      expect(requestItem.createdAt).toBeUndefined();
      expect(requestItem.signals?.width).toBe(720);
      expect(requestItem.signals?.perceptualHash).toBeUndefined();
    });
  });

  it("attaches a downsized image only for normal server AI candidates", async () => {
    const encodedImage = "data:image/jpeg;base64,downsized";
    const toDataURL = vi.fn(() => encodedImage);
    vi.stubGlobal("document", {
      createElement: vi.fn(() => ({
        width: 0,
        height: 0,
        getContext: vi.fn(() => ({ drawImage: vi.fn() })),
        toDataURL,
      })),
    });
    class TestImage {
      decoding: "async" | "sync" | "auto" = "auto";
      width = 1024;
      height = 512;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(value: string) {
        void value;
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", TestImage);

    const requestItems = await captureAiRequestItems([
      {
        ...item,
        categoryId: "food",
        cleanBucketId: "keep",
        confidence: 0.58,
        privacy: "normal",
      },
    ]);

    expect(requestItems[0].imageDataUri).toBe(encodedImage);
    expect(requestItems[0].redacted).toBeUndefined();
    expect(requestItems[0].fileName).toBeUndefined();
    expect(requestItems[0].createdAt).toBeUndefined();
    expect(requestItems[0].signals?.perceptualHash).toBeUndefined();
    expect(toDataURL).toHaveBeenCalledWith("image/jpeg", 0.72);
  });

  it("limits attached server AI images per request", async () => {
    vi.stubGlobal("document", {
      createElement: vi.fn(() => ({
        width: 0,
        height: 0,
        getContext: vi.fn(() => ({ drawImage: vi.fn() })),
        toDataURL: vi.fn(() => "data:image/jpeg;base64,downsized"),
      })),
    });
    class TestImage {
      decoding: "async" | "sync" | "auto" = "auto";
      width = 1024;
      height = 512;
      onload: (() => void) | null = null;

      set src(value: string) {
        void value;
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", TestImage);

    const requestItems = await captureAiRequestItems(
      Array.from({ length: 10 }, (_, index) => ({
        ...item,
        id: `food-${index}`,
        categoryId: "food",
        cleanBucketId: "keep",
        confidence: 0.58,
        privacy: "normal",
      })),
    );

    expect(requestItems.filter((requestItem) => requestItem.imageDataUri))
      .toHaveLength(8);
    expect(requestItems.slice(8).every((requestItem) => requestItem.redacted))
      .toBe(true);
  });

  it("redacts protected normal categories before server AI refinement", async () => {
    const requestItems = await captureAiRequestItems([
      {
        ...item,
        id: "receipt-normal",
        categoryId: "receipt",
        cleanBucketId: "keep",
        confidence: 0.86,
        privacy: "normal",
      },
      {
        ...item,
        id: "people-normal",
        categoryId: "people",
        cleanBucketId: "keep",
        confidence: 0.86,
        privacy: "normal",
      },
      {
        ...item,
        id: "capture-normal",
        categoryId: "capture",
        cleanBucketId: "capturePile",
        confidence: 0.6,
        privacy: "normal",
      },
    ]);

    expect(requestItems).toHaveLength(3);
    requestItems.forEach((requestItem) => {
      expect(requestItem.imageDataUri).toBeUndefined();
      expect(requestItem.redacted).toBe(true);
      expect(requestItem.fileName).toBeUndefined();
      expect(requestItem.createdAt).toBeUndefined();
      expect(requestItem.signals?.perceptualHash).toBeUndefined();
    });
  });

  it("redacts normal photos when image shrinking is unavailable", async () => {
    const requestItems = await captureAiRequestItems([
      {
        ...item,
        categoryId: "food",
        cleanBucketId: "keep",
        confidence: 0.58,
        privacy: "normal",
      },
    ]);

    expect(requestItems[0].imageDataUri).toBeUndefined();
    expect(requestItems[0].redacted).toBe(true);
    expect(requestItems[0].fileName).toBeUndefined();
    expect(requestItems[0].createdAt).toBeUndefined();
    expect(requestItems[0].signals?.perceptualHash).toBeUndefined();
  });

  it("sends server AI requests with session credentials and request id", async () => {
    let requestInit: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        requestInit = init;
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      }),
    );

    await refineWithAiClassifier([item], {
      VITE_PICTORY_CLASSIFY_ENDPOINT: "https://classify.example.com",
    });

    const headers = requestInit?.headers as Record<string, string>;
    expect(requestInit?.credentials).toBe("include");
    expect(headers.Accept).toBe("application/json");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["X-Pictory-Request-Id"]).toMatch(/^pictory-/);
  });

  it("reports applied server AI refinement results", async () => {
    const onResult = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: "photo-1",
                categoryId: "document",
                cleanBucketId: "sensitive",
                confidence: 0.91,
                privacy: "sensitive",
              },
            ],
          }),
          { status: 200 },
        );
      }),
    );

    await refineWithAiClassifier(
      [item],
      { VITE_PICTORY_CLASSIFY_ENDPOINT: "https://classify.example.com" },
      { onResult },
    );

    expect(onResult).toHaveBeenCalledWith({
      status: "applied",
      candidateCount: 1,
      refinedCount: 1,
      reason: "ok",
    });
  });

  it("reports failed server AI refinement without changing local results", async () => {
    const onResult = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(JSON.stringify({ error: "no quota" }), {
          status: 402,
        });
      }),
    );

    const [result] = await refineWithAiClassifier(
      [item],
      { VITE_PICTORY_CLASSIFY_ENDPOINT: "https://classify.example.com" },
      { onResult },
    );

    expect(result).toEqual(item);
    expect(onResult).toHaveBeenCalledWith({
      status: "failed",
      candidateCount: 1,
      refinedCount: 0,
      reason: "httpError",
    });
  });
});

async function captureAiRequestItems(items: ClassifiedItem[]) {
  let body = "";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      body = String(init?.body ?? "");
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    }),
  );

  await refineWithAiClassifier(items, {
    VITE_PICTORY_CLASSIFY_ENDPOINT: "https://classify.example.com",
  });

  const payload = JSON.parse(body) as { items: AiRequestTestItem[] };
  return payload.items;
}
