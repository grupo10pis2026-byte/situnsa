import type { SolicitudDetalleDTO } from "@pis/contracts";
import { PROGRAMAS_OFICIALES } from "@pis/domain/dist/expediente/seguimiento-catalogo.js";
import { CheckCircle2, KeyRound, RefreshCw, Sparkles, UserCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useAceptarSolicitud, useSugerirCodigoSet } from "../../../api/solicitudes.js";
import { Button } from "../../ui/button.js";
import { Dialogo } from "../../ui/dialog.js";
import { Field } from "../../ui/field.js";
import { Select } from "../../ui/select.js";

function generarClaveAleatoria(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let resultado = "UNSA-";
  for (let i = 0; i < 6; i++) {
    resultado += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return resultado;
}

export function ModalAceptarExpediente({
  solicitud,
  abierto,
  onAbierto,
  onExito,
}: {
  solicitud: SolicitudDetalleDTO;
  abierto: boolean;
  onAbierto: (v: boolean) => void;
  onExito?: (expedienteId: string, codigoSet: string) => void;
}) {
  const { data: codigoSugerido, isLoading: cargandoCodigo } = useSugerirCodigoSet();
  const [codigoConfirmado, setCodigoConfirmado] = useState("");
  const [titulo, setTitulo] = useState(solicitud.titulo);
  const [programa, setPrograma] = useState(solicitud.programa);
  const [crearCuentas, setCrearCuentas] = useState(true);

  // Configuración de participantes
  const [claves, setClaves] = useState<Record<number, string>>(() => {
    const mapa: Record<number, string> = {};
    for (const p of solicitud.participantes) {
      mapa[p.orden] = generarClaveAleatoria();
    }
    return mapa;
  });

  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const mutation = useAceptarSolicitud(solicitud.id);

  useEffect(() => {
    if (codigoSugerido) {
      setCodigoConfirmado(codigoSugerido);
    }
  }, [codigoSugerido]);

  useEffect(() => {
    setTitulo(solicitud.titulo);
    setPrograma(solicitud.programa);
  }, [solicitud]);

  function regenerarClave(orden: number) {
    setClaves((prev) => ({ ...prev, [orden]: generarClaveAleatoria() }));
  }

  async function handleAceptar() {
    setErrorLocal(null);
    if (!codigoConfirmado.trim()) {
      setErrorLocal("Debe ingresar el código SET a asignar");
      return;
    }
    if (titulo.trim().length < 10) {
      setErrorLocal("El título debe tener al menos 10 caracteres");
      return;
    }

    try {
      const participantesConfig = solicitud.participantes.map((p) => ({
        orden: p.orden,
        dni: p.dni,
        usuarioAsignado: p.dni,
        claveTemporalGenerada: claves[p.orden] ?? generarClaveAleatoria(),
        enviarCredencialesCorreo: true,
      }));

      const res = await mutation.mutateAsync({
        codigoSetConfirmado: codigoConfirmado.trim(),
        tituloConfirmado: titulo.trim(),
        programaConfirmado: programa,
        crearCuentasUsuarios: crearCuentas,
        participantesConfig,
        tallerGrupoId: solicitud.tallerGrupoId ?? undefined,
      });

      onAbierto(false);
      onExito?.(res.expedienteId, res.codigoSet);
    } catch (err: unknown) {
      setErrorLocal(err instanceof Error ? err.message : "Error al aceptar solicitud");
    }
  }

  return (
    <Dialogo
      abierto={abierto}
      ancho="max-w-2xl"
      descripcion="Aprobación formal del trámite, creación de expediente SET e inicialización del flujo de titulación."
      onAbierto={onAbierto}
      titulo="Aceptar Solicitud y Crear Expediente SET"
    >
      <div className="space-y-4 text-sm max-h-[75vh] overflow-y-auto pr-1">
        {/* Banner de código correlativo asignado */}
        <div className="flex items-center justify-between rounded-xl border border-verde-inst-300 bg-verde-inst-50/70 p-4 text-verde-inst-950">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-verde-inst-600 text-white shadow-sm">
              <Sparkles size={20} />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-verde-inst-800">
                Correlativo SET Sugerido
              </p>
              <p className="font-mono text-2xl font-bold tracking-tight text-verde-inst-950">
                {cargandoCodigo ? "Calculando..." : codigoConfirmado || "—"}
              </p>
            </div>
          </div>
          <span className="rounded-full bg-verde-inst-200/80 px-3 py-1 text-xs font-semibold text-verde-inst-800">
            Candado Advisory Activo
          </span>
        </div>

        {errorLocal && (
          <div className="rounded-lg bg-red-50 p-3 text-xs font-medium text-red-700">
            {errorLocal}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field
            ayuda="Formato SETNNN continuo"
            className="sm:col-span-1"
            etiqueta="Código de Expediente"
          >
            <input
              className="h-9 w-full rounded-lg border border-slate-300 px-3 font-mono text-sm text-grafito-900 shadow-card focus:border-navy-800 focus:outline-none"
              value={codigoConfirmado}
              onChange={(e) => setCodigoConfirmado(e.target.value.toUpperCase())}
            />
          </Field>

          <div className="sm:col-span-2">
            <Select
              label="Programa Oficial Confirmado"
              value={programa}
              onChange={(v) => setPrograma(v)}
            >
              {PROGRAMAS_OFICIALES.map((p) => (
                <option key={p.codigo} value={p.nombre}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <Field
          ayuda="Puede corregir tildes o erratas menores"
          etiqueta="Título del Plan Confirmado"
        >
          <textarea
            className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-grafito-900 shadow-card placeholder:text-slate-400 focus:border-navy-800 focus:outline-none"
            rows={2}
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
          />
        </Field>

        {/* Cuentas de participantes */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold tracking-wider text-grafito-700 uppercase">
              Aprovisionamiento de Usuarios
            </p>
            <label className="flex items-center gap-2 text-xs font-medium text-grafito-600">
              <input
                checked={crearCuentas}
                className="rounded border-slate-300 text-navy-800 focus:ring-navy-800"
                onChange={(e) => setCrearCuentas(e.target.checked)}
                type="checkbox"
              />
              Habilitar accesos al portal
            </label>
          </div>

          <div className="space-y-3">
            {solicitud.participantes.map((part) => (
              <div
                className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
                key={part.id}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-bold text-navy-800 uppercase tracking-wider">
                      {part.orden === 1 ? "Tesista Titular" : "Co-Tesista"}
                    </span>
                    <p className="text-sm font-semibold text-navy-950">
                      {part.nombres} {part.apellidos}
                    </p>
                    <p className="text-xs text-grafito-600 font-mono">
                      DNI: {part.dni} · {part.email}
                    </p>
                  </div>

                  {part.poseeCuentaPrevia ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                      <UserCheck size={13} />
                      Cuenta previa (sincronizará datos)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                      <KeyRound size={13} />
                      Nueva cuenta
                    </span>
                  )}
                </div>

                {!part.poseeCuentaPrevia && crearCuentas && (
                  <div className="mt-2.5 flex items-center gap-2 rounded-md bg-slate-50 border border-slate-200 px-2.5 py-1.5 text-xs">
                    <span className="text-grafito-600">Clave temporal:</span>
                    <span className="font-mono font-bold text-navy-950">{claves[part.orden]}</span>
                    <button
                      aria-label="Generar otra clave"
                      className="ml-auto text-slate-500 hover:text-navy-800"
                      onClick={() => regenerarClave(part.orden)}
                      title="Generar otra clave"
                      type="button"
                    >
                      <RefreshCw size={13} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Resumen de impacto */}
        <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-xs text-grafito-600">
          <p className="font-semibold text-grafito-800 mb-1">Efectos de la aprobación:</p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>
              Se creará el expediente formal con código definitivo{" "}
              <strong className="font-mono text-navy-950">{codigoConfirmado}</strong>.
            </li>
            <li>Se inicializarán las 38 subetapas del flujo de titulación oficial.</li>
            <li>Se enviará notificación automática por correo a los tesistas.</li>
          </ul>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
          <Button
            disabled={mutation.isPending}
            onClick={() => onAbierto(false)}
            variante="contorno"
          >
            Cancelar
          </Button>
          <Button
            disabled={cargandoCodigo || !codigoConfirmado || mutation.isPending}
            onClick={() => void handleAceptar()}
            variante="exito"
          >
            <CheckCircle2 size={16} />
            {mutation.isPending ? "Aceptando..." : "Aceptar y Crear Expediente"}
          </Button>
        </div>
      </div>
    </Dialogo>
  );
}
