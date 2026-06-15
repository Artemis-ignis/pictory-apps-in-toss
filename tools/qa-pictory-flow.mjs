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
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.evaluate(() => window.localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });
    await clickBottomNav(page, "보관");
    await page.getByRole("button", { name: /픽토리 데이터 삭제/ }).click();
    await clickBottomNav(page, "홈");
    await page.screenshot({ path: path.join(screenshotDir, "00-home.png") });
    await page
      .locator(".plan-strip")
      .getByRole("button", { name: /플러스/ })
      .click();
    await page.getByText("플러스 플랜 기준").waitFor();
    await page.screenshot({
      path: path.join(screenshotDir, "00-home-plus-preview.png"),
    });

    await page.getByRole("button", { name: /지도 만들기/ }).click();
    await page.getByText("종류와 기간으로").waitFor({ timeout: 25_000 });
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

    await page.getByRole("button", { name: /음식/ }).click();
    await page.getByText("종류 폴더").waitFor();
    await page.locator(".folder-header").filter({ hasText: "음식" }).waitFor();
    const mapCategoryFolderOpened =
      (await page
        .locator(".folder-header")
        .filter({ hasText: "종류 폴더" })
        .count()) > 0;
    const mapFolderActionsReady =
      (await page.locator(".folder-action-bar button").count()) >= 3;
    await page.screenshot({
      path: path.join(screenshotDir, "03-map-food-folder.png"),
    });
    await page.locator(".folder-photo-list .photo-open").first().click();
    await page.locator(".photo-detail-screen").waitFor();
    await waitForScreenTop(page);
    const mapPhotoDetailOpened =
      (await page.locator(".detail-actions button").count()) >= 3;
    await page.screenshot({
      path: path.join(screenshotDir, "04-map-photo-detail.png"),
    });
    await page
      .locator(".detail-actions")
      .getByRole("button", { name: /^보관$/ })
      .click();
    await page.locator(".detail-header .folder-back").click();
    await page
      .locator(".folder-action-bar")
      .getByRole("button", { name: /^보관$/ })
      .click();
    await page.locator(".folder-back").click();
    await page
      .locator(".folder-mode-tabs")
      .getByRole("button", { name: /기간별/ })
      .click();
    await page.locator(".period-bucket-list .bucket-card").first().click();
    await page.getByText("기간 폴더").waitFor();
    const periodFolderOpened =
      (await page
        .locator(".folder-header")
        .filter({ hasText: "기간 폴더" })
        .count()) > 0;
    await page.screenshot({
      path: path.join(screenshotDir, "05-map-period-folder.png"),
    });

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
    await page.screenshot({
      path: path.join(screenshotDir, "07-clean-photo-detail.png"),
    });
    await page.locator(".detail-header .folder-back").click();

    await clickBottomNav(page, "보관");
    await page.getByText("다시 볼 것만 보관").waitFor();
    await page.screenshot({ path: path.join(screenshotDir, "08-saved.png") });
    await page.getByRole("button", { name: /음식/ }).click();
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
    await page.screenshot({
      path: path.join(screenshotDir, "10-saved-photo-detail.png"),
    });

    const state = await page.evaluate(() => {
      const raw = window.localStorage.getItem("pictory-state-v1");
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
        categoryCoverage &&
        homeShortcutOpened &&
        mapCategoryFolderOpened &&
        periodFolderOpened &&
        cleanFolderOpened &&
        savedFolderOpened &&
        mapFolderActionsReady &&
        cleanFolderActionsReady &&
        savedFolderActionsReady &&
        mapPhotoDetailOpened &&
        cleanPhotoDetailOpened &&
        savedPhotoDetailOpened &&
        detailProtectedMask &&
        dom.brokenImages === 0 &&
        dom.detailScreens >= 1 &&
        dom.navItems.join(",") === "홈,지도,정리,보관",
      url: baseUrl,
      screenshots: screenshotDir,
      planId: state?.planId ?? "unknown",
      recentItems: state?.recentItems?.length ?? 0,
      savedIds: state?.savedIds?.length ?? 0,
      categoryCounts,
      cleanCounts,
      flow: {
        homeShortcutOpened,
        mapCategoryFolderOpened,
        periodFolderOpened,
        cleanFolderOpened,
        savedFolderOpened,
        mapFolderActionsReady,
        cleanFolderActionsReady,
        savedFolderActionsReady,
        mapPhotoDetailOpened,
        cleanPhotoDetailOpened,
        savedPhotoDetailOpened,
        detailProtectedMask,
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

async function clickBottomNav(page, label) {
  await page
    .locator(".bottom-nav-item")
    .filter({ hasText: new RegExp(`^${label}$`) })
    .click();
}

async function waitForScreenTop(page) {
  await page.waitForFunction(
    () => (document.querySelector(".screen-frame")?.scrollTop ?? 0) === 0,
    undefined,
    { timeout: 3_000 },
  );
}

function countBy(items, key) {
  return items.reduce((summary, item) => {
    const value = item[key];
    summary[value] = (summary[value] ?? 0) + 1;
    return summary;
  }, {});
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
