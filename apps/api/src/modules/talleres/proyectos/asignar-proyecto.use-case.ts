import type { AsignarProyectoInput, ProyectosTallerDTO } from "@pis/contracts";
import {
  type DbExecutor,
  db,
  fichaRegistros,
  gruposHorario,
  hitosProyecto,
  pensionesAlumno,
  pensionesTaller,
  proyectosTaller,
  proyectoTesistas,
  tallerAsistencias,
  talleres,
  tallerSesiones,
  usuarios,
} from "@pis/db";
import {
  DomainError,
  estadoPorCupo,
  FICHA_SEMANAS,
  fail,
  fechaHito,
  HITOS_TALLER,
  ok,
  puedeAsignarProyecto,
  type Result,
  siguienteCodigoProyecto,
  validarDnisProyecto,
} from "@pis/domain";
import { and, eq, inArray } from "drizzle-orm";
import { DrizzleUnitOfWork } from "../../../infra/db/unit-of-work.js";
import { enqueueCorreo } from "../../../infra/jobs/colas.js";
import { urlPortal } from "../../../infra/mail/correo.service.js";
import { appendAuditoriaTaller } from "../taller-auditoria.js";
import { listarProyectos, proyectosEnCupo, tallerActivoDe } from "./proyectos.repository.js";
import {
  type VerificadorInscripcion,
  verificadorPorCuentaTesista,
} from "./verificador-inscripcion.js";

/**
 * §10 D1 Asignar alumno (y punto de entrada de la validación de la
 * inscripción por la vía Taller): crea el proyecto con 1 o 2 tesistas, su
 * asistencia PENDIENTE en las sesiones por venir y sus 3 pensiones (la 1.ª
 * VALIDADA, pagada al inscribirse). Si se llena el cupo, el taller pasa a
 * COMPLETO. Avisa al alumno y al asesor tras el commit.
 */

export interface Actor {
  id: string;
  dni: string;
}

type ErrorAsignacion = DomainError & { errores?: Array<{ campo: string; mensaje: string }> };

function errorCampo(code: DomainError["code"], campo: string, mensaje: string): ErrorAsignacion {
  return Object.assign(new DomainError(code, mensaje), { errores: [{ campo, mensaje }] });
}

interface Alumno {
  id: string;
  nombre: string;
  email: string;
}

export class AsignarProyectoUseCase {
  constructor(private readonly verificador: VerificadorInscripcion = verificadorPorCuentaTesista) {}

  /** D1: qué se muestra al escribir el DNI (nombre, chips y motivo si no se puede). */
  async candidato(tallerId: string, dni: string) {
    const limpio = dni.trim();
    const alumno = /^\d{8}$/.test(limpio) ? await this.verificador.alumnoPorDni(db, limpio) : null;
    const tallerActivo = alumno ? await tallerActivoDe(db, alumno.id) : null;
    const motivo = !alumno
      ? "No hay un alumno con ese DNI"
      : !alumno.validada
        ? "La inscripción del alumno aún no está validada"
        : tallerActivo
          ? tallerActivo.id === tallerId
            ? "El alumno ya está en este taller"
            : `El alumno ya está en otro taller (${tallerActivo.nombre})`
          : null;
    return {
      dni: limpio,
      encontrado: alumno !== null,
      nombre: alumno?.nombre ?? null,
      inscripcionValidada: alumno?.validada ?? false,
      tallerActivo,
      motivo,
    };
  }

  async execute(
    tallerId: string,
    input: AsignarProyectoInput,
    actor: Actor,
  ): Promise<Result<ProyectosTallerDTO, ErrorAsignacion>> {
    const dnis = validarDnisProyecto(input.dni1, input.dni2);
    if (!dnis.ok) return dnis;

    const r = await new DrizzleUnitOfWork(db).run(
      async (
        tx,
      ): Promise<
        Result<
          {
            lista: ProyectosTallerDTO;
            codigo: string;
            alumnos: Alumno[];
            taller: string;
            asesor: string | null;
          },
          ErrorAsignacion
        >
      > => {
        // Bloquea el taller: dos asignaciones a la vez no pueden pasar del cupo.
        const [t] = await tx
          .select({
            nombre: talleres.nombre,
            estado: talleres.estado,
            cupo: talleres.cupoProyectos,
            asesorId: talleres.asesorId,
            inicio: talleres.fechaInicio,
          })
          .from(talleres)
          .where(eq(talleres.id, tallerId))
          .limit(1)
          .for("update");
        if (!t) return fail(new DomainError("NO_ENCONTRADO", "Taller no encontrado"));
        const asignados = await proyectosEnCupo(tx, tallerId);

        const alumnos: Alumno[] = [];
        const campos = dnis.value.dni2 ? (["dni1", "dni2"] as const) : (["dni1"] as const);
        for (const campo of campos) {
          const dni = campo === "dni1" ? dnis.value.dni1 : (dnis.value.dni2 as string);
          const a = await this.verificador.alumnoPorDni(tx, dni);
          if (!a) return fail(errorCampo("NO_ENCONTRADO", campo, "No hay un alumno con ese DNI"));
          const activo = await tallerActivoDe(tx, a.id);
          const gate = puedeAsignarProyecto({
            estadoTaller: t.estado,
            proyectosAsignados: asignados,
            cupoProyectos: t.cupo,
            inscripcionValidada: a.validada,
            tieneTallerActivo: activo !== null,
          });
          if (!gate.ok) {
            const mensaje =
              activo && gate.error.code === "DATOS_DUPLICADOS"
                ? `${a.nombre} ya está en ${activo.id === tallerId ? "este taller" : `otro taller (${activo.nombre})`}`
                : gate.error.message;
            return fail(errorCampo(gate.error.code, campo, mensaje));
          }
          alumnos.push({ id: a.id, nombre: a.nombre, email: a.email });
        }

        let grupoHorarioId: string | null = null;
        if (input.grupoHorarioId) {
          const [g] = await tx
            .select({ id: gruposHorario.id })
            .from(gruposHorario)
            .where(
              and(
                eq(gruposHorario.id, input.grupoHorarioId),
                eq(gruposHorario.tallerId, tallerId),
                eq(gruposHorario.activo, true),
              ),
            )
            .limit(1);
          if (!g)
            return fail(
              errorCampo(
                "NO_ENCONTRADO",
                "grupoHorarioId",
                "El grupo de horario no es de este taller",
              ),
            );
          grupoHorarioId = g.id;
        }

        const codigos = await tx
          .select({ codigo: proyectosTaller.codigo })
          .from(proyectosTaller)
          .where(eq(proyectosTaller.tallerId, tallerId));
        const codigo = siguienteCodigoProyecto(codigos.map((c) => c.codigo));
        const creadoPor = actor.id === "" ? null : actor.id;
        const [p] = await tx
          .insert(proyectosTaller)
          .values({
            tallerId,
            codigo,
            grupoHorarioId,
            titulo: input.titulo?.trim() || null,
            programa: input.programa?.trim() || null,
            ...(input.modalidad ? { modalidad: input.modalidad } : {}),
            creadoPor,
          })
          .returning({ id: proyectosTaller.id });
        if (!p) return fail(new DomainError("VALIDACION_FALLIDA", "No se pudo crear el proyecto"));
        await tx
          .insert(proyectoTesistas)
          .values(
            alumnos.map((a, i) => ({ proyectoId: p.id, alumnoId: a.id, orden: i + 1, creadoPor })),
          );

        await crearAsistenciaPendiente(tx, tallerId, alumnos);
        await crearHitosYFicha(tx, p.id, t.inicio, creadoPor);
        await crearPensiones(tx, tallerId, alumnos, creadoPor);

        const nuevoEstado = estadoPorCupo(t.estado, asignados + 1, t.cupo);
        if (nuevoEstado !== t.estado)
          await tx
            .update(talleres)
            .set({ estado: nuevoEstado, updatedAt: new Date() })
            .where(eq(talleres.id, tallerId));
        await appendAuditoriaTaller(tx, {
          tallerId,
          actorId: creadoPor,
          actorDni: actor.dni,
          accion: "ASIGNAR_PROYECTO",
          detalle: `${codigo}: ${alumnos.map((a) => a.nombre).join(" y ")}${
            nuevoEstado === "COMPLETO" ? ". El taller llegó al cupo: COMPLETO" : ""
          }`,
        });

        const [asesor] = t.asesorId
          ? await tx
              .select({ email: usuarios.email })
              .from(usuarios)
              .where(eq(usuarios.id, t.asesorId))
              .limit(1)
          : [];
        const lista = await listarProyectos(tx, tallerId);
        if (!lista) return fail(new DomainError("NO_ENCONTRADO", "Taller no encontrado"));
        return ok({ lista, codigo, alumnos, taller: t.nombre, asesor: asesor?.email ?? null });
      },
    );
    if (!r.ok) return r;

    const { lista, codigo, alumnos, taller, asesor } = r.value;
    await enqueueCorreo({
      para: alumnos.map((a) => a.email),
      aParticipantes: false,
      asunto: `Te asignaron al ${taller}`,
      titulo: "Ya tienes taller de tesis",
      texto: `Quedaste asignado al ${taller} (proyecto ${codigo}). Tu 1.ª pensión figura como pagada. En Mi Taller verás tus sesiones, el enlace de reunión y tus pensiones.`,
      enlace: urlPortal("/mi-taller"),
      textoEnlace: "Ir a Mi Taller",
    });
    if (asesor)
      await enqueueCorreo({
        para: [asesor],
        aParticipantes: false,
        asunto: `Nuevo proyecto en el ${taller}`,
        titulo: "Tienes un nuevo proyecto",
        texto: `Se asignó el proyecto ${codigo} (${alumnos.map((a) => a.nombre).join(" y ")}) a tu taller.`,
        enlace: urlPortal("/mis-talleres"),
        textoEnlace: "Ver mi taller",
      });
    return ok(lista);
  }
}

/** Asistencia PENDIENTE en las sesiones que aún no se dictan (no realizadas ni canceladas). */
async function crearAsistenciaPendiente(tx: DbExecutor, tallerId: string, alumnos: Alumno[]) {
  const porVenir = await tx
    .select({ id: tallerSesiones.id })
    .from(tallerSesiones)
    .where(
      and(
        eq(tallerSesiones.tallerId, tallerId),
        inArray(tallerSesiones.estado, ["PROGRAMADA", "REPROGRAMADA"]),
      ),
    );
  if (porVenir.length === 0) return;
  await tx
    .insert(tallerAsistencias)
    .values(porVenir.flatMap((s) => alumnos.map((a) => ({ sesionId: s.id, usuarioId: a.id }))))
    .onConflictDoNothing();
}

/** §3 Las 3 pensiones del alumno: la 1.ª VALIDADA (pagada al inscribirse). */
async function crearPensiones(
  tx: DbExecutor,
  tallerId: string,
  alumnos: Alumno[],
  creadoPor: string | null,
) {
  const delTaller = await tx
    .select({ id: pensionesTaller.id, numero: pensionesTaller.numero })
    .from(pensionesTaller)
    .where(eq(pensionesTaller.tallerId, tallerId));
  if (delTaller.length === 0) return;
  const ahora = new Date();
  await tx
    .insert(pensionesAlumno)
    .values(
      delTaller.flatMap((pt) =>
        alumnos.map((a) =>
          pt.numero === 1
            ? {
                pensionTallerId: pt.id,
                alumnoId: a.id,
                estado: "VALIDADA" as const,
                medio: "INSCRIPCION" as const,
                validadaPor: creadoPor,
                validadaAt: ahora,
                creadoPor,
              }
            : { pensionTallerId: pt.id, alumnoId: a.id, creadoPor },
        ),
      ),
    )
    .onConflictDoNothing();
}

/** §3 Los 7 hitos del proyecto (fecha límite: domingo de su semana) y las 6 filas de la ficha. */
async function crearHitosYFicha(
  tx: DbExecutor,
  proyectoId: string,
  inicio: string | null,
  creadoPor: string | null,
) {
  const base = inicio ?? new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  await tx
    .insert(hitosProyecto)
    .values(
      HITOS_TALLER.map((h) => ({
        proyectoId,
        tipo: h.tipo,
        semana: h.semana,
        fechaLimite: fechaHito(base, h.semana),
        creadoPor,
      })),
    )
    .onConflictDoNothing();
  await tx
    .insert(fichaRegistros)
    .values(
      FICHA_SEMANAS.map((f) => ({
        proyectoId,
        semana: f.semana,
        avanceRevisado: f.avanceRevisado,
        creadoPor,
      })),
    )
    .onConflictDoNothing();
}
