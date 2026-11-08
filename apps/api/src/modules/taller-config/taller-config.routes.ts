import { tallerConfiguracionContract } from "@pis/contracts";
import { initServer } from "@ts-rest/fastify";
import type { FastifyInstance } from "fastify";
import { autorizar, denegado } from "../../infra/auth/autorizacion.js";
import { respuestaErrorConConflicto } from "../../infra/http/errores.js";
import { OPCIONES_TS_REST } from "../../infra/http/manejador-errores.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { leerConfigTaller } from "./taller-config.repository.js";
import {
  AgregarEspecialidadUseCase,
  AgregarFeriadoUseCase,
  EditarEspecialidadUseCase,
  EditarFeriadoUseCase,
  EditarParametroUseCase,
  EditarSemanaPlanUseCase,
} from "./use-cases/taller-config.use-cases.js";

const s = initServer();

/**
 * P16 Configuración del taller. Spec §4: "Configurar feriados, plan
 * institucional y catálogos" es solo del Administrador → `seguridad.*`,
 * igual que la configuración del proceso (HU-0052).
 */
export function registerTallerConfigRoutes(app: FastifyInstance): void {
  const router = s.router(tallerConfiguracionContract, {
    ver: async ({ request }) => {
      const a = await autorizar(request.actor, { permiso: ["seguridad", "ver"] });
      if (!a.ok) return denegado(a);
      return { status: 200 as const, body: await leerConfigTaller() };
    },
    agregarFeriado: async ({ body, request }) => {
      const a = await autorizar(request.actor, { permiso: ["seguridad", "editar"] });
      if (!a.ok) return denegado(a);
      const actor = request.actor ?? { id: "", dni: "desconocido" };
      const r = await new AgregarFeriadoUseCase().execute(body, actor);
      if (!r.ok) return respuestaErrorConConflicto(r.error);
      return { status: 201 as const, body: r.value };
    },
    editarFeriado: async ({ params, body, request }) => {
      const a = await autorizar(request.actor, { permiso: ["seguridad", "editar"] });
      if (!a.ok) return denegado(a);
      const actor = request.actor ?? { id: "", dni: "desconocido" };
      const r = await new EditarFeriadoUseCase().execute(
        params.id,
        {
          ...(body.fecha !== undefined ? { fecha: body.fecha } : {}),
          ...(body.nombre !== undefined ? { nombre: body.nombre } : {}),
          ...(body.activo !== undefined ? { activo: body.activo } : {}),
        },
        actor,
      );
      if (!r.ok) return respuestaErrorConConflicto(r.error);
      return { status: 200 as const, body: r.value };
    },
    editarSemanaPlan: async ({ params, body, request }) => {
      const a = await autorizar(request.actor, { permiso: ["seguridad", "editar"] });
      if (!a.ok) return denegado(a);
      const actor = request.actor ?? { id: "", dni: "desconocido" };
      const r = await new EditarSemanaPlanUseCase().execute(params.semana, body, actor);
      if (!r.ok) return respuestaErrorConConflicto(r.error);
      return { status: 200 as const, body: r.value };
    },
    agregarEspecialidad: async ({ body, request }) => {
      const a = await autorizar(request.actor, { permiso: ["seguridad", "editar"] });
      if (!a.ok) return denegado(a);
      const actor = request.actor ?? { id: "", dni: "desconocido" };
      const r = await new AgregarEspecialidadUseCase().execute(body, actor);
      if (!r.ok) return respuestaErrorConConflicto(r.error);
      return { status: 201 as const, body: r.value };
    },
    editarEspecialidad: async ({ params, body, request }) => {
      const a = await autorizar(request.actor, { permiso: ["seguridad", "editar"] });
      if (!a.ok) return denegado(a);
      const actor = request.actor ?? { id: "", dni: "desconocido" };
      const r = await new EditarEspecialidadUseCase().execute(
        params.id,
        {
          ...(body.nombre !== undefined ? { nombre: body.nombre } : {}),
          ...(body.activa !== undefined ? { activa: body.activa } : {}),
        },
        actor,
      );
      if (!r.ok) return respuestaErrorConConflicto(r.error);
      return { status: 200 as const, body: r.value };
    },
    editarParametro: async ({ params, body, request }) => {
      const a = await autorizar(request.actor, { permiso: ["seguridad", "editar"] });
      if (!a.ok) return denegado(a);
      const actor = request.actor ?? { id: "", dni: "desconocido" };
      const r = await new EditarParametroUseCase().execute(params.clave, body.valor, actor);
      if (!r.ok) return respuestaErrorConConflicto(r.error);
      return { status: 200 as const, body: r.value };
    },
  });
  void app.register(async (scoped) => {
    scoped.addHook("preHandler", requireAuth);
    await scoped.register(s.plugin(router), OPCIONES_TS_REST);
  });
}
