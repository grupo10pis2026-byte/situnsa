import { resolverNombreArchivoDescarga } from "@pis/domain/dist/documentos/plantillas.js";
import { renderAsync } from "docx-preview";
import {
  AlertCircle,
  Download,
  Eye,
  FileDown,
  FileType,
  Loader2,
  Printer,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { apiBaseUrl } from "../../api/client.js";
import {
  descargarArchivoProtegido,
  formatoDescargaUrl,
  formatoPdfUrl,
} from "../../api/expedientes.js";
import { apiFetch } from "../../api/session.js";
import { Button } from "../ui/button.js";
import { Dialogo } from "../ui/dialog.js";
import { useToast } from "../ui/toast.js";

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  codigoExpediente: string;
  formato: {
    id: string;
    tipo: string;
    nombre: string;
    version: number;
    pendientes?: string[];
  } | null;
}

/**
 * Modal de Vista Previa Oficial para formatos emitidos.
 * - Modo por defecto (Opción 1): Conversión fidedigna por servidor a PDF (Gotenberg / LibreOffice headless),
 *   con visor nativo integrado, zoom, paginado y descarga en PDF.
 * - Modo alternativo (Opción 2): Renderizado directo del .docx en el navegador (docx-preview).
 */
export function ModalVistaPreviaFormato({
  abierto,
  onCerrar,
  codigoExpediente,
  formato,
}: Props) {
  const avisar = useToast();
  const docxContainerRef = useRef<HTMLDivElement>(null);

  // Modo activo: "pdf" (Opción 1) o "docx" (Opción 2)
  const [modo, setModo] = useState<"pdf" | "docx">("pdf");

  // Estado de PDF
  const [cargandoPdf, setCargandoPdf] = useState(false);
  const [errorPdf, setErrorPdf] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [descargandoPdf, setDescargandoPdf] = useState(false);

  // Estado de DOCX
  const [cargandoDocx, setCargandoDocx] = useState(false);
  const [errorDocx, setErrorDocx] = useState<string | null>(null);
  const [blobDocx, setBlobDocx] = useState<Blob | null>(null);
  const [descargandoDocx, setDescargandoDocx] = useState(false);

  // Limpieza al cerrar o cambiar formato
  useEffect(() => {
    if (!abierto || !formato) {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
        setPdfUrl(null);
      }
      setBlobDocx(null);
      setErrorPdf(null);
      setErrorDocx(null);
      if (docxContainerRef.current) {
        docxContainerRef.current.innerHTML = "";
      }
      return;
    }

    let activo = true;

    // Cargar PDF (Opción 1)
    async function cargarPdf() {
      setCargandoPdf(true);
      setErrorPdf(null);
      try {
        const url = formatoPdfUrl(formato!.id);
        const res = await apiFetch(url);
        if (!res.ok) {
          const detalle = await res.json().catch(() => null);
          throw new Error(
            detalle?.error?.mensaje ??
              `Error ${res.status}: No se pudo generar la vista previa PDF`,
          );
        }
        const blob = await res.blob();
        if (!activo) return;
        const objectUrl = URL.createObjectURL(blob);
        setPdfUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return objectUrl;
        });
      } catch (err) {
        if (!activo) return;
        setErrorPdf(
          err instanceof Error
            ? err.message
            : "Error al comunicarse con el servidor de conversión PDF",
        );
      } finally {
        if (activo) setCargandoPdf(false);
      }
    }

    // Cargar DOCX (para descarga y Opción 2)
    async function cargarDocx() {
      setCargandoDocx(true);
      setErrorDocx(null);
      try {
        const url = formatoDescargaUrl(formato!.id);
        const res = await apiFetch(url);
        if (!res.ok) {
          throw new Error(`Error ${res.status}: No se pudo descargar el archivo Word original`);
        }
        const blob = await res.blob();
        if (!activo) return;
        setBlobDocx(blob);
      } catch (err) {
        if (!activo) return;
        setErrorDocx(
          err instanceof Error ? err.message : "Error al descargar el archivo Word original",
        );
      } finally {
        if (activo) setCargandoDocx(false);
      }
    }

    void cargarPdf();
    void cargarDocx();

    return () => {
      activo = false;
    };
  }, [abierto, formato?.id]);

  // Renderizar docx si el usuario cambia al modo "docx"
  useEffect(() => {
    if (modo !== "docx" || !blobDocx || !docxContainerRef.current) return;

    let cancelado = false;
    docxContainerRef.current.innerHTML = "";

    void renderAsync(blobDocx, docxContainerRef.current, undefined, {
      className: "docx",
      inWrapper: true,
      hideWrapperOnPrint: true,
      ignoreWidth: false,
      ignoreHeight: false,
      ignoreFonts: false,
      breakPages: true,
      renderHeaders: true,
      renderFooters: true,
      useBase64URL: true,
    }).catch((err) => {
      if (!cancelado) {
        setErrorDocx(
          err instanceof Error
            ? err.message
            : "No se pudo renderizar la vista previa de Word",
        );
      }
    });

    return () => {
      cancelado = true;
    };
  }, [modo, blobDocx]);

  if (!formato) return null;

  const nombrePdf = resolverNombreArchivoDescarga(codigoExpediente, formato.tipo, "pdf");
  const nombreDocx = resolverNombreArchivoDescarga(codigoExpediente, formato.tipo, "docx");

  async function handleDescargarPdf() {
    try {
      setDescargandoPdf(true);
      await descargarArchivoProtegido(formatoPdfUrl(formato!.id, true), nombrePdf);
      avisar("Descarga PDF iniciada", "ok");
    } catch (e) {
      avisar(e instanceof Error ? e.message : "No se pudo descargar el PDF", "error");
    } finally {
      setDescargandoPdf(false);
    }
  }

  async function handleDescargarDocx() {
    try {
      setDescargandoDocx(true);
      await descargarArchivoProtegido(formatoDescargaUrl(formato!.id), nombreDocx);
      avisar("Descarga Word iniciada", "ok");
    } catch (e) {
      avisar(e instanceof Error ? e.message : "No se pudo descargar el Word", "error");
    } finally {
      setDescargandoDocx(false);
    }
  }

  return (
    <Dialogo
      abierto={abierto}
      onAbierto={(v) => !v && onCerrar()}
      titulo=""
      ancho="max-w-5xl"
    >
      <div className="flex flex-col gap-3 -mt-2">
        {/* Cabecera del visor */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-navy-50 text-navy-700">
              <Eye size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-navy-950 sm:text-base">
                {formato.nombre}
              </h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                  Versión {formato.version}
                </span>
                <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 border border-emerald-200">
                  {modo === "pdf" ? "PDF Oficial (Gotenberg)" : "Word (.docx)"}
                </span>
                {formato.pendientes && formato.pendientes.length > 0 && (
                  <span className="rounded bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 border border-amber-200">
                    {formato.pendientes.length} campo(s) pendiente(s)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Acciones principales */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Selector de modo rápido (listo para alternar entre Opción 1 y Opción 2) */}
            <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setModo("pdf")}
                className={`rounded px-2 py-1 font-medium transition-colors ${
                  modo === "pdf"
                    ? "bg-white text-navy-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                title="Ver PDF fiel convertido por LibreOffice"
              >
                PDF (Opción 1)
              </button>
              <button
                type="button"
                onClick={() => setModo("docx")}
                className={`rounded px-2 py-1 font-medium transition-colors ${
                  modo === "docx"
                    ? "bg-white text-navy-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                title="Ver Word renderizado en el navegador"
              >
                Word (Opción 2)
              </button>
            </div>

            <Button
              tamano="sm"
              variante="primario"
              onClick={() => void handleDescargarPdf()}
              disabled={descargandoPdf || (!pdfUrl && cargandoPdf)}
              title="Descargar este formato en archivo PDF oficial"
              type="button"
            >
              {descargandoPdf ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Download size={14} />
              )}
              Descargar PDF
            </Button>

            <Button
              tamano="sm"
              variante="contorno"
              onClick={() => void handleDescargarDocx()}
              disabled={descargandoDocx || (!blobDocx && cargandoDocx)}
              title="Descargar archivo Word original (.docx)"
              type="button"
            >
              {descargandoDocx ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <FileDown size={14} />
              )}
              Descargar Word (.docx)
            </Button>
          </div>
        </div>

        {/* Cuerpo del visor: MODO PDF (Opción 1) */}
        {modo === "pdf" && (
          <div className="relative min-h-[500px] h-[72vh] w-full rounded-lg border border-slate-200 bg-slate-100 overflow-hidden flex flex-col">
            {cargandoPdf && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/80 backdrop-blur-xs gap-3">
                <Loader2 size={36} className="animate-spin text-navy-600" />
                <p className="text-sm font-medium text-slate-700">
                  Convirtiendo documento oficial Word a PDF con alta fidelidad...
                </p>
                <p className="text-xs text-slate-500">
                  Generado directamente desde la plantilla OpenXML oficial
                </p>
              </div>
            )}

            {errorPdf ? (
              <div className="m-auto max-w-md p-6 text-center">
                <AlertCircle className="mx-auto size-12 text-rose-500 mb-3" />
                <h4 className="text-base font-bold text-slate-900 mb-1">
                  No se pudo cargar la vista previa PDF
                </h4>
                <p className="text-xs text-slate-600 mb-4">{errorPdf}</p>
                <div className="flex justify-center gap-2">
                  <Button
                    tamano="sm"
                    variante="contorno"
                    onClick={() => setModo("docx")}
                  >
                    <FileType size={14} />
                    Ver con visor Word integrado
                  </Button>
                  <Button
                    tamano="sm"
                    variante="primario"
                    onClick={() => {
                      setCargandoPdf(true);
                      setErrorPdf(null);
                      void apiFetch(formatoPdfUrl(formato.id))
                        .then((res) => {
                          if (!res.ok) throw new Error(`HTTP ${res.status}`);
                          return res.blob();
                        })
                        .then((blob) => setPdfUrl(URL.createObjectURL(blob)))
                        .catch((e) => setErrorPdf(e.message))
                        .finally(() => setCargandoPdf(false));
                    }}
                  >
                    <RefreshCw size={14} />
                    Reintentar
                  </Button>
                </div>
              </div>
            ) : pdfUrl ? (
              <iframe
                src={`${pdfUrl}#toolbar=1&navpanes=0`}
                className="h-full w-full border-0"
                title={`Vista previa PDF - ${formato.nombre}`}
              />
            ) : null}
          </div>
        )}

        {/* Cuerpo del visor: MODO WORD (Opción 2) */}
        {modo === "docx" && (
          <div className="relative min-h-[500px] h-[72vh] w-full rounded-lg border border-slate-200 bg-slate-100 overflow-hidden flex flex-col">
            {cargandoDocx && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/80 backdrop-blur-xs gap-3">
                <Loader2 size={36} className="animate-spin text-navy-600" />
                <p className="text-sm font-medium text-slate-700">
                  Descargando archivo Word oficial...
                </p>
              </div>
            )}

            {errorDocx ? (
              <div className="m-auto max-w-md p-6 text-center">
                <AlertCircle className="mx-auto size-12 text-rose-500 mb-3" />
                <h4 className="text-base font-bold text-slate-900 mb-1">
                  Error al cargar documento Word
                </h4>
                <p className="text-xs text-slate-600 mb-4">{errorDocx}</p>
                <Button
                  tamano="sm"
                  variante="primario"
                  onClick={() => setModo("pdf")}
                >
                  Regresar a vista PDF
                </Button>
              </div>
            ) : (
              <div className="h-full w-full overflow-auto bg-slate-200 p-2 sm:p-4">
                <div
                  ref={docxContainerRef}
                  className="docx-viewer-host mx-auto max-w-[850px] bg-white shadow-md rounded"
                />
              </div>
            )}
          </div>
        )}

        {/* Pie de modal con leyenda de fidelidad */}
        <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 border-t border-slate-200 pt-2 px-1">
          <span>
            {modo === "pdf"
              ? "Vista generada mediante motor LibreOffice headless (Gotenberg) preservando el 100% de márgenes y tipografía."
              : "Vista previa HTML interactiva generada desde el paquete OpenXML Word."}
          </span>
          <span className="font-mono text-[11px] text-slate-400">
            {modo === "pdf" ? nombrePdf : nombreDocx}
          </span>
        </div>
      </div>
    </Dialogo>
  );
}
