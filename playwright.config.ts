import { defineConfig, devices } from "@playwright/test";

const captureScreenshots = process.env.OA_QA_SCREENSHOTS === "1";
const externalBaseUrl = process.env.OA_BASE_URL;
const localBaseUrl = "http://127.0.0.1:3107";

export default defineConfig({
  testDir: "./e2e",
  outputDir: process.env.OA_QA_OUTPUT_DIR ?? "test-results",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: externalBaseUrl ?? localBaseUrl,
    trace: "retain-on-failure",
    screenshot: captureScreenshots ? "on" : "only-on-failure",
  },
  projects: [
    {
      name: "mobile-375",
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 375, height: 812 },
      },
    },
    {
      name: "mobile-390",
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "mobile-430",
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 430, height: 932 },
      },
    },
    {
      name: "tablet-768",
      use: { viewport: { width: 768, height: 1024 } },
    },
    {
      name: "tablet-1024",
      use: { viewport: { width: 1024, height: 900 } },
    },
    {
      name: "desktop-1280",
      use: { viewport: { width: 1280, height: 900 } },
    },
    {
      name: "desktop-1440",
      use: { viewport: { width: 1440, height: 960 } },
    },
    {
      name: "desktop-1920",
      use: { viewport: { width: 1920, height: 1080 } },
    },
  ],
  ...(externalBaseUrl
    ? {}
    : {
        webServer: {
          command: "npm run dev -- --hostname 127.0.0.1 --port 3107",
          url: localBaseUrl,
          env: {
            NEXT_PUBLIC_OA_TEST_NOW: "2026-08-08T00:00:00.000Z",
          },
          reuseExistingServer: false,
          timeout: 120_000,
        },
      }),
});
