import type { FormatoDTO } from "@pis/contracts";
import { db, plantillasFormato } from "@pis/db";
import { DomainError, fail, ok, type Result } from "@pis/domain";
import { and, eq } from "drizzle-orm";
import { DrizzleUnitOfWork } from "../../../../infra/db/unit-of-work.js";
import { buscarFormatoVigente, formatoActual } from "../../formatos.repository.js";

/**
 * Vuelve a la plantilla base del sistema: desactiva las versiones subidas
 * (se conservan en el historial para reactivarlas).
 */
export class RestaurarFormatoBaseUseCase {
  async execute(tipo: string, variante: number): Promise<Result<FormatoDTO, DomainError>> {
    if (variante !== 1 && variante !== 2) {
      return fail(new DomainError("NO_ENCONTRADO", "Formato no encontrado"));
    }
    const uow = new DrizzleUnitOfWork(db);
    return uow.run(async (tx) => {
      const f = await buscarFormatoVigente(tipo, variante, tx);
      if (!f) return fail(new DomainError("NO_ENCONTRADO", "Formato no encontrado"));
      if (f.agregado) {
        return fail(
          new DomainError(
            "VALIDACION_FALLIDA",
            "Este formato lo agregó el área y no tiene plantilla base; active otra versión del historial",
          ),
        );
      }
      await tx
        .update(plantillasFormato)
        .set({ activa: false })
        .where(and(eq(plantillasFormato.tipo, tipo), eq(plantillasFormato.variante, variante)));
      const dto = await formatoActual(tipo, variante, tx);
      return dto ? ok(dto) : fail(new DomainError("NO_ENCONTRADO", "Formato no encontrado"));
    });
  }
}
