import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaultClassifyItems,
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

const creditEntitlement = {
  subjectId: "user-1",
  planId: "free",
  active: true,
  serverAiAccess: "credit" as const,
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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it("accepts ad-credit server AI entitlement when quota is available", async () => {
    const classifyItems = vi.fn(async () => []);
    const result = await handlePictoryClassifyRequest(redactedInput(), {
      ...deps({ classifyItems }),
      verifyEntitlement: vi.fn(async () => creditEntitlement),
    });

    expect(result.status).toBe(200);
    expect(classifyItems).toHaveBeenCalled();
  });

  it("reserves quota before classifying paid server AI batches", async () => {
    const calls: string[] = [];
    const consumeQuota = vi.fn(async (context) => {
      calls.push("consume");
      expect(context.quota.remaining).toBe(40);
      return { remaining: 39 };
    });
    const classifyItems = vi.fn(async (_items, context) => {
      calls.push("classify");
      expect(context.quota.remaining).toBe(39);
      return [];
    });
    const result = await handlePictoryClassifyRequest(redactedInput(), {
      ...deps({ classifyItems }),
      consumeQuota,
    });

    expect(result.status).toBe(200);
    expect(calls).toEqual(["consume", "classify"]);
    expect(consumeQuota).toHaveBeenCalledWith(
      expect.objectContaining({
        entitlement,
        quota: { remaining: 40 },
      }),
    );
  });

  it("rejects when server AI quota cannot be reserved", async () => {
    const classifyItems = vi.fn(async () => []);
    const result = await handlePictoryClassifyRequest(redactedInput(), {
      ...deps({ classifyItems }),
      consumeQuota: vi.fn(async () => null),
    });

    expect(result.status).toBe(429);
    expect(result.body.error?.code).toBe("quota_exceeded");
    expect(classifyItems).not.toHaveBeenCalled();
  });

  it("refunds reserved quota when server AI classification fails", async () => {
    const refundQuota = vi.fn();
    const result = await handlePictoryClassifyRequest(redactedInput(), {
      ...deps({
        classifyItems: vi.fn(async () => {
          throw new Error("upstream failed");
        }),
      }),
      consumeQuota: vi.fn(async () => ({ remaining: 39 })),
      refundQuota,
    });

    expect(result.status).toBe(500);
    expect(result.body.error?.code).toBe("classification_failed");
    expect(refundQuota).toHaveBeenCalledWith(
      expect.objectContaining({
        entitlement,
        quota: { remaining: 39 },
        reason: "classification_failed",
      }),
    );
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

  it("uses the default OpenAI classifier without storing responses", async () => {
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        store?: boolean;
        text?: { format?: { type?: string; strict?: boolean } };
        input?: Array<{
          content?: Array<{
            type?: string;
            image_url?: string;
            detail?: string;
          }>;
        }>;
      };
      expect(body.store).toBe(false);
      expect(body.text?.format?.type).toBe("json_schema");
      expect(body.text?.format?.strict).toBe(true);
      const content = body.input?.[0]?.content ?? [];
      expect(content.some((entry) => entry.type === "input_image")).toBe(true);
      expect(
        content.some(
          (entry) =>
            entry.type === "input_image" &&
            entry.image_url === "data:image/jpeg;base64,abc123" &&
            entry.detail === "low",
        ),
      ).toBe(true);

      return new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            items: [
              {
                id: "photo-id",
                categoryId: "receipt",
                cleanBucketId: "needsReview",
                confidence: 0.91,
                privacy: "review",
                reasons: ["영수증", "결제 내역", "확인 필요"],
                hints: ["receipt"],
              },
            ],
          }),
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetch);

    const result = await handlePictoryClassifyRequest(
      imageInput(),
      deps({
        classifyItems: undefined,
        env: { OPENAI_API_KEY: "sk-test" },
      }),
    );

    expect(result.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/responses",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sk-test",
          "Content-Type": "application/json",
        }),
      }),
    );
    expect(result.body.items?.[0]).toMatchObject({
      id: "photo-id",
      categoryId: "receipt",
      cleanBucketId: "needsReview",
      privacy: "review",
    });
    expect(JSON.stringify(result.body)).not.toContain("imageDataUri");
  });

  it("classifies redacted-only batches without sending images to OpenAI", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const result = await handlePictoryClassifyRequest(
      redactedInput(),
      deps({
        classifyItems: undefined,
        env: { OPENAI_API_KEY: "sk-test" },
      }),
    );

    expect(result.status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
    expect(result.body.items?.[0]).toMatchObject({
      id: "sensitive-photo-id",
      categoryId: "document",
      cleanBucketId: "sensitive",
      privacy: "sensitive",
    });
  });

  it("returns 503 when the default OpenAI classifier is not configured", async () => {
    const result = await handlePictoryClassifyRequest(
      imageInput(),
      deps({ classifyItems: undefined, env: {} }),
    );

    expect(result.status).toBe(503);
    expect(result.body.error?.code).toBe("classifier_unconfigured");
  });
});

describe("defaultClassifyItems", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses output text content from the Responses API shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          output: [
            {
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    items: [
                      {
                        id: "photo-id",
                        categoryId: "food",
                        cleanBucketId: "keep",
                        confidence: 0.88,
                        privacy: "normal",
                        reasons: ["음식", "접시", "보관"],
                        hints: ["food"],
                      },
                    ],
                  }),
                },
              ],
            },
          ],
        }),
      ),
    );

    const items = await defaultClassifyItems(
      imageBody.items as PictoryClassifyRequestItem[],
      {
        schemaVersion: 1,
        itemCount: 1,
        headers: {},
        entitlement,
        quota: { remaining: 40 },
        env: { OPENAI_API_KEY: "sk-test" },
      },
    );

    expect(items[0]).toMatchObject({
      id: "photo-id",
      categoryId: "food",
      cleanBucketId: "keep",
    });
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
