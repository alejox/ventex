import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 1,
  timeout: 30000,
  use: {
    baseURL: "http://localhost:3001",
    trace: "on-first-retry",
  },
});
