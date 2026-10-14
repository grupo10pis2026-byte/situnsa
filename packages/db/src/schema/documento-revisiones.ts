import { integer, jsonb, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { documentos } from "./documentos.js";
import { estadoRevisionDocumentoEnum } from "./enums.js";
import { expedientes } from "./expedientes.js";

export interface HallazgoRevisionDb {
  campo: string;
  mensaje: string;
  severidad: "ADVERTENCIA" | "INFO" | "ERROR";
  esperado?: string;
  encontrado?: string;
}

export const documentoRevisiones = pgTable("documento_revisiones", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentoId: uuid("documento_id")
    .notNull()
    .references(() => documentos.id, { onDelete: "cascade" }),
  expedienteId: uuid("expediente_id")
    .notNull()
    .references(() => expedientes.id, { onDelete: "cascade" }),
  estado: estadoRevisionDocumentoEnum("estado").notNull().default("PENDIENTE"),
  hallazgos: jsonb("hallazgos").$type<HallazgoRevisionDb[]>().notNull().default([]),
  paginasAnalizadas: integer("paginas_analizadas").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type DocumentoRevision = typeof documentoRevisiones.$inferSelect;
export type NuevoDocumentoRevision = typeof documentoRevisiones.$inferInsert;
