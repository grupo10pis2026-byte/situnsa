import type {
  EntregasProyectoDTO,
  HitoCeldaDTO,
  HitoDetalleDTO,
  MatrizHitosDTO,
  PlanTallerDTO,
} from "@pis/contracts";
import {
  type DbExecutor,
  entregasHito,
  expedientes,
  fichaRegistros,
  hitosProyecto,
  planTaller,
  proyectosTaller,
  proyectoTesistas,
  talleres,
  usuarios,
} from "@pis/db";
import {
  esTallerVigente,
  FORMATOS_ENTREGA,
  fechaHito,
  HITOS_TALLER,
  hitoVencido,
  type ParametrosTaller,
  puedeSubirEntrega,
  resumenFicha,
  sabadoDeSemana,
  type TipoHito,
} from "@pis/domain";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

/** Lecturas de P6, P6b y P7: plan del taller, matriz de hitos y versiones. */

const NOMBRE_HITO = new Map<TipoHito, string>(HITOS_TALLER.map((h) => [h.tipo, h.nombre]));
const FIJO_HITO = new Map<TipoHito, boolean>(HITOS_TALLER.map((h) => [h.tipo, h.fijo]));
const ORDEN_HITO = new Map<TipoHito, number>(HITOS_TALLER.map((h, i) => [h.tipo, i]));

export function nombreHito(tipo: TipoHito): string {
  return NOMBRE_HITO.get(tipo) ?? tipo;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export async function planDelTaller(
  tx: DbExecutor,
  tallerId: string,
  editable: boolean,
): Promise<PlanTallerDTO | null> {
  const [t] = await tx
    .select({ id: talleres.id, inicio: talleres.fechaInicio })
    .from(talleres)
    .where(eq(talleres.id, tallerId))
    .limit(1);
  if (!t) return null;
  const filas = await tx
    .select()
    .from(planTaller)
    .where(eq(planTaller.tallerId, tallerId))
    .orderBy(asc(planTaller.semana));
  const inicio = t.inicio ?? new Date().toISOString().slice(0, 10);
  return {
    tallerId,
    editable,
    semanas: filas.map((f) => {
      const h = HITOS_TALLER.find((x) => x.semana === f.semana);
      return {
        semana: f.semana,
        fecha: sabadoDeSemana(inicio, f.semana),
        contenido: f.contenido,
        entregable: f.entregable,
        indicaciones: f.indicaciones,
        esHito: f.esHito,
        fijo: f.fijo,
        hito: h
          ? { tipo: h.tipo, nombre: h.nombre, fechaLimite: fechaHito(inicio, h.semana) }
          : null,
      };
    }),
  };
}

type FilaHito = typeof hitosProyecto.$inferSelect;
type FilaEntrega = typeof entregasHito.$inferSelect;

function celda(h: FilaHito, versiones: FilaEntrega[], hoy: string): HitoCeldaDTO {
  const ultima = versiones[0] ?? null;
  return {
    id: h.id,
    tipo: h.tipo,
    nombre: nombreHito(h.tipo),
    semana: h.semana,
    fechaLimite: h.fechaLimite,
    estado: h.estado,
    fijo: FIJO_HITO.get(h.tipo) ?? false,
    versiones: versiones.length,
    ultimaVersion: ultima
      ? {
          id: ultima.id,
          version: ultima.version,
          estado: ultima.estado,
          entregadaAt: ultima.entregadaAt.toISOString(),
        }
      : null,
    vencido: hitoVencido(h.estado, h.fechaLimite, hoy),
  };
}

async function hitosYVersiones(tx: DbExecutor, proyectoIds: string[]) {
  if (proyectoIds.length === 0) return { hitos: [] as FilaHito[], versiones: [] as FilaEntrega[] };
  const hitos = await tx
    .select()
    .from(hitosProyecto)
    .where(inArray(hitosProyecto.proyectoId, proyectoIds));
  hitos.sort((a, b) => (ORDEN_HITO.get(a.tipo) ?? 0) - (ORDEN_HITO.get(b.tipo) ?? 0));
  const versiones =
    hitos.length === 0
      ? []
      : await tx
          .select()
          .from(entregasHito)
          .where(
            inArray(
              entregasHito.hitoId,
              hitos.map((h) => h.id),
            ),
          )
          .orderBy(desc(entregasHito.version));
  return { hitos, versiones };
}

async function nombresTesistas(tx: DbExecutor, proyectoIds: string[]) {
  if (proyectoIds.length === 0) return [];
  return tx
    .select({
      proyectoId: proyectoTesistas.proyectoId,
      alumnoId: proyectoTesistas.alumnoId,
      estado: proyectoTesistas.estado,
      dni: usuarios.dni,
      email: usuarios.email,
      nombre: usuarios.nombres,
      apellidos: usuarios.apellidos,
    })
    .from(proyectoTesistas)
    .innerJoin(usuarios, eq(usuarios.id, proyectoTesistas.alumnoId))
    .where(inArray(proyectoTesistas.proyectoId, proyectoIds))
    .orderBy(asc(proyectoTesistas.orden));
}

export async function matrizHitos(
  tx: DbExecutor,
  tallerId: string,
  puedeGestionar: boolean,
  hoy: string,
): Promise<MatrizHitosDTO | null> {
  const [t] = await tx
    .select({ inicio: talleres.fechaInicio })
    .from(talleres)
    .where(eq(talleres.id, tallerId))
    .limit(1);
  if (!t) return null;
  const proyectos = await tx
    .select({
      id: proyectosTaller.id,
      codigo: proyectosTaller.codigo,
      titulo: proyectosTaller.titulo,
      expedienteCodigo: expedientes.codigo,
    })
    .from(proyectosTaller)
    .leftJoin(expedientes, eq(expedientes.id, proyectosTaller.expedienteId))
    .where(eq(proyectosTaller.tallerId, tallerId))
    .orderBy(asc(proyectosTaller.codigo));
  const ids = proyectos.map((p) => p.id);
  const { hitos, versiones } = await hitosYVersiones(tx, ids);
  const tesistas = await nombresTesistas(tx, ids);
  const inicio = t.inicio ?? hoy;
  return {
    tallerId,
    puedeGestionar,
    hitos: HITOS_TALLER.map((h) => ({
      tipo: h.tipo,
      nombre: h.nombre,
      semana: h.semana,
      fechaLimite: fechaHito(inicio, h.semana),
      fijo: h.fijo,
    })),
    proyectos: proyectos.map((p) => ({
      id: p.id,
      codigo: p.codigo,
      titulo: p.titulo,
      expedienteCodigo: p.expedienteCodigo,
      tesistas: tesistas
        .filter((x) => x.proyectoId === p.id)
        .map((x) => `${x.nombre} ${x.apellidos}${x.estado === "RETIRADO" ? " (retirado)" : ""}`),
      hitos: hitos
        .filter((h) => h.proyectoId === p.id)
        .map((h) =>
          celda(
            h,
            versiones.filter((v) => v.hitoId === h.id),
            hoy,
          ),
        ),
    })),
  };
}

export interface CapacidadesProyecto {
  subir: boolean;
  revisar: boolean;
  gestionar: boolean;
}

export async function fichaCompletaDe(tx: DbExecutor, proyectoId: string): Promise<boolean> {
  const filas = await tx
    .select({ semana: fichaRegistros.semana, estado: fichaRegistros.estado })
    .from(fichaRegistros)
    .where(eq(fichaRegistros.proyectoId, proyectoId));
  return resumenFicha(filas).completa;
}

export async function entregasDeProyecto(
  tx: DbExecutor,
  proyectoId: string,
  capacidades: CapacidadesProyecto,
  parametros: ParametrosTaller,
  hoy: string,
): Promise<EntregasProyectoDTO | null> {
  const asesor = alias(usuarios, "asesor");
  const [p] = await tx
    .select({
      id: proyectosTaller.id,
      codigo: proyectosTaller.codigo,
      titulo: proyectosTaller.titulo,
      programa: proyectosTaller.programa,
      modalidad: proyectosTaller.modalidad,
      tallerId: talleres.id,
      tallerNombre: talleres.nombre,
      tallerEstado: talleres.estado,
      asesorNombres: asesor.nombres,
      asesorApellidos: asesor.apellidos,
      expedienteId: proyectosTaller.expedienteId,
      expedienteCodigo: expedientes.codigo,
    })
    .from(proyectosTaller)
    .innerJoin(talleres, eq(talleres.id, proyectosTaller.tallerId))
    .leftJoin(asesor, eq(asesor.id, talleres.asesorId))
    .leftJoin(expedientes, eq(expedientes.id, proyectosTaller.expedienteId))
    .where(eq(proyectosTaller.id, proyectoId))
    .limit(1);
  if (!p) return null;
  const tesistas = await nombresTesistas(tx, [proyectoId]);
  const { hitos, versiones } = await hitosYVersiones(tx, [proyectoId]);
  const fichaCompleta = await fichaCompletaDe(tx, proyectoId);
  const autores = versiones.length
    ? await tx
        .select({ id: usuarios.id, nombres: usuarios.nombres, apellidos: usuarios.apellidos })
        .from(usuarios)
        .where(
          inArray(usuarios.id, [
            ...new Set(
              versiones.flatMap((v) => [v.entregadaPor, ...(v.revisadaPor ? [v.revisadaPor] : [])]),
            ),
          ]),
        )
    : [];
  const nombre = (id: string | null) => {
    const u = autores.find((a) => a.id === id);
    return u ? `${u.nombres} ${u.apellidos}` : null;
  };
  const todosRetirados = tesistas.length > 0 && tesistas.every((t) => t.estado === "RETIRADO");
  const vigente = esTallerVigente(p.tallerEstado);

  const detalle: HitoDetalleDTO[] = hitos.map((h) => {
    const propias = versiones.filter((v) => v.hitoId === h.id);
    const gate = puedeSubirEntrega(
      {
        tipo: h.tipo,
        estado: h.estado,
        fechaLimite: h.fechaLimite,
        hoy,
        fichaCompletaYFirmada: fichaCompleta,
        tesistaRetirado: todosRetirados,
      },
      parametros,
    );
    return {
      ...celda(h, propias, hoy),
      versionesDetalle: propias.map((v) => ({
        id: v.id,
        version: v.version,
        nombreArchivo: v.nombreOriginal,
        bytes: v.bytes,
        comentario: v.comentario,
        entregadaPor: nombre(v.entregadaPor) ?? "—",
        entregadaAt: v.entregadaAt.toISOString(),
        estado: v.estado,
        observaciones: v.observaciones,
        revisadaPor: nombre(v.revisadaPor),
        revisadaAt: iso(v.revisadaAt),
      })),
      motivoNoSubir: !vigente ? "El taller no está en curso" : gate.ok ? null : gate.error.message,
    };
  });

  return {
    proyecto: {
      id: p.id,
      codigo: p.codigo,
      titulo: p.titulo,
      programa: p.programa,
      modalidad: p.modalidad,
      tallerId: p.tallerId,
      tallerNombre: p.tallerNombre,
      asesor: p.asesorNombres ? `${p.asesorNombres} ${p.asesorApellidos}` : null,
      expedienteId: p.expedienteId,
      expedienteCodigo: p.expedienteCodigo,
      tesistas: tesistas.map((t) => ({
        alumnoId: t.alumnoId,
        dni: t.dni,
        nombre: `${t.nombre} ${t.apellidos}`,
        estado: t.estado,
      })),
    },
    hitos: detalle,
    fichaCompleta,
    capacidades,
    formatos: [...FORMATOS_ENTREGA],
    maxMb: parametros.maxMbEntrega,
  };
}

export async function hitoConProyecto(tx: DbExecutor, hitoId: string) {
  const [h] = await tx
    .select({ hito: hitosProyecto, tallerId: proyectosTaller.tallerId })
    .from(hitosProyecto)
    .innerJoin(proyectosTaller, eq(proyectosTaller.id, hitosProyecto.proyectoId))
    .where(eq(hitosProyecto.id, hitoId))
    .limit(1);
  return h ?? null;
}

export async function entregaConHito(tx: DbExecutor, entregaId: string) {
  const [e] = await tx
    .select({ entrega: entregasHito, hito: hitosProyecto })
    .from(entregasHito)
    .innerJoin(hitosProyecto, eq(hitosProyecto.id, entregasHito.hitoId))
    .where(eq(entregasHito.id, entregaId))
    .limit(1);
  return e ?? null;
}

/** Última versión de un hito en cada proyecto del taller (para el ZIP). */
export async function ultimasVersionesDelTaller(tx: DbExecutor, tallerId: string, tipo: TipoHito) {
  const filas = await tx
    .select({
      codigo: proyectosTaller.codigo,
      version: entregasHito.version,
      ruta: entregasHito.ruta,
      nombre: entregasHito.nombreOriginal,
      hitoId: hitosProyecto.id,
    })
    .from(entregasHito)
    .innerJoin(hitosProyecto, eq(hitosProyecto.id, entregasHito.hitoId))
    .innerJoin(proyectosTaller, eq(proyectosTaller.id, hitosProyecto.proyectoId))
    .where(and(eq(proyectosTaller.tallerId, tallerId), eq(hitosProyecto.tipo, tipo)))
    .orderBy(asc(proyectosTaller.codigo), desc(entregasHito.version));
  const vistos = new Set<string>();
  return filas.filter((f) => {
    if (vistos.has(f.hitoId)) return false;
    vistos.add(f.hitoId);
    return true;
  });
}
