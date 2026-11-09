import type { ErrorEnvelope } from "@pis/contracts";
import { type DbExecutor, db, proyectosTaller, proyectoTesistas, talleres } from "@pis/db";
import type { DomainError } from "@pis/domain";
import { and, eq } from "drizzle-orm";
import { esPersonal, type Perfil } from "../../infra/auth/autorizacion.js";
import { errorEnvelope, estadoHttp } from "../../infra/http/errores.js";
import { appendAuditoriaTaller } from "./taller-auditoria.js";

/**
 * Alcance del Taller de Tesis (spec v1.0 §4, regla clave): el servidor
 * valida rol y pertenencia. El personal ve todo; el asesor, solo su taller;
 * el alumno, solo lo suyo. Cada denegación por alcance queda en el historial.
 */

export type Alcance = { ok: true } | { ok: false; status: 403 | 404; body: ErrorEnvelope };

export interface TallerBase {
  id: string;
  nombre: string;
  asesorId: string | null;
  estado: string;
}

export async function tallerPorId(tx: DbExecutor, tallerId: string): Promise<TallerBase | null> {
  const [t] = await tx
    .select({
      id: talleres.id,
      nombre: talleres.nombre,
      asesorId: talleres.asesorId,
      estado: talleres.estado,
    })
    .from(talleres)
    .where(eq(talleres.id, tallerId))
    .limit(1);
  return t ?? null;
}

/** ¿El alumno es tesista (con cualquier estado) de un proyecto del taller? */
export async function alumnoEnTaller(
  tx: DbExecutor,
  tallerId: string,
  alumnoId: string,
): Promise<boolean> {
  const [f] = await tx
    .select({ id: proyectoTesistas.id })
    .from(proyectoTesistas)
    .innerJoin(proyectosTaller, eq(proyectosTaller.id, proyectoTesistas.proyectoId))
    .where(and(eq(proyectosTaller.tallerId, tallerId), eq(proyectoTesistas.alumnoId, alumnoId)))
    .limit(1);
  return f !== undefined;
}

async function denegar(tallerId: string, actor: { id: string; dni: string }): Promise<Alcance> {
  await appendAuditoriaTaller(db, {
    tallerId,
    actorId: actor.id || null,
    actorDni: actor.dni,
    accion: "ACCESO_DENEGADO",
    detalle: "Fuera de alcance del taller",
  });
  return {
    ok: false,
    status: 403,
    body: errorEnvelope("FUERA_DE_ALCANCE", "El taller no está en tu alcance"),
  };
}

export async function alcanceTaller(
  tallerId: string,
  actor: { id: string; dni: string },
  perfil: Perfil,
  opciones: { alumno?: boolean } = { alumno: true },
): Promise<Alcance> {
  if (esPersonal(perfil.roles)) return { ok: true };
  const t = await tallerPorId(db, tallerId);
  if (!t)
    return { ok: false, status: 404, body: errorEnvelope("NO_ENCONTRADO", "Taller no encontrado") };
  if (perfil.roles.includes("ASESOR") && t.asesorId === actor.id) return { ok: true };
  if (opciones.alumno !== false && (await alumnoEnTaller(db, tallerId, actor.id)))
    return { ok: true };
  return denegar(tallerId, actor);
}

export interface ProyectoBase {
  id: string;
  tallerId: string;
  codigo: string;
  asesorId: string | null;
  alumnos: string[];
}

export async function proyectoPorId(
  tx: DbExecutor,
  proyectoId: string,
): Promise<ProyectoBase | null> {
  const [p] = await tx
    .select({
      id: proyectosTaller.id,
      tallerId: proyectosTaller.tallerId,
      codigo: proyectosTaller.codigo,
      asesorId: talleres.asesorId,
    })
    .from(proyectosTaller)
    .innerJoin(talleres, eq(talleres.id, proyectosTaller.tallerId))
    .where(eq(proyectosTaller.id, proyectoId))
    .limit(1);
  if (!p) return null;
  const tesistas = await tx
    .select({ alumnoId: proyectoTesistas.alumnoId })
    .from(proyectoTesistas)
    .where(eq(proyectoTesistas.proyectoId, proyectoId));
  return { ...p, alumnos: tesistas.map((t) => t.alumnoId) };
}

/**
 * Alcance sobre un proyecto: personal; el asesor del taller; o el alumno
 * tesista del proyecto (si `alumno` no es false). Devuelve el proyecto.
 */
export async function alcanceProyecto(
  proyectoId: string,
  actor: { id: string; dni: string },
  perfil: Perfil,
  opciones: { alumno?: boolean; asesor?: boolean } = {},
): Promise<{ ok: true; proyecto: ProyectoBase } | Extract<Alcance, { ok: false }>> {
  const p = await proyectoPorId(db, proyectoId);
  if (!p)
    return {
      ok: false,
      status: 404,
      body: errorEnvelope("NO_ENCONTRADO", "Proyecto no encontrado"),
    };
  if (esPersonal(perfil.roles)) return { ok: true, proyecto: p };
  if (opciones.asesor !== false && perfil.roles.includes("ASESOR") && p.asesorId === actor.id)
    return { ok: true, proyecto: p };
  if (opciones.alumno !== false && p.alumnos.includes(actor.id)) return { ok: true, proyecto: p };
  const d = await denegar(p.tallerId, actor);
  return d.ok
    ? { ok: false, status: 403, body: errorEnvelope("FUERA_DE_ALCANCE", "Sin alcance") }
    : d;
}

/** Error de dominio → respuesta tipada (con el campo de cada error de formulario). */
export function respuestaDominio(
  e: DomainError & { errores?: Array<{ campo: string; mensaje: string }> },
): { status: 400 | 403 | 404 | 409; body: ErrorEnvelope } {
  return {
    status: estadoHttp(e.code),
    body: errorEnvelope(
      e.code,
      e.message,
      e.errores?.map((x) => ({ campo: x.campo, mensaje: x.mensaje })),
    ),
  };
}
