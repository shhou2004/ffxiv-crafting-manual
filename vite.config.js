import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/ffxiv-crafting-manual/", // ← 改成你的 repo 名，前後都要有 /
});
