import { defineConfig, devices } from "@playwright/test";

const BACKEND_PORT = 3100;
const FRONTEND_PORT = 5174;

/**
 * Full stack against the test database and a fake Azure DevOps org
 * (backend/tests/e2e/server.ts). No real Azure DevOps calls are made.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${FRONTEND_PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm run e2e:server",
      cwd: "../backend",
      url: `http://localhost:${BACKEND_PORT}/`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        E2E_PORT: String(BACKEND_PORT),
        E2E_FRONTEND_ORIGIN: `http://localhost:${FRONTEND_PORT}`,
        SOP_ADMIN_EMAILS: "owner@example.com",
      },
    },
    {
      command: `npx vite --port ${FRONTEND_PORT} --strictPort`,
      url: `http://localhost:${FRONTEND_PORT}`,
      timeout: 60_000,
      reuseExistingServer: false,
      env: { VITE_API_BASE_URL: `http://localhost:${BACKEND_PORT}` },
    },
  ],
});
