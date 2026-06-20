import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { rmSync } from "node:fs";
import { resolve } from "node:path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), removeDemoAlbumFromRelease()],
});

function removeDemoAlbumFromRelease() {
  return {
    name: "pictory-remove-demo-album-from-release",
    apply: "build" as const,
    closeBundle() {
      for (const dir of ["dist/demo-album", "dist/web/demo-album"]) {
        rmSync(resolve(dir), { recursive: true, force: true });
      }
    },
  };
}
