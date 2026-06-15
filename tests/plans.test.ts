import { describe, expect, it } from "vitest";
import {
  canSaveMore,
  consumeScanAllowance,
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
});
