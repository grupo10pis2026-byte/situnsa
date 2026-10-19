import { DomainError, fail, ok, type Result } from "@pis/domain";
import {
  ACCESO_MINUTOS,
  expiracionRefresh,
  firmarAcceso,
  hashRefresh,
  nuevoRefresh,
} from "../../sesiones.js";
import {
  type RepositorioCuentas,
  type RepositorioSesiones,
  repositorioCuentasDb,
  repositorioSesionesDb,
} from "../repositorios.js";

/** Refresh rotativo: revoca el usado y emite un par nuevo (S-FIPS 8h). */
export class RefreshSesionUseCase {
  constructor(
    private sesiones: RepositorioSesiones = repositorioSesionesDb,
    private cuentas: RepositorioCuentas = repositorioCuentasDb,
    private ahora: () => Date = () => new Date(),
  ) {}

  async execute(
    refreshToken: string,
    contexto: { ip: string | null; agente: string | null },
  ): Promise<Result<{ accessToken: string; refreshToken: string; expiraEn: number }, DomainError>> {
    const sesion = await this.sesiones.buscarVigentePorHash(hashRefresh(refreshToken));
    if (!sesion || sesion.expiraAt.getTime() <= this.ahora().getTime()) {
      return fail(new DomainError("SESION_INVALIDA", "Sesión expirada o revocada"));
    }
    const cuenta = await this.cuentas.buscarPorId(sesion.usuarioId);
    if (!cuenta || !cuenta.activo) {
      return fail(new DomainError("SESION_INVALIDA", "Sesión expirada o revocada"));
    }
    await this.sesiones.revocar(sesion.id);
    const refresh = nuevoRefresh();
    await this.sesiones.crear(
      cuenta.id,
      refresh.hash,
      expiracionRefresh(this.ahora()),
      contexto.ip,
      contexto.agente,
    );
    return ok({
      accessToken: firmarAcceso({ sub: cuenta.id, dni: cuenta.dni, rol: cuenta.rol }),
      refreshToken: refresh.token,
      expiraEn: ACCESO_MINUTOS * 60,
    });
  }
}

/** Logout: revoca por hash (idempotente: token desconocido también es OK). */
export class LogoutUseCase {
  constructor(private sesiones: RepositorioSesiones = repositorioSesionesDb) {}

  async execute(refreshToken: string | null): Promise<Result<void, DomainError>> {
    if (!refreshToken) return ok(undefined);
    const sesion = await this.sesiones.buscarVigentePorHash(hashRefresh(refreshToken));
    if (sesion) await this.sesiones.revocar(sesion.id);
    return ok(undefined);
  }
}
