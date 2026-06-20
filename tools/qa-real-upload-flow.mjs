import { spawn } from "node:child_process";
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const inputDir = path.join(projectRoot, "test-artifacts", "real-upload-inputs");
const screenshotDir = path.join(
  projectRoot,
  "temp_screenshots",
  `real-upload-qa-${new Date().toISOString().replace(/[:.]/g, "-")}`,
);
const evidencePath = path.join(projectRoot, "qa-evidence", "real-upload-flow.json");
const sourceFiles = [
  "receipt.jpg",
  "document.jpg",
  "food.jpg",
  "place.jpg",
  "people.jpg",
  "coupon.jpg",
  "dark.jpg",
  "food.jpg",
  "place.jpg",
  "people.jpg",
];

let serverProcess;

try {
  const uploadFiles = await prepareUploadFiles();
  const port = await findFreePort(5273);
  const baseUrl = `http://127.0.0.1:${port}`;
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
  await waitForServer(baseUrl);

  const report = await runRealUploadQa(baseUrl, uploadFiles);
  await mkdir(path.dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  serverProcess?.kill();
}

async function prepareUploadFiles() {
  await rm(inputDir, { recursive: true, force: true });
  await mkdir(inputDir, { recursive: true });
  await mkdir(screenshotDir, { recursive: true });

  return Promise.all(
    sourceFiles.map(async (sourceFile, index) => {
      const target = path.join(
        inputDir,
        `real-${String(index + 1).padStart(2, "0")}.jpg`,
      );
      const source = path.join(projectRoot, "public", "demo-album", sourceFile);
      await copyFile(source, target);
      return target;
    }),
  );
}

async function runRealUploadQa(baseUrl, uploadFiles) {
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
  await page.addInitScript(() => {
    globalThis.readPictoryState = () => {
      const raw = window.localStorage.getItem("pictory:v1");
      return raw == null ? {} : JSON.parse(raw);
    };
  });

  try {
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.evaluate(() => window.localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });
    await page.getByText("여행 다녀온 뒤").waitFor();
    await page.screenshot({
      path: path.join(screenshotDir, "00-home-before-upload.png"),
    });

    await page.getByRole("button", { name: /AI 30장 받기/ }).click();
    await page.waitForFunction(() => {
      const state = readPictoryState();
      return (state.credits ?? 0) >= 30;
    });
    const rewardCreditWorked = await page.evaluate(() => {
      const state = readPictoryState();
      return (state.credits ?? 0) >= 30;
    });

    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 15_000 }),
      page.getByRole("button", { name: /사진 선택/ }).click(),
    ]);
    await chooser.setFiles(uploadFiles);
    await page.getByText("여행 흐름을").waitFor({ timeout: 30_000 });
    await page.screenshot({
      path: path.join(screenshotDir, "01-map-after-real-upload.png"),
    });

    const uploadedState = await readState(page);
    const categoryCounts = countBy(uploadedState.recentItems ?? [], "categoryId");
    const cleanCounts = countBy(uploadedState.recentItems ?? [], "cleanBucketId");
    const importedRealFiles =
      (uploadedState.recentItems ?? []).length === uploadFiles.length &&
      (uploadedState.recentItems ?? []).every(
        (item) =>
          item.source === "local-file" &&
          /^real-\d{2}\.jpg$/.test(item.fileName ?? ""),
      );
    const categoryCoverage = Object.keys(categoryCounts).length >= 4;
    const cleanCoverage = Object.keys(cleanCounts).length >= 3;

    await page.locator(".map-summary-row").first().click();
    await page.locator(".folder-header").waitFor();
    const mapFolderOpened =
      (await page.locator(".folder-photo-list .photo-open").count()) > 0;
    await page.screenshot({
      path: path.join(screenshotDir, "02-map-folder-real-upload.png"),
    });

    const savedBefore = await readStoredIdCount(page, "savedIds");
    await page.locator(".folder-photo-list .photo-open").first().click();
    await page.locator(".photo-detail-screen").waitFor();
    const detailHasRealImage =
      (await page.locator(".detail-preview img").count()) > 0;
    await page
      .locator(".detail-actions")
      .getByRole("button", { name: /^킵$/ })
      .click();
    await waitForStoredIdCount(page, "savedIds", savedBefore, "increase");
    const detailSaveWorked =
      (await readStoredIdCount(page, "savedIds")) > savedBefore;
    await page.screenshot({
      path: path.join(screenshotDir, "03-detail-saved-real-upload.png"),
    });

    await page.locator(".detail-header .folder-back").click();
    await clickBottomNav(page, "선별");
    await page.getByText("올릴 컷만").waitFor();
    await page.screenshot({
      path: path.join(screenshotDir, "04-clean-real-upload.png"),
    });
    const queuedBefore = await readStoredIdCount(page, "queuedIds");
    const cleanInputCount = await page.locator(".clean-review-card input").count();
    if (cleanInputCount > 0) {
      await page.locator(".clean-review-card input").first().check();
      await page.locator(".clean-queue-action").filter({ hasText: "(1)" }).waitFor();
      await page.locator(".clean-queue-action").click();
      await waitForStoredIdCount(page, "queuedIds", queuedBefore, "increase");
    }
    const cleanQueueWorked =
      cleanInputCount > 0 &&
      (await readStoredIdCount(page, "queuedIds")) > queuedBefore;

    await clickBottomNav(page, "킵");
    await page.getByText("공유할 사진 세트로 저장").waitFor();
    await page.screenshot({
      path: path.join(screenshotDir, "05-saved-real-upload.png"),
    });
    await page.locator(".bucket-list .bucket-card").first().click();
    await page.locator(".folder-header").waitFor();
    await page.locator(".folder-photo-list .photo-open").first().click();
    await page.locator(".photo-detail-screen").waitFor();
    const savedBeforeUnsave = await readStoredIdCount(page, "savedIds");
    await page
      .locator(".detail-actions")
      .getByRole("button", { name: /^해제$/ })
      .click();
    await waitForStoredIdCount(page, "savedIds", savedBeforeUnsave, "decrease");
    const unsaveWorked =
      (await readStoredIdCount(page, "savedIds")) < savedBeforeUnsave;

    await clickBottomNav(page, "킵");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: /픽토리 데이터 삭제/ }).click();
    await page.waitForFunction(() => {
      const state = readPictoryState();
      return (
        (state.recentItems?.length ?? 0) === 0 &&
        (state.savedIds?.length ?? 0) === 0
      );
    });
    const clearWorked = await page.evaluate(() => {
      const state = readPictoryState();
      return (
        (state.recentItems?.length ?? 0) === 0 &&
        (state.savedIds?.length ?? 0) === 0
      );
    });

    const dom = await page.evaluate(() => ({
      brokenImages: Array.from(document.images).filter(
        (image) => image.complete && image.naturalWidth === 0,
      ).length,
      navItems: Array.from(document.querySelectorAll(".bottom-nav-item")).map(
        (node) => node.textContent?.trim(),
      ),
    }));
    const flow = {
      rewardCreditWorked,
      importedRealFiles,
      categoryCoverage,
      cleanCoverage,
      mapFolderOpened,
      detailHasRealImage,
      detailSaveWorked,
      cleanQueueWorked,
      unsaveWorked,
      clearWorked,
    };
    const report = {
      ok:
        Object.values(flow).every(Boolean) &&
        dom.brokenImages === 0 &&
        dom.navItems.join(",") === "홈,묶음,선별,킵" &&
        consoleIssues.length === 0,
      url: baseUrl,
      inputDir,
      uploadedFiles: uploadFiles.map((file) => path.basename(file)),
      uploadedCount: uploadedState.recentItems?.length ?? 0,
      categoryCounts,
      cleanCounts,
      flow,
      dom,
      screenshots: screenshotDir,
      consoleIssues,
    };

    if (!report.ok) {
      throw new Error(`Real upload QA failed: ${JSON.stringify(report, null, 2)}`);
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

async function readState(page) {
  return page.evaluate(() => readPictoryState());
}

async function readStoredIdCount(page, key) {
  const state = await readState(page);
  return Array.isArray(state?.[key]) ? state[key].length : 0;
}

async function waitForStoredIdCount(page, key, previousCount, direction) {
  await page.waitForFunction(
    ({ stateKey, count, mode }) => {
      const state = readPictoryState();
      const nextCount = Array.isArray(state?.[stateKey])
        ? state[stateKey].length
        : 0;
      return mode === "increase" ? nextCount > count : nextCount < count;
    },
    { stateKey: key, count: previousCount, mode: direction },
  );
}

function countBy(items, key) {
  return items.reduce((summary, item) => {
    const value = item[key];
    summary[value] = (summary[value] ?? 0) + 1;
    return summary;
  }, {});
}

async function waitForServer(baseUrl) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30_000) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until Vite is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Vite server did not start at ${baseUrl}`);
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
