export type DomainErrorCode =
  | "TRANSICION_INVALIDA"
  | "PLAZO_VENCIDO"
  | "PERMISO_DENEGADO"
  | "DOCUMENTO_INVALIDO"
  | "TURNITIN_NO_CONFORME"
  | "JURADO_NO_ASIGNADO"
  | "CONFLICTO_CONCURRENCIA"
  | "VALIDACION_FALLIDA"
  | "CREDENCIALES_INVALIDAS"
  | "CUENTA_BLOQUEADA"
  | "CUENTA_INACTIVA"
  | "SIN_CLAVE"
  | "GOOGLE_INVALIDO"
  | "SIN_CUENTA"
  | "DOMINIO_NO_PERMITIDO"
  | "SESION_INVALIDA"
  | "SIN_PERMISO"
  | "FUERA_DE_ALCANCE"
  | "NO_ENCONTRADO"
  | "REQUISITO_PENDIENTE"
  | "DATOS_DUPLICADOS"
  | "TOKEN_INVALIDO";

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}
