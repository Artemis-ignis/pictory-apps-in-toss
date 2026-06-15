#!/usr/bin/env node
import { access, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const args = parseArgs(process.argv.slice(2));
const appName = slugify(args.name ?? "my-apps-in-toss-app");
const title = args.title ?? toTitle(appName);
const primary = args.primary ?? "#2F80FF";
const includePhotos = args.photos !== false;
const dest = path.resolve(args.dest ?? path.join(process.cwd(), appName));

await ensureWritableDest(dest, Boolean(args.force));

const files = createFiles({ appName, title, primary, includePhotos });

for (const [relativePath, content] of Object.entries(files)) {
  const target = path.join(dest, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

console.log(`created ${title} at ${dest}`);
console.log("next:");
console.log(`  cd ${dest}`);
console.log("  npm install");
console.log("  npm run web:dev");
console.log("  npm run build");

function parseArgs(tokens) {
  const parsed = {};

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    if (key.startsWith("no-")) {
      parsed[toCamel(key.slice(3))] = false;
      continue;
    }

    const next = tokens[index + 1];
    if (next == null || next.startsWith("--")) {
      parsed[toCamel(key)] = true;
      continue;
    }

    parsed[toCamel(key)] = next;
    index += 1;
  }

  return parsed;
}

function toCamel(value) {
  return value.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function slugify(value) {
  const slug = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "my-apps-in-toss-app";
}

function toTitle(value) {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

async function ensureWritableDest(target, force) {
  await mkdir(target, { recursive: true });

  try {
    await access(target);
    const entries = await readdir(target);
    if (entries.length > 0 && !force) {
      throw new Error(
        `Destination is not empty: ${target}. Use --force to overwrite files.`,
      );
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

function createFiles({ appName, title, primary, includePhotos }) {
  return {
    ".gitignore": gitignore(),
    "README.md": readme({ title }),
    "index.html": indexHtml({ title }),
    "package.json": packageJson({ appName }),
    "tsconfig.json": tsconfig(),
    "tsconfig.app.json": tsconfigApp(),
    "tsconfig.node.json": tsconfigNode(),
    "vite.config.ts": viteConfig(),
    "granite.config.ts": graniteConfig({
      appName,
      title,
      primary,
      includePhotos,
    }),
    "public/app-icon.svg": appIcon({ primary }),
    "src/main.tsx": mainTsx(),
    "src/App.tsx": appTsx({ title, includePhotos }),
    "src/App.css": appCss({ primary }),
  };
}

function packageJson({ appName }) {
  return `${JSON.stringify(
    {
      name: appName,
      private: true,
      version: "0.1.0",
      type: "module",
      scripts: {
        dev: "granite dev",
        "web:dev": "vite dev",
        typecheck: "tsc -b",
        build: "ait build",
        "web:build": "tsc -b && vite build",
        preview: "vite preview",
      },
      dependencies: {
        "@apps-in-toss/web-framework": "^2.7.0",
        "@vitejs/plugin-react": "^4.3.4",
        react: "^18.3.1",
        "react-dom": "^18.3.1",
        typescript: "~5.7.2",
        vite: "^6.2.0",
      },
      devDependencies: {
        "@types/react": "^18.3.31",
        "@types/react-dom": "^18.3.7",
      },
    },
    null,
    2,
  )}\n`;
}

function graniteConfig({ appName, title, primary, includePhotos }) {
  const permissions = includePhotos
    ? '  permissions: [{ name: "photos", access: "read" }],\n'
    : "";

  return `import { defineConfig } from "@apps-in-toss/web-framework/config";

export default defineConfig({
  appName: "${appName}",
  brand: {
    displayName: "${title}",
    primaryColor: "${primary}",
    icon: "/app-icon.svg",
  },
  web: {
    host: "localhost",
    port: 5173,
    commands: {
      dev: "vite dev --host 127.0.0.1 --port 5173",
      build: "vite build",
    },
  },
  webViewProps: {
    type: "partner",
    bounces: false,
    pullToRefreshEnabled: false,
    overScrollMode: "never",
  },
  navigationBar: {
    withBackButton: true,
    withHomeButton: true,
  },
${permissions}  outdir: "dist",
});
`;
}

function appTsx({ title, includePhotos }) {
  if (!includePhotos) {
    return `import "./App.css";

export default function App() {
  return (
    <main className="app-shell">
      <section className="hero">
        <span className="badge">Apps in Toss</span>
        <h1>${title}</h1>
        <p>작은 생활 문제를 빠르게 해결하는 미니앱입니다.</p>
      </section>
      <section className="panel">
        <h2>첫 기능</h2>
        <p>여기에 핵심 사용자 행동 하나를 바로 붙이면 됩니다.</p>
        <button type="button">시작하기</button>
      </section>
    </main>
  );
}
`;
  }

  return `import { useMemo, useState } from "react";
import { fetchAlbumItems } from "@apps-in-toss/web-framework";
import "./App.css";

type Photo = {
  id: string;
  dataUri: string;
};

const samplePhotos: Photo[] = [
  { id: "sample-1", dataUri: makeSample("#EAF3FF", "#2F80FF", "캡처") },
  { id: "sample-2", dataUri: makeSample("#E9FBF3", "#39C789", "기록") },
  { id: "sample-3", dataUri: makeSample("#FFF3E6", "#FF9F2F", "영수증") },
];

export default function App() {
  const [photos, setPhotos] = useState<Photo[]>(samplePhotos);
  const [status, setStatus] = useState("샘플 사진으로 시작했어요.");

  const summary = useMemo(() => {
    const count = photos.length;
    return count === 0 ? "아직 사진이 없어요" : \`\${count}장 준비됨\`;
  }, [photos.length]);

  async function pickPhotos() {
    try {
      const selected = await fetchAlbumItems({
        types: ["PHOTO"],
        maxCount: 12,
        maxWidth: 720,
        base64: true,
      });
      const nextPhotos = selected.map((item, index) => ({
        id: item.id || \`photo-\${index}\`,
        dataUri: normalizeDataUri(item.dataUri),
      }));
      setPhotos(nextPhotos);
      setStatus(\`\${nextPhotos.length}장을 앨범에서 가져왔어요.\`);
    } catch {
      setPhotos(samplePhotos);
      setStatus("브라우저에서는 샘플 사진으로 동작해요.");
    }
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <span className="badge">Apps in Toss</span>
        <h1>${title}</h1>
        <p>앨범 사진을 가져와 한눈에 정리하는 미니앱 시작점입니다.</p>
      </section>

      <section className="panel">
        <div>
          <h2>{summary}</h2>
          <p>{status}</p>
        </div>
        <button type="button" onClick={pickPhotos}>
          사진 선택
        </button>
      </section>

      <section className="grid" aria-label="사진 미리보기">
        {photos.map((photo) => (
          <img key={photo.id} src={photo.dataUri} alt="" />
        ))}
      </section>
    </main>
  );
}

function normalizeDataUri(dataUri: string) {
  return dataUri.startsWith("data:") ? dataUri : \`data:image/jpeg;base64,\${dataUri}\`;
}

function makeSample(background: string, accent: string, label: string) {
  const svg = \`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
    <rect width="240" height="240" rx="48" fill="\${background}"/>
    <rect x="34" y="38" width="172" height="164" rx="28" fill="white" opacity=".82"/>
    <circle cx="82" cy="96" r="24" fill="\${accent}" opacity=".9"/>
    <path d="M48 170l52-48 36 34 28-24 38 38H48z" fill="\${accent}" opacity=".35"/>
    <text x="52" y="72" font-size="22" font-weight="800" fill="\${accent}">\${label}</text>
  </svg>\`;
  return \`data:image/svg+xml;charset=utf-8,\${encodeURIComponent(svg)}\`;
}
`;
}

function appCss({ primary }) {
  return `:root {
  font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #071735;
  background: #eef4fb;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}

button {
  border: 0;
  font: inherit;
}

.app-shell {
  width: min(100vw, 390px);
  min-height: 100svh;
  margin: 0 auto;
  padding: 28px 20px;
  background: #fff;
}

.hero {
  padding: 32px 0 24px;
}

.badge {
  display: inline-flex;
  padding: 7px 10px;
  border-radius: 999px;
  color: ${primary};
  background: #eff5ff;
  font-size: 13px;
  font-weight: 800;
}

h1 {
  margin: 18px 0 8px;
  font-size: 38px;
  line-height: 1.08;
  letter-spacing: 0;
}

p {
  margin: 0;
  color: #5d6b82;
  font-weight: 700;
  line-height: 1.45;
}

.panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px;
  border: 1px solid #e5edf7;
  border-radius: 20px;
  box-shadow: 0 10px 30px rgba(19, 48, 92, 0.08);
}

.panel h2 {
  margin: 0 0 6px;
  font-size: 22px;
}

.panel button {
  min-width: 96px;
  min-height: 48px;
  border-radius: 14px;
  color: #fff;
  background: ${primary};
  font-weight: 900;
}

.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-top: 20px;
}

.grid img {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 18px;
  object-fit: cover;
  background: #eef4fb;
}
`;
}

function mainTsx() {
  return `import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`;
}

function indexHtml({ title }) {
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" href="/app-icon.svg" />
    <title>${title}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
}

function appIcon({ primary }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <rect width="96" height="96" rx="24" fill="${primary}"/>
  <rect x="24" y="22" width="48" height="52" rx="12" fill="white" opacity=".95"/>
  <path d="M32 60l12-14 10 10 8-8 10 12H32z" fill="${primary}" opacity=".85"/>
  <circle cx="38" cy="36" r="6" fill="${primary}" opacity=".75"/>
</svg>
`;
}

function readme({ title }) {
  return `# ${title}

Apps in Toss Maker로 생성한 미니앱입니다.

## 실행

\`\`\`powershell
npm install
npm run web:dev
\`\`\`

## 빌드

\`\`\`powershell
npm run build
\`\`\`

빌드가 성공하면 프로젝트 루트에 \`.ait\` 파일이 생성됩니다.
`;
}

function gitignore() {
  return `node_modules
dist
*.log
*.local
.env
.env.*
!.env.example
*.tsbuildinfo
`;
}

function tsconfig() {
  return `{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
`;
}

function tsconfigApp() {
  return `{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src"]
}
`;
}

function tsconfigNode() {
  return `{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "noEmit": true
  },
  "include": ["vite.config.ts", "granite.config.ts"]
}
`;
}

function viteConfig() {
  return `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
`;
}
