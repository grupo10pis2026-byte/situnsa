import { alertasTallerContract } from "@pis/contracts";
import { db } from "@pis/db";
import { TIPOS_HITO, type TipoHito } from "@pis/domain";
import { initServer } from "@ts-rest/fastify";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  autorizar,
  denegado,
  esPersonal,
  type Perfil,
  permite,
  ROL_ADMIN,
} from "../../../infra/auth/autorizacion.js";
import { errorEnvelope, estadoHttp, PATRON_UUID } from "../../../infra/http/errores.js";
import { OPCIONES_TS_REST } from "../../../infra/http/manejador-errores.js";
import { requireAuth } from "../../../middleware/require-auth.js";
import { hoyLima } from "../sesiones/sesiones.repository.js";
import { capacidadesTallerActor } from "../taller-capacidades.js";
import { respuestaDominio } from "../taller-http.js";
import {
  alertaPorId,
  DescartarAlertaUseCase,
  exportarReporte,
  listarAlertas,
  RegistrarRetiroUseCase,
  reportesDelTaller,
} from "./alertas.service.js";

const s = initServer();

/** P12 es de la Secretaría del Taller (taller.crear) y del Administrador. */
function esSecretaria(perfil: Perfil): boolean {
  return (
    perfil.roles.includes(ROL_ADMIN) ||
    (esPersonal(perfil.roles) && permite(perfil, "taller", "crear"))
  );
}

const prohibido = (m: string) => ({
  status: 403 as const,
  body: errorEnvelope("FUERA_DE_ALCANCE", m),
});
const noExiste = (m: string) => ({ status: 404 as const, body: errorEnvelope("NO_ENCONTRADO", m) });

function actorDe(req: FastifyRequest) {
  return req.actor ?? { id: "", dni: "desconocido" };
}

export function registerAlertasTallerRoutes(app: FastifyInstance): void {
  const router = s.router(alertasTallerContract, {
    listar: async ({ query, request }) => {
      const a = await autorizar(request.actor, { permiso: ["taller", "ver"] });
      if (!a.ok) return denegado(a);
      if (!esPersonal(a.perfil.roles))
        return prohibido("Las alertas las atiende la Secretaría del Taller");
      return { status: 200 as const, body: await listarAlertas(db, query) };
    },
    descartar: async ({ params, body, request }) => {
      const a = await autorizar(request.actor, { permiso: ["taller", "ver"] });
      if (!a.ok) return denegado(a);
      if (!esSecretaria(a.perfil))
        return prohibido("Las alertas las atiende la Secretaría del Taller");
      const r = await new DescartarAlertaUseCase().execute(
        params.id,
        body.motivo,
        actorDe(request),
      );
      if (!r.ok) return respuestaDominio(r.error);
      const dto = await alertaPorId(db, params.id);
      return dto ? { status: 200 as const, body: dto } : noExiste("Alerta no encontrada");
    },
    retirar: async ({ params, body, request }) => {
      const a = await autorizar(request.actor, { permiso: ["taller", "ver"] });
      if (!a.ok) return denegado(a);
      if (!esSecretaria(a.perfil))
        return prohibido("El retiro lo registra la Secretaría del Taller");
      const r = await new RegistrarRetiroUseCase().execute(params.id, body, actorDe(request));
      if (!r.ok) return respuestaDominio(r.error);
      return { status: 201 as const, body: { ok: true as const } };
    },
    reportes: async ({ params, request }) => {
      const a = await autorizar(request.actor, { permiso: ["taller", "ver"] });
      if (!a.ok) return denegado(a);
      const c = await capacidadesTallerActor(a.perfil, actorDe(request).id, params.id);
      if (!c) return noExiste("Taller no encontrado");
      if (!c.ver) return prohibido("El taller no está en tu alcance");
      const dto = await reportesDelTaller(db, params.id, hoyLima());
      return dto ? { status: 200 as const, body: dto } : noExiste("Taller no encontrado");
    },
  });
  void app.register(async (scoped) => {
    scoped.addHook("preHandler", requireAuth);
    await scoped.register(s.plugin(router), OPCIONES_TS_REST);
  });

  /** P12 Exportar un reporte: ?formato=pdf|xlsx. */
  app.get<{ Params: { id: string; hito: string }; Querystring: { formato?: string } }>(
    "/api/talleres/:id/reportes/:hito",
    { preHandler: requireAuth },
    async (req, reply) => {
      const hito: TipoHito | undefined = TIPOS_HITO.find((t) => t === req.params.hito);
      if (!PATRON_UUID.test(req.params.id) || !hito) {
        await reply.status(404).send(errorEnvelope("NO_ENCONTRADO", "Reporte no encontrado"));
        return;
      }
      const a = await autorizar(req.actor, { permiso: ["taller", "ver"] });
      if (!a.ok) {
        await reply.status(a.status).send(a.body);
        return;
      }
      const c = await capacidadesTallerActor(a.perfil, actorDe(req).id, req.params.id);
      if (!c?.ver) {
        await reply
          .status(c ? 403 : 404)
          .send(errorEnvelope(c ? "FUERA_DE_ALCANCE" : "NO_ENCONTRADO", "Sin alcance"));
        return;
      }
      const r = await exportarReporte(
        req.params.id,
        hito,
        req.query.formato === "xlsx" ? "xlsx" : "pdf",
      );
      if (!r.ok) {
        await reply
          .status(estadoHttp(r.error.code))
          .send(errorEnvelope(r.error.code, r.error.message));
        return;
      }
      await reply
        .header("Content-Type", r.value.tipo)
        .header("Content-Disposition", `attachment; filename="${r.value.nombre}"`)
        .header("Cache-Control", "private, no-store")
        .status(200)
        .send(Buffer.from(r.value.bytes));
    },
  );
}
