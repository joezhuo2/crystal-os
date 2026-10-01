import { defineConfig } from "@playwright/test";
import { config as loadEnv } from "dotenv";

// E2E_EMAIL and E2E_PASSWORD live in .env.local next to the Supabase keys
// (git-ignored). Use a dedicated test account: the smoke test writes a task
// and a transaction to it, then deletes them.
loadEnv({ path: ".env.local", quiet: true });

// Not 8080, so a dev server you already have open is left alone.
const port = Number(process.env.E2E_PORT ?? 8090);

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    // The Edge that ships with Windows, so no browser download is needed.
    // Set E2E_CHANNEL=chrome (or "" for Playwright's Chromium) elsewhere.
    channel: process.env.E2E_CHANNEL ?? "msedge",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npx vite --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
