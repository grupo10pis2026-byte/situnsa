import type { SubirFormatoResultadoDTO } from "@pis/contracts";
import { type DbExecutor, db, plantillasFormato } from "@pis/db";
import { construirDatosDocumento, DomainError, fail, ok, type Result } from "@pis/domain";
import { and, eq, max, sql } from "drizzle-orm";
import { DrizzleUnitOfWork } from "../../../../infra/db/unit-of-work.js";
import {
  analizarPlantillaDocx,
  etiquetasDeDocx,
} from "../../../../infra/docx/analizar-plantilla.js";
import { obtenerPlantillaDocx } from "../../../../infra/docx/render-docx.js";
import { LocalStorageService } from "../../../../infra/storage/local-storage.service.js";
import {
  buscarFormatoVigente,
  formatoActual,
  type VersionRow,
  versionDTO,
  versionPorId,
} from "../../formatos.repository.js";

export interface Actor {
  id: string;
  dni: string;
}

export interface SubirFormatoInput {
  tipo: string;
  variante: number;
  nombreArchivo: string;
  bytes: Uint8Array;
  nota?: string | undefined;
  actor: Actor;
}

/** 10 MB: las plantillas institucionales pesan < 1 MB (logos incluidos). */
export const TAMANO_MAXIMO_FORMATO = 10 * 1024 * 1024;

/** Etiquetas que el sistema sabe rellenar (las demás quedan resaltadas como pendientes). */
let conocidas: Set<string> | null = null;
export function etiquetasConocidas(): Set<string> {
  if (conocidas) return conocidas;
  const persona = { nombres: "X", apellidos: "X", dni: "0", cui: null, grado: null };
  const claves = Object.keys(
    construirDatosDocumento(
      {
        codigo: "SET000",
        titulo: "X",
        programa: "X",
        modalidad: "TESIS",
        participante1: persona,
        participante2: persona,
        asesor: persona,
        datosAdmin: {},
        sustentacion: { fecha: "2026-01-01", hora: "10:00", lugar: "X", actaVeredicto: null },
        jurado: [],
        validaciones: { similitud: null, urlRepositorio: null },
      },
      new Date(),
    ),
  );
  conocidas = new Set([...claves.map((k) => k.toUpperCase()), "COASESOR", "CO ASESOR"]);
  return conocidas;
}

/**
 * Advertencias (no bloquean): etiquetas que el sistema no rellena y
 * etiquetas de la plantilla base que la nueva versión ya no usa.
 */
export function advertenciasPlantilla(
  etiquetas: readonly string[],
  conocidasSet: ReadonlySet<string>,
  etiquetasBase: readonly string[],
  reparadas: number,
): string[] {
  const avisos: string[] = [];
  if (etiquetas.length === 0) {
    avisos.push("La plantilla no tiene etiquetas <<CAMPO>>: se generará sin datos del expediente.");
  }
  const desconocidas = etiquetas.filter((e) => !conocidasSet.has(e));
  if (desconocidas.length > 0) {
    avisos.push(
      `Etiquetas que el sistema no reconoce (quedarán resaltadas): ${desconocidas.map((e) => `<<${e}>>`).join(", ")}.`,
    );
  }
  const nuevas = new Set(etiquetas);
  const omitidas = etiquetasBase.filter((e) => !nuevas.has(e));
  if (omitidas.length > 0) {
    avisos.push(
      `Etiquetas de la plantilla base que esta versión ya no usa: ${omitidas.map((e) => `<<${e}>>`).join(", ")}.`,
    );
  }
  if (reparadas > 0) {
    avisos.push(`Se unieron ${reparadas} etiqueta(s) que Word había partido en fragmentos.`);
  }
  return avisos;
}

/** DOCX ya validado y con sus etiquetas reparadas (`analizarPlantillaDocx`). */
export type AnalisisFormato = NonNullable<ReturnType<typeof analizarPlantillaDocx>>;

/** Valida extensión, tamaño y estructura del DOCX subido (no toca la DB). */
export function validarDocxFormato(
  nombreArchivo: string,
  bytes: Uint8Array,
): Result<AnalisisFormato, DomainError> {
  if (!nombreArchivo.toLowerCase().endsWith(".docx")) {
    return fail(
      new DomainError("DOCUMENTO_INVALIDO", "El formato debe ser un archivo Word (.docx)"),
    );
  }
  if (bytes.length === 0 || bytes.length > TAMANO_MAXIMO_FORMATO) {
    return fail(new DomainError("DOCUMENTO_INVALIDO", "El archivo está vacío o supera 10 MB"));
  }
  const analisis = analizarPlantillaDocx(bytes);
  if (!analisis) {
    return fail(
      new DomainError("DOCUMENTO_INVALIDO", "El archivo no es un documento Word (.docx) válido"),
    );
  }
  return ok(analisis);
}

/**
 * Serializa los cambios de versión de un formato dentro de `tx` (correlativo
 * de versión y lectura de la versión vigente). Reentrante en la misma transacción.
 */
export async function bloquearFormato(tx: DbExecutor, tipo: string, variante: number) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`formato:${tipo}:${variante}`}))`);
}

export interface RegistrarVersionInput {
  tipo: string;
  variante: number;
  nombreArchivo: string;
  analisis: AnalisisFormato;
  advertencias: string[];
  nota?: string | undefined;
  actor: Actor;
}

/**
 * Guarda el DOCX en el volumen y registra la nueva versión activa dentro de
 * `tx` (la anterior queda en el historial). Devuelve la ruta guardada para
 * que el llamador la borre si la transacción se revierte.
 */
export async function registrarVersionFormato(
  tx: DbExecutor,
  storage: LocalStorageService,
  input: RegistrarVersionInput,
  alGuardar: (ruta: string) => void,
): Promise<Result<VersionRow, DomainError>> {
  // Serializa subidas concurrentes del mismo formato (correlativo de versión).
  await bloquearFormato(tx, input.tipo, input.variante);
  const ultima = await tx
    .select({ v: max(plantillasFormato.version) })
    .from(plantillasFormato)
    .where(
      and(eq(plantillasFormato.tipo, input.tipo), eq(plantillasFormato.variante, input.variante)),
    );
  const version = (ultima[0]?.v ?? 0) + 1;
  const guardado = await storage.savePlantilla(
    input.variante,
    `${input.tipo}_v${version}.docx`,
    input.analisis.buffer,
  );
  alGuardar(guardado.ruta);
  await tx
    .update(plantillasFormato)
    .set({ activa: false })
    .where(
      and(
        eq(plantillasFormato.tipo, input.tipo),
        eq(plantillasFormato.variante, input.variante),
        eq(plantillasFormato.activa, true),
      ),
    );
  const ins = await tx
    .insert(plantillasFormato)
    .values({
      tipo: input.tipo,
      variante: input.variante,
      version,
      nombreArchivo: input.nombreArchivo.slice(0, 255),
      ruta: guardado.ruta,
      sha256: guardado.sha256,
      tamanoBytes: input.analisis.buffer.length,
      etiquetas: input.analisis.etiquetas,
      advertencias: input.advertencias,
      nota: input.nota?.trim() ? input.nota.trim().slice(0, 500) : null,
      activa: true,
      creadoPor: input.actor.id || null,
    })
    .returning({ id: plantillasFormato.id });
  const id = ins[0]?.id;
  if (!id) return fail(new DomainError("VALIDACION_FALLIDA", "No se pudo registrar la versión"));
  const fila = await versionPorId(id, tx);
  return fila ? ok(fila) : fail(new DomainError("NO_ENCONTRADO", "Versión no encontrada"));
}

/**
 * Sube una nueva versión de un formato y la deja activa (la anterior queda
 * en el historial para volver a ella).
 */
export class SubirFormatoUseCase {
  constructor(private readonly storage = new LocalStorageService()) {}

  async execute(input: SubirFormatoInput): Promise<Result<SubirFormatoResultadoDTO, DomainError>> {
    const formato = await buscarFormatoVigente(input.tipo, input.variante);
    if (!formato) return fail(new DomainError("NO_ENCONTRADO", "Formato no encontrado"));
    const validado = validarDocxFormato(input.nombreArchivo, input.bytes);
    if (!validado.ok) return validado;
    const analisis = validado.value;
    const base = formato.etapaBase
      ? obtenerPlantillaDocx(formato.tipo, formato.etapaBase, formato.variante)
      : null;
    const advertencias = advertenciasPlantilla(
      analisis.etiquetas,
      etiquetasConocidas(),
      base ? etiquetasDeDocx(base) : [],
      analisis.reparadas,
    );

    const uow = new DrizzleUnitOfWork(db);
    let rutaGuardada: string | null = null;
    try {
      const r = await uow.run(async (tx) => {
        const v = await registrarVersionFormato(
          tx,
          this.storage,
          {
            tipo: formato.tipo,
            variante: formato.variante,
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
        const dto = await formatoActual(formato.tipo, formato.variante, tx);
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
