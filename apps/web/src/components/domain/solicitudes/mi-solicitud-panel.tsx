import type { MiSolicitudDocumentoDTO, MiSolicitudDTO } from "@pis/contracts";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  RefreshCw,
  Send,
  XCircle,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { abrirArchivoProtegido } from "../../../api/expedientes.js";
import { documentoSolicitudUrl, useSubsanarMiSolicitud } from "../../../api/solicitudes.js";
import { cn } from "../../../utils/cn.js";
import { Button } from "../../ui/button.js";
import { Card, CardEncabezado } from "../../ui/card.js";
import { Dropzone } from "../../ui/dropzone.js";
import { StatusBadge } from "../../ui/status-badge.js";

/**
 * Portal del tesista antes de tener expediente: estado de su solicitud de
 * Mesa de Partes y, si está OBSERVADA, reemplazo de documentos y reenvío a
 * revisión (sustituye al antiguo enlace de subsanación; sin fecha límite).
 */

const PESO_MAXIMO_BYTES = 20 * 1024 * 1024;

const MODALIDAD: Record<string, string> = {
  TESIS: "Tesis",
  TRABAJO_ACADEMICO: "Trabajo académico",
  ARTICULO: "Tesis en formato artículo",
};

/** "FOTO_PARTICIPANTE_2" → "Foto participante 2". */
function tipoLegible(tipo: string): string {
  const t = tipo.replace(/_/g, " ").toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Misma regla que el servidor: fotografía solo JPG; el resto, PDF. */
function validarReemplazo(file: File, esFoto: boolean): string | null {
  if (esFoto) {
    if (!/\.jpe?g$/i.test(file.name)) return "La fotografía debe estar en formato JPG.";
  } else if (!/\.pdf$/i.test(file.name)) {
    return `"${file.name}" no es un PDF. Solo se aceptan archivos PDF.`;
  }
  if (file.size > PESO_MAXIMO_BYTES) return `"${file.name}" supera el límite de 20 MB.`;
  return null;
}

export function MiSolicitudPanel({ solicitud }: { solicitud: MiSolicitudDTO }) {
  const s = solicitud;
  return (
    <div className="space-y-4">
      <Card>
        <CardEncabezado
          accion={<StatusBadge estado={s.estado} />}
          descripcion={`${MODALIDAD[s.modalidad] ?? s.modalidad} · ${s.programa}`}
          tira
          titulo={`Solicitud ${s.codigo}`}
        />
        <div className="space-y-1 px-4 py-3 text-sm md:px-5">
          <p className="font-semibold text-navy-950">{s.titulo}</p>
          <p className="text-xs text-grafito-600">
            Recibida el{" "}
            {new Date(s.fechaRecepcion).toLocaleDateString("es-PE", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
      </Card>

      <AvisoEstado solicitud={s} />

      {s.puedeSubsanar ? (
        <FormularioSubsanacion solicitud={s} />
      ) : (
        <ListaDocumentos documentos={s.documentos} solicitudId={s.id} />
      )}
    </div>
  );
}

function AvisoEstado({ solicitud: s }: { solicitud: MiSolicitudDTO }) {
  if (s.estado === "OBSERVADA") {
    const items = (s.motivoObservacion ?? "")
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, "").trim())
      .filter(Boolean);
    return (
      <Card className="border-orange-200 bg-orange-50/70 p-4 text-sm text-orange-950" role="alert">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 shrink-0 text-orange-600" size={18} />
          <div className="space-y-2">
            <p className="font-bold">Tu solicitud tiene observaciones</p>
            {items.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-orange-900">
                {items.map((it) => (
                  <li key={it}>{it}</li>
                ))}
              </ul>
            )}
            <p className="text-xs text-orange-900">
              Reemplaza los documentos observados y pulsa «Reenviar a revisión». Te avisaremos por
              correo el resultado.
            </p>
          </div>
        </div>
      </Card>
    );
  }
  if (s.estado === "RECHAZADA") {
    return (
      <Card className="border-red-200 bg-red-50/70 p-4 text-sm text-red-950" role="alert">
        <div className="flex items-start gap-2.5">
          <XCircle className="mt-0.5 shrink-0 text-red-600" size={18} />
          <div className="space-y-1">
            <p className="font-bold">Tu solicitud no fue admitida</p>
            {s.motivoRechazo && <p className="whitespace-pre-line">{s.motivoRechazo}</p>}
            <p className="text-xs">
              Si corresponde, puedes presentar una nueva solicitud en la Mesa de Partes Virtual.
            </p>
          </div>
        </div>
      </Card>
    );
  }
  if (s.estado === "ACEPTADA") {
    return (
      <Card className="border-green-200 bg-verde-inst-100/40 p-4 text-sm text-navy-950">
        <div className="flex items-start gap-2.5">
          <CheckCircle2 className="mt-0.5 shrink-0 text-verde-inst-700" size={18} />
          <p>
            Tu solicitud fue aprobada. Tu expediente de titulación aparecerá aquí en cuanto quede
            habilitado.
          </p>
        </div>
      </Card>
    );
  }
  return (
    <Card className="border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-950">
      <div className="flex items-start gap-2.5">
        <Clock className="mt-0.5 shrink-0 text-blue-700" size={18} />
        <p>
          El área de titulación está revisando tu solicitud. Te escribiremos a tu correo
          institucional con el resultado.
        </p>
      </div>
    </Card>
  );
}

function FilaDocumento({
  doc,
  solicitudId,
  children,
}: {
  doc: MiSolicitudDocumentoDTO;
  solicitudId: string;
  children?: ReactNode;
}) {
  const [error, setError] = useState<string | null>(null);
  const Icono = doc.esFoto ? ImageIcon : FileText;
  return (
    <li
      className={cn(
        "space-y-3 rounded-lg border p-3",
        doc.estadoConformidad === "OBSERVADO"
          ? "border-orange-300 bg-orange-50/40"
          : "border-slate-200 bg-white",
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
          <Icono size={16} />
        </span>
        <span className="min-w-0 flex-1 text-xs">
          <span className="block font-bold text-navy-950">{tipoLegible(doc.tipo)}</span>
          <span className="block truncate text-[11px] text-grafito-500">
            {doc.nombreOriginal} · v{doc.version}
          </span>
        </span>
        <StatusBadge estado={doc.estadoConformidad} />
        <Button
          onClick={() => {
            setError(null);
            abrirArchivoProtegido(documentoSolicitudUrl(solicitudId, doc.id)).catch((e: unknown) =>
              setError(e instanceof Error ? e.message : "No se pudo abrir el documento"),
            );
          }}
          tamano="sm"
          title="Ver el archivo enviado"
          type="button"
          variante="fantasma"
        >
          <ExternalLink size={14} /> Ver
        </Button>
      </div>
      {error && <p className="text-[11px] font-medium text-red-700">{error}</p>}
      {children}
    </li>
  );
}

function ListaDocumentos({
  documentos,
  solicitudId,
}: {
  documentos: MiSolicitudDocumentoDTO[];
  solicitudId: string;
}) {
  return (
    <Card>
      <CardEncabezado titulo="Documentos enviados" />
      <ul className="space-y-2 p-4 md:p-5">
        {documentos.map((d) => (
          <FilaDocumento doc={d} key={d.id} solicitudId={solicitudId} />
        ))}
      </ul>
    </Card>
  );
}

function FormularioSubsanacion({ solicitud }: { solicitud: MiSolicitudDTO }) {
  const mutation = useSubsanarMiSolicitud(solicitud.id);
  const [archivos, setArchivos] = useState<Map<string, File>>(new Map());
  const [errores, setErrores] = useState<Record<string, string | null>>({});
  // Los documentos observados se muestran abiertos para reemplazar.
  const [abiertos, setAbiertos] = useState<Set<string>>(
    () =>
      new Set(
        solicitud.documentos.filter((d) => d.estadoConformidad === "OBSERVADO").map((d) => d.id),
      ),
  );
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  function cambiarArchivo(doc: MiSolicitudDocumentoDTO, file: File | null) {
    const error = file ? validarReemplazo(file, doc.esFoto) : null;
    setErrores((e) => ({ ...e, [doc.id]: error }));
    setArchivos((prev) => {
      const sig = new Map(prev);
      if (file && !error) sig.set(doc.id, file);
      else sig.delete(doc.id);
      return sig;
    });
  }

  async function reenviar() {
    setErrorEnvio(null);
    try {
      const r = await mutation.mutateAsync(archivos);
      setExito(r.mensaje);
      setArchivos(new Map());
    } catch (e) {
      setErrorEnvio(e instanceof Error ? e.message : "No se pudo enviar la subsanación");
    }
  }

  if (exito) {
    return (
      <Card className="border-green-200 p-4 text-sm" role="status">
        <div className="flex items-start gap-2.5">
          <CheckCircle2 className="mt-0.5 shrink-0 text-verde-inst-700" size={18} />
          <p className="text-navy-950">{exito}</p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardEncabezado
        descripcion="Reemplaza solo los documentos que necesites corregir. Fotografía en JPG; el resto en PDF (máx. 20 MB)."
        titulo="Corregir documentos"
      />
      <ul className="space-y-2 p-4 md:p-5">
        {solicitud.documentos.map((doc) => {
          const abierto = abiertos.has(doc.id);
          return (
            <FilaDocumento doc={doc} key={doc.id} solicitudId={solicitud.id}>
              {abierto ? (
                <Dropzone
                  aceptar={doc.esFoto ? "image/jpeg,.jpg,.jpeg" : "application/pdf,.pdf"}
                  archivo={archivos.get(doc.id) ?? null}
                  error={errores[doc.id] ?? null}
                  etiqueta={`Nuevo archivo: ${tipoLegible(doc.tipo)}`}
                  onArchivo={(f) => cambiarArchivo(doc, f)}
                  restricciones={doc.esFoto ? "Solo JPG · máx. 20 MB" : "PDF · máx. 20 MB"}
                  tipo={doc.esFoto ? "foto" : "documento"}
                />
              ) : (
                <Button
                  onClick={() => setAbiertos((a) => new Set(a).add(doc.id))}
                  tamano="sm"
                  type="button"
                  variante="contorno"
                >
                  <RefreshCw size={14} /> Reemplazar
                </Button>
              )}
            </FilaDocumento>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 px-4 py-3 md:px-5">
        <p className="text-xs text-grafito-600">
          {archivos.size === 0
            ? "Aún no has adjuntado documentos corregidos."
            : `${archivos.size} documento(s) listo(s) para reenviar.`}
        </p>
        <Button
          disabled={archivos.size === 0 || mutation.isPending}
          onClick={() => void reenviar()}
          type="button"
        >
          <Send size={16} /> {mutation.isPending ? "Enviando…" : "Reenviar a revisión"}
        </Button>
      </div>
      {errorEnvio && (
        <p className="px-4 pb-3 text-xs font-medium text-red-700 md:px-5" role="alert">
          {errorEnvio}
        </p>
      )}
    </Card>
  );
}
