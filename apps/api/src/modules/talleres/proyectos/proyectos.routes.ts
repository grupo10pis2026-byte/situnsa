import { type ErrorEnvelope, proyectosContract } from "@pis/contracts";
import { db } from "@pis/db";
import type { DomainError } from "@pis/domain";
import { initServer } from "@ts-rest/fastify";
import type { FastifyInstance } from "fastify";
import { autorizar, denegado, esPersonal } from "../../../infra/auth/autorizacion.js";
import { errorEnvelope, estadoHttp } from "../../../infra/http/errores.js";
import { OPCIONES_TS_REST } from "../../../infra/http/manejador-errores.js";
import { requireAuth } from "../../../middleware/require-auth.js";
import { alcanceTaller } from "../taller-http.js";
import { AsignarProyectoUseCase } from "./asignar-proyecto.use-case.js";
import { listarProyectos } from "./proyectos.repository.js";

const s = initServer();

function respuesta(e: DomainError & { errores?: Array<{ campo: string; mensaje: string }> }): {
  status: 400 | 403 | 404 | 409;
  body: ErrorEnvelope;
} {
  return {
    status: estadoHttp(e.code),
    body: errorEnvelope(
      e.code,
      e.message,
      e.errores?.map((x) => ({ campo: x.campo, mensaje: x.mensaje })),
    ),
  };
}

/**
 * P3 Alumnos y D1 (spec v1.0 §4): asignar es de la Secretaría del Taller
 * (`taller.crear`); la lista la ven el personal y el asesor del taller.
 */
export function registerProyectosRoutes(app: FastifyInstance): void {
  const router = s.router(proyectosContract, {
    listar: async ({ params, request }) => {
      const a = await autorizar(request.actor, { permiso: ["taller", "ver"] });
      if (!a.ok) return denegado(a);
      if (!esPersonal(a.perfil.roles)) {
        if (!a.perfil.roles.includes("ASESOR"))
          return {
            status: 403 as const,
            body: errorEnvelope("SIN_PERMISO", "Solo el personal y el asesor ven los proyectos"),
          };
        const al = await alcanceTaller(params.id, request.actor ?? { id: "", dni: "" }, a.perfil);
        if (!al.ok) return al;
      }
      const lista = await listarProyectos(db, params.id);
      if (!lista)
        return {
          status: 404 as const,
          body: errorEnvelope("NO_ENCONTRADO", "Taller no encontrado"),
        };
      return { status: 200 as const, body: lista };
    },
    candidato: async ({ params, query, request }) => {
      const a = await autorizar(request.actor, { permiso: ["taller", "crear"] });
      if (!a.ok) return denegado(a);
      return {
        status: 200 as const,
        body: await new AsignarProyectoUseCase().candidato(params.id, query.dni),
      };
    },
    asignar: async ({ params, body, request }) => {
      const a = await autorizar(request.actor, { permiso: ["taller", "crear"] });
      if (!a.ok) return denegado(a);
      const r = await new AsignarProyectoUseCase().execute(
        params.id,
        body,
        request.actor ?? { id: "", dni: "desconocido" },
      );
      if (!r.ok) return respuesta(r.error);
      return { status: 201 as const, body: r.value };
    },
  });
  void app.register(async (scoped) => {
    scoped.addHook("preHandler", requireAuth);
    await scoped.register(s.plugin(router), OPCIONES_TS_REST);
  });
}
