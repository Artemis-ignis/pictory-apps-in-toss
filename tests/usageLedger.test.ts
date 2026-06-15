import { describe, expect, it, vi } from "vitest";
import {
  createNewUsageAccount,
  createPictoryUsageLedgerDeps,
  deleteUsageAccount,
  debitServerAiQuota,
  grantRewardCredits,
  normalizeUsageMonth,
  refundServerAiQuota,
  toEntitlement,
  toQuota,
  type PictoryUsageAccount,
  type PictoryUsageLedgerStore,
} from "../server/pictoryUsageLedger";

const now = () => new Date("2026-06-15T00:00:00.000Z");
const env = {
  PICTORY_AI_FREE_MONTHLY_QUOTA: "0",
  PICTORY_AI_PLUS_MONTHLY_QUOTA: "500",
  PICTORY_AI_PRO_MONTHLY_QUOTA: "2000",
};

describe("pictoryUsageLedger", () => {
  it("grants ad reward credits idempotently and caps stored credits", () => {
    const first = grantRewardCredits({
      account: {
        ...createNewUsageAccount("user-1", "free", now()),
        serverAiCredits: 2950,
      },
      rewardId: "ad-event-1",
    });
    const second = grantRewardCredits({
      account: first.account,
      rewardId: "ad-event-1",
    });

    expect(first.granted).toBe(50);
    expect(first.account.serverAiCredits).toBe(3000);
    expect(second.granted).toBe(0);
    expect(second.account.serverAiCredits).toBe(3000);
  });

  it("allows server AI for free users only when ad credits exist", () => {
    const noCredit = createNewUsageAccount("user-1", "free", now());
    const withCredit = { ...noCredit, serverAiCredits: 3 };

    expect(toEntitlement(noCredit, env, now())).toBeNull();
    expect(toEntitlement(withCredit, env, now())).toMatchObject({
      subjectId: "user-1",
      planId: "free",
      active: true,
      serverAiAccess: "credit",
    });
    expect(toQuota(withCredit, env).remaining).toBe(3);
  });

  it("debits paid monthly quota before ad credits", () => {
    const account = {
      ...createNewUsageAccount("user-1", "plus", now()),
      monthlyServerAiUsed: 498,
      serverAiCredits: 10,
    };
    const result = debitServerAiQuota(account, 5, env);

    expect(result?.account.monthlyServerAiUsed).toBe(500);
    expect(result?.account.serverAiCredits).toBe(7);
    expect(result?.quota.remaining).toBe(7);
  });

  it("rejects debit when quota is insufficient", () => {
    const account = createNewUsageAccount("user-1", "free", now());

    expect(debitServerAiQuota(account, 1, env)).toBeNull();
  });

  it("enforces per-user server AI rate limits by minute", () => {
    const limitedEnv = { ...env, PICTORY_AI_RATE_LIMIT_PER_MINUTE: "3" };
    const account = createNewUsageAccount("user-1", "plus", now());
    const first = debitServerAiQuota(account, 2, limitedEnv, now());
    const blocked = debitServerAiQuota(first!.account, 2, limitedEnv, now());
    const nextMinute = debitServerAiQuota(
      first!.account,
      2,
      limitedEnv,
      new Date("2026-06-15T00:01:00.000Z"),
    );

    expect(first?.account.serverAiRateWindowUsed).toBe(2);
    expect(blocked).toBeNull();
    expect(nextMinute?.account.serverAiRateWindowUsed).toBe(2);
    expect(nextMinute?.account.monthlyServerAiUsed).toBe(4);
  });

  it("refunds reserved usage after a failed upstream classification", () => {
    const consumed = {
      ...createNewUsageAccount("user-1", "plus", now()),
      monthlyServerAiUsed: 5,
      serverAiCredits: 2,
    };
    const refunded = refundServerAiQuota(consumed, 3);

    expect(refunded.monthlyServerAiUsed).toBe(2);
    expect(refunded.serverAiCredits).toBe(2);
  });

  it("normalizes monthly usage when the month changes", () => {
    const previous: PictoryUsageAccount = {
      ...createNewUsageAccount(
        "user-1",
        "plus",
        new Date("2026-05-01T00:00:00.000Z"),
      ),
      monthlyServerAiUsed: 200,
    };

    expect(normalizeUsageMonth(previous, now())).toMatchObject({
      usageMonth: "2026-06",
      monthlyServerAiUsed: 0,
    });
  });

  it("creates classify deps that resolve, reserve, and refund ledger quota", async () => {
    const account = createNewUsageAccount("user-1", "plus", now());
    const store = createMemoryStore(account);
    const deps = createPictoryUsageLedgerDeps({
      store,
      env,
      now,
      resolveSubjectId: vi.fn(async () => "user-1"),
    });

    const requestContext = {
      schemaVersion: 1 as const,
      itemCount: 2,
      headers: {},
      requestId: "req-1",
    };
    const entitlement = await deps.verifyEntitlement(requestContext);
    const quota = await deps.verifyQuota({
      ...requestContext,
      entitlement: entitlement!,
    });
    const reserved = await deps.consumeQuota?.({
      ...requestContext,
      entitlement: entitlement!,
      quota: quota!,
    });
    await deps.refundQuota?.({
      ...requestContext,
      entitlement: entitlement!,
      quota: reserved!,
      reason: "classification_failed",
    });

    expect(entitlement).toMatchObject({ serverAiAccess: "paid" });
    expect(quota?.remaining).toBe(500);
    expect(reserved?.remaining).toBe(498);
    expect((await store.readAccount("user-1"))?.monthlyServerAiUsed).toBe(0);
  });

  it("does not return paid entitlement after subscription expiry unless credits remain", () => {
    const expired = {
      ...createNewUsageAccount("user-1", "plus", now()),
      subscriptionExpiresAt: "2026-06-01T00:00:00.000Z",
    };
    const expiredWithCredits = { ...expired, serverAiCredits: 1 };

    expect(toEntitlement(expired, env, now())).toBeNull();
    expect(toEntitlement(expiredWithCredits, env, now())).toMatchObject({
      planId: "free",
      serverAiAccess: "credit",
    });
  });

  it("deletes usage accounts only when the store supports deletion", async () => {
    const store = createMemoryStore(createNewUsageAccount("user-1", "plus"));
    const unsupportedStore: PictoryUsageLedgerStore = {
      readAccount: async () => null,
      writeAccount: async () => undefined,
    };

    await expect(deleteUsageAccount(store, "user-1")).resolves.toEqual({
      supported: true,
      deleted: true,
    });
    await expect(deleteUsageAccount(store, "missing")).resolves.toEqual({
      supported: true,
      deleted: false,
    });
    await expect(
      deleteUsageAccount(unsupportedStore, "user-1"),
    ).resolves.toEqual({
      supported: false,
      deleted: false,
    });
  });
});

function createMemoryStore(
  account: PictoryUsageAccount,
): PictoryUsageLedgerStore {
  let current = account;
  return {
    readAccount: async (subjectId) =>
      current.subjectId === subjectId ? current : null,
    writeAccount: async (account) => {
      current = account;
    },
    deleteAccount: async (subjectId) => {
      if (current.subjectId !== subjectId) {
        return false;
      }
      current = createNewUsageAccount("__deleted__");
      return true;
    },
  };
}
