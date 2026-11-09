import type { ReactNode } from "react";
import { cn } from "../../utils/cn.js";

/**
 * Field: etiqueta + control + ayuda/error con espaciado coherente.
 * Estandariza los formularios (antes cada vista inventaba su label).
 */
export function Field({
  etiqueta,
  htmlFor,
  ayuda,
  error,
  children,
  className,
}: {
  etiqueta: string;
  htmlFor?: string;
  ayuda?: string | undefined;
  error?: string | undefined;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)} htmlFor={htmlFor}>
      <span className="mb-1 block text-[11px] font-bold tracking-wider text-grafito-600 uppercase">
        {etiqueta}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs font-medium text-red-700">{error}</span>
      ) : ayuda ? (
        <span className="mt-1 block text-xs text-grafito-600">{ayuda}</span>
      ) : null}
    </label>
  );
}

/**
 * ReadonlyField: dato de solo lectura con apariencia de dato (no de input).
 * Corrige la confusión lectura/edición del formulario de Datos.
 */
export function ReadonlyField({
  etiqueta,
  valor,
  className,
}: {
  etiqueta: string;
  valor: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="mb-1 text-[11px] font-bold tracking-wider text-grafito-600 uppercase">
        {etiqueta}
      </p>
      <p className="rounded-lg bg-slate-100/70 px-3 py-2 text-sm text-grafito-900">{valor}</p>
    </div>
  );
}

/** Estilo compartido de controles editables (input/select/textarea). */
export const controlClase =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-card transition-colors placeholder:text-slate-400 hover:border-slate-400 focus:border-navy-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-grafito-600";
