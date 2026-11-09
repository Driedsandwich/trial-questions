import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/ui",
  fullyParallel: true,
  timeout: 45_000,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:4173/trial-questions/", trace: "off" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173/trial-questions/",
    reuseExistingServer: !process.env.CI,
  },
});
