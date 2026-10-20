import type { ExpedienteDetalleDTO } from "@pis/contracts";
import {
  construirDatosDocumento,
  type ExpedienteDocumento,
} from "@pis/domain/dist/documentos/datos-documento.js";
import {
  esEtiquetaFecha,
  esEtiquetaHora,
  fechaLarga,
  fechaLatina,
  horaLimpia,
} from "@pis/domain/dist/documentos/etiquetas.js";
import { AlertCircle, CheckCircle2, Edit3, Plus, RefreshCw, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { useExpedienteDetalle, useGenerarDocumentos } from "../../api/expedientes.js";
import { cn } from "../../utils/cn.js";
import { Button } from "../ui/button.js";
import { Dialogo } from "../ui/dialog.js";
import { controlClase } from "../ui/field.js";
import { InputFechaLatina } from "../ui/input-fecha-latina.js";
import { useToast } from "../ui/toast.js";

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  expedienteId: string;
  expediente?: ExpedienteDetalleDTO | null;
  etapa: "E1" | "E2" | "E6";
  formato: {
    tipo: string;
    nombre: string;
    version: number;
    pendientes: string[];
  } | null;
}

/** Catálogo de campos oficiales y etiquetas relevantes por tipo de formato. */
const CAMPOS_POR_TIPO: Record<string, { clave: string; label: string; placeholder?: string }[]> = {
  // Etapa 01
  SOLICITUD_INSCRIPCION: [
    { clave: "TESIS", label: "Título del Plan de Tesis" },
    { clave: "ASESOR", label: "Asesor Propuesto" },
    { clave: "COASESOR", label: "Coasesor Propuesto (opcional)" },
    { clave: "FECHA", label: "Fecha de Solicitud" },
    { clave: "DIRECCION", label: "Dirección del Tesista 01" },
    { clave: "TELEFONO", label: "Teléfono del Tesista 01" },
    { clave: "CORREO", label: "Correo del Tesista 01" },
  ],
  ANEXO_17: [
    { clave: "TESIS", label: "Título del Plan de Tesis" },
    { clave: "ASESOR", label: "Asesor Propuesto" },
    { clave: "COASESOR", label: "Coasesor Propuesto (opcional)" },
    { clave: "FECHA", label: "Fecha de Emisión" },
    { clave: "DIRECCION", label: "Dirección del Tesista 01" },
    { clave: "TELEFONO", label: "Teléfono del Tesista 01" },
    { clave: "CORREO", label: "Correo del Tesista 01" },
  ],
  CARATULA_PLAN: [
    { clave: "TESIS", label: "Título del Plan de Tesis" },
    { clave: "ASESOR", label: "Asesor" },
    { clave: "COASESOR", label: "Coasesor (opcional)" },
    { clave: "PROGRAMA", label: "Programa Académico" },
  ],
  DECRETO_APROBACION: [
    { clave: "DECRETO", label: "N° de Decreto" },
    { clave: "FECHA DE DECRETO", label: "Fecha de Decreto" },
    { clave: "PRESIDENTE", label: "Presidente de Jurado" },
    { clave: "ASESOR", label: "Asesor" },
    { clave: "SECRETARIO", label: "Secretario de Jurado" },
    { clave: "COASESOR", label: "Coasesor (opcional)" },
  ],
  OFICIO_CIRCULAR_TERNA: [
    { clave: "OFICIO", label: "N° de Oficio" },
    { clave: "FECHA DE OFICIO CIRCULAR", label: "Fecha Oficio Circular" },
    { clave: "PRESIDENTE", label: "Presidente de Jurado" },
    { clave: "ASESOR", label: "Asesor" },
    { clave: "SECRETARIO", label: "Secretario de Jurado" },
  ],
  OFICIO_CIRCULAR: [
    { clave: "OFICIO", label: "N° de Oficio" },
    { clave: "FECHA DE OFICIO CIRCULAR", label: "Fecha Oficio Circular" },
    { clave: "PRESIDENTE", label: "Presidente de Jurado" },
    { clave: "ASESOR", label: "Asesor" },
    { clave: "SECRETARIO", label: "Secretario de Jurado" },
  ],
  OBSERVACIONES_PLAN: [
    { clave: "RECOMENDACION", label: "Recomendaciones / Observaciones del Plan" },
    { clave: "FECHA DE OBSERVACIONES", label: "Fecha de Observaciones" },
    { clave: "PRESIDENTE", label: "Presidente de Jurado" },
    { clave: "ASESOR", label: "Asesor" },
    { clave: "SECRETARIO", label: "Secretario de Jurado" },
  ],
  OBSERVACIONES_PLAN_TESIS: [
    { clave: "RECOMENDACION", label: "Recomendaciones / Observaciones del Plan" },
    { clave: "FECHA DE OBSERVACIONES", label: "Fecha de Observaciones" },
    { clave: "PRESIDENTE", label: "Presidente de Jurado" },
    { clave: "ASESOR", label: "Asesor" },
    { clave: "SECRETARIO", label: "Secretario de Jurado" },
  ],

  // Etapa 02
  ACTA_CONFORMIDAD: [
    { clave: "FECHA DE CONFORMIDAD", label: "Fecha de Conformidad" },
    { clave: "ASESOR", label: "Asesor" },
  ],
  ACTA_DICTAMEN: [
    { clave: "FECHA DE DICTAMEN", label: "Fecha de Dictamen" },
    { clave: "FECHA DE CONFORMIDAD", label: "Fecha Fijada para la Sustentación" },
    { clave: "PRESIDENTE ETAPA 02", label: "Presidente de Jurado (Etapa 02)" },
    { clave: "SECRETARIO ETAPA 02", label: "Secretario de Jurado (Etapa 02)" },
    { clave: "INTEGRANTE", label: "Integrante (Asesor)" },
  ],
  ACTA_SUSTENTACION: [
    { clave: "NUMERO_ACTA", label: "N° de Acta (ej. 001 o 059)" },
    { clave: "VEREDICTO", label: "Veredicto del Jurado" },
    { clave: "FECHA DE CONFORMIDAD", label: "Fecha de Sustentación" },
    { clave: "HORAS DE LA SUSTENTACION", label: "Hora de Sustentación" },
    { clave: "LUGAR SUSTENTACIÓN", label: "Lugar de Sustentación" },
    { clave: "PRESIDENTE ETAPA 02", label: "Presidente de Jurado (Etapa 02)" },
    { clave: "SECRETARIO ETAPA 02", label: "Secretario de Jurado (Etapa 02)" },
    { clave: "INTEGRANTE", label: "Integrante (Asesor)" },
  ],
  RESOLUCION_DECANAL: [
    { clave: "DECANAL", label: "N° Resolución Decanal" },
    { clave: "FECHA DE NOMBRAMIENTO DE JURADOS", label: "Fecha de Nombramiento" },
    { clave: "PRESIDENTE ETAPA 02", label: "Presidente de Jurado" },
    { clave: "SECRETARIO ETAPA 02", label: "Secretario de Jurado" },
    { clave: "SUPLENTE ETAPA 02", label: "Suplente de Jurado" },
    { clave: "INTEGRANTE", label: "Integrante (Asesor)" },
  ],
  OFICIO_OTI_SIMILITUD: [
    { clave: "OFICIO", label: "N° de Oficio OTI" },
    { clave: "FECHA DE CONFORMIDAD", label: "Fecha de Oficio" },
  ],
  OFICIO_UGI_REPOSITORIO: [
    { clave: "OFICIO", label: "N° de Oficio UGI" },
    { clave: "FECHA_OFICIO_UGI", label: "Fecha de Oficio UGI" },
  ],
  ANEXO_08: [
    { clave: "FECHA DE CONFORMIDAD", label: "Fecha de Conformidad" },
    { clave: "ASESOR", label: "Asesor" },
  ],
  INFORME_ASESORAMIENTO: [
    { clave: "FECHA DE CONFORMIDAD", label: "Fecha de Conformidad" },
    { clave: "ASESOR", label: "Asesor" },
  ],
  ANEXO_27: [{ clave: "FECHA DE SOLICITUD", label: "Fecha de Solicitud" }],
  ANEXO_01_DJ: [{ clave: "FECHA", label: "Fecha de Declaración Jurada" }],
  ANEXO_01_DJ_P1: [{ clave: "FECHA", label: "Fecha (Participante 01)" }],
  ANEXO_01_DJ_P2: [{ clave: "FECHA", label: "Fecha (Participante 02)" }],
  ANEXO_02_DJ: [{ clave: "FECHA", label: "Fecha de Declaración Jurada" }],
  ANEXO_02_DJ_P1: [{ clave: "FECHA", label: "Fecha (Participante 01)" }],
  ANEXO_02_DJ_P2: [{ clave: "FECHA", label: "Fecha (Participante 02)" }],
  ANEXO_32_VERACIDAD: [{ clave: "FECHA_EMISION", label: "Fecha de Emisión" }],
  AUTORIZACION_IMPRESION: [
    { clave: "FECHA DE IMPRESION", label: "Fecha de Impresión" },
    { clave: "FECHA DE CONFORMIDAD", label: "Fecha de Conformidad" },
    { clave: "PRESIDENTE ETAPA 02", label: "Presidente" },
    { clave: "SECRETARIO ETAPA 02", label: "Secretario" },
    { clave: "INTEGRANTE", label: "Integrante (Asesor)" },
  ],
  AUTORIZACION_PUBLICACION: [
    { clave: "FECHA DE PUBLICACION", label: "Fecha de Publicación" },
    { clave: "FECHA DE CONFORMIDAD", label: "Fecha de Conformidad" },
    { clave: "PRESIDENTE ETAPA 02", label: "Presidente" },
    { clave: "SECRETARIO ETAPA 02", label: "Secretario" },
    { clave: "INTEGRANTE", label: "Integrante (Asesor)" },
  ],
  CARATULA_FINAL: [
    { clave: "TESIS", label: "Título de la Tesis Final" },
    { clave: "ASESOR", label: "Asesor" },
    { clave: "COASESOR", label: "Coasesor (opcional)" },
    { clave: "PRESIDENTE", label: "Presidente" },
    { clave: "SECRETARIO", label: "Secretario" },
  ],
  OBSERVACIONES_TESIS: [
    { clave: "RECOMENDACIONES_TESIS", label: "Observaciones / Recomendaciones" },
    { clave: "FECHA DE OBSERVACIONES 02", label: "Fecha de Observaciones Borrador" },
  ],
  INFORME_SIMILITUD: [
    { clave: "FECHA DE SIMILITUD", label: "Fecha de Informe de Similitud" },
    { clave: "EXPEDIENTE DE SIMILITUD", label: "Expediente de Similitud" },
    { clave: "SIMILITUD", label: "% Similitud Turnitin" },
  ],
  INVITACION_PUBLICA: [
    { clave: "FECHA DE INVITACIÓN PÚBLICA", label: "Fecha de Invitación Pública (Emisión)" },
    { clave: "FECHA DE SUSTENTACION", label: "Fecha de Sustentación" },
    { clave: "HORAS DE LA SUSTENTACION", label: "Hora de Sustentación" },
    { clave: "LUGAR SUSTENTACIÓN", label: "Lugar de Sustentación" },
  ],
  ETIQUETAS: [
    { clave: "TESIS", label: "Título del Plan / Tesis" },
    { clave: "ASESOR", label: "Asesor" },
    { clave: "COASESOR", label: "Coasesor (opcional)" },
    { clave: "PROGRAMA", label: "Programa Académico" },
  ],
};

/**
 * Modal de Modificación y Corrección In-Situ de Formatos.
 * Muestra los datos del documento con sus valores actuales precargados, permitiendo
 * editarlos directamente incluso cuando el documento esté completo.
 */
export function ModalModificarFormato({
  abierto,
  onCerrar,
  expedienteId,
  expediente,
  etapa,
  formato,
}: Props) {
  const avisar = useToast();
  const generar = useGenerarDocumentos(expedienteId);
  const expQuery = useExpedienteDetalle(expedienteId, !expediente);
  const expData = expediente ?? expQuery.data;

  // Mapa de modificaciones explícitas del usuario: { CLAVE: valorModificado }
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [clavesPersonalizadas, setClavesPersonalizadas] = useState<string[]>([]);
  const [nuevaClave, setNuevaClave] = useState("");
  const [nuevoValor, setNuevoValor] = useState("");

  // Extraer valores vigentes del expediente para todas las etiquetas canónicas
  const valoresBase = useMemo<Record<string, string>>(() => {
    if (!expData) return {};
    try {
      return construirDatosDocumento(expData as unknown as ExpedienteDocumento, new Date());
    } catch {
      return {};
    }
  }, [expData]);

  // Lista consolidada de campos para este documento
  const camposFormato = useMemo(() => {
    if (!formato) return [];
    const base = CAMPOS_POR_TIPO[formato.tipo] ?? [];
    const clavesExistentes = new Set(base.map((c) => c.clave.toUpperCase()));
    const resultado = [...base];

    // Incluir campos pendientes que no estén en la lista base
    for (const p of formato.pendientes) {
      const pUpper = p.toUpperCase();
      if (!clavesExistentes.has(pUpper)) {
        resultado.push({
          clave: p,
          label: p.replace(/_/g, " "),
        });
        clavesExistentes.add(pUpper);
      }
    }

    // Incluir claves personalizadas agregadas dinámicamente por el usuario
    for (const c of clavesPersonalizadas) {
      const cUpper = c.toUpperCase();
      if (!clavesExistentes.has(cUpper)) {
        resultado.push({
          clave: c,
          label: c.replace(/_/g, " "),
        });
        clavesExistentes.add(cUpper);
      }
    }

    return resultado;
  }, [formato, clavesPersonalizadas]);

  if (!formato) return null;

  function actualizarCampo(clave: string, valor: string): void {
    setOverrides((prev) => ({ ...prev, [clave]: valor }));
  }

  function restaurarCampo(clave: string): void {
    setOverrides((prev) => {
      const copia = { ...prev };
      delete copia[clave];
      return copia;
    });
  }

  function agregarCampoPersonalizado(): void {
    const k = nuevaClave.trim().toUpperCase().replace(/\s+/g, "_");
    if (!k) return;
    let v = nuevoValor.trim();
    if (!v && esEtiquetaFecha(k)) {
      v = fechaLatina(new Date().toISOString().slice(0, 10));
    } else if (!v && esEtiquetaHora(k)) {
      v = "09:00";
    }
    setClavesPersonalizadas((prev) => (prev.includes(k) ? prev : [...prev, k]));
    setOverrides((prev) => ({ ...prev, [k]: v }));
    setNuevaClave("");
    setNuevoValor("");
  }

  async function onGuardar(): Promise<void> {
    if (!formato) return;
    try {
      const overridesFormateados: Record<string, string> = {};
      for (const [k, v] of Object.entries(overrides)) {
        const valLimpio = v.trim();
        let formatted = valLimpio;
        if (esEtiquetaFecha(k)) {
          formatted = valLimpio ? fechaLarga(valLimpio) : "";
        } else if (esEtiquetaHora(k)) {
          formatted = horaLimpia(valLimpio) || valLimpio;
        }
        overridesFormateados[k] = formatted;
        if (k === "VEREDICTO") {
          overridesFormateados.VERREDICTO = formatted;
        }
        if (k === "NUMERO_ACTA") {
          overridesFormateados.ACTA_NUMERO = formatted;
          overridesFormateados["NUMERO DE ACTA"] = formatted;
          overridesFormateados["N° DE ACTA"] = formatted;
        }

        if (k === "FECHA DE CONFORMIDAD" && formato.tipo === "ANEXO_08") {
          overridesFormateados.FECHA = formatted;
        }
        if (k === "FECHA DE SIMILITUD") {
          overridesFormateados.FECHA = formatted;
        }
      }

      await generar.mutateAsync({
        etapa,
        tipo: formato.tipo,
        overrides: Object.keys(overridesFormateados).length > 0 ? overridesFormateados : undefined,
      });

      avisar(`${formato.nombre} actualizado a v${formato.version + 1} en el expediente`, "ok");
      setOverrides({});
      setClavesPersonalizadas([]);
      onCerrar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : "Error al regenerar documento", "error");
    }
  }

  const cantidadModificados = Object.keys(overrides).length;
  const esDocumentoCompleto = formato.pendientes.length === 0;

  return (
    <Dialogo
      abierto={abierto}
      ancho="max-w-2xl"
      descripcion=""
      onAbierto={(v) => {
        if (!v) {
          setOverrides({});
          setClavesPersonalizadas([]);
          onCerrar();
        }
      }}
      titulo=""
    >
      <div className="space-y-4 -mt-2">
        {/* Cabecera del diálogo */}
        <div className="border-b border-slate-200 pb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-navy-50 text-navy-800">
              <Edit3 size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-navy-950">
                Modificar Datos: {formato.nombre}
              </h3>
              <p className="text-xs text-slate-500">
                Edite los campos directamente para regenerar una nueva versión (v
                {formato.version + 1}).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {esDocumentoCompleto ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 border border-emerald-200">
                <CheckCircle2 size={13} />
                Completo (v{formato.version})
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 border border-amber-200">
                <AlertCircle size={13} />
                {formato.pendientes.length} campo(s) pendiente(s)
              </span>
            )}
          </div>
        </div>

        {/* Resumen de estado */}
        {cantidadModificados > 0 && (
          <div className="flex items-center justify-between rounded-lg bg-sky-50 px-3 py-2 text-xs font-medium text-sky-900 border border-sky-200">
            <span>
              ✏️ {cantidadModificados} campo(s) modificado(s) listos para aplicar y persistir en el
              expediente.
            </span>
            <button
              type="button"
              onClick={() => setOverrides({})}
              className="text-sky-700 hover:text-sky-950 underline font-semibold cursor-pointer"
            >
              Restablecer todos
            </button>
          </div>
        )}

        {/* Lista de campos editables del documento */}
        <div className="max-h-[58vh] overflow-y-auto pr-1 space-y-3">
          {camposFormato.map((campo) => {
            const claveUpper = campo.clave.toUpperCase();
            const esPendiente =
              formato.pendientes.includes(campo.clave) || formato.pendientes.includes(claveUpper);
            const tieneOverride = campo.clave in overrides;
            const valorActual = tieneOverride
              ? overrides[campo.clave]
              : (valoresBase[claveUpper] ?? valoresBase[campo.clave] ?? "");

            const esFecha = esEtiquetaFecha(campo.clave) || esEtiquetaFecha(claveUpper);
            const esHora = esEtiquetaHora(campo.clave) || esEtiquetaHora(claveUpper);
            const esLargo =
              claveUpper.includes("RECOMENDACION") ||
              claveUpper.includes("OBSERVACIONES") ||
              claveUpper === "TESIS" ||
              claveUpper === "TITULO";

            return (
              <div
                key={campo.clave}
                className={cn(
                  "rounded-lg border p-3 transition space-y-1.5",
                  esPendiente
                    ? "border-amber-300 bg-amber-50/40"
                    : tieneOverride
                      ? "border-sky-300 bg-sky-50/30"
                      : "border-slate-200 bg-slate-50/50 hover:bg-slate-50",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor={`campo-${campo.clave}`}
                      className="text-xs font-bold text-navy-900 uppercase"
                    >
                      {campo.label}
                    </label>
                    <span className="font-mono text-[10px] text-slate-400">({campo.clave})</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {esPendiente && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                        Pendiente
                      </span>
                    )}
                    {tieneOverride && (
                      <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-800">
                        Modificado
                      </span>
                    )}
                    {tieneOverride && (
                      <button
                        type="button"
                        onClick={() => restaurarCampo(campo.clave)}
                        title="Restablecer valor original del expediente"
                        className="text-slate-400 hover:text-slate-700"
                      >
                        <RotateCcw size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Control correspondiente */}
                {esFecha ? (
                  <div className="w-full">
                    <InputFechaLatina
                      id={`campo-${campo.clave}`}
                      ariaLabel={campo.label}
                      value={valorActual}
                      onChange={(val) => actualizarCampo(campo.clave, val)}
                    />
                  </div>
                ) : esHora ? (
                  <div className="flex items-center gap-2">
                    <input
                      id={`campo-${campo.clave}`}
                      aria-label={campo.label}
                      type="time"
                      className={cn(controlClase, "h-9 w-36 shrink-0 bg-white")}
                      value={horaLimpia(valorActual)}
                      onChange={(e) => actualizarCampo(campo.clave, e.target.value)}
                    />
                    <span className="text-xs text-slate-500">
                      {horaLimpia(valorActual)
                        ? `${horaLimpia(valorActual)} hrs (formato 24h)`
                        : "Seleccione hora"}
                    </span>
                  </div>
                ) : esLargo ? (
                  <textarea
                    id={`campo-${campo.clave}`}
                    aria-label={campo.label}
                    className={cn(controlClase, "min-h-[56px] py-1.5 w-full bg-white text-xs")}
                    rows={2}
                    placeholder={`Ingrese ${campo.label.toLowerCase()}…`}
                    value={valorActual}
                    onChange={(e) => actualizarCampo(campo.clave, e.target.value)}
                  />
                ) : campo.clave === "VEREDICTO" ? (
                  <div className="space-y-1.5">
                    <select
                      id={`campo-${campo.clave}`}
                      aria-label={campo.label}
                      className={cn(controlClase, "h-9 w-full bg-white text-xs")}
                      value={
                        [
                          "APROBADO POR UNANIMIDAD",
                          "APROBADO POR MAYORÍA",
                          "APROBADO CON FELICITACIÓN PÚBLICA",
                          "DESAPROBADO",
                        ].includes(valorActual)
                          ? valorActual
                          : valorActual
                            ? "OTRO"
                            : ""
                      }
                      onChange={(e) => {
                        if (e.target.value !== "OTRO") {
                          actualizarCampo(campo.clave, e.target.value);
                        }
                      }}
                    >
                      <option value="">-- Seleccione veredicto --</option>
                      <option value="APROBADO POR UNANIMIDAD">APROBADO POR UNANIMIDAD</option>
                      <option value="APROBADO POR MAYORÍA">APROBADO POR MAYORÍA</option>
                      <option value="APROBADO CON FELICITACIÓN PÚBLICA">
                        APROBADO CON FELICITACIÓN PÚBLICA
                      </option>
                      <option value="DESAPROBADO">DESAPROBADO</option>
                      <option value="OTRO">Otro / Personalizado</option>
                    </select>
                    <input
                      id={`campo-${campo.clave}-texto`}
                      aria-label="Texto de veredicto"
                      className={cn(controlClase, "h-8 w-full bg-white text-xs")}
                      placeholder="O escriba el veredicto exacto…"
                      value={valorActual}
                      onChange={(e) => actualizarCampo(campo.clave, e.target.value)}
                    />
                  </div>
                ) : (
                  <input
                    id={`campo-${campo.clave}`}
                    aria-label={campo.label}
                    className={cn(controlClase, "h-9 w-full bg-white text-xs")}
                    placeholder={`Ingrese ${campo.label.toLowerCase()}…`}
                    value={valorActual}
                    onChange={(e) => actualizarCampo(campo.clave, e.target.value)}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Sección para agregar campo o etiqueta personalizada extra */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <h4 className="text-xs font-bold text-navy-950 uppercase">
            + Agregar otra etiqueta o campo especial:
          </h4>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              aria-label="Etiqueta"
              className={`${controlClase} w-44 bg-white text-xs`}
              placeholder="Ej. RECOMENDACION"
              value={nuevaClave}
              onChange={(e) => setNuevaClave(e.target.value)}
            />
            <input
              aria-label="Valor corregido"
              className={`${controlClase} flex-1 bg-white text-xs`}
              placeholder="Texto o valor para esta etiqueta…"
              value={nuevoValor}
              onChange={(e) => setNuevoValor(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  agregarCampoPersonalizado();
                }
              }}
            />
            <Button
              tamano="sm"
              variante="contorno"
              onClick={agregarCampoPersonalizado}
              type="button"
              disabled={!nuevaClave.trim()}
            >
              <Plus size={14} />
              Agregar
            </Button>
          </div>
        </div>

        {/* Botones de acción */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
          <Button
            tamano="sm"
            variante="contorno"
            onClick={() => {
              setOverrides({});
              setClavesPersonalizadas([]);
              onCerrar();
            }}
            type="button"
          >
            Cancelar
          </Button>
          <Button
            disabled={generar.isPending}
            tamano="sm"
            variante="primario"
            onClick={() => void onGuardar()}
            type="button"
          >
            <RefreshCw size={14} className={generar.isPending ? "animate-spin" : ""} />
            {generar.isPending
              ? "Regenerando documento…"
              : cantidadModificados > 0
                ? `Guardar y Regenerar (${cantidadModificados} cambios · v${formato.version + 1})`
                : `Regenerar Formato (v${formato.version + 1})`}
          </Button>
        </div>
      </div>
    </Dialogo>
  );
}
