import { type AnalisisDocumentoDTO, AnalisisDocumentoResponseSchema } from "@pis/contracts";
import { analizarCaratulaResumen, type DatosAnalisisDocumento } from "@pis/domain";
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
}

export class AnalizarDocumentoUseCase {
  constructor(
    private readonly extraer: (
      ruta: string,
      base: string,
      sha256?: string,
    ) => Promise<TextoPdf> = extraerPrimerasPaginas,
    private readonly revisar: typeof revisarResumen = revisarResumen,
  ) {}

  async execute(
    documento: DocumentoAnalizable,
    datos: DatosAnalisisDocumento,
    base: string,
    editorial: boolean,
  ): Promise<AnalisisDocumentoDTO> {
    let texto: TextoPdf;
    try {
      texto = await this.extraer(documento.ruta, base, documento.sha256);
    } catch {
      return AnalisisDocumentoResponseSchema.parse({
        documentoId: documento.id,
        version: documento.version,
        sha256: documento.sha256,
        paginasAnalizadas: [],
        tituloRegistrado: datos.titulo,
        ...analizarCaratulaResumen([], datos, 0),
        editorial: editorial ? "NO_DISPONIBLE" : "NO_SOLICITADA",
      });
    }
    const resultado = analizarCaratulaResumen(texto.paginas, datos, texto.totalPaginas);
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
