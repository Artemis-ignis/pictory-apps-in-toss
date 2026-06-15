import { describe, expect, it, vi } from "vitest";
import {
  handlePictoryClassifyRequest,
  type PictoryClassifyDeps,
  type PictoryClassifyRequestInput,
  type PictoryClassifyRequestItem,
} from "../server/pictoryClassify";

const entitlement = {
  subjectId: "user-1",
  planId: "plus",
  active: true,
};

const redactedBody = {
  schemaVersion: 1,
  items: [
    {
      id: "sensitive-photo-id",
      hints: ["id", "sensitive"],
      signals: {
        width: 720,
        height: 960,
        aspectRatio: 0.75,
        brightness: 0.7,
        saturation: 0.15,
        edgeDensity: 0.4,
        textLineScore: 0.6,
        colorVariance: 0.2,
      },
      redacted: true,
    },
  ],
};

const imageBody = {
  schemaVersion: 1,
  items: [
    {
      id: "photo-id",
      fileName: "receipt.jpg",
      createdAt: "2026-06-15T09:00:00.000Z",
      hints: ["receipt"],
      signals: {
        width: 720,
        height: 960,
        aspectRatio: 0.75,
        brightness: 0.8,
        saturation: 0.2,
        edgeDensity: 0.3,
        textLineScore: 0.5,
        colorVariance: 0.1,
        perceptualHash: "private-hash",
      },
      imageDataUri: "data:image/jpeg;base64,abc123",
    },
  ],
};

describe("handlePictoryClassifyRequest", () => {
  it("rejects requests without paid entitlement", async () => {
    const classifyItems = vi.fn();
    const result = await handlePictoryClassifyRequest(redactedInput(), {
      ...deps({ classifyItems }),
      verifyEntitlement: vi.fn(async () => null),
    });

    expect(result.status).toBe(402);
    expect(result.body.error?.code).toBe("payment_required");
    expect(classifyItems).not.toHaveBeenCalled();
  });

  it("passes request headers and request id to entitlement verification", async () => {
    const headers = {
      Authorization: "Bearer user-token",
      "x-pictory-server-secret": "server-secret",
    };
    const verifyEntitlement = vi.fn(async () => entitlement);
    const result = await handlePictoryClassifyRequest(
      { ...redactedInput(), headers, requestId: "req-123" },
      {
        ...deps(),
        verifyEntitlement,
        classifyItems: vi.fn(async () => []),
      },
    );

    expect(result.status).toBe(200);
    expect(verifyEntitlement).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaVersion: 1,
        itemCount: 1,
        headers,
        requestId: "req-123",
      }),
    );
  });

  it("rejects unauthenticated requests when entitlement verification requires headers", async () => {
    const classifyItems = vi.fn();
    const verifyEntitlement = vi.fn(async (context) =>
      context.headers.Authorization ? entitlement : null,
    );
    const result = await handlePictoryClassifyRequest(redactedInput(), {
      ...deps({ classifyItems }),
      verifyEntitlement,
    });

    expect(result.status).toBe(402);
    expect(result.body.error?.code).toBe("payment_required");
    expect(verifyEntitlement).toHaveBeenCalledWith(
      expect.objectContaining({ headers: {} }),
    );
    expect(classifyItems).not.toHaveBeenCalled();
  });

  it("rejects requests when quota is not enough", async () => {
    const classifyItems = vi.fn();
    const result = await handlePictoryClassifyRequest(redactedInput(), {
      ...deps({ classifyItems }),
      verifyQuota: vi.fn(async () => ({ remaining: 0 })),
    });

    expect(result.status).toBe(429);
    expect(result.body.error?.code).toBe("quota_exceeded");
    expect(classifyItems).not.toHaveBeenCalled();
  });

  it("allows redacted items without image bodies", async () => {
    const classifyItems = vi.fn(
      async (
        items: readonly PictoryClassifyRequestItem[],
        context: unknown,
      ) => {
        expect(context).toMatchObject({ entitlement });
        return [
          {
            id: items[0].id,
            categoryId: "document" as const,
            cleanBucketId: "sensitive" as const,
            privacy: "sensitive" as const,
          },
        ];
      },
    );
    const result = await handlePictoryClassifyRequest(
      redactedInput(),
      deps({ classifyItems }),
    );

    expect(result.status).toBe(200);
    const sentItems = classifyItems.mock.calls[0][0];
    expect(sentItems[0]).toMatchObject({
      id: "sensitive-photo-id",
      redacted: true,
    });
    expect(sentItems[0]).not.toHaveProperty("imageDataUri");
    expect(result.body.items?.[0]).toMatchObject({
      id: "sensitive-photo-id",
      categoryId: "document",
      cleanBucketId: "sensitive",
      privacy: "sensitive",
    });
  });

  it("returns normalized classification patches for valid paid requests", async () => {
    const classifyItems = vi.fn(
      async (items: readonly PictoryClassifyRequestItem[]) => {
        expect(items[0].imageDataUri).toBe("data:image/jpeg;base64,abc123");
        return [
          {
            id: "photo-id",
            categoryId: "receipt" as const,
            cleanBucketId: "needsReview" as const,
            confidence: 1.4,
            privacy: "review" as const,
            reasons: ["영수증", "카드 결제", "개인정보 가능", "ignored"],
            hints: ["receipt", "영수증"],
          },
        ];
      },
    );
    const result = await handlePictoryClassifyRequest(
      imageInput(),
      deps({ classifyItems }),
    );

    expect(result.status).toBe(200);
    expect(result.body.items).toEqual([
      {
        id: "photo-id",
        categoryId: "receipt",
        cleanBucketId: "needsReview",
        confidence: 0.99,
        privacy: "review",
        reasons: ["영수증", "카드 결제", "개인정보 가능"],
        hints: ["receipt", "영수증"],
      },
    ]);
    expect(JSON.stringify(result.body)).not.toContain("imageDataUri");
  });

  it("rejects bodies over the configured size limit before auth checks", async () => {
    const verifyEntitlement = vi.fn();
    const result = await handlePictoryClassifyRequest(
      { ...redactedInput(), bodySizeBytes: 101 },
      {
        ...deps(),
        maxBodyBytes: 100,
        verifyEntitlement,
      },
    );

    expect(result.status).toBe(413);
    expect(result.body.error?.code).toBe("body_too_large");
    expect(verifyEntitlement).not.toHaveBeenCalled();
  });
});

function deps(
  overrides: Partial<PictoryClassifyDeps> = {},
): PictoryClassifyDeps {
  return {
    verifyEntitlement: vi.fn(async () => entitlement),
    verifyQuota: vi.fn(async () => ({ remaining: 40 })),
    env: {},
    ...overrides,
  };
}

function redactedInput(): PictoryClassifyRequestInput {
  return { body: redactedBody };
}

function imageInput(): PictoryClassifyRequestInput {
  return { body: imageBody };
}
