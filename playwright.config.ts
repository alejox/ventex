import { defineConfig } from "@playwright/test";

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
