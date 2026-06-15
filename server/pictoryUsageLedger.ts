import type {
  PictoryClassifyDeps,
  PictoryClassifyEntitlement,
  PictoryClassifyQuota,
  PictoryClassifyQuotaContext,
  PictoryClassifyRequestContext,
} from "./pictoryClassify";

type MaybePromise<T> = T | Promise<T>;
type PictoryPlanId = "free" | "plus" | "pro";

export interface PictoryUsageAccount {
  subjectId: string;
  planId: PictoryPlanId;
  subscriptionExpiresAt?: string;
  usageMonth: string;
  monthlyServerAiUsed: number;
  serverAiCredits: number;
  serverAiRateWindowStartedAt?: string;
  serverAiRateWindowUsed?: number;
  grantedRewardIds: string[];
}

export interface PictoryUsageLedgerStore {
  readAccount: (
    subjectId: string,
  ) => MaybePromise<PictoryUsageAccount | null | undefined>;
  writeAccount: (account: PictoryUsageAccount) => MaybePromise<void>;
  deleteAccount?: (subjectId: string) => MaybePromise<boolean | void>;
}

export interface PictoryUsageLedgerDeps {
  store: PictoryUsageLedgerStore;
  resolveSubjectId: (
    context: PictoryClassifyRequestContext,
  ) => MaybePromise<string | null | undefined>;
  env?: Record<string, string | undefined>;
  now?: () => Date;
}

export interface PictoryRewardGrantInput {
  account: PictoryUsageAccount;
  rewardId: string;
  rewardCredits?: number;
  maxCredits?: number;
}

export interface PictoryPlanSyncInput {
  store: PictoryUsageLedgerStore;
  subjectId: string;
  planId: PictoryPlanId;
  subscriptionExpiresAt?: string | null;
  now?: () => Date;
}

export const DEFAULT_SERVER_AI_CREDITS = {
  freeMonthlyQuota: 0,
  rewardCredits: 100,
  plusMonthlyQuota: 500,
  proMonthlyQuota: 2000,
  maxStoredCredits: 3000,
  rateLimitPerMinute: 40,
} as const;

export function createPictoryUsageLedgerDeps({
  store,
  resolveSubjectId,
  env = process.env,
  now = () => new Date(),
}: PictoryUsageLedgerDeps): Pick<
  PictoryClassifyDeps,
  "verifyEntitlement" | "verifyQuota" | "consumeQuota" | "refundQuota"
> {
  return {
    verifyEntitlement: async (context) => {
      const account = await readCurrentAccount(
        store,
        resolveSubjectId,
        context,
        now,
      );
      if (!account) {
        return null;
      }

      return toEntitlement(account, env, now());
    },
    verifyQuota: async (context) => {
      const account = await readAccountByEntitlement(
        store,
        context.entitlement,
      );
      return account
        ? toQuota(
            withEntitlementPlan(normalizeUsageMonth(account, now()), context),
            env,
          )
        : null;
    },
    consumeQuota: async (context) => {
      const account = await readAccountByEntitlement(
        store,
        context.entitlement,
      );
      if (!account) {
        return null;
      }

      const normalized = normalizeUsageMonth(account, now());
      const next = debitServerAiQuota(
        withEntitlementPlan(normalized, context),
        context.itemCount,
        env,
        now(),
      );
      if (!next) {
        return null;
      }

      await store.writeAccount(preserveAccountPlan(next.account, normalized));
      return next.quota;
    },
    refundQuota: async (context) => {
      const account = await readAccountByEntitlement(
        store,
        context.entitlement,
      );
      if (!account) {
        return;
      }

      await store.writeAccount(
        preserveAccountPlan(
          refundServerAiQuota(
            withEntitlementPlan(normalizeUsageMonth(account, now()), context),
            context.itemCount,
          ),
          account,
        ),
      );
    },
  };
}

export function createNewUsageAccount(
  subjectId: string,
  planId: PictoryPlanId = "free",
  date = new Date(),
): PictoryUsageAccount {
  return {
    subjectId,
    planId,
    usageMonth: currentUsageMonth(date),
    monthlyServerAiUsed: 0,
    serverAiCredits: 0,
    grantedRewardIds: [],
  };
}

export async function deleteUsageAccount(
  store: PictoryUsageLedgerStore,
  subjectId: string,
) {
  if (!store.deleteAccount) {
    return { supported: false, deleted: false };
  }

  const deleted = await store.deleteAccount(subjectId);
  return { supported: true, deleted: deleted !== false };
}

export async function syncUsageAccountPlan({
  store,
  subjectId,
  planId,
  subscriptionExpiresAt,
  now = () => new Date(),
}: PictoryPlanSyncInput) {
  const existing =
    (await store.readAccount(subjectId)) ??
    createNewUsageAccount(subjectId, "free", now());
  const account = normalizeUsageMonth(existing, now());
  const next: PictoryUsageAccount = {
    ...account,
    planId,
    subscriptionExpiresAt:
      planId === "free" ? undefined : subscriptionExpiresAt ?? undefined,
  };

  await store.writeAccount(next);
  return next;
}

export function grantRewardCredits({
  account,
  rewardId,
  rewardCredits = DEFAULT_SERVER_AI_CREDITS.rewardCredits,
  maxCredits = DEFAULT_SERVER_AI_CREDITS.maxStoredCredits,
}: PictoryRewardGrantInput) {
  if (account.grantedRewardIds.includes(rewardId)) {
    return { account, granted: 0 };
  }

  const before = account.serverAiCredits;
  const after = Math.min(maxCredits, before + Math.max(0, rewardCredits));
  return {
    account: {
      ...account,
      serverAiCredits: after,
      grantedRewardIds: [rewardId, ...account.grantedRewardIds].slice(0, 100),
    },
    granted: after - before,
  };
}

export function normalizeUsageMonth(
  account: PictoryUsageAccount,
  date = new Date(),
) {
  const usageMonth = currentUsageMonth(date);
  if (account.usageMonth === usageMonth) {
    return account;
  }

  return {
    ...account,
    usageMonth,
    monthlyServerAiUsed: 0,
  };
}

export function toEntitlement(
  account: PictoryUsageAccount,
  env: Record<string, string | undefined> = process.env,
  date = new Date(),
): PictoryClassifyEntitlement | null {
  const paid = isPaidPlanActive(account, date);
  const quota = toQuota(
    paid
      ? normalizeUsageMonth(account, date)
      : { ...normalizeUsageMonth(account, date), planId: "free" },
    env,
  );
  if (!paid && quota.remaining <= 0) {
    return null;
  }

  return {
    subjectId: account.subjectId,
    planId: paid ? account.planId : "free",
    active: true,
    serverAiAccess: paid ? "paid" : "credit",
  };
}

export function toQuota(
  account: PictoryUsageAccount,
  env: Record<string, string | undefined> = process.env,
): PictoryClassifyQuota {
  const monthlyQuota = getMonthlyServerAiQuota(account.planId, env);
  const monthlyLeft = Math.max(0, monthlyQuota - account.monthlyServerAiUsed);
  const creditLeft = Math.max(0, account.serverAiCredits);

  return {
    remaining: monthlyLeft + creditLeft,
  };
}

export function debitServerAiQuota(
  account: PictoryUsageAccount,
  count: number,
  env: Record<string, string | undefined> = process.env,
  date = new Date(),
) {
  const requested = Math.max(0, count);
  const monthlyQuota = getMonthlyServerAiQuota(account.planId, env);
  const monthlyLeft = Math.max(0, monthlyQuota - account.monthlyServerAiUsed);
  const monthlyUse = Math.min(monthlyLeft, requested);
  const creditUse = requested - monthlyUse;

  if (creditUse > account.serverAiCredits) {
    return null;
  }

  const debitedAccount = {
    ...account,
    monthlyServerAiUsed: account.monthlyServerAiUsed + monthlyUse,
    serverAiCredits: account.serverAiCredits - creditUse,
  };
  const nextAccount = reserveServerAiRateLimit(
    debitedAccount,
    requested,
    env,
    date,
  );
  if (!nextAccount) {
    return null;
  }

  return {
    account: nextAccount,
    quota: toQuota(nextAccount, env),
  };
}

export function refundServerAiQuota(
  account: PictoryUsageAccount,
  count: number,
) {
  const requested = Math.max(0, count);
  const monthlyRefund = Math.min(account.monthlyServerAiUsed, requested);
  const creditRefund = requested - monthlyRefund;

  return {
    ...account,
    monthlyServerAiUsed: account.monthlyServerAiUsed - monthlyRefund,
    serverAiCredits: Math.min(
      DEFAULT_SERVER_AI_CREDITS.maxStoredCredits,
      account.serverAiCredits + creditRefund,
    ),
    usageMonth: account.usageMonth || currentUsageMonth(),
  };
}

export function getMonthlyServerAiQuota(
  planId: PictoryPlanId,
  env: Record<string, string | undefined> = process.env,
) {
  if (planId === "plus") {
    return readIntegerEnv(
      env.PICTORY_AI_PLUS_MONTHLY_QUOTA,
      DEFAULT_SERVER_AI_CREDITS.plusMonthlyQuota,
    );
  }
  if (planId === "pro") {
    return readIntegerEnv(
      env.PICTORY_AI_PRO_MONTHLY_QUOTA,
      DEFAULT_SERVER_AI_CREDITS.proMonthlyQuota,
    );
  }

  return readIntegerEnv(
    env.PICTORY_AI_FREE_MONTHLY_QUOTA,
    DEFAULT_SERVER_AI_CREDITS.freeMonthlyQuota,
  );
}

export function getServerAiRateLimitPerMinute(
  env: Record<string, string | undefined> = process.env,
) {
  return readIntegerEnv(
    env.PICTORY_AI_RATE_LIMIT_PER_MINUTE,
    DEFAULT_SERVER_AI_CREDITS.rateLimitPerMinute,
  );
}

export function currentUsageMonth(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

async function readCurrentAccount(
  store: PictoryUsageLedgerStore,
  resolveSubjectId: PictoryUsageLedgerDeps["resolveSubjectId"],
  context: PictoryClassifyRequestContext,
  now: () => Date,
) {
  const subjectId = await resolveSubjectId(context);
  if (!subjectId) {
    return null;
  }

  const account = await store.readAccount(subjectId);
  return account ? normalizeUsageMonth(account, now()) : null;
}

async function readAccountByEntitlement(
  store: PictoryUsageLedgerStore,
  entitlement: PictoryClassifyQuotaContext["entitlement"],
) {
  if (!entitlement.active || !entitlement.subjectId) {
    return null;
  }

  return store.readAccount(entitlement.subjectId);
}

function withEntitlementPlan(
  account: PictoryUsageAccount,
  context: PictoryClassifyQuotaContext,
) {
  return {
    ...account,
    planId:
      context.entitlement.serverAiAccess === "paid" ? account.planId : "free",
  };
}

function preserveAccountPlan(
  next: PictoryUsageAccount,
  original: PictoryUsageAccount,
): PictoryUsageAccount {
  return {
    ...next,
    planId: original.planId,
    subscriptionExpiresAt: original.subscriptionExpiresAt,
  };
}

function reserveServerAiRateLimit(
  account: PictoryUsageAccount,
  count: number,
  env: Record<string, string | undefined>,
  date: Date,
): PictoryUsageAccount | null {
  if (count <= 0) {
    return account;
  }

  const limit = getServerAiRateLimitPerMinute(env);
  const windowStartedAt = currentRateWindow(date);
  const windowUsed =
    account.serverAiRateWindowStartedAt === windowStartedAt
      ? account.serverAiRateWindowUsed ?? 0
      : 0;

  if (windowUsed + count > limit) {
    return null;
  }

  return {
    ...account,
    serverAiRateWindowStartedAt: windowStartedAt,
    serverAiRateWindowUsed: windowUsed + count,
  };
}

function currentRateWindow(date: Date) {
  const windowStart = new Date(date);
  windowStart.setUTCSeconds(0, 0);
  return windowStart.toISOString();
}

function isPaidPlanActive(account: PictoryUsageAccount, date: Date) {
  if (account.planId === "free") {
    return false;
  }
  if (!account.subscriptionExpiresAt) {
    return true;
  }

  return new Date(account.subscriptionExpiresAt).getTime() > date.getTime();
}

function readIntegerEnv(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}
