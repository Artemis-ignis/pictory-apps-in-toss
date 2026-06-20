import type {
  PictoryClassifyDeps,
  PictoryClassifyEntitlement,
  PictoryClassifyQuota,
  PictoryClassifyQuotaContext,
  PictoryClassifyQuotaReservation,
  PictoryClassifyRequestContext,
} from "./pictoryClassify";

type MaybePromise<T> = T | Promise<T>;
type PictoryPlanId = "free" | "plus" | "pro";

export const GLOBAL_USAGE_SUBJECT_ID = "__pictory_global__";

export interface PictoryUsageAccount {
  subjectId: string;
  planId: PictoryPlanId;
  subscriptionExpiresAt?: string;
  usageMonth: string;
  monthlyServerAiUsed: number;
  serverAiCredits: number;
  serverAiDailyWindowStartedAt?: string;
  serverAiDailyUsed?: number;
  serverAiRateWindowStartedAt?: string;
  serverAiRateWindowUsed?: number;
  monthlyRewardCreditsGranted?: number;
  rewardDailyWindowStartedAt?: string;
  rewardDailyCreditsGranted?: number;
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
  dailyCreditLimit?: number;
  monthlyCreditLimit?: number;
  date?: Date;
}

export interface PictoryPlanSyncInput {
  store: PictoryUsageLedgerStore;
  subjectId: string;
  planId: PictoryPlanId;
  subscriptionExpiresAt?: string | null;
  now?: () => Date;
}

export interface PictoryUsageRefundOptions {
  reservation?: PictoryClassifyQuotaReservation;
}

export const DEFAULT_SERVER_AI_CREDITS = {
  freeMonthlyQuota: 0,
  rewardCredits: 30,
  plusMonthlyQuota: 500,
  proMonthlyQuota: 2000,
  maxStoredCredits: 300,
  rewardDailyCreditLimit: 90,
  rewardMonthlyCreditLimit: 300,
  dailyLimitPerUser: 300,
  dailyGlobalLimit: 5000,
  rateLimitPerMinute: 40,
} as const;

let usageLedgerWriteLock = Promise.resolve();

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
      if (!account) {
        return null;
      }

      const date = now();
      const userQuota = toQuota(
        withEntitlementPlan(normalizeUsageMonth(account, date), context),
        env,
        date,
      );
      const globalQuota = toGlobalQuota(
        await readGlobalUsageAccount(store, date),
        env,
        date,
      );
      return minQuota(userQuota, globalQuota);
    },
    consumeQuota: async (context) => {
      return withUsageLedgerWriteLock(async () => {
        const account = await readAccountByEntitlement(
          store,
          context.entitlement,
        );
        if (!account) {
          return null;
        }

        const date = now();
        const normalized = normalizeUsageMonth(account, date);
        const next = debitServerAiQuota(
          withEntitlementPlan(normalized, context),
          context.itemCount,
          env,
          date,
        );
        if (!next) {
          return null;
        }

        const nextGlobal = debitGlobalServerAiQuota(
          await readGlobalUsageAccount(store, date),
          context.itemCount,
          env,
          date,
        );
        if (!nextGlobal) {
          return null;
        }

        await store.writeAccount(nextGlobal.account);
        await store.writeAccount(preserveAccountPlan(next.account, normalized));
        return minQuota(next.quota, nextGlobal.quota);
      });
    },
    refundQuota: async (context) => {
      await withUsageLedgerWriteLock(async () => {
        const account = await readAccountByEntitlement(
          store,
          context.entitlement,
        );
        if (!account) {
          return;
        }

        const date = now();
        const globalAccount = await readGlobalUsageAccount(store, date);
        await store.writeAccount(
          refundGlobalServerAiQuota(
            globalAccount,
            context.quota.reservation?.globalDailyUsed ?? context.itemCount,
          ),
        );
        await store.writeAccount(
          preserveAccountPlan(
            refundServerAiQuota(
              withEntitlementPlan(normalizeUsageMonth(account, date), context),
              context.itemCount,
              { reservation: context.quota.reservation },
            ),
            account,
          ),
        );
      });
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
    monthlyRewardCreditsGranted: 0,
    grantedRewardIds: [],
  };
}

export function createGlobalUsageAccount(date = new Date()): PictoryUsageAccount {
  return createNewUsageAccount(GLOBAL_USAGE_SUBJECT_ID, "free", date);
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
  dailyCreditLimit = DEFAULT_SERVER_AI_CREDITS.rewardDailyCreditLimit,
  monthlyCreditLimit = DEFAULT_SERVER_AI_CREDITS.rewardMonthlyCreditLimit,
  date = new Date(),
}: PictoryRewardGrantInput) {
  if (account.grantedRewardIds.includes(rewardId)) {
    return { account, granted: 0, reason: "duplicate" as const };
  }

  const day = currentDayWindow(date);
  const dailyGranted =
    account.rewardDailyWindowStartedAt === day
      ? account.rewardDailyCreditsGranted ?? 0
      : 0;
  const monthlyGranted = account.monthlyRewardCreditsGranted ?? 0;
  const requested = Math.max(0, rewardCredits);
  const byStoredCredits = Math.max(0, maxCredits - account.serverAiCredits);
  const byDailyLimit = Math.max(0, dailyCreditLimit - dailyGranted);
  const byMonthlyLimit = Math.max(0, monthlyCreditLimit - monthlyGranted);
  const granted = Math.min(
    requested,
    byStoredCredits,
    byDailyLimit,
    byMonthlyLimit,
  );
  const reason =
    granted > 0
      ? "granted"
      : byStoredCredits <= 0
        ? "stored_limit"
        : byDailyLimit <= 0
          ? "daily_limit"
          : byMonthlyLimit <= 0
            ? "monthly_limit"
            : "granted";

  return {
    account: {
      ...account,
      serverAiCredits: account.serverAiCredits + granted,
      monthlyRewardCreditsGranted: monthlyGranted + granted,
      rewardDailyWindowStartedAt: day,
      rewardDailyCreditsGranted: dailyGranted + granted,
      grantedRewardIds: [rewardId, ...account.grantedRewardIds].slice(0, 100),
    },
    granted,
    reason,
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
    monthlyRewardCreditsGranted: 0,
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
    date,
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
  date = new Date(),
): PictoryClassifyQuota {
  const monthlyQuota = getMonthlyServerAiQuota(account.planId, env);
  const monthlyLeft = Math.max(0, monthlyQuota - account.monthlyServerAiUsed);
  const creditLeft = Math.max(0, account.serverAiCredits);
  const dailyLeft = getServerAiDailyLimitLeft(account, env, date);

  return {
    remaining: Math.min(monthlyLeft + creditLeft, dailyLeft),
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
  const dailyReservedAccount = reserveServerAiDailyLimit(
    debitedAccount,
    requested,
    env,
    date,
  );
  if (!dailyReservedAccount) {
    return null;
  }

  const rateReservedAccount = reserveServerAiRateLimit(
    dailyReservedAccount,
    requested,
    env,
    date,
  );
  if (!rateReservedAccount) {
    return null;
  }

  return {
    account: rateReservedAccount,
    quota: {
      ...toQuota(rateReservedAccount, env, date),
      reservation: {
        monthlyUsed: monthlyUse,
        creditUsed: creditUse,
      },
    },
  };
}

export function debitGlobalServerAiQuota(
  account: PictoryUsageAccount,
  count: number,
  env: Record<string, string | undefined> = process.env,
  date = new Date(),
) {
  const nextAccount = reserveServerAiGlobalDailyLimit(
    account,
    Math.max(0, count),
    env,
    date,
  );
  if (!nextAccount) {
    return null;
  }

  return {
    account: nextAccount,
    quota: {
      ...toGlobalQuota(nextAccount, env, date),
      reservation: {
        globalDailyUsed: Math.max(0, count),
      },
    },
  };
}

export function refundServerAiQuota(
  account: PictoryUsageAccount,
  count: number,
  options: PictoryUsageRefundOptions = {},
) {
  const requested = Math.max(0, count);
  const reservedMonthly = options.reservation?.monthlyUsed;
  const reservedCredits = options.reservation?.creditUsed;
  const monthlyRefund = Math.min(
    account.monthlyServerAiUsed,
    reservedMonthly ?? requested,
  );
  const creditRefund = Math.max(0, reservedCredits ?? requested - monthlyRefund);

  return {
    ...account,
    monthlyServerAiUsed: account.monthlyServerAiUsed - monthlyRefund,
    serverAiCredits: Math.min(
      DEFAULT_SERVER_AI_CREDITS.maxStoredCredits,
      account.serverAiCredits + creditRefund,
    ),
    serverAiDailyUsed:
      account.serverAiDailyUsed == null
        ? undefined
        : Math.max(0, account.serverAiDailyUsed - requested),
    usageMonth: account.usageMonth || currentUsageMonth(),
  };
}

export function refundGlobalServerAiQuota(
  account: PictoryUsageAccount,
  count: number,
) {
  const requested = Math.max(0, count);
  return {
    ...account,
    serverAiDailyUsed:
      account.serverAiDailyUsed == null
        ? undefined
        : Math.max(0, account.serverAiDailyUsed - requested),
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

export function getServerAiDailyLimitPerUser(
  env: Record<string, string | undefined> = process.env,
) {
  return readIntegerEnv(
    env.PICTORY_AI_DAILY_LIMIT_PER_USER,
    DEFAULT_SERVER_AI_CREDITS.dailyLimitPerUser,
  );
}

export function getServerAiDailyGlobalLimit(
  env: Record<string, string | undefined> = process.env,
) {
  return readIntegerEnv(
    env.PICTORY_AI_DAILY_GLOBAL_LIMIT,
    DEFAULT_SERVER_AI_CREDITS.dailyGlobalLimit,
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

async function readGlobalUsageAccount(
  store: PictoryUsageLedgerStore,
  date: Date,
) {
  return (
    (await store.readAccount(GLOBAL_USAGE_SUBJECT_ID)) ??
    createGlobalUsageAccount(date)
  );
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

function getServerAiDailyLimitLeft(
  account: PictoryUsageAccount,
  env: Record<string, string | undefined>,
  date = new Date(),
) {
  const limit = getServerAiDailyLimitPerUser(env);
  const windowStartedAt = currentDayWindow(date);
  const used =
    account.serverAiDailyWindowStartedAt === windowStartedAt
      ? account.serverAiDailyUsed ?? 0
      : 0;
  return Math.max(0, limit - used);
}

function toGlobalQuota(
  account: PictoryUsageAccount,
  env: Record<string, string | undefined>,
  date: Date,
): PictoryClassifyQuota {
  return {
    remaining: getServerAiGlobalDailyLimitLeft(account, env, date),
  };
}

function minQuota(
  left: PictoryClassifyQuota,
  right: PictoryClassifyQuota,
): PictoryClassifyQuota {
  return {
    remaining: Math.min(left.remaining, right.remaining),
    reservation: mergeQuotaReservations(left.reservation, right.reservation),
  };
}

function mergeQuotaReservations(
  left?: PictoryClassifyQuotaReservation,
  right?: PictoryClassifyQuotaReservation,
): PictoryClassifyQuotaReservation | undefined {
  if (!left && !right) {
    return undefined;
  }

  return {
    monthlyUsed: (left?.monthlyUsed ?? 0) + (right?.monthlyUsed ?? 0),
    creditUsed: (left?.creditUsed ?? 0) + (right?.creditUsed ?? 0),
    globalDailyUsed:
      (left?.globalDailyUsed ?? 0) + (right?.globalDailyUsed ?? 0),
  };
}

function getServerAiGlobalDailyLimitLeft(
  account: PictoryUsageAccount,
  env: Record<string, string | undefined>,
  date: Date,
) {
  const limit = getServerAiDailyGlobalLimit(env);
  const windowStartedAt = currentDayWindow(date);
  const used =
    account.serverAiDailyWindowStartedAt === windowStartedAt
      ? account.serverAiDailyUsed ?? 0
      : 0;
  return Math.max(0, limit - used);
}

function reserveServerAiDailyLimit(
  account: PictoryUsageAccount,
  count: number,
  env: Record<string, string | undefined>,
  date: Date,
): PictoryUsageAccount | null {
  if (count <= 0) {
    return account;
  }

  const limit = getServerAiDailyLimitPerUser(env);
  const windowStartedAt = currentDayWindow(date);
  const windowUsed =
    account.serverAiDailyWindowStartedAt === windowStartedAt
      ? account.serverAiDailyUsed ?? 0
      : 0;

  if (windowUsed + count > limit) {
    return null;
  }

  return {
    ...account,
    serverAiDailyWindowStartedAt: windowStartedAt,
    serverAiDailyUsed: windowUsed + count,
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

function reserveServerAiGlobalDailyLimit(
  account: PictoryUsageAccount,
  count: number,
  env: Record<string, string | undefined>,
  date: Date,
): PictoryUsageAccount | null {
  if (count <= 0) {
    return account;
  }

  const limit = getServerAiDailyGlobalLimit(env);
  const windowStartedAt = currentDayWindow(date);
  const windowUsed =
    account.serverAiDailyWindowStartedAt === windowStartedAt
      ? account.serverAiDailyUsed ?? 0
      : 0;

  if (windowUsed + count > limit) {
    return null;
  }

  return {
    ...account,
    subjectId: GLOBAL_USAGE_SUBJECT_ID,
    serverAiDailyWindowStartedAt: windowStartedAt,
    serverAiDailyUsed: windowUsed + count,
  };
}


function currentDayWindow(date: Date) {
  return date.toISOString().slice(0, 10);
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

async function withUsageLedgerWriteLock<T>(work: () => MaybePromise<T>) {
  const previous = usageLedgerWriteLock;
  let release: () => void = () => undefined;
  usageLedgerWriteLock = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;
  try {
    return await work();
  } finally {
    // ponytail: process-local lock; use database transactions for multi-instance servers.
    release();
  }
}
