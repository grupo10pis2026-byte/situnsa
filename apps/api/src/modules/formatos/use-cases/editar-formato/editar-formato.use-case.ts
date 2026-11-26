import type {
  EditarFormatoResultadoDTO,
  ReemplazoFormato,
  SubirFormatoResultadoDTO,
} from "@pis/contracts";
import { type DbExecutor, db } from "@pis/db";
import { DomainError, fail, ok, type Result } from "@pis/domain";
import { DrizzleUnitOfWork } from "../../../../infra/db/unit-of-work.js";
import { etiquetasDeDocx } from "../../../../infra/docx/analizar-plantilla.js";
import { reemplazarTextoDocx } from "../../../../infra/docx/reemplazar-texto.js";
import { obtenerPlantillaDocx } from "../../../../infra/docx/render-docx.js";
import { LocalStorageService } from "../../../../infra/storage/local-storage.service.js";
import type { FormatoCatalogo } from "../../catalogo-formatos.js";
import {
  buscarFormatoVigente,
  formatoActual,
  listarVersiones,
  versionDTO,
} from "../../formatos.repository.js";
import {
  type Actor,
  advertenciasDeFormato,
  bloquearFormato,
  registrarVersionFormato,
  validarDocxFormato,
} from "../subir-formato/subir-formato.use-case.js";

export interface EditarFormatoInput {
  tipo: string;
  variante: number;
  reemplazos: readonly ReemplazoFormato[];
  /** Versión que la usuaria editó (`null` = base del sistema). */
  versionBase: number | null;
  nota?: string | undefined;
  /** false = solo simular (coincidencias y avisos). */
  aplicar: boolean;
  actor: Actor;
}

/** Coincidencias que se devuelven por reemplazo (el total siempre es exacto). */
const MAX_MUESTRAS = 20;

interface PlantillaVigente {
  readonly bytes: Buffer;
  readonly version: number | null;
  readonly nombreArchivo: string;
}

/** Plantilla que hoy se usa al generar: versión activa o base del sistema. */
async function plantillaVigente(
  storage: LocalStorageService,
  formato: FormatoCatalogo,
  ex: DbExecutor,
): Promise<Result<PlantillaVigente, DomainError>> {
  const versiones = await listarVersiones(ex, { tipo: formato.tipo, variante: formato.variante });
  const activa = versiones.find((v) => v.activa);
  if (activa) {
    const bytes = await storage.leer(activa.ruta);
    if (!bytes) {
      return fail(
        new DomainError(
          "NO_ENCONTRADO",
          `Falta el archivo de la versión ${activa.version}; active otra versión o restaure la base`,
        ),
      );
    }
    return ok({ bytes, version: activa.version, nombreArchivo: activa.nombreArchivo });
  }
  const base = formato.etapaBase
    ? obtenerPlantillaDocx(formato.tipo, formato.etapaBase, formato.variante)
    : null;
  if (!base) return fail(new DomainError("NO_ENCONTRADO", "Plantilla no disponible"));
  return ok({ bytes: base, version: null, nombreArchivo: formato.archivoBase });
}

interface Simulacion {
  readonly buffer: Buffer;
  readonly coincidencias: EditarFormatoResultadoDTO["coincidencias"];
}

/** Aplica los reemplazos en orden (cada uno sobre el resultado del anterior). */
function aplicarReemplazos(
  bytes: Buffer,
  reemplazos: readonly ReemplazoFormato[],
): Result<Simulacion, DomainError> {
  let buffer = bytes;
  const coincidencias: Simulacion["coincidencias"] = [];
  for (const { buscar, reemplazo } of reemplazos) {
    const r = reemplazarTextoDocx(buffer, buscar, reemplazo);
    if (!r) {
      return fail(
        new DomainError("DOCUMENTO_INVALIDO", "La plantilla vigente no es un DOCX válido"),
      );
    }
    buffer = r.buffer;
    coincidencias.push({
      buscar,
      reemplazo,
      total: r.total,
      muestras: r.muestras.slice(0, MAX_MUESTRAS),
    });
  }
  return ok({ buffer, coincidencias });
}

function notaAutomatica(reemplazos: readonly ReemplazoFormato[]): string {
  return `Edición en línea: ${reemplazos.map((r) => `«${r.buscar}» → «${r.reemplazo}»`).join("; ")}`;
}

function conflicto(): DomainError {
  return new DomainError(
    "CONFLICTO_CONCURRENCIA",
    "El formato cambió mientras lo editaba (otra versión quedó vigente). Vuelva a abrir el editor.",
  );
}

/**
 * Edición en línea de un formato: buscar y reemplazar texto en la plantilla
 * vigente. La simulación informa coincidencias y avisos sin tocar nada; al
 * aplicar se crea una versión nueva activa (la anterior queda en el historial).
 */
export class EditarFormatoUseCase {
  constructor(private readonly storage = new LocalStorageService()) {}

  async execute(
    input: EditarFormatoInput,
  ): Promise<Result<EditarFormatoResultadoDTO, DomainError>> {
    if (input.reemplazos.length === 0 || input.reemplazos.some((r) => !r.buscar.trim())) {
      return fail(new DomainError("VALIDACION_FALLIDA", "Indique el texto a buscar"));
    }
    const formato = await buscarFormatoVigente(input.tipo, input.variante);
    if (!formato) return fail(new DomainError("NO_ENCONTRADO", "Formato no encontrado"));
    const base = formato.etapaBase
      ? obtenerPlantillaDocx(formato.tipo, formato.etapaBase, formato.variante)
      : null;
    const etiquetasBase = base ? etiquetasDeDocx(base) : [];

    /** Simula sobre la plantilla vigente leída con `ex` (DB o transacción). */
    const simular = async (ex: DbExecutor) => {
      const vigente = await plantillaVigente(this.storage, formato, ex);
      if (!vigente.ok) return vigente;
      if (vigente.value.version !== input.versionBase) return fail(conflicto());
      const sim = aplicarReemplazos(vigente.value.bytes, input.reemplazos);
      if (!sim.ok) return sim;
      const nombre = vigente.value.nombreArchivo.toLowerCase().endsWith(".docx")
        ? vigente.value.nombreArchivo
        : `${formato.tipo}.docx`;
      const validado = validarDocxFormato(nombre, sim.value.buffer);
      if (!validado.ok) return validado;
      const advertencias = advertenciasDeFormato(
        formato.etapa,
        validado.value.etiquetas,
        etiquetasBase,
        validado.value.reparadas,
      );
      return ok({ ...sim.value, nombre, analisis: validado.value, advertencias });
    };

    if (!input.aplicar) {
      const s = await simular(db);
      if (!s.ok) return s;
      return ok({
        versionBase: input.versionBase,
        coincidencias: s.value.coincidencias,
        advertencias: s.value.advertencias,
        resultado: null,
      });
    }

    const uow = new DrizzleUnitOfWork(db);
    let rutaGuardada: string | null = null;
    try {
      const r = await uow.run(async (tx) => {
        // Bloquea antes de leer: la versión base no puede cambiar hasta el commit.
        await bloquearFormato(tx, formato.tipo, formato.variante);
        const s = await simular(tx);
        if (!s.ok) return s;
        const sinCoincidencia = s.value.coincidencias.find((c) => c.total === 0);
        if (sinCoincidencia) {
          return fail(
            new DomainError(
              "VALIDACION_FALLIDA",
              `No se encontró «${sinCoincidencia.buscar}» en la plantilla vigente`,
            ),
          );
        }
        const v = await registrarVersionFormato(
          tx,
          this.storage,
          {
            tipo: formato.tipo,
            variante: formato.variante,
            nombreArchivo: s.value.nombre,
            analisis: s.value.analisis,
            advertencias: s.value.advertencias,
            nota: input.nota?.trim() ? input.nota : notaAutomatica(input.reemplazos),
            actor: input.actor,
          },
          (ruta) => {
            rutaGuardada = ruta;
          },
        );
        if (!v.ok) return v;
        const dto = await formatoActual(formato.tipo, formato.variante, tx);
        if (!dto) return fail(new DomainError("NO_ENCONTRADO", "Formato no encontrado"));
        const resultado: SubirFormatoResultadoDTO = {
          formato: dto,
          version: versionDTO(v.value),
          reparadas: s.value.analisis.reparadas,
        };
        return ok({
          versionBase: input.versionBase,
          coincidencias: s.value.coincidencias,
          advertencias: s.value.advertencias,
          resultado,
        });
      });
      if (!r.ok && rutaGuardada) await this.storage.delete(rutaGuardada);
      return r;
    } catch (err) {
      if (rutaGuardada) await this.storage.delete(rutaGuardada);
      throw err;
    }
  }
}
