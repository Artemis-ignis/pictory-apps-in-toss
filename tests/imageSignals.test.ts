import { describe, expect, it } from "vitest";
import { calculateSignals } from "../src/features/album/imageSignals";

describe("image signals", () => {
  it("calculates cheap color ratios for local classification", () => {
    const pixels = new Uint8ClampedArray([
      255, 255, 255, 255, 8, 8, 8, 255, 214, 142, 92, 255, 42, 180, 82, 255,
    ]);

    const signals = calculateSignals(pixels, 2, 2);

    expect(signals.whiteRatio).toBe(0.25);
    expect(signals.darkRatio).toBe(0.25);
    expect(signals.skinToneRatio).toBe(0.25);
    expect(signals.natureColorRatio).toBe(0.25);
    expect(signals.contrast).toBeGreaterThan(0);
    expect(signals.blurVariance).toBeGreaterThanOrEqual(0);
    expect(signals.differenceHash).toHaveLength(64);
  });
});
