import { CheckCircle2, ChevronDown, FileText } from "lucide-react";
import { useState } from "react";
import { cn } from "../../utils/cn.js";

export function obtenerEtiquetaHallazgo(tipoOCampo: string): {
  label: string;
  bg: string;
  text: string;
  border: string;
} {
  const t = tipoOCampo.toUpperCase();
  if (t === "TITULO") {
    return {
      label: "TÍTULO REGISTRADO",
      bg: "bg-blue-50",
      text: "text-blue-800",
      border: "border-blue-200",
    };
  }
  if (t === "TITULO_COMILLAS") {
    return {
      label: "FORMATO · SIN COMILLAS",
      bg: "bg-amber-50",
      text: "text-amber-800",
      border: "border-amber-200",
    };
  }
  if (t === "TITULO_PUNTO_FINAL") {
    return {
      label: "FORMATO · SIN PUNTO FINAL",
      bg: "bg-amber-50",
      text: "text-amber-800",
      border: "border-amber-200",
    };
  }
  if (t === "TITULO_MAYUSCULAS") {
    return {
      label: "FORMATO · MAYÚSCULAS",
      bg: "bg-purple-50",
      text: "text-purple-800",
      border: "border-purple-200",
    };
  }
  if (t === "MODALIDAD_FORMULA") {
    return {
      label: "FÓRMULA DE PRESENTACIÓN",
      bg: "bg-rose-50",
      text: "text-rose-800",
      border: "border-rose-200",
    };
  }
  if (t.startsWith("TESISTA_") || t === "TESISTAS" || t === "AUTORIA") {
    return {
      label: "AUTORÍA / TESISTA",
      bg: "bg-indigo-50",
      text: "text-indigo-800",
      border: "border-indigo-200",
    };
  }
  if (t === "ASESOR_GRADO") {
    return {
      label: "GRADO DEL ASESOR",
      bg: "bg-teal-50",
      text: "text-teal-800",
      border: "border-teal-200",
    };
  }
  if (t === "ASESOR") {
    return {
      label: "ASESOR DE TESIS",
      bg: "bg-teal-50",
      text: "text-teal-800",
      border: "border-teal-200",
    };
  }
  if (t === "RESUMEN_PALABRAS_CLAVE") {
    return {
      label: "PALABRAS CLAVE",
      bg: "bg-cyan-50",
      text: "text-cyan-800",
      border: "border-cyan-200",
    };
  }
  if (t === "RESUMEN") {
    return {
      label: "SECCIÓN RESUMEN",
      bg: "bg-cyan-50",
      text: "text-cyan-800",
      border: "border-cyan-200",
    };
  }
  if (t === "ABSTRACT_KEYWORDS") {
    return {
      label: "KEYWORDS EN INGLÉS",
      bg: "bg-emerald-50",
      text: "text-emerald-800",
      border: "border-emerald-200",
    };
  }
  if (t === "ABSTRACT") {
    return {
      label: "SECCIÓN ABSTRACT",
      bg: "bg-emerald-50",
      text: "text-emerald-800",
      border: "border-emerald-200",
    };
  }
  if (t === "PRESENTACION_EMPRESA") {
    return {
      label: "PRESENTACIÓN · CENTRO LABORAL",
      bg: "bg-orange-50",
      text: "text-orange-800",
      border: "border-orange-200",
    };
  }
  if (t === "CIUDAD_ANO") {
    return {
      label: "PIE DE PÁGINA (AREQUIPA)",
      bg: "bg-slate-50",
      text: "text-slate-800",
      border: "border-slate-200",
    };
  }
  return {
    label: tipoOCampo,
    bg: "bg-slate-100",
    text: "text-slate-700",
    border: "border-slate-300",
  };
}

export interface ItemHallazgoProps {
  campo: string;
  mensaje: string;
  severidad?: "ADVERTENCIA" | "INFO" | "ERROR" | string | undefined;
  pagina?: number | undefined;
  esperado?: string | undefined;
  encontrado?: string | undefined;
}

export function ItemHallazgo({ campo, mensaje, pagina, esperado, encontrado }: ItemHallazgoProps) {
  const [abierto, setAbierto] = useState(false);
  const meta = obtenerEtiquetaHallazgo(campo);
  const tieneDetalleEspecifico = Boolean(encontrado || esperado);

  return (
    <li className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden transition-all">
      <button
        type="button"
        onClick={() => tieneDetalleEspecifico && setAbierto(!abierto)}
        disabled={!tieneDetalleEspecifico}
        className={cn(
          "w-full text-left p-3.5 flex items-start justify-between gap-3 transition-colors",
          tieneDetalleEspecifico ? "hover:bg-slate-50/80 cursor-pointer" : "cursor-default",
          abierto && "bg-slate-50 border-b border-slate-200",
        )}
      >
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={cn(
                "inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold tracking-wider uppercase border",
                meta.bg,
                meta.text,
                meta.border,
              )}
            >
              [{meta.label}]
            </span>
            {pagina && (
              <span className="text-xs font-semibold text-slate-500">Página {pagina}</span>
            )}
          </div>

          <div className="text-xs font-medium text-slate-800 leading-snug">
            <span className="font-bold text-slate-900">Observación: </span>
            {mensaje}
          </div>
        </div>

        {tieneDetalleEspecifico && (
          <div className="shrink-0 flex items-center gap-1 text-xs text-slate-500 font-medium pt-0.5">
            <span className="hidden sm:inline text-[11px] text-slate-400">
              {abierto ? "Ocultar" : "Ver detalle"}
            </span>
            <ChevronDown
              size={16}
              className={cn(
                "text-slate-400 transition-transform duration-200",
                abierto && "rotate-180 text-navy-800",
              )}
            />
          </div>
        )}
      </button>

      {tieneDetalleEspecifico && abierto && (
        <div className="p-3 bg-slate-50/60 space-y-2 text-xs">
          {encontrado && (
            <div className="rounded-lg border border-red-200 bg-white p-2.5">
              <div className="flex items-center gap-1.5 text-red-900 font-bold text-[11px] uppercase tracking-wider mb-1">
                <FileText size={14} className="text-red-700 shrink-0" />
                <span>Fragmento detectado en el documento:</span>
              </div>
              <pre className="font-mono text-xs text-red-950 bg-red-50/40 p-2 rounded border border-red-100 whitespace-pre-wrap">
                {encontrado}
              </pre>
            </div>
          )}

          {esperado && (
            <div className="rounded-lg border border-emerald-200 bg-white p-2.5">
              <div className="flex items-center gap-1.5 text-emerald-900 font-bold text-[11px] uppercase tracking-wider mb-1">
                <CheckCircle2 size={14} className="text-emerald-700 shrink-0" />
                <span>Formato esperado según guía oficial:</span>
              </div>
              <pre className="font-mono text-xs text-emerald-950 bg-emerald-50/40 p-2 rounded border border-emerald-100 whitespace-pre-wrap">
                {esperado}
              </pre>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
