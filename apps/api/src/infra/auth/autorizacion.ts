import type { ErrorEnvelope } from "@pis/contracts";
import { db, expedientes, permisos, roles, rolesPermisos, usuarios, usuariosRoles } from "@pis/db";
import { and, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { StubActor } from "../../middleware/stub-auth.js";
import { appendAuditoria } from "../../modules/expedientes/expedientes.auditoria.js";
import { errorEnvelope, PATRON_UUID } from "../http/errores.js";

/**
 * Autorización (port S-FIPS + matriz ABAC pis):
 * permiso `modulo.accion` (denegación por defecto) × alcance por registro
 * (RN-06 tesista→propio, RN-07 asesor→asignados). El 403 por alcance se
 * audita con hash (criterio RNF-01: acceso cruzado entre asesores).
 */

export const ROL_ADMIN = "ADMIN_SISTEMA";
const ROLES_STAFF = new Set([
  "ADMIN_SISTEMA",
  "RESP_TITULACION",
  "RESP_AREA",
  "VALIDADOR_TALLER",
  "RESP_TALLER",
  "AUTORIDAD",
]);

/** ¿Algún rol de personal administrativo (alcance global)? */
export function esPersonal(nombresRol: readonly string[]): boolean {
  return nombresRol.some((r) => ROLES_STAFF.has(r));
}

export interface Perfil {
  roles: string[];
  permisos: Set<string>;
}

export async function perfilDe(usuarioId: string): Promise<Perfil> {
  const rows = await db
    .select({ rol: roles.nombre, clave: permisos.clave })
    .from(usuariosRoles)
    .innerJoin(roles, and(eq(usuariosRoles.rolId, roles.id), eq(roles.activo, true)))
    .leftJoin(rolesPermisos, eq(rolesPermisos.rolId, roles.id))
    .leftJoin(permisos, eq(permisos.id, rolesPermisos.permisoId))
    .where(eq(usuariosRoles.usuarioId, usuarioId));
  const nombres = new Set<string>();
  const claves = new Set<string>();
  for (const r of rows) {
    nombres.add(r.rol);
    if (r.clave) claves.add(r.clave);
  }
  if (nombres.size === 0) {
    const uRows = await db
      .select({ rol: usuarios.rol })
      .from(usuarios)
      .where(eq(usuarios.id, usuarioId))
      .limit(1);
    const legacyRol = uRows[0]?.rol;
    if (legacyRol) {
      if (legacyRol === "ADMIN_FIPS") {
        nombres.add("ADMIN_SISTEMA");
        nombres.add("RESP_TITULACION");
      } else if (legacyRol === "SECRETARIA") {
        nombres.add("RESP_TITULACION");
      } else if (legacyRol === "DECANO") {
        nombres.add("AUTORIDAD");
      } else {
        nombres.add(legacyRol);
      }
    }
  }
  return { roles: [...nombres], permisos: claves };
}

export async function rolesDe(usuarioId: string): Promise<string[]> {
  return (await perfilDe(usuarioId)).roles;
}

/** ADMIN_SISTEMA lo tiene todo implícito; el resto nace sin permisos. */
export function permite(perfil: Perfil, modulo: string, accion: string): boolean {
  if (perfil.roles.includes(ROL_ADMIN)) return true;
  return perfil.permisos.has(`${modulo}.${accion}`);
}

export async function tienePermiso(
  usuarioId: string,
  modulo: string,
  accion: string,
): Promise<boolean> {
  return permite(await perfilDe(usuarioId), modulo, accion);
}

interface ExpedienteAlcance {
  id: string;
  estado: string;
  asesorId: string | null;
  dni1: string | null;
  dni2: string | null;
}

/** Decisión pura de alcance (testeable sin DB). */
export function decideAlcance(
  nombresRol: string[],
  actorDni: string,
  actorId: string,
  exp: ExpedienteAlcance,
): boolean {
  if (esPersonal(nombresRol)) return true;
  if (nombresRol.includes("ASESOR") || nombresRol.includes("JURADO")) {
    return exp.asesorId !== null && exp.asesorId === actorId;
  }
  if (nombresRol.includes("TESISTA")) {
    return exp.dni1 === actorDni || exp.dni2 === actorDni;
  }
  return false;
}

async function expedienteParaAlcance(expedienteId: string): Promise<ExpedienteAlcance | null> {
  if (!PATRON_UUID.test(expedienteId)) return null;
  const p1 = alias(usuarios, "p1");
  const p2 = alias(usuarios, "p2");
  const rows = await db
    .select({
      id: expedientes.id,
      estado: expedientes.estado,
      asesorId: expedientes.asesorId,
      dni1: p1.dni,
      dni2: p2.dni,
    })
    .from(expedientes)
    .leftJoin(p1, eq(expedientes.participante1Id, p1.id))
    .leftJoin(p2, eq(expedientes.participante2Id, p2.id))
    .where(eq(expedientes.id, expedienteId))
    .limit(1);
  return rows[0] ?? null;
}

export type Autorizacion =
  | { ok: true; perfil: Perfil }
  | { ok: false; status: 401 | 403 | 404; body: ErrorEnvelope };

/** Retorno tipado para handlers ts-rest (narrowing por status). */
export function denegado(
  a: Extract<Autorizacion, { ok: false }>,
):
  | { status: 401; body: ErrorEnvelope }
  | { status: 403; body: ErrorEnvelope }
  | { status: 404; body: ErrorEnvelope } {
  if (a.status === 401) return { status: 401, body: a.body };
  if (a.status === 404) return { status: 404, body: a.body };
  return { status: 403, body: a.body };
}

/**
 * Uso en handlers ts-rest (requireAuth debe correr antes):
 * ```ts
 * const a = await autorizar(req.actor, { permiso: ["expedientes", "editar"], expedienteId: params.id });
 * if (!a.ok) return denegado(a);
 * ```
 */
export async function autorizar(
  actor: StubActor | undefined,
  opts: {
    permiso: [string, string];
    /** Permisos alternativos: basta con tener cualquiera (incluido `permiso`). */
    alternativas?: Array<[string, string]>;
    expedienteId?: string;
  },
): Promise<Autorizacion> {
  if (!actor) {
    return {
      ok: false,
      status: 401,
      body: errorEnvelope("SIN_SESION", "Se requiere autenticación"),
    };
  }
  const perfil = await perfilDe(actor.id);
  const [modulo, accion] = opts.permiso;
  const candidatos = [opts.permiso, ...(opts.alternativas ?? [])];
  if (!candidatos.some(([m, a]) => permite(perfil, m, a))) {
    return {
      ok: false,
      status: 403,
      body: errorEnvelope("SIN_PERMISO", `Se requiere permiso ${modulo}.${accion}`),
    };
  }
  if (opts.expedienteId !== undefined) {
    const exp = await expedienteParaAlcance(opts.expedienteId);
    if (!exp) {
      return {
        ok: false,
        status: 404,
        body: errorEnvelope("NO_ENCONTRADO", "Expediente no encontrado"),
      };
    }
    if (!decideAlcance(perfil.roles, actor.dni, actor.id, exp)) {
      await appendAuditoria(db, {
        expedienteId: exp.id,
        actorId: actor.id,
        actorDni: actor.dni,
        estadoAnterior: exp.estado,
        estadoNuevo: exp.estado,
        detalle: "Acceso denegado (fuera de alcance)",
      });
      return {
        ok: false,
        status: 403,
        body: errorEnvelope("FUERA_DE_ALCANCE", "El expediente no está en tu alcance"),
      };
    }
  }
  return { ok: true, perfil };
}
