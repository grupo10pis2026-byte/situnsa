import { pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { documentos } from "./documentos.js";
import { expedientes } from "./expedientes.js";
import { usuarios } from "./usuarios.js";

/**
 * Observaciones realizadas a documentos específicos de un expediente.
 * Permite trazabilidad entre el administrador/asesor y el tesista,
 * con historial, contador de días y marcado de resolución.
 */
export const documentoObservaciones = pgTable("documento_observaciones", {
  id: uuid("id").primaryKey().defaultRandom(),
  expedienteId: uuid("expediente_id")
    .notNull()
    .references(() => expedientes.id, { onDelete: "cascade" }),
  tipoDocumento: varchar("tipo_documento", { length: 64 }).notNull(),
  documentoId: uuid("documento_id").references(() => documentos.id, { onDelete: "set null" }),
  texto: text("texto").notNull(),
  autorId: uuid("autor_id").references(() => usuarios.id, { onDelete: "set null" }),
  autorNombre: text("autor_nombre"),
  autorRol: varchar("autor_rol", { length: 32 }),
  estado: varchar("estado", { length: 32 }).notNull().default("PENDIENTE"), // "PENDIENTE" | "RESUELTO"
  resueltoAt: timestamp("resuelto_at", { withTimezone: true }),
  resueltoPorId: uuid("resuelto_por_id").references(() => usuarios.id, { onDelete: "set null" }),
  resueltoPorNombre: text("resuelto_por_nombre"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type DocumentoObservacion = typeof documentoObservaciones.$inferSelect;
export type NuevoDocumentoObservacion = typeof documentoObservaciones.$inferInsert;
