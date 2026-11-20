import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { expedientes } from "./expedientes.js";
import { usuarios } from "./usuarios.js";

/**
 * Gestión de formatos: versiones subidas por el área de cada plantilla DOCX
 * (tipo canónico × variante 1|2 tesistas). El archivo vive en disco
 * (`DOCS_VOLUME_PATH/_plantillas/`); sin versión activa se usa la base del repo.
 */
export const plantillasFormato = pgTable(
  "plantillas_formato",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tipo: varchar("tipo", { length: 64 }).notNull(),
    variante: smallint("variante").notNull(),
    version: integer("version").notNull(),
    nombreArchivo: text("nombre_archivo").notNull(),
    ruta: text("ruta").notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    tamanoBytes: integer("tamano_bytes").notNull(),
    etiquetas: jsonb("etiquetas").$type<string[]>().notNull().default([]),
    advertencias: jsonb("advertencias").$type<string[]>().notNull().default([]),
    nota: text("nota"),
    activa: boolean("activa").notNull().default(false),
    creadoPor: uuid("creado_por").references(() => usuarios.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("plantillas_formato_tipo_variante_version").on(t.tipo, t.variante, t.version),
    uniqueIndex("plantillas_formato_activa_unica")
      .on(t.tipo, t.variante)
      .where(sql`${t.activa} = true`),
  ],
);

export type PlantillaFormato = typeof plantillasFormato.$inferSelect;

/**
 * Ajustes del área al catálogo de formatos, por variante (1|2 tesistas):
 * - formato del sistema movido de etapa (`agregado = false`, solo `etapa`);
 * - formato nuevo agregado por el área (`agregado = true`, con `nombre`).
 * Sin fila, el formato del sistema queda en su etapa original. Un formato
 * agregado no se borra: se archiva (los expedientes conservan su nombre).
 */
export const formatosCatalogo = pgTable(
  "formatos_catalogo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tipo: varchar("tipo", { length: 64 }).notNull(),
    variante: smallint("variante").notNull(),
    etapa: varchar("etapa", { length: 8 }).notNull(),
    nombre: text("nombre"),
    agregado: boolean("agregado").notNull().default(false),
    archivado: boolean("archivado").notNull().default(false),
    creadoPor: uuid("creado_por").references(() => usuarios.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique("formatos_catalogo_tipo_variante").on(t.tipo, t.variante)],
);

export type FormatoCatalogoRow = typeof formatosCatalogo.$inferSelect;

/**
 * Registro de oficios y decretos importado del Excel maestro del área
 * (solo lectura: el Excel sigue siendo la fuente de verdad). Un número que
 * desaparece del Excel queda `vigente = false`, nunca se borra.
 */
export const registroNumeracion = pgTable(
  "registro_numeracion",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tipo: varchar("tipo", { length: 16 }).notNull(),
    /** Clave estable (`claveNumero`): 7, 07 y 0007 son el mismo registro. */
    clave: varchar("clave", { length: 64 }).notNull(),
    numero: varchar("numero", { length: 64 }).notNull(),
    datos: jsonb("datos").$type<Record<string, string>>().notNull().default({}),
    textoBusqueda: text("texto_busqueda").notNull().default(""),
    fila: integer("fila"),
    vigente: boolean("vigente").notNull().default(true),
    actualizadoEn: timestamp("actualizado_en", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique("registro_numeracion_tipo_clave").on(t.tipo, t.clave)],
);

export type RegistroNumeracionRow = typeof registroNumeracion.$inferSelect;

/** Historial de importaciones del Excel (resumen para el área). */
export const importacionesNumeracion = pgTable("importaciones_numeracion", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombreArchivo: text("nombre_archivo").notNull(),
  sha256: varchar("sha256", { length: 64 }).notNull(),
  resumen: jsonb("resumen").$type<Record<string, unknown>>().notNull().default({}),
  creadoPor: uuid("creado_por").references(() => usuarios.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Vínculo único número ↔ expediente por tipo: un oficio/decreto pertenece a
 * un solo expediente y un expediente tiene un solo oficio circular y un decreto.
 */
export const vinculosNumeracion = pgTable(
  "vinculos_numeracion",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tipo: varchar("tipo", { length: 16 }).notNull(),
    clave: varchar("clave", { length: 64 }).notNull(),
    expedienteId: uuid("expediente_id")
      .notNull()
      .references(() => expedientes.id),
    origen: varchar("origen", { length: 16 }).notNull().default("MANUAL"),
    vinculadoPor: uuid("vinculado_por").references(() => usuarios.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("vinculos_numeracion_tipo_clave").on(t.tipo, t.clave),
    unique("vinculos_numeracion_tipo_expediente").on(t.tipo, t.expedienteId),
    index("vinculos_numeracion_expediente_idx").on(t.expedienteId),
  ],
);

export type VinculoNumeracion = typeof vinculosNumeracion.$inferSelect;
