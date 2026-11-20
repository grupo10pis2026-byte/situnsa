import type { EstadoConformidadDocumento, SolicitudDocumentoDTO } from "@pis/contracts";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Eye,
  FileCheck,
  FileText,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";
import { useRef, useState } from "react";
import { abrirArchivoProtegido, descargarArchivoProtegido } from "../../../api/expedientes.js";
import { documentoSolicitudUrl } from "../../../api/solicitudes.js";
import { useArchivoProtegido } from "../../../api/use-archivo-protegido.js";
import { cn } from "../../../utils/cn.js";
import { Button } from "../../ui/button.js";
import { Card } from "../../ui/card.js";
import { EmptyState } from "../../ui/empty-state.js";
import { StatusBadge } from "../../ui/status-badge.js";

/**
 * Pestaña "Documentos" del detalle de solicitud (CR-04): checklist a la
 * izquierda y vista previa del documento seleccionado a la derecha, para
 * revisar y marcar conformidad sin abrir otra pestaña.
 */

export interface PanelDocumentosSolicitudProps {
  solicitudId: string;
  documentos: SolicitudDocumentoDTO[];
  /** Solicitud aceptada o rechazada: solo lectura. */
  cerrada: boolean;
  cambiandoConformidad: boolean;
  onCambiarConformidad: (documentoId: string, estado: EstadoConformidadDocumento) => void;
}

function esImagen(doc: SolicitudDocumentoDTO): boolean {
  return doc.mimeType.startsWith("image/");
}

function pesoLegible(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PanelDocumentosSolicitud({
  solicitudId,
  documentos,
  cerrada,
  cambiandoConformidad,
  onCambiarConformidad,
}: PanelDocumentosSolicitudProps) {
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(documentos[0]?.id ?? null);
  const visorRef = useRef<HTMLDivElement>(null);

  const indice = Math.max(
    0,
    documentos.findIndex((d) => d.id === seleccionadoId),
  );
  const actual = documentos[indice] ?? null;
  const conformes = documentos.filter((d) => d.estadoConformidad === "CONFORME").length;

  function seleccionar(id: string) {
    setSeleccionadoId(id);
    // En pantallas angostas el visor queda debajo de la lista: llevar la vista a él.
    if (window.matchMedia("(max-width: 1023px)").matches) {
      visorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  if (documentos.length === 0) {
    return (
      <Card className="p-6">
        <EmptyState
          titulo="Sin documentos"
          descripcion="La solicitud no tiene archivos adjuntos."
        />
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      {/* Columna izquierda: checklist */}
      <Card className="space-y-3 self-start p-4">
        <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-xs font-bold tracking-wider text-grafito-600 uppercase">
              Checklist documentario
            </h2>
            <p className="text-[11px] text-grafito-500">
              Seleccione un documento para previsualizarlo y marque su conformidad.
            </p>
          </div>
          <span className="shrink-0 font-mono text-xs font-bold text-navy-950">
            {conformes} / {documentos.length}
          </span>
        </div>

        <ul className="space-y-2">
          {documentos.map((doc) => {
            const activo = doc.id === actual?.id;
            const Icono = esImagen(doc) ? ImageIcon : FileText;
            return (
              <li key={doc.id}>
                <button
                  aria-current={activo ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                    activo
                      ? "border-navy-800 bg-navy-100/40 ring-1 ring-navy-800"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                  )}
                  onClick={() => seleccionar(doc.id)}
                  type="button"
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                      activo ? "bg-navy-950 text-white" : "bg-slate-100 text-slate-600",
                    )}
                  >
                    <Icono size={16} />
                  </span>
                  <span className="min-w-0 flex-1 text-xs">
                    <span className="block truncate font-bold text-navy-950">
                      {doc.nombreOriginal}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-grafito-500">
                      {doc.tipo} · {pesoLegible(doc.pesoBytes)} · v{doc.version}
                    </span>
                  </span>
                  <StatusBadge estado={doc.estadoConformidad} />
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      {/* Columna derecha: vista previa */}
      <div className="scroll-mt-4 lg:sticky lg:top-4 lg:self-start" ref={visorRef}>
        {actual && (
          <VisorDocumento
            cambiandoConformidad={cambiandoConformidad}
            cerrada={cerrada}
            doc={actual}
            indice={indice}
            onAnterior={() => {
              const d = documentos[indice - 1];
              if (d) setSeleccionadoId(d.id);
            }}
            onCambiarConformidad={onCambiarConformidad}
            onSiguiente={() => {
              const d = documentos[indice + 1];
              if (d) setSeleccionadoId(d.id);
            }}
            solicitudId={solicitudId}
            total={documentos.length}
          />
        )}
      </div>
    </div>
  );
}

function VisorDocumento({
  solicitudId,
  doc,
  indice,
  total,
  cerrada,
  cambiandoConformidad,
  onAnterior,
  onSiguiente,
  onCambiarConformidad,
}: {
  solicitudId: string;
  doc: SolicitudDocumentoDTO;
  indice: number;
  total: number;
  cerrada: boolean;
  cambiandoConformidad: boolean;
  onAnterior: () => void;
  onSiguiente: () => void;
  onCambiarConformidad: (documentoId: string, estado: EstadoConformidadDocumento) => void;
}) {
  const url = documentoSolicitudUrl(solicitudId, doc.id);
  const { objetoUrl, tipoMime, cargando, error } = useArchivoProtegido(url);
  const mime = tipoMime || doc.mimeType;
  const [errorAccion, setErrorAccion] = useState<string | null>(null);

  async function ejecutar(accion: () => Promise<void>) {
    setErrorAccion(null);
    try {
      await accion();
    } catch (e) {
      setErrorAccion(e instanceof Error ? e.message : "No se pudo completar la acción");
    }
  }

  return (
    <Card className="flex flex-col overflow-hidden">
      {/* Cabecera del visor */}
      <div className="space-y-2.5 border-b border-slate-200/80 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Eye className="shrink-0 text-navy-800" size={15} />
              <h3 className="truncate text-sm font-bold text-navy-950" title={doc.nombreOriginal}>
                {doc.nombreOriginal}
              </h3>
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                v{doc.version}
              </span>
              <StatusBadge estado={doc.estadoConformidad} />
            </div>
            <p className="mt-0.5 text-[11px] text-grafito-500">
              {doc.tipo} · {pesoLegible(doc.pesoBytes)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              aria-label="Documento anterior"
              disabled={indice === 0}
              onClick={onAnterior}
              tamano="icono"
              title="Documento anterior"
              type="button"
              variante="fantasma"
            >
              <ChevronLeft size={16} />
            </Button>
            <span className="font-mono text-[11px] text-grafito-600">
              {indice + 1}/{total}
            </span>
            <Button
              aria-label="Documento siguiente"
              disabled={indice >= total - 1}
              onClick={onSiguiente}
              tamano="icono"
              title="Documento siguiente"
              type="button"
              variante="fantasma"
            >
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          {!cerrada ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                disabled={cambiandoConformidad || doc.estadoConformidad === "CONFORME"}
                onClick={() => onCambiarConformidad(doc.id, "CONFORME")}
                tamano="sm"
                type="button"
                variante="exito"
              >
                <FileCheck size={14} /> Conforme
              </Button>
              <Button
                className="border-orange-300 text-orange-800 hover:border-orange-400 hover:bg-orange-50"
                disabled={cambiandoConformidad || doc.estadoConformidad === "OBSERVADO"}
                onClick={() => onCambiarConformidad(doc.id, "OBSERVADO")}
                tamano="sm"
                type="button"
                variante="contorno"
              >
                <AlertTriangle size={14} /> Observado
              </Button>
            </div>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-1.5">
            <Button
              onClick={() =>
                void ejecutar(() => descargarArchivoProtegido(url, doc.nombreOriginal))
              }
              tamano="sm"
              title="Descargar archivo"
              type="button"
              variante="contorno"
            >
              <Download size={14} /> Descargar
            </Button>
            <Button
              onClick={() => void ejecutar(() => abrirArchivoProtegido(url))}
              tamano="sm"
              title="Abrir en una pestaña nueva"
              type="button"
              variante="fantasma"
            >
              <ExternalLink size={14} /> Abrir en pestaña
            </Button>
          </div>
        </div>
        {errorAccion && <p className="text-[11px] font-medium text-red-700">{errorAccion}</p>}
      </div>

      {/* Cuerpo: visor */}
      <div className="relative h-[70vh] min-h-[420px] bg-slate-100">
        {cargando && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-grafito-600">
            <Loader2 className="animate-spin text-navy-800" size={28} />
            <p className="text-xs font-medium">Cargando vista previa…</p>
          </div>
        )}
        {error && !cargando && (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <FileText className="text-red-500" size={32} />
            <p className="text-sm font-semibold text-red-700">{error}</p>
            <p className="text-xs text-grafito-600">
              Intente descargarlo o abrirlo en otra pestaña.
            </p>
          </div>
        )}
        {objetoUrl &&
          !cargando &&
          !error &&
          (mime.startsWith("image/") ? (
            <div className="flex h-full items-center justify-center overflow-auto p-4">
              <img
                alt={`Vista previa de ${doc.nombreOriginal}`}
                className="max-h-full max-w-full rounded shadow-elevado"
                src={objetoUrl}
              />
            </div>
          ) : mime === "application/pdf" ? (
            <iframe
              className="h-full w-full border-0 bg-white"
              src={objetoUrl}
              title={`Vista previa de ${doc.nombreOriginal}`}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
              <FileText className="text-slate-400" size={32} />
              <p className="text-sm font-semibold text-navy-950">
                Este formato no admite vista previa
              </p>
              <p className="text-xs text-grafito-600">Descárguelo para revisarlo.</p>
            </div>
          ))}
      </div>
    </Card>
  );
}
