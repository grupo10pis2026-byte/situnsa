import { cn } from "../../utils/cn.js";

const estilos: Record<string, string> = {
  NO_INICIADO: "bg-slate-100 text-slate-600 border-slate-300",
  EN_CURSO: "bg-blue-100 text-blue-800 border-blue-300",
  ABIERTO_INSCRIPCIONES: "bg-verde-inst-100 text-verde-inst-700 border-green-300",
  COMPLETO: "bg-aviso-100 text-aviso-800 border-yellow-300",
  FINALIZADO: "bg-verde-inst-100 text-verde-inst-700 border-green-300",
  PENDIENTE: "bg-aviso-100 text-aviso-800 border-yellow-300",
  CARGADO: "bg-blue-100 text-blue-800 border-blue-300",
  OBSERVADO: "bg-orange-100 text-orange-800 border-orange-300",
  OBSERVADA: "bg-orange-100 text-orange-800 border-orange-300",
  APROBADO: "bg-verde-inst-100 text-verde-inst-700 border-green-300",
  RECHAZADO: "bg-red-100 text-red-800 border-red-300",
  ACTIVO: "bg-verde-inst-100 text-verde-inst-700 border-green-300",
  ACTIVA: "bg-verde-inst-100 text-verde-inst-700 border-green-300",
  INACTIVO: "bg-slate-100 text-slate-600 border-slate-300",
  INACTIVA: "bg-slate-100 text-slate-600 border-slate-300",
  HITO: "bg-blue-100 text-blue-800 border-blue-300",
  HITO_FIJO: "bg-navy-950/[0.07] text-navy-950 border-navy-800/40",
  CERRADO: "bg-slate-100 text-slate-600 border-slate-300",
  CANCELADO: "bg-red-100 text-red-800 border-red-300",
  PROGRAMADA: "bg-slate-100 text-slate-600 border-slate-300",
  CANCELADA: "bg-red-100 text-red-800 border-red-300",
  ABIERTA: "bg-blue-100 text-blue-800 border-blue-300",
  REALIZADA: "bg-verde-inst-100 text-verde-inst-700 border-green-300",
  PRESENTE: "bg-verde-inst-100 text-verde-inst-700 border-green-300",
  FALTA: "bg-red-100 text-red-800 border-red-300",
  JUSTIFICADA: "bg-blue-100 text-blue-800 border-blue-300",
  EN_REVISION: "bg-blue-100 text-blue-800 border-blue-300",
  EN_REVISIÓN: "bg-blue-100 text-blue-800 border-blue-300",
  PAGADA: "bg-verde-inst-100 text-verde-inst-700 border-green-300",
  VENCIDA: "bg-red-100 text-red-800 border-red-300",
  EXONERADA: "bg-slate-100 text-slate-600 border-slate-300",
  VALIDADO: "bg-verde-inst-100 text-verde-inst-700 border-green-300",
  CUMPLIDA: "bg-verde-inst-100 text-verde-inst-700 border-green-300",
  CONFORME: "bg-verde-inst-100 text-verde-inst-700 border-green-300",
  ENTREGADA: "bg-blue-100 text-blue-800 border-blue-300",
  AL_DIA: "bg-verde-inst-100 text-verde-inst-700 border-green-300",
  CON_DEUDA: "bg-red-100 text-red-800 border-red-300",
  SIN_CUOTAS: "bg-slate-100 text-slate-600 border-slate-300",
  NO_HABILITADO: "bg-slate-100 text-slate-600 border-slate-300",
  HABILITADO: "bg-blue-100 text-blue-800 border-blue-300",
  ENTREGADO: "bg-indigo-100 text-indigo-800 border-indigo-300",
  NO_ENTREGADO: "bg-red-100 text-red-800 border-red-300",
  VALIDADA: "bg-verde-inst-100 text-verde-inst-700 border-green-300",
  SIN_REVISION: "bg-slate-100 text-slate-600 border-slate-300",
  REVISADO: "bg-blue-100 text-blue-800 border-blue-300",
  FIRMADO: "bg-verde-inst-100 text-verde-inst-700 border-green-300",
  ATENDIDA: "bg-verde-inst-100 text-verde-inst-700 border-green-300",
  DESCARTADA: "bg-slate-100 text-slate-600 border-slate-300",
  RETIRADO: "bg-red-100 text-red-800 border-red-300",
  REGISTRADO: "bg-slate-100 text-slate-600 border-slate-300",
  TITULO_EMITIDO: "bg-verde-inst-100 text-verde-inst-700 border-green-300",
};

/** StatusBadge §14.1: representación uniforme de estados. Nunca solo color: incluye texto. */
export function StatusBadge({
  estado,
  extra,
  etiqueta,
}: {
  estado: string;
  extra?: string;
  etiqueta?: string;
}) {
  const texto = etiqueta ?? estado.replace(/_/g, " ");
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
