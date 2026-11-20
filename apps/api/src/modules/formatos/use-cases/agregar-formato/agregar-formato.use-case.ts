import { NombreFormatoSchema, type SubirFormatoResultadoDTO } from "@pis/contracts";
import { db, formatosCatalogo } from "@pis/db";
import { DomainError, fail, ok, type Result } from "@pis/domain";
import { sql } from "drizzle-orm";
import { DrizzleUnitOfWork } from "../../../../infra/db/unit-of-work.js";
import { LocalStorageService } from "../../../../infra/storage/local-storage.service.js";
import { esEtapaFormato, tipoParaNombre } from "../../catalogo-formatos.js";
import { catalogoVigente, formatoActual, versionDTO } from "../../formatos.repository.js";
import {
  type Actor,
  advertenciasPlantilla,
  etiquetasConocidas,
  registrarVersionFormato,
  validarDocxFormato,
} from "../subir-formato/subir-formato.use-case.js";

export interface AgregarFormatoInput {
  variante: number;
  etapa: string;
  nombre: string;
  nombreArchivo: string;
  bytes: Uint8Array;
  nota?: string | undefined;
  actor: Actor;
}

/** Comparación de nombres sin mayúsculas, tildes ni espacios extra. */
export function nombreNormalizado(nombre: string): string {
  return nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Agrega un formato nuevo a la Etapa 01 o 02 de una variante (1|2
 * tesistas) con su primera versión activa. Desde ese momento se genera con
 * «Insertar datos en documentos» en los expedientes de esa variante.
 */
export class AgregarFormatoUseCase {
  constructor(private readonly storage = new LocalStorageService()) {}

  async execute(
    input: AgregarFormatoInput,
  ): Promise<Result<SubirFormatoResultadoDTO, DomainError>> {
    if (input.variante !== 1 && input.variante !== 2) {
      return fail(new DomainError("VALIDACION_FALLIDA", "La variante debe ser 1 o 2 tesistas"));
    }
    const variante = input.variante;
    if (!esEtapaFormato(input.etapa)) {
      return fail(new DomainError("VALIDACION_FALLIDA", "La etapa debe ser Etapa 01 o Etapa 02"));
    }
    const etapa = input.etapa;
    const nombre = NombreFormatoSchema.safeParse(input.nombre);
    if (!nombre.success) {
      return fail(
        new DomainError("VALIDACION_FALLIDA", "El nombre debe tener entre 3 y 120 caracteres"),
      );
    }
    const validado = validarDocxFormato(input.nombreArchivo, input.bytes);
    if (!validado.ok) return validado;
    const analisis = validado.value;
    const advertencias = advertenciasPlantilla(
      analisis.etiquetas,
      etiquetasConocidas(),
      [],
      analisis.reparadas,
    );

    const uow = new DrizzleUnitOfWork(db);
    let rutaGuardada: string | null = null;
    try {
      const r = await uow.run(async (tx) => {
        // Serializa altas concurrentes en la variante (tipo derivado del nombre).
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`catalogo-formatos:${variante}`}))`,
        );
        const todos = (await catalogoVigente(tx, { incluirArchivados: true })).filter(
          (f) => f.variante === variante,
        );
        const buscado = nombreNormalizado(nombre.data);
        const repetido = (await catalogoVigente(tx)).find(
          (f) => f.variante === variante && nombreNormalizado(f.nombre) === buscado,
        );
        if (repetido) {
          return fail(
            new DomainError(
              "DATOS_DUPLICADOS",
              `Ya existe el formato «${repetido.nombre}» para ${variante === 1 ? "1 tesista" : "2 tesistas"}`,
            ),
          );
        }
        const tipo = tipoParaNombre(nombre.data, new Set(todos.map((f) => f.tipo)));
        await tx.insert(formatosCatalogo).values({
          tipo,
          variante,
          etapa,
          nombre: nombre.data,
          agregado: true,
          creadoPor: input.actor.id || null,
        });
        const v = await registrarVersionFormato(
          tx,
          this.storage,
          {
            tipo,
            variante,
            nombreArchivo: input.nombreArchivo,
            analisis,
            advertencias,
            nota: input.nota,
            actor: input.actor,
          },
          (ruta) => {
            rutaGuardada = ruta;
          },
        );
        if (!v.ok) return v;
        const dto = await formatoActual(tipo, variante, tx);
        if (!dto) return fail(new DomainError("NO_ENCONTRADO", "Formato no encontrado"));
        return ok({ formato: dto, version: versionDTO(v.value), reparadas: analisis.reparadas });
      });
      if (!r.ok && rutaGuardada) await this.storage.delete(rutaGuardada);
      return r;
    } catch (err) {
      if (rutaGuardada) await this.storage.delete(rutaGuardada);
      throw err;
    }
  }
}
