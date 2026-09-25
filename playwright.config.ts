import { defineConfig } from "@playwright/test";
import fs from "node:fs";

for (const envFile of [".env.local", ".env.test.local"]) {
  if (fs.existsSync(envFile) && typeof process.loadEnvFile === "function") {
    try {
      process.loadEnvFile(envFile);
    } catch {
      // Ignorar si el formato del archivo no es soportado
    }
  }
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 1,
  timeout: 30000,
  use: {
    // El equipo levanta el dev server en :3001 (ver AGENTS.md) — :3000 suele
    // estar ocupado por otros proyectos locales. Sin webServer: arranca
    // `npm run dev -- -p 3001` (o tu server en curso) antes de correr los tests.
    baseURL: "http://localhost:3001",
    trace: "on-first-retry",
  },
});
