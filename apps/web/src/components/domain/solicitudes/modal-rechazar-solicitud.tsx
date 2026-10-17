import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { useRechazarSolicitud } from "../../../api/solicitudes.js";
import { Button } from "../../ui/button.js";
import { Dialogo } from "../../ui/dialog.js";
import { Field } from "../../ui/field.js";

export function ModalRechazarSolicitud({
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
  const [fundamento, setFundamento] = useState("");
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  const mutation = useRechazarSolicitud(solicitudId);

  async function handleConfirmar() {
    setErrorLocal(null);
    if (fundamento.trim().length < 10) {
      setErrorLocal("El fundamento reglamentario debe tener al menos 10 caracteres");
      return;
    }

    try {
      await mutation.mutateAsync({
        fundamentoReglamentario: fundamento.trim(),
      });
      onAbierto(false);
      onExito?.();
    } catch (err: unknown) {
      setErrorLocal(err instanceof Error ? err.message : "Error al rechazar solicitud");
    }
  }

  return (
    <Dialogo
      abierto={abierto}
      ancho="max-w-md"
      descripcion={`Esta acción desestima definitivamente la solicitud ${codigoSolicitud}.`}
      onAbierto={onAbierto}
      titulo="Rechazar Solicitud de Titulación"
    >
      <div className="space-y-4 text-sm">
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50/60 p-3 text-red-900">
          <AlertTriangle className="mt-0.5 shrink-0 text-red-600" size={18} />
          <div className="text-xs">
            <p className="font-bold">Acción Definitiva</p>
            <p className="mt-0.5 text-red-700">
              La solicitud pasará al estado <strong className="font-semibold">RECHAZADA</strong>. No
              se generará ningún expediente y el expediente digital quedará archivado en solo
              lectura.
            </p>
          </div>
        </div>

        {errorLocal && (
          <div className="rounded-lg bg-red-50 p-3 text-xs font-medium text-red-700">
            {errorLocal}
          </div>
        )}

        <Field
          ayuda="Indique los artículos del Reglamento de Grados y Títulos que sustentan la desestimación."
          etiqueta="Fundamento Reglamentario del Rechazo"
        >
          <textarea
            className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-grafito-900 shadow-card placeholder:text-slate-400 focus:border-red-600 focus:outline-none"
            placeholder="Art. 12 inc. c del Reglamento de Grados y Títulos: El plan de tesis no se enmarca en las líneas de investigación aprobadas..."
            rows={4}
            value={fundamento}
            onChange={(e) => setFundamento(e.target.value)}
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
            variante="peligro"
          >
            {mutation.isPending ? "Rechazando..." : "Rechazar Definitivamente"}
          </Button>
        </div>
      </div>
    </Dialogo>
  );
}
