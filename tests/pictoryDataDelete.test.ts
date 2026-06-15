import { afterEach, describe, expect, it, vi } from "vitest";
import { deletePictoryServerData } from "../src/features/privacy/pictoryDataDelete";

describe("pictoryDataDelete", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("skips server deletion when no endpoint is configured", async () => {
    await expect(deletePictoryServerData({})).resolves.toEqual({
      status: "skipped",
    });
  });

  it("calls the configured server delete endpoint with credentials", async () => {
    const fetch = vi.fn(async () => Response.json({ deleted: true }));
    vi.stubGlobal("fetch", fetch);

    await expect(
      deletePictoryServerData({
        VITE_PICTORY_DELETE_ENDPOINT: "https://api.example.com/pictory/account",
      }),
    ).resolves.toEqual({ status: "deleted" });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.com/pictory/account",
      expect.objectContaining({
        method: "DELETE",
        credentials: "include",
        headers: expect.objectContaining({
          Accept: "application/json",
        }),
      }),
    );
  });

  it("distinguishes missing server accounts from failed deletes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ deleted: false })),
    );

    await expect(
      deletePictoryServerData({
        VITE_PICTORY_DELETE_ENDPOINT: "https://api.example.com/pictory/account",
      }),
    ).resolves.toEqual({ status: "missing" });
  });

  it("reports server failures without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );

    await expect(
      deletePictoryServerData({
        VITE_PICTORY_DELETE_ENDPOINT: "https://api.example.com/pictory/account",
      }),
    ).resolves.toEqual({ status: "serverFailed" });
  });
});
