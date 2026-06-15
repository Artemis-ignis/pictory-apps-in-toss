import { describe, expect, it } from "vitest";
import { mapBarcodeFormatsToHints } from "../src/features/album/nativeDetectors";

describe("native detector hints", () => {
  it("maps barcode and QR formats to coupon hints", () => {
    expect(mapBarcodeFormatsToHints(["qr_code", "ean_13"])).toEqual([
      "coupon",
      "barcode",
      "쿠폰",
      "qr",
    ]);
  });
});
