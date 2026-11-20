import { db, formatosCatalogo } from "@pis/db";
import { DomainError, fail, ok, type Result } from "@pis/domain";
import { and, eq, sql } from "drizzle-orm";
import { DrizzleUnitOfWork } from "../../../../infra/db/unit-of-work.js";
import { buscarFormatoVigente } from "../../formatos.repository.js";
import type { Actor } from "../subir-formato/subir-formato.use-case.js";

/**
 * Elimina un formato (del sistema o agregado) del catálogo de su variante:
 * deja de listarse y de generarse con «Insertar datos en documentos». No se
 * borra nada: se archiva con sus versiones intactas para poder restaurarlo,
 * y los documentos ya generados en los expedientes se conservan.
 */
export class EliminarFormatoUseCase {
  async execute(
    tipo: string,
    variante: number,
    actor?: Actor,
  ): Promise<Result<{ ok: true }, DomainError>> {
    const uow = new DrizzleUnitOfWork(db);
    return uow.run(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`catalogo-formatos:${variante}`}))`,
      );
      const f = await buscarFormatoVigente(tipo, variante, tx);
      if (!f) return fail(new DomainError("NO_ENCONTRADO", "Formato no encontrado"));
      if (f.agregado) {
        await tx
          .update(formatosCatalogo)
          .set({ archivado: true, updatedAt: new Date() })
          .where(and(eq(formatosCatalogo.tipo, tipo), eq(formatosCatalogo.variante, variante)));
      } else {
        await tx
          .insert(formatosCatalogo)
          .values({
            tipo,
            variante,
            etapa: f.etapa,
            agregado: false,
            archivado: true,
            creadoPor: actor?.id || null,
          })
          .onConflictDoUpdate({
            target: [formatosCatalogo.tipo, formatosCatalogo.variante],
            set: { archivado: true, updatedAt: new Date() },
          });
      }
      return ok({ ok: true as const });
    });
  }
}
