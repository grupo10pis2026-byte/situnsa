import { cn } from "../../utils/cn.js";

const estilos: Record<string, string> = {
  NO_INICIADO: "bg-slate-100 text-slate-600 border-slate-300",
  EN_CURSO: "bg-blue-100 text-blue-800 border-blue-300",
  FINALIZADO: "bg-verde-inst-100 text-verde-inst-700 border-green-300",
  PENDIENTE: "bg-aviso-100 text-aviso-800 border-yellow-300",
  CARGADO: "bg-blue-100 text-blue-800 border-blue-300",
  OBSERVADO: "bg-orange-100 text-orange-800 border-orange-300",
  APROBADO: "bg-verde-inst-100 text-verde-inst-700 border-green-300",
  RECHAZADO: "bg-red-100 text-red-800 border-red-300",
  ACTIVO: "bg-verde-inst-100 text-verde-inst-700 border-green-300",
  CERRADO: "bg-slate-100 text-slate-600 border-slate-300",
  REGISTRADO: "bg-slate-100 text-slate-600 border-slate-300",
  TITULO_EMITIDO: "bg-verde-inst-100 text-verde-inst-700 border-green-300",
  NUEVA: "bg-blue-100 text-blue-800 border-blue-300",
  EN_REVISION: "bg-purple-100 text-purple-800 border-purple-300",
  OBSERVADA: "bg-orange-100 text-orange-800 border-orange-300",
  ACEPTADA: "bg-verde-inst-100 text-verde-inst-700 border-green-300",
  RECHAZADA: "bg-red-100 text-red-800 border-red-300",
  CONFORME: "bg-verde-inst-100 text-verde-inst-700 border-green-300",
};

/** StatusBadge §14.1: representación uniforme de estados. Nunca solo color: incluye texto. */
export function StatusBadge({ estado, extra }: { estado: string; extra?: string }) {
  const texto = estado.replace(/_/g, " ");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        estilos[estado] ?? "bg-blue-100 text-blue-800 border-blue-300",
      )}
    >
      {texto}
      {extra ? ` · ${extra}` : ""}
    </span>
  );
}
