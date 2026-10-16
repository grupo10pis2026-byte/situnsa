import type { ActualizarDatosInput } from "@pis/contracts";
import { db, expedientes, usuarios } from "@pis/db";
import {
  DomainError,
  fail,
  fechaIso,
  horaLimpia,
  modalidadACanon,
  normalizarAdministrativo,
  ok,
  PROGRAMAS_OFICIALES,
  type Result,
} from "@pis/domain";
import { and, eq, ne, sql } from "drizzle-orm";
import { DrizzleUnitOfWork } from "../../../../infra/db/unit-of-work.js";
import { appendAuditoria } from "../../expedientes.auditoria.js";
import { type DetalleRow, getDetalleById } from "../../expedientes.repository.js";

export interface Actor {
  id: string;
  dni: string;
  rol?: string;
}

const CAMPOS_EXPEDIENTE = [
  "titulo",
  "titulo02",
  "programa",
  "nroDecreto",
  "recomendacion",
  "presidente",
  "secretario",
  "coAsesor",
  "asesorNombre",
  "fechaApertura",
  "fechaPresentacion",
  "nroOficio",
  "integrante",
  "presidenteE2",
  "secretarioE2",
  "suplenteE2",
  "decanal",
  "fechaSustentacion",
  "horaSustentacion",
  "lugarSustentacion",
  "modalidadVirtual",
  "modalidad02",
  "modalidadFinal",
] as const;

const CAMPOS_PERSONA = [
  ["Email", "email"],
  ["Telefono", "telefono"],
  ["Cui", "cui"],
  ["Nacionalidad", "nacionalidad"],
  ["Ciudad", "ciudad"],
  ["Direccion", "direccion"],
] as const;

const NOMBRES_PROGRAMAS = new Set(PROGRAMAS_OFICIALES.map((p) => p.nombre));

function patchPersona(
  input: ActualizarDatosInput,
  prefijo: "participante1" | "participante2",
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const [sufijo, columna] of CAMPOS_PERSONA) {
    const v = input[`${prefijo}${sufijo}` as keyof ActualizarDatosInput];
    if (v === undefined) continue;
    if (v === "") patch[columna] = null;
    else patch[columna] = columna === "email" && typeof v === "string" ? v.trim().toLowerCase() : v;
  }
  return patch;
}

/**
 * PATCH autoguardado §6 (formulario legacy exacto): UoW + concurrencia +
 * RN-L04 (programa de catálogo) + RN-L07 (mayúsculas) + RN-L10 (modalidad) +
 * matriz (tesista: solo su contacto) + auditoría.
 */
export class ActualizarDatosUseCase {
  async execute(
    id: string,
    input: ActualizarDatosInput,
    actor: Actor,
  ): Promise<Result<DetalleRow, DomainError>> {
    // Matriz: el tesista solo edita sus datos de contacto (permissions-matrix).
    let patch: ActualizarDatosInput = input;
    if (actor.rol === "TESISTA") {
      const actual = await getDetalleById(db, id);
      if (!actual) return fail(new DomainError("NO_ENCONTRADO", "Expediente no encontrado"));
      const propio =
        actual.participante1?.dni === actor.dni
          ? "participante1"
          : actual.participante2?.dni === actor.dni
            ? "participante2"
            : null;
      if (!propio) return fail(new DomainError("PERMISO_DENEGADO", "Solo tu propio expediente"));
      const soloContacto: ActualizarDatosInput = { expectedUpdatedAt: input.expectedUpdatedAt };
      const contacto = soloContacto as Record<string, unknown>;
      for (const [sufijo] of CAMPOS_PERSONA) {
        const k = `${propio}${sufijo}` as keyof ActualizarDatosInput;
        const v = input[k];
        if (v !== undefined) contacto[k] = v;
      }
      patch = soloContacto;
    }
    // RN-L04: programa de catálogo ("Seleccione" inválido).
    if (patch.programa !== undefined && !NOMBRES_PROGRAMAS.has(patch.programa)) {
      return fail(new DomainError("VALIDACION_FALLIDA", "Programa inválido: elige del catálogo"));
    }
    // RN-L10: etiqueta del ComboBox → enum canónico.
    let canon: "TESIS" | "TRABAJO_ACADEMICO" | "ARTICULO" | undefined;
    if (patch.modalidad !== undefined) {
      const c = modalidadACanon(patch.modalidad);
      if (!c) return fail(new DomainError("VALIDACION_FALLIDA", "Modalidad inválida"));
      canon = c;
    }
    const uow = new DrizzleUnitOfWork(db);
    return uow.run(async (tx) => {
      const actual = await getDetalleById(tx, id);
      if (!actual) return fail(new DomainError("NO_ENCONTRADO", "Expediente no encontrado"));
      if (patch.expectedUpdatedAt && patch.expectedUpdatedAt !== actual.updatedAt) {
        return fail(
          new DomainError(
            "CONFLICTO_CONCURRENCIA",
            "Otro usuario guardó cambios más recientes. Recarga antes de sobrescribir.",
          ),
        );
      }
      const patchExp: Record<string, unknown> = { updatedAt: new Date() };
      for (const k of CAMPOS_EXPEDIENTE) {
        const v = patch[k];
        if (v !== undefined) {
          if (v === "") {
            patchExp[k] = null;
          } else if (
            k === "fechaApertura" ||
            k === "fechaPresentacion" ||
            k === "fechaSustentacion"
          ) {
            patchExp[k] = fechaIso(v) || null;
          } else if (k === "horaSustentacion") {
            patchExp[k] = horaLimpia(v) || v.trim();
          } else {
            patchExp[k] = normalizarAdministrativo(k, v);
          }
        }
      }
      if (patch.titulo !== undefined) {
        // En tesis de 2 personas comparten título de tesis: sincronizar titulo02
        patchExp.titulo02 = patchExp.titulo;
      }
      if (canon) patchExp.modalidad = canon;
      await tx.update(expedientes).set(patchExp).where(eq(expedientes.id, id));
      // INC-02: un correo de otra persona se informa como conflicto (409),
      // nunca como error SQL de la restricción única.
      for (const [persona, correo] of [
        [actual.participante1, patch.participante1Email],
        [actual.participante2, patch.participante2Email],
      ] as const) {
        if (!persona || !correo) continue;
        const otro = await tx
          .select({ id: usuarios.id })
          .from(usuarios)
          .where(
            and(
              sql`lower(${usuarios.email}) = ${correo.trim().toLowerCase()}`,
              ne(usuarios.id, persona.id),
            ),
          )
          .limit(1);
        if (otro.length > 0) {
          return fail(
            new DomainError(
              "DATOS_DUPLICADOS",
              `El correo ${correo} ya está registrado para otra persona`,
            ),
          );
        }
      }
      if (actual.participante1) {
        const p1 = patchPersona(patch, "participante1");
        if (Object.keys(p1).length > 0) {
          await tx.update(usuarios).set(p1).where(eq(usuarios.id, actual.participante1.id));
        }
      }
      if (actual.participante2) {
        const p2 = patchPersona(patch, "participante2");
        if (Object.keys(p2).length > 0) {
          await tx.update(usuarios).set(p2).where(eq(usuarios.id, actual.participante2.id));
        }
      }
      await appendAuditoria(tx, {
        expedienteId: id,
        actorId: actor.id,
        actorDni: actor.dni,
        estadoAnterior: actual.estado,
        estadoNuevo: actual.estado,
        detalle: "Actualización de datos (autoguardado)",
      });
      const detalle = await getDetalleById(tx, id);
      if (!detalle) return fail(new DomainError("NO_ENCONTRADO", "Expediente no encontrado"));
      return ok(detalle);
    });
  }
}
