import {
  loadFullScreenAd,
  showFullScreenAd,
} from "@apps-in-toss/web-framework";

const TEST_REWARDED_AD_GROUP_ID = "ait-ad-test-rewarded-id";

export async function showRewardedScanAd(): Promise<number> {
  const nativeReward = await showNativeRewardAd();
  if (nativeReward > 0) {
    return nativeReward;
  }

  await new Promise((resolve) => window.setTimeout(resolve, 450));
  return 100;
}

async function showNativeRewardAd() {
  try {
    if (
      loadFullScreenAd.isSupported() !== true ||
      showFullScreenAd.isSupported() !== true
    ) {
      return 0;
    }

    await new Promise<void>((resolve, reject) => {
      const cleanup = loadFullScreenAd({
        options: { adGroupId: TEST_REWARDED_AD_GROUP_ID },
        onEvent: (event) => {
          if (event.type === "loaded") {
            cleanup();
            resolve();
          }
        },
        onError: (error) => {
          cleanup();
          reject(error);
        },
      });
    });

    return await new Promise<number>((resolve, reject) => {
      let reward = 0;
      const cleanup = showFullScreenAd({
        options: { adGroupId: TEST_REWARDED_AD_GROUP_ID },
        onEvent: (event) => {
          if (event.type === "userEarnedReward") {
            reward = Number(event.data.unitAmount) || 100;
          }

          if (event.type === "dismissed" || event.type === "failedToShow") {
            cleanup();
            resolve(reward);
          }
        },
        onError: (error) => {
          cleanup();
          reject(error);
        },
      });
    });
  } catch {
    return 0;
  }
}
