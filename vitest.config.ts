import { defineConfig, mergeConfig } from "vitest/config";

import viteConfig from "./vite.config.ts";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      include: ["src/**/*.test.{ts,tsx}"],
      setupFiles: ["src/test/setup.ts"],
      // Interaction-heavy UI tests take 2-4 s alone; 5 s was too tight on a busy machine.
      testTimeout: 15_000,
    },
  })
);
