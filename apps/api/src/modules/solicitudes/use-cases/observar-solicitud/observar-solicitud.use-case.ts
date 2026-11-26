import type { ObservarSolicitudInput } from "@pis/contracts";
import { db, solicitudes } from "@pis/db";
import { assertTransitionSolicitud, DomainError, fail, ok, type Result } from "@pis/domain";
import { eq } from "drizzle-orm";
import { DrizzleUnitOfWork } from "../../../../infra/db/unit-of-work.js";
import { enqueueCorreo } from "../../../../infra/jobs/colas.js";
import { urlPortal } from "../../../../infra/mail/correo.service.js";
import { EmitirAccesoUseCase } from "../../../auth/use-cases/acceso/emitir-acceso.use-case.js";
import type { Actor } from "../../../expedientes/use-cases/inscribir-plan/inscribir-plan.use-case.js";
import { correoSolicitudObservada } from "../../correos-solicitud.js";
import {
  type CuentaParticipante,
  sincronizarCuentasParticipantes,
} from "../../cuentas-participantes.js";
import { appendHistorialSolicitud, getSolicitudRaw } from "../../solicitudes.repository.js";

/**
 * RF-02xx[007] — Observar solicitud.
 *
 * Decisión del cliente (2026-11-26): al observar se crean (o sincronizan) las
 * cuentas TESISTA de los participantes y cada uno corrige sus documentos
 * desde el portal («Mi trámite»). No hay enlace de subsanación aparte ni
 * fecha límite: la observación queda abierta hasta que el tesista reenvía.
 *
 * Post-commit, un único correo por participante con las observaciones y su
 * forma de ingreso: enlace de activación (cuenta sin clave) o inicio de sesión.
 */
export class ObservarSolicitudUseCase {
  constructor(private readonly acceso = new EmitirAccesoUseCase()) {}

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

      const motivoObservacion = input.detalleObservacion.trim();
      await tx
        .update(solicitudes)
        .set({
          estado: "OBSERVADA",
          motivoObservacion,
          fechaLimiteSubsanacion: null,
          updatedAt: new Date(),
        })
        .where(eq(solicitudes.id, id));

      const cuentas = await sincronizarCuentasParticipantes(tx, id);
      if (!cuentas.ok) return cuentas;

      await appendHistorialSolicitud(tx, {
        solicitudId: id,
        accion: "OBSERVADA",
        actorId: actor.id,
        actorDni: actor.dni,
        ip: ip ?? null,
        detalle: `Observada por ${actor.dni}. El tesista corrige desde el portal.`,
        metadata: {
          detalleObservacion: motivoObservacion,
          cuentasPortal: cuentas.value.map((c) => c.dni),
        },
      });

      return ok({ codigo: sol.codigo, motivoObservacion, cuentas: cuentas.value });
    });

    if (!r.ok) return fail(r.error);

    // Post-commit (AGENTS.md §3): correos solo tras el commit.
    const { codigo, motivoObservacion, cuentas } = r.value;
    const base = { codigo, detalle: motivoObservacion, conGoogle: googleHabilitado() };
    const correoIngresar = (c: CuentaParticipante) =>
      correoSolicitudObservada({
        ...base,
        nombres: c.nombres,
        dni: c.dni,
        acceso: { tipo: "INGRESAR", enlace: urlPortal("/login") },
        para: [c.email],
      });

    const porActivar = cuentas.filter((c) => c.requiereActivacion && c.activo);
    let activados = new Set<string>();
    if (porActivar.length > 0) {
      try {
        const emitidos = await this.acceso.execute(
          porActivar.map((c) => c.usuarioId),
          "ACTIVACION",
          new Date(),
          {
            correo: (d) =>
              correoSolicitudObservada({
                ...base,
                nombres: d.nombres,
                dni: d.dni,
                acceso: { tipo: "ACTIVAR", enlace: d.enlace },
                para: [d.email],
              }),
          },
        );
        activados = new Set(emitidos.map((e) => e.usuarioId));
      } catch (err) {
        // Sin enlace de activación igual se avisa la observación; el tesista
        // puede pedir uno con «¿Primera vez u olvidaste tu clave?».
        console.error("[observar-solicitud] no se pudo emitir el acceso", err);
      }
    }
    for (const c of cuentas) {
      if (activados.has(c.usuarioId)) continue;
      await enqueueCorreo(correoIngresar(c));
    }

    return ok({
      ok: true as const,
      mensaje:
        "Solicitud observada. Se habilitó el acceso al portal y se notificó a los participantes.",
    });
  }
}

/** El acceso con Google se menciona en los correos solo si está configurado. */
function googleHabilitado(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID);
}
