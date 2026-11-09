import {
  type DbExecutor,
  db,
  permisos,
  proyectosTaller,
  proyectoTesistas,
  roles,
  rolesPermisos,
  talleres,
  usuarios,
  usuariosRoles,
} from "@pis/db";
import { and, eq, ne } from "drizzle-orm";
import { enqueueCorreo } from "../../infra/jobs/colas.js";
import { urlPortal } from "../../infra/mail/correo.service.js";

/**
 * Avisos del Taller (spec v1.0 §8): se encolan después del commit; un
 * correo que no sale nunca revierte la operación.
 */

export async function avisar(
  para: readonly string[],
  asunto: string,
  texto: string,
  ruta: string,
  textoEnlace = "Abrir SITUNSA",
): Promise<void> {
  const unicos = [...new Set(para.filter((x) => x.trim() !== ""))];
  if (unicos.length === 0) return;
  await enqueueCorreo({
    para: unicos,
    aParticipantes: false,
    asunto,
    titulo: asunto,
    texto,
    enlace: urlPortal(ruta),
    textoEnlace,
  });
}

/** Correos de los tesistas no retirados de un proyecto. */
export async function correosProyecto(tx: DbExecutor, proyectoId: string): Promise<string[]> {
  const filas = await tx
    .select({ email: usuarios.email })
    .from(proyectoTesistas)
    .innerJoin(usuarios, eq(usuarios.id, proyectoTesistas.alumnoId))
    .where(
      and(eq(proyectoTesistas.proyectoId, proyectoId), ne(proyectoTesistas.estado, "RETIRADO")),
    );
  return filas.map((f) => f.email);
}

/** Correos de todos los tesistas no retirados del taller. */
export async function correosTaller(tx: DbExecutor, tallerId: string): Promise<string[]> {
  const filas = await tx
    .select({ email: usuarios.email })
    .from(proyectoTesistas)
    .innerJoin(proyectosTaller, eq(proyectosTaller.id, proyectoTesistas.proyectoId))
    .innerJoin(usuarios, eq(usuarios.id, proyectoTesistas.alumnoId))
    .where(and(eq(proyectosTaller.tallerId, tallerId), ne(proyectoTesistas.estado, "RETIRADO")));
  return filas.map((f) => f.email);
}

export async function correoAsesor(tx: DbExecutor, tallerId: string): Promise<string | null> {
  const [f] = await tx
    .select({ email: usuarios.email })
    .from(talleres)
    .innerJoin(usuarios, eq(usuarios.id, talleres.asesorId))
    .where(eq(talleres.id, tallerId))
    .limit(1);
  return f?.email ?? null;
}

/**
 * Secretaría del Taller: usuarios activos cuyo rol (activo) tiene el permiso
 * `taller.crear` (RESP_TALLER y RESP_TITULACION en el seed). Se resuelve por
 * permiso y no por nombre de rol: si la Unidad reorganiza roles en Seguridad,
 * los avisos siguen llegando a quien gestiona el taller.
 */
export async function correosSecretaria(tx: DbExecutor = db): Promise<string[]> {
  const filas = await tx
    .selectDistinct({ email: usuarios.email })
    .from(usuariosRoles)
    .innerJoin(roles, eq(roles.id, usuariosRoles.rolId))
    .innerJoin(rolesPermisos, eq(rolesPermisos.rolId, roles.id))
    .innerJoin(permisos, eq(permisos.id, rolesPermisos.permisoId))
    .innerJoin(usuarios, eq(usuarios.id, usuariosRoles.usuarioId))
    .where(
      and(eq(permisos.clave, "taller.crear"), eq(roles.activo, true), eq(usuarios.activo, true)),
    );
  return filas.map((f) => f.email);
}
