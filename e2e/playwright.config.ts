/**
 * Configuración compartida de los E2E; E2E_BASE_URL indica el servidor ya levantado.
 * analisis-documental.spec.ts cubre /expedientes/$id y /api/documentos/:id/analisis.
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:80",
    trace: "on-first-retry",
    ...(["chromium", "msedge", "chrome"].includes(process.env.E2E_CHROMIUM_CHANNEL ?? "")
      ? { channel: process.env.E2E_CHROMIUM_CHANNEL }
      : {}),
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: undefined, // el entorno lo levanta `make prod:local` o `make dev`
});
