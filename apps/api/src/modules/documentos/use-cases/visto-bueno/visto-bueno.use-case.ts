import { db, documentoObservaciones, documentos, expedientes, mensajes, usuarios } from "@pis/db";
import { DomainError, fail, ok, type Result } from "@pis/domain";
import { eq } from "drizzle-orm";
import { DrizzleUnitOfWork } from "../../../../infra/db/unit-of-work.js";
import { enqueueCorreo } from "../../../../infra/jobs/colas.js";
import { appendAuditoria } from "../../../expedientes/expedientes.auditoria.js";

export interface Actor {
  id: string;
  dni: string;
}

/**
 * V°B° académico del documento (RN-08): CARGADO/OBSERVADO → APROBADO
 * (aprobado=true) o → OBSERVADO (aprobado=false, exige comentario).
 * No cierra subetapas: eso lo hace FinalizarSubetapa (responsable).
 * Se audita en la cadena del expediente como pronunciamiento delegado.
 */
export class VistoBuenoDocumentoUseCase {
  async execute(
    documentoId: string,
    input: { aprobado: boolean; comentario?: string },
    actor: Actor,
  ): Promise<Result<{ id: string; estado: string; version: number }, DomainError>> {
    if (!input.aprobado && !(input.comentario ?? "").trim()) {
      return fail(
        new DomainError("VALIDACION_FALLIDA", "Observar exige un comentario para el tesista"),
      );
    }
    const uow = new DrizzleUnitOfWork(db);
    const r = await uow.run(async (tx) => {
      const rows = await tx
        .select()
        .from(documentos)
        .where(eq(documentos.id, documentoId))
        .limit(1);
      const doc = rows[0];
      if (!doc) return fail(new DomainError("NO_ENCONTRADO", "Documento no encontrado"));
      if (doc.estado !== "CARGADO" && doc.estado !== "OBSERVADO") {
        return fail(
          new DomainError(
            "TRANSICION_INVALIDA",
            `Solo se puede visar un documento CARGADO u OBSERVADO (actual: ${doc.estado})`,
          ),
        );
      }
      const nuevo = input.aprobado ? "APROBADO" : "OBSERVADO";
      await tx.update(documentos).set({ estado: nuevo }).where(eq(documentos.id, documentoId));

      if (!input.aprobado && (input.comentario ?? "").trim()) {
        const usuarioRow = await tx
          .select({ nombres: usuarios.nombres, apellidos: usuarios.apellidos, rol: usuarios.rol })
          .from(usuarios)
          .where(eq(usuarios.id, actor.id))
          .limit(1);
        const autorNombre = usuarioRow[0]
          ? `${usuarioRow[0].nombres} ${usuarioRow[0].apellidos}`
          : "Administración";
        const autorRol = usuarioRow[0]?.rol ?? "ADMIN_FIPS";

        await tx.insert(documentoObservaciones).values({
          expedienteId: doc.expedienteId,
          tipoDocumento: doc.tipo,
          documentoId: doc.id,
          texto: (input.comentario ?? "").trim(),
          autorId: actor.id || null,
          autorNombre,
          autorRol,
          estado: "PENDIENTE",
        });

        await tx.insert(mensajes).values({
          expedienteId: doc.expedienteId,
          autorId: actor.id || null,
          texto: `[Observación en ${doc.tipo}]: ${(input.comentario ?? "").trim()}`,
        });
      }

      const expRows = await tx
        .select({ estado: expedientes.estado })
        .from(expedientes)
        .where(eq(expedientes.id, doc.expedienteId))
        .limit(1);
      const macro = expRows[0]?.estado ?? "REGISTRADO";
      await appendAuditoria(tx, {
        expedienteId: doc.expedienteId,
        actorId: actor.id,
        actorDni: actor.dni,
        estadoAnterior: macro,
        estadoNuevo: macro,
        detalle: input.aprobado
          ? `V°B° ${doc.tipo} v${doc.version}`
          : `Observado ${doc.tipo} v${doc.version}: ${(input.comentario ?? "").trim().slice(0, 200)}`,
      });
      return ok({
        id: doc.id,
        estado: nuevo,
        version: doc.version,
        expedienteId: doc.expedienteId,
        tipo: doc.tipo,
      });
    });

    if (!r.ok) return r;
    if (r.value.estado === "OBSERVADO") {
      await enqueueCorreo({
        expedienteId: r.value.expedienteId,
        asunto: "Un documento de tu expediente fue observado",
        titulo: "Documento observado",
        texto: `El documento ${r.value.tipo} (versión ${r.value.version}) fue observado: ${(input.comentario ?? "").trim()}

Carga una nueva versión corregida desde tu portal.`,
      });
    }
    return ok({ id: r.value.id, estado: r.value.estado, version: r.value.version });
  }
}
