// Primero: variables de entorno (antes de cualquier módulo que lea process.env).
import "./config/cargar-env.js";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { manejarError, manejarNoEncontrado } from "./infra/http/manejador-errores.js";
import { registerAsesoresRoutes } from "./modules/asesores/asesores.routes.js";
import { registerAuthRoutes } from "./modules/auth/auth.routes.js";
import { registerProgramasRoutes } from "./modules/catalogos/catalogos.routes.js";
import { registerCierreRoutes } from "./modules/cierre/cierre.routes.js";
import { registerConfiguracionRoutes } from "./modules/configuracion/configuracion.routes.js";
import { registerDocumentosRoutes } from "./modules/documentos/documentos.routes.js";
import { registerExpedientesRoutes } from "./modules/expedientes/expedientes.routes.js";
import { registerReportesTitulacionRoutes } from "./modules/reportes/reportes.routes.js";
import { registerSeguimientoRoutes } from "./modules/seguimiento/seguimiento.routes.js";
import { registerSeguridadRoutes } from "./modules/seguridad/seguridad.routes.js";
import { registerTallerConfigRoutes } from "./modules/taller-config/taller-config.routes.js";
import { registerAlertasTallerRoutes } from "./modules/talleres/alertas/alertas.routes.js";
import { registerEncuestasTallerRoutes } from "./modules/talleres/encuestas/encuestas.js";
import { registerFichaCierreRoutes } from "./modules/talleres/ficha/ficha-cierre.routes.js";
import { registerHitosRoutes } from "./modules/talleres/hitos/hitos.routes.js";
import { registerMiTallerRoutes } from "./modules/talleres/mi-taller/mi-taller.js";
import { registerPagosTallerRoutes } from "./modules/talleres/pagos/pagos.routes.js";
import { registerProyectosRoutes } from "./modules/talleres/proyectos/proyectos.routes.js";
import { registerSesionesRoutes } from "./modules/talleres/sesiones/sesiones.routes.js";
import { registerTalleresRoutes } from "./modules/talleres/talleres.routes.js";

const PORT = Number(process.env.PORT ?? 3001);

export async function buildServer() {
  const app = Fastify({ logger: true });
  await app.register(cors);
  await app.register(helmet);
  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });
  // Límite global anti-abuso (S-FIPS Controles); login tiene tope propio + bloqueo 5×15min.
  // RATE_LIMIT_MAX solo para entornos de prueba (la suite e2e supera 500/min).
  const maxPorMinuto = Number(process.env.RATE_LIMIT_MAX ?? 500);
  await app.register(rateLimit, {
    global: true,
    max: Number.isInteger(maxPorMinuto) && maxPorMinuto > 0 ? maxPorMinuto : 500,
    timeWindow: "1 minute",
  });

  // Errores sin fugas (INC-02) y 404 homogéneo para cualquier ruta.
  app.setErrorHandler(manejarError);
  app.setNotFoundHandler(manejarNoEncontrado);

  // INC-04: /api/health es la ruta del contrato; /health se conserva para
  // los healthchecks existentes (Docker/Render).
  const salud = async () => ({ ok: true as const, version: "0.1.0" });
  app.get("/api/health", salud);
  app.get("/health", salud);
  app.get("/docs", async () => ({ contract: "pis @ts-rest", version: "0.1.0" }));

  registerAuthRoutes(app);
  registerSeguridadRoutes(app);
  registerSeguimientoRoutes(app);
  registerProgramasRoutes(app);
  registerExpedientesRoutes(app);
  registerDocumentosRoutes(app);
  registerCierreRoutes(app);
  registerTalleresRoutes(app);
  registerProyectosRoutes(app);
  registerSesionesRoutes(app);
  registerHitosRoutes(app);
  registerPagosTallerRoutes(app);
  registerFichaCierreRoutes(app);
  registerAlertasTallerRoutes(app);
  registerEncuestasTallerRoutes(app);
  registerMiTallerRoutes(app);
  registerAsesoresRoutes(app);
  registerReportesTitulacionRoutes(app);
  registerConfiguracionRoutes(app);
  registerTallerConfigRoutes(app);

  return app;
}

const isMain = process.argv[1]?.match(/server\.[tj]s$/) !== null;
if (isMain) {
  buildServer()
    .then(async (app) => {
      // Workers pg-boss best-effort (nunca bloquean el arranque ni tumban la API).
      const { iniciarWorkers } = await import("./infra/jobs/workers.js");
      await iniciarWorkers();
      await app.listen({ port: PORT, host: "0.0.0.0" });
    })
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}
