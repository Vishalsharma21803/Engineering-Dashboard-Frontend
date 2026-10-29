import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    // 3000 and 5173 are used by other local stacks (SolidTime); fail loudly instead of drifting.
    port: 5180,
    strictPort: true,
    allowedHosts: [".trycloudflare.com", ".ngrok-free.app", ".ngrok-free.dev", ".ngrok.app"],
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
