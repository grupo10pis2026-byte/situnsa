export interface UsuarioPresencia {
  id: string;
  nombre: string;
  rol: string;
  activoHaceSegundos: number;
}

interface RegistroPresencia {
  usuarioId: string;
  nombre: string;
  rol: string;
  expedienteId: string;
  timestamp: number;
}

/**
 * Gestor de presencia en memoria para detección de trabajo concurrente.
 * Registra los usuarios activos en cada expediente y los expira tras 30s de inactividad.
 */
export class PresenciaExpedienteManager {
  private presencias = new Map<string, Map<string, RegistroPresencia>>();

  registrarPresencia(
    expedienteId: string,
    usuario: { id: string; nombre?: string | null; rol?: string | null },
  ): UsuarioPresencia[] {
    const ahora = Date.now();
    const ttlMs = 30_000; // 30 segundos
    let expMap = this.presencias.get(expedienteId);
    if (!expMap) {
      expMap = new Map();
      this.presencias.set(expedienteId, expMap);
    }

    const nombre = usuario.nombre?.trim() || "Usuario";
    const rol = usuario.rol?.trim() || "PERSONAL";

    // Actualiza presencia del usuario actual
    expMap.set(usuario.id, {
      usuarioId: usuario.id,
      nombre,
      rol,
      expedienteId,
      timestamp: ahora,
    });

    // Detecta concurrentes y depura entradas caducadas
    const concurrentes: UsuarioPresencia[] = [];
    for (const [uid, reg] of expMap.entries()) {
      const diff = ahora - reg.timestamp;
      if (diff > ttlMs) {
        expMap.delete(uid);
      } else if (uid !== usuario.id) {
        concurrentes.push({
          id: reg.usuarioId,
          nombre: reg.nombre,
          rol: reg.rol,
          activoHaceSegundos: Math.max(0, Math.floor(diff / 1000)),
        });
      }
    }

    if (expMap.size === 0) {
      this.presencias.delete(expedienteId);
    }

    return concurrentes;
  }

  limpiar(): void {
    this.presencias.clear();
  }
}

export const presenciaExpedienteManager = new PresenciaExpedienteManager();
