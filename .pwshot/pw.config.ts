import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "./", outputDir: "./out", timeout: 60000, retries: 0, use: { baseURL: "http://localhost:3002" } });
