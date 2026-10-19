import {
  esEtiquetaFecha,
  esEtiquetaHora,
  fechaLarga,
  fechaLatina,
  horaLimpia,
} from "@pis/domain/dist/documentos/etiquetas.js";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { useGenerarDocumentos } from "../../api/expedientes.js";
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
  etapa: "E1" | "E2" | "E6";
  formato: {
    tipo: string;
    nombre: string;
    version: number;
    pendientes: string[];
  } | null;
}

/**
 * Diálogo de Modificación y Regeneración de Formatos Oficiales (Gestión de Errores - Nivel 2).
 * Permite corregir campos específicos (fechas, recomendaciones, textos especiales)
 * e incrementar la versión del documento reemplazándolo directamente en Google Drive.
 */
export function ModalModificarFormato({ abierto, onCerrar, expedienteId, etapa, formato }: Props) {
  const avisar = useToast();
  const generar = useGenerarDocumentos(expedienteId);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [nuevaClave, setNuevaClave] = useState("");
  const [nuevoValor, setNuevoValor] = useState("");

  if (!formato) return null;

  function actualizarCampo(clave: string, valor: string): void {
    setOverrides((prev) => ({ ...prev, [clave]: valor }));
  }

  function eliminarCampo(clave: string): void {
    setOverrides((prev) => {
      const copia = { ...prev };
      delete copia[clave];
      return copia;
    });
  }

  function agregarCampo(): void {
    const k = nuevaClave.trim().toUpperCase().replace(/\s+/g, "_");
    if (!k) return;
    let v = nuevoValor.trim();
    if (!v && esEtiquetaFecha(k)) {
      v = fechaLatina(new Date().toISOString().slice(0, 10));
    } else if (!v && esEtiquetaHora(k)) {
      v = "09:00";
    }
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
        if (!valLimpio) continue;
        if (esEtiquetaFecha(k)) {
          overridesFormateados[k] = fechaLarga(valLimpio);
        } else if (esEtiquetaHora(k)) {
          overridesFormateados[k] = horaLimpia(valLimpio) || valLimpio;
        } else {
          overridesFormateados[k] = valLimpio;
        }
      }
      await generar.mutateAsync({
        etapa,
        tipo: formato.tipo,
        overrides: Object.keys(overridesFormateados).length > 0 ? overridesFormateados : undefined,
      });
      avisar(`${formato.nombre} actualizado a v${formato.version + 1} en Google Drive`);
      setOverrides({});
      onCerrar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : "Error al regenerar documento", "error");
    }
  }

  const CAMPOS_SUGERIDOS_POR_TIPO: Record<
    string,
    { clave: string; label: string; sugerencia?: string }[]
  > = {
    ACTA_SUSTENTACION: [
      { clave: "VEREDICTO", label: "Veredicto", sugerencia: "UNANIMIDAD" },
      { clave: "FECHA DE CONFORMIDAD", label: "Fecha Sustentación" },
      { clave: "HORAS DE LA SUSTENTACION", label: "Hora", sugerencia: "09:00" },
      {
        clave: "LUGAR SUSTENTACIÓN",
        label: "Lugar",
        sugerencia: "Salón de Grados de la Escuela Profesional de Ingeniería Industrial",
      },
      {
        clave: "PRESIDENTE ETAPA 02",
        label: "Presidente",
        sugerencia: "Dr. Cecilio Mauro Villavicencio Melgarejo",
      },
      { clave: "INTEGRANTE", label: "Integrante (Asesor)" },
      {
        clave: "SECRETARIO ETAPA 02",
        label: "Secretario",
        sugerencia: "Dr. Edwin Carlos Leoncio Gama Quispe",
      },
    ],
    ACTA_DICTAMEN: [
      { clave: "FECHA DE DICTAMEN", label: "Fecha Dictamen" },
      { clave: "FECHA DE CONFORMIDAD", label: "Fecha Fijada de Sustentación" },
      {
        clave: "PRESIDENTE ETAPA 02",
        label: "Presidente",
        sugerencia: "Dr. Cecilio Mauro Villavicencio Melgarejo",
      },
      { clave: "INTEGRANTE", label: "Integrante (Asesor)" },
      {
        clave: "SECRETARIO ETAPA 02",
        label: "Secretario",
        sugerencia: "Dr. Edwin Carlos Leoncio Gama Quispe",
      },
    ],
    ACTA_CONFORMIDAD: [{ clave: "FECHA DE CONFORMIDAD", label: "Fecha de Conformidad" }],
    RESOLUCION_DECANAL: [
      { clave: "DECANAL", label: "N° Resolución Decanal", sugerencia: "447-2026-FIPS" },
      { clave: "FECHA DE NOMBRAMIENTO DE JURADOS", label: "Fecha de Nombramiento" },
      {
        clave: "PRESIDENTE ETAPA 02",
        label: "Presidente",
        sugerencia: "Dr. Cecilio Mauro Villavicencio Melgarejo",
      },
      { clave: "INTEGRANTE", label: "Integrante (Asesor)" },
      {
        clave: "SECRETARIO ETAPA 02",
        label: "Secretario",
        sugerencia: "Dr. Edwin Carlos Leoncio Gama Quispe",
      },
      {
        clave: "SUPLENTE ETAPA 02",
        label: "Suplente",
        sugerencia: "Mg. Hugo Rufino Llamosas Barriga",
      },
    ],
    OFICIO_OTI_SIMILITUD: [
      { clave: "OFICIO_OTI", label: "N° de Oficio", sugerencia: "322-2026" },
      { clave: "FECHA DE CONFORMIDAD", label: "Fecha de Conformidad" },
    ],
    OFICIO_UGI_REPOSITORIO: [
      { clave: "OFICIO_UGI", label: "N° de Oficio", sugerencia: "XXX-2026" },
      { clave: "FECHA_OFICIO_UGI", label: "Fecha Oficio UGI" },
    ],
    OBSERVACIONES_PLAN: [
      { clave: "RECOMENDACION", label: "Recomendaciones del Plan" },
      { clave: "FECHA DE OBSERVACIONES", label: "Fecha de Observaciones" },
    ],
    OBSERVACIONES_TESIS: [
      { clave: "RECOMENDACIONES_TESIS", label: "Observaciones / Recomendaciones" },
      { clave: "FECHA DE OBSERVACIONES 02", label: "Fecha de Observaciones Borrador" },
    ],
    AUTORIZACION_IMPRESION: [
      { clave: "FECHA DE IMPRESION", label: "Fecha de Impresión" },
      { clave: "FECHA DE CONFORMIDAD", label: "Fecha de Conformidad" },
      {
        clave: "PRESIDENTE ETAPA 02",
        label: "Presidente",
        sugerencia: "Dr. Cecilio Mauro Villavicencio Melgarejo",
      },
      { clave: "INTEGRANTE", label: "Integrante (Asesor)" },
      {
        clave: "SECRETARIO ETAPA 02",
        label: "Secretario",
        sugerencia: "Dr. Edwin Carlos Leoncio Gama Quispe",
      },
    ],
    AUTORIZACION_PUBLICACION: [
      { clave: "FECHA DE PUBLICACION", label: "Fecha de Publicación" },
      { clave: "FECHA DE CONFORMIDAD", label: "Fecha de Conformidad" },
      {
        clave: "PRESIDENTE ETAPA 02",
        label: "Presidente",
        sugerencia: "Dr. Cecilio Mauro Villavicencio Melgarejo",
      },
      { clave: "INTEGRANTE", label: "Integrante (Asesor)" },
      {
        clave: "SECRETARIO ETAPA 02",
        label: "Secretario",
        sugerencia: "Dr. Edwin Carlos Leoncio Gama Quispe",
      },
    ],
    ANEXO_27: [{ clave: "FECHA DE SOLICITUD", label: "Fecha de Solicitud" }],
    ANEXO_01_DJ: [{ clave: "FECHA", label: "Fecha" }],
    ANEXO_01_DJ_P1: [{ clave: "FECHA", label: "Fecha (Participante 01)" }],
    ANEXO_01_DJ_P2: [{ clave: "FECHA", label: "Fecha (Participante 02)" }],
    ANEXO_02_DJ: [{ clave: "FECHA", label: "Fecha" }],
    ANEXO_02_DJ_P1: [{ clave: "FECHA", label: "Fecha (Participante 01)" }],
    ANEXO_02_DJ_P2: [{ clave: "FECHA", label: "Fecha (Participante 02)" }],
    ANEXO_32_VERACIDAD: [{ clave: "FECHA_EMISION", label: "Fecha Emisión / Días" }],
    DECRETO_APROBACION: [
      { clave: "DECRETO", label: "N° de Decreto" },
      { clave: "FECHA DE DECRETO", label: "Fecha de Decreto" },
      { clave: "PRESIDENTE", label: "Presidente" },
      { clave: "SECRETARIO", label: "Secretario" },
    ],
    OFICIO_CIRCULAR_TERNA: [
      { clave: "OFICIO", label: "N° de Oficio" },
      { clave: "FECHA DE OFICIO CIRCULAR", label: "Fecha Oficio Circular" },
      { clave: "PRESIDENTE", label: "Presidente" },
      { clave: "SECRETARIO", label: "Secretario" },
    ],
  };

  const sugeridos = CAMPOS_SUGERIDOS_POR_TIPO[formato.tipo] ?? [];

  return (
    <Dialogo
      abierto={abierto}
      ancho="max-w-xl"
      descripcion={`Corrección puntual de datos y regeneración in-situ para ${formato.nombre} (versión actual v${formato.version}).`}
      onAbierto={(v) => {
        if (!v) {
          setOverrides({});
          onCerrar();
        }
      }}
      titulo="Modificar Formato y Corregir Errores"
    >
      <div className="space-y-4">
        {formato.pendientes.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3">
            <h4 className="text-xs font-bold text-amber-900 uppercase">
              Campos pendientes detectados ({formato.pendientes.length}):
            </h4>
            <p className="mt-0.5 text-xs text-amber-800">
              Haz clic en cualquiera para agregarlo rápidamente a las correcciones:
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {formato.pendientes.map((p) => (
                <button
                  key={p}
                  className="rounded-md border border-amber-300 bg-white px-2 py-0.5 text-xs font-semibold text-amber-950 transition hover:bg-amber-100"
                  onClick={() => {
                    if (!(p in overrides)) {
                      let valorInicial = "";
                      if (esEtiquetaFecha(p)) {
                        valorInicial = fechaLarga(new Date().toISOString().slice(0, 10));
                      } else if (esEtiquetaHora(p)) {
                        valorInicial = "09:00";
                      }
                      setOverrides((prev) => ({ ...prev, [p]: valorInicial }));
                    }
                  }}
                  type="button"
                >
                  +{p}
                </button>
              ))}
            </div>
          </div>
        )}

        {sugeridos.length > 0 && (
          <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3">
            <h4 className="text-xs font-bold text-sky-950 uppercase">
              Campos configurables para este documento:
            </h4>
            <p className="mt-0.5 text-xs text-sky-800">
              Haz clic para personalizar fechas, oficios, resoluciones o jurados:
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {sugeridos.map((s) => (
                <button
                  key={s.clave}
                  className="rounded-md border border-sky-300 bg-white px-2 py-0.5 text-xs font-medium text-sky-950 transition hover:bg-sky-100"
                  onClick={() => {
                    if (!(s.clave in overrides)) {
                      let valorInicial = s.sugerencia ?? "";
                      if (!valorInicial && esEtiquetaFecha(s.clave)) {
                        valorInicial = fechaLatina(new Date().toISOString().slice(0, 10));
                      } else if (!valorInicial && esEtiquetaHora(s.clave)) {
                        valorInicial = "09:00";
                      }
                      setOverrides((prev) => ({ ...prev, [s.clave]: valorInicial }));
                    }
                  }}
                  type="button"
                >
                  +{s.label} ({s.clave})
                </button>
              ))}
            </div>
          </div>
        )}

        {Object.keys(overrides).length > 0 ? (
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-navy-950 uppercase">
              Valores a corregir / personalizar:
            </h4>
            {Object.entries(overrides).map(([k, v]) => {
              const esFecha = esEtiquetaFecha(k);
              const esHora = esEtiquetaHora(k);
              const esLargo = k.includes("RECOMENDACION") || k === "TESIS" || k === "TITULO";

              return (
                <div
                  key={k}
                  className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 space-y-1.5 transition"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="inline-block truncate rounded-md bg-white border border-slate-200 px-2 py-0.5 text-xs font-mono font-bold text-navy-900"
                      title={k}
                    >
                      {k}
                    </span>
                    {esFecha ? (
                      <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        📅 Formato: {v ? fechaLarga(v) : "Seleccionar fecha"}
                      </span>
                    ) : esHora ? (
                      <span className="text-[11px] font-semibold text-navy-800 bg-navy-50 px-2 py-0.5 rounded border border-navy-200">
                        ⏰ Hora: {horaLimpia(v) || "09:00"} hrs
                      </span>
                    ) : null}
                    <Button
                      tamano="sm"
                      variante="contorno"
                      onClick={() => eliminarCampo(k)}
                      type="button"
                      title="Eliminar este campo"
                      className="ml-auto h-7 px-2"
                    >
                      <Trash2 size={13} className="text-red-600" />
                    </Button>
                  </div>

                  {esFecha ? (
                    <div className="w-full">
                      <InputFechaLatina
                        ariaLabel={`Fecha para ${k}`}
                        value={v}
                        onChange={(val) => actualizarCampo(k, val)}
                      />
                    </div>
                  ) : esHora ? (
                    <div className="flex items-center gap-2 w-full">
                      <input
                        aria-label={`Hora para ${k}`}
                        type="time"
                        className={cn(controlClase, "h-9 w-36 shrink-0 bg-white")}
                        value={horaLimpia(v)}
                        onChange={(e) => {
                          actualizarCampo(k, e.target.value);
                        }}
                      />
                      <p className="text-xs text-grafito-600 truncate">
                        {horaLimpia(v) ? `${horaLimpia(v)} hrs` : "Selecciona hora"}
                      </p>
                    </div>
                  ) : esLargo ? (
                    <textarea
                      aria-label={`Valor para ${k}`}
                      className={cn(controlClase, "min-h-[50px] py-1.5 w-full bg-white")}
                      rows={2}
                      placeholder={`Valor para ${k}…`}
                      value={v}
                      onChange={(e) => actualizarCampo(k, e.target.value)}
                    />
                  ) : (
                    <input
                      aria-label={`Valor para ${k}`}
                      className={cn(controlClase, "h-9 w-full bg-white")}
                      placeholder={`Valor para ${k}…`}
                      value={v}
                      onChange={(e) => actualizarCampo(k, e.target.value)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="rounded-lg bg-slate-50 p-3 text-xs text-grafito-600">
            Sin modificaciones personalizadas. Al presionar "Regenerar Formato" se refrescará con
            los datos vigentes del expediente y se actualizará en Drive como versión v
            {formato.version + 1}.
          </p>
        )}

        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          <h4 className="text-xs font-bold text-navy-950 uppercase">
            Agregar campo o etiqueta personalizada:
          </h4>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              aria-label="Etiqueta"
              className={`${controlClase} w-44`}
              placeholder="Ej. RECOMENDACION"
              value={nuevaClave}
              onChange={(e) => setNuevaClave(e.target.value)}
            />
            <input
              aria-label="Valor corregido"
              className={`${controlClase} flex-1`}
              placeholder="Texto o valor corregido…"
              value={nuevoValor}
              onChange={(e) => setNuevoValor(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  agregarCampo();
                }
              }}
            />
            <Button
              tamano="sm"
              variante="contorno"
              onClick={agregarCampo}
              type="button"
              disabled={!nuevaClave.trim()}
            >
              <Plus size={14} />
              Agregar
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
          <Button
            tamano="sm"
            variante="contorno"
            onClick={() => {
              setOverrides({});
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
            {generar.isPending ? "ACTUALIZANDO EN DRIVE…" : `REGENERAR (v${formato.version + 1})`}
          </Button>
        </div>
      </div>
    </Dialogo>
  );
}
