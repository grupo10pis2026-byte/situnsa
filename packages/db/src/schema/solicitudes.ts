import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import {
  estadoConformidadDocumentoEnum,
  estadoSolicitudEnum,
  modalidadEnum,
  viaIngresoEnum,
} from "./enums.js";
import { expedientes } from "./expedientes.js";
import { gruposTaller } from "./grupos-pagos.js";
import { usuarios } from "./usuarios.js";

/**
 * Solicitudes de titulación remitidas desde la Mesa de Partes Virtual
 * (Vía Regular y Taller de Tesis). Pre-expediente transitorio.
 */
export const solicitudes = pgTable(
  "solicitudes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    codigo: varchar("codigo", { length: 32 }).notNull().unique(), // SOL-AAAA-NNNN
    via: viaIngresoEnum("via").notNull(),
    modalidad: modalidadEnum("modalidad").notNull(),
    programa: varchar("programa", { length: 160 }).notNull(),
    titulo: text("titulo").notNull(),
    anioEgreso: integer("anio_egreso"),
    cantidadTesistas: integer("cantidad_tesistas").notNull().default(1),
    estado: estadoSolicitudEnum("estado").notNull().default("NUEVA"),
    responsableAsignadoId: uuid("responsable_asignado_id").references(() => usuarios.id),
    fechaLimiteSubsanacion: date("fecha_limite_subsanacion"),
    motivoObservacion: text("motivo_observacion"),
    motivoRechazo: text("motivo_rechazo"),
    expedienteId: uuid("expediente_id").references(() => expedientes.id),
    tallerGrupoId: uuid("taller_grupo_id").references(() => gruposTaller.id),
    ipOrigen: varchar("ip_origen", { length: 45 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("solicitudes_estado_idx").on(t.estado),
    index("solicitudes_via_idx").on(t.via),
    index("solicitudes_created_at_idx").on(t.createdAt),
  ],
);

export type Solicitud = typeof solicitudes.$inferSelect;
export type NuevaSolicitud = typeof solicitudes.$inferInsert;

/**
 * Participantes vinculados a la solicitud (1 titular, opcional 1 co-tesista).
 */
export const solicitudParticipantes = pgTable(
  "solicitud_participantes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    solicitudId: uuid("solicitud_id")
      .notNull()
      .references(() => solicitudes.id, { onDelete: "cascade" }),
    orden: integer("orden").notNull().default(1), // 1 = titular, 2 = co-tesista
    nombres: text("nombres").notNull(),
    apellidos: text("apellidos").notNull(),
    dni: varchar("dni", { length: 8 }).notNull(),
    cui: varchar("cui", { length: 16 }),
    email: varchar("email", { length: 255 }).notNull(),
    telefono: varchar("telefono", { length: 20 }),
    nacionalidad: varchar("nacionalidad", { length: 64 }).default("Peruana"),
    ciudad: varchar("ciudad", { length: 64 }),
    direccion: text("direccion"),
    departamento: varchar("departamento", { length: 64 }),
    provincia: varchar("provincia", { length: 64 }),
    distrito: varchar("distrito", { length: 64 }),
    usuarioId: uuid("usuario_id").references(() => usuarios.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("solicitud_participantes_solicitud_orden_unique").on(t.solicitudId, t.orden),
    unique("solicitud_participantes_solicitud_dni_unique").on(t.solicitudId, t.dni),
    index("solicitud_participantes_dni_idx").on(t.dni),
  ],
);

export type SolicitudParticipante = typeof solicitudParticipantes.$inferSelect;
export type NuevoSolicitudParticipante = typeof solicitudParticipantes.$inferInsert;

/**
 * Archivos digitales adjuntos a la postulación o a subsanaciones.
 */
export const solicitudDocumentos = pgTable(
  "solicitud_documentos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    solicitudId: uuid("solicitud_id")
      .notNull()
      .references(() => solicitudes.id, { onDelete: "cascade" }),
    tipo: varchar("tipo", { length: 64 }).notNull(),
    participanteOrden: integer("participante_orden"), // null si compartido, 1 o 2 si por participante
    ruta: text("ruta").notNull(),
    nombreOriginal: varchar("nombre_original", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    pesoBytes: integer("peso_bytes").notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    version: integer("version").notNull().default(1),
    estadoConformidad: estadoConformidadDocumentoEnum("estado_conformidad")
      .notNull()
      .default("PENDIENTE"),
    marcadoPurgaAt: timestamp("marcado_purga_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("solicitud_documentos_solicitud_idx").on(t.solicitudId),
    index("solicitud_documentos_sha256_idx").on(t.sha256),
  ],
);

export type SolicitudDocumento = typeof solicitudDocumentos.$inferSelect;
export type NuevoSolicitudDocumento = typeof solicitudDocumentos.$inferInsert;

/**
 * Trazabilidad inmutable de eventos sobre la solicitud.
 */
export const solicitudHistorial = pgTable(
  "solicitud_historial",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    solicitudId: uuid("solicitud_id")
      .notNull()
      .references(() => solicitudes.id, { onDelete: "cascade" }),
    accion: varchar("accion", { length: 40 }).notNull(),
    actorId: uuid("actor_id").references(() => usuarios.id),
    actorDni: varchar("actor_dni", { length: 32 }),
    ip: varchar("ip", { length: 45 }),
    detalle: text("detalle"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("solicitud_historial_solicitud_created_idx").on(t.solicitudId, t.createdAt)],
);

export type SolicitudHistorial = typeof solicitudHistorial.$inferSelect;
export type NuevoSolicitudHistorial = typeof solicitudHistorial.$inferInsert;

/**
 * Enlaces temporales criptográficos de un solo uso para subsanación sin requerir cuenta.
 */
export const tokensSubsanacion = pgTable(
  "tokens_subsanacion",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    solicitudId: uuid("solicitud_id")
      .notNull()
      .references(() => solicitudes.id, { onDelete: "cascade" }),
    hash: varchar("hash", { length: 64 }).notNull().unique(), // sha256(token)
    expiraAt: timestamp("expira_at", { withTimezone: true }).notNull(),
    usadoAt: timestamp("usado_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("tokens_subsanacion_hash_idx").on(t.hash)],
);

export type TokenSubsanacion = typeof tokensSubsanacion.$inferSelect;
export type NuevoTokenSubsanacion = typeof tokensSubsanacion.$inferInsert;
