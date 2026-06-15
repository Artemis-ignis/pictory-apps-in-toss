import { describe, expect, it } from "vitest";
import {
  getRewardedAdGroupId,
  isLocalRewardFallbackAllowed,
  isUsingTestRewardedAdGroup,
  TEST_REWARDED_AD_GROUP_ID,
} from "../src/features/ads/rewardAd";

describe("rewardAd config", () => {
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
});
