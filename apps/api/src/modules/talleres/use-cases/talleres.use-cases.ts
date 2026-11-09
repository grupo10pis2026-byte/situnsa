import type { CalendarioPropuestoDTO, CrearTallerInput, DatosTallerInput } from "@pis/contracts";
import {
  type DbExecutor,
  db,
  pensionesTaller,
  planInstitucional,
  planTaller,
  proyectosTaller,
  proyectoTesistas,
  tallerAsistencias,
  tallerDias,
  talleres,
  tallerSesiones,
  usuarios,
} from "@pis/db";
import {
  type DatosTaller,
  DomainError,
  type ErrorCampo,
  ESTADOS_TALLER_VIGENTE,
  erroresTaller,
  esTallerVigente,
  estadoPorCupo,
  fail,
  fechaPensionPorDefecto,
  finSugerido,
  marcasHitoSemana,
  normalizarCalendario,
  ok,
  PENSIONES_TALLER,
  proponerSesiones,
  puedeCancelarTaller,
  puedeRecibirTaller,
  type Result,
  type SesionNumerada,
} from "@pis/domain";
import { and, asc, count, eq, inArray, ne, sql } from "drizzle-orm";
import { DrizzleUnitOfWork } from "../../../infra/db/unit-of-work.js";
import { enqueueCorreo } from "../../../infra/jobs/colas.js";
import { urlPortal } from "../../../infra/mail/correo.service.js";
import {
  feriadosActivos,
  leerParametrosTaller,
} from "../../taller-config/taller-config.repository.js";
import { appendAuditoriaTaller } from "../taller-auditoria.js";
import { detalleTaller, type TallerDetalle } from "../talleres.repository.js";

/**
 * P2/P3 del Taller (spec v1.0 §9): crear y editar el taller con su
 * calendario, 3 pensiones y copia del plan institucional; cambiar de asesor
 * y cancelar. Validan con el dominio antes de abrir la transacción y los
 * errores de formulario llevan el campo (`errores`), como pide §15.
 */

export interface Actor {
  id: string;
  dni: string;
}

export type ErrorTaller = DomainError & { errores?: ErrorCampo[] };

function errorCampos(errores: ErrorCampo[]): ErrorTaller {
  return Object.assign(new DomainError("VALIDACION_FALLIDA", errores[0]?.mensaje ?? ""), {
    errores,
  });
}

function errorCampo(code: DomainError["code"], campo: string, mensaje: string): ErrorTaller {
  return Object.assign(new DomainError(code, mensaje), { errores: [{ campo, mensaje }] });
}

function aDatosTaller(input: DatosTallerInput, proyectosAsignados?: number): DatosTaller {
  return {
    nombre: input.nombre,
    periodo: input.periodo,
    inicio: input.inicio,
    fin: input.fin,
    numeroSesiones: input.numeroSesiones,
    dias: input.dias,
    cupoProyectos: input.cupoProyectos,
    enlaceSabado: input.enlaceSabado ?? null,
    enlaceDomingo: input.enlaceDomingo ?? null,
    pensiones: input.pensiones,
    ...(proyectosAsignados !== undefined ? { proyectosAsignados } : {}),
  };
}

function limpiarEnlace(e: string | null | undefined): string | null {
  const v = (e ?? "").trim();
  return v === "" ? null : v;
}

/** Validación de formulario + calendario (sin BD). */
async function validarFormulario(
  input: DatosTallerInput,
  proyectosAsignados?: number,
): Promise<Result<SesionNumerada[], ErrorTaller>> {
  const errores = erroresTaller(aDatosTaller(input, proyectosAsignados));
  if (errores.length > 0) return fail(errorCampos(errores));
  const cal = normalizarCalendario(input.sesiones);
  if (!cal.ok) return fail(errorCampo("VALIDACION_FALLIDA", "calendario", cal.error.message));
  const p = await leerParametrosTaller();
  if (p.calendarioIncompletoBloquea && cal.value.length !== input.numeroSesiones)
    return fail(
      errorCampo(
        "VALIDACION_FALLIDA",
        "calendario",
        `El calendario tiene ${cal.value.length} sesiones y el taller ${input.numeroSesiones}`,
      ),
    );
  return ok(cal.value);
}

async function nombreRepetido(tx: DbExecutor, nombre: string, exceptoId?: string) {
  const mismo = sql`lower(${talleres.nombre}) = lower(${nombre})`;
  const [fila] = await tx
    .select({ id: talleres.id })
    .from(talleres)
    .where(exceptoId ? and(mismo, ne(talleres.id, exceptoId)) : mismo)
    .limit(1);
  return fila !== undefined;
}

/**
 * Asesor apto para recibir un taller (§3: un asesor, un taller vigente).
 * Bloquea su fila hasta el commit: dos altas simultáneas con el mismo
 * asesor no pueden dejarle dos talleres.
 */
async function asesorDisponible(
  tx: DbExecutor,
  asesorId: string,
  exceptoTallerId?: string,
): Promise<Result<{ email: string; nombre: string }, ErrorTaller>> {
  const [a] = await tx
    .select({
      email: usuarios.email,
      nombres: usuarios.nombres,
      apellidos: usuarios.apellidos,
      rol: usuarios.rol,
      activo: usuarios.activo,
    })
    .from(usuarios)
    .where(eq(usuarios.id, asesorId))
    .limit(1)
    .for("update");
  if (!a || a.rol !== "ASESOR")
    return fail(errorCampo("NO_ENCONTRADO", "asesorId", "El asesor elegido no existe"));
  const vigentes = await tx
    .select({ id: talleres.id, nombre: talleres.nombre })
    .from(talleres)
    .where(
      and(
        eq(talleres.asesorId, asesorId),
        inArray(talleres.estado, [...ESTADOS_TALLER_VIGENTE]),
        ...(exceptoTallerId ? [ne(talleres.id, exceptoTallerId)] : []),
      ),
    )
    .limit(1);
  const gate = puedeRecibirTaller({ activo: a.activo, tallerVigente: vigentes[0] ?? null });
  if (!gate.ok) {
    const motivo = vigentes[0]
      ? `El asesor ya tiene un taller activo (${vigentes[0].nombre})`
      : gate.error.message;
    return fail(errorCampo("REQUISITO_PENDIENTE", "asesorId", motivo));
  }
  return ok({ email: a.email, nombre: `${a.nombres} ${a.apellidos}` });
}

async function guardarDias(tx: DbExecutor, tallerId: string, input: DatosTallerInput) {
  await tx.delete(tallerDias).where(eq(tallerDias.tallerId, tallerId));
  await tx
    .insert(tallerDias)
    .values(input.dias.map((d) => ({ tallerId, ...d })))
    .onConflictDoNothing();
}

async function guardarSesiones(tx: DbExecutor, tallerId: string, sesiones: SesionNumerada[]) {
  await tx.insert(tallerSesiones).values(sesiones.map((s) => ({ tallerId, ...s })));
}

/** Asistencia PENDIENTE de los tesistas activos en las sesiones por dictar. */
async function asistenciaPendienteDelTaller(tx: DbExecutor, tallerId: string) {
  const alumnos = await tx
    .select({ id: proyectoTesistas.alumnoId })
    .from(proyectoTesistas)
    .innerJoin(proyectosTaller, eq(proyectosTaller.id, proyectoTesistas.proyectoId))
    .where(
      and(
        eq(proyectosTaller.tallerId, tallerId),
        inArray(proyectoTesistas.estado, ["EN_TALLER", "PLAN_APROBADO"]),
      ),
    );
  const sesiones = await tx
    .select({ id: tallerSesiones.id })
    .from(tallerSesiones)
    .where(
      and(
        eq(tallerSesiones.tallerId, tallerId),
        inArray(tallerSesiones.estado, ["PROGRAMADA", "REPROGRAMADA"]),
      ),
    );
  if (alumnos.length === 0 || sesiones.length === 0) return;
  await tx
    .insert(tallerAsistencias)
    .values(sesiones.flatMap((s) => alumnos.map((a) => ({ sesionId: s.id, usuarioId: a.id }))))
    .onConflictDoNothing();
}

function filasPensiones(tallerId: string, input: DatosTallerInput, creadoPor: string | null) {
  const fechas = [null, input.pensiones.fecha2, input.pensiones.fecha3];
  return PENSIONES_TALLER.map((p, i) => ({
    tallerId,
    numero: p.numero,
    semana: p.semana,
    fecha: fechas[i] ?? null,
    monto: input.pensiones.montos[i] ?? 0,
    creadoPor,
  }));
}

/** §3: al crear el taller se copia el plan institucional vigente (las marcas de hito, del dominio). */
async function copiarPlan(tx: DbExecutor, tallerId: string, creadoPor: string | null) {
  const semanas = await tx.select().from(planInstitucional).orderBy(asc(planInstitucional.semana));
  if (semanas.length === 0) return 0;
  await tx.insert(planTaller).values(
    semanas.map((s) => {
      const m = marcasHitoSemana(s.semana);
      return {
        tallerId,
        semana: s.semana,
        contenido: s.contenido,
        entregable: s.entregable,
        indicaciones: null,
        esHito: m.esHito,
        fijo: m.fijo,
        creadoPor,
      };
    }),
  );
  return semanas.length;
}

function idActor(actor: Actor): string | null {
  return actor.id === "" ? null : actor.id;
}

// ── P2 calendario propuesto ────────────────────────────────────────────

export async function proponerCalendario(input: {
  inicio: string;
  fin: string;
  dias: Array<{ dia: number; horaInicio: string; horaFin: string }>;
  numeroSesiones: number;
}): Promise<Result<CalendarioPropuestoDTO, DomainError>> {
  const feriados = await feriadosActivos(input.inicio, input.fin);
  const r = proponerSesiones({ ...input, feriados, objetivo: input.numeroSesiones });
  if (!r.ok) return r;
  const p = await leerParametrosTaller();
  return ok({
    sesiones: r.value.sesiones,
    omitidas: r.value.omitidas,
    contador: r.value.contador,
    coincide: r.value.coincide,
    bloquea: p.calendarioIncompletoBloquea && !r.value.coincide,
    finSugerido: finSugerido(input.inicio),
    pensionesSugeridas: {
      fecha2: fechaPensionPorDefecto(input.inicio, 4),
      fecha3: fechaPensionPorDefecto(input.inicio, 8),
    },
    feriados: [...feriados].map(([fecha, nombre]) => ({ fecha, nombre })),
  });
}

// ── P2 Nuevo taller ────────────────────────────────────────────────────

export class CrearTallerUseCase {
  async execute(
    input: CrearTallerInput,
    actor: Actor,
  ): Promise<Result<TallerDetalle, ErrorTaller>> {
    const cal = await validarFormulario(input);
    if (!cal.ok) return cal;
    const nombre = input.nombre.trim().replace(/\s+/g, " ");
    const r = await new DrizzleUnitOfWork(db).run(
      async (tx): Promise<Result<{ id: string; asesor: { email: string } }, ErrorTaller>> => {
        if (await nombreRepetido(tx, nombre))
          return fail(
            errorCampo("DATOS_DUPLICADOS", "nombre", `Ya existe un taller llamado «${nombre}»`),
          );
        const asesor = await asesorDisponible(tx, input.asesorId);
        if (!asesor.ok) return asesor;
        const [t] = await tx
          .insert(talleres)
          .values({
            nombre,
            periodo: input.periodo.trim(),
            asesorId: input.asesorId,
            estado: "ABIERTO_INSCRIPCIONES",
            fechaInicio: input.inicio,
            fechaFin: input.fin,
            numeroSesiones: input.numeroSesiones,
            cupoProyectos: input.cupoProyectos,
            enlaceSabado: limpiarEnlace(input.enlaceSabado),
            enlaceDomingo: limpiarEnlace(input.enlaceDomingo),
            creadoPor: idActor(actor),
          })
          .returning({ id: talleres.id });
        if (!t) return fail(new DomainError("VALIDACION_FALLIDA", "No se pudo crear el taller"));
        await guardarDias(tx, t.id, input);
        await guardarSesiones(tx, t.id, cal.value);
        await tx.insert(pensionesTaller).values(filasPensiones(t.id, input, idActor(actor)));
        const semanas = await copiarPlan(tx, t.id, idActor(actor));
        await appendAuditoriaTaller(tx, {
          tallerId: t.id,
          actorId: idActor(actor),
          actorDni: actor.dni,
          accion: "CREAR_TALLER",
          detalle: `Taller «${nombre}» con ${cal.value.length} sesiones, 3 pensiones y plan de ${semanas} semanas`,
        });
        return ok({ id: t.id, asesor: asesor.value });
      },
    );
    if (!r.ok) return r;
    await enqueueCorreo({
      para: [r.value.asesor.email],
      aParticipantes: false,
      asunto: `Te asignaron el ${nombre}`,
      titulo: "Nuevo taller a tu cargo",
      texto: `La Secretaría del Taller de Tesis te asignó el ${nombre} (${input.periodo}), del ${input.inicio} al ${input.fin}. Desde Mi Taller verás tus sesiones y tus alumnos.`,
      enlace: urlPortal("/mis-talleres"),
      textoEnlace: "Ir a Mi Taller",
    });
    const d = await detalleTaller(db, r.value.id);
    return d ? ok(d) : fail(new DomainError("NO_ENCONTRADO", "Taller no encontrado"));
  }
}

// ── P2 Editar taller ───────────────────────────────────────────────────

function mismoCalendario(
  actual: Array<{ fecha: string; horaInicio: string; horaFin: string }>,
  nuevo: SesionNumerada[],
): boolean {
  if (actual.length !== nuevo.length) return false;
  const a = [...actual].sort((x, y) => x.fecha.localeCompare(y.fecha));
  return a.every(
    (s, i) =>
      s.fecha === nuevo[i]?.fecha &&
      s.horaInicio === nuevo[i]?.horaInicio &&
      s.horaFin === nuevo[i]?.horaFin,
  );
}

export class EditarTallerUseCase {
  async execute(
    id: string,
    input: DatosTallerInput,
    actor: Actor,
  ): Promise<Result<TallerDetalle, ErrorTaller>> {
    const actual = await detalleTaller(db, id);
    if (!actual) return fail(new DomainError("NO_ENCONTRADO", "Taller no encontrado"));
    if (!esTallerVigente(actual.estado))
      return fail(
        new DomainError("TRANSICION_INVALIDA", "Un taller finalizado o cancelado no se edita"),
      );
    const cal = await validarFormulario(input, actual.proyectos);
    if (!cal.ok) return cal;
    const nombre = input.nombre.trim().replace(/\s+/g, " ");

    const r = await new DrizzleUnitOfWork(db).run(
      async (tx): Promise<Result<TallerDetalle, ErrorTaller>> => {
        const d = await detalleTaller(tx, id);
        if (!d) return fail(new DomainError("NO_ENCONTRADO", "Taller no encontrado"));
        if (await nombreRepetido(tx, nombre, id))
          return fail(
            errorCampo("DATOS_DUPLICADOS", "nombre", `Ya existe un taller llamado «${nombre}»`),
          );
        const cambiaCalendario = !mismoCalendario(d.calendario, cal.value);
        const cambianFechas =
          d.fechaInicio !== input.inicio ||
          d.fechaFin !== input.fin ||
          JSON.stringify(d.dias) !==
            JSON.stringify([...input.dias].sort((a, b) => a.dia - b.dia)) ||
          cambiaCalendario;
        if (cambianFechas && !d.fechasEditables)
          return fail(
            errorCampo(
              "TRANSICION_INVALIDA",
              "calendario",
              "El taller ya tiene sesiones realizadas: el inicio, el fin, los días y el calendario no se cambian",
            ),
          );
        if (cambiaCalendario) {
          const ids = (
            await tx
              .select({ id: tallerSesiones.id })
              .from(tallerSesiones)
              .where(eq(tallerSesiones.tallerId, id))
          ).map((s) => s.id);
          if (ids.length > 0) {
            const [marcas] = await tx
              .select({ n: count() })
              .from(tallerAsistencias)
              .where(
                and(
                  inArray(tallerAsistencias.sesionId, ids),
                  ne(tallerAsistencias.estado, "PENDIENTE"),
                ),
              );
            if (Number(marcas?.n ?? 0) > 0)
              return fail(
                errorCampo(
                  "TRANSICION_INVALIDA",
                  "calendario",
                  "Hay asistencia registrada en las sesiones: ajusta el calendario sesión por sesión",
                ),
              );
            // Solo hay asistencia PENDIENTE (sin historial): se rehace con el calendario.
            await tx.delete(tallerAsistencias).where(inArray(tallerAsistencias.sesionId, ids));
            await tx.delete(tallerSesiones).where(eq(tallerSesiones.tallerId, id));
          }
          await guardarSesiones(tx, id, cal.value);
          await asistenciaPendienteDelTaller(tx, id);
        }
        await tx
          .update(talleres)
          .set({
            nombre,
            periodo: input.periodo.trim(),
            fechaInicio: input.inicio,
            fechaFin: input.fin,
            numeroSesiones: input.numeroSesiones,
            cupoProyectos: input.cupoProyectos,
            enlaceSabado: limpiarEnlace(input.enlaceSabado),
            enlaceDomingo: limpiarEnlace(input.enlaceDomingo),
            estado: estadoPorCupo(d.estado, d.proyectos, input.cupoProyectos),
            updatedAt: new Date(),
          })
          .where(eq(talleres.id, id));
        await guardarDias(tx, id, input);
        // §9 P3: un cambio de fechas o montos afecta solo a las pensiones no pagadas
        // (el monto pagado queda en la pensión del alumno; corte 3.8).
        for (const fila of filasPensiones(id, input, idActor(actor))) {
          await tx
            .update(pensionesTaller)
            .set({ fecha: fila.fecha, monto: fila.monto, updatedAt: new Date() })
            .where(and(eq(pensionesTaller.tallerId, id), eq(pensionesTaller.numero, fila.numero)));
        }
        await appendAuditoriaTaller(tx, {
          tallerId: id,
          actorId: idActor(actor),
          actorDni: actor.dni,
          accion: "EDITAR_TALLER",
          detalle: cambiaCalendario
            ? `Datos y calendario (${cal.value.length} sesiones)`
            : "Datos del taller",
        });
        const nuevo = await detalleTaller(tx, id);
        return nuevo ? ok(nuevo) : fail(new DomainError("NO_ENCONTRADO", "Taller no encontrado"));
      },
    );
    return r;
  }
}

// ── P3 Cambiar asesor ──────────────────────────────────────────────────

export class CambiarAsesorUseCase {
  async execute(
    id: string,
    input: { asesorId: string; motivo: string },
    actor: Actor,
  ): Promise<Result<TallerDetalle, ErrorTaller>> {
    const motivo = input.motivo.trim();
    if (motivo.length < 5)
      return fail(errorCampo("VALIDACION_FALLIDA", "motivo", "Escribe el motivo del cambio"));
    const r = await new DrizzleUnitOfWork(db).run(
      async (tx): Promise<Result<{ detalle: TallerDetalle; email: string }, ErrorTaller>> => {
        const d = await detalleTaller(tx, id);
        if (!d) return fail(new DomainError("NO_ENCONTRADO", "Taller no encontrado"));
        if (!esTallerVigente(d.estado))
          return fail(
            new DomainError("TRANSICION_INVALIDA", "Solo un taller vigente cambia de asesor"),
          );
        if (d.asesorId === input.asesorId)
          return fail(
            errorCampo("VALIDACION_FALLIDA", "asesorId", "Ese asesor ya está a cargo del taller"),
          );
        const nuevo = await asesorDisponible(tx, input.asesorId, id);
        if (!nuevo.ok) return nuevo;
        await tx
          .update(talleres)
          .set({ asesorId: input.asesorId, updatedAt: new Date() })
          .where(eq(talleres.id, id));
        await appendAuditoriaTaller(tx, {
          tallerId: id,
          actorId: idActor(actor),
          actorDni: actor.dni,
          accion: "CAMBIAR_ASESOR",
          detalle: `De ${d.asesorNombre ?? "sin asesor"} a ${nuevo.value.nombre}. Motivo: ${motivo}`,
        });
        const actualizado = await detalleTaller(tx, id);
        if (!actualizado) return fail(new DomainError("NO_ENCONTRADO", "Taller no encontrado"));
        return ok({ detalle: actualizado, email: nuevo.value.email });
      },
    );
    if (!r.ok) return r;
    await enqueueCorreo({
      para: [r.value.email],
      aParticipantes: false,
      asunto: `Te asignaron el ${r.value.detalle.nombre}`,
      titulo: "Nuevo taller a tu cargo",
      texto: `La Secretaría del Taller de Tesis te asignó el ${r.value.detalle.nombre}. Lo registrado hasta hoy (sesiones, asistencia y avances) se conserva.`,
      enlace: urlPortal("/mis-talleres"),
      textoEnlace: "Ir a Mi Taller",
    });
    return ok(r.value.detalle);
  }
}

// ── P1/P3 Cancelar ─────────────────────────────────────────────────────

export class CancelarTallerUseCase {
  async execute(
    id: string,
    input: { motivo: string },
    actor: Actor,
  ): Promise<Result<TallerDetalle, ErrorTaller>> {
    return new DrizzleUnitOfWork(db).run(
      async (tx): Promise<Result<TallerDetalle, ErrorTaller>> => {
        const d = await detalleTaller(tx, id);
        if (!d) return fail(new DomainError("NO_ENCONTRADO", "Taller no encontrado"));
        const gate = puedeCancelarTaller(d.estado, d.sesiones.realizadas, input.motivo);
        if (!gate.ok) return fail(errorCampo(gate.error.code, "motivo", gate.error.message));
        const motivo = input.motivo.trim();
        await tx
          .update(talleres)
          .set({ estado: "CANCELADO", motivoCancelacion: motivo, updatedAt: new Date() })
          .where(eq(talleres.id, id));
        await tx
          .update(tallerSesiones)
          .set({ estado: "CANCELADA", motivo: "Taller cancelado", updatedAt: new Date() })
          .where(
            and(
              eq(tallerSesiones.tallerId, id),
              inArray(tallerSesiones.estado, ["PROGRAMADA", "REPROGRAMADA"]),
            ),
          );
        await appendAuditoriaTaller(tx, {
          tallerId: id,
          actorId: idActor(actor),
          actorDni: actor.dni,
          accion: "CANCELAR_TALLER",
          detalle: `Motivo: ${motivo}`,
        });
        const actualizado = await detalleTaller(tx, id);
        return actualizado
          ? ok(actualizado)
          : fail(new DomainError("NO_ENCONTRADO", "Taller no encontrado"));
      },
    );
  }
}
