import {
  dashboardTallerContract,
  type FiltrosDashboard,
  FiltrosDashboardSchema,
} from "@pis/contracts";
import { db } from "@pis/db";
import { initServer } from "@ts-rest/fastify";
import type { FastifyInstance } from "fastify";
import {
  autorizar,
  denegado,
  esPersonal,
  type Perfil,
  permite,
  ROL_ADMIN,
} from "../../../infra/auth/autorizacion.js";
import { errorEnvelope } from "../../../infra/http/errores.js";
import { OPCIONES_TS_REST } from "../../../infra/http/manejador-errores.js";
import { renderDashboardPdf } from "../../../infra/pdf/dashboard-pdf.js";
import { requireAuth } from "../../../middleware/require-auth.js";
import { hoyLima } from "../sesiones/sesiones.repository.js";
import { dashboardTaller } from "./dashboard.service.js";

const s = initServer();

/**
 * Adenda 1.2 N2: Secretaría, Dirección (AUTORIDAD) y Administrador, en solo
 * lectura: personal con `reportes.ver`. Un asesor o un alumno no lo abre.
 */
function puedeVer(perfil: Perfil): boolean {
  return (
    perfil.roles.includes(ROL_ADMIN) ||
    (esPersonal(perfil.roles) && permite(perfil, "reportes", "ver"))
  );
}

const sinAcceso = {
  status: 403 as const,
  body: errorEnvelope(
    "SIN_PERMISO",
    "El dashboard es de la Secretaría, la Dirección y el Administrador",
  ),
};

export function registerDashboardTallerRoutes(app: FastifyInstance): void {
  const router = s.router(dashboardTallerContract, {
    obtener: async ({ query, request }) => {
      const a = await autorizar(request.actor, {
        permiso: ["taller", "ver"],
        alternativas: [["reportes", "ver"]],
      });
      if (!a.ok) return denegado(a);
      if (!puedeVer(a.perfil)) return sinAcceso;
      const dto = await dashboardTaller(db, query, hoyLima());
      return dto
        ? { status: 200 as const, body: dto }
        : { status: 404 as const, body: errorEnvelope("NO_ENCONTRADO", "Taller no encontrado") };
    },
  });
  void app.register(async (scoped) => {
    scoped.addHook("preHandler", requireAuth);
    await scoped.register(s.plugin(router), OPCIONES_TS_REST);
  });

  /** PDF con los mismos filtros y números del dashboard. */
  app.get<{ Querystring: Record<string, string | undefined> }>(
    "/api/dashboard-taller/pdf",
    { preHandler: requireAuth },
    async (req, reply) => {
      const a = await autorizar(req.actor, {
        permiso: ["taller", "ver"],
        alternativas: [["reportes", "ver"]],
      });
      if (!a.ok) return reply.status(a.status).send(a.body);
      if (!puedeVer(a.perfil)) return reply.status(403).send(sinAcceso.body);
      const f = FiltrosDashboardSchema.safeParse(req.query);
      if (!f.success)
        return reply.status(400).send(errorEnvelope("VALIDACION_FALLIDA", "Filtros inválidos"));
      const filtros: FiltrosDashboard = f.data;
      const d = await dashboardTaller(db, filtros, hoyLima());
      if (!d) return reply.status(404).send(errorEnvelope("NO_ENCONTRADO", "Taller no encontrado"));
      const grupo = d.opciones.grupos.find((g) => g.id === d.filtros.grupoId)?.nombre;
      const filtrosTexto = [
        d.filtros.tallerId ? d.titulo : "Todos los talleres",
        d.filtros.periodo ? `período ${d.filtros.periodo}` : "todos los períodos",
        grupo ? `grupo ${grupo}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      const bytes = await renderDashboardPdf(d, filtrosTexto);
      const nombre = `Dashboard-${d.titulo.replace(/[^A-Za-z0-9]+/g, "_")}.pdf`;
      return reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `attachment; filename="${nombre}"`)
        .header("Cache-Control", "private, no-store")
        .status(200)
        .send(Buffer.from(bytes));
    },
  );
}
