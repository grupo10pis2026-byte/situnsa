import { DomainError, fail, ok, type Result } from "@pis/domain";
import { OAuth2Client } from "google-auth-library";
import { ACCESO_MINUTOS, expiracionRefresh, firmarAcceso, nuevoRefresh } from "../../sesiones.js";
import {
  type RepositorioCuentas,
  type RepositorioSesiones,
  repositorioCuentasDb,
  repositorioSesionesDb,
} from "../repositorios.js";

export interface IdentidadGoogle {
  sub: string;
  email: string;
  verificado: boolean;
  /** Dominio de Google Workspace (`hd`); ausente en cuentas @gmail.com. */
  dominio: string | null;
}

/** Único dominio institucional admitido (configurable para pruebas). */
export function dominioGooglePermitido(): string {
  return (process.env.GOOGLE_DOMINIO ?? "unsa.edu.pe").trim().toLowerCase();
}

/**
 * Login Google OIDC (S-FIPS): verifica firma/emisor/audiencia del ID token.
 * Filtros, en orden:
 * 1. Correo verificado por Google.
 * 2. Cuenta del Workspace institucional: claim `hd` **y** correo terminados
 *    en el dominio permitido (`@unsa.edu.pe`). El `hd` lo firma Google, así
 *    que un correo personal no puede hacerse pasar por institucional.
 * 3. Usuario existente y activo en el sistema: **nunca se crean cuentas
 *    automáticamente** (las crea el área al observar o aceptar una solicitud).
 * Una cuenta sin clave (recién creada) también puede entrar por esta vía:
 * Google ya acredita que el correo es suyo.
 */
export class LoginGoogleUseCase {
  constructor(
    private cuentas: RepositorioCuentas = repositorioCuentasDb,
    private sesiones: RepositorioSesiones = repositorioSesionesDb,
    private verificar: (idToken: string) => Promise<IdentidadGoogle> = verificarGoogle,
    private ahora: () => Date = () => new Date(),
    private dominio: string = dominioGooglePermitido(),
  ) {}

  async execute(
    idToken: string,
    contexto: { ip: string | null; agente: string | null },
  ): Promise<
    Result<
      {
        usuario: { userId: string; dni: string; nombres: string; email: string; rol: string };
        accessToken: string;
        refreshToken: string;
        expiraEn: number;
      },
      DomainError
    >
  > {
    let identidad: IdentidadGoogle;
    try {
      identidad = await this.verificar(idToken);
    } catch {
      return fail(new DomainError("GOOGLE_INVALIDO", "Token de Google inválido"));
    }
    if (!identidad.verificado || !identidad.email) {
      return fail(new DomainError("GOOGLE_INVALIDO", "Correo de Google no verificado"));
    }
    const email = identidad.email.trim().toLowerCase();
    if (identidad.dominio?.toLowerCase() !== this.dominio || !email.endsWith(`@${this.dominio}`)) {
      return fail(
        new DomainError(
          "DOMINIO_NO_PERMITIDO",
          `Solo se admiten cuentas institucionales @${this.dominio}`,
        ),
      );
    }
    const cuenta = await this.cuentas.buscarPorGoogle(email, identidad.sub);
    // Cuenta ya vinculada a otra identidad de Google (p. ej. correo reasignado).
    if (cuenta?.googleSub && cuenta.googleSub !== identidad.sub) {
      return fail(
        new DomainError("SIN_CUENTA", "Esta cuenta de Google no está vinculada a tu usuario"),
      );
    }
    if (!cuenta || !cuenta.activo) {
      return fail(
        new DomainError(
          "SIN_CUENTA",
          "El correo no corresponde a un usuario activo: solicite su alta al área",
        ),
      );
    }
    if (!cuenta.googleSub) {
      await this.cuentas.vincularGoogle(cuenta.id, identidad.sub);
    }
    const refresh = nuevoRefresh();
    await this.sesiones.crear(
      cuenta.id,
      refresh.hash,
      expiracionRefresh(this.ahora()),
      contexto.ip,
      contexto.agente,
    );
    return ok({
      usuario: {
        userId: cuenta.id,
        dni: cuenta.dni,
        nombres: `${cuenta.nombres} ${cuenta.apellidos}`,
        email: cuenta.email,
        rol: cuenta.rol,
      },
      accessToken: firmarAcceso({ sub: cuenta.id, dni: cuenta.dni, rol: cuenta.rol }),
      refreshToken: refresh.token,
      expiraEn: ACCESO_MINUTOS * 60,
    });
  }
}

/** Verificador real (requiere GOOGLE_CLIENT_ID; 501 si falta). */
export async function verificarGoogle(idToken: string): Promise<IdentidadGoogle> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID ausente");
  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({ idToken, audience: clientId });
  const p = ticket.getPayload();
  return {
    sub: p?.sub ?? "",
    email: p?.email ?? "",
    verificado: p?.email_verified === true,
    dominio: p?.hd ?? null,
  };
}
