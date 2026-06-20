import { describe, expect, it } from "vitest";
import {
  getTarUnpackedSize,
  listReleaseDemoAlbumArtifacts,
  readTarEntries,
  validateAppFunctionManifest,
  validateBuiltFlowEvidence,
  validateRuntimeFlowEvidence,
} from "../tools/check-release-readiness.mjs";

describe("release readiness", () => {
  it("flags demo album files packaged inside the .ait upload artifact", () => {
    expect(
      listReleaseDemoAlbumArtifacts([
        "web/assets/index.js",
        "web/demo-album/receipt.jpg",
      ]),
    ).toContain("pictory.ait:web/demo-album/receipt.jpg");
  });

  it("reads .ait tar entries and sums extracted file sizes", () => {
    const archive = Buffer.concat([
      tarEntry("web/", Buffer.alloc(0), "5"),
      tarEntry("web/index.html", Buffer.from("ok")),
      tarEntry("web/assets/app.js", Buffer.alloc(4)),
      Buffer.alloc(1024),
    ]);

    const entries = readTarEntries(archive);

    expect(entries.map((entry) => entry.name)).toEqual([
      "web/",
      "web/index.html",
      "web/assets/app.js",
    ]);
    expect(getTarUnpackedSize(entries)).toBe(6);
  });

  it("validates runtime flow QA evidence for the main app routes", () => {
    const result = validateRuntimeFlowEvidence({
      ok: true,
      recentItems: 20,
      savedIds: 1,
      flow: Object.fromEntries(
        [
          "appFunctionHomeDeepLink",
          "appFunctionMapDeepLink",
          "appFunctionCleanDeepLink",
          "appFunctionSavedDeepLink",
          "homeShortcutOpened",
          "importModesReady",
          "mapCategoryFolderOpened",
          "periodFolderOpened",
          "periodFolderPreservedAcrossTabs",
          "cleanFolderOpened",
          "savedFolderOpened",
          "mapFolderActionsReady",
          "cleanFolderActionsReady",
          "savedFolderActionsReady",
          "mapPhotoDetailOpened",
          "cleanPhotoDetailOpened",
          "savedPhotoDetailOpened",
          "savedDetailHasUnsave",
          "detailProtectedMask",
          "detailPreviewRevealable",
          "photoDetailHashSynced",
          "browserBackReturnedToMapFolder",
        ].map((flag) => [flag, true]),
      ),
      dom: { brokenImages: 0, navItems: ["홈", "묶음", "선별", "킵"] },
      consoleIssues: [],
    });

    expect(result.every((check) => check.ok)).toBe(true);
  });

  it("rejects incomplete runtime flow QA evidence", () => {
    const result = validateRuntimeFlowEvidence({
      ok: true,
      recentItems: 20,
      savedIds: 1,
      flow: { homeShortcutOpened: true },
      dom: { brokenImages: 1, navItems: ["홈", "묶음"] },
      consoleIssues: ["error: boom"],
    });

    expect(result.filter((check) => !check.ok).map((check) => check.message)).toEqual(
      expect.arrayContaining([
        "runtime flow QA covers home/map/clean/saved/detail flows",
        "runtime flow QA has no broken images",
        "runtime flow QA bottom navigation is complete",
        "runtime flow QA has no browser console issues",
      ]),
    );
  });

  it("validates built web flow QA evidence", () => {
    const result = validateBuiltFlowEvidence({
      ok: true,
      recentItems: 8,
      savedIds: 1,
      flow: {
        appFunctionHomeDeepLink: true,
        appFunctionMapDeepLink: true,
        appFunctionCleanDeepLink: true,
        appFunctionSavedDeepLink: true,
        importModesReady: true,
        mapFolderOpened: true,
        mapPhotoDetailOpened: true,
        cleanFolderOpened: true,
        detailProtectedMask: true,
        storedSensitivePreviewKeptPrivate: true,
        savedFolderOpened: true,
        savedDetailHasUnsave: true,
      },
      dom: { brokenImages: 0, navItems: ["홈", "묶음", "선별", "킵"] },
      consoleIssues: [],
    });

    expect(result.every((check) => check.ok)).toBe(true);
  });

  it("rejects incomplete built web flow QA evidence", () => {
    const result = validateBuiltFlowEvidence({
      ok: true,
      recentItems: 8,
      savedIds: 1,
      flow: { mapFolderOpened: true },
      dom: { brokenImages: 1, navItems: ["홈"] },
      consoleIssues: ["error: built"],
    });

    expect(result.filter((check) => !check.ok).map((check) => check.message)).toEqual(
      expect.arrayContaining([
        "built web flow QA covers built map/clean/saved/detail flows",
        "built web flow QA has no broken images",
        "built web flow QA bottom navigation is complete",
        "built web flow QA has no browser console issues",
      ]),
    );
  });

  it("validates Apps in Toss app function registration entries", () => {
    const result = validateAppFunctionManifest({
      schemaVersion: 1,
      appName: "pictory",
      functions: [
        {
          id: "find-best-shots",
          koreanName: "베스트컷찾기",
          englishName: "Find best shots",
          targetTab: "home",
          url: "intoss://pictory/?tab=home",
        },
        {
          id: "view-photo-groups",
          koreanName: "사진묶음보기",
          englishName: "View groups",
          targetTab: "map",
          url: "intoss://pictory/?tab=map",
        },
        {
          id: "pick-posting-cuts",
          koreanName: "올릴컷고르기",
          englishName: "Pick cuts",
          targetTab: "clean",
          url: "intoss://pictory/?tab=clean",
        },
        {
          id: "open-keep-album",
          koreanName: "킵앨범열기",
          englishName: "Open keep",
          targetTab: "saved",
          url: "intoss://pictory/?tab=saved",
        },
      ],
    });

    expect(result.every((check) => check.ok)).toBe(true);
  });

  it("rejects invalid Apps in Toss app function names and URLs", () => {
    const result = validateAppFunctionManifest({
      schemaVersion: 1,
      appName: "pictory",
      functions: [
        {
          id: "bad",
          koreanName: "너무긴기능이름입니다요",
          englishName: "view cleanup",
          targetTab: "clean",
          url: "https://pictory/?tab=map",
        },
      ],
    });

    expect(result.filter((check) => !check.ok).map((check) => check.message)).toEqual(
      expect.arrayContaining([
        "app functions manifest includes home entry",
        "app functions manifest includes map entry",
        "app functions manifest includes saved entry",
        "app function Korean name length is valid: 너무긴기능이름입니다요",
        "app function English name starts with uppercase: view cleanup",
        "app function URL uses intoss scheme: bad",
        "app function URL tab matches target: bad",
      ]),
    );
  });
});

function tarEntry(name, data, type = "0") {
  const header = Buffer.alloc(512);
  header.write(name, 0, "utf8");
  header.write(octal(data.length, 11), 124, "ascii");
  header.write(type, 156, "ascii");
  return Buffer.concat([
    header,
    data,
    Buffer.alloc(Math.ceil(data.length / 512) * 512 - data.length),
  ]);
}

function octal(value, width) {
  return value.toString(8).padStart(width, "0");
}
