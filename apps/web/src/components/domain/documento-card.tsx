/**
 * Componente compartido por las vistas /expedientes/$id y /mi-tramite.
 * La tarjeta enlaza carga/descarga/visto bueno y el panel de análisis del plan estructurado.
 */

import type { AnalisisDocumentoDTO } from "@pis/contracts";
import { tienePlantilla } from "@pis/domain/dist/documentos/plantillas.js";
import {
  cargaHabilitadaTesista,
  esDocumentoTesista,
} from "@pis/domain/dist/expediente/checklist-catalogo.js";
import {
  AlertTriangle,
  CheckCircle2,
  Edit3,
  Eye,
  FileDown,
  FileText,
  Info,
  MessageSquare,
  PenTool,
  Stamp,
  UploadCloud,
} from "lucide-react";
import { useRef, useState } from "react";
import {
  descargarArchivoProtegido,
  documentoDescargaUrl,
  formatoDescargaUrl,
  useGenerarDocumentos,
  useObservacionesDocumento,
  useSubirDocumento,
} from "../../api/expedientes.js";
import { useVistoBueno } from "../../api/seguimiento.js";
import { useSession } from "../../api/session.js";
import { cn } from "../../utils/cn.js";
import { Button } from "../ui/button.js";
import { Card } from "../ui/card.js";
import { ConfirmDialog } from "../ui/confirm-dialog.js";
import { Dialogo } from "../ui/dialog.js";
import { StatusBadge } from "../ui/status-badge.js";
import { useToast } from "../ui/toast.js";
import { AnalisisDocumentalPanel } from "./analisis-documental-panel.js";
import { ItemHallazgo } from "./item-hallazgo.js";
import { ModalObservacionesDocumento } from "./modal-observaciones-documento.js";
import { ModalVisorDocumento } from "./modal-visor-documento.js";

interface Props {
  expedienteId: string;
  tipo: string;
  nombre: string;
  estado: string;
  version: number | null;
  faltantes: string[];
  documentoId: string | null;
  /** Subetapa que exige el documento (RN-06). */
  requeridoEn?: string | null;
  /** Clave de la subetapa en curso del expediente. */
  subetapaActiva?: string | null;
  /** Formato generado por "Insertar datos" (si existe). */
  formato?: { id: string; version: number; pendientes: string[] } | null;
  /** Callback para abrir modal de modificación y corrección */
  onModificar?: (formato: {
    tipo: string;
    nombre: string;
    version: number;
    pendientes: string[];
  }) => void;
  /** Callback para abrir modal de vista previa oficial */
  onVistaPrevia?: (formato: {
    id: string;
    tipo: string;
    nombre: string;
    version: number;
    pendientes: string[];
  }) => void;
  /** Etapa actual del documento ("E1" | "E2" | "E6") */
  etapa?: "E1" | "E2" | "E6";
  /** Etiqueta visible de la etapa (ej. "Etapa 1 · Verificación") */
  etiquetaEtapa?: string;
  /** Permite al tesista subir o reemplazar directamente en su sección de etapa */
  permitirSubir?: boolean;
}

const PERSONAL = ["ADMIN_FIPS", "SECRETARIA", "DECANO"];

/**
 * Nombres oficiales según el listado normativo y de la facultad (para guiar al usuario
 * y al personal en el subtítulo plomo de cada tarjeta).
 */
export const NOMBRES_LISTADO_OFICIAL: Record<string, string> = {
  // Etapa 01
  SOLICITUD_INSCRIPCION: "Anexo 17 — Solicitud de inscripción del plan",
  ANEXO_17: "Anexo 17 — Solicitud de inscripción",
  ACEPTACION_ASESORIA: "Designación de asesor",
  PLAN_ESTRUCTURADO: "Tesis / Plan de Trabajo Académico",
  DJ_CONFIDENCIALIDAD: "Autorización de uso de información (Confidencialidad)",
  ANEXO_18: "Acta de conformidad de asesoramiento de proyecto",
  ANEXO_33: "Nombramiento de jurado evaluador",
  CARATULA_PLAN: "Carátula oficial de plan de tesis",
  DECRETO_APROBACION: "Decreto de aprobación del plan",
  ETIQUETAS: "Etiquetas institucionales de plan y empastado",
  OFICIO_CIRCULAR_TERNA: "Oficio circular — Designación de terna evaluadora",
  OFICIO_CIRCULAR: "Oficio circular — Designación de terna evaluadora",
  OBSERVACIONES_PLAN: "Formato de observaciones de plan de tesis",
  OBSERVACIONES_PLAN_TESIS: "Formato de observaciones de plan de tesis",

  // Etapa 02
  ACTA_CONFORMIDAD: "Acta de conformidad (Unidad)",
  ACTA_DICTAMEN: "Acta de dictamen (Unidad)",
  ACTA_SUSTENTACION: "Acta de sustentación (Unidad)",
  ANEXO_27: "Solicitud titulación — Anexo 27 (Alumno)",
  ANEXO_01_DJ: "Anexo 1 Autorización publicación digital (Alumno)",
  ANEXO_01_DJ_P1: "Anexo 1 Autorización publicación — Participante 01",
  ANEXO_01_DJ_P2: "Anexo 1 Autorización publicación — Participante 02",
  ANEXO_02_DJ: "DJ antecedentes penales / no terrorismo — Anexo 2 (Alumno)",
  ANEXO_02_DJ_P1: "Anexo 2 DJ no antecedentes — Participante 01",
  ANEXO_02_DJ_P2: "Anexo 2 DJ no antecedentes — Participante 02",
  ANEXO_32_VERACIDAD: "Declaración Jurada autenticidad — Anexo 32 (Alumno)",
  AUTORIZACION_IMPRESION: "Autorización de impresión de tesis",
  AUTORIZACION_PUBLICACION: "Autorización de publicación de tesis",
  CARATULA_FINAL: "Carátula oficial de tesis final",
  ANEXO_08: "Acta de conformidad de asesoramiento de proyecto (Anexo 08)",
  INFORME_ASESORAMIENTO: "Acta de conformidad de asesoramiento de proyecto (Anexo 08)",
  INFORME_SIMILITUD: "Informe de similitud (Unidad)",
  OBSERVACIONES_TESIS: "Formato de observaciones de borrador de tesis",
  INVITACION_PUBLICA: "Invitación pública a sustentación",
  OFICIO_OTI_SIMILITUD: "Oficio formal a OTI para reporte de similitud",
  OFICIO_UGI_REPOSITORIO: "Oficio formal a UGI para repositorio institucional",
  RESOLUCION_DECANAL: "Nombramiento de jurado — Resolución Decanal (Unidad)",
  INFORME_SECRETARIA: "Aprobación de Consejo y emisión diploma (Informe Secretaría)",
};

/** Extrae y unifica los campos pendientes de la plantilla y del documento */
export function obtenerCamposPendientesUnificados(
  formatoPendientes?: string[],
  faltantes: string[] = [],
): string[] {
  return Array.from(
    new Set([
      ...(formatoPendientes ?? []),
      ...faltantes
        .filter(
          (f) =>
            f.startsWith("Campo pendiente: ") || f.startsWith("Campo pendiente en el formato: "),
        )
        .map((f) => f.replace(/^Campo pendiente( en el formato)?: /, "").trim()),
      ...faltantes.filter(
        (f) =>
          !f.startsWith("Campo pendiente: ") &&
          !f.startsWith("Campo pendiente en el formato: ") &&
          f !== "Falta adjuntar el archivo",
      ),
    ]),
  ).filter(Boolean);
}

/** Determina si un tipo documental requiere firma física o digital del interesado o jurado */
export function requiereFirma(tipo: string): boolean {
  const TIPOS_CON_FIRMA = new Set([
    "SOLICITUD_INSCRIPCION",
    "ANEXO_17",
    "ACEPTACION_ASESORIA",
    "DJ_CONFIDENCIALIDAD",
    "ANEXO_18",
    "ANEXO_33",
    "ANEXO_27",
    "ANEXO_01_DJ",
    "ANEXO_01_DJ_P1",
    "ANEXO_01_DJ_P2",
    "ANEXO_02_DJ",
    "ANEXO_02_DJ_P1",
    "ANEXO_02_DJ_P2",
    "ANEXO_32_VERACIDAD",
    "ACTA_CONFORMIDAD",
    "ACTA_DICTAMEN",
    "ACTA_SUSTENTACION",
    "ANEXO_08",
    "AUTORIZACION_IMPRESION",
    "AUTORIZACION_PUBLICACION",
    "RESOLUCION_DECANAL",
  ]);
  return TIPOS_CON_FIRMA.has(tipo);
}

/**
 * Tarjeta de /expedientes/$id y /mi-tramite: carga, descarga y visto bueno del documento.
 * PLAN_ESTRUCTURADO incorpora AnalisisDocumentalPanel cuando hay documentoId.
 * La API vuelve a comprobar autorización y reglas que la vista usa para habilitar acciones.
 */
export function DocumentoCard(p: Props) {
  const camposPendientes = obtenerCamposPendientesUnificados(p.formato?.pendientes, p.faltantes);
  const inputRef = useRef<HTMLInputElement>(null);
  const subir = useSubirDocumento(p.expedienteId);
  const vistoBueno = useVistoBueno(p.expedienteId);
  const generar = useGenerarDocumentos(p.expedienteId);
  const [analisisResultado, setAnalisisResultado] = useState<AnalisisDocumentoDTO | null>(null);
  const { sesion } = useSession();
  const avisar = useToast();
  const [error, setError] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [pendiente, setPendiente] = useState<File | null>(null);
  const [revisionAbierta, setRevisionAbierta] = useState(false);
  const [visorAbierto, setVisorAbierto] = useState(false);
  const [observacionesAbiertas, setObservacionesAbiertas] = useState(false);
  const [modoObservarDirecto, setModoObservarDirecto] = useState(false);
  const [descargando, setDescargando] = useState(false);

  const { data: observaciones = [] } = useObservacionesDocumento(p.expedienteId, p.tipo);
  const observacionesPendientes = observaciones.filter((o) => o.estado === "PENDIENTE").length;

  const esPersonal = !!sesion && PERSONAL.includes(sesion.rol);
  const esTesista = sesion?.rol === "TESISTA";
  const esDeTesista = esDocumentoTesista(p.tipo);
  // RN-06: el tesista solo carga documentos de su autoría (no autogenerados/actas institucionales),
  // y solo en su subetapa activa o si está observado, sin reemplazar documentos aprobados.
  const puedeCargar = esPersonal
    ? true
    : esTesista &&
      esDeTesista &&
      p.estado !== "APROBADO" &&
      (p.permitirSubir ||
        p.version !== null ||
        cargaHabilitadaTesista(
          { tipo: p.tipo, requeridoEn: p.requeridoEn ?? null, estado: p.estado },
          p.subetapaActiva ?? null,
        ));
  // V°B°: asesor asignado o personal; solo sobre documento cargado u observado.
  const puedeVisar =
    !!p.documentoId &&
    (p.estado === "CARGADO" || p.estado === "OBSERVADO") &&
    !!sesion &&
    ["ASESOR", ...PERSONAL].includes(sesion.rol);

  const tieneFormatoGenerable = tienePlantilla(p.tipo);
  const puedeDescargar = !!p.formato || !!p.documentoId || tieneFormatoGenerable;

  async function onDescargar(): Promise<void> {
    setDescargando(true);
    try {
      if (p.formato) {
        await descargarArchivoProtegido(formatoDescargaUrl(p.formato.id), `${p.nombre}.docx`);
        avisar("Documento Word (.docx) descargado con éxito");
        return;
      }
      if (tieneFormatoGenerable) {
        const etapaCalc = p.etapa ?? (p.tipo.startsWith("E1") ? "E1" : "E2");
        const r = await generar.mutateAsync({
          etapa: etapaCalc,
          tipo: p.tipo,
        });
        const gen = r.generados.find((g) => g.tipo === p.tipo) ?? r.generados[0];
        if (gen) {
          await descargarArchivoProtegido(formatoDescargaUrl(gen.id), `${p.nombre}.docx`);
          avisar("Plantilla oficial generada y descargada para firma");
          return;
        }
      }
      if (p.documentoId) {
        await descargarArchivoProtegido(documentoDescargaUrl(p.documentoId), p.nombre);
        avisar("Archivo descargado");
        return;
      }
      avisar("No hay plantilla o archivo disponible para descarga", "aviso");
    } catch (e) {
      avisar(e instanceof Error ? e.message : "Error al descargar el documento", "error");
    } finally {
      setDescargando(false);
    }
  }

  /** Envía aprobación u observación a POST /api/documentos/:id/visto-bueno. */
  async function visar(aprobado: boolean): Promise<void> {
    if (!p.documentoId) return;
    const comentario = aprobado
      ? undefined
      : window.prompt("Motivo de la observación para el tesista:");
    if (!aprobado && !(comentario ?? "").trim()) return;
    try {
      await vistoBueno.mutateAsync({
        documentoId: p.documentoId,
        aprobado,
        ...(comentario != null ? { comentario } : {}),
      });
      avisar(aprobado ? "V°B° registrado" : "Documento observado");
    } catch (e) {
      avisar(e instanceof Error ? e.message : "No se pudo visar", "error");
    }
  }

  /** Sube por multipart a POST /api/documentos/upload y notifica la nueva versión. */
  async function ejecutar(file: File): Promise<void> {
    setError(null);
    try {
      const r = await subir.mutateAsync({ tipo: p.tipo, file });
      avisar(`${p.nombre}: versión ${r.version} cargada`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al subir");
    }
  }

  /** Reemplazar requiere confirmación; una primera carga puede iniciarse inmediatamente. */
  function onFile(file: File | undefined): void {
    if (!file || !puedeCargar) return;
    if (p.version !== null) {
      setPendiente(file);
      return;
    }
    void ejecutar(file);
  }

  return (
    <Card
      className={cn(
        "p-4 transition-colors",
        arrastrando && "border-dashed border-navy-800 bg-navy-950/[0.03]",
      )}
      onDragOver={(e) => {
        if (!puedeCargar) return;
        e.preventDefault();
        setArrastrando(true);
      }}
      onDragLeave={() => setArrastrando(false)}
      onDrop={(e) => {
        e.preventDefault();
        setArrastrando(false);
        onFile(e.dataTransfer.files?.[0]);
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-950/[0.06] text-navy-800">
            <FileText size={18} aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="truncate text-sm font-bold text-navy-950">{p.nombre}</h3>
              {p.formato && (
                <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200">
                  v{p.formato.version}
                </span>
              )}
              {camposPendientes.length > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800 border border-amber-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
                  {camposPendientes.length} pendiente{camposPendientes.length > 1 ? "s" : ""}
                </span>
              ) : p.formato || p.documentoId ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 border border-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                  Completo
                </span>
              ) : null}
              {requiereFirma(p.tipo) && (
                <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 text-[11px] font-bold text-purple-700 border border-purple-200">
                  <PenTool size={11} />
                  Requiere firma
                </span>
              )}
            </div>
            <p className="text-xs text-grafito-600">
              {NOMBRES_LISTADO_OFICIAL[p.tipo] ? (
                <>
                  <span className="font-medium text-slate-700">
                    {NOMBRES_LISTADO_OFICIAL[p.tipo]}
                  </span>
                  <span className="text-slate-400"> · {p.tipo}</span>
                </>
              ) : (
                p.tipo
              )}
              {p.version !== null && !p.formato ? ` · v${p.version}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {p.etiquetaEtapa && (
            <span className="inline-flex items-center gap-1 rounded-full border border-navy-200 bg-navy-50 px-2.5 py-0.5 text-[11px] font-bold text-navy-800">
              {p.etiquetaEtapa}
            </span>
          )}
          <StatusBadge estado={p.estado} />
        </div>
      </div>
      {camposPendientes.length > 0 && (
        <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 shadow-xs">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600" aria-hidden />
          <div className="min-w-0">
            <span className="font-bold text-amber-950">Campos pendientes por completar:</span>{" "}
            <span className="text-amber-900">{camposPendientes.join(", ")}</span>
          </div>
        </div>
      )}
      {p.faltantes.includes("Falta adjuntar el archivo") && !p.documentoId && !p.formato && (
        <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-700">
          <Info size={14} className="shrink-0 text-slate-500" aria-hidden />
          <span>Falta adjuntar el archivo requerido</span>
        </p>
      )}
      {requiereFirma(p.tipo) && !p.documentoId && (
        <div className="mt-2.5 flex items-center justify-between gap-2 rounded-lg bg-indigo-50/70 border border-indigo-200/80 px-2.5 py-1.5 text-xs text-indigo-950">
          <div className="flex items-center gap-1.5">
            <PenTool size={13} className="text-indigo-600 shrink-0" />
            <span>
              <strong>Paso requerido:</strong> Descargue el formato en Word, firme el documento y
              súbalo mediante <strong>ADJUNTAR</strong>.
            </span>
          </div>
        </div>
      )}
      {error && (
        <p className="mt-2 text-xs font-medium text-red-700" role="alert">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200/70 pt-3">
        {p.formato && p.onVistaPrevia ? (
          <Button
            tamano="sm"
            variante="oscuro"
            onClick={() => {
              if (!p.formato) return;
              p.onVistaPrevia?.({
                id: p.formato.id,
                tipo: p.tipo,
                nombre: p.nombre,
                version: p.formato.version,
                pendientes: p.formato.pendientes,
              });
            }}
            title="Ver documento oficial y acceder a descargas (PDF / Word)"
            type="button"
          >
            <Eye size={14} />
            VER
          </Button>
        ) : p.documentoId ? (
          <Button tamano="sm" variante="oscuro" onClick={() => setVisorAbierto(true)} type="button">
            <Eye size={14} />
            VER
          </Button>
        ) : (
          <Button
            tamano="sm"
            variante="oscuro"
            disabled
            title="Documento aún no disponible para visualización"
            type="button"
          >
            <Eye size={14} />
            VER
          </Button>
        )}

        {puedeDescargar ? (
          <Button
            tamano="sm"
            variante="contorno"
            disabled={descargando || generar.isPending}
            onClick={() => void onDescargar()}
            title={
              p.formato
                ? "Descargar formato Word (.docx) prellenado para firmar"
                : tieneFormatoGenerable
                  ? "Generar y descargar plantilla oficial Word (.docx) para firmar"
                  : "Descargar archivo cargado"
            }
            type="button"
          >
            <FileDown size={14} />
            {descargando || generar.isPending ? "DESCARGANDO…" : "DESCARGAR"}
          </Button>
        ) : (
          <Button
            tamano="sm"
            variante="contorno"
            disabled
            title="Este documento no cuenta con plantilla autogenerable para descarga previa"
            type="button"
          >
            <FileDown size={14} />
            DESCARGAR
          </Button>
        )}

        {esPersonal && p.onModificar ? (
          tieneFormatoGenerable || p.formato ? (
            <Button
              tamano="sm"
              variante="contorno"
              onClick={() => {
                p.onModificar?.({
                  tipo: p.tipo,
                  nombre: p.nombre,
                  version: p.formato?.version ?? 1,
                  pendientes: p.formato?.pendientes ?? [],
                });
              }}
              title="Editar y corregir datos de este formato"
              type="button"
            >
              <Edit3 size={14} />
              EDITAR
            </Button>
          ) : (
            <Button
              tamano="sm"
              variante="contorno"
              disabled
              title="Este documento no cuenta con plantilla de variables autogenerable"
              type="button"
            >
              <Edit3 size={14} />
              EDITAR
            </Button>
          )
        ) : (
          <Button
            tamano="sm"
            variante="contorno"
            disabled
            title="Edición de variables reservada para personal administrativo"
            type="button"
          >
            <Edit3 size={14} />
            EDITAR
          </Button>
        )}

        <Button
          tamano="sm"
          variante={observacionesPendientes > 0 ? "peligro" : "contorno"}
          onClick={() => {
            setModoObservarDirecto(false);
            setObservacionesAbiertas(true);
          }}
          type="button"
          title="Ver historial de observaciones y correcciones de este documento"
        >
          <MessageSquare size={14} />
          OBSERVACIONES
          {observacionesPendientes > 0 && (
            <span className="ml-1 rounded-full bg-white text-red-700 px-1.5 py-0.2 text-[10px] font-black shadow-xs">
              {observacionesPendientes}
            </span>
          )}
        </Button>

        {puedeCargar ? (
          <Button
            tamano="sm"
            variante="contorno"
            disabled={subir.isPending}
            onClick={() => inputRef.current?.click()}
            type="button"
            title="Cargar o reemplazar archivo en la plataforma"
          >
            <UploadCloud size={14} />
            {subir.isPending ? "SUBIENDO…" : p.version === null ? "ADJUNTAR" : "VOLVER A SUBIR"}
          </Button>
        ) : (
          <Button
            tamano="sm"
            variante="contorno"
            disabled
            title={
              p.estado === "APROBADO"
                ? "Documento aprobado formalmente"
                : "Carga de archivo no habilitada en este estado"
            }
            type="button"
          >
            <UploadCloud size={14} />
            ADJUNTAR
          </Button>
        )}
        {puedeVisar && (
          <span className="flex gap-1.5">
            <Button
              tamano="sm"
              variante="exito"
              disabled={vistoBueno.isPending}
              onClick={() => void visar(true)}
              type="button"
            >
              <Stamp size={14} />
              V°B°
            </Button>
            <Button
              tamano="sm"
              variante="contorno"
              disabled={vistoBueno.isPending}
              onClick={() => {
                setModoObservarDirecto(true);
                setObservacionesAbiertas(true);
              }}
              type="button"
            >
              Observar
            </Button>
          </span>
        )}
        <input
          accept="application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          ref={inputRef}
          type="file"
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      {p.documentoId && (
        <Dialogo
          abierto={revisionAbierta}
          onAbierto={setRevisionAbierta}
          titulo={
            analisisResultado && analisisResultado.hallazgos.length > 0
              ? "Alertas y observaciones detectadas"
              : "Revisión del documento"
          }
          descripcion={
            analisisResultado && analisisResultado.hallazgos.length > 0
              ? "Se encontraron inconsistencias en la carátula o el contenido del documento."
              : "La revisión no detectó observaciones en la carátula ni en los datos."
          }
          ancho="max-w-2xl"
        >
          {analisisResultado ? (
            <div className="space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900">{p.nombre}</span>
                  {p.version !== null && (
                    <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[11px] font-semibold text-slate-800">
                      v{p.version}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "font-semibold px-2 py-0.5 rounded text-[11px]",
                      analisisResultado.estado === "COMPLETADO"
                        ? "bg-green-100 text-green-800"
                        : "bg-amber-100 text-amber-800",
                    )}
                  >
                    {analisisResultado.estado === "COMPLETADO"
                      ? "Análisis completado"
                      : "Análisis parcial"}
                  </span>
                  <span>·</span>
                  <span>
                    Páginas:{" "}
                    <strong>{analisisResultado.paginasAnalizadas.join(", ") || "1–6"}</strong>
                  </span>
                </div>
              </div>

              {analisisResultado.hallazgos.length === 0 ? (
                <div className="rounded-xl border border-green-200 bg-verde-inst-100/50 p-4 text-center flex items-center justify-center gap-2">
                  <CheckCircle2 size={16} className="text-verde-inst-700 shrink-0" />
                  <p className="text-sm font-semibold text-verde-inst-700">
                    El documento cumple con todas las especificaciones y normativas evaluadas.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-2.5 text-xs text-amber-900 flex items-start gap-2">
                    <AlertTriangle size={15} className="text-amber-700 shrink-0 mt-0.5" />
                    <span>
                      Se detectaron {analisisResultado.hallazgos.length} observaciones en la
                      carátula o estructura. Haga clic en cada observación para desplegar el
                      fragmento detectado y la redacción esperada.
                    </span>
                  </div>
                  <ul className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
                    {analisisResultado.hallazgos.map((hallazgo, index) => (
                      <ItemHallazgo
                        key={`${hallazgo.tipo}-${index}`}
                        campo={hallazgo.tipo}
                        mensaje={hallazgo.mensaje}
                        severidad={hallazgo.severidad}
                        esperado={hallazgo.esperado ?? hallazgo.sugerencia}
                        encontrado={hallazgo.encontrado ?? hallazgo.evidencia}
                      />
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-grafito-600">
              Todavía no hay revisión disponible para este documento. Haga clic en «Verificar» o
              «Volver a analizar».
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Button
              tamano="sm"
              variante="contorno"
              type="button"
              onClick={() => setRevisionAbierta(false)}
            >
              Cerrar
            </Button>
            <Button
              tamano="sm"
              variante="oscuro"
              type="button"
              onClick={() => {
                setRevisionAbierta(false);
                inputRef.current?.click();
              }}
            >
              <UploadCloud size={14} />
              Volver a subir documento corregido
            </Button>
          </div>
        </Dialogo>
      )}
      {p.documentoId && !tieneFormatoGenerable && (
        <AnalisisDocumentalPanel
          key={p.documentoId}
          documentoId={p.documentoId}
          tipo={p.tipo}
          onVerDetalles={(res) => {
            setAnalisisResultado(res);
            setRevisionAbierta(true);
          }}
        />
      )}
      {pendiente && (
        <ConfirmDialog
          titulo="Reemplazar documento"
          mensaje={`Reemplazar ${p.nombre} (v${p.version}) por ${pendiente.name}? Se creará la v${(p.version ?? 0) + 1}.`}
          confirmar="Reemplazar"
          onConfirmar={() => {
            const f = pendiente;
            setPendiente(null);
            void ejecutar(f);
          }}
          onCancelar={() => setPendiente(null)}
        />
      )}
      {p.documentoId && (
        <ModalVisorDocumento
          abierto={visorAbierto}
          onCerrar={() => setVisorAbierto(false)}
          titulo={p.nombre}
          subtitulo={NOMBRES_LISTADO_OFICIAL[p.tipo]}
          documentoUrl={documentoDescargaUrl(p.documentoId)}
          nombrePdf={`${p.tipo}_v${p.version ?? 1}.pdf`}
          formatoUrl={p.formato && tieneFormatoGenerable ? formatoDescargaUrl(p.formato.id) : null}
          nombreDocx={`${p.tipo}_v${p.formato?.version ?? 1}.docx`}
          version={p.version}
          estado={p.estado}
        />
      )}
      <ModalObservacionesDocumento
        abierto={observacionesAbiertas}
        onCerrar={() => setObservacionesAbiertas(false)}
        expedienteId={p.expedienteId}
        tipoDocumento={p.tipo}
        nombreDocumento={p.nombre}
        documentoId={p.documentoId}
        modoInicialObservar={modoObservarDirecto}
      />
    </Card>
  );
}
