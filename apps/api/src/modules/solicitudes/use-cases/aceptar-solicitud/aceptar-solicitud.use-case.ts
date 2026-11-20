import type { AceptarSolicitudInput } from "@pis/contracts";
import {
  db,
  documentos,
  expedientes,
  solicitudDocumentos,
  solicitudes,
  solicitudParticipantes,
  subetapas,
  usuarios,
} from "@pis/db";
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
import { urlPortal } from "../../../../infra/mail/correo.service.js";
import { EmitirAccesoUseCase } from "../../../auth/use-cases/acceso/emitir-acceso.use-case.js";
import { appendAuditoria } from "../../../expedientes/expedientes.auditoria.js";
import type { Actor } from "../../../expedientes/use-cases/inscribir-plan/inscribir-plan.use-case.js";
import { asignarRol } from "../../../seguridad/roles.repository.js";
import { correoExpedienteCreado } from "../../correos-solicitud.js";
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
 * 2. Sincroniza o crea cuentas de usuario en `usuarios` (las nuevas, sin clave).
 * 3. Candado advisory sobre 'expedientes:codigo' → asigna SETNNN correlativo.
 * 4. Crea expediente formal en `expedientes`.
 * 5. Migra `solicitudDocumentos` a `documentos` (Etapa 'E1', estado 'APROBADO').
 * 6. Inicializa subetapas del FLUJO_TITULACION con la primera subetapa (E1.1) en EN_CURSO y fecha de inicio.
 * 7. Vincula solicitud → expediente + historial y auditoría.
 * 8. Post-commit: usuarios sin clave (nuevos) → enlace de activación de un solo uso
 *    (`EmitirAccesoUseCase`); usuarios con clave → aviso de expediente creado.
 *    Nunca se envían contraseñas por correo (CR-MOD-OBT-001, D-2).
 */
export class AceptarSolicitudUseCase {
  constructor(private readonly acceso = new EmitirAccesoUseCase()) {}

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
      const notificar: Array<{
        usuarioId: string;
        email: string;
        dni: string;
        nombres: string;
        requiereActivacion: boolean;
        enviarCorreo: boolean;
      }> = [];

      for (const part of partsRows.sort((a, b) => a.orden - b.orden)) {
        const cfg = input.participantesConfig.find(
          (c) => c.orden === part.orden || c.dni === part.dni,
        );
        const existente = await tx
          .select()
          .from(usuarios)
          .where(eq(usuarios.dni, part.dni))
          .limit(1);

        let usuarioId: string;
        let requiereActivacion: boolean;

        if (existente[0]) {
          // Sincronizar datos de contacto actualizados
          await tx
            .update(usuarios)
            .set({
              telefono: part.telefono ?? existente[0].telefono,
              ciudad: part.ciudad ?? existente[0].ciudad,
              direccion: part.direccion ?? existente[0].direccion,
            })
            .where(eq(usuarios.id, existente[0].id));
          usuarioId = existente[0].id;
          requiereActivacion = !existente[0].passwordHash;
        } else {
          // Cuenta nueva SIN clave: el tesista la crea con el enlace de activación.
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
              passwordHash: null,
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
          requiereActivacion = true;
        }
        notificar.push({
          usuarioId,
          email: part.email.trim().toLowerCase(),
          dni: part.dni,
          nombres: part.nombres,
          requiereActivacion,
          enviarCorreo: cfg?.enviarActivacionCorreo ?? true,
        });

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
          modalidad: sol.modalidad,
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

      // --- 4. Migración: Insertar solicitudDocumentos en la tabla documentos vinculados al nuevo expedienteId ---
      const solDocs = await tx
        .select()
        .from(solicitudDocumentos)
        .where(eq(solicitudDocumentos.solicitudId, id));

      if (solDocs.length > 0) {
        await tx.insert(documentos).values(
          solDocs.map((sd) => ({
            expedienteId: expRow.id,
            tipo: sd.tipo,
            etapa: "E1",
            ruta: sd.ruta,
            version: sd.version,
            sha256: sd.sha256,
            estado: "APROBADO" as const,
          })),
        );
      }

      // --- 5. Inicializar subetapas del flujo de titulación (E1.1 en EN_CURSO con fecha de inicio actual) ---
      const ahora = new Date();
      const subetapasInsert = FLUJO_TITULACION.flatMap((etapaFlujo, iEtapa) =>
        etapaFlujo.subetapas.map((se, iSub) => {
          const primera = iEtapa === 0 && iSub === 0;
          return {
            expedienteId: expRow.id,
            etapa: etapaFlujo.numero,
            orden: se.orden,
            nombre: se.nombre,
            plazo: se.plazo ?? null,
            clave: se.clave ?? null,
            estado: primera ? ("EN_CURSO" as const) : ("NO_INICIADO" as const),
            responsable: etapaFlujo.responsable,
            inicio: primera ? ahora : null,
          };
        }),
      );
      if (subetapasInsert.length > 0) {
        await tx.insert(subetapas).values(subetapasInsert);
      }

      // --- 6. Marcar solicitud como ACEPTADA y vincular expediente ---
      await tx
        .update(solicitudes)
        .set({
          estado: "ACEPTADA",
          expedienteId: expRow.id,
          updatedAt: new Date(),
        })
        .where(eq(solicitudes.id, id));

      // --- 7. Historial + auditoría ---
      await appendHistorialSolicitud(tx, {
        solicitudId: id,
        accion: "ACEPTADA",
        actorId: actor.id,
        actorDni: actor.dni,
        ip: ip ?? null,
        detalle: `Solicitud aceptada → Expediente ${codigoSet} creado`,
        metadata: { codigoSet, expedienteId: expRow.id, documentosMigrados: solDocs.length },
      });

      await appendAuditoria(tx, {
        expedienteId: expRow.id,
        actorId: actor.id,
        actorDni: actor.dni,
        estadoAnterior: null,
        estadoNuevo: "REGISTRADO",
        detalle: `Expediente ${codigoSet} creado desde solicitud ${sol.codigo}`,
      });

      return ok({ expedienteId: expRow.id, codigoSet, notificar });
    });

    if (!r.ok) return fail(r.error);

    // Post-commit (AGENTS.md §3): correos solo tras el commit.
    const { codigoSet, notificar } = r.value;
    const habilitarAcceso = input.crearCuentasUsuarios !== false;
    const porActivar = notificar.filter(
      (n) => n.enviarCorreo && n.requiereActivacion && habilitarAcceso,
    );
    if (porActivar.length > 0) {
      // Emite el token en su propia transacción; si fallara, el administrativo
      // puede reenviar el acceso desde el expediente ("Enviar acceso").
      try {
        await this.acceso.execute(
          porActivar.map((n) => n.usuarioId),
          "ACTIVACION",
          new Date(),
          { codigoExpediente: codigoSet },
        );
      } catch (err) {
        console.error("[aceptar-solicitud] no se pudo emitir el acceso", err);
      }
    }
    for (const n of notificar) {
      if (!n.enviarCorreo || porActivar.includes(n)) continue;
      await enqueueCorreo(
        correoExpedienteCreado({
          nombres: n.nombres,
          codigoSet,
          dni: n.dni,
          conAcceso: !n.requiereActivacion,
          enlace: urlPortal("/mi-tramite"),
          para: [n.email],
        }),
      );
    }

    return ok({ expedienteId: r.value.expedienteId, codigoSet: r.value.codigoSet });
  }
}
