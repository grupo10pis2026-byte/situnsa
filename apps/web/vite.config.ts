import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: "0.0.0.0",
    proxy: {
      // API_PROXY permite apuntar a otra API (p. ej. la de pruebas e2e).
      "/api": process.env.API_PROXY ?? "http://localhost:3001",
    },
  },
  build: { outDir: "dist" },
});
