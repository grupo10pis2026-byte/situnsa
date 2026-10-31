import { useState } from "react";
import { useObservarSolicitud } from "../../../api/solicitudes.js";
import { Button } from "../../ui/button.js";
import { Dialogo } from "../../ui/dialog.js";
import { Field } from "../../ui/field.js";

export function ModalObservarSolicitud({
  solicitudId,
  codigoSolicitud,
  abierto,
  onAbierto,
  onExito,
}: {
  solicitudId: string;
  codigoSolicitud: string;
  abierto: boolean;
  onAbierto: (v: boolean) => void;
  onExito?: () => void;
}) {
  const [detalle, setDetalle] = useState("");
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  const mutation = useObservarSolicitud(solicitudId);

  async function handleConfirmar() {
    setErrorLocal(null);
    if (detalle.trim().length < 5) {
      setErrorLocal("El detalle de la observación debe tener al menos 5 caracteres");
      return;
    }

    try {
      await mutation.mutateAsync({
        detalleObservacion: detalle.trim(),
      });
      onAbierto(false);
      onExito?.();
    } catch (err: unknown) {
      setErrorLocal(err instanceof Error ? err.message : "Error al observar solicitud");
    }
  }

  return (
    <Dialogo
      abierto={abierto}
      ancho="max-w-lg"
      descripcion={`Se notificará al postulante de la solicitud ${codigoSolicitud} con un enlace de subsanación único.`}
      onAbierto={onAbierto}
      titulo="Observar Solicitud de Titulación"
    >
      <div className="space-y-4 text-sm">
        {errorLocal && (
          <div className="rounded-lg bg-red-50 p-3 text-xs font-medium text-red-700">
            {errorLocal}
          </div>
        )}

        <Field
          ayuda="Instrucciones claras para que el estudiante subsane sus requisitos (plazo legal: 10 días hábiles)."
          etiqueta="Detalle y Precisiones para el Estudiante"
        >
          <textarea
            className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-grafito-900 shadow-card placeholder:text-slate-400 focus:border-navy-800 focus:outline-none"
            placeholder="Especifique qué documentos debe volver a adjuntar y las correcciones necesarias..."
            rows={5}
            value={detalle}
            onChange={(e) => setDetalle(e.target.value)}
          />
        </Field>

        <div className="mt-6 flex items-center justify-end gap-2 pt-2">
          <Button
            disabled={mutation.isPending}
            onClick={() => onAbierto(false)}
            variante="contorno"
          >
            Cancelar
          </Button>
          <Button
            disabled={mutation.isPending}
            onClick={() => void handleConfirmar()}
            variante="primario"
          >
            {mutation.isPending ? "Guardando..." : "Confirmar Observación"}
          </Button>
        </div>
      </div>
    </Dialogo>
  );
}
