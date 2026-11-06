import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../utils/cn.js";

/** Diálogo institucional (Radix: foco atrapado, Escape, overlay). */
export function Dialogo({
  abierto,
  onAbierto,
  titulo,
  descripcion,
  children,
  ancho = "max-w-md",
}: {
  abierto: boolean;
  onAbierto: (v: boolean) => void;
  titulo: string;
  descripcion?: string;
  children: ReactNode;
  ancho?: string;
}) {
  return (
    <DialogPrimitive.Root open={abierto} onOpenChange={onAbierto}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-navy-950/50 backdrop-blur-[2px] data-[state=open]:animate-none" />
        <DialogPrimitive.Content
          className={cn(
            "fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-h-[88vh] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-5 shadow-flotante outline-none flex flex-col",
            ancho,
          )}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <DialogPrimitive.Title className="text-base font-bold text-navy-950">
                {titulo}
              </DialogPrimitive.Title>
              {descripcion && (
                <DialogPrimitive.Description className="mt-0.5 text-sm text-grafito-600">
                  {descripcion}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              aria-label="Cerrar"
              className="rounded-md p-1.5 text-grafito-600 hover:bg-slate-100 shrink-0"
            >
              <X size={18} />
            </DialogPrimitive.Close>
          </div>
          <div className="mt-3 overflow-y-auto pr-1 flex-1">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
