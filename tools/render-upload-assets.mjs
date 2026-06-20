import { spawn } from "node:child_process";
import { readFile, mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const assetDir = path.join(projectRoot, "apps-in-toss-upload-images");
const rawDir = path.join(projectRoot, "temp_screenshots", "upload-assets");
const port = await findFreePort(5373);
const baseUrl = `http://127.0.0.1:${port}`;

let serverProcess;

try {
  await mkdir(rawDir, { recursive: true });
  await mkdir(assetDir, { recursive: true });

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
  const rawScreens = await captureScreens();
  await renderUploadAssets(rawScreens);
} finally {
  serverProcess?.kill();
}

async function captureScreens() {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
  });
  const paths = {
    home: path.join(rawDir, "home.png"),
    map: path.join(rawDir, "map.png"),
    clean: path.join(rawDir, "clean.png"),
    saved: path.join(rawDir, "saved.png"),
  };

  try {
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.evaluate(() => window.localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });
    await page.getByText("여행 다녀온 뒤").waitFor();

    await page.getByRole("button", { name: /베스트컷 찾기/ }).click();
    await page.getByText("여행 흐름을").waitFor({ timeout: 30_000 });
    await page.screenshot({ path: paths.map });

    await page.locator(".bucket-list .bucket-card").first().click();
    await page.locator(".folder-action-bar").getByRole("button", { name: /^킵$/ }).click();
    await page.waitForFunction(() => {
      const raw = window.localStorage.getItem("pictory:v1");
      const state = raw == null ? null : JSON.parse(raw);
      return (state?.savedIds?.length ?? 0) > 0;
    });
    await page.locator(".folder-back").click();

    await clickBottomNav(page, "홈");
    await page.getByText("최근 큐레이션").waitFor();
    await page.screenshot({ path: paths.home });

    await clickBottomNav(page, "묶음");
    await page.getByText("여행 흐름을").waitFor();

    await clickBottomNav(page, "선별");
    await page.getByText("올릴 컷만").waitFor();
    await page.screenshot({ path: paths.clean });

    await clickBottomNav(page, "킵");
    await page.getByText("공유할 사진 세트로 저장").waitFor();
    await page.screenshot({ path: paths.saved });

    return paths;
  } finally {
    await browser.close();
  }
}

async function renderUploadAssets(rawScreens) {
  const browser = await chromium.launch();
  try {
    const screens = {
      home: await dataUri(rawScreens.home),
      map: await dataUri(rawScreens.map),
      clean: await dataUri(rawScreens.clean),
      saved: await dataUri(rawScreens.saved),
    };
    const icon = await dataUri(path.join(projectRoot, "public", "pictory-icon.png"));
    const mascot = await dataUri(
      path.join(projectRoot, "public", "pictory-mascot-home.png"),
    );

    await renderPhonePoster(browser, screens.home, "홈.png");
    await renderPhonePoster(browser, screens.map, "지도.png");
    await renderPhonePoster(browser, screens.clean, "정리.png");
    await renderPhonePoster(browser, screens.saved, "보관.png");
    await renderThumbnail(browser, { screens, icon, mascot });
  } finally {
    await browser.close();
  }
}

async function renderPhonePoster(browser, screen, fileName) {
  const page = await browser.newPage({
    viewport: { width: 636, height: 1048 },
    deviceScaleFactor: 1,
  });
  try {
    await page.setContent(phonePosterHtml(screen));
    await waitForImages(page);
    await page.screenshot({ path: path.join(assetDir, fileName) });
  } finally {
    await page.close();
  }
}

async function renderThumbnail(browser, data) {
  const page = await browser.newPage({
    viewport: { width: 1932, height: 828 },
    deviceScaleFactor: 1,
  });
  try {
    await page.setContent(thumbnailHtml(data));
    await waitForImages(page);
    await page.screenshot({ path: path.join(assetDir, "썸네일.png") });
  } finally {
    await page.close();
  }
}

function phonePosterHtml(screen) {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; width: 636px; height: 1048px; overflow: hidden; }
    body {
      display: grid;
      place-items: center;
      background:
        radial-gradient(circle at 22% 4%, rgba(47, 128, 255, 0.24), transparent 34%),
        radial-gradient(circle at 82% 92%, rgba(57, 199, 137, 0.16), transparent 32%),
        linear-gradient(180deg, #eaf7ff 0%, #f8fcff 52%, #e7f4ff 100%);
      font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;
    }
    .phone {
      width: 500px;
      height: 1024px;
      padding: 12px;
      border: 14px solid rgba(255, 255, 255, 0.82);
      border-radius: 66px;
      background: #f8fbff;
      box-shadow:
        0 34px 74px rgba(29, 83, 148, 0.2),
        inset 0 0 0 1px rgba(47, 128, 255, 0.08);
    }
    .screen {
      width: 100%;
      aspect-ratio: 390 / 844;
      display: block;
      border-radius: 44px;
      object-fit: cover;
      box-shadow: inset 0 0 0 1px rgba(7, 23, 53, 0.08);
    }
  </style>
</head>
<body>
  <main class="phone"><img class="screen" src="${screen}" alt="" /></main>
</body>
</html>`;
}

function thumbnailHtml({ screens, icon, mascot }) {
  const phones = [
    ["홈", "#1267ff", screens.home],
    ["묶음", "#009b68", screens.map],
    ["선별", "#f26a00", screens.clean],
    ["킵", "#7437e8", screens.saved],
  ];

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; width: 1932px; height: 828px; overflow: hidden; }
    body {
      font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;
      color: #071735;
      background:
        radial-gradient(circle at 6% 8%, rgba(255, 255, 255, 0.96), transparent 15%),
        radial-gradient(circle at 70% 8%, rgba(255, 255, 255, 0.78), transparent 22%),
        radial-gradient(circle at 82% 88%, rgba(47, 128, 255, 0.18), transparent 30%),
        linear-gradient(180deg, #bfe8ff 0%, #eaf8ff 52%, #d7efff 100%);
    }
    .stage { position: relative; width: 1932px; height: 828px; }
    .brand-block { position: absolute; left: 40px; top: 66px; width: 640px; }
    .brand-top { display: flex; align-items: center; gap: 38px; }
    .icon {
      width: 192px; height: 192px; border-radius: 46px;
      box-shadow: 0 24px 58px rgba(25, 92, 160, 0.18);
    }
    .logo { font-size: 88px; line-height: 1; font-weight: 950; letter-spacing: -1px; }
    .headline {
      margin-top: 72px;
      font-size: 78px;
      line-height: 1.16;
      font-weight: 950;
      letter-spacing: -1px;
    }
    .headline b { display: block; color: #1267ff; }
    .copy {
      margin-top: 30px;
      width: 440px;
      color: #0b213f;
      font-size: 31px;
      line-height: 1.38;
      font-weight: 750;
    }
    .chips { display: flex; gap: 18px; margin-top: 36px; }
    .chip {
      min-width: 154px;
      height: 72px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 24px;
      background: rgba(255, 255, 255, 0.9);
      box-shadow: 0 14px 32px rgba(28, 88, 150, 0.1);
      font-size: 31px;
      font-weight: 950;
    }
    .chip:nth-child(1) { color: #1267ff; }
    .chip:nth-child(2) { color: #009b68; }
    .chip:nth-child(3) { color: #f26a00; }
    .mascot {
      position: absolute;
      left: 520px;
      top: 448px;
      width: 214px;
      filter: drop-shadow(0 24px 38px rgba(30, 82, 146, 0.18));
    }
    .phones {
      position: absolute;
      left: 742px;
      top: 60px;
      display: grid;
      grid-template-columns: repeat(4, 266px);
      gap: 26px;
      align-items: start;
    }
    .phone-unit { display: flex; flex-direction: column; align-items: center; gap: 18px; }
    .phone {
      width: 266px;
      height: 528px;
      padding: 10px;
      border: 10px solid rgba(255, 255, 255, 0.84);
      border-radius: 48px;
      background: #f8fbff;
      box-shadow:
        0 26px 54px rgba(25, 92, 160, 0.18),
        inset 0 0 0 1px rgba(47, 128, 255, 0.08);
    }
    .phone img {
      width: 100%;
      height: 100%;
      display: block;
      object-fit: cover;
      border-radius: 32px;
    }
    .label {
      min-width: 142px;
      height: 58px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 3px solid currentColor;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.74);
      font-size: 31px;
      font-weight: 950;
      color: var(--accent);
    }
  </style>
</head>
<body>
  <main class="stage">
    <section class="brand-block">
      <div class="brand-top">
        <img class="icon" src="${icon}" alt="" />
        <div class="logo">픽토리</div>
      </div>
      <div class="headline"><b>쌓인 사진</b>한 번에 선별</div>
      <p class="copy">여행, 맛집, 캡처, 영수증까지<br />앱 안에서 먼저 묶고 올릴 컷만 킵해요.</p>
      <div class="chips">
        <span class="chip">묶음</span>
        <span class="chip">선별</span>
        <span class="chip">킵</span>
      </div>
    </section>
    <img class="mascot" src="${mascot}" alt="" />
    <section class="phones">
      ${phones
        .map(
          ([label, color, src]) => `
          <article class="phone-unit" style="--accent:${color}">
            <div class="phone"><img src="${src}" alt="" /></div>
            <div class="label">${label}</div>
          </article>`,
        )
        .join("")}
    </section>
  </main>
</body>
</html>`;
}

async function clickBottomNav(page, label) {
  await page
    .locator(".bottom-nav-item")
    .filter({ hasText: new RegExp(`^${label}$`) })
    .click();
}

async function waitForImages(page) {
  await page.waitForFunction(() =>
    Array.from(document.images).every(
      (image) => image.complete && image.naturalWidth > 0,
    ),
  );
}

async function dataUri(file) {
  const content = await readFile(file);
  return `data:image/png;base64,${content.toString("base64")}`;
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) {
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Timed out waiting for ${baseUrl}`);
}

function findFreePort(startPort) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", (error) => {
      if (error.code === "EADDRINUSE") {
        findFreePort(startPort + 1).then(resolve, reject);
        return;
      }
      reject(error);
    });
    server.once("listening", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
    server.listen(startPort, "127.0.0.1");
  });
}
