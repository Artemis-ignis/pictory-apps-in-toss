import { describe, expect, it } from "vitest";
import {
  canSaveMore,
  canUseServerAiRefinement,
  consumeScanAllowance,
  getEntitledBillingState,
  getEntitledPlanId,
  getScanAllowance,
} from "../src/features/billing/plans";
import { defaultPictoryState } from "../src/features/album/storage";

describe("usage plans", () => {
  it("limits free scans to monthly credits plus ad credits", () => {
    const state = {
      ...defaultPictoryState,
      credits: 15,
      monthlyScanUsed: 30,
    };

    expect(getScanAllowance(state).totalLeft).toBe(25);
    expect(getScanAllowance(state).nextBatchLimit).toBe(25);
  });

  it("consumes monthly credits before ad credits", () => {
    const consumed = consumeScanAllowance(
      {
        ...defaultPictoryState,
        credits: 20,
        monthlyScanUsed: 35,
      },
      12,
    );

    expect(consumed.monthlyScanUsed).toBe(40);
    expect(consumed.credits).toBe(13);
  });

  it("enforces storage limits by plan", () => {
    expect(canSaveMore(defaultPictoryState, 9)).toBe(true);
    expect(canSaveMore(defaultPictoryState, 10)).toBe(false);
    expect(canSaveMore({ ...defaultPictoryState, planId: "pro" }, 999)).toBe(
      true,
    );
  });

  it("uses server AI only after ad revenue or paid plan entitlement exists", () => {
    expect(
      canUseServerAiRefinement({
        ...defaultPictoryState,
        planId: "free",
        credits: 0,
      }),
    ).toBe(false);
    expect(
      canUseServerAiRefinement({
        ...defaultPictoryState,
        planId: "free",
        credits: 100,
      }),
    ).toBe(true);
    expect(
      canUseServerAiRefinement({
        ...defaultPictoryState,
        planId: "plus",
        credits: 0,
      }),
    ).toBe(true);
  });

  it("does not treat a stored paid plan as entitlement in production", () => {
    const productionRuntime = { hostname: "pictory.apps.tossmini.com" };

    expect(getEntitledPlanId("plus", productionRuntime)).toBe("free");
    expect(
      getEntitledBillingState(
        { ...defaultPictoryState, planId: "pro" },
        productionRuntime,
      ).planId,
    ).toBe("free");
  });

  it("allows paid plan previews only on local development hosts", () => {
    expect(getEntitledPlanId("plus", { hostname: "localhost" })).toBe("plus");
    expect(getEntitledPlanId("pro", { hostname: "127.0.0.1" })).toBe("pro");
  });
});
