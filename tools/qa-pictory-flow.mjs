import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const requestedPort = Number(process.env.PICTORY_QA_PORT ?? 0);
const port = requestedPort > 0 ? requestedPort : await findFreePort(5173);
const baseUrl = `http://127.0.0.1:${port}`;
const screenshotDir = path.join(
  projectRoot,
  "temp_screenshots",
  `runtime-qa-${new Date().toISOString().replace(/[:.]/g, "-")}`,
);
const evidencePath = path.join(projectRoot, "qa-evidence", "runtime-flow.json");

let serverProcess;

try {
  serverProcess = spawn(
    process.execPath,
    [
      path.join(projectRoot, "node_modules", "vite", "bin", "vite.js"),
      "dev",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  await waitForServer();

  const report = await runQa();
  await mkdir(screenshotDir, { recursive: true });
  await writeFile(
    path.join(screenshotDir, "report.json"),
    JSON.stringify(report, null, 2),
  );
  await mkdir(path.dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (serverProcess != null) {
    serverProcess.kill();
  }
}

async function runQa() {
  await mkdir(screenshotDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
  });
  const consoleIssues = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleIssues.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    consoleIssues.push(`pageerror: ${error.message}`);
  });

  try {
    const appFunctionDeepLinks = await verifyAppFunctionLinks(page);
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.evaluate(() => window.localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });
    await clickBottomNav(page, "보관");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: /픽토리 데이터 삭제/ }).click();
    await clickBottomNav(page, "홈");
    await page.screenshot({ path: path.join(screenshotDir, "00-home.png") });
    await page
      .locator(".plan-strip")
      .getByRole("button", { name: /플러스/ })
      .click();
    await page.getByText("플러스 플랜 기준").waitFor();
    await page.getByRole("button", { name: /AI 30장 받기/ }).click();
    await page.waitForFunction(() => {
      const raw = window.localStorage.getItem("pictory:v1");
      const state = raw == null ? null : JSON.parse(raw);
      return (state?.credits ?? 0) >= 30;
    });
    const rewardCreditWorked = await page.evaluate(() => {
      const raw = window.localStorage.getItem("pictory:v1");
      const state = raw == null ? null : JSON.parse(raw);
      return (state?.credits ?? 0) >= 30;
    });
    await page.screenshot({
      path: path.join(screenshotDir, "00-home-plus-preview.png"),
    });
    const importModesReady = await verifyImportModes(page);
    await page.screenshot({
      path: path.join(screenshotDir, "00-import-modes.png"),
    });

    await page.getByRole("button", { name: /앨범 정리 시작/ }).click();
    await page.getByText("사진 묶음을").waitFor({ timeout: 25_000 });
    await page.screenshot({ path: path.join(screenshotDir, "01-map.png") });

    await clickBottomNav(page, "홈");
    await page.locator(".home-bucket-list .bucket-card").first().click();
    await page.getByText("종류 폴더").waitFor();
    const homeShortcutOpened =
      (await page
        .locator(".folder-header")
        .filter({ hasText: "종류 폴더" })
        .count()) > 0;
    await page.screenshot({
      path: path.join(screenshotDir, "02-home-shortcut-folder.png"),
    });
    await page.locator(".folder-back").click();

    await page.locator(".bucket-list .bucket-card").filter({ hasText: /^음식/ }).click();
    await page.getByText("종류 폴더").waitFor();
    await page.locator(".folder-header").filter({ hasText: "음식" }).waitFor();
    const mapCategoryFolderOpened =
      (await page
        .locator(".folder-header")
        .filter({ hasText: "종류 폴더" })
        .count()) > 0;
    const mapFolderActionsReady =
      (await page.locator(".folder-action-bar button").count()) >= 3;
    const savedBeforeDetail = await readStoredIdCount(page, "savedIds");
    await page.screenshot({
      path: path.join(screenshotDir, "03-map-food-folder.png"),
    });
    await page.locator(".folder-photo-list .photo-open").first().click();
    await page.locator(".photo-detail-screen").waitFor();
    await waitForScreenTop(page);
    const mapPhotoDetailOpened =
      (await page.locator(".detail-actions button").count()) >= 3;
    const photoDetailHashSynced = page.url().includes("photo=");
    await page.screenshot({
      path: path.join(screenshotDir, "04-map-photo-detail.png"),
    });
    await page.goBack();
    await page.locator(".folder-header").filter({ hasText: "음식" }).waitFor();
    const browserBackReturnedToMapFolder =
      (await page
        .locator(".folder-header")
        .filter({ hasText: "종류 폴더" })
        .count()) > 0;
    await page.locator(".folder-photo-list .photo-open").first().click();
    await page.locator(".photo-detail-screen").waitFor();
    await page
      .locator(".detail-actions")
      .getByRole("button", { name: /^보관$/ })
      .click();
    await page.waitForFunction((previousCount) => {
      const raw = window.localStorage.getItem("pictory:v1");
      const state = raw == null ? null : JSON.parse(raw);
      return (state?.savedIds?.length ?? 0) > previousCount;
    }, savedBeforeDetail);
    const detailSaveWorked = await storedIdCountIncreased(
      page,
      "savedIds",
      savedBeforeDetail,
    );
    await page.locator(".detail-header .folder-back").click();
    const savedBeforeFolderSave = await readStoredIdCount(page, "savedIds");
    await page
      .locator(".folder-action-bar")
      .getByRole("button", { name: /^보관$/ })
      .click();
    await page.waitForFunction((previousCount) => {
      const raw = window.localStorage.getItem("pictory:v1");
      const state = raw == null ? null : JSON.parse(raw);
      return (state?.savedIds?.length ?? 0) > previousCount;
    }, savedBeforeFolderSave);
    const folderSaveWorked = await storedIdCountIncreased(
      page,
      "savedIds",
      savedBeforeFolderSave,
    );
    await page.locator(".folder-back").click();
    await page
      .locator(".folder-mode-tabs")
      .getByRole("button", { name: /사진 월/ })
      .click();
    await page.locator(".period-bucket-list .bucket-card").first().click();
    await page.getByText("사진 날짜 기준").waitFor();
    const periodFolderOpened =
      (await page
        .locator(".folder-header")
        .filter({ hasText: "사진 날짜 기준" })
        .count()) > 0;
    await page.screenshot({
      path: path.join(screenshotDir, "05-map-period-folder.png"),
    });

    await clickBottomNav(page, "정리");
    await page.getByText("지울 후보만").waitFor();
    const cleanReviewInputs = page.locator(".clean-review-card input");
    const cleanBulkSelectionReady =
      (await cleanReviewInputs.count()) > 0 &&
      (await page.locator(".clean-queue-action").count()) === 1;
    const queuedBeforeBulk = await page.evaluate(() => {
      const raw = window.localStorage.getItem("pictory:v1");
      return raw == null ? 0 : (JSON.parse(raw).queuedIds?.length ?? 0);
    });
    await cleanReviewInputs.first().check();
    await page.locator(".clean-queue-action").filter({ hasText: "(1)" }).waitFor();
    await page.locator(".clean-queue-action").click();
    await page.waitForFunction(
      (previousCount) => {
        const raw = window.localStorage.getItem("pictory:v1");
        return (
          raw != null &&
          (JSON.parse(raw).queuedIds?.length ?? 0) > previousCount
        );
      },
      queuedBeforeBulk,
    );
    const cleanBulkQueueWorked = await page.evaluate((previousCount) => {
      const raw = window.localStorage.getItem("pictory:v1");
      return (
        raw != null && (JSON.parse(raw).queuedIds?.length ?? 0) > previousCount
      );
    }, queuedBeforeBulk);
    await clickBottomNav(page, "분류");
    await page
      .locator(".folder-header")
      .filter({ hasText: "사진 날짜 기준" })
      .waitFor();
    const periodFolderPreservedAcrossTabs =
      (await page
        .locator(".folder-header")
        .filter({ hasText: "사진 날짜 기준" })
        .count()) > 0;
    await clickBottomNav(page, "정리");
    await page.getByText("지울 후보만").waitFor();
    await page.getByRole("button", { name: /민감정보 후보/ }).click();
    await page.getByText("정리 폴더").waitFor();
    await page
      .locator(".folder-header")
      .filter({ hasText: "민감정보 후보" })
      .waitFor();
    const cleanFolderOpened =
      (await page
        .locator(".folder-header")
        .filter({ hasText: "정리 폴더" })
        .count()) > 0;
    const cleanFolderActionsReady =
      (await page.locator(".folder-action-bar button").count()) >= 3;
    await page.screenshot({
      path: path.join(screenshotDir, "06-clean-sensitive-folder.png"),
    });
    await page.locator(".folder-photo-list .photo-open").first().click();
    await page.locator(".photo-detail-screen").waitFor();
    await waitForScreenTop(page);
    const cleanPhotoDetailOpened =
      (await page.locator(".detail-actions button").count()) >= 3;
    const detailProtectedMask =
      (await page
        .locator(".detail-preview.is-protected .detail-mask")
        .count()) > 0;
    await page
      .locator(".detail-mask")
      .getByRole("button", { name: /^보기$/ })
      .click();
    const detailPreviewRevealable =
      (await page.locator(".detail-preview.is-protected").count()) === 0 &&
      (await page.getByRole("button", { name: /^다시 가리기$/ }).count()) > 0;
    await page.getByRole("button", { name: /^다시 가리기$/ }).click();
    await page.screenshot({
      path: path.join(screenshotDir, "07-clean-photo-detail.png"),
    });
    await page.locator(".detail-header .folder-back").click();
    const ignoredBeforeCleanFolder = await readStoredIdCount(page, "ignoredIds");
    await page
      .locator(".folder-action-bar")
      .getByRole("button", { name: /^제외$/ })
      .click();
    await page.waitForFunction((previousCount) => {
      const raw = window.localStorage.getItem("pictory:v1");
      const state = raw == null ? null : JSON.parse(raw);
      return (state?.ignoredIds?.length ?? 0) > previousCount;
    }, ignoredBeforeCleanFolder);
    const folderIgnoreWorked = await storedIdCountIncreased(
      page,
      "ignoredIds",
      ignoredBeforeCleanFolder,
    );

    await clickBottomNav(page, "보관");
    await page.getByText("다시 볼 것만").waitFor();
    await page.screenshot({ path: path.join(screenshotDir, "08-saved.png") });
    await page.locator(".bucket-list .bucket-card").filter({ hasText: /^음식/ }).click();
    await page.getByText("보관 폴더").waitFor();
    await page.locator(".folder-header").filter({ hasText: "음식" }).waitFor();
    const savedFolderOpened =
      (await page
        .locator(".folder-header")
        .filter({ hasText: "보관 폴더" })
        .count()) > 0;
    const savedFolderActionsReady =
      (await page.locator(".folder-action-bar button").count()) >= 1;
    await page.screenshot({
      path: path.join(screenshotDir, "09-saved-food-folder.png"),
    });
    await page.locator(".folder-photo-list .photo-open").first().click();
    await page.locator(".photo-detail-screen").waitFor();
    await waitForScreenTop(page);
    const savedPhotoDetailOpened =
      (await page.locator(".detail-actions button").count()) >= 3;
    const savedDetailHasUnsave =
      (await page
        .locator(".detail-actions")
        .getByRole("button", { name: /^해제$/ })
        .count()) > 0;
    await page.screenshot({
      path: path.join(screenshotDir, "10-saved-photo-detail.png"),
    });
    const savedBeforeUnsave = await readStoredIdCount(page, "savedIds");
    await page
      .locator(".detail-actions")
      .getByRole("button", { name: /^해제$/ })
      .click();
    await page.waitForFunction((previousCount) => {
      const raw = window.localStorage.getItem("pictory:v1");
      const state = raw == null ? null : JSON.parse(raw);
      return (state?.savedIds?.length ?? 0) < previousCount;
    }, savedBeforeUnsave);
    const detailUnsaveWorked =
      (await readStoredIdCount(page, "savedIds")) < savedBeforeUnsave;

    const state = await page.evaluate(() => {
      const raw = window.localStorage.getItem("pictory:v1");
      return raw == null ? null : JSON.parse(raw);
    });
    const dom = await page.evaluate(() => ({
      brokenImages: Array.from(document.images).filter(
        (image) => image.complete && image.naturalWidth === 0,
      ).length,
      bucketCards: document.querySelectorAll(".bucket-card").length,
      folderActionButtons: document.querySelectorAll(
        ".folder-action-bar button",
      ).length,
      detailScreens: document.querySelectorAll(".photo-detail-screen").length,
      folderHeaders: document.querySelectorAll(".folder-header").length,
      trayPhotos: document.querySelectorAll(".tray-photo").length,
      photoTiles: document.querySelectorAll(".photo-tile").length,
      navItems: Array.from(document.querySelectorAll(".bottom-nav-item")).map(
        (node) => node.textContent?.trim(),
      ),
    }));

    const categoryCounts = countBy(state?.recentItems ?? [], "categoryId");
    const cleanCounts = countBy(state?.recentItems ?? [], "cleanBucketId");
    const categoryCoverage =
      (categoryCounts.capture ?? 0) >= 3 &&
      (categoryCounts.document ?? 0) >= 2 &&
      (categoryCounts.receipt ?? 0) >= 1 &&
      (categoryCounts.food ?? 0) >= 3 &&
      (categoryCounts.place ?? 0) >= 1 &&
      (categoryCounts.people ?? 0) >= 2 &&
      (categoryCounts.coupon ?? 0) >= 1;
    const report = {
      ok:
        (state?.recentItems?.length ?? 0) >= 20 &&
        (state?.savedIds?.length ?? 0) >= 1 &&
        state?.planId === "plus" &&
        rewardCreditWorked &&
        categoryCoverage &&
        Object.values(appFunctionDeepLinks).every(Boolean) &&
        homeShortcutOpened &&
        mapCategoryFolderOpened &&
        periodFolderOpened &&
        periodFolderPreservedAcrossTabs &&
        cleanBulkSelectionReady &&
        cleanBulkQueueWorked &&
        cleanFolderOpened &&
        savedFolderOpened &&
        mapFolderActionsReady &&
        detailSaveWorked &&
        folderSaveWorked &&
        cleanFolderActionsReady &&
        folderIgnoreWorked &&
        savedFolderActionsReady &&
        mapPhotoDetailOpened &&
        cleanPhotoDetailOpened &&
        savedPhotoDetailOpened &&
        savedDetailHasUnsave &&
        detailUnsaveWorked &&
        detailProtectedMask &&
        photoDetailHashSynced &&
        browserBackReturnedToMapFolder &&
        dom.brokenImages === 0 &&
        dom.detailScreens >= 1 &&
        dom.navItems.join(",") === "홈,분류,정리,보관",
      url: baseUrl,
      screenshots: screenshotDir,
      planId: state?.planId ?? "unknown",
      recentItems: state?.recentItems?.length ?? 0,
      savedIds: state?.savedIds?.length ?? 0,
      categoryCounts,
      cleanCounts,
      flow: {
        ...appFunctionDeepLinks,
        rewardCreditWorked,
        homeShortcutOpened,
        importModesReady,
        mapCategoryFolderOpened,
        periodFolderOpened,
        periodFolderPreservedAcrossTabs,
        cleanBulkSelectionReady,
        cleanBulkQueueWorked,
        cleanFolderOpened,
        savedFolderOpened,
        mapFolderActionsReady,
        detailSaveWorked,
        folderSaveWorked,
        cleanFolderActionsReady,
        folderIgnoreWorked,
        savedFolderActionsReady,
        mapPhotoDetailOpened,
        cleanPhotoDetailOpened,
        savedPhotoDetailOpened,
      savedDetailHasUnsave,
      detailUnsaveWorked,
      detailProtectedMask,
      detailPreviewRevealable,
      photoDetailHashSynced,
      browserBackReturnedToMapFolder,
      },
      dom,
      consoleIssues,
    };

    if (!report.ok) {
      throw new Error(`Pictory QA failed: ${JSON.stringify(report, null, 2)}`);
    }

    return report;
  } finally {
    await browser.close();
  }
}

async function verifyAppFunctionLinks(page) {
  const entries = [
    ["home", "홈"],
    ["map", "분류"],
    ["clean", "정리"],
    ["saved", "보관"],
  ];
  const result = {};

  for (const [tab, label] of entries) {
    await page.goto(`${baseUrl}/?tab=${tab}`, { waitUntil: "networkidle" });
    const activeItem = page
      .locator(".bottom-nav-item.is-active")
      .filter({ hasText: new RegExp(`^${label}$`) });
    await activeItem.waitFor();
    result[`appFunction${capitalize(tab)}DeepLink`] =
      (await activeItem.count()) > 0;
  }

  return result;
}

async function clickBottomNav(page, label) {
  await page
    .locator(".bottom-nav-item")
    .filter({ hasText: new RegExp(`^${label}$`) })
    .click();
}

async function verifyImportModes(page) {
  await page
    .locator(".import-mode-grid button")
    .filter({ hasText: "오래된순" })
    .click();
  const oldestReady =
    (await page
      .locator(".primary-action")
      .filter({ hasText: "오래된 후보 정리" })
      .count()) > 0;

  await page
    .locator(".import-mode-grid button")
    .filter({ hasText: "날짜" })
    .click();
  const dateReady =
    (await page
      .locator(".primary-action")
      .filter({ hasText: "날짜 후보 찾기" })
      .count()) > 0 &&
    (await page.locator(".import-date-input").count()) === 1;

  await page
    .locator(".import-mode-grid button")
    .filter({ hasText: "인스타" })
    .click();
  const instagramReady =
    (await page
      .locator(".primary-action")
      .filter({ hasText: "인스타 후보 고르기" })
      .count()) > 0;

  await page
    .locator(".import-mode-grid button")
    .filter({ hasText: "최신순" })
    .click();
  const recentReady =
    (await page
      .locator(".primary-action")
      .filter({ hasText: "앨범 정리 시작" })
      .count()) > 0;

  return oldestReady && dateReady && instagramReady && recentReady;
}

async function waitForScreenTop(page) {
  await page.waitForFunction(
    () => (document.querySelector(".screen-frame")?.scrollTop ?? 0) === 0,
    undefined,
    { timeout: 3_000 },
  );
}

async function readStoredIdCount(page, key) {
  return page.evaluate((stateKey) => {
    const raw = window.localStorage.getItem("pictory:v1");
    if (raw == null) {
      return 0;
    }

    const state = JSON.parse(raw);
    return Array.isArray(state?.[stateKey]) ? state[stateKey].length : 0;
  }, key);
}

async function storedIdCountIncreased(page, key, previousCount) {
  return (await readStoredIdCount(page, key)) > previousCount;
}

function countBy(items, key) {
  return items.reduce((summary, item) => {
    const value = item[key];
    summary[value] = (summary[value] ?? 0) + 1;
    return summary;
  }, {});
}

function capitalize(value) {
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}

async function findFreePort(startPort) {
  for (let candidate = startPort; candidate < startPort + 50; candidate += 1) {
    if (await canListen(candidate)) {
      return candidate;
    }
  }

  throw new Error(`No free QA port found from ${startPort}`);
}

function canListen(portToCheck) {
  return new Promise((resolve) => {
    const server = createServer()
      .once("error", () => resolve(false))
      .once("listening", () => {
        server.close(() => resolve(true));
      });

    server.listen(portToCheck, "127.0.0.1");
  });
}

async function isServerReady() {
  try {
    const response = await fetch(baseUrl);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30_000) {
    if (await isServerReady()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Vite server did not start at ${baseUrl}`);
}
