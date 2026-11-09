import { Inbox } from "lucide-react";
import type { ReactNode } from "react";

/** EmptyState: estados vacíos diseñados (icono + título + descripción + acción). */
export function EmptyState({
  icono,
  titulo,
  descripcion,
  accion,
}: {
  icono?: ReactNode;
  titulo: string;
  descripcion?: string | undefined;
  accion?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-10 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-navy-950/[0.06] text-navy-800">
        {icono ?? <Inbox size={22} />}
      </span>
      <p className="text-sm font-bold text-navy-950">{titulo}</p>
      {descripcion && <p className="max-w-sm text-sm text-grafito-600">{descripcion}</p>}
      {accion && <div className="mt-1">{accion}</div>}
    </div>
  );
}
