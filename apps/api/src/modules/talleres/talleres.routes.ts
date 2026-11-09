import { type ErrorEnvelope, talleresContract } from "@pis/contracts";
import { db } from "@pis/db";
import type { DomainError } from "@pis/domain";
import { initServer } from "@ts-rest/fastify";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { autorizar, denegado, esPersonal } from "../../infra/auth/autorizacion.js";
import { errorEnvelope, estadoHttp } from "../../infra/http/errores.js";
import { OPCIONES_TS_REST } from "../../infra/http/manejador-errores.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { leerParametrosTaller } from "../taller-config/taller-config.repository.js";
import { alcanceTaller, alumnoEnTaller } from "./taller-http.js";
import { detalleTaller, resumenTaller } from "./talleres.repository.js";
import {
  CambiarAsesorUseCase,
  CancelarTallerUseCase,
  CrearTallerUseCase,
  EditarTallerUseCase,
  type ErrorTaller,
  proponerCalendario,
} from "./use-cases/talleres.use-cases.js";

const s = initServer();

/** Error de dominio → respuesta tipada, con el campo de cada error de formulario. */
function respuestaTaller(e: DomainError & Partial<Pick<ErrorTaller, "errores">>): {
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

function actorDe(req: FastifyRequest): { id: string; dni: string } {
  return req.actor ?? { id: "", dni: "desconocido" };
}

/** P1–P3 Talleres (staff: Secretaría/RESP_TALLER; el asesor/alumno tienen sus portales). */
export function registerTalleresRoutes(app: FastifyInstance): void {
  const router = s.router(talleresContract, {
    listar: async ({ query, request }) => {
      const a = await autorizar(request.actor, { permiso: ["taller", "ver"] });
      if (!a.ok) return denegado(a);
      const actor = request.actor ?? { id: "", dni: "", rol: "" };
      const filas = await db.query.talleres.findMany();
      const items = [];
      for (const t of filas) {
        // RN-07: fuera del personal, cada rol ve lo suyo (P1 vs P5/P7).
        if (!esPersonal(a.perfil.roles)) {
          if (a.perfil.roles.includes("ASESOR") && t.asesorId === actor.id) {
            /* propio */
          } else if (!(await alumnoEnTaller(db, t.id, actor.id))) continue;
        }
        const d = await detalleTaller(db, t.id);
        if (!d) continue;
        if (query.periodo && d.periodo !== query.periodo) continue;
        if (query.estado && d.estado !== query.estado) continue;
        if (query.asesorDni && d.asesorDni !== query.asesorDni) continue;
        items.push(resumenTaller(d));
      }
      return { status: 200 as const, body: { items } };
    },
    defectos: async ({ request }) => {
      const a = await autorizar(request.actor, { permiso: ["taller", "crear"] });
      if (!a.ok) return denegado(a);
      const p = await leerParametrosTaller();
      return {
        status: 200 as const,
        body: {
          cupoProyectos: p.cupoProyectos,
          numeroSesiones: p.numeroSesiones,
          montoPension: p.montoPension,
        },
      };
    },
    proponerCalendario: async ({ body, request }) => {
      const a = await autorizar(request.actor, { permiso: ["taller", "crear"] });
      if (!a.ok) return denegado(a);
      const r = await proponerCalendario(body);
      if (!r.ok) return respuestaTaller(r.error);
      return { status: 200 as const, body: r.value };
    },
    crear: async ({ body, request }) => {
      const a = await autorizar(request.actor, { permiso: ["taller", "crear"] });
      if (!a.ok) return denegado(a);
      const r = await new CrearTallerUseCase().execute(body, actorDe(request));
      if (!r.ok) return respuestaTaller(r.error);
      return { status: 201 as const, body: r.value };
    },
    detalle: async ({ params, request }) => {
      const a = await autorizar(request.actor, { permiso: ["taller", "ver"] });
      if (!a.ok) return denegado(a);
      const actor = request.actor ?? { id: "", dni: "", rol: "" };
      if (!esPersonal(a.perfil.roles)) {
        const al = await alcanceTaller(params.id, actor, a.perfil);
        if (!al.ok) return al;
      }
      const d = await detalleTaller(db, params.id);
      if (!d)
        return {
          status: 404 as const,
          body: errorEnvelope("NO_ENCONTRADO", "Taller no encontrado"),
        };
      return { status: 200 as const, body: d };
    },
    editar: async ({ params, body, request }) => {
      const a = await autorizar(request.actor, { permiso: ["taller", "crear"] });
      if (!a.ok) return denegado(a);
      const r = await new EditarTallerUseCase().execute(params.id, body, actorDe(request));
      if (!r.ok) return respuestaTaller(r.error);
      return { status: 200 as const, body: r.value };
    },
    cambiarAsesor: async ({ params, body, request }) => {
      const a = await autorizar(request.actor, { permiso: ["taller", "crear"] });
      if (!a.ok) return denegado(a);
      const r = await new CambiarAsesorUseCase().execute(params.id, body, actorDe(request));
      if (!r.ok) return respuestaTaller(r.error);
      return { status: 200 as const, body: r.value };
    },
    cancelar: async ({ params, body, request }) => {
      const a = await autorizar(request.actor, { permiso: ["taller", "crear"] });
      if (!a.ok) return denegado(a);
      const r = await new CancelarTallerUseCase().execute(params.id, body, actorDe(request));
      if (!r.ok) return respuestaTaller(r.error);
      return { status: 200 as const, body: r.value };
    },
  });
  void app.register(async (scoped) => {
    scoped.addHook("preHandler", requireAuth);
    await scoped.register(s.plugin(router), OPCIONES_TS_REST);
  });
}
