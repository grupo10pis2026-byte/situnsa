import { sesionesContract } from "@pis/contracts";
import { db, gruposHorario, tallerSesiones } from "@pis/db";
import { initServer } from "@ts-rest/fastify";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
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
import { requireAuth } from "../../../middleware/require-auth.js";
import { respuestaDominio, tallerPorId } from "../taller-http.js";
import { asistenciaDeSesion, sesionesDelTaller } from "./sesiones.repository.js";
import {
  AgregarSesionUseCase,
  CancelarSesionUseCase,
  EliminarGrupoUseCase,
  GuardarAsistenciaUseCase,
  GuardarGrupoUseCase,
  ReprogramarSesionUseCase,
} from "./sesiones.use-cases.js";

const s = initServer();

/**
 * Permisos de P4/P5 (spec v1.0 §4): registrar asistencia y armar grupos es
 * del asesor del taller (y del Administrador en la Fase A); corregir y
 * justificar, también de la Secretaría; reprogramar, cancelar y agregar
 * sesiones, del asesor y de la Secretaría. El alumno usa su propio portal.
 */
export interface Capacidades {
  ver: boolean;
  registrar: boolean;
  corregir: boolean;
  programar: boolean;
  grupos: boolean;
}

export async function capacidadesTaller(
  perfil: Perfil,
  actorId: string,
  tallerId: string,
): Promise<Capacidades | null> {
  const t = await tallerPorId(db, tallerId);
  if (!t) return null;
  const admin = perfil.roles.includes(ROL_ADMIN);
  const asesor = perfil.roles.includes("ASESOR") && t.asesorId === actorId;
  const secretaria = permite(perfil, "taller", "crear");
  return {
    ver: esPersonal(perfil.roles) || asesor,
    registrar: admin || asesor,
    corregir: admin || asesor || secretaria,
    programar: admin || asesor || secretaria,
    grupos: admin || asesor,
  };
}

const prohibido = (m: string) => ({
  status: 403 as const,
  body: errorEnvelope("FUERA_DE_ALCANCE", m),
});
const noExiste = (m: string) => ({ status: 404 as const, body: errorEnvelope("NO_ENCONTRADO", m) });

async function tallerDeSesion(sesionId: string): Promise<string | null> {
  const [f] = await db
    .select({ tallerId: tallerSesiones.tallerId })
    .from(tallerSesiones)
    .where(eq(tallerSesiones.id, sesionId))
    .limit(1);
  return f?.tallerId ?? null;
}

async function tallerDeGrupo(grupoId: string): Promise<string | null> {
  const [f] = await db
    .select({ tallerId: gruposHorario.tallerId })
    .from(gruposHorario)
    .where(eq(gruposHorario.id, grupoId))
    .limit(1);
  return f?.tallerId ?? null;
}

function actorDe(req: FastifyRequest) {
  return req.actor ?? { id: "", dni: "desconocido" };
}

function listado(tallerId: string, c: Capacidades) {
  return sesionesDelTaller(db, tallerId, {
    puedeRegistrar: c.registrar,
    puedeProgramar: c.programar,
  });
}

export function registerSesionesRoutes(app: FastifyInstance): void {
  const router = s.router(sesionesContract, {
    listar: async ({ params, request }) => {
      const a = await autorizar(request.actor, { permiso: ["taller", "ver"] });
      if (!a.ok) return denegado(a);
      const c = await capacidadesTaller(a.perfil, actorDe(request).id, params.id);
      if (!c) return noExiste("Taller no encontrado");
      if (!c.ver) return prohibido("El taller no está en tu alcance");
      return { status: 200 as const, body: await listado(params.id, c) };
    },
    agregar: async ({ params, body, request }) => {
      const a = await autorizar(request.actor, { permiso: ["taller", "ver"] });
      if (!a.ok) return denegado(a);
      const c = await capacidadesTaller(a.perfil, actorDe(request).id, params.id);
      if (!c) return noExiste("Taller no encontrado");
      if (!c.programar) return prohibido("Solo el asesor o la Secretaría agregan sesiones");
      const r = await new AgregarSesionUseCase().execute(params.id, body, actorDe(request));
      if (!r.ok) return respuestaDominio(r.error);
      return { status: 201 as const, body: await listado(params.id, c) };
    },
    asistencia: async ({ params, request }) => {
      const a = await autorizar(request.actor, { permiso: ["taller", "ver"] });
      if (!a.ok) return denegado(a);
      const tallerId = await tallerDeSesion(params.id);
      const c = tallerId ? await capacidadesTaller(a.perfil, actorDe(request).id, tallerId) : null;
      if (!c) return noExiste("Sesión no encontrada");
      if (!c.ver) return prohibido("El taller no está en tu alcance");
      const dto = await asistenciaDeSesion(db, params.id);
      return dto ? { status: 200 as const, body: dto } : noExiste("Sesión no encontrada");
    },
    guardarAsistencia: async ({ params, body, request }) => {
      const a = await autorizar(request.actor, { permiso: ["taller", "ver"] });
      if (!a.ok) return denegado(a);
      const tallerId = await tallerDeSesion(params.id);
      const c = tallerId ? await capacidadesTaller(a.perfil, actorDe(request).id, tallerId) : null;
      if (!c) return noExiste("Sesión no encontrada");
      // §16 #7: el alumno no marca su asistencia (no existe la acción para él).
      if (!c.corregir) return prohibido("La asistencia la registra el asesor del taller");
      const r = await new GuardarAsistenciaUseCase().execute(params.id, body, actorDe(request), {
        registrar: c.registrar,
      });
      if (!r.ok) return respuestaDominio(r.error);
      return { status: 200 as const, body: r.value };
    },
    reprogramar: async ({ params, body, request }) => {
      const a = await autorizar(request.actor, { permiso: ["taller", "ver"] });
      if (!a.ok) return denegado(a);
      const tallerId = await tallerDeSesion(params.id);
      const c = tallerId ? await capacidadesTaller(a.perfil, actorDe(request).id, tallerId) : null;
      if (!c || !tallerId) return noExiste("Sesión no encontrada");
      if (!c.programar) return prohibido("Solo el asesor o la Secretaría reprograman sesiones");
      const r = await new ReprogramarSesionUseCase().execute(params.id, body, actorDe(request));
      if (!r.ok) return respuestaDominio(r.error);
      return { status: 200 as const, body: await listado(tallerId, c) };
    },
    cancelar: async ({ params, body, request }) => {
      const a = await autorizar(request.actor, { permiso: ["taller", "ver"] });
      if (!a.ok) return denegado(a);
      const tallerId = await tallerDeSesion(params.id);
      const c = tallerId ? await capacidadesTaller(a.perfil, actorDe(request).id, tallerId) : null;
      if (!c || !tallerId) return noExiste("Sesión no encontrada");
      if (!c.programar) return prohibido("Solo el asesor o la Secretaría cancelan sesiones");
      const r = await new CancelarSesionUseCase().execute(params.id, body, actorDe(request));
      if (!r.ok) return respuestaDominio(r.error);
      return { status: 200 as const, body: await listado(tallerId, c) };
    },
    crearGrupo: async ({ params, body, request }) => {
      const a = await autorizar(request.actor, { permiso: ["taller", "ver"] });
      if (!a.ok) return denegado(a);
      const c = await capacidadesTaller(a.perfil, actorDe(request).id, params.id);
      if (!c) return noExiste("Taller no encontrado");
      if (!c.grupos) return prohibido("Los grupos de horario los crea el asesor del taller");
      const r = await new GuardarGrupoUseCase().execute(params.id, null, body, actorDe(request));
      if (!r.ok) return respuestaDominio(r.error);
      return { status: 201 as const, body: await listado(params.id, c) };
    },
    editarGrupo: async ({ params, body, request }) => {
      const a = await autorizar(request.actor, { permiso: ["taller", "ver"] });
      if (!a.ok) return denegado(a);
      const tallerId = await tallerDeGrupo(params.id);
      const c = tallerId ? await capacidadesTaller(a.perfil, actorDe(request).id, tallerId) : null;
      if (!c || !tallerId) return noExiste("Grupo no encontrado");
      if (!c.grupos) return prohibido("Los grupos de horario los edita el asesor del taller");
      const r = await new GuardarGrupoUseCase().execute(
        tallerId,
        params.id,
        body,
        actorDe(request),
      );
      if (!r.ok) return respuestaDominio(r.error);
      return { status: 200 as const, body: await listado(tallerId, c) };
    },
    eliminarGrupo: async ({ params, request }) => {
      const a = await autorizar(request.actor, { permiso: ["taller", "ver"] });
      if (!a.ok) return denegado(a);
      const tallerId = await tallerDeGrupo(params.id);
      const c = tallerId ? await capacidadesTaller(a.perfil, actorDe(request).id, tallerId) : null;
      if (!c || !tallerId) return noExiste("Grupo no encontrado");
      if (!c.grupos) return prohibido("Los grupos de horario los edita el asesor del taller");
      const r = await new EliminarGrupoUseCase().execute(params.id, actorDe(request));
      if (!r.ok) return respuestaDominio(r.error);
      return { status: 200 as const, body: await listado(tallerId, c) };
    },
  });
  void app.register(async (scoped) => {
    scoped.addHook("preHandler", requireAuth);
    await scoped.register(s.plugin(router), OPCIONES_TS_REST);
  });
}
