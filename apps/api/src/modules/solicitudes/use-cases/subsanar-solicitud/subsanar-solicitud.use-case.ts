import { mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { db, solicitudDocumentos, solicitudes, solicitudParticipantes } from "@pis/db";
import { DomainError, fail, ok, type Result } from "@pis/domain";
import { and, eq } from "drizzle-orm";
import { DrizzleUnitOfWork } from "../../../../infra/db/unit-of-work.js";
import { enqueueCorreo } from "../../../../infra/jobs/colas.js";
import type { Actor } from "../../../expedientes/use-cases/inscribir-plan/inscribir-plan.use-case.js";
import { nombreEnDisco, sha256Hex, validarArchivoSolicitud } from "../../archivos-solicitud.js";
import { correoSubsanacionRecibida } from "../../correos-solicitud.js";
import { appendHistorialSolicitud } from "../../solicitudes.repository.js";

/** Documento reemplazado desde el portal (campo multipart `archivo_<documentoId>`). */
export interface ArchivoSubsanacion {
  documentoId: string;
  filename: string;
  bytes: Uint8Array;
}

export interface SubsanacionRegistrada {
  mensaje: string;
  documentosActualizados: number;
}

/**
 * RF-02xx[009] — Subsanar solicitud desde el portal del tesista.
 *
 * - Alcance: solo un participante con cuenta vinculada (si no, 404: no se
 *   revela si la solicitud existe).
 * - Solo en estado OBSERVADA; sin fecha límite (decisión del cliente).
 * - Cada archivo reemplaza a un documento de la solicitud: formato real por
 *   magic bytes (fotografía JPG, resto PDF). Se guarda como versión nueva sin
 *   pisar la anterior; la conformidad vuelve a PENDIENTE.
 * - OBSERVADA → EN_REVISION + historial en la misma transacción; correo de
 *   acuse a los participantes tras el commit.
 */
export class SubsanarSolicitudUseCase {
  async execute(
    solicitudId: string,
    actor: Actor,
    archivos: readonly ArchivoSubsanacion[],
    ip: string | null = null,
  ): Promise<Result<SubsanacionRegistrada, DomainError>> {
    if (archivos.length === 0) {
      return fail(
        new DomainError(
          "VALIDACION_FALLIDA",
          "Adjunta al menos un documento corregido antes de reenviar la solicitud",
        ),
      );
    }
    const ids = new Set(archivos.map((a) => a.documentoId));
    if (ids.size !== archivos.length) {
      return fail(
        new DomainError("VALIDACION_FALLIDA", "Cada documento solo puede reemplazarse una vez"),
      );
    }

    const escritos: string[] = [];
    const uow = new DrizzleUnitOfWork(db);
    let r: Result<{ codigo: string; correos: string[]; total: number }, DomainError>;
    try {
      r = await uow.run(async (tx) => {
        const parts = await tx
          .select()
          .from(solicitudParticipantes)
          .where(eq(solicitudParticipantes.solicitudId, solicitudId));
        if (!parts.some((p) => p.usuarioId === actor.id)) {
          return fail(new DomainError("NO_ENCONTRADO", "Solicitud no encontrada"));
        }

        // Candado de fila: dos participantes no reenvían a la vez.
        const [sol] = await tx
          .select()
          .from(solicitudes)
          .where(eq(solicitudes.id, solicitudId))
          .for("update")
          .limit(1);
        if (!sol) return fail(new DomainError("NO_ENCONTRADO", "Solicitud no encontrada"));
        if (sol.estado !== "OBSERVADA") {
          return fail(
            new DomainError(
              "TRANSICION_INVALIDA",
              "La solicitud no tiene observaciones pendientes: ya fue reenviada o resuelta",
            ),
          );
        }

        const docs = await tx
          .select()
          .from(solicitudDocumentos)
          .where(eq(solicitudDocumentos.solicitudId, solicitudId));

        const reemplazados: Array<{ tipo: string; version: number }> = [];
        for (const archivo of archivos) {
          const doc = docs.find((d) => d.id === archivo.documentoId);
          if (!doc) {
            return fail(
              new DomainError("VALIDACION_FALLIDA", "El documento no pertenece a la solicitud"),
            );
          }
          const v = validarArchivoSolicitud(doc.tipo, archivo.filename, archivo.bytes);
          if (!v.ok) return fail(new DomainError("VALIDACION_FALLIDA", v.mensaje));

          const version = (doc.version ?? 1) + 1;
          const ruta = join(dirname(doc.ruta), nombreEnDisco(doc.tipo, archivo.filename, version));
          await mkdir(dirname(ruta), { recursive: true });
          await writeFile(ruta, archivo.bytes);
          escritos.push(ruta);

          await tx
            .update(solicitudDocumentos)
            .set({
              ruta,
              nombreOriginal: archivo.filename,
              mimeType: v.mime,
              pesoBytes: archivo.bytes.length,
              sha256: sha256Hex(archivo.bytes),
              estadoConformidad: "PENDIENTE",
              version,
            })
            .where(
              and(eq(solicitudDocumentos.id, doc.id), eq(solicitudDocumentos.solicitudId, sol.id)),
            );
          reemplazados.push({ tipo: doc.tipo, version });
        }

        await tx
          .update(solicitudes)
          .set({ estado: "EN_REVISION", motivoObservacion: null, updatedAt: new Date() })
          .where(eq(solicitudes.id, sol.id));

        await appendHistorialSolicitud(tx, {
          solicitudId: sol.id,
          accion: "SUBSANADA",
          actorId: actor.id,
          actorDni: actor.dni,
          ip,
          detalle: `Subsanada por el tesista desde el portal (${reemplazados.length} documento(s) actualizado(s))`,
          metadata: { documentos: reemplazados },
        });

        return ok({
          codigo: sol.codigo,
          correos: parts.map((p) => p.email.trim().toLowerCase()),
          total: reemplazados.length,
        });
      });
    } catch (err) {
      await borrar(escritos);
      throw err;
    }
    if (!r.ok) {
      // Rollback: los archivos nuevos no quedan huérfanos en el volumen.
      await borrar(escritos);
      return fail(r.error);
    }

    await enqueueCorreo(
      correoSubsanacionRecibida({ codigo: r.value.codigo, para: r.value.correos }),
    );

    return ok({
      mensaje:
        "Recibimos tus correcciones. El área de titulación revisará nuevamente tu solicitud.",
      documentosActualizados: r.value.total,
    });
  }
}

async function borrar(rutas: readonly string[]): Promise<void> {
  await Promise.all(rutas.map((r) => unlink(r).catch(() => undefined)));
}
