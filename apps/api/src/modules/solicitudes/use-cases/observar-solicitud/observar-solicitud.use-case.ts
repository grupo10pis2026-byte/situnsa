import { createHash, randomBytes } from "node:crypto";
import type { ObservarSolicitudInput } from "@pis/contracts";
import { db, solicitudes, solicitudParticipantes, tokensSubsanacion } from "@pis/db";
import {
  assertTransitionSolicitud,
  calcularLimiteSubsanacion,
  DomainError,
  fail,
  ok,
  type Result,
} from "@pis/domain";
import { eq } from "drizzle-orm";
import { DrizzleUnitOfWork } from "../../../../infra/db/unit-of-work.js";
import { enqueueCorreo } from "../../../../infra/jobs/colas.js";
import { urlPortal } from "../../../../infra/mail/correo.service.js";
import type { Actor } from "../../../expedientes/use-cases/inscribir-plan/inscribir-plan.use-case.js";
import { appendHistorialSolicitud, getSolicitudRaw } from "../../solicitudes.repository.js";

/** RF-02xx[007] — Observar solicitud y emitir token de subsanación */
export class ObservarSolicitudUseCase {
  async execute(
    id: string,
    input: ObservarSolicitudInput,
    actor: Actor,
    ip?: string | null,
  ): Promise<Result<{ ok: true; mensaje: string }, DomainError>> {
    const uow = new DrizzleUnitOfWork(db);
    const r = await uow.run(async (tx) => {
      const sol = await getSolicitudRaw(id, tx);
      if (!sol) return fail(new DomainError("NO_ENCONTRADO", "Solicitud no encontrada"));

      const gate = assertTransitionSolicitud(sol.estado, "OBSERVADA");
      if (!gate.ok) return gate;

      // Participantes para notificación por correo
      const parts = await tx
        .select()
        .from(solicitudParticipantes)
        .where(eq(solicitudParticipantes.solicitudId, id));
      const correos = parts.map((p: typeof solicitudParticipantes.$inferSelect) =>
        p.email.trim().toLowerCase(),
      );

      // Calcular fecha límite de subsanación (días hábiles reglamentarios: 10 días)
      const diasHabiles = 10;
      const fechaLimite = calcularLimiteSubsanacion(new Date(), diasHabiles);

      // Motivo y detalle de observación
      const motivoObservacion = input.detalleObservacion.trim();

      // Actualizar solicitud
      await tx
        .update(solicitudes)
        .set({
          estado: "OBSERVADA",
          motivoObservacion,
          fechaLimiteSubsanacion: fechaLimite.toISOString().slice(0, 10),
          updatedAt: new Date(),
        })
        .where(eq(solicitudes.id, id));

      // Generar token de un solo uso (almacenamos solo el SHA-256)
      const tokenPlano = randomBytes(48).toString("hex");
      const tokenHash = createHash("sha256").update(tokenPlano).digest("hex");

      await tx.insert(tokensSubsanacion).values({
        solicitudId: id,
        hash: tokenHash,
        expiraAt: fechaLimite,
      });

      await appendHistorialSolicitud(tx, {
        solicitudId: id,
        accion: "OBSERVADA",
        actorId: actor.id,
        actorDni: actor.dni,
        ip: ip ?? null,
        detalle: `Observada por ${actor.dni}. Plazo: ${diasHabiles} días hábiles`,
        metadata: { detalleObservacion: input.detalleObservacion, diasHabiles },
      });

      return ok({ token: tokenPlano, sol, correos });
    });

    if (!r.ok) return fail(r.error);

    // Post-commit: correo con enlace de subsanación al tesista
    const enlaceSubsanacion = `${urlPortal()}/subsanar/${r.value.token}`;
    await enqueueCorreo({
      asunto: `[${r.value.sol.codigo}] Solicitud observada – subsane en 10 días hábiles`,
      titulo: "Tu solicitud requiere subsanación",
      texto:
        `Tu solicitud <strong>${r.value.sol.codigo}</strong> ha sido observada. ` +
        "Para subsanarla, accede al siguiente enlace (válido hasta la fecha límite):",
      enlace: enlaceSubsanacion,
      textoEnlace: "Subsanar solicitud",
      para: r.value.correos,
    });

    return ok({
      ok: true as const,
      mensaje: "Solicitud observada correctamente. Se notificó al tesista.",
    });
  }
}
