import { Download, FileDown, FileText, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { descargarArchivoProtegido, obtenerBlobArchivoProtegido } from "../../api/expedientes.js";
import { Button } from "../ui/button.js";
import { Dialogo } from "../ui/dialog.js";
import { StatusBadge } from "../ui/status-badge.js";

export interface ModalVisorDocumentoProps {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  subtitulo?: string;
  documentoUrl: string;
  nombrePdf?: string;
  formatoUrl?: string | null;
  nombreDocx?: string;
  version?: number | null;
  estado?: string;
}

/**
 * Visor modal in-situ de documentos (PDF):
 * Despliega el documento dentro de la misma pantalla sin cambiar de pestaña,
 * y centraliza las opciones de descarga en PDF y Word (.docx).
 */
export function ModalVisorDocumento({
  abierto,
  onCerrar,
  titulo,
  subtitulo,
  documentoUrl,
  nombrePdf = "documento.pdf",
  formatoUrl,
  nombreDocx = "formato.docx",
  version,
  estado,
}: ModalVisorDocumentoProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    let urlActual: string | null = null;

    if (abierto && documentoUrl) {
      setCargando(true);
      setError(null);
      setBlobUrl(null);

      obtenerBlobArchivoProtegido(documentoUrl)
        .then(({ blobUrl }) => {
          if (!cancelado) {
            urlActual = blobUrl;
            setBlobUrl(blobUrl);
            setCargando(false);
          } else {
            URL.revokeObjectURL(blobUrl);
          }
        })
        .catch((err) => {
          if (!cancelado) {
            setError(err instanceof Error ? err.message : "No se pudo cargar el documento");
            setCargando(false);
          }
        });
    }

    return () => {
      cancelado = true;
      if (urlActual) {
        URL.revokeObjectURL(urlActual);
      }
    };
  }, [abierto, documentoUrl]);

  function descargarPdfLocal(): void {
    if (!blobUrl) return;
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = nombrePdf.endsWith(".pdf") ? nombrePdf : `${nombrePdf}.pdf`;
    document.body.append(a);
    a.click();
    a.remove();
  }

  async function descargarWordLocal(): Promise<void> {
    if (!formatoUrl) return;
    const filename = nombreDocx.endsWith(".docx") ? nombreDocx : `${nombreDocx}.docx`;
    await descargarArchivoProtegido(formatoUrl, filename);
  }

  return (
    <Dialogo
      abierto={abierto}
      onAbierto={(v) => {
        if (!v) onCerrar();
      }}
      titulo=""
      ancho="max-w-5xl w-[95vw]"
    >
      <div className="-mt-3 space-y-3">
        {/* Barra superior con metadatos y acciones de descarga */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-navy-950 truncate">{titulo}</h2>
              {version !== null && version !== undefined && (
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-700">
                  v{version}
                </span>
              )}
              {estado && <StatusBadge estado={estado} />}
            </div>
            {subtitulo && <p className="mt-0.5 text-xs text-grafito-600 truncate">{subtitulo}</p>}
          </div>

          <div className="flex items-center gap-2">
            <Button
              tamano="sm"
              variante="contorno"
              disabled={!blobUrl || cargando}
              onClick={descargarPdfLocal}
              type="button"
              title="Descargar este documento en formato PDF"
            >
              <Download size={14} />
              Descargar PDF
            </Button>

            {formatoUrl && (
              <Button
                tamano="sm"
                variante="contorno"
                onClick={() => void descargarWordLocal()}
                type="button"
                title="Descargar formato editable en Word (.docx)"
              >
                <FileDown size={14} />
                Descargar Word
              </Button>
            )}
          </div>
        </div>

        {/* Contenido principal: visor embebido */}
        <div className="relative min-h-[500px] h-[72vh] w-full rounded-xl border border-slate-200 bg-slate-100 overflow-hidden">
          {cargando && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-grafito-600">
              <Loader2 className="animate-spin text-navy-800" size={32} />
              <p className="text-sm font-medium">Cargando documento para previsualización…</p>
            </div>
          )}

          {error && (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
              <FileText className="text-red-500" size={36} />
              <p className="text-sm font-semibold text-red-700">{error}</p>
              <p className="text-xs text-grafito-600">
                Ocurrió un problema al obtener el archivo. Puedes intentar abrirlo nuevamente o
                descargarlo.
              </p>
            </div>
          )}

          {blobUrl && !cargando && !error && (
            <iframe
              src={blobUrl}
              className="h-full w-full border-0 bg-white"
              title={`Visualización de ${titulo}`}
            />
          )}
        </div>
      </div>
    </Dialogo>
  );
}
