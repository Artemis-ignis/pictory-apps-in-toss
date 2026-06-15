import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const port = Number(process.env.PICTORY_QA_PORT ?? 5173);
const baseUrl = `http://127.0.0.1:${port}`;
const screenshotDir = path.join(
  projectRoot,
  "temp_screenshots",
  `runtime-qa-${new Date().toISOString().replace(/[:.]/g, "-")}`,
);

let serverProcess;

try {
  const alreadyRunning = await isServerReady();
  if (!alreadyRunning) {
    serverProcess = spawn(
      process.platform === "win32" ? "npm.cmd" : "npm",
      ["run", "web:dev", "--", "--host", "127.0.0.1", "--port", String(port)],
      {
        cwd: projectRoot,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    await waitForServer();
  }

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

    await page.getByRole("button", { name: /지도 만들기/ }).click();
    await page.getByText("종류별로 한눈에").waitFor({ timeout: 25_000 });
    await page.screenshot({ path: path.join(screenshotDir, "01-map.png") });

    await page.getByRole("button", { name: /음식/ }).click();
    await page.getByText("지도 폴더").waitFor();
    await page.locator(".folder-header").filter({ hasText: "음식" }).waitFor();
    await page.screenshot({
      path: path.join(screenshotDir, "02-map-food-folder.png"),
    });
    await page
      .locator(".folder-photo-list")
      .locator('button[aria-label="보관"]')
      .first()
      .click();

    await clickBottomNav(page, "정리");
    await page.getByText("지울 후보만").waitFor();
    await page.getByRole("button", { name: /민감정보 후보/ }).click();
    await page.getByText("정리 폴더").waitFor();
    await page
      .locator(".folder-header")
      .filter({ hasText: "민감정보 후보" })
      .waitFor();
    await page.screenshot({
      path: path.join(screenshotDir, "03-clean-sensitive-folder.png"),
    });

    await clickBottomNav(page, "보관");
    await page.getByText("다시 볼 것만 보관").waitFor();
    await page.screenshot({ path: path.join(screenshotDir, "04-saved.png") });

    const state = await page.evaluate(() => {
      const raw = window.localStorage.getItem("pictory-state-v1");
      return raw == null ? null : JSON.parse(raw);
    });
    const dom = await page.evaluate(() => ({
      brokenImages: Array.from(document.images).filter(
        (image) => image.complete && image.naturalWidth === 0,
      ).length,
      bucketCards: document.querySelectorAll(".bucket-card").length,
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
        categoryCoverage &&
        dom.brokenImages === 0 &&
        dom.navItems.join(",") === "홈,지도,정리,보관",
      url: baseUrl,
      screenshots: screenshotDir,
      recentItems: state?.recentItems?.length ?? 0,
      savedIds: state?.savedIds?.length ?? 0,
      categoryCounts,
      cleanCounts,
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

function countBy(items, key) {
  return items.reduce((summary, item) => {
    const value = item[key];
    summary[value] = (summary[value] ?? 0) + 1;
    return summary;
  }, {});
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
