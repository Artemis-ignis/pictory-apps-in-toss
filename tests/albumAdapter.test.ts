import { describe, expect, it } from "vitest";
import {
  extractCapturedAtFromDataUri,
  filterAndOrderAlbumItems,
  getNativeAlbumFetchCount,
  isAlbumPermissionDenied,
  isLocalAlbumFallbackAllowed,
  selectImportBatch,
} from "../src/features/album/albumAdapter";
import type { AlbumItem } from "../src/features/album/types";

describe("album adapter fallback policy", () => {
  it("allows sample and file fallback only in local development contexts", () => {
    expect(isLocalAlbumFallbackAllowed({ DEV: true })).toBe(true);
    expect(isLocalAlbumFallbackAllowed({ DEV: false })).toBe(false);
  });

  it("distinguishes photo permission denial from generic album failures", () => {
    expect(isAlbumPermissionDenied(new Error("ALBUM_PERMISSION_DENIED"))).toBe(
      true,
    );
    expect(isAlbumPermissionDenied(new Error("ALBUM_SCAN_FAILED"))).toBe(false);
    expect(isAlbumPermissionDenied("ALBUM_PERMISSION_DENIED")).toBe(false);
  });

  it("orders imported photos by recent or oldest mode", () => {
    const result = filterAndOrderAlbumItems(
      [albumItem("old", "2026-06-10"), albumItem("new", "2026-06-15")],
      { mode: "recent" },
    );
    const oldest = filterAndOrderAlbumItems(result, { mode: "oldest" });

    expect(result.map((item) => item.id)).toEqual(["new", "old"]);
    expect(oldest.map((item) => item.id)).toEqual(["old", "new"]);
  });

  it("prefetches a wider native window for filtered automatic scans", () => {
    expect(
      getNativeAlbumFetchCount({ maxCount: 40, mode: "recent" }),
    ).toBe(40);
    expect(getNativeAlbumFetchCount({ maxCount: 40, mode: "oldest" })).toBe(
      120,
    );
    expect(getNativeAlbumFetchCount({ maxCount: 40, mode: "date" })).toBe(120);
    expect(
      getNativeAlbumFetchCount({ maxCount: 180, mode: "instagram" }),
    ).toBe(300);
    expect(getNativeAlbumFetchCount({ maxCount: 300, mode: "oldest" })).toBe(
      300,
    );
  });

  it("caps filtered import batches to the analysis allowance", () => {
    const result = selectImportBatch(
      [
        albumItem("first", "2026-06-10"),
        albumItem("second", "2026-06-11"),
        albumItem("third", "2026-06-12"),
      ],
      { maxCount: 2, mode: "oldest" },
    );

    expect(result.map((item) => item.id)).toEqual(["first", "second"]);
  });

  it("filters imported photos by selected date", () => {
    const result = filterAndOrderAlbumItems(
      [albumItem("match", "2026-06-15"), albumItem("other", "2026-06-16")],
      { mode: "date", date: "2026-06-15" },
    );

    expect(result.map((item) => item.id)).toEqual(["match"]);
  });

  it("keeps Instagram feed aspect ratios and drops extreme crops", () => {
    const result = filterAndOrderAlbumItems(
      [
        albumItem("square", "2026-06-15", 1),
        albumItem("portrait", "2026-06-14", 0.8),
        albumItem("wide", "2026-06-13", 1.91),
        albumItem("too-tall", "2026-06-12", 0.5),
        albumItem("too-wide", "2026-06-11", 2.4),
      ],
      { mode: "instagram" },
    );

    expect(result.map((item) => item.id)).toEqual([
      "square",
      "portrait",
      "wide",
    ]);
  });

  it("extracts a captured date from EXIF-like JPEG metadata", () => {
    const payload = Buffer.from(
      "Exif\x00\x00DateTimeOriginal\x00\x002026:06:03 08:09:10",
      "binary",
    ).toString("base64");

    expect(extractCapturedAtFromDataUri(`data:image/jpeg;base64,${payload}`))
      .toBe("2026-06-03T08:09:10");
  });
});

function albumItem(id: string, date: string, aspectRatio?: number): AlbumItem {
  return {
    id,
    type: "PHOTO",
    source: "local-file",
    dataUri: "data:image/jpeg;base64,",
    createdAt: `${date}T12:00:00.000Z`,
    signals:
      aspectRatio == null
        ? undefined
        : {
            width: Math.round(aspectRatio * 1000),
            height: 1000,
            aspectRatio,
            brightness: 0.5,
            saturation: 0.5,
            edgeDensity: 0.2,
            textLineScore: 0.1,
            colorVariance: 0.3,
            whiteRatio: 0.1,
            darkRatio: 0.1,
            skinToneRatio: 0.1,
            natureColorRatio: 0.1,
            perceptualHash: id.padEnd(16, "0").slice(0, 16),
          },
  };
}
