/**
 * Configuración de pnpm test para dominio, contratos, DB, API y web.
 * Incluye el motor y adaptadores de /api/documentos/:id/analisis; no levanta un servidor HTTP.
 */
import { defineConfig } from "vitest/config";

// Proyectos explícitos: no carga plugins de compilación de Vite al probar reglas puras.
export default defineConfig({
  test: {
    projects: [
      ["packages/domain", "@pis/domain"],
      ["packages/contracts", "@pis/contracts"],
      ["packages/db", "@pis/db"],
      ["apps/api", "@pis/api"],
      ["apps/web", "@pis/web"],
    ].map(([root, name]) => ({
      test: {
        root,
        name,
        environment: "node",
        include: ["src/**/*.spec.ts", "__tests__/**/*.spec.ts"],
      },
    })),
  },
});
