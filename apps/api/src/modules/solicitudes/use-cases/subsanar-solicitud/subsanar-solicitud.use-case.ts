import { createHash } from "node:crypto";
import type { SubsanarSolicitudPayload } from "@pis/contracts";
import { db, solicitudDocumentos, solicitudes, tokensSubsanacion } from "@pis/db";
import { DomainError, estaSubsanacionVencida, fail, ok, type Result } from "@pis/domain";
import { eq } from "drizzle-orm";
import { DrizzleUnitOfWork } from "../../../../infra/db/unit-of-work.js";
import { enqueueCorreo } from "../../../../infra/jobs/colas.js";
import {
  appendHistorialSolicitud,
  getTokenSubsanacionPorHash,
} from "../../solicitudes.repository.js";

export interface SubsanacionAceptada {
  mensaje: string;
  solicitudId: string;
  codigo: string;
}

/**
 * RF-02xx[009] — Subsanar Solicitud por Token.
 * Valida token (único uso, no expirado), transiciona a EN_REVISION.
 */
export class SubsanarSolicitudUseCase {
  async execute(
    tokenPlano: string,
    payload: SubsanarSolicitudPayload,
    ip?: string | null,
  ): Promise<Result<SubsanacionAceptada, DomainError>> {
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

      // Restablecer conformidad de documentos subsanados a PENDIENTE para revisión
      if (payload.archivosSubsanadosIds && payload.archivosSubsanadosIds.length > 0) {
        for (const docId of payload.archivosSubsanadosIds) {
          await tx
            .update(solicitudDocumentos)
            .set({
              estadoConformidad: "PENDIENTE",
              version: sol.cantidadTesistas, // versión arbitraria; el frontend ya subió los archivos
            })
            .where(eq(solicitudDocumentos.id, docId));
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

      await appendHistorialSolicitud(tx, {
        solicitudId: sol.id,
        accion: "SUBSANADA",
        actorId: null,
        actorDni: "portal-publico",
        ip: ip ?? null,
        detalle: "Solicitud subsanada por el tesista vía token",
        metadata: {
          archivosSubsanadosIds: payload.archivosSubsanadosIds ?? [],
          correccionesDatos: payload.correccionesDatos ?? {},
        },
      });

      return ok({ solicitudId: sol.id, codigo: sol.codigo });
    });

    if (!r.ok) return fail(r.error);

    await enqueueCorreo({
      asunto: `[${r.value.codigo}] Subsanación recibida`,
      titulo: "Recibimos tu subsanación",
      texto:
        `Tu subsanación para la solicitud <strong>${r.value.codigo}</strong> fue registrada. ` +
        "El personal de titulación la revisará y te notificará.",
    });

    return ok({
      mensaje: "Subsanación registrada correctamente. Se notificó al área de titulación.",
      solicitudId: r.value.solicitudId,
      codigo: r.value.codigo,
    });
  }
}
