import { defineConfig } from "@playwright/test";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });

// Not 8080, so a dev server you already have open is left alone.
const port = Number(process.env.E2E_PORT ?? 8090);

// The README screenshot run (e2e/screenshots.spec.ts) reuses the dev server you already have open.
const screenshots = !!process.env.SCREENSHOTS;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  // One retry in CI absorbs a slow runner; locally a failure should show up
  // straight away.
  retries: process.env.CI ? 1 : 0,
  reporter: [
    [process.env.CI ? "github" : "list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  outputDir: "test-results",
  use: {
    baseURL: screenshots ? (process.env.E2E_BASE_URL ?? "http://127.0.0.1:8080") : `http://127.0.0.1:${port}`,
    // The Edge that ships with Windows, so no browser download is needed.
    // Set E2E_CHANNEL=chrome (or "" for Playwright's Chromium) elsewhere.
    channel: process.env.E2E_CHANNEL ?? "msedge",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: screenshots
    ? undefined
    : {
        command: `npx vite --port ${port} --strictPort`,
        url: `http://127.0.0.1:${port}`,
        reuseExistingServer: !process.env.CI,
        // The smoke test adds and deletes rows; keep them out of your own data.
        env: { CRYSTAL_DATA_ROOT: "test-results/e2e-data" },
        timeout: 120_000,
      },
});
