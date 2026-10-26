/**
 * Capa de aplicación de POST /api/documentos/:id/analisis; recibe metadatos ya autorizados por analisis.routes.ts.
 * Combina infra/pdf con @pis/domain y retorna el DTO compartido, sin escribir hallazgos en DB.
 */
import { type AnalisisDocumentoDTO, AnalisisDocumentoResponseSchema } from "@pis/contracts";
import {
  analizarCaratulaResumen,
  analizarDocumentoSubido,
  type DatosAnalisisDocumento,
} from "@pis/domain";
import {
  extraerPrimerasPaginas,
  type TextoPdf,
} from "../../../../infra/pdf/extraer-primeras-paginas.js";
import { revisarResumen } from "../../../../infra/pdf/revisar-resumen.js";

export interface DocumentoAnalizable {
  id: string;
  ruta: string;
  version: number;
  sha256: string;
  tipo?: string;
}

/** Orquesta extracción, dominio y revisión opcional para POST /api/documentos/:id/analisis. */
export class AnalizarDocumentoUseCase {
  /** Inyecta proveedores para probar fallos y contratos sin PDF real ni llamadas a Gemini. */
  constructor(
    private readonly extraer: (
      ruta: string,
      base: string,
      sha256?: string,
    ) => Promise<TextoPdf> = extraerPrimerasPaginas,
    private readonly revisar: typeof revisarResumen = revisarResumen,
  ) {}

  /**
   * Asocia el resultado a id, versión y hash del documento, sin persistir hallazgos.
   * Un fallo del parser devuelve NO_EVALUABLE; un fallo editorial conserva controles locales.
   * editorial=false omite por completo la revisión de IA.
   */
  async execute(
    documento: DocumentoAnalizable,
    datos: DatosAnalisisDocumento,
    base: string,
    editorial: boolean,
  ): Promise<AnalisisDocumentoDTO> {
    const esPlan = documento.tipo === "PLAN_ESTRUCTURADO";
    let texto: TextoPdf;
    try {
      texto = await this.extraer(documento.ruta, base, documento.sha256);
    } catch {
      const fallback = esPlan
        ? analizarCaratulaResumen([], datos, 0)
        : analizarDocumentoSubido(documento.tipo ?? "DOCUMENTO", [], datos, 0);
      return AnalisisDocumentoResponseSchema.parse({
        documentoId: documento.id,
        version: documento.version,
        sha256: documento.sha256,
        paginasAnalizadas: [],
        tituloRegistrado: datos.titulo,
        ...fallback,
        editorial: editorial ? "NO_DISPONIBLE" : "NO_SOLICITADA",
      });
    }
    const resultado = esPlan
      ? analizarCaratulaResumen(texto.paginas, datos, texto.totalPaginas)
      : analizarDocumentoSubido(
          documento.tipo ?? "DOCUMENTO",
          texto.paginas,
          datos,
          texto.totalPaginas,
        );
    let revision: AnalisisDocumentoDTO["editorial"] = "NO_SOLICITADA";
    if (editorial) {
      revision = "NO_DISPONIBLE";
      if (resultado.resumenCompleto) {
        try {
          resultado.hallazgos.push(...(await this.revisar(resultado.resumen)));
          revision = "COMPLETADA";
        } catch {
          resultado.hallazgos.push({
            tipo: "REVISION_EDITORIAL",
            severidad: "INFO",
            mensaje:
              "La revisión editorial no está disponible. Los controles deterministas se conservan.",
          });
        }
      }
      if (revision !== "COMPLETADA" && resultado.estado === "COMPLETADO")
        resultado.estado = "PARCIAL";
    }
    return AnalisisDocumentoResponseSchema.parse({
      documentoId: documento.id,
      version: documento.version,
      sha256: documento.sha256,
      paginasAnalizadas: texto.paginas.map((p) => p.numero),
      tituloRegistrado: datos.titulo,
      ...resultado,
      editorial: revision,
    });
  }
}
