import { defineConfig, devices } from "@playwright/test";

const staticExport = process.env.PLAYWRIGHT_STATIC_EXPORT === "true";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 120000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3140",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: staticExport
        ? "node scripts/serve-export.js --port 3140"
        : "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3140",
      url: "http://127.0.0.1:3140",
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
    {
      command: "node --import tsx scripts/browser-backend.ts",
      url: "http://127.0.0.1:4140/health",
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
  ],
});
