import type { FormatoDTO } from "@pis/contracts";
import { db, formatosCatalogo } from "@pis/db";
import { DomainError, fail, ok, type Result } from "@pis/domain";
import { and, eq, sql } from "drizzle-orm";
import { DrizzleUnitOfWork } from "../../../../infra/db/unit-of-work.js";
import { catalogoVigente, formatoActual } from "../../formatos.repository.js";
import { nombreNormalizado } from "../agregar-formato/agregar-formato.use-case.js";

/**
 * Restaura un formato eliminado: vuelve a su etapa con la versión que tenía
 * activa. Un formato del sistema en su etapa original queda sin ajuste.
 */
export class ReactivarFormatoUseCase {
  async execute(tipo: string, variante: number): Promise<Result<FormatoDTO, DomainError>> {
    const uow = new DrizzleUnitOfWork(db);
    return uow.run(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`catalogo-formatos:${variante}`}))`,
      );
      const todos = await catalogoVigente(tx, { incluirArchivados: true });
      const f = todos.find((x) => x.tipo === tipo && x.variante === variante && x.archivado);
      if (!f) return fail(new DomainError("NO_ENCONTRADO", "Formato eliminado no encontrado"));
      const buscado = nombreNormalizado(f.nombre);
      const repetido = todos.find(
        (o) =>
          !o.archivado &&
          o.variante === variante &&
          o.tipo !== tipo &&
          nombreNormalizado(o.nombre) === buscado,
      );
      if (repetido) {
        return fail(
          new DomainError(
            "DATOS_DUPLICADOS",
            `Ya existe otro formato «${repetido.nombre}»; renómbrelo antes de restaurar este`,
          ),
        );
      }
      const clave = and(eq(formatosCatalogo.tipo, tipo), eq(formatosCatalogo.variante, variante));
      if (!f.agregado && f.etapa === f.etapaBase) {
        await tx.delete(formatosCatalogo).where(clave);
      } else {
        await tx
          .update(formatosCatalogo)
          .set({ archivado: false, updatedAt: new Date() })
          .where(clave);
      }
      const dto = await formatoActual(tipo, variante, tx);
      return dto ? ok(dto) : fail(new DomainError("NO_ENCONTRADO", "Formato no encontrado"));
    });
  }
}
