import { describe, expect, it } from "vitest";
import { isLocalAlbumFallbackAllowed } from "../src/features/album/albumAdapter";

describe("album adapter fallback policy", () => {
  it("allows sample and file fallback only in local development contexts", () => {
    expect(isLocalAlbumFallbackAllowed({ DEV: true }, "example.com")).toBe(
      true,
    );
    expect(isLocalAlbumFallbackAllowed({ DEV: false }, "localhost")).toBe(true);
    expect(isLocalAlbumFallbackAllowed({ DEV: false }, "127.0.0.1")).toBe(true);
    expect(isLocalAlbumFallbackAllowed({ DEV: false }, "service.toss.im")).toBe(
      false,
    );
  });
});
