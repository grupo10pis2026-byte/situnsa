import { type FormatoDTO, NombreFormatoSchema } from "@pis/contracts";
import { db, formatosCatalogo } from "@pis/db";
import { DomainError, fail, ok, type Result } from "@pis/domain";
import { and, eq, sql } from "drizzle-orm";
import { DrizzleUnitOfWork } from "../../../../infra/db/unit-of-work.js";
import { esEtapaFormato } from "../../catalogo-formatos.js";
import { buscarFormatoVigente, catalogoVigente, formatoActual } from "../../formatos.repository.js";
import { nombreNormalizado } from "../agregar-formato/agregar-formato.use-case.js";
import type { Actor } from "../subir-formato/subir-formato.use-case.js";

export interface ActualizarFormatoInput {
  tipo: string;
  variante: number;
  etapa?: string | undefined;
  nombre?: string | undefined;
  actor: Actor;
}

/**
 * Mueve un formato (del sistema o agregado) a otra etapa de su variante y/o
 * renombra un formato agregado. Devolver un formato del sistema a su etapa
 * original borra el ajuste. Los documentos ya generados no se tocan: el
 * expediente los muestra en la etapa vigente.
 */
export class ActualizarFormatoUseCase {
  async execute(input: ActualizarFormatoInput): Promise<Result<FormatoDTO, DomainError>> {
    if (input.etapa === undefined && input.nombre === undefined) {
      return fail(new DomainError("VALIDACION_FALLIDA", "Indique la etapa o el nombre"));
    }
    if (input.etapa !== undefined && !esEtapaFormato(input.etapa)) {
      return fail(new DomainError("VALIDACION_FALLIDA", "La etapa debe ser Etapa 01 o Etapa 02"));
    }
    const nombre =
      input.nombre === undefined ? undefined : NombreFormatoSchema.safeParse(input.nombre);
    if (nombre && !nombre.success) {
      return fail(
        new DomainError("VALIDACION_FALLIDA", "El nombre debe tener entre 3 y 120 caracteres"),
      );
    }
    const uow = new DrizzleUnitOfWork(db);
    return uow.run(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`catalogo-formatos:${input.variante}`}))`,
      );
      const f = await buscarFormatoVigente(input.tipo, input.variante, tx);
      if (!f) return fail(new DomainError("NO_ENCONTRADO", "Formato no encontrado"));
      if (nombre && !f.agregado) {
        return fail(
          new DomainError(
            "VALIDACION_FALLIDA",
            "Los formatos del sistema conservan su nombre; solo se renombran los agregados por el área",
          ),
        );
      }
      if (nombre) {
        const buscado = nombreNormalizado(nombre.data);
        const repetido = (await catalogoVigente(tx)).find(
          (o) =>
            o.variante === f.variante &&
            o.tipo !== f.tipo &&
            nombreNormalizado(o.nombre) === buscado,
        );
        if (repetido) {
          return fail(
            new DomainError("DATOS_DUPLICADOS", `Ya existe el formato «${repetido.nombre}»`),
          );
        }
      }
      const etapa =
        input.etapa !== undefined && esEtapaFormato(input.etapa) ? input.etapa : f.etapa;
      const clave = and(
        eq(formatosCatalogo.tipo, f.tipo),
        eq(formatosCatalogo.variante, f.variante),
      );
      if (f.agregado) {
        await tx
          .update(formatosCatalogo)
          .set({ etapa, ...(nombre ? { nombre: nombre.data } : {}), updatedAt: new Date() })
          .where(clave);
      } else if (etapa === f.etapaBase) {
        await tx.delete(formatosCatalogo).where(clave);
      } else {
        await tx
          .insert(formatosCatalogo)
          .values({
            tipo: f.tipo,
            variante: f.variante,
            etapa,
            agregado: false,
            creadoPor: input.actor.id || null,
          })
          .onConflictDoUpdate({
            target: [formatosCatalogo.tipo, formatosCatalogo.variante],
            set: { etapa, updatedAt: new Date() },
          });
      }
      const dto = await formatoActual(f.tipo, f.variante, tx);
      return dto ? ok(dto) : fail(new DomainError("NO_ENCONTRADO", "Formato no encontrado"));
    });
  }
}
