import { useState } from "react";
import { useObservarSolicitud } from "../../../api/solicitudes.js";
import { Button } from "../../ui/button.js";
import { Dialogo } from "../../ui/dialog.js";
import { Field } from "../../ui/field.js";

const MOTIVOS_DISPONIBLES = [
  "Falta firma en FUT o carta de presentación",
  "Documento ilegible o resolución truncada",
  "Constancia de egreso no coincide con el programa oficial",
  "Falta certificado de idioma extranjero o pagos pendientes",
  "Plan de tesis no cumple con el formato reglamentario",
];

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
  const [motivos, setMotivos] = useState<string[]>([]);
  const [detalle, setDetalle] = useState("");
  const [diasHabiles, setDiasHabiles] = useState(10);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  const mutation = useObservarSolicitud(solicitudId);

  function alternarMotivo(motivo: string) {
    setMotivos((prev) =>
      prev.includes(motivo) ? prev.filter((m) => m !== motivo) : [...prev, motivo],
    );
  }

  async function handleConfirmar() {
    setErrorLocal(null);
    if (motivos.length === 0) {
      setErrorLocal("Debe seleccionar al menos un motivo predefinido");
      return;
    }
    if (detalle.trim().length < 5) {
      setErrorLocal("El detalle de la observación debe tener al menos 5 caracteres");
      return;
    }

    try {
      await mutation.mutateAsync({
        motivosPredefinidos: motivos,
        detalleObservacion: detalle.trim(),
        diasHabilesSubsanacion: diasHabiles,
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

        <div>
          <p className="mb-2 text-[11px] font-bold tracking-wider text-grafito-600 uppercase">
            Causales de Observación (seleccione al menos una)
          </p>
          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
            {MOTIVOS_DISPONIBLES.map((motivo) => {
              const checked = motivos.includes(motivo);
              return (
                <label
                  className="flex cursor-pointer items-start gap-2.5 text-xs text-grafito-800"
                  key={motivo}
                >
                  <input
                    checked={checked}
                    className="mt-0.5 rounded border-slate-300 text-navy-800 focus:ring-navy-800"
                    onChange={() => alternarMotivo(motivo)}
                    type="checkbox"
                  />
                  <span>{motivo}</span>
                </label>
              );
            })}
          </div>
        </div>

        <Field
          ayuda="Instrucciones claras para que el tesista subsane sus requisitos."
          etiqueta="Detalle y Precisiones para el Postulante"
        >
          <textarea
            className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-grafito-900 shadow-card placeholder:text-slate-400 focus:border-navy-800 focus:outline-none"
            placeholder="Especifique qué documentos debe volver a adjuntar y las correcciones necesarias..."
            rows={4}
            value={detalle}
            onChange={(e) => setDetalle(e.target.value)}
          />
        </Field>

        <Field
          ayuda="Plazo institucional estándar de 10 días hábiles."
          etiqueta="Plazo de Subsanación (Días Hábiles)"
        >
          <input
            className="h-9 w-32 rounded-lg border border-slate-300 px-3 text-sm text-grafito-900 shadow-card focus:border-navy-800 focus:outline-none"
            max={30}
            min={1}
            type="number"
            value={diasHabiles}
            onChange={(e) => setDiasHabiles(Number(e.target.value) || 10)}
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
