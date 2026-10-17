import { Link, useParams } from "@tanstack/react-router";
import { AlertCircle, AlertTriangle, CheckCircle, FileText, Send } from "lucide-react";
import { useState } from "react";
import { useConsultarPorTokenSubsanacion, useSubsanarConToken } from "../api/solicitudes.js";
import { Button } from "../components/ui/button.js";
import { Card } from "../components/ui/card.js";
import { StatusBadge } from "../components/ui/status-badge.js";

export function SubsanarSolicitudPage() {
  const { token } = useParams({ strict: false }) as { token: string };
  const { data: solicitud, isLoading, error } = useConsultarPorTokenSubsanacion(token);
  const subsanarMutation = useSubsanarConToken(token);

  const [archivosSubsanados, setArchivosSubsanados] = useState<string[]>([]);
  const [exito, setExito] = useState<string | null>(null);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  function alternarArchivoSubsanado(id: string) {
    setArchivosSubsanados((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleEnviarSubsanacion() {
    setErrorLocal(null);
    try {
      const res = await subsanarMutation.mutateAsync({
        archivosSubsanadosIds: archivosSubsanados,
      });
      setExito(res.mensaje);
    } catch (err: unknown) {
      setErrorLocal(err instanceof Error ? err.message : "Error al enviar la subsanación");
    }
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#eef1f4] flex items-center justify-center p-4">
        <p className="text-sm font-medium text-grafito-600 animate-pulse">
          Validando enlace de subsanación...
        </p>
      </main>
    );
  }

  if (error || !solicitud) {
    return (
      <main className="min-h-screen bg-[#eef1f4] flex items-center justify-center p-4">
        <Card className="max-w-md p-6 text-center shadow-card">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 mb-3">
            <AlertCircle size={24} />
          </div>
          <h1 className="text-lg font-bold text-navy-950">Enlace No Disponible</h1>
          <p className="mt-2 text-xs text-grafito-600">
            Este enlace de subsanación es inválido, ha expirado o ya ha sido utilizado previamente.
          </p>
          <div className="mt-5">
            <Link to="/">
              <Button variante="contorno">Ir al Inicio</Button>
            </Link>
          </div>
        </Card>
      </main>
    );
  }

  if (exito) {
    return (
      <main className="min-h-screen bg-[#eef1f4] flex items-center justify-center p-4">
        <Card className="max-w-md p-8 text-center shadow-flotante">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-verde-inst-100 text-verde-inst-700 mb-4">
            <CheckCircle size={32} />
          </div>
          <h1 className="text-xl font-bold text-navy-950">Subsanación Recibida</h1>
          <p className="mt-2 text-xs text-grafito-600">
            Tus correcciones para la solicitud{" "}
            <strong className="font-mono text-navy-950">{solicitud.codigo}</strong> han sido
            remitidas a la mesa de partes.
          </p>
          <p className="mt-2 text-xs text-grafito-600">
            El personal administrativo revisará los cambios y te notificará por correo.
          </p>
          <div className="mt-6">
            <Link to="/">
              <Button variante="primario">Entendido</Button>
            </Link>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#eef1f4] py-10 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl space-y-4">
        {/* Cabecera */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-navy-950">Portal de Subsanación Documentaria</h1>
            <p className="text-xs text-grafito-600">
              Segunda Especialidad FIPS UNSA · Enlace seguro de único uso
            </p>
          </div>
          <span className="font-mono text-sm font-bold bg-white border border-slate-200 px-3 py-1 rounded-lg text-navy-950 shadow-sm">
            {solicitud.codigo}
          </span>
        </div>

        {/* Alerta de Observaciones */}
        <Card className="border-orange-200 bg-orange-50/60 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 shrink-0 text-orange-600" size={18} />
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-orange-950 uppercase tracking-wide">
                  Observaciones Planteadas por Secretaría
                </span>
                {solicitud.esPlazoVencido && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                    Plazo Vencido
                  </span>
                )}
              </div>
              <p className="whitespace-pre-line text-orange-900 font-medium leading-relaxed">
                {solicitud.motivoObservacion || "No se detallaron motivos específicos."}
              </p>
              {solicitud.fechaLimiteSubsanacion && (
                <p className="text-[11px] text-orange-800 pt-1">
                  Fecha límite original de subsanación:{" "}
                  <strong>{solicitud.fechaLimiteSubsanacion}</strong>
                </p>
              )}
            </div>
          </div>
        </Card>

        {errorLocal && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
            {errorLocal}
          </div>
        )}

        {/* Datos de la solicitud */}
        <Card className="p-5 space-y-3 shadow-card">
          <h2 className="text-xs font-bold text-navy-950 uppercase tracking-wider">
            Detalle del Trámite
          </h2>
          <div className="rounded-lg bg-slate-50 p-3 text-xs space-y-1.5">
            <p className="font-semibold text-navy-950">{solicitud.titulo}</p>
            <p className="text-grafito-600">{solicitud.programa}</p>
            <div className="flex items-center gap-2 pt-1 text-[11px] text-grafito-500">
              <span>Vía: {solicitud.via}</span>
              <span>·</span>
              <span>Modalidad: {solicitud.modalidad}</span>
            </div>
          </div>

          <h3 className="text-xs font-bold text-navy-950 uppercase tracking-wider pt-2">
            Documentos Cargados
          </h3>
          <div className="space-y-2">
            {solicitud.documentos.map((doc) => {
              const marcado = archivosSubsanados.includes(doc.id);
              return (
                <div
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 text-xs"
                  key={doc.id}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileText className="shrink-0 text-slate-500" size={16} />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-navy-950">{doc.nombreOriginal}</p>
                      <p className="text-[10px] text-grafito-500">{doc.tipo}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge estado={doc.estadoConformidad} />
                    <label className="flex items-center gap-1.5 text-xs font-medium text-navy-800 cursor-pointer ml-2">
                      <input
                        checked={marcado}
                        className="rounded border-slate-300 text-navy-800 focus:ring-navy-800"
                        onChange={() => alternarArchivoSubsanado(doc.id)}
                        type="checkbox"
                      />
                      <span>Corregido</span>
                    </label>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-4 flex items-center justify-between border-t border-slate-100">
            <Link to="/">
              <Button variante="fantasma">Cancelar</Button>
            </Link>
            <Button
              disabled={subsanarMutation.isPending}
              onClick={() => void handleEnviarSubsanacion()}
              variante="primario"
            >
              <Send size={15} />{" "}
              {subsanarMutation.isPending ? "Enviando..." : "Confirmar Subsanación"}
            </Button>
          </div>
        </Card>
      </div>
    </main>
  );
}
