import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const adBridge = vi.hoisted(() => ({
  loadSupported: true,
  showSupported: true,
  showHandler: null as
    | null
    | ((event: { type: string; data?: unknown }) => void),
}));

vi.mock("@apps-in-toss/web-framework", () => {
  const loadFullScreenAd = Object.assign(
    vi.fn(({ onEvent }) => {
      queueMicrotask(() => onEvent({ type: "loaded" }));
      return () => undefined;
    }),
    {
      isSupported: vi.fn(() => adBridge.loadSupported),
    },
  );
  const showFullScreenAd = Object.assign(
    vi.fn(({ onEvent }) => {
      adBridge.showHandler = onEvent;
      return () => undefined;
    }),
    {
      isSupported: vi.fn(() => adBridge.showSupported),
    },
  );

  return { loadFullScreenAd, showFullScreenAd };
});

import {
  DEFAULT_SCAN_REWARD,
  getRewardedAdGroupId,
  isLocalRewardFallbackAllowed,
  isUsingTestRewardedAdGroup,
  showRewardedScanAd,
  TEST_REWARDED_AD_GROUP_ID,
} from "../src/features/ads/rewardAd";

describe("rewardAd config", () => {
  beforeEach(() => {
    adBridge.loadSupported = true;
    adBridge.showSupported = true;
    adBridge.showHandler = null;
    vi.stubGlobal("window", {
      location: { hostname: "service.example.com" },
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses Toss test rewarded ad id by default", () => {
    expect(
      getRewardedAdGroupId({
        DEV: false,
        VITE_TOSS_REWARDED_AD_GROUP_ID: "",
      }),
    ).toBe(TEST_REWARDED_AD_GROUP_ID);
  });

  it("trims and uses production rewarded ad group id from env", () => {
    const env = {
      DEV: false,
      VITE_TOSS_REWARDED_AD_GROUP_ID: "  ait.prod.rewarded-id  ",
    };

    expect(getRewardedAdGroupId(env)).toBe("ait.prod.rewarded-id");
    expect(isUsingTestRewardedAdGroup(env)).toBe(false);
  });

  it("allows reward fallback only in local development contexts", () => {
    expect(
      isLocalRewardFallbackAllowed(
        { DEV: false, VITE_TOSS_REWARDED_AD_GROUP_ID: undefined },
        "localhost",
      ),
    ).toBe(true);
    expect(
      isLocalRewardFallbackAllowed(
        { DEV: true, VITE_TOSS_REWARDED_AD_GROUP_ID: undefined },
        "example.com",
      ),
    ).toBe(true);
    expect(
      isLocalRewardFallbackAllowed(
        { DEV: false, VITE_TOSS_REWARDED_AD_GROUP_ID: undefined },
        "service.example.com",
      ),
    ).toBe(false);
  });

  it("grants scan credits only after the rewarded ad event is earned and dismissed", async () => {
    const resultPromise = showRewardedScanAd();
    const showHandler = await waitForShowHandler();
    let settled = false;
    resultPromise.then(() => {
      settled = true;
    });

    showHandler({
      type: "userEarnedReward",
      data: { unitAmount: 120 },
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    showHandler({ type: "dismissed" });

    await expect(resultPromise).resolves.toMatchObject({
      reward: 120,
      rewardId: expect.any(String),
      source: "native",
    });
  });

  it("does not grant scan credits when a rewarded ad is dismissed without reward", async () => {
    const resultPromise = showRewardedScanAd();
    const showHandler = await waitForShowHandler();

    showHandler({ type: "dismissed" });

    await expect(resultPromise).resolves.toMatchObject({
      reward: 0,
      source: "dismissed",
    });
  });

  it("falls back to the default reward amount when the ad reward payload is empty", async () => {
    const resultPromise = showRewardedScanAd();
    const showHandler = await waitForShowHandler();

    showHandler({ type: "userEarnedReward", data: {} });
    showHandler({ type: "dismissed" });

    await expect(resultPromise).resolves.toMatchObject({
      reward: DEFAULT_SCAN_REWARD,
      rewardId: expect.any(String),
      source: "native",
    });
  });

  it("does not grant scan credits when a rewarded ad fails to show", async () => {
    const resultPromise = showRewardedScanAd();
    const showHandler = await waitForShowHandler();

    showHandler({ type: "failedToShow" });

    await expect(resultPromise).resolves.toMatchObject({
      reward: 0,
      source: "failedToShow",
    });
  });
});

async function waitForShowHandler() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await Promise.resolve();
    if (adBridge.showHandler != null) {
      return adBridge.showHandler;
    }
  }

  throw new Error("Reward ad show handler was not registered");
}
