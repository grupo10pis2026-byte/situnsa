// Primero: variables de entorno (antes de cualquier módulo que lea process.env).
import "./config/cargar-env.js";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { manejarError, manejarNoEncontrado } from "./infra/http/manejador-errores.js";
import { registerAuthRoutes } from "./modules/auth/auth.routes.js";
import { registerProgramasRoutes } from "./modules/catalogos/catalogos.routes.js";
import { registerCierreRoutes } from "./modules/cierre/cierre.routes.js";
import { registerConfiguracionRoutes } from "./modules/configuracion/configuracion.routes.js";
import { registerDocumentosRoutes } from "./modules/documentos/documentos.routes.js";
import { registerExpedientesRoutes } from "./modules/expedientes/expedientes.routes.js";
import { registerReportesTitulacionRoutes } from "./modules/reportes/reportes.routes.js";
import { registerSeguimientoRoutes } from "./modules/seguimiento/seguimiento.routes.js";
import { registerSeguridadRoutes } from "./modules/seguridad/seguridad.routes.js";
import { registerSolicitudesAdminRoutes } from "./modules/solicitudes/solicitudes-admin.routes.js";
import { registerSolicitudesPublicasRoutes } from "./modules/solicitudes/solicitudes-publicas.routes.js";
import {
  registerGruposRoutes,
  registerReportesRoutes,
} from "./modules/talleres/grupos-pagos.routes.js";
import { registerSesionesRoutes } from "./modules/talleres/sesiones.routes.js";
import { registerTallerArchivosRoutes } from "./modules/talleres/taller-archivos.routes.js";
import { registerTallerAvancesRoutes } from "./modules/talleres/taller-avances.routes.js";
import {
  registerAsesoresRoutes,
  registerTalleresRoutes,
} from "./modules/talleres/talleres.routes.js";

const PORT = Number(process.env.PORT ?? 3001);

export async function buildServer() {
  const app = Fastify({ logger: true });
  await app.register(cors, {
    origin: true,
    credentials: true,
    exposedHeaders: ["Content-Disposition"],
  });
  await app.register(helmet);
  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });
  // Límite global anti-abuso (S-FIPS Controles); login tiene tope propio + bloqueo 5×15min.
  await app.register(rateLimit, { global: true, max: 500, timeWindow: "1 minute" });

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
  registerAsesoresRoutes(app);
  registerGruposRoutes(app);
  registerSesionesRoutes(app);
  registerTallerAvancesRoutes(app);
  registerTallerArchivosRoutes(app);
  registerReportesRoutes(app);
  registerReportesTitulacionRoutes(app);
  registerConfiguracionRoutes(app);
  registerSolicitudesPublicasRoutes(app);
  registerSolicitudesAdminRoutes(app);

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
