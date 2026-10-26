import type { RechazarSolicitudInput } from "@pis/contracts";
import { db, solicitudes, solicitudParticipantes } from "@pis/db";
import { assertTransitionSolicitud, DomainError, fail, ok, type Result } from "@pis/domain";
import { eq } from "drizzle-orm";
import { DrizzleUnitOfWork } from "../../../../infra/db/unit-of-work.js";
import { enqueueCorreo } from "../../../../infra/jobs/colas.js";
import type { Actor } from "../../../expedientes/use-cases/inscribir-plan/inscribir-plan.use-case.js";
import { appendHistorialSolicitud, getSolicitudRaw } from "../../solicitudes.repository.js";

/** RF-02xx[010] — Rechazar solicitud definitivamente */
export class RechazarSolicitudUseCase {
  async execute(
    id: string,
    input: RechazarSolicitudInput,
    actor: Actor,
    ip?: string | null,
  ): Promise<Result<{ ok: true; mensaje: string }, DomainError>> {
    const uow = new DrizzleUnitOfWork(db);
    const r = await uow.run(async (tx) => {
      const sol = await getSolicitudRaw(id, tx);
      if (!sol) return fail(new DomainError("NO_ENCONTRADO", "Solicitud no encontrada"));

      const gate = assertTransitionSolicitud(sol.estado, "RECHAZADA");
      if (!gate.ok) return gate;

      // Obtener correos de los participantes para notificación
      const parts = await tx
        .select()
        .from(solicitudParticipantes)
        .where(eq(solicitudParticipantes.solicitudId, id));
      const correos = parts.map((p: typeof solicitudParticipantes.$inferSelect) =>
        p.email.trim().toLowerCase(),
      );

      await tx
        .update(solicitudes)
        .set({
          estado: "RECHAZADA",
          motivoRechazo: input.fundamentoReglamentario,
          updatedAt: new Date(),
        })
        .where(eq(solicitudes.id, id));

      await appendHistorialSolicitud(tx, {
        solicitudId: id,
        accion: "RECHAZADA",
        actorId: actor.id,
        actorDni: actor.dni,
        ip: ip ?? null,
        detalle: `Rechazada por ${actor.dni}. Fundamento: ${input.fundamentoReglamentario.substring(0, 100)}`,
        metadata: { fundamentoReglamentario: input.fundamentoReglamentario },
      });

      return ok({ codigo: sol.codigo, correos });
    });

    if (!r.ok) return fail(r.error);

    await enqueueCorreo({
      asunto: `[${r.value.codigo}] Solicitud no admitida`,
      titulo: "Solicitud de titulación no admitida",
      texto:
        `Tu solicitud <strong>${r.value.codigo}</strong> no fue admitida. ` +
        `Fundamento: ${input.fundamentoReglamentario}`,
      para: r.value.correos,
    });

    return ok({ ok: true as const, mensaje: "Solicitud rechazada correctamente." });
  }
}
