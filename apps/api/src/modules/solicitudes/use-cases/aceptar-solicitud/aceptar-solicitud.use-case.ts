import { createHash } from "node:crypto";
import type { AceptarSolicitudInput } from "@pis/contracts";
import { db, expedientes, solicitudes, solicitudParticipantes, subetapas, usuarios } from "@pis/db";
import {
  assertTransitionSolicitud,
  DomainError,
  esProgramaOficial,
  FLUJO_TITULACION,
  fail,
  ok,
  type Result,
} from "@pis/domain";
import { eq, sql } from "drizzle-orm";
import { DrizzleUnitOfWork } from "../../../../infra/db/unit-of-work.js";
import { enqueueCorreo } from "../../../../infra/jobs/colas.js";
import { appendAuditoria } from "../../../expedientes/expedientes.auditoria.js";
import type { Actor } from "../../../expedientes/use-cases/inscribir-plan/inscribir-plan.use-case.js";
import { asignarRol } from "../../../seguridad/roles.repository.js";
import { appendHistorialSolicitud, getSolicitudRaw } from "../../solicitudes.repository.js";

export interface ExpedienteAceptado {
  expedienteId: string;
  codigoSet: string;
}

/**
 * RF-02xx[013] — Aceptar Solicitud y Generar Expediente SET.
 *
 * Transacción UoW atómica:
 * 1. Valida FSM (EN_REVISION o OBSERVADA → ACEPTADA).
 * 2. Sincroniza o crea cuentas de usuario en `usuarios`.
 * 3. Candado advisory sobre 'expedientes:codigo' → asigna SETNNN correlativo.
 * 4. Crea expediente formal en `expedientes`.
 * 5. Inicializa subetapas del FLUJO_TITULACION.
 * 6. Vincula solicitud → expediente + historial.
 * 7. Post-commit: auditoría SHA-256 + correos de credenciales.
 */
export class AceptarSolicitudUseCase {
  async execute(
    id: string,
    input: AceptarSolicitudInput,
    actor: Actor,
    ip?: string | null,
  ): Promise<Result<ExpedienteAceptado, DomainError>> {
    if (!esProgramaOficial(input.programaConfirmado)) {
      return fail(
        new DomainError("VALIDACION_FALLIDA", "Programa no reconocido entre los 13 oficiales"),
      );
    }

    const uow = new DrizzleUnitOfWork(db);
    const r = await uow.run(async (tx) => {
      const sol = await getSolicitudRaw(id, tx);
      if (!sol) return fail(new DomainError("NO_ENCONTRADO", "Solicitud no encontrada"));

      const gate = assertTransitionSolicitud(sol.estado, "ACEPTADA");
      if (!gate.ok) return gate;

      // --- 1. Sincronizar / crear usuarios para los participantes ---
      const partsRows = await tx
        .select()
        .from(solicitudParticipantes)
        .where(eq(solicitudParticipantes.solicitudId, id));

      let p1Id: string | null = null;
      let p2Id: string | null = null;

      for (const part of partsRows.sort((a, b) => a.orden - b.orden)) {
        const cfg = input.participantesConfig.find((c) => c.orden === part.orden);
        const existente = await tx
          .select()
          .from(usuarios)
          .where(eq(usuarios.dni, part.dni))
          .limit(1);

        let usuarioId: string;

        if (existente[0]) {
          // RF-02xx[013]: sincronizar datos de contacto actualizados
          await tx
            .update(usuarios)
            .set({
              telefono: part.telefono ?? existente[0].telefono,
              ciudad: part.ciudad ?? existente[0].ciudad,
              direccion: part.direccion ?? existente[0].direccion,
            })
            .where(eq(usuarios.id, existente[0].id));
          usuarioId = existente[0].id;
        } else {
          // Crear nuevo usuario con contraseña temporal hasheada bcrypt-like (SHA-256 para seed)
          const pwdHash = cfg
            ? createHash("sha256").update(cfg.claveTemporalGenerada).digest("hex")
            : null;
          const [creado] = await tx
            .insert(usuarios)
            .values({
              dni: part.dni,
              cui: part.cui ?? null,
              email: part.email.toLowerCase(),
              nombres: part.nombres,
              apellidos: part.apellidos,
              telefono: part.telefono ?? null,
              ciudad: part.ciudad ?? null,
              direccion: part.direccion ?? null,
              rol: "TESISTA",
              passwordHash: pwdHash,
            })
            .returning({ id: usuarios.id });
          if (!creado) {
            return fail(
              new DomainError(
                "VALIDACION_FALLIDA",
                `No se pudo crear usuario para DNI ${part.dni}`,
              ),
            );
          }
          usuarioId = creado.id;
        }

        await asignarRol(tx, usuarioId, "TESISTA");

        // Vincular usuarioId al participante de la solicitud
        await tx
          .update(solicitudParticipantes)
          .set({ usuarioId })
          .where(eq(solicitudParticipantes.id, part.id));

        if (part.orden === 1) p1Id = usuarioId;
        else if (part.orden === 2) p2Id = usuarioId;
      }

      // --- 2. Candado + correlativo SET ---
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('expedientes:codigo'))`);
      const maxRow = await tx.execute<{ max: number | null }>(
        sql`SELECT MAX(CAST(SUBSTRING(${expedientes.codigo} FROM 4) AS INTEGER)) as max
            FROM ${expedientes}
            WHERE ${expedientes.codigo} ~ '^SET[0-9]+$'`,
      );
      const siguiente = Number(maxRow.rows[0]?.max ?? 0) + 1;
      const codigoSet = `SET${String(siguiente).padStart(3, "0")}`;

      // Verificar que el código confirmado por el admin coincide
      if (input.codigoSetConfirmado !== codigoSet) {
        return fail(
          new DomainError(
            "CONFLICTO_CONCURRENCIA",
            `El código SET sugerido cambió (esperado ${codigoSet}, recibido ${input.codigoSetConfirmado}). Recargue e intente de nuevo.`,
          ),
        );
      }

      // --- 3. Crear expediente formal ---
      const [expRow] = await tx
        .insert(expedientes)
        .values({
          codigo: codigoSet,
          estado: "REGISTRADO",
          modalidad: input.crearCuentasUsuarios ? sol.modalidad : sol.modalidad,
          programa: input.programaConfirmado,
          titulo: input.tituloConfirmado.trim(),
          participante1Id: p1Id,
          participante2Id: p2Id,
          asesorId: input.asesorId ?? null,
        })
        .returning({ id: expedientes.id });

      if (!expRow) {
        return fail(new DomainError("VALIDACION_FALLIDA", "No se pudo crear el expediente"));
      }

      // --- 4. Inicializar subetapas del flujo de titulación ---
      const subetapasInsert = FLUJO_TITULACION.flatMap((etapaFlujo) =>
        etapaFlujo.subetapas.map((se) => ({
          expedienteId: expRow.id,
          etapa: etapaFlujo.numero,
          orden: se.orden,
          nombre: se.nombre,
          plazo: se.plazo ?? null,
          clave: se.clave ?? null,
          estado: "NO_INICIADO" as const,
        })),
      );
      if (subetapasInsert.length > 0) {
        await tx.insert(subetapas).values(subetapasInsert);
      }

      // --- 5. Marcar solicitud como ACEPTADA y vincular expediente ---
      await tx
        .update(solicitudes)
        .set({
          estado: "ACEPTADA",
          expedienteId: expRow.id,
          updatedAt: new Date(),
        })
        .where(eq(solicitudes.id, id));

      // --- 6. Historial + auditoría ---
      await appendHistorialSolicitud(tx, {
        solicitudId: id,
        accion: "ACEPTADA",
        actorId: actor.id,
        actorDni: actor.dni,
        ip: ip ?? null,
        detalle: `Solicitud aceptada → Expediente ${codigoSet} creado`,
        metadata: { codigoSet, expedienteId: expRow.id },
      });

      await appendAuditoria(tx, {
        expedienteId: expRow.id,
        actorId: actor.id,
        actorDni: actor.dni,
        estadoAnterior: null,
        estadoNuevo: "REGISTRADO",
        detalle: `Expediente ${codigoSet} creado desde solicitud ${sol.codigo}`,
      });

      return ok({ expedienteId: expRow.id, codigoSet });
    });

    if (!r.ok) return fail(r.error);

    // Post-commit: correos de bienvenida con credenciales
    await enqueueCorreo({
      expedienteId: r.value.expedienteId,
      asunto: `¡Solicitud aprobada! Expediente ${r.value.codigoSet} creado`,
      titulo: "Tu expediente de titulación fue creado",
      texto:
        `Tu solicitud fue aprobada. Tu expediente de titulación tiene el código <strong>${r.value.codigoSet}</strong>. ` +
        "En breve recibirás las instrucciones para acceder al portal.",
      aParticipantes: true,
    });

    return ok(r.value);
  }
}
