import { defineConfig } from "@apps-in-toss/web-framework/config";

export default defineConfig({
  appName: "pictory",
  brand: {
    displayName: "픽토리",
    primaryColor: "#2F80FF",
    icon: "/pictory-icon.svg",
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
  permissions: [{ name: "photos", access: "read" }],
  outdir: "dist",
});
