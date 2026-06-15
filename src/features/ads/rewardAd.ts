import {
  loadFullScreenAd,
  showFullScreenAd,
} from "@apps-in-toss/web-framework";

export const TEST_REWARDED_AD_GROUP_ID = "ait-ad-test-rewarded-id";
export const DEFAULT_SCAN_REWARD = 100;

interface RewardAdEnv {
  DEV?: boolean;
  VITE_TOSS_REWARDED_AD_GROUP_ID?: string;
}

export type RewardedScanAdSource =
  | "native"
  | "localFallback"
  | "unsupported"
  | "dismissed"
  | "failedToShow"
  | "error";

export interface RewardedScanAdResult {
  reward: number;
  source: RewardedScanAdSource;
  adGroupId: string;
  usingTestAdGroup: boolean;
}

type NativeRewardAdResult = {
  reward: number;
  status:
    | Exclude<RewardedScanAdSource, "native" | "localFallback">
    | "rewarded";
};

let preloadedAdGroupId: string | null = null;
let preloadPromise: Promise<boolean> | null = null;

export function getRewardedAdGroupId(env: RewardAdEnv = import.meta.env) {
  return (
    env.VITE_TOSS_REWARDED_AD_GROUP_ID?.trim() || TEST_REWARDED_AD_GROUP_ID
  );
}

export function isUsingTestRewardedAdGroup(env: RewardAdEnv = import.meta.env) {
  return getRewardedAdGroupId(env) === TEST_REWARDED_AD_GROUP_ID;
}

export function isLocalRewardFallbackAllowed(
  env: RewardAdEnv = import.meta.env,
  hostname = window.location.hostname,
) {
  return env.DEV || hostname === "localhost" || hostname === "127.0.0.1";
}

export async function preloadRewardedScanAd(
  adGroupId = getRewardedAdGroupId(),
): Promise<boolean> {
  if (loadFullScreenAd.isSupported() !== true) {
    return false;
  }

  if (preloadPromise != null && preloadedAdGroupId === adGroupId) {
    return preloadPromise;
  }

  preloadedAdGroupId = adGroupId;
  preloadPromise = waitForAdLoad(adGroupId)
    .then(() => true)
    .catch(() => {
      clearPreloadedAd();
      return false;
    });

  return preloadPromise;
}

export async function showRewardedScanAd(): Promise<RewardedScanAdResult> {
  const adGroupId = getRewardedAdGroupId();
  const usingTestAdGroup = isUsingTestRewardedAdGroup();
  const nativeReward = await showNativeRewardAd(adGroupId);

  if (nativeReward.status === "rewarded") {
    return {
      reward: nativeReward.reward,
      source: "native",
      adGroupId,
      usingTestAdGroup,
    };
  }

  if (
    (nativeReward.status === "unsupported" ||
      nativeReward.status === "error") &&
    isLocalRewardFallbackAllowed()
  ) {
    await delay(450);
    return {
      reward: DEFAULT_SCAN_REWARD,
      source: "localFallback",
      adGroupId,
      usingTestAdGroup,
    };
  }

  return {
    reward: 0,
    source: nativeReward.status,
    adGroupId,
    usingTestAdGroup,
  };
}

async function showNativeRewardAd(
  adGroupId: string,
): Promise<NativeRewardAdResult> {
  try {
    if (
      loadFullScreenAd.isSupported() !== true ||
      showFullScreenAd.isSupported() !== true
    ) {
      return { reward: 0, status: "unsupported" };
    }

    const isLoaded = await preloadRewardedScanAd(adGroupId);
    if (!isLoaded) {
      return { reward: 0, status: "error" };
    }

    const result = await waitForAdShow(adGroupId);
    clearPreloadedAd();
    void preloadRewardedScanAd(adGroupId);
    return result;
  } catch {
    clearPreloadedAd();
    return { reward: 0, status: "error" };
  }
}

function clearPreloadedAd() {
  preloadedAdGroupId = null;
  preloadPromise = null;
}

function waitForAdLoad(adGroupId: string) {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let cleanup = () => undefined;

    const finish = (action: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeout);
      cleanup();
      action();
    };

    const timeout = window.setTimeout(() => {
      finish(() => reject(new Error("Reward ad load timed out")));
    }, 15_000);

    cleanup = loadFullScreenAd({
      options: { adGroupId },
      onEvent: (event) => {
        if (event.type === "loaded") {
          finish(resolve);
        }
      },
      onError: (error) => {
        finish(() => reject(error));
      },
    });
  });
}

function waitForAdShow(adGroupId: string) {
  return new Promise<NativeRewardAdResult>((resolve, reject) => {
    let reward = 0;
    let settled = false;
    let cleanup = () => undefined;

    const finish = (action: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeout);
      cleanup();
      action();
    };

    const timeout = window.setTimeout(() => {
      finish(() => reject(new Error("Reward ad show timed out")));
    }, 120_000);

    cleanup = showFullScreenAd({
      options: { adGroupId },
      onEvent: (event) => {
        if (event.type === "userEarnedReward") {
          reward = Number(event.data.unitAmount) || DEFAULT_SCAN_REWARD;
        }

        if (event.type === "dismissed") {
          finish(() =>
            resolve({
              reward,
              status: reward > 0 ? "rewarded" : "dismissed",
            }),
          );
        }

        if (event.type === "failedToShow") {
          finish(() => resolve({ reward: 0, status: "failedToShow" }));
        }
      },
      onError: (error) => {
        finish(() => reject(error));
      },
    });
  });
}

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
