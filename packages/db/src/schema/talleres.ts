import {
  date,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { estadoTallerEnum } from "./enums.js";
import { usuarios } from "./usuarios.js";

/**
 * Talleres de tesis P1–P3. Un taller = un grupo de alumnos con un asesor
 * (spec v1.0 §3). Columnas marcadas "(v0)" pertenecen al modelo anterior y
 * se retiran en la Fase 5, cuando el API ya no las use.
 */
export const talleres = pgTable(
  "talleres",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nombre: varchar("nombre", { length: 160 }).notNull(),
    asesorId: uuid("asesor_id").references(() => usuarios.id),
    periodo: varchar("periodo", { length: 32 }),
    /**
     * TEMPORAL (hasta el corte 3.3): el enum de BD ya tiene los estados v1.0,
     * pero el API v0 solo escribe ACTIVO/CERRADO/CANCELADO; el tipo se
     * estrecha para no romper sus contratos. El corte 3.3 quita el `$type`.
     */
    estado: estadoTallerEnum("estado")
      .$type<"ACTIVO" | "CERRADO" | "CANCELADO">()
      .notNull()
      .default("ACTIVO"),
    /** (v0) Contador de alumnos; en v1.0 el cupo cuenta proyectos. */
    inscritos: integer("inscritos").notNull().default(0),
    /** P2: inicio del curso (AAAA-MM-DD). */
    fechaInicio: date("fecha_inicio"),
    /** P2 v1.0: fin del curso (sugerido: domingo de la semana 12). */
    fechaFin: date("fecha_fin"),
    /** P2 v1.0: número de sesiones del curso (24 por defecto). */
    numeroSesiones: integer("numero_sesiones").notNull().default(24),
    /** (v0) Días ISO en CSV; en v1.0 ver `taller_dias`. */
    diasSesion: varchar("dias_sesion", { length: 16 }),
    /** (v0) Horario único; en v1.0 cada día tiene su horario en `taller_dias`. */
    horaInicio: varchar("hora_inicio", { length: 5 }),
    horaFin: varchar("hora_fin", { length: 5 }),
    /** (v0) Cupo de alumnos. */
    cupoMax: integer("cupo_max"),
    /** P2 v1.0: cupo en proyectos (1 o 2 tesistas cuentan 1). */
    cupoProyectos: integer("cupo_proyectos").notNull().default(15),
    /** (v0) Enlace único. */
    enlace: varchar("enlace", { length: 512 }),
    /** P2 v1.0: enlaces de Meet del sábado y del domingo (https, opcionales). */
    enlaceSabado: varchar("enlace_sabado", { length: 512 }),
    enlaceDomingo: varchar("enlace_domingo", { length: 512 }),
    motivoCancelacion: text("motivo_cancelacion"),
    creadoPor: uuid("creado_por").references(() => usuarios.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("talleres_nombre_uq").on(t.nombre)],
);

/** P2 v1.0: un registro por día de sesión con su horario (§7 TallerDia). */
export const tallerDias = pgTable(
  "taller_dias",
  {
    tallerId: uuid("taller_id")
      .notNull()
      .references(() => talleres.id),
    /** Día ISO 1 (lunes) … 7 (domingo). */
    dia: integer("dia").notNull(),
    horaInicio: varchar("hora_inicio", { length: 5 }).notNull(),
    horaFin: varchar("hora_fin", { length: 5 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.tallerId, t.dia] })],
);

export type Taller = typeof talleres.$inferSelect;
export type TallerDia = typeof tallerDias.$inferSelect;
