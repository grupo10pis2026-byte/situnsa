import { DomainError, fail, ok, type Result } from "@pis/domain";
import { verificarClave } from "../../hash.js";
import {
  ACCESO_MINUTOS,
  estaBloqueado,
  expiracionRefresh,
  firmarAcceso,
  nuevoRefresh,
  proximoEstadoIntento,
} from "../../sesiones.js";
import {
  type RepositorioCuentas,
  type RepositorioSesiones,
  repositorioCuentasDb,
  repositorioSesionesDb,
} from "../repositorios.js";

export interface Credenciales {
  identificador: string;
  password: string;
  ip: string | null;
  agente: string | null;
}

export interface ParTokens {
  usuario: { userId: string; dni: string; nombres: string; email: string; rol: string };
  accessToken: string;
  refreshToken: string;
  expiraEn: number;
}

/**
 * Login local: DNI/CUI/correo + bcrypt, bloqueo 5×15min (S-FIPS).
 * Nunca distingue "usuario inexistente" de "clave errónea" (anti-enumeración).
 */
export class LoginLocalUseCase {
  constructor(
    private cuentas: RepositorioCuentas = repositorioCuentasDb,
    private sesiones: RepositorioSesiones = repositorioSesionesDb,
    private ahora: () => Date = () => new Date(),
  ) {}

  async execute(input: Credenciales): Promise<Result<ParTokens, DomainError>> {
    const cuenta = await this.cuentas.buscarPorIdentificador(input.identificador.trim());
    if (!cuenta || !cuenta.activo) {
      return fail(new DomainError("CREDENCIALES_INVALIDAS", "Credenciales inválidas"));
    }
    if (estaBloqueado(cuenta.bloqueadoHasta, this.ahora())) {
      return fail(
        new DomainError("CUENTA_BLOQUEADA", "Cuenta bloqueada por intentos fallidos (15 min)"),
      );
    }
    if (!cuenta.passwordHash) {
      return fail(
        new DomainError("SIN_CLAVE", "El usuario no tiene clave configurada: contacte al área"),
      );
    }
    const okClave = verificarClave(input.password, cuenta.passwordHash);
    const estado = proximoEstadoIntento(cuenta.intentosFallidos, okClave, this.ahora());
    await this.cuentas.guardarIntento(cuenta.id, estado.fallidos, estado.bloqueadoHasta);
    if (!okClave) {
      const codigo = estado.bloqueadoHasta ? "CUENTA_BLOQUEADA" : "CREDENCIALES_INVALIDAS";
      const mensaje = estado.bloqueadoHasta
        ? "Cuenta bloqueada por intentos fallidos (15 min)"
        : "Credenciales inválidas";
      return fail(new DomainError(codigo, mensaje));
    }
    const refresh = nuevoRefresh();
    const expira = expiracionRefresh(this.ahora());
    await this.sesiones.crear(cuenta.id, refresh.hash, expira, input.ip, input.agente);
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
