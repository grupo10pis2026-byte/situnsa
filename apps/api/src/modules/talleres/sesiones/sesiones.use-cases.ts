import type { AsistenciaSesionDTO } from "@pis/contracts";
import {
  alertasTaller,
  asistenciaGrupos,
  type DbExecutor,
  db,
  gruposHorario,
  proyectosTaller,
  tallerAsistencias,
  tallerDias,
  talleres,
  tallerSesiones,
  usuarios,
} from "@pis/db";
import {
  alcanzaFaltasParaRetiro,
  assertTransicionSesion,
  DomainError,
  fail,
  type MarcaAsistencia,
  ok,
  puedeRegistrarAsistencia,
  type RegistroAsistenciaCurso,
  type Result,
  validarCambioAsistencia,
  validarGrupoHorario,
  validarSesionNueva,
} from "@pis/domain";
import { and, asc, eq, inArray, max, ne } from "drizzle-orm";
import { DrizzleUnitOfWork } from "../../../infra/db/unit-of-work.js";
import { enqueueCorreo } from "../../../infra/jobs/colas.js";
import { urlPortal } from "../../../infra/mail/correo.service.js";
import { leerParametrosTaller } from "../../taller-config/taller-config.repository.js";
import { appendAuditoriaTaller } from "../taller-auditoria.js";
import {
  asistenciaDeSesion,
  hoyLima,
  type Tesista,
  tesistasActivos,
} from "./sesiones.repository.js";

/**
 * P4/P5/D2 (spec v1.0): asistencia por grupo registrada por el asesor
 * (la Secretaría solo corrige, con motivo), sesiones extra, reprogramación,
 * cancelación y grupos de horario. Todo queda en el historial del taller.
 */

export interface Actor {
  id: string;
  dni: string;
}

type ErrorSesion = DomainError & { errores?: Array<{ campo: string; mensaje: string }> };

function campo(code: DomainError["code"], c: string, mensaje: string): ErrorSesion {
  return Object.assign(new DomainError(code, mensaje), { errores: [{ campo: c, mensaje }] });
}

const noEncontrada = () => fail(new DomainError("NO_ENCONTRADO", "Sesión no encontrada"));

function idActor(a: Actor): string | null {
  return a.id === "" ? null : a.id;
}

async function avisar(tesistas: Tesista[], tallerId: string, asunto: string, texto: string) {
  const [t] = await db
    .select({ asesor: usuarios.email })
    .from(talleres)
    .leftJoin(usuarios, eq(usuarios.id, talleres.asesorId))
    .where(eq(talleres.id, tallerId))
    .limit(1);
  const para = [...new Set([...tesistas.map((x) => x.email), ...(t?.asesor ? [t.asesor] : [])])];
  if (para.length === 0) return;
  await enqueueCorreo({
    para,
    aParticipantes: false,
    asunto,
    titulo: asunto,
    texto,
    enlace: urlPortal("/mi-taller"),
    textoEnlace: "Ver Mi Taller",
  });
}

// ── Asistencia ─────────────────────────────────────────────────────────

export class GuardarAsistenciaUseCase {
  async execute(
    sesionId: string,
    input: {
      grupoId: string | null;
      marcas: Array<{
        alumnoId: string;
        estado: "PRESENTE" | "FALTA" | "JUSTIFICADA";
        motivo?: string | null | undefined;
      }>;
    },
    actor: Actor,
    puede: { registrar: boolean },
  ): Promise<Result<AsistenciaSesionDTO, ErrorSesion>> {
    const hoy = hoyLima();
    const r = await new DrizzleUnitOfWork(db).run(
      async (tx): Promise<Result<{ alertados: Tesista[]; tallerId: string }, ErrorSesion>> => {
        const [s] = await tx
          .select()
          .from(tallerSesiones)
          .where(eq(tallerSesiones.id, sesionId))
          .limit(1)
          .for("update");
        if (!s) return noEncontrada();
        const gate = puedeRegistrarAsistencia({ estado: s.estado, fecha: s.fecha }, hoy);
        if (!gate.ok) return gate;
        const grupos = await tx
          .select({ id: gruposHorario.id })
          .from(gruposHorario)
          .where(and(eq(gruposHorario.tallerId, s.tallerId), eq(gruposHorario.activo, true)));
        if (input.grupoId !== null && !grupos.some((g) => g.id === input.grupoId))
          return fail(campo("NO_ENCONTRADO", "grupoId", "El grupo no es de este taller"));
        const tesistas = await tesistasActivos(tx, s.tallerId);
        const delGrupo = tesistas.filter((t) =>
          input.grupoId === null
            ? t.grupoHorarioId === null || !grupos.some((g) => g.id === t.grupoHorarioId)
            : t.grupoHorarioId === input.grupoId,
        );
        const faltan = delGrupo.filter((t) => !input.marcas.some((m) => m.alumnoId === t.alumnoId));
        if (faltan.length > 0)
          return fail(
            new DomainError(
              "VALIDACION_FALLIDA",
              `Falta la asistencia de ${faltan.map((f) => f.nombre).join(", ")}`,
            ),
          );
        const ajenos = input.marcas.filter((m) => !delGrupo.some((t) => t.alumnoId === m.alumnoId));
        if (ajenos.length > 0)
          return fail(
            new DomainError("VALIDACION_FALLIDA", "Hay alumnos que no son de este grupo"),
          );

        const actuales = await tx
          .select()
          .from(tallerAsistencias)
          .where(eq(tallerAsistencias.sesionId, sesionId));
        const ahora = new Date();
        const cambios: string[] = [];
        for (const m of input.marcas) {
          const actual = actuales.find((a) => a.usuarioId === m.alumnoId);
          const anterior: MarcaAsistencia = actual?.estado ?? "PENDIENTE";
          const v = validarCambioAsistencia(anterior, m.estado, m.motivo);
          if (!v.ok) return fail(campo(v.error.code, `motivo.${m.alumnoId}`, v.error.message));
          if (anterior === "PENDIENTE" && !puede.registrar)
            return fail(
              new DomainError(
                "SIN_PERMISO",
                "La asistencia la registra el asesor; la Secretaría solo corrige o justifica",
              ),
            );
          if (anterior === m.estado) continue;
          const motivo = m.motivo?.trim() || null;
          if (!actual) {
            await tx.insert(tallerAsistencias).values({
              sesionId,
              usuarioId: m.alumnoId,
              estado: m.estado,
              marcadaAt: ahora,
              registradaPor: idActor(actor),
              motivo,
            });
          } else if (anterior === "PENDIENTE") {
            await tx
              .update(tallerAsistencias)
              .set({ estado: m.estado, marcadaAt: ahora, registradaPor: idActor(actor), motivo })
              .where(
                and(
                  eq(tallerAsistencias.sesionId, sesionId),
                  eq(tallerAsistencias.usuarioId, m.alumnoId),
                ),
              );
          } else {
            // Corregir o justificar: la hora original de la marca no se borra (§9 P4).
            await tx
              .update(tallerAsistencias)
              .set({
                estado: m.estado,
                motivo,
                actualizadaPor: idActor(actor),
                actualizadaAt: ahora,
              })
              .where(
                and(
                  eq(tallerAsistencias.sesionId, sesionId),
                  eq(tallerAsistencias.usuarioId, m.alumnoId),
                ),
              );
            const t = delGrupo.find((x) => x.alumnoId === m.alumnoId);
            cambios.push(`${t?.nombre ?? m.alumnoId}: ${anterior} → ${m.estado} (${motivo})`);
          }
        }
        if (input.grupoId)
          await tx
            .insert(asistenciaGrupos)
            .values({ sesionId, grupoHorarioId: input.grupoId, guardadoPor: idActor(actor) })
            .onConflictDoUpdate({
              target: [asistenciaGrupos.sesionId, asistenciaGrupos.grupoHorarioId],
              set: { guardadoPor: idActor(actor), guardadoAt: ahora },
            });

        // La sesión queda REALIZADA cuando no queda nadie pendiente (todos sus grupos guardados).
        const despues = await tx
          .select({ usuarioId: tallerAsistencias.usuarioId, estado: tallerAsistencias.estado })
          .from(tallerAsistencias)
          .where(eq(tallerAsistencias.sesionId, sesionId));
        const pendientes = tesistas.filter(
          (t) =>
            (despues.find((d) => d.usuarioId === t.alumnoId)?.estado ?? "PENDIENTE") ===
            "PENDIENTE",
        );
        if (pendientes.length === 0 && s.estado !== "REALIZADA") {
          const paso = assertTransicionSesion(s.estado, "REALIZADA");
          if (paso.ok)
            await tx
              .update(tallerSesiones)
              .set({ estado: "REALIZADA", updatedAt: ahora })
              .where(eq(tallerSesiones.id, sesionId));
        }

        // §5 Dos faltas seguidas en sesiones realizadas → alerta (P12) y aviso al alumno.
        const p = await leerParametrosTaller(tx);
        const sesiones = await tx
          .select({ id: tallerSesiones.id, estado: tallerSesiones.estado })
          .from(tallerSesiones)
          .where(eq(tallerSesiones.tallerId, s.tallerId))
          .orderBy(asc(tallerSesiones.fecha), asc(tallerSesiones.nro));
        const alertados: Tesista[] = [];
        for (const m of input.marcas.filter((x) => x.estado === "FALTA")) {
          const marcas = await tx
            .select({ sesionId: tallerAsistencias.sesionId, estado: tallerAsistencias.estado })
            .from(tallerAsistencias)
            .where(eq(tallerAsistencias.usuarioId, m.alumnoId));
          const registros: RegistroAsistenciaCurso[] = sesiones.map((x) => ({
            // La sesión que se está guardando ya cuenta como realizada para la racha.
            sesion: x.id === sesionId ? "REALIZADA" : x.estado,
            marca: marcas.find((y) => y.sesionId === x.id)?.estado ?? null,
          }));
          if (!alcanzaFaltasParaRetiro(registros, p)) continue;
          const t = delGrupo.find((x) => x.alumnoId === m.alumnoId);
          if (!t) continue;
          const [activa] = await tx
            .select({ id: alertasTaller.id })
            .from(alertasTaller)
            .where(
              and(
                eq(alertasTaller.alumnoId, m.alumnoId),
                eq(alertasTaller.tipo, "FALTAS_CONSECUTIVAS"),
                eq(alertasTaller.estado, "ACTIVA"),
              ),
            )
            .limit(1);
          if (!activa)
            await tx
              .insert(alertasTaller)
              .values({
                tipo: "FALTAS_CONSECUTIVAS",
                tallerId: s.tallerId,
                proyectoId: t.proyectoId,
                alumnoId: m.alumnoId,
                claveDedupe: `FALTAS:${m.alumnoId}:${sesionId}`,
                creadoPor: idActor(actor),
              })
              .onConflictDoNothing();
          alertados.push(t);
        }

        await appendAuditoriaTaller(tx, {
          tallerId: s.tallerId,
          actorId: idActor(actor),
          actorDni: actor.dni,
          accion: cambios.length ? "CORREGIR_ASISTENCIA" : "REGISTRAR_ASISTENCIA",
          detalle: `Sesión ${s.nro} (${s.fecha})${cambios.length ? `: ${cambios.join("; ")}` : ""}`,
        });
        return ok({ alertados, tallerId: s.tallerId });
      },
    );
    if (!r.ok) return r;
    for (const t of r.value.alertados)
      await enqueueCorreo({
        para: [t.email],
        aParticipantes: false,
        asunto: "Tienes dos faltas consecutivas en el Taller de Tesis",
        titulo: "Atención con tu asistencia",
        texto: `Hola ${t.nombre}: registras dos faltas consecutivas a las asesorías. Comunícate con la Unidad: dos inasistencias seguidas dan lugar al retiro del curso.`,
        enlace: urlPortal("/mi-taller"),
        textoEnlace: "Ver Mi Taller",
      });
    const dto = await asistenciaDeSesion(
      db,
      sesionId,
      r.value.alertados.map((t) => t.nombre),
    );
    return dto ? ok(dto) : noEncontrada();
  }
}

// ── Sesiones: agregar, reprogramar, cancelar ───────────────────────────

async function fechaOcupada(tx: DbExecutor, tallerId: string, fecha: string, excepto?: string) {
  const filas = await tx
    .select({ id: tallerSesiones.id })
    .from(tallerSesiones)
    .where(
      and(
        eq(tallerSesiones.tallerId, tallerId),
        eq(tallerSesiones.fecha, fecha),
        ne(tallerSesiones.estado, "CANCELADA"),
        ...(excepto ? [ne(tallerSesiones.id, excepto)] : []),
      ),
    )
    .limit(1);
  return filas.length > 0;
}

export class AgregarSesionUseCase {
  async execute(
    tallerId: string,
    input: { fecha: string; horaInicio: string; horaFin: string; motivo: string },
    actor: Actor,
  ): Promise<Result<true, ErrorSesion>> {
    const v = validarSesionNueva(input);
    if (!v.ok) return v;
    const r = await new DrizzleUnitOfWork(db).run(
      async (tx): Promise<Result<{ nro: number; tesistas: Tesista[] }, ErrorSesion>> => {
        if (await fechaOcupada(tx, tallerId, input.fecha))
          return fail(campo("DATOS_DUPLICADOS", "fecha", "Ya hay una sesión ese día"));
        const [m] = await tx
          .select({ n: max(tallerSesiones.nro) })
          .from(tallerSesiones)
          .where(eq(tallerSesiones.tallerId, tallerId));
        const nro = (m?.n ?? 0) + 1;
        const [s] = await tx
          .insert(tallerSesiones)
          .values({
            tallerId,
            nro,
            fecha: input.fecha,
            horaInicio: input.horaInicio,
            horaFin: input.horaFin,
            motivo: input.motivo.trim(),
          })
          .returning({ id: tallerSesiones.id });
        if (!s) return fail(new DomainError("VALIDACION_FALLIDA", "No se pudo agregar la sesión"));
        const tesistas = await tesistasActivos(tx, tallerId);
        if (tesistas.length)
          await tx
            .insert(tallerAsistencias)
            .values(tesistas.map((t) => ({ sesionId: s.id, usuarioId: t.alumnoId })))
            .onConflictDoNothing();
        await appendAuditoriaTaller(tx, {
          tallerId,
          actorId: idActor(actor),
          actorDni: actor.dni,
          accion: "AGREGAR_SESION",
          detalle: `Sesión ${nro} el ${input.fecha} ${input.horaInicio}–${input.horaFin}. Motivo: ${input.motivo.trim()}`,
        });
        return ok({ nro, tesistas });
      },
    );
    if (!r.ok) return r;
    await avisar(
      r.value.tesistas,
      tallerId,
      `Nueva sesión del taller: ${input.fecha}`,
      `Se agregó la sesión ${r.value.nro} el ${input.fecha} de ${input.horaInicio} a ${input.horaFin}. Motivo: ${input.motivo.trim()}.`,
    );
    return ok(true);
  }
}

export class ReprogramarSesionUseCase {
  async execute(
    sesionId: string,
    input: { fecha: string; horaInicio: string; horaFin: string; motivo: string },
    actor: Actor,
  ): Promise<Result<{ tallerId: string }, ErrorSesion>> {
    const v = validarSesionNueva(input);
    if (!v.ok) return v;
    const r = await new DrizzleUnitOfWork(db).run(
      async (
        tx,
      ): Promise<
        Result<{ tallerId: string; nro: number; antes: string; tesistas: Tesista[] }, ErrorSesion>
      > => {
        const [s] = await tx
          .select()
          .from(tallerSesiones)
          .where(eq(tallerSesiones.id, sesionId))
          .limit(1);
        if (!s) return noEncontrada();
        const paso = assertTransicionSesion(s.estado, "REPROGRAMADA");
        if (!paso.ok) return fail(paso.error);
        if (await fechaOcupada(tx, s.tallerId, input.fecha, sesionId))
          return fail(campo("DATOS_DUPLICADOS", "fecha", "Ya hay una sesión ese día"));
        await tx
          .update(tallerSesiones)
          .set({
            estado: "REPROGRAMADA",
            fechaOriginal: s.fechaOriginal ?? s.fecha,
            fecha: input.fecha,
            horaInicio: input.horaInicio,
            horaFin: input.horaFin,
            motivo: input.motivo.trim(),
            updatedAt: new Date(),
          })
          .where(eq(tallerSesiones.id, sesionId));
        await appendAuditoriaTaller(tx, {
          tallerId: s.tallerId,
          actorId: idActor(actor),
          actorDni: actor.dni,
          accion: "REPROGRAMAR_SESION",
          detalle: `Sesión ${s.nro}: ${s.fecha} → ${input.fecha} ${input.horaInicio}–${input.horaFin}. Motivo: ${input.motivo.trim()}`,
        });
        return ok({
          tallerId: s.tallerId,
          nro: s.nro,
          antes: s.fecha,
          tesistas: await tesistasActivos(tx, s.tallerId),
        });
      },
    );
    if (!r.ok) return r;
    await avisar(
      r.value.tesistas,
      r.value.tallerId,
      `Sesión ${r.value.nro} reprogramada`,
      `La sesión ${r.value.nro} del ${r.value.antes} pasa al ${input.fecha} de ${input.horaInicio} a ${input.horaFin}. Motivo: ${input.motivo.trim()}.`,
    );
    return ok({ tallerId: r.value.tallerId });
  }
}

export class CancelarSesionUseCase {
  async execute(
    sesionId: string,
    input: { motivo: string },
    actor: Actor,
  ): Promise<Result<{ tallerId: string }, ErrorSesion>> {
    if (input.motivo.trim().length < 3)
      return fail(campo("VALIDACION_FALLIDA", "motivo", "Escribe el motivo"));
    const r = await new DrizzleUnitOfWork(db).run(
      async (
        tx,
      ): Promise<
        Result<{ tallerId: string; nro: number; fecha: string; tesistas: Tesista[] }, ErrorSesion>
      > => {
        const [s] = await tx
          .select()
          .from(tallerSesiones)
          .where(eq(tallerSesiones.id, sesionId))
          .limit(1);
        if (!s) return noEncontrada();
        const paso = assertTransicionSesion(s.estado, "CANCELADA");
        if (!paso.ok) return fail(paso.error);
        const [marcada] = await tx
          .select({ id: tallerAsistencias.usuarioId })
          .from(tallerAsistencias)
          .where(
            and(
              eq(tallerAsistencias.sesionId, sesionId),
              ne(tallerAsistencias.estado, "PENDIENTE"),
            ),
          )
          .limit(1);
        if (marcada)
          return fail(
            new DomainError(
              "TRANSICION_INVALIDA",
              "La sesión ya tiene asistencia registrada: no se cancela",
            ),
          );
        await tx.delete(tallerAsistencias).where(eq(tallerAsistencias.sesionId, sesionId));
        await tx
          .update(tallerSesiones)
          .set({ estado: "CANCELADA", motivo: input.motivo.trim(), updatedAt: new Date() })
          .where(eq(tallerSesiones.id, sesionId));
        await appendAuditoriaTaller(tx, {
          tallerId: s.tallerId,
          actorId: idActor(actor),
          actorDni: actor.dni,
          accion: "CANCELAR_SESION",
          detalle: `Sesión ${s.nro} (${s.fecha}). Motivo: ${input.motivo.trim()}`,
        });
        return ok({
          tallerId: s.tallerId,
          nro: s.nro,
          fecha: s.fecha,
          tesistas: await tesistasActivos(tx, s.tallerId),
        });
      },
    );
    if (!r.ok) return r;
    await avisar(
      r.value.tesistas,
      r.value.tallerId,
      `Sesión ${r.value.nro} cancelada`,
      `La sesión ${r.value.nro} del ${r.value.fecha} se canceló. Motivo: ${input.motivo.trim()}.`,
    );
    return ok({ tallerId: r.value.tallerId });
  }
}

// ── Grupos de horario (P5) ─────────────────────────────────────────────

export class GuardarGrupoUseCase {
  /** Crea (grupoId null) o edita un grupo; los proyectos elegidos pasan a este grupo. */
  async execute(
    tallerId: string,
    grupoId: string | null,
    input: { nombre: string; horaInicio: string; horaFin: string; proyectoIds: string[] },
    actor: Actor,
  ): Promise<Result<true, ErrorSesion>> {
    const dias = await db
      .select({ horaInicio: tallerDias.horaInicio, horaFin: tallerDias.horaFin })
      .from(tallerDias)
      .where(eq(tallerDias.tallerId, tallerId));
    const v = validarGrupoHorario(input, dias);
    if (!v.ok) return v;
    return new DrizzleUnitOfWork(db).run(async (tx): Promise<Result<true, ErrorSesion>> => {
      const [mismo] = await tx
        .select({ id: gruposHorario.id })
        .from(gruposHorario)
        .where(
          and(
            eq(gruposHorario.tallerId, tallerId),
            eq(gruposHorario.nombre, v.value.nombre),
            ...(grupoId ? [ne(gruposHorario.id, grupoId)] : []),
          ),
        )
        .limit(1);
      if (mismo) return fail(campo("DATOS_DUPLICADOS", "nombre", "Ya hay un grupo con ese nombre"));
      if (input.proyectoIds.length) {
        const propios = await tx
          .select({ id: proyectosTaller.id })
          .from(proyectosTaller)
          .where(
            and(
              eq(proyectosTaller.tallerId, tallerId),
              inArray(proyectosTaller.id, input.proyectoIds),
            ),
          );
        if (propios.length !== new Set(input.proyectoIds).size)
          return fail(
            new DomainError("VALIDACION_FALLIDA", "Hay proyectos que no son de este taller"),
          );
      }
      let id = grupoId;
      if (id) {
        const r = await tx
          .update(gruposHorario)
          .set({ ...v.value, updatedAt: new Date() })
          .where(
            and(
              eq(gruposHorario.id, id),
              eq(gruposHorario.tallerId, tallerId),
              eq(gruposHorario.activo, true),
            ),
          )
          .returning({ id: gruposHorario.id });
        if (r.length === 0) return fail(new DomainError("NO_ENCONTRADO", "Grupo no encontrado"));
      } else {
        const [g] = await tx
          .insert(gruposHorario)
          .values({ tallerId, ...v.value, creadoPor: idActor(actor) })
          .returning({ id: gruposHorario.id });
        id = g?.id ?? null;
      }
      if (!id) return fail(new DomainError("VALIDACION_FALLIDA", "No se pudo guardar el grupo"));
      // Un proyecto pertenece a un solo grupo: los elegidos pasan aquí; los que salen quedan sin grupo.
      await tx
        .update(proyectosTaller)
        .set({ grupoHorarioId: null, updatedAt: new Date() })
        .where(and(eq(proyectosTaller.grupoHorarioId, id)));
      if (input.proyectoIds.length)
        await tx
          .update(proyectosTaller)
          .set({ grupoHorarioId: id, updatedAt: new Date() })
          .where(inArray(proyectosTaller.id, input.proyectoIds));
      await appendAuditoriaTaller(tx, {
        tallerId,
        actorId: idActor(actor),
        actorDni: actor.dni,
        accion: grupoId ? "EDITAR_GRUPO_HORARIO" : "CREAR_GRUPO_HORARIO",
        detalle: `${v.value.nombre} ${v.value.horaInicio}–${v.value.horaFin} con ${input.proyectoIds.length} proyectos`,
      });
      return ok(true);
    });
  }
}

export class EliminarGrupoUseCase {
  async execute(grupoId: string, actor: Actor): Promise<Result<{ tallerId: string }, ErrorSesion>> {
    return new DrizzleUnitOfWork(db).run(
      async (tx): Promise<Result<{ tallerId: string }, ErrorSesion>> => {
        const [g] = await tx
          .select()
          .from(gruposHorario)
          .where(and(eq(gruposHorario.id, grupoId), eq(gruposHorario.activo, true)))
          .limit(1);
        if (!g) return fail(new DomainError("NO_ENCONTRADO", "Grupo no encontrado"));
        const [conProyecto] = await tx
          .select({ id: proyectosTaller.id })
          .from(proyectosTaller)
          .where(eq(proyectosTaller.grupoHorarioId, grupoId))
          .limit(1);
        if (conProyecto)
          return fail(
            new DomainError(
              "REQUISITO_PENDIENTE",
              "El grupo tiene proyectos: muévelos a otro grupo primero",
            ),
          );
        await tx
          .update(gruposHorario)
          .set({ activo: false, updatedAt: new Date() })
          .where(eq(gruposHorario.id, grupoId));
        await appendAuditoriaTaller(tx, {
          tallerId: g.tallerId,
          actorId: idActor(actor),
          actorDni: actor.dni,
          accion: "ELIMINAR_GRUPO_HORARIO",
          detalle: g.nombre,
        });
        return ok({ tallerId: g.tallerId });
      },
    );
  }
}
