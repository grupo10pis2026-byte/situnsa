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
}

/**
 * Login Google OIDC con PKCE (S-FIPS): verifica firma/emisor/audiencia/correo.
 * Si el correo no corresponde a un usuario activo, se rechaza:
 * **nunca se crean cuentas automáticamente**.
 */
export class LoginGoogleUseCase {
  constructor(
    private cuentas: RepositorioCuentas = repositorioCuentasDb,
    private sesiones: RepositorioSesiones = repositorioSesionesDb,
    private verificar: (idToken: string) => Promise<IdentidadGoogle> = verificarGoogle,
    private ahora: () => Date = () => new Date(),
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
    const cuenta = await this.cuentas.buscarPorGoogle(identidad.email, identidad.sub);
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
  return { sub: p?.sub ?? "", email: p?.email ?? "", verificado: p?.email_verified === true };
}
