import { Link } from "@tanstack/react-router";
import { Ban, Pencil, UserRoundCog } from "lucide-react";
import { useState } from "react";
import { useAsesores } from "../../api/asesores.js";
import { ApiError } from "../../api/errores.js";
import {
  diaMes,
  ETIQUETA_ESTADO_TALLER,
  esVigente,
  fechaLarga,
  type TallerDetalleDTO,
  useCambiarAsesor,
  useCancelarTaller,
} from "../../api/taller.js";
import { cn } from "../../utils/cn.js";
import { Button, botonClases } from "../ui/button.js";
import { Card, CardEncabezado } from "../ui/card.js";
import { DataTable } from "../ui/data-table.js";
import { Dialogo } from "../ui/dialog.js";
import { controlClase, Field } from "../ui/field.js";
import { StatusBadge } from "../ui/status-badge.js";
import { useToast } from "../ui/toast.js";
import { Tooltip } from "../ui/tooltip.js";

/**
 * P3 Detalle del taller (spec v1.0 §9): cabecera (estado, asesor con sus
 * especialidades, proyectos sobre el cupo, inicio y fin), acciones de la
 * Secretaría (Editar, Cambiar asesor, Cancelar) y pestaña Pensiones.
 */

const CORTO = ["", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function ResumenTaller({ t }: { t: TallerDetalleDTO }) {
  const especialidades = t.asesorEspecialidades.length
    ? ` (${t.asesorEspecialidades.join(", ")})`
    : "";
  return (
    <div className="space-y-1 text-sm text-grafito-700">
      <p>
        <span className="font-semibold">Asesor:</span> {t.asesorNombre ?? "—"}
        {especialidades} · <span className="font-semibold">Proyectos</span>{" "}
        <span className="tabular-nums">
          {t.proyectos}/{t.cupoProyectos}
        </span>{" "}
        · <span className="font-semibold">Inicio</span>{" "}
        {t.fechaInicio ? diaMes(t.fechaInicio) : "—"} · <span className="font-semibold">Fin</span>{" "}
        {t.fechaFin ? diaMes(t.fechaFin) : "—"} · <span className="font-semibold">Período</span>{" "}
        {t.periodo ?? "—"}
      </p>
      <p className="text-xs text-grafito-600">
        {t.dias.map((d) => `${CORTO[d.dia]} ${d.horaInicio}–${d.horaFin}`).join(" · ") ||
          "Sin días de sesión"}
        {" · "}Sesiones {t.sesiones.realizadas}/{t.sesiones.total}
        {t.enlaceSabado || t.enlaceDomingo
          ? " · Con enlace de reunión"
          : " · Sin enlace de reunión"}
      </p>
      {t.estado === "CANCELADO" && t.motivoCancelacion && (
        <p className="text-xs font-medium text-red-700">Cancelado: {t.motivoCancelacion}</p>
      )}
    </div>
  );
}

export function EstadoTaller({ estado }: { estado: string }) {
  return <StatusBadge estado={estado} etiqueta={ETIQUETA_ESTADO_TALLER[estado] ?? estado} />;
}

/** Botón deshabilitado que sigue mostrando su motivo (§15). */
function ConMotivo({ motivo, children }: { motivo: string | null; children: React.ReactElement }) {
  return motivo ? <Tooltip texto={motivo}>{children}</Tooltip> : children;
}

export function AccionesTaller({ t }: { t: TallerDetalleDTO }) {
  const [dialogo, setDialogo] = useState<"asesor" | "cancelar" | null>(null);
  if (!esVigente(t.estado)) return null;
  const motivoCancelar =
    t.sesiones.realizadas > 0 ? "El taller ya tiene sesiones realizadas: no se cancela" : null;
  return (
    <span className="flex flex-wrap gap-2">
      <Button tamano="sm" variante="contorno" onClick={() => setDialogo("asesor")} type="button">
        <UserRoundCog size={14} />
        Cambiar asesor
      </Button>
      <Link
        className={botonClases({ variante: "contorno", tamano: "sm" })}
        to="/talleres/$id/editar"
        params={{ id: t.id }}
      >
        <Pencil size={14} />
        Editar
      </Link>
      <ConMotivo motivo={motivoCancelar}>
        <Button
          aria-disabled={motivoCancelar ? "true" : undefined}
          aria-label={
            motivoCancelar ? `Cancelar taller: no disponible. ${motivoCancelar}` : undefined
          }
          className={cn(motivoCancelar && "cursor-not-allowed opacity-55")}
          tamano="sm"
          variante="fantasma"
          onClick={() => {
            if (!motivoCancelar) setDialogo("cancelar");
          }}
          type="button"
        >
          <Ban size={14} />
          Cancelar taller
        </Button>
      </ConMotivo>
      {dialogo === "asesor" && <CambiarAsesorDialogo t={t} onCerrar={() => setDialogo(null)} />}
      {dialogo === "cancelar" && <CancelarDialogo t={t} onCerrar={() => setDialogo(null)} />}
    </span>
  );
}

function CambiarAsesorDialogo({ t, onCerrar }: { t: TallerDetalleDTO; onCerrar: () => void }) {
  const avisar = useToast();
  const asesores = useAsesores();
  const cambiar = useCambiarAsesor(t.id);
  const [asesorId, setAsesorId] = useState("");
  const [motivo, setMotivo] = useState("");
  const [errores, setErrores] = useState<Record<string, string | undefined>>({});
  const disponibles = (asesores.data ?? []).filter(
    (a) => a.activo && a.disponibilidad === "DISPONIBLE" && a.id !== t.asesorId,
  );

  async function confirmar(): Promise<void> {
    const locales: Record<string, string> = {};
    if (!asesorId) locales.asesorId = "Elige el nuevo asesor";
    if (motivo.trim().length < 5) locales.motivo = "Escribe el motivo del cambio";
    setErrores(locales);
    if (Object.keys(locales).length > 0) return;
    try {
      await cambiar.mutateAsync({ asesorId, motivo });
      avisar("Asesor cambiado. Lo registrado se conserva");
      onCerrar();
    } catch (e) {
      if (e instanceof ApiError) setErrores(e.campos);
      avisar(e instanceof Error ? e.message : "No se pudo cambiar el asesor", "error");
    }
  }

  return (
    <Dialogo
      abierto
      onAbierto={(v) => {
        if (!v) onCerrar();
      }}
      titulo={`Cambiar asesor · ${t.nombre}`}
      descripcion="El nuevo asesor verá el taller y el anterior dejará de verlo. Lo registrado se conserva."
    >
      <div className="mt-4 space-y-3">
        <Field
          etiqueta="Nuevo asesor * (solo disponibles)"
          error={errores.asesorId}
          ayuda={
            disponibles.length === 0 && !asesores.isPending
              ? "No hay asesores disponibles"
              : undefined
          }
        >
          <select
            aria-label="Nuevo asesor"
            className={cn(controlClase, "h-10", errores.asesorId && "border-red-400")}
            value={asesorId}
            onChange={(e) => {
              setAsesorId(e.target.value);
              setErrores((x) => ({ ...x, asesorId: undefined }));
            }}
          >
            <option value="">Elige un asesor…</option>
            {disponibles.map((a) => (
              <option key={a.id} value={a.id}>
                {a.grado ? `${a.grado} ` : ""}
                {a.nombres} {a.apellidos}
                {a.especialidades.length
                  ? ` · ${a.especialidades.map((e) => e.nombre).join(", ")}`
                  : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field etiqueta="Motivo *" error={errores.motivo}>
          <textarea
            aria-label="Motivo del cambio de asesor"
            className={cn(controlClase, "min-h-20", errores.motivo && "border-red-400")}
            value={motivo}
            onChange={(e) => {
              setMotivo(e.target.value);
              setErrores((x) => ({ ...x, motivo: undefined }));
            }}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variante="contorno" onClick={onCerrar} type="button">
            Volver
          </Button>
          <Button
            variante="oscuro"
            disabled={cambiar.isPending}
            onClick={() => void confirmar()}
            type="button"
          >
            Cambiar asesor
          </Button>
        </div>
      </div>
    </Dialogo>
  );
}

function CancelarDialogo({ t, onCerrar }: { t: TallerDetalleDTO; onCerrar: () => void }) {
  const avisar = useToast();
  const cancelar = useCancelarTaller(t.id);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | undefined>();

  async function confirmar(): Promise<void> {
    if (motivo.trim().length < 3) {
      setError("Escribe el motivo de la cancelación");
      return;
    }
    try {
      await cancelar.mutateAsync(motivo);
      avisar(`${t.nombre} cancelado`);
      onCerrar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : "No se pudo cancelar", "error");
    }
  }

  return (
    <Dialogo
      abierto
      onAbierto={(v) => {
        if (!v) onCerrar();
      }}
      titulo={`Cancelar ${t.nombre}`}
      descripcion="El taller no se elimina: queda cancelado con su historial y sus sesiones pendientes se cancelan."
    >
      <div className="mt-4 space-y-3">
        <Field etiqueta="Motivo *" error={error}>
          <textarea
            aria-label="Motivo de la cancelación"
            className={cn(controlClase, "min-h-20", error && "border-red-400")}
            value={motivo}
            onChange={(e) => {
              setMotivo(e.target.value);
              setError(undefined);
            }}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variante="contorno" onClick={onCerrar} type="button">
            Volver
          </Button>
          <Button
            variante="peligro"
            disabled={cancelar.isPending}
            onClick={() => void confirmar()}
            type="button"
          >
            Cancelar taller
          </Button>
        </div>
      </div>
    </Dialogo>
  );
}

/** P3 pestaña Pensiones: las 3 pensiones y cuántos alumnos pagaron. */
export function PensionesTab({ t }: { t: TallerDetalleDTO }) {
  return (
    <Card>
      <CardEncabezado
        titulo="Pensiones"
        descripcion="Un cambio de fechas o montos afecta solo a las pensiones no pagadas."
        accion={
          esVigente(t.estado) ? (
            <span className="flex gap-2">
              <Link
                className={botonClases({ variante: "contorno", tamano: "sm" })}
                to="/pagos-taller"
              >
                Ver comprobantes por validar
              </Link>
              <Link
                className={botonClases({ variante: "contorno", tamano: "sm" })}
                to="/talleres/$id/editar"
                params={{ id: t.id }}
              >
                Editar pensiones
              </Link>
            </span>
          ) : null
        }
      />
      <div className="p-4 md:p-5">
        <DataTable
          vacio="Este taller se creó con el modelo anterior y no tiene pensiones programadas."
          columnas={[
            { encabezado: "Pensión", celda: (p) => `${p.numero}.ª` },
            {
              encabezado: "Fecha",
              celda: (p) =>
                p.fecha ? `Semana ${p.semana} · ${fechaLarga(p.fecha)}` : "Al inscribirse",
            },
            { encabezado: "Monto", celda: (p) => `S/ ${p.monto.toLocaleString("es-PE")}` },
            {
              encabezado: "Pagaron",
              celda: (p) => (
                <span className="tabular-nums">
                  {p.pagadas} {p.pagadas === 1 ? "alumno" : "alumnos"}
                </span>
              ),
            },
          ]}
          filas={t.pensiones.map((p) => ({ ...p, id: String(p.numero) }))}
        />
      </div>
    </Card>
  );
}
