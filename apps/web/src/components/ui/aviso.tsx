import { cva, type VariantProps } from "class-variance-authority";
import { AlertTriangle, CheckCircle2, ChevronDown, Info } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { cn } from "../../utils/cn.js";

const aviso = cva("flex items-start gap-2 rounded-lg border px-3 py-2 text-xs", {
  variants: {
    tono: {
      peligro: "border-red-200 bg-red-50 text-red-900 [&_svg]:text-red-600",
      aviso: "border-amber-300 bg-amber-50 text-amber-900 [&_svg]:text-amber-600",
      info: "border-indigo-200 bg-indigo-50/70 text-indigo-950 [&_svg]:text-indigo-600",
      exito: "border-emerald-300 bg-emerald-50 text-emerald-950 [&_svg]:text-emerald-600",
    },
  },
  defaultVariants: { tono: "info" },
});

type Props = VariantProps<typeof aviso> & {
  children: ReactNode;
  /** Lista opcional que se despliega bajo el texto (p. ej. campos pendientes). */
  detalle?: string[];
  icono?: ReactNode;
  className?: string;
  /** Acción o elemento adicional renderizado dentro de la sección colapsable */
  accion?: ReactNode;
  /** Si debe iniciar expandido cuando hay detalle (por defecto true) */
  abiertoPorDefecto?: boolean;
};

/**
 * Aviso de una línea dentro de tarjetas. Con `detalle`, la lista queda plegada
 * tras un disclosure accesible para no inflar la tarjeta.
 */
export function Aviso({
  tono,
  children,
  detalle,
  icono,
  className,
  accion,
  abiertoPorDefecto,
}: Props) {
  const tieneDetalle = !!detalle && detalle.length > 0;
  const [abierto, setAbierto] = useState(abiertoPorDefecto ?? tieneDetalle);
  const idDetalle = useId();
  const Icono =
    tono === "exito" ? CheckCircle2 : tono === "info" ? Info : AlertTriangle;

  return (
    <div className={cn(aviso({ tono }), className)}>
      <span className="mt-0.5 shrink-0">{icono ?? <Icono size={14} aria-hidden />}</span>
      <div className="min-w-0 flex-1">
        {tieneDetalle ? (
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 text-left font-semibold cursor-pointer"
            aria-expanded={abierto}
            aria-controls={idDetalle}
            onClick={() => setAbierto((v) => !v)}
          >
            <span>{children}</span>
            <ChevronDown
              size={14}
              aria-hidden
              className={cn("shrink-0 transition-transform", abierto && "rotate-180")}
            />
          </button>
        ) : (
          <span className="font-semibold">{children}</span>
        )}
        {tieneDetalle && abierto && (
          <div className="mt-1.5 space-y-2">
            <ul id={idDetalle} className="list-disc space-y-0.5 pl-4 font-normal">
              {detalle.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
            {accion && <div className="pt-1">{accion}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
