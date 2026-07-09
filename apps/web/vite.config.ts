import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

// Minimal ambient declaration so the config typechecks without @types/node —
// the preview harness passes the assigned port through the PORT env var.
declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  plugins: [svelte()],
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
  },
});
