import { db, sesiones, usuarios } from "@pis/db";
import { and, eq, isNull, or, sql } from "drizzle-orm";

/** Cuenta mínima para autenticar (evita exponer la fila completa). */
export interface CuentaAuth {
  id: string;
  dni: string;
  nombres: string;
  apellidos: string;
  email: string;
  rol: string;
  activo: boolean;
  passwordHash: string | null;
  googleSub: string | null;
  intentosFallidos: number;
  bloqueadoHasta: Date | null;
}

export interface RepositorioCuentas {
  buscarPorIdentificador(id: string): Promise<CuentaAuth | null>;
  buscarPorId(id: string): Promise<CuentaAuth | null>;
  buscarPorGoogle(email: string, sub: string): Promise<CuentaAuth | null>;
  guardarIntento(usuarioId: string, fallidos: number, bloqueadoHasta: Date | null): Promise<void>;
  vincularGoogle(usuarioId: string, sub: string): Promise<void>;
}

export interface SesionVigente {
  id: string;
  usuarioId: string;
  expiraAt: Date;
}

export interface RepositorioSesiones {
  crear(
    usuarioId: string,
    refreshHash: string,
    expiraAt: Date,
    ip: string | null,
    agente: string | null,
  ): Promise<void>;
  buscarVigentePorHash(hash: string): Promise<SesionVigente | null>;
  revocar(id: string): Promise<void>;
}

const COLUMNAS = {
  id: usuarios.id,
  dni: usuarios.dni,
  nombres: usuarios.nombres,
  apellidos: usuarios.apellidos,
  email: usuarios.email,
  rol: usuarios.rol,
  activo: usuarios.activo,
  passwordHash: usuarios.passwordHash,
  googleSub: usuarios.googleSub,
  intentosFallidos: usuarios.intentosFallidos,
  bloqueadoHasta: usuarios.bloqueadoHasta,
};

/** Implementación Drizzle (producción); los specs inyectan fakes en memoria. */
export const repositorioCuentasDb: RepositorioCuentas = {
  async buscarPorIdentificador(id) {
    const rows = await db
      .select(COLUMNAS)
      .from(usuarios)
      .where(or(eq(usuarios.dni, id), eq(usuarios.cui, id), eq(usuarios.email, id)))
      .limit(1);
    return normalizar(rows[0]);
  },
  async buscarPorId(id) {
    const rows = await db.select(COLUMNAS).from(usuarios).where(eq(usuarios.id, id)).limit(1);
    return normalizar(rows[0]);
  },
  async buscarPorGoogle(email, sub) {
    // Primero la identidad ya vinculada (`sub` estable); si no, por correo.
    const porSub = await db
      .select(COLUMNAS)
      .from(usuarios)
      .where(eq(usuarios.googleSub, sub))
      .limit(1);
    if (porSub[0]) return normalizar(porSub[0]);
    const porCorreo = await db
      .select(COLUMNAS)
      .from(usuarios)
      .where(sql`lower(${usuarios.email}) = ${email.toLowerCase()}`)
      .limit(1);
    return normalizar(porCorreo[0]);
  },
  async guardarIntento(usuarioId, fallidos, bloqueadoHasta) {
    await db
      .update(usuarios)
      .set({ intentosFallidos: fallidos, bloqueadoHasta })
      .where(eq(usuarios.id, usuarioId));
  },
  async vincularGoogle(usuarioId, sub) {
    await db.update(usuarios).set({ googleSub: sub }).where(eq(usuarios.id, usuarioId));
  },
};

function normalizar(
  row: (Omit<CuentaAuth, "activo"> & { activo: boolean | null }) | undefined,
): CuentaAuth | null {
  if (!row) return null;
  return {
    ...row,
    activo: row.activo ?? true,
    intentosFallidos: row.intentosFallidos ?? 0,
  };
}

export const repositorioSesionesDb: RepositorioSesiones = {
  async crear(usuarioId, refreshHash, expiraAt, ip, agente) {
    await db.insert(sesiones).values({ usuarioId, refreshHash, expiraAt, ip, agente });
  },
  async buscarVigentePorHash(hash) {
    const rows = await db
      .select({ id: sesiones.id, usuarioId: sesiones.usuarioId, expiraAt: sesiones.expiraAt })
      .from(sesiones)
      .where(and(eq(sesiones.refreshHash, hash), isNull(sesiones.revocadaAt)))
      .limit(1);
    return rows[0] ?? null;
  },
  async revocar(id) {
    await db.update(sesiones).set({ revocadaAt: new Date() }).where(eq(sesiones.id, id));
  },
};
