/**
 * Componente compartido por las vistas /expedientes/$id y /mi-tramite.
 * La tarjeta enlaza carga/descarga/visto bueno y el panel de análisis del plan estructurado.
 */

import { tienePlantilla } from "@pis/domain/dist/documentos/plantillas.js";
import { cargaHabilitadaTesista } from "@pis/domain/dist/expediente/checklist-catalogo.js";
import {
  AlertTriangle,
  CheckCircle2,
  Edit3,
  Eye,
  FileText,
  Stamp,
  UploadCloud,
  WandSparkles,
} from "lucide-react";
import { useRef, useState } from "react";
import {
  documentoDescargaUrl,
  formatoDescargaUrl,
  useGenerarDocumentos,
  useRevisionDocumento,
  useSubirDocumento,
} from "../../api/expedientes.js";
import { useVistoBueno } from "../../api/seguimiento.js";
import { useSession } from "../../api/session.js";
import { cn } from "../../utils/cn.js";
import { Button, botonClases } from "../ui/button.js";
import { Card } from "../ui/card.js";
import { ConfirmDialog } from "../ui/confirm-dialog.js";
import { Dialogo } from "../ui/dialog.js";
import { StatusBadge } from "../ui/status-badge.js";
import { useToast } from "../ui/toast.js";
import { AnalisisDocumentalPanel } from "./analisis-documental-panel.js";
import { ItemHallazgo } from "./item-hallazgo.js";
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
  /** Etapa actual del documento ("E1" | "E2" | "E6") */
  etapa?: "E1" | "E2" | "E6";
}

const PERSONAL = ["ADMIN_FIPS", "SECRETARIA", "DECANO"];

/**
 * Nombres oficiales según el listado normativo y de la facultad (para guiar al usuario
 * y al personal en el subtítulo plomo de cada tarjeta).
 */
const NOMBRES_LISTADO_OFICIAL: Record<string, string> = {
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

function RevisionBadge({
  tipo,
  cargando,
  estado,
  hallazgos,
  onAbrir,
}: {
  tipo: string;
  cargando: boolean;
  estado: "PENDIENTE" | "EN_PROCESO" | "COMPLETADO" | "FALLIDO" | string | null;
  hallazgos: Array<{ campo: string; mensaje: string }> | undefined;
  onAbrir: () => void;
}) {
  if (tipo !== "PLAN_ESTRUCTURADO") return null;

  if (cargando || estado === "PENDIENTE" || estado === "EN_PROCESO") {
    return (
      <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-200 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 animate-pulse cursor-default">
        Analizando...
      </span>
    );
  }

  if (!estado) return null;

  const tieneObs = hallazgos && hallazgos.length > 0;
  const texto = tieneObs
    ? `${hallazgos.length} observación${hallazgos.length > 1 ? "es" : ""} detectada${hallazgos.length > 1 ? "s" : ""}`
    : "Carátula conforme";

  const clase = tieneObs
    ? "border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200"
    : "border-green-300 bg-verde-inst-100 text-verde-inst-700 hover:bg-verde-inst-200";

  return (
    <button
      type="button"
      onClick={onAbrir}
      title="Clic para ver observaciones y fragmentos detectados"
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold cursor-pointer transition-colors",
        clase,
      )}
    >
      {texto}
    </button>
  );
}

/**
 * Tarjeta de /expedientes/$id y /mi-tramite: carga, descarga y visto bueno del documento.
 * PLAN_ESTRUCTURADO incorpora AnalisisDocumentalPanel cuando hay documentoId.
 * La API vuelve a comprobar autorización y reglas que la vista usa para habilitar acciones.
 */
export function DocumentoCard(p: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const subir = useSubirDocumento(p.expedienteId);
  const vistoBueno = useVistoBueno(p.expedienteId);
  const revision = useRevisionDocumento(p.documentoId ?? null);
  const { sesion } = useSession();
  const avisar = useToast();
  const [error, setError] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [pendiente, setPendiente] = useState<File | null>(null);
  const [revisionAbierta, setRevisionAbierta] = useState(false);
  const [visorAbierto, setVisorAbierto] = useState(false);
  const esPersonal = !!sesion && PERSONAL.includes(sesion.rol);
  const esTesista = sesion?.rol === "TESISTA";
  // RN-06: el tesista solo carga lo de su subetapa activa (o lo observado) y
  // nunca reemplaza un documento aprobado. El servidor lo vuelve a validar.
  const puedeCargar = esPersonal
    ? true
    : esTesista &&
      p.estado !== "APROBADO" &&
      cargaHabilitadaTesista(
        { tipo: p.tipo, requeridoEn: p.requeridoEn ?? null, estado: p.estado },
        p.subetapaActiva ?? null,
      );
  // V°B°: asesor asignado o personal; solo sobre documento cargado u observado.
  const puedeVisar =
    !!p.documentoId &&
    (p.estado === "CARGADO" || p.estado === "OBSERVADO") &&
    !!sesion &&
    ["ASESOR", ...PERSONAL].includes(sesion.rol);

  const generar = useGenerarDocumentos(p.expedienteId);
  const [generando, setGenerando] = useState(false);
  const tieneFormatoGenerable = tienePlantilla(p.tipo);

  async function onGenerarIndividual(): Promise<void> {
    setGenerando(true);
    const etapaCalc =
      p.etapa ??
      (p.tipo.startsWith("E1") ||
      p.tipo === "SOLICITUD_INSCRIPCION" ||
      p.tipo === "ACEPTACION_ASESORIA" ||
      p.tipo === "DJ_CONFIDENCIALIDAD" ||
      p.tipo === "ANEXO_17" ||
      p.tipo === "ANEXO_18" ||
      p.tipo === "CARATULA_PLAN"
        ? "E1"
        : "E2");
    try {
      const r = await generar.mutateAsync({
        etapa: etapaCalc,
        tipo: p.tipo,
      });
      const gen = r.generados[0];
      const faltan = gen?.pendientes.length ?? 0;
      avisar(
        `${p.nombre}: plantilla rellenada${faltan > 0 ? ` (${faltan} campos pendientes)` : ""}`,
      );
    } catch (e) {
      avisar(e instanceof Error ? e.message : "No se pudo rellenar la plantilla", "error");
    } finally {
      setGenerando(false);
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
          <StatusBadge estado={p.estado} />
          {p.documentoId && p.tipo === "PLAN_ESTRUCTURADO" && (
            <RevisionBadge
              tipo={p.tipo}
              cargando={revision.isFetching}
              estado={revision.data?.estado ?? null}
              hallazgos={revision.data?.hallazgos}
              onAbrir={() => setRevisionAbierta(true)}
            />
          )}
        </div>
      </div>
      {p.faltantes.length > 0 && (
        <p className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-aviso-100 px-2.5 py-2 text-xs text-aviso-800">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            <strong>Campos pendientes:</strong> {p.faltantes.join("; ")}
          </span>
        </p>
      )}
      {error && (
        <p className="mt-2 text-xs font-medium text-red-700" role="alert">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200/70 pt-3">
        {p.documentoId ? (
          <Button tamano="sm" variante="oscuro" onClick={() => setVisorAbierto(true)} type="button">
            <Eye size={14} />
            VER
          </Button>
        ) : (
          <span
            className={cn(
              botonClases({ variante: "contorno", tamano: "sm" }),
              "pointer-events-none opacity-50",
            )}
            aria-disabled
          >
            <Eye size={14} />
            VER
          </span>
        )}
        {tieneFormatoGenerable && esPersonal && (
          <Button
            tamano="sm"
            variante="contorno"
            disabled={generando || generar.isPending}
            onClick={() => void onGenerarIndividual()}
            title="Autorrellenar esta plantilla con los datos del expediente"
            type="button"
          >
            <WandSparkles size={14} />
            {generando || generar.isPending ? "RELLENANDO…" : "RELLENAR"}
          </Button>
        )}
        {p.formato && tieneFormatoGenerable && esPersonal && p.onModificar && (
          <Button
            tamano="sm"
            variante="contorno"
            onClick={() => {
              if (!p.formato) return;
              p.onModificar?.({
                tipo: p.tipo,
                nombre: p.nombre,
                version: p.formato.version,
                pendientes: p.formato.pendientes,
              });
            }}
            title="Corregir datos de este formato y regenerar en Word/Google Drive"
            type="button"
          >
            <Edit3 size={14} />
            CORREGIR
          </Button>
        )}
        {puedeCargar ? (
          <button
            className={cn(botonClases({ variante: "contorno", tamano: "sm" }))}
            disabled={subir.isPending}
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            <UploadCloud size={14} />
            {subir.isPending ? "SUBIENDO…" : p.version === null ? "ADJUNTAR" : "REEMPLAZAR"}
          </button>
        ) : (
          esTesista && (
            <span className="text-xs text-grafito-600">
              {p.estado === "APROBADO"
                ? "Documento aprobado"
                : "Se carga en la subetapa correspondiente"}
            </span>
          )
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
              onClick={() => void visar(false)}
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
            revision.data && revision.data.hallazgos.length > 0
              ? "Alertas detectadas"
              : "Revisión del documento"
          }
          descripcion={
            revision.data && revision.data.hallazgos.length > 0
              ? "Se encontraron inconsistencias en la carátula o el contenido del documento."
              : "La revisión no detectó observaciones en la carátula."
          }
          ancho="max-w-xl"
        >
          {revision.isPending ? (
            <p className="text-sm text-grafito-600">Analizando el documento…</p>
          ) : revision.data ? (
            <div className="space-y-3">
              {revision.data.hallazgos.length === 0 ? (
                <div className="rounded-xl border border-green-200 bg-verde-inst-100/50 p-4 text-center flex items-center justify-center gap-2">
                  <CheckCircle2 size={16} className="text-verde-inst-700 shrink-0" />
                  <p className="text-sm font-semibold text-verde-inst-700">
                    La carátula, la presentación y el resumen cumplen con las especificaciones de la
                    guía oficial.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-2.5 text-xs text-amber-900 flex items-start gap-2">
                    <AlertTriangle size={15} className="text-amber-700 shrink-0 mt-0.5" />
                    <span>
                      Se detectaron {revision.data.hallazgos.length} observaciones. Toque cada una
                      para ver el fragmento específico del documento y la redacción esperada.
                    </span>
                  </div>
                  <ul className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
                    {revision.data.hallazgos.map((hallazgo, index) => (
                      <ItemHallazgo
                        key={`${hallazgo.campo}-${index}`}
                        campo={hallazgo.campo}
                        mensaje={hallazgo.mensaje}
                        severidad={hallazgo.severidad}
                        esperado={hallazgo.esperado}
                        encontrado={hallazgo.encontrado}
                      />
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-grafito-600">
              Todavía no hay revisión disponible para este documento.
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
      {p.documentoId && p.tipo === "PLAN_ESTRUCTURADO" && (
        <AnalisisDocumentalPanel key={p.documentoId} documentoId={p.documentoId} />
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
    </Card>
  );
}
