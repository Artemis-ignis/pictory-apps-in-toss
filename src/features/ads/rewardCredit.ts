import type { RewardedScanAdResult } from "./rewardAd";

interface RewardCreditEnv {
  VITE_PICTORY_REWARD_ENDPOINT?: string;
}

interface RewardCreditResponse {
  granted?: number;
  duplicated?: boolean;
  serverAiCredits?: number;
}

export type RewardCreditGrantSource =
  | "server"
  | "localFallback"
  | "localOnly"
  | "serverFailed";

export interface RewardCreditGrantResult {
  granted: number;
  source: RewardCreditGrantSource;
  duplicated: boolean;
  serverAiCredits?: number;
}

export async function grantRewardCredits(
  reward: RewardedScanAdResult,
  env: RewardCreditEnv = import.meta.env as RewardCreditEnv,
): Promise<RewardCreditGrantResult> {
  if (reward.reward <= 0) {
    return {
      granted: 0,
      source: "localOnly",
      duplicated: false,
    };
  }

  const endpoint = env.VITE_PICTORY_REWARD_ENDPOINT?.trim();
  if (!endpoint) {
    return {
      granted: reward.reward,
      source: reward.source === "localFallback" ? "localFallback" : "localOnly",
      duplicated: false,
    };
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Pictory-Request-Id": createRewardRequestId(reward),
      },
      body: JSON.stringify({
        rewardId: reward.rewardId,
        adGroupId: reward.adGroupId,
        source: reward.source,
        unitType: reward.unitType,
        unitAmount: reward.reward,
        usingTestAdGroup: reward.usingTestAdGroup,
      }),
    });

    if (!response.ok) {
      return serverFailed();
    }

    const data = (await response.json()) as RewardCreditResponse;
    return {
      granted: clampGrantedCredits(data.granted),
      source: "server",
      duplicated: data.duplicated === true,
      serverAiCredits:
        typeof data.serverAiCredits === "number" &&
        Number.isFinite(data.serverAiCredits)
          ? Math.max(0, data.serverAiCredits)
          : undefined,
    };
  } catch {
    return serverFailed();
  }
}

function createRewardRequestId(reward: RewardedScanAdResult) {
  return `reward-sync-${reward.rewardId}`;
}

function clampGrantedCredits(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(3000, value))
    : 0;
}

function serverFailed(): RewardCreditGrantResult {
  return {
    granted: 0,
    source: "serverFailed",
    duplicated: false,
  };
}
