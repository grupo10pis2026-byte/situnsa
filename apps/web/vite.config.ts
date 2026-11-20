import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Carpeta de un paquete de diccionario Hunspell. Sus `exports` solo publican
 * index.js (lectura con fs, no apta para navegador); el alias permite
 * importar index.aff / index.dic como assets (`?url`) para el corrector.
 */
const carpetaPaquete = (nombre: string) => dirname(fileURLToPath(import.meta.resolve(nombre)));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@diccionario-es": carpetaPaquete("dictionary-es"),
      "@diccionario-en": carpetaPaquete("dictionary-en"),
    },
  },
  server: {
    port: 5173,
    host: "0.0.0.0",
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
  build: { outDir: "dist" },
});
