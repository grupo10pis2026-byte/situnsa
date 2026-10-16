import {
  customType,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { estadoDocumentoEnum } from "./enums.js";
import { expedientes } from "./expedientes.js";

export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const origenDocumentoEnum = pgEnum("origen_documento", ["WEB", "CORREO", "SISTEMA"]);

export const estadoDriveSyncEnum = pgEnum("estado_drive_sync", [
  "NO_APLICA",
  "PENDIENTE",
  "SINCRONIZADO",
  "ERROR",
]);

export const documentos = pgTable("documentos", {
  id: uuid("id").primaryKey().defaultRandom(),
  expedienteId: uuid("expediente_id")
    .notNull()
    .references(() => expedientes.id),
  tipo: varchar("tipo", { length: 64 }).notNull(),
  etapa: varchar("etapa", { length: 8 }).notNull().default("E1"),
  ruta: text("ruta").notNull(),
  version: integer("version").notNull().default(1),
  sha256: varchar("sha256", { length: 64 }).notNull(),
  estado: estadoDocumentoEnum("estado").notNull().default("CARGADO"),

  // Trazabilidad de origen y sincronización Drive
  origen: origenDocumentoEnum("origen").notNull().default("WEB"),
  origenMetadata: text("origen_metadata"), // JSON con headers de correo, etc.
  driveFileId: text("drive_file_id"),
  driveUrl: text("drive_url"),
  driveSyncEstado: estadoDriveSyncEnum("drive_sync_estado").default("PENDIENTE").notNull(),
  driveSyncIntentos: integer("drive_sync_intentos").default(0).notNull(),
  driveSyncedAt: timestamp("drive_synced_at", { withTimezone: true }),
  driveError: text("drive_error"),
  archivoContenido: bytea("archivo_contenido"),
  tamanoBytes: integer("tamano_bytes"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Documento = typeof documentos.$inferSelect;
export type NuevoDocumento = typeof documentos.$inferInsert;

/**
 * Formatos generados por el sistema (HU-0017/0018/0020/0030 · botón
 * "Insertar datos"): uno vigente por expediente y tipo, con las etiquetas
 * que quedaron pendientes. No reemplaza al documento firmado que se carga.
 */
export const documentosGenerados = pgTable(
  "documentos_generados",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expedienteId: uuid("expediente_id")
      .notNull()
      .references(() => expedientes.id),
    tipo: varchar("tipo", { length: 64 }).notNull(),
    etapa: varchar("etapa", { length: 8 }).notNull(),
    ruta: text("ruta").notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    version: integer("version").notNull().default(1),
    versionPlantilla: varchar("version_plantilla", { length: 16 }).notNull(),
    pendientes: jsonb("pendientes").$type<string[]>().notNull().default([]),
    archivoContenido: bytea("archivo_contenido"),
    tamanoBytes: integer("tamano_bytes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique("documentos_generados_expediente_tipo").on(t.expedienteId, t.tipo)],
);

export type DocumentoGenerado = typeof documentosGenerados.$inferSelect;
