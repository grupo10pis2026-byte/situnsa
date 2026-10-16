import { boolean, pgTable, primaryKey, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { usuarios } from "./usuarios.js";

/**
 * Seguridad (port S-FIPS SEGURIDAD.md + matriz ABAC pis):
 * - `roles/permisos`: permiso atómico `modulo.accion`; ADMIN_SISTEMA implícito total.
 * - `usuarios_roles`: un usuario puede tener varios roles.
 * - `sesiones`: refresh tokens hasheados con rotación (acceso JWT 15min + refresh 8h).
 * - `usuarios.intentos_fallidos/bloqueado_hasta`: bloqueo 5 intentos × 15 min.
 */

export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: varchar("nombre", { length: 32 }).notNull().unique(),
  descripcion: text("descripcion"),
  esSistema: boolean("es_sistema").notNull().default(false),
  activo: boolean("activo").notNull().default(true),
});

export const permisos = pgTable("permisos", {
  id: uuid("id").primaryKey().defaultRandom(),
  modulo: varchar("modulo", { length: 32 }).notNull(),
  accion: varchar("accion", { length: 16 }).notNull(),
  clave: varchar("clave", { length: 64 }).notNull().unique(),
});

export const rolesPermisos = pgTable(
  "roles_permisos",
  {
    rolId: uuid("rol_id")
      .notNull()
      .references(() => roles.id),
    permisoId: uuid("permiso_id")
      .notNull()
      .references(() => permisos.id),
  },
  (t) => [primaryKey({ columns: [t.rolId, t.permisoId] })],
);

export const usuariosRoles = pgTable(
  "usuarios_roles",
  {
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id),
    rolId: uuid("rol_id")
      .notNull()
      .references(() => roles.id),
  },
  (t) => [primaryKey({ columns: [t.usuarioId, t.rolId] })],
);

export const sesiones = pgTable("sesiones", {
  id: uuid("id").primaryKey().defaultRandom(),
  usuarioId: uuid("usuario_id")
    .notNull()
    .references(() => usuarios.id),
  refreshHash: varchar("refresh_hash", { length: 64 }).notNull().unique(),
  creadaAt: timestamp("creada_at", { withTimezone: true }).defaultNow().notNull(),
  expiraAt: timestamp("expira_at", { withTimezone: true }).notNull(),
  revocadaAt: timestamp("revocada_at", { withTimezone: true }),
  ip: varchar("ip", { length: 64 }),
  agente: text("agente"),
});

export type Rol = typeof roles.$inferSelect;
export type Permiso = typeof permisos.$inferSelect;
export type Sesion = typeof sesiones.$inferSelect;

/** Política de acceso (S-FIPS SEGURIDAD.md §Autenticación). */
export const MAX_INTENTOS = 5;
export const BLOQUEO_MINUTOS = 15;
export const ACCESO_MINUTOS = 480; // 8 horas (480 min): sesión continua durante la jornada laboral
export const REFRESH_HORAS = 8;
