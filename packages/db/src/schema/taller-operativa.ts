import {
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import {
  estadoAsistenciaEnum,
  estadoCumplimientoEnum,
  estadoEntregaEnum,
  estadoSesionEnum,
} from "./enums.js";
import { talleres } from "./talleres.js";
import { usuarios } from "./usuarios.js";

/**
 * Taller operativo P4–P7 (RF-0202 a RF-0210):
 * sesiones y asistencia a nivel taller (decisión Q8), fases por asesor con
 * cumplimiento por alumno (Q3), avances con entregas versionadas y pases.
 * Sin borrado físico: se cancela o revierte con motivo (historial).
 */

export const tallerSesiones = pgTable(
  "taller_sesiones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tallerId: uuid("taller_id")
      .notNull()
      .references(() => talleres.id),
    nro: integer("nro").notNull(),
    fecha: date("fecha").notNull(),
    horaInicio: varchar("hora_inicio", { length: 5 }).notNull(),
    horaFin: varchar("hora_fin", { length: 5 }).notNull(),
    /** TEMPORAL (hasta el corte 3.5): ver nota en `talleres.estado`. */
    estado: estadoSesionEnum("estado")
      .$type<"PROGRAMADA" | "ABIERTA" | "REALIZADA" | "CANCELADA">()
      .notNull()
      .default("PROGRAMADA"),
    motivo: text("motivo"),
    /** v1.0 D2: fecha antes de reprogramar (la primera vez; no se pisa). */
    fechaOriginal: date("fecha_original"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("taller_sesiones_taller_nro_uq").on(t.tallerId, t.nro)],
);

export const tallerAsistencias = pgTable(
  "taller_asistencias",
  {
    sesionId: uuid("sesion_id")
      .notNull()
      .references(() => tallerSesiones.id),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id),
    estado: estadoAsistenciaEnum("estado").notNull().default("PENDIENTE"),
    /** Hora original de la marca: no se borra al corregir (§9 P4). */
    marcadaAt: timestamp("marcada_at", { withTimezone: true }),
    motivo: text("motivo"),
    /** v1.0: quien registró la marca original (siempre el asesor o Secretaría). */
    registradaPor: uuid("registrada_por").references(() => usuarios.id),
    actualizadaPor: uuid("actualizada_por").references(() => usuarios.id),
    actualizadaAt: timestamp("actualizada_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.sesionId, t.usuarioId] })],
);

export const tallerFases = pgTable(
  "taller_fases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tallerId: uuid("taller_id")
      .notNull()
      .references(() => talleres.id),
    nombre: varchar("nombre", { length: 160 }).notNull(),
    descripcion: text("descripcion"),
    fechaRef: date("fecha_ref"),
    orden: integer("orden").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("taller_fases_taller_idx").on(t.tallerId, t.orden)],
);

export const tallerCumplimiento = pgTable(
  "taller_cumplimiento",
  {
    faseId: uuid("fase_id")
      .notNull()
      .references(() => tallerFases.id),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id),
    estado: estadoCumplimientoEnum("estado").notNull().default("PENDIENTE"),
    comentario: text("comentario"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.faseId, t.usuarioId] })],
);

export const tallerAvances = pgTable(
  "taller_avances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tallerId: uuid("taller_id")
      .notNull()
      .references(() => talleres.id),
    sesionId: uuid("sesion_id").references(() => tallerSesiones.id),
    descripcion: text("descripcion").notNull(),
    plazo: date("plazo").notNull(),
    solicitadoPor: uuid("solicitado_por").references(() => usuarios.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("taller_avances_taller_idx").on(t.tallerId, t.createdAt)],
);

/** Entregas por alumno: se conserva el historial (versiones), vale la última. */
export const tallerEntregas = pgTable(
  "taller_entregas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    avanceId: uuid("avance_id")
      .notNull()
      .references(() => tallerAvances.id),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id),
    ruta: text("ruta").notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    nombreOriginal: varchar("nombre_original", { length: 255 }).notNull(),
    version: integer("version").notNull(),
    estado: estadoEntregaEnum("estado").notNull().default("ENTREGADA"),
    observacion: text("observacion"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("taller_entregas_avance_idx").on(t.avanceId, t.usuarioId, t.version)],
);

/** Pase a Plan de tesis P6: validación del asesor + fases completas. */
export const tallerPases = pgTable(
  "taller_pases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tallerId: uuid("taller_id")
      .notNull()
      .references(() => talleres.id),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id),
    validadoPor: uuid("validado_por").references(() => usuarios.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("taller_pases_taller_idx").on(t.tallerId, t.usuarioId)],
);

/**
 * Historial del taller (spec §5): append-only con hash chain por taller,
 * mismo patrón que auditoria_transiciones (candado + actorDni en el hash).
 */
export const auditoriaTaller = pgTable(
  "auditoria_taller",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tallerId: uuid("taller_id")
      .notNull()
      .references(() => talleres.id),
    actorId: uuid("actor_id").references(() => usuarios.id),
    actorDni: varchar("actor_dni", { length: 32 }),
    /** v1.0 §14 Fase A: el usuario en cuyo nombre actuó el administrador. */
    enNombreDeId: uuid("en_nombre_de_id").references(() => usuarios.id),
    accion: varchar("accion", { length: 64 }).notNull(),
    detalle: text("detalle"),
    hashPrevio: varchar("hash_previo", { length: 64 }),
    hash: varchar("hash", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("auditoria_taller_taller_idx").on(t.tallerId, t.createdAt)],
);

export type TallerSesion = typeof tallerSesiones.$inferSelect;
export type TallerAsistencia = typeof tallerAsistencias.$inferSelect;
export type TallerFase = typeof tallerFases.$inferSelect;
export type TallerAvance = typeof tallerAvances.$inferSelect;
export type TallerEntrega = typeof tallerEntregas.$inferSelect;
export type TallerPase = typeof tallerPases.$inferSelect;
