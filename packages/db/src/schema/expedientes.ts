import { date, jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { estadoExpedienteEnum, modalidadEnum } from "./enums.js";
import { usuarios } from "./usuarios.js";

export const expedientes = pgTable("expedientes", {
  id: uuid("id").primaryKey().defaultRandom(),
  codigo: varchar("codigo", { length: 32 }).notNull().unique(),
  estado: estadoExpedienteEnum("estado").notNull().default("REGISTRADO"),
  modalidad: modalidadEnum("modalidad").notNull(),
  programa: varchar("programa", { length: 160 }).notNull(),
  titulo: text("titulo").notNull(),
  participante1Id: uuid("participante1_id").references(() => usuarios.id),
  participante2Id: uuid("participante2_id").references(() => usuarios.id),
  asesorId: uuid("asesor_id").references(() => usuarios.id),
  // RN-L15: TESIS_02, MODALIDAD_02 por participante; MODALIDAD_FINAL (E2, no se recalcula)
  titulo02: text("titulo02"),
  modalidad02: varchar("modalidad02", { length: 64 }),
  modalidadFinal: varchar("modalidad_final", { length: 64 }),
  // RN-L08/L15: ASESOR como texto (formato profesional contra grado SUNEDU)
  asesorNombre: varchar("asesor_nombre", { length: 160 }),
  // ETAPA 01 · administrativos (labels exactos del formulario legacy)
  nroDecreto: varchar("nro_decreto", { length: 64 }),
  recomendacion: text("recomendacion"),
  presidente: varchar("presidente", { length: 160 }),
  secretario: varchar("secretario", { length: 160 }),
  coAsesor: varchar("co_asesor", { length: 160 }),
  fechaApertura: date("fecha_apertura"),
  fechaPresentacion: date("fecha_presentacion"),
  nroOficio: varchar("nro_oficio", { length: 64 }),
  // ETAPA 02 · sustentación
  integrante: varchar("integrante", { length: 160 }),
  presidenteE2: varchar("presidente_e2", { length: 160 }),
  secretarioE2: varchar("secretario_e2", { length: 160 }),
  suplenteE2: varchar("suplente_e2", { length: 160 }),
  decanal: varchar("decanal", { length: 160 }),
  fechaSustentacion: date("fecha_sustentacion"),
  horaSustentacion: varchar("hora_sustentacion", { length: 16 }),
  lugarSustentacion: varchar("lugar_sustentacion", { length: 160 }),
  modalidadVirtual: varchar("modalidad_virtual", { length: 64 }),
  driveFolderId: text("drive_folder_id"),
  driveFolderUrl: text("drive_folder_url"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Expediente = typeof expedientes.$inferSelect;
export type NuevoExpediente = typeof expedientes.$inferInsert;
