import type { ConfigTallerDTO } from "@pis/contracts";
import {
  type DbExecutor,
  db,
  especialidades,
  feriados,
  parametrosTaller,
  planInstitucional,
} from "@pis/db";
import {
  DomainError,
  fail,
  ok,
  type Result,
  validarFeriado,
  validarNombreEspecialidad,
  validarParametroTaller,
  validarSemanaPlan,
} from "@pis/domain";
import { and, eq, ne, sql } from "drizzle-orm";
import { DrizzleUnitOfWork } from "../../../infra/db/unit-of-work.js";
import { leerConfigTaller } from "../taller-config.repository.js";

/**
 * Casos de uso de P16 (Configuración del taller). Patrón: validar con el
 * dominio ANTES de tocar la BD (testeable sin BD) → UoW → devolver la
 * configuración completa. Nada se borra: se desactiva (§15).
 */

export interface Actor {
  id: string;
  dni: string;
}

type Salida = Promise<Result<ConfigTallerDTO, DomainError>>;

const duplicado = (m: string) => fail(new DomainError("DATOS_DUPLICADOS", m));
const noEncontrado = (m: string) => fail(new DomainError("NO_ENCONTRADO", m));

function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/** La configuración no pertenece a un expediente ni a un taller: log estructurado (como HU-0052). */
function registrar(actor: Actor, accion: string): void {
  console.log(JSON.stringify({ canal: "auditoria-config-taller", actor: actor.dni, accion }));
}

async function conConfig(
  actor: Actor,
  accion: string,
  fn: (tx: DbExecutor) => Promise<Result<true, DomainError>>,
): Salida {
  const r = await new DrizzleUnitOfWork(db).run(async (tx) => {
    const hecho = await fn(tx);
    if (!hecho.ok) return hecho;
    return ok(await leerConfigTaller(tx));
  });
  if (r.ok) registrar(actor, accion);
  return r;
}

/** El actor puede no existir en `usuarios` (stub de desarrollo): no se referencia un id vacío. */
function idActor(actor: Actor): string | null {
  return actor.id === "" ? null : actor.id;
}

// ── Feriados ───────────────────────────────────────────────────────────

async function feriadoEnFecha(tx: DbExecutor, fecha: string, exceptoId?: string) {
  const filas = await tx
    .select({ id: feriados.id })
    .from(feriados)
    .where(
      exceptoId
        ? and(eq(feriados.fecha, fecha), ne(feriados.id, exceptoId))
        : eq(feriados.fecha, fecha),
    )
    .limit(1);
  return filas[0] ?? null;
}

export class AgregarFeriadoUseCase {
  async execute(input: { fecha: string; nombre: string }, actor: Actor): Salida {
    const v = validarFeriado(input);
    if (!v.ok) return v;
    const { fecha, nombre } = v.value;
    return conConfig(actor, `agregar feriado ${fecha}`, async (tx) => {
      if (await feriadoEnFecha(tx, fecha))
        return duplicado(`Ya hay un feriado registrado el ${fechaCorta(fecha)}`);
      await tx.insert(feriados).values({ fecha, nombre, creadoPor: idActor(actor) });
      return ok(true);
    });
  }
}

export class EditarFeriadoUseCase {
  async execute(
    id: string,
    input: { fecha?: string; nombre?: string; activo?: boolean },
    actor: Actor,
  ): Salida {
    if (input.fecha === undefined && input.nombre === undefined && input.activo === undefined)
      return fail(new DomainError("VALIDACION_FALLIDA", "Nada que actualizar"));
    return conConfig(actor, `editar feriado ${id}`, async (tx) => {
      const filas = await tx.select().from(feriados).where(eq(feriados.id, id)).limit(1);
      const actual = filas[0];
      if (!actual) return noEncontrado("Feriado no encontrado");
      const v = validarFeriado({
        fecha: input.fecha ?? actual.fecha,
        nombre: input.nombre ?? actual.nombre,
      });
      if (!v.ok) return v;
      if (v.value.fecha !== actual.fecha && (await feriadoEnFecha(tx, v.value.fecha, id)))
        return duplicado(`Ya hay un feriado registrado el ${fechaCorta(v.value.fecha)}`);
      await tx
        .update(feriados)
        .set({
          fecha: v.value.fecha,
          nombre: v.value.nombre,
          ...(input.activo !== undefined ? { activo: input.activo } : {}),
          updatedAt: new Date(),
        })
        .where(eq(feriados.id, id));
      return ok(true);
    });
  }
}

// ── Plan institucional ─────────────────────────────────────────────────

export class EditarSemanaPlanUseCase {
  async execute(
    semana: number,
    input: { contenido: string; entregable: string | null },
    actor: Actor,
  ): Salida {
    const v = validarSemanaPlan({ semana, ...input });
    if (!v.ok) return v;
    return conConfig(actor, `editar plan institucional semana ${semana}`, async (tx) => {
      const r = await tx
        .update(planInstitucional)
        .set({
          contenido: v.value.contenido,
          entregable: v.value.entregable,
          updatedAt: new Date(),
        })
        .where(eq(planInstitucional.semana, semana))
        .returning({ semana: planInstitucional.semana });
      if (r.length === 0) return noEncontrado(`La semana ${semana} no existe en el plan`);
      return ok(true);
    });
  }
}

// ── Especialidades ─────────────────────────────────────────────────────

/** Mismo criterio que el índice único `lower(nombre)`: la comparación la hace Postgres. */
async function especialidadConNombre(tx: DbExecutor, nombre: string, exceptoId?: string) {
  const mismoNombre = sql`lower(${especialidades.nombre}) = lower(${nombre})`;
  const filas = await tx
    .select({ id: especialidades.id, nombre: especialidades.nombre })
    .from(especialidades)
    .where(exceptoId ? and(mismoNombre, ne(especialidades.id, exceptoId)) : mismoNombre)
    .limit(1);
  return filas[0] ?? null;
}

export class AgregarEspecialidadUseCase {
  async execute(input: { nombre: string }, actor: Actor): Salida {
    const v = validarNombreEspecialidad(input.nombre);
    if (!v.ok) return v;
    const nombre = v.value;
    return conConfig(actor, `agregar especialidad ${nombre}`, async (tx) => {
      const existente = await especialidadConNombre(tx, nombre);
      if (existente) return duplicado(`La especialidad "${existente.nombre}" ya existe`);
      await tx.insert(especialidades).values({ nombre, creadoPor: idActor(actor) });
      return ok(true);
    });
  }
}

export class EditarEspecialidadUseCase {
  async execute(id: string, input: { nombre?: string; activa?: boolean }, actor: Actor): Salida {
    if (input.nombre === undefined && input.activa === undefined)
      return fail(new DomainError("VALIDACION_FALLIDA", "Nada que actualizar"));
    let nombre: string | undefined;
    if (input.nombre !== undefined) {
      const v = validarNombreEspecialidad(input.nombre);
      if (!v.ok) return v;
      nombre = v.value;
    }
    return conConfig(actor, `editar especialidad ${id}`, async (tx) => {
      const filas = await tx
        .select({ id: especialidades.id })
        .from(especialidades)
        .where(eq(especialidades.id, id))
        .limit(1);
      if (!filas[0]) return noEncontrado("Especialidad no encontrada");
      if (nombre !== undefined) {
        const otra = await especialidadConNombre(tx, nombre, id);
        if (otra) return duplicado(`La especialidad "${otra.nombre}" ya existe`);
      }
      await tx
        .update(especialidades)
        .set({
          ...(nombre !== undefined ? { nombre } : {}),
          ...(input.activa !== undefined ? { activa: input.activa } : {}),
          updatedAt: new Date(),
        })
        .where(eq(especialidades.id, id));
      return ok(true);
    });
  }
}

// ── Parámetros ─────────────────────────────────────────────────────────

export class EditarParametroUseCase {
  async execute(clave: string, valor: number | boolean, actor: Actor): Salida {
    const v = validarParametroTaller(clave, valor);
    if (!v.ok) return v;
    return conConfig(actor, `parametro ${clave} = ${String(v.value)}`, async (tx) => {
      await tx
        .insert(parametrosTaller)
        .values({ clave, valor: v.value, actualizadoPor: idActor(actor) })
        .onConflictDoUpdate({
          target: parametrosTaller.clave,
          set: { valor: v.value, actualizadoPor: idActor(actor), updatedAt: new Date() },
        });
      return ok(true);
    });
  }
}
