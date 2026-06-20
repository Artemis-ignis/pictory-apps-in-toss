import { describe, expect, it } from "vitest";
import {
  canSaveMore,
  canRequestServerAiRefinement,
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

  it("also consumes free user ad credits when server AI is used inside monthly quota", () => {
    const consumed = consumeScanAllowance(
      {
        ...defaultPictoryState,
        credits: 30,
        monthlyScanUsed: 0,
      },
      20,
      { serverAiRefinement: true },
    );

    expect(consumed.monthlyScanUsed).toBe(20);
    expect(consumed.credits).toBe(10);
  });

  it("does not double-charge server AI credits already used as scan allowance", () => {
    const consumed = consumeScanAllowance(
      {
        ...defaultPictoryState,
        credits: 30,
        monthlyScanUsed: 40,
      },
      20,
      { serverAiRefinement: true },
    );

    expect(consumed.monthlyScanUsed).toBe(40);
    expect(consumed.credits).toBe(10);
  });

  it("enforces storage limits by plan", () => {
    expect(canSaveMore(defaultPictoryState, 9)).toBe(true);
    expect(canSaveMore(defaultPictoryState, 10)).toBe(false);
    expect(canSaveMore({ ...defaultPictoryState, planId: "pro" }, 999)).toBe(
      true,
    );
  });

  it("uses server AI for free users only when ad credits cover the batch", () => {
    expect(
      canUseServerAiRefinement(
        {
          ...defaultPictoryState,
          planId: "free",
          credits: 0,
        },
        1,
      ),
    ).toBe(false);
    expect(
      canUseServerAiRefinement(
        {
          ...defaultPictoryState,
          planId: "free",
          credits: 1,
        },
        40,
      ),
    ).toBe(false);
    expect(
      canUseServerAiRefinement(
        {
          ...defaultPictoryState,
          planId: "free",
          credits: 40,
        },
        40,
      ),
    ).toBe(true);
    expect(
      canUseServerAiRefinement(
        {
          ...defaultPictoryState,
          planId: "plus",
          credits: 0,
        },
        40,
      ),
    ).toBe(true);
  });

  it("requests server AI only with entitlement and a real production endpoint", () => {
    expect(
      canRequestServerAiRefinement(
        { ...defaultPictoryState, planId: "plus" },
        10,
        "https://your-api.example.com/pictory/classify",
      ),
    ).toBe(false);
    expect(
      canRequestServerAiRefinement(
        { ...defaultPictoryState, planId: "plus" },
        10,
        undefined,
      ),
    ).toBe(false);
    expect(
      canRequestServerAiRefinement(
        { ...defaultPictoryState, planId: "free", credits: 2 },
        10,
        "https://api.pictory.app/pictory/classify",
      ),
    ).toBe(false);
    expect(
      canRequestServerAiRefinement(
        { ...defaultPictoryState, planId: "pro" },
        10,
        "https://api.pictory.app/pictory/classify",
      ),
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

  it("treats paid plans as entitlement in production only after IAP verification", () => {
    const productionRuntime = { hostname: "pictory.apps.tossmini.com" };

    expect(getEntitledPlanId("plus", productionRuntime, "plus")).toBe("plus");
    expect(
      getEntitledBillingState(
        { ...defaultPictoryState, planId: "pro" },
        productionRuntime,
        "pro",
      ).planId,
    ).toBe("pro");
  });

  it("allows paid plan previews only on local development hosts", () => {
    expect(getEntitledPlanId("plus", { hostname: "localhost" })).toBe("plus");
    expect(getEntitledPlanId("pro", { hostname: "127.0.0.1" })).toBe("pro");
  });
});
