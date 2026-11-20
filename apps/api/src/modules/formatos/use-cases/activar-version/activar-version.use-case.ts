import type { FormatoDTO } from "@pis/contracts";
import { db, plantillasFormato } from "@pis/db";
import { DomainError, fail, ok, type Result } from "@pis/domain";
import { and, eq, ne, sql } from "drizzle-orm";
import { DrizzleUnitOfWork } from "../../../../infra/db/unit-of-work.js";
import { buscarFormatoVigente, formatoActual, versionPorId } from "../../formatos.repository.js";

/** Vuelve a usar una versión anterior de un formato (deshacer un cambio). */
export class ActivarVersionFormatoUseCase {
  async execute(versionId: string): Promise<Result<FormatoDTO, DomainError>> {
    const uow = new DrizzleUnitOfWork(db);
    return uow.run(async (tx) => {
      const v = await versionPorId(versionId, tx);
      if (!v || !(await buscarFormatoVigente(v.tipo, v.variante, tx))) {
        return fail(new DomainError("NO_ENCONTRADO", "Versión de formato no encontrada"));
      }
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`formato:${v.tipo}:${v.variante}`}))`,
      );
      await tx
        .update(plantillasFormato)
        .set({ activa: false })
        .where(
          and(
            eq(plantillasFormato.tipo, v.tipo),
            eq(plantillasFormato.variante, v.variante),
            ne(plantillasFormato.id, v.id),
          ),
        );
      await tx
        .update(plantillasFormato)
        .set({ activa: true })
        .where(eq(plantillasFormato.id, v.id));
      const dto = await formatoActual(v.tipo, v.variante, tx);
      return dto ? ok(dto) : fail(new DomainError("NO_ENCONTRADO", "Formato no encontrado"));
    });
  }
}
