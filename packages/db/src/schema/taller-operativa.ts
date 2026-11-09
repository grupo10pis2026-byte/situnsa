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
import { estadoAsistenciaEnum, estadoSesionEnum } from "./enums.js";
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
    estado: estadoSesionEnum("estado").notNull().default("PROGRAMADA"),
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
