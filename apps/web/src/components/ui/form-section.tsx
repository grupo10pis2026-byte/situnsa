import type { ReactNode } from "react";
import { Card, CardEncabezado } from "./card.js";

/**
 * FormSection: sección numerada de formulario (icono + título + ayuda).
 * Rompe el "muro de campos" en bloques escaneables.
 */
export function FormSection({
  icono,
  titulo,
  ayuda,
  accion,
  children,
  className,
  gridClassName,
}: {
  icono?: ReactNode;
  titulo: string;
  ayuda?: string;
  accion?: ReactNode;
  children: ReactNode;
  className?: string;
  gridClassName?: string;
}) {
  return (
    <Card className={className}>
      <CardEncabezado
        titulo={
          <span className="flex items-center gap-2.5">
            {icono && <span className="text-navy-800">{icono}</span>}
            {titulo}
          </span>
        }
        descripcion={ayuda}
        accion={accion}
      />
      <div
        className={
          gridClassName || "grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 md:p-5 lg:grid-cols-4"
        }
      >
        {children}
      </div>
    </Card>
  );
}
