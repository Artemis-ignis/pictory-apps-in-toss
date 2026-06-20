import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const outDir = path.join(projectRoot, "dist", "web");
const requestedPort = Number(process.env.PICTORY_QA_PORT ?? 0);
const port = requestedPort > 0 ? requestedPort : await findFreePort(6173);
const baseUrl = `http://127.0.0.1:${port}`;
const screenshotDir = path.join(
  projectRoot,
  "temp_screenshots",
  `built-web-qa-${new Date().toISOString().replace(/[:.]/g, "-")}`,
);
const evidencePath = path.join(projectRoot, "qa-evidence", "built-flow.json");

if (!existsSync(path.join(outDir, "index.html"))) {
  throw new Error("dist/web/index.html is missing. Run `npm run build` first.");
}

let serverProcess;

try {
  serverProcess = spawn(
    process.execPath,
    [
      path.join(projectRoot, "node_modules", "vite", "bin", "vite.js"),
      "preview",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--outDir",
      outDir,
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
    `${JSON.stringify(report, null, 2)}\n`,
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
  await page.addInitScript((state) => {
    window.localStorage.setItem("pictory:v1", JSON.stringify(state));
  }, seedState());

  try {
    const appFunctionDeepLinks = await verifyAppFunctionLinks(page);
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.getByText("여행 다녀온 뒤").waitFor();
    await page.screenshot({ path: path.join(screenshotDir, "00-home.png") });
    const importModesReady = await verifyImportModes(page);
    await page.screenshot({
      path: path.join(screenshotDir, "00-import-modes.png"),
    });

    await clickBottomNav(page, "묶음");
    await page.getByText("여행 흐름을").waitFor();
    await page.screenshot({ path: path.join(screenshotDir, "01-map.png") });
    await page.locator(".bucket-list .bucket-card").filter({ hasText: /^음식/ }).click();
    await page.locator(".folder-header").filter({ hasText: "음식" }).waitFor();
    const mapFolderOpened =
      (await page
        .locator(".folder-header")
        .filter({ hasText: "콘텐츠 묶음" })
        .count()) > 0;
    await page.locator(".folder-photo-list .photo-open").first().click();
    await page.locator(".photo-detail-screen").waitFor();
    const mapPhotoDetailOpened =
      (await page.locator(".detail-actions button").count()) >= 3;
    await page.screenshot({
      path: path.join(screenshotDir, "02-map-detail.png"),
    });

    await clickBottomNav(page, "선별");
    await page.getByText("올릴 컷만").waitFor();
    await page.getByRole("button", { name: /민감정보 후보/ }).click();
    await page
      .locator(".folder-header")
      .filter({ hasText: "민감정보 후보" })
      .waitFor();
    const cleanFolderOpened =
      (await page
        .locator(".folder-header")
        .filter({ hasText: "선별 폴더" })
        .count()) > 0;
    await page.locator(".folder-photo-list .photo-open").first().click();
    await page.locator(".photo-detail-screen").waitFor();
    const detailProtectedMask =
      (await page
        .locator(".detail-preview.is-protected .detail-mask")
        .count()) > 0;
    const storedSensitivePreviewKeptPrivate =
      detailProtectedMask &&
      (await page.getByRole("button", { name: /^보기$/ }).count()) === 0;
    await page.screenshot({
      path: path.join(screenshotDir, "03-clean-detail.png"),
    });

    await clickBottomNav(page, "킵");
    await page.getByText("공유할 사진 세트로 저장").waitFor();
    await page.locator(".bucket-list .bucket-card").filter({ hasText: /^음식/ }).click();
    await page.locator(".folder-header").filter({ hasText: "음식" }).waitFor();
    const savedFolderOpened =
      (await page
        .locator(".folder-header")
        .filter({ hasText: "킵 폴더" })
        .count()) > 0;
    await page.locator(".folder-photo-list .photo-open").first().click();
    await page.locator(".photo-detail-screen").waitFor();
    const savedDetailHasUnsave =
      (await page
        .locator(".detail-actions")
        .getByRole("button", { name: /^해제$/ })
        .count()) > 0;
    await page.screenshot({
      path: path.join(screenshotDir, "04-saved-detail.png"),
    });

    const dom = await page.evaluate(() => ({
      brokenImages: Array.from(document.images).filter(
        (image) => image.complete && image.naturalWidth === 0,
      ).length,
      navItems: Array.from(document.querySelectorAll(".bottom-nav-item")).map(
        (node) => node.textContent?.trim(),
      ),
      detailScreens: document.querySelectorAll(".photo-detail-screen").length,
    }));
    const flow = {
      ...appFunctionDeepLinks,
      importModesReady,
      mapFolderOpened,
      mapPhotoDetailOpened,
      cleanFolderOpened,
      detailProtectedMask,
      storedSensitivePreviewKeptPrivate,
      savedFolderOpened,
      savedDetailHasUnsave,
    };
    const report = {
      ok:
        Object.values(flow).every(Boolean) &&
        dom.brokenImages === 0 &&
        dom.navItems.join(",") === "홈,묶음,선별,킵" &&
        consoleIssues.length === 0,
      url: baseUrl,
      screenshots: screenshotDir,
      recentItems: 8,
      savedIds: 1,
      flow,
      dom,
      consoleIssues,
    };

    if (!report.ok) {
      throw new Error(`Built web QA failed: ${JSON.stringify(report, null, 2)}`);
    }

    return report;
  } finally {
    await browser.close();
  }
}

async function verifyAppFunctionLinks(page) {
  const entries = [
    ["home", "홈"],
    ["map", "묶음"],
    ["clean", "선별"],
    ["saved", "킵"],
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
      .filter({ hasText: "오래된 컷 보기" })
      .count()) > 0;

  await page
    .locator(".import-mode-grid button")
    .filter({ hasText: "날짜" })
    .click();
  const dateReady =
    (await page
      .locator(".primary-action")
      .filter({ hasText: "날짜별 컷 찾기" })
      .count()) > 0 &&
    (await page.locator(".import-date-input").count()) === 1;

  await page
    .locator(".import-mode-grid button")
    .filter({ hasText: "인스타" })
    .click();
  const instagramReady =
    (await page
      .locator(".primary-action")
      .filter({ hasText: "인스타 세트 만들기" })
      .count()) > 0;

  await page
    .locator(".import-mode-grid button")
    .filter({ hasText: "최신순" })
    .click();
  const recentReady =
    (await page
      .locator(".primary-action")
      .filter({ hasText: "베스트컷 찾기" })
      .count()) > 0;

  return oldestReady && dateReady && instagramReady && recentReady;
}

function seedState() {
  const categories = [
    ["food", "keep", "normal"],
    ["capture", "capturePile", "review"],
    ["document", "sensitive", "sensitive"],
    ["receipt", "needsReview", "review"],
    ["place", "keep", "normal"],
    ["people", "needsReview", "review"],
    ["coupon", "sensitive", "sensitive"],
    ["memory", "similar", "normal"],
  ];
  const now = new Date("2026-06-15T09:00:00+09:00");
  const recentItems = categories.map(([categoryId, cleanBucketId, privacy], index) => ({
    id: `built-${categoryId}`,
    type: "PHOTO",
    dataUri: svgDataUri(categoryId, privacy),
    source: "native-scan",
    createdAt: new Date(now.getTime() - index * 86_400_000).toISOString(),
    fileName: `built-${categoryId}.jpg`,
    categoryId,
    cleanBucketId,
    confidence: privacy === "normal" ? 0.86 : 0.72,
    reasons: [`${categoryId} seed`],
    privacy,
    periodKey: "2026-06-15",
    periodLabel: "2026. 6. 15.",
    status: index === 0 ? "saved" : "inbox",
  }));

  return {
    savedIds: ["built-food"],
    queuedIds: [],
    ignoredIds: [],
    credits: 30,
    planId: "plus",
    usageMonth: "2026-06",
    monthlyScanUsed: 8,
    recentItems,
    scanHistory: [
      {
        id: "built-history",
        scannedAt: "2026-06-15T09:00:00.000+09:00",
        totalCount: recentItems.length,
        cleanCandidateCount: 5,
        mapBucketCount: 8,
      },
    ],
  };
}

function capitalize(value) {
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}

function svgDataUri(label, privacy) {
  const fill = privacy === "sensitive" ? "#eef4ff" : "#eaf8f0";
  const stroke = privacy === "sensitive" ? "#2f80ff" : "#17b26a";
  return `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240">
  <rect width="320" height="240" rx="34" fill="${fill}"/>
  <rect x="68" y="56" width="184" height="128" rx="24" fill="white" stroke="${stroke}" stroke-width="10"/>
  <circle cx="124" cy="108" r="20" fill="${stroke}" opacity=".32"/>
  <path d="M96 158h128M96 132h92" stroke="${stroke}" stroke-width="14" stroke-linecap="round"/>
  <text x="160" y="214" text-anchor="middle" font-family="Arial" font-size="24" fill="#0b1736">${label}</text>
</svg>
`)}`;
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

  throw new Error(`Vite preview did not start at ${baseUrl}`);
}
