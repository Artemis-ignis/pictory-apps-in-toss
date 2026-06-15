import { afterEach, describe, expect, it, vi } from "vitest";
import { grantRewardCredits } from "../src/features/ads/rewardCredit";
import type { RewardedScanAdResult } from "../src/features/ads/rewardAd";

const reward: RewardedScanAdResult = {
  reward: 100,
  rewardId: "reward-event-1",
  source: "native",
  adGroupId: "reward-ad-group",
  usingTestAdGroup: false,
  unitType: "scan",
};

describe("rewardCredit", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses local credits only when no server reward endpoint is configured", async () => {
    await expect(grantRewardCredits(reward, {})).resolves.toMatchObject({
      granted: 100,
      source: "localOnly",
      duplicated: false,
    });
  });

  it("syncs rewarded ads to the server ledger endpoint with credentials", async () => {
    let requestBody = "";
    const fetch = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        requestBody = String(init?.body ?? "");
        return Response.json({
          granted: 100,
          duplicated: false,
          serverAiCredits: 250,
        });
      },
    );
    vi.stubGlobal("fetch", fetch);

    await expect(
      grantRewardCredits(reward, {
        VITE_PICTORY_REWARD_ENDPOINT: "https://api.example.com/pictory/reward",
      }),
    ).resolves.toMatchObject({
      granted: 100,
      source: "server",
      duplicated: false,
      serverAiCredits: 250,
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.com/pictory/reward",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.objectContaining({
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Pictory-Request-Id": "reward-sync-reward-event-1",
        }),
      }),
    );
    expect(JSON.parse(requestBody)).toEqual({
      rewardId: "reward-event-1",
      adGroupId: "reward-ad-group",
      source: "native",
      unitType: "scan",
      unitAmount: 100,
      usingTestAdGroup: false,
    });
  });

  it("does not fall back to local credits when the configured server endpoint fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );

    await expect(
      grantRewardCredits(reward, {
        VITE_PICTORY_REWARD_ENDPOINT: "https://api.example.com/pictory/reward",
      }),
    ).resolves.toMatchObject({
      granted: 0,
      source: "serverFailed",
    });
  });

  it("keeps duplicated server reward grants at zero", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          granted: 0,
          duplicated: true,
          serverAiCredits: 100,
        }),
      ),
    );

    await expect(
      grantRewardCredits(reward, {
        VITE_PICTORY_REWARD_ENDPOINT: "https://api.example.com/pictory/reward",
      }),
    ).resolves.toMatchObject({
      granted: 0,
      source: "server",
      duplicated: true,
      serverAiCredits: 100,
    });
  });
});
