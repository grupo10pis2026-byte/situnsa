import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { SubsanarSolicitudPayload } from "@pis/contracts";
import {
  db,
  solicitudDocumentos,
  solicitudes,
  solicitudParticipantes,
  tokensSubsanacion,
} from "@pis/db";
import { DomainError, estaSubsanacionVencida, fail, ok, type Result } from "@pis/domain";
import { eq } from "drizzle-orm";
import { DrizzleUnitOfWork } from "../../../../infra/db/unit-of-work.js";
import { enqueueCorreo } from "../../../../infra/jobs/colas.js";
import {
  appendHistorialSolicitud,
  getTokenSubsanacionPorHash,
} from "../../solicitudes.repository.js";

/** Magic bytes de PDF: primeros 5 bytes deben ser `%PDF-` */
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]);

function validarMagicBytesPdf(bytes: Uint8Array): boolean {
  if (bytes.length < 5) return false;
  return (
    bytes[0] === PDF_MAGIC[0] &&
    bytes[1] === PDF_MAGIC[1] &&
    bytes[2] === PDF_MAGIC[2] &&
    bytes[3] === PDF_MAGIC[3] &&
    bytes[4] === PDF_MAGIC[4]
  );
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export interface ArchivoSubsanacion {
  documentoId?: string;
  tipo?: string;
  filename: string;
  bytes: Uint8Array;
  mimeType?: string;
}

export interface SubsanacionAceptada {
  mensaje: string;
  solicitudId: string;
  codigo: string;
}

/**
 * RF-02xx[009] — Subsanar Solicitud por Token:
 * - Valida token (único uso, no expirado).
 * - Recibe los nuevos PDFs (multipart) y sobrescribe físicamente los archivos observados en el disco.
 * - Actualiza metadatos (sha256, peso, versión) y restablece estadoConformidad a PENDIENTE.
 * - Transiciona estado de solicitud a EN_REVISION.
 * - Encola correo de confirmación a los tesistas.
 */
export class SubsanarSolicitudUseCase {
  async execute(
    tokenPlano: string,
    payload: SubsanarSolicitudPayload,
    arg3?: string | null | ArchivoSubsanacion[],
    arg4?: ArchivoSubsanacion[] | string | null,
  ): Promise<Result<SubsanacionAceptada, DomainError>> {
    let ip: string | null = null;
    let archivos: ArchivoSubsanacion[] = [];

    if (Array.isArray(arg3)) {
      archivos = arg3;
      if (typeof arg4 === "string" || arg4 === null) ip = arg4;
    } else {
      if (typeof arg3 === "string" || arg3 === null) ip = arg3;
      if (Array.isArray(arg4)) archivos = arg4;
    }

    // Validar que los archivos adjuntados sean PDFs válidos
    for (const archivo of archivos) {
      if (!validarMagicBytesPdf(archivo.bytes)) {
        return fail(
          new DomainError(
            "VALIDACION_FALLIDA",
            `El archivo subsanado "${archivo.filename}" no es un PDF válido`,
          ),
        );
      }
    }

    const tokenHash = createHash("sha256").update(tokenPlano).digest("hex");

    const uow = new DrizzleUnitOfWork(db);
    const r = await uow.run(async (tx) => {
      const token = await getTokenSubsanacionPorHash(tokenHash, tx);
      if (!token) {
        return fail(new DomainError("NO_ENCONTRADO", "Enlace de subsanación inválido"));
      }
      if (token.usadoAt) {
        return fail(new DomainError("TOKEN_INVALIDO", "Este enlace ya fue utilizado"));
      }
      if (estaSubsanacionVencida(token.expiraAt, new Date())) {
        return fail(
          new DomainError(
            "PLAZO_VENCIDO",
            "El enlace de subsanación ha expirado. Contacta a la oficina de titulación.",
          ),
        );
      }

      // Obtener solicitud
      const [sol] = await tx
        .select()
        .from(solicitudes)
        .where(eq(solicitudes.id, token.solicitudId))
        .limit(1);

      if (!sol) return fail(new DomainError("NO_ENCONTRADO", "Solicitud no encontrada"));

      // Marcar token como usado
      await tx
        .update(tokensSubsanacion)
        .set({ usadoAt: new Date() })
        .where(eq(tokensSubsanacion.id, token.id));

      // Obtener documentos actuales de la solicitud
      const docsExistentes = await tx
        .select()
        .from(solicitudDocumentos)
        .where(eq(solicitudDocumentos.solicitudId, sol.id));

      const docsActualizadosIds = new Set<string>();

      // Sobrescribir físicamente los archivos observados en el volumen de almacenamiento
      for (const archivo of archivos) {
        const docExistente =
          (archivo.documentoId &&
            docsExistentes.find(
              (d: typeof solicitudDocumentos.$inferSelect) => d.id === archivo.documentoId,
            )) ||
          (archivo.tipo &&
            docsExistentes.find(
              (d: typeof solicitudDocumentos.$inferSelect) =>
                d.tipo.toUpperCase() === archivo.tipo?.toUpperCase(),
            )) ||
          docsExistentes.find(
            (d: typeof solicitudDocumentos.$inferSelect) =>
              d.nombreOriginal.toLowerCase() === archivo.filename.toLowerCase(),
          );

        if (docExistente) {
          // Sobrescritura en disco
          await mkdir(dirname(docExistente.ruta), { recursive: true });
          await writeFile(docExistente.ruta, archivo.bytes);

          // Actualizar metadatos del registro y restablecer conformidad a PENDIENTE
          await tx
            .update(solicitudDocumentos)
            .set({
              nombreOriginal: archivo.filename,
              mimeType: archivo.mimeType ?? "application/pdf",
              pesoBytes: archivo.bytes.length,
              sha256: sha256Hex(archivo.bytes),
              estadoConformidad: "PENDIENTE",
              version: (docExistente.version ?? 1) + 1,
            })
            .where(eq(solicitudDocumentos.id, docExistente.id));

          docsActualizadosIds.add(docExistente.id);
        }
      }

      // Restablecer conformidad de documentos indicados en payload que no vinieron como archivo
      if (payload.archivosSubsanadosIds && payload.archivosSubsanadosIds.length > 0) {
        for (const docId of payload.archivosSubsanadosIds) {
          if (!docsActualizadosIds.has(docId)) {
            const doc = docsExistentes.find(
              (d: typeof solicitudDocumentos.$inferSelect) => d.id === docId,
            );
            await tx
              .update(solicitudDocumentos)
              .set({
                estadoConformidad: "PENDIENTE",
                version: (doc?.version ?? 1) + 1,
              })
              .where(eq(solicitudDocumentos.id, docId));
            docsActualizadosIds.add(docId);
          }
        }
      }

      // Transición: OBSERVADA → EN_REVISION (subsanada)
      await tx
        .update(solicitudes)
        .set({
          estado: "EN_REVISION",
          motivoObservacion: null,
          fechaLimiteSubsanacion: null,
          updatedAt: new Date(),
        })
        .where(eq(solicitudes.id, sol.id));

      // Obtener participantes para notificación por correo
      const parts = await tx
        .select()
        .from(solicitudParticipantes)
        .where(eq(solicitudParticipantes.solicitudId, sol.id));
      const correos = parts.map((p: typeof solicitudParticipantes.$inferSelect) =>
        p.email.trim().toLowerCase(),
      );

      await appendHistorialSolicitud(tx, {
        solicitudId: sol.id,
        accion: "SUBSANADA",
        actorId: null,
        actorDni: "portal-publico",
        ip: ip ?? null,
        detalle: `Solicitud subsanada por el tesista vía token (${docsActualizadosIds.size} documento(s) actualizado(s))`,
        metadata: {
          archivosSubsanadosIds: Array.from(docsActualizadosIds),
          archivosSobrescritos: archivos.length,
          correccionesDatos: payload.correccionesDatos ?? {},
        },
      });

      return ok({ solicitudId: sol.id, codigo: sol.codigo, correos });
    });

    if (!r.ok) return fail(r.error);

    await enqueueCorreo({
      asunto: `[${r.value.codigo}] Subsanación recibida`,
      titulo: "Recibimos tu subsanación",
      texto:
        `Tu subsanación para la solicitud <strong>${r.value.codigo}</strong> fue registrada exitosamente. ` +
        "El personal de titulación revisará los documentos actualizados y te notificará.",
      para: r.value.correos,
    });

    return ok({
      mensaje: "Subsanación registrada correctamente. Se notificó al área de titulación.",
      solicitudId: r.value.solicitudId,
      codigo: r.value.codigo,
    });
  }
}
