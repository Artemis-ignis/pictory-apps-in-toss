import type { PersistedPictoryState, PlanId } from "../album/types";

export interface UsagePlan {
  id: PlanId;
  label: string;
  priceLabel: string;
  monthlyScanCredits: number;
  storageLimit: number;
  perRunLimit: number;
  description: string;
}

export interface ScanAllowance {
  plan: UsagePlan;
  monthlyLeft: number;
  totalLeft: number;
  nextBatchLimit: number;
}

export const USAGE_PLANS: UsagePlan[] = [
  {
    id: "free",
    label: "무료",
    priceLabel: "0원",
    monthlyScanCredits: 40,
    storageLimit: 10,
    perRunLimit: 40,
    description: "가끔 정리하는 기본 사용자",
  },
  {
    id: "plus",
    label: "플러스",
    priceLabel: "월 2,900원",
    monthlyScanCredits: 500,
    storageLimit: 200,
    perRunLimit: 180,
    description: "사진첩이 자주 쌓이는 사용자",
  },
  {
    id: "pro",
    label: "프로",
    priceLabel: "월 6,900원",
    monthlyScanCredits: 2000,
    storageLimit: 1000,
    perRunLimit: 300,
    description: "수백 장 단위로 정리하는 사용자",
  },
];

export function currentUsageMonth(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function getPlan(planId: PlanId) {
  return USAGE_PLANS.find((plan) => plan.id === planId) ?? USAGE_PLANS[0];
}

export function normalizeBillingState(
  state: PersistedPictoryState,
  month = currentUsageMonth(),
): PersistedPictoryState {
  if (state.usageMonth === month) {
    return state;
  }

  return {
    ...state,
    usageMonth: month,
    monthlyScanUsed: 0,
  };
}

export function getScanAllowance(state: PersistedPictoryState): ScanAllowance {
  const plan = getPlan(state.planId);
  const monthlyLeft = Math.max(
    0,
    plan.monthlyScanCredits - state.monthlyScanUsed,
  );
  const totalLeft = monthlyLeft + state.credits;

  return {
    plan,
    monthlyLeft,
    totalLeft,
    nextBatchLimit: Math.max(0, Math.min(plan.perRunLimit, totalLeft)),
  };
}

export function consumeScanAllowance(
  state: PersistedPictoryState,
  count: number,
): PersistedPictoryState {
  const plan = getPlan(state.planId);
  const monthlyLeft = Math.max(
    0,
    plan.monthlyScanCredits - state.monthlyScanUsed,
  );
  const monthlyUse = Math.min(monthlyLeft, count);
  const creditUse = Math.max(0, count - monthlyUse);

  return {
    ...state,
    monthlyScanUsed: state.monthlyScanUsed + monthlyUse,
    credits: Math.max(0, state.credits - creditUse),
  };
}

export function canSaveMore(state: PersistedPictoryState, savedCount: number) {
  return savedCount < getPlan(state.planId).storageLimit;
}
