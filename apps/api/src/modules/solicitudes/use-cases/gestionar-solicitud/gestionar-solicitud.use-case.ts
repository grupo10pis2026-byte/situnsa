import type { ActualizarDatosMenoresInput, EstadoConformidadDocumento } from "@pis/contracts";
import { db, solicitudDocumentos, solicitudes, solicitudParticipantes } from "@pis/db";
import { DomainError, fail, ok, type Result } from "@pis/domain";
import { eq } from "drizzle-orm";
import { DrizzleUnitOfWork } from "../../../../infra/db/unit-of-work.js";
import type { Actor } from "../../../expedientes/use-cases/inscribir-plan/inscribir-plan.use-case.js";
import {
  appendHistorialSolicitud,
  getSolicitudById,
  getSolicitudRaw,
} from "../../solicitudes.repository.js";

/** RF-02xx[005] — Actualizar datos menores de la solicitud (antes de aceptar) */
export class ActualizarDatosMenoresUseCase {
  async execute(
    id: string,
    input: ActualizarDatosMenoresInput,
    actor: Actor,
    ip?: string | null,
  ): Promise<Result<{ ok: true; mensaje: string }, DomainError>> {
    const uow = new DrizzleUnitOfWork(db);
    return uow.run(async (tx) => {
      const sol = await getSolicitudRaw(id, tx);
      if (!sol) return fail(new DomainError("NO_ENCONTRADO", "Solicitud no encontrada"));

      if (sol.estado === "ACEPTADA" || sol.estado === "RECHAZADA") {
        return fail(
          new DomainError(
            "VALIDACION_FALLIDA",
            "No se pueden modificar datos de una solicitud ya cerrada",
          ),
        );
      }

      // Actualizar campos de la solicitud
      const updateSol: Partial<typeof sol> = {};
      if (input.titulo) updateSol.titulo = input.titulo;
      if (input.programa) updateSol.programa = input.programa;
      if (input.modalidad) updateSol.modalidad = input.modalidad;

      if (Object.keys(updateSol).length > 0) {
        await tx
          .update(solicitudes)
          .set({ ...updateSol, updatedAt: new Date() })
          .where(eq(solicitudes.id, id));
      }

      // Actualizar datos de participantes
      if (input.participantes && input.participantes.length > 0) {
        for (const p of input.participantes) {
          const upd: Record<string, unknown> = {};
          if (p.nombres !== undefined) upd.nombres = p.nombres;
          if (p.apellidos !== undefined) upd.apellidos = p.apellidos;
          if (p.cui !== undefined) upd.cui = p.cui;
          if (p.email !== undefined) upd.email = p.email.toLowerCase();
          if (p.telefono !== undefined) upd.telefono = p.telefono;
          if (p.ciudad !== undefined) upd.ciudad = p.ciudad;
          if (p.direccion !== undefined) upd.direccion = p.direccion;
          if (Object.keys(upd).length > 0) {
            await tx
              .update(solicitudParticipantes)
              .set(upd)
              .where(eq(solicitudParticipantes.id, p.id));
          }
        }
      }

      await appendHistorialSolicitud(tx, {
        solicitudId: id,
        accion: "DATOS_ACTUALIZADOS",
        actorId: actor.id,
        actorDni: actor.dni,
        ip: ip ?? null,
        detalle: "Corrección de datos menores por el personal administrativo",
        metadata: { campos: Object.keys(input) },
      });

      return ok({ ok: true as const, mensaje: "Datos actualizados correctamente" });
    });
  }
}

/** RF-02xx[008] — Marcar conformidad de un documento de la solicitud */
export class ActualizarConformidadDocumentoUseCase {
  async execute(
    solicitudId: string,
    documentoId: string,
    input: { estadoConformidad: EstadoConformidadDocumento },
    actor: Actor,
    ip?: string | null,
  ): Promise<Result<{ ok: true; estadoConformidad: EstadoConformidadDocumento }, DomainError>> {
    const uow = new DrizzleUnitOfWork(db);
    return uow.run(async (tx) => {
      const sol = await getSolicitudRaw(solicitudId, tx);
      if (!sol) return fail(new DomainError("NO_ENCONTRADO", "Solicitud no encontrada"));

      const [doc] = await tx
        .select()
        .from(solicitudDocumentos)
        .where(eq(solicitudDocumentos.id, documentoId))
        .limit(1);

      if (!doc || doc.solicitudId !== solicitudId) {
        return fail(new DomainError("NO_ENCONTRADO", "Documento no encontrado en esta solicitud"));
      }

      await tx
        .update(solicitudDocumentos)
        .set({ estadoConformidad: input.estadoConformidad })
        .where(eq(solicitudDocumentos.id, documentoId));

      await appendHistorialSolicitud(tx, {
        solicitudId,
        accion: "CONFORMIDAD_DOCUMENTO",
        actorId: actor.id,
        actorDni: actor.dni,
        ip: ip ?? null,
        detalle: `Documento "${doc.tipo}" marcado como ${input.estadoConformidad}`,
        metadata: { documentoId, tipo: doc.tipo, estado: input.estadoConformidad },
      });

      return ok({ ok: true as const, estadoConformidad: input.estadoConformidad });
    });
  }
}

/** RF-02xx[004] — Abrir detalle: transicionar NUEVA → EN_REVISION automáticamente */
export class ObtenerDetalleSolicitudUseCase {
  async execute(
    id: string,
    actor: Actor,
    ip?: string | null,
  ): Promise<Result<import("@pis/contracts").SolicitudDetalleDTO, DomainError>> {
    // Transición automática NUEVA → EN_REVISION al primer abrir
    const uow = new DrizzleUnitOfWork(db);
    await uow.run(async (tx) => {
      const sol = await getSolicitudRaw(id, tx);
      if (!sol || sol.estado !== "NUEVA") return ok(null);

      await tx
        .update(solicitudes)
        .set({ estado: "EN_REVISION", updatedAt: new Date() })
        .where(eq(solicitudes.id, id));

      await appendHistorialSolicitud(tx, {
        solicitudId: id,
        accion: "EN_REVISION",
        actorId: actor.id,
        actorDni: actor.dni,
        ip: ip ?? null,
        detalle: "Solicitud abierta para revisión",
        metadata: {},
      });

      return ok(null);
    });

    const detalle = await getSolicitudById(id);
    if (!detalle) return fail(new DomainError("NO_ENCONTRADO", "Solicitud no encontrada"));
    return ok(detalle);
  }
}
