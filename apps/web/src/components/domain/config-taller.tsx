import type {
  EspecialidadDTO,
  FeriadoDTO,
  ParametroTallerDTO,
  SemanaPlanDTO,
} from "@pis/contracts";
import { CalendarOff, ListChecks, Plus, Save, SlidersHorizontal, Tags } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import {
  type OperacionConfigTaller,
  useConfigTaller,
  useEditarConfigTaller,
} from "../../api/configuracion-taller.js";
import { fechaLarga } from "../../api/taller.js";
import { cn } from "../../utils/cn.js";
import { Button } from "../ui/button.js";
import { Card, CardEncabezado } from "../ui/card.js";
import { EmptyState } from "../ui/empty-state.js";
import { controlClase } from "../ui/field.js";
import { Select } from "../ui/select.js";
import { StatusBadge } from "../ui/status-badge.js";
import { useToast } from "../ui/toast.js";

/**
 * P16 Configuración del taller (spec v1.0 §9): feriados, plan institucional
 * de 12 semanas, especialidades de los asesores y parámetros por confirmar.
 * Solo Administrador. Nada se elimina: se desactiva.
 */

type Editar = ReturnType<typeof useEditarConfigTaller>;

function useEjecutar(editar: Editar) {
  const avisar = useToast();
  return async (op: OperacionConfigTaller, mensajeOk: string): Promise<boolean> => {
    try {
      await editar.mutateAsync(op);
      avisar(mensajeOk);
      return true;
    } catch (e) {
      avisar(e instanceof Error ? e.message : "No se pudo guardar", "error");
      return false;
    }
  };
}

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

function anioLima(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric" }).format(
    new Date(),
  );
}

export function ConfiguracionTallerPanel() {
  const config = useConfigTaller();
  const editar = useEditarConfigTaller();
  if (config.isPending) return <p className="text-sm text-grafito-600">Cargando…</p>;
  if (config.isError)
    return (
      <EmptyState
        titulo="No se pudo cargar la configuración del taller"
        descripcion={config.error instanceof Error ? config.error.message : "Error inesperado"}
      />
    );
  return (
    <div className="space-y-4">
      <FeriadosCard feriados={config.data.feriados} editar={editar} />
      <PlanCard plan={config.data.plan} editar={editar} />
      <EspecialidadesCard especialidades={config.data.especialidades} editar={editar} />
      <ParametrosCard parametros={config.data.parametros} editar={editar} />
    </div>
  );
}

function Titulo({ icono, texto }: { icono: ReactNode; texto: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="text-navy-800">{icono}</span>
      {texto}
    </span>
  );
}

// ── Feriados ───────────────────────────────────────────────────────────

function FeriadosCard({ feriados, editar }: { feriados: FeriadoDTO[]; editar: Editar }) {
  const ejecutar = useEjecutar(editar);
  const anios = useMemo(() => {
    const s = new Set(feriados.map((f) => f.fecha.slice(0, 4)));
    s.add(anioLima());
    return [...s].sort();
  }, [feriados]);
  const [anio, setAnio] = useState(anioLima());
  const [nuevo, setNuevo] = useState({ fecha: "", nombre: "" });
  const visibles = feriados.filter((f) => anio === "TODOS" || f.fecha.startsWith(anio));
  const valido = FECHA_RE.test(nuevo.fecha) && nuevo.nombre.trim().length >= 3;
  const activos = visibles.filter((f) => f.activo).length;

  return (
    <Card>
      <CardEncabezado
        titulo={<Titulo icono={<CalendarOff size={15} />} texto="Feriados" />}
        descripcion="Al crear un taller, el calendario propuesto omite los feriados activos. Cambiarlos no modifica los talleres ya creados."
        accion={
          <div className="w-36">
            <Select ariaLabel="Año de los feriados" value={anio} onChange={setAnio}>
              {anios.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
              <option value="TODOS">Todos los años</option>
            </Select>
          </div>
        }
      />
      <div className="space-y-3 p-4 md:p-5">
        <p className="text-xs text-grafito-600">
          {visibles.length === 0
            ? "No hay feriados registrados para este año."
            : `${activos} activo${activos === 1 ? "" : "s"} de ${visibles.length}`}
        </p>
        {visibles.length > 0 && (
          <ol className="divide-y divide-slate-200/70 rounded-lg border border-slate-200">
            {visibles.map((f) => (
              <FeriadoFila key={f.id} feriado={f} editar={editar} />
            ))}
          </ol>
        )}
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[170px_1fr_auto]">
          <input
            aria-label="Fecha del nuevo feriado"
            className={cn(controlClase, "h-9")}
            type="date"
            value={nuevo.fecha}
            onChange={(e) => setNuevo({ ...nuevo, fecha: e.target.value })}
          />
          <input
            aria-label="Nombre del nuevo feriado"
            className={cn(controlClase, "h-9")}
            placeholder="Nombre del feriado"
            value={nuevo.nombre}
            onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
          />
          <Button
            tamano="sm"
            variante="oscuro"
            disabled={!valido || editar.isPending}
            title={valido ? undefined : "Elige la fecha y escribe el nombre"}
            onClick={() =>
              void ejecutar(
                { tipo: "agregarFeriado", datos: { fecha: nuevo.fecha, nombre: nuevo.nombre } },
                "Feriado agregado",
              ).then((ok) => {
                if (ok) {
                  setAnio(nuevo.fecha.slice(0, 4));
                  setNuevo({ fecha: "", nombre: "" });
                }
              })
            }
            type="button"
          >
            <Plus size={14} />
            Agregar
          </Button>
        </div>
      </div>
    </Card>
  );
}

function FeriadoFila({ feriado, editar }: { feriado: FeriadoDTO; editar: Editar }) {
  const ejecutar = useEjecutar(editar);
  const [fecha, setFecha] = useState(feriado.fecha);
  const [nombre, setNombre] = useState(feriado.nombre);
  const cambio = fecha !== feriado.fecha || nombre !== feriado.nombre;
  const valido = FECHA_RE.test(fecha) && nombre.trim().length >= 3;
  return (
    <li
      className={cn(
        "grid grid-cols-1 items-center gap-2 px-3 py-2 md:grid-cols-[170px_1fr_110px_auto]",
        !feriado.activo && "bg-slate-50",
      )}
    >
      <div>
        <input
          aria-label={`Fecha del feriado ${feriado.nombre}`}
          className={cn(controlClase, "h-8 text-sm")}
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
        />
        <span className="mt-0.5 block text-[11px] text-grafito-600">
          {FECHA_RE.test(fecha) ? fechaLarga(fecha) : "Fecha inválida"}
        </span>
      </div>
      <input
        aria-label={`Nombre del feriado del ${feriado.fecha}`}
        className={cn(controlClase, "h-8 text-sm")}
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
      />
      <span>
        <StatusBadge
          estado={feriado.activo ? "ACTIVO" : "INACTIVO"}
          etiqueta={feriado.activo ? "Activo" : "Inactivo"}
        />
      </span>
      <span className="flex gap-1.5">
        <Button
          tamano="xs"
          variante="contorno"
          aria-label={`Guardar el feriado del ${feriado.fecha}`}
          disabled={!cambio || !valido || editar.isPending}
          onClick={() =>
            void ejecutar(
              {
                tipo: "editarFeriado",
                id: feriado.id,
                cambios: {
                  ...(fecha !== feriado.fecha ? { fecha } : {}),
                  ...(nombre !== feriado.nombre ? { nombre } : {}),
                },
              },
              "Feriado actualizado",
            )
          }
          type="button"
        >
          <Save size={13} />
        </Button>
        <Button
          tamano="xs"
          variante={feriado.activo ? "fantasma" : "contorno"}
          aria-label={`${feriado.activo ? "Desactivar" : "Reactivar"} el feriado ${feriado.nombre} (${feriado.fecha})`}
          disabled={editar.isPending}
          onClick={() =>
            void ejecutar(
              { tipo: "editarFeriado", id: feriado.id, cambios: { activo: !feriado.activo } },
              feriado.activo ? "Feriado desactivado" : "Feriado reactivado",
            )
          }
          type="button"
        >
          {feriado.activo ? "Desactivar" : "Reactivar"}
        </Button>
      </span>
    </li>
  );
}

// ── Plan institucional ─────────────────────────────────────────────────

function PlanCard({ plan, editar }: { plan: SemanaPlanDTO[]; editar: Editar }) {
  return (
    <Card>
      <CardEncabezado
        titulo={
          <Titulo icono={<ListChecks size={15} />} texto="Plan institucional de 12 semanas" />
        }
        descripcion="Se copia a cada taller al crearlo; el asesor adapta el contenido en su taller. Editarlo aquí no cambia los talleres ya creados. Qué semanas son hito, y que la 2 y la 12 sean fijas, lo definen las reglas del taller."
      />
      <div className="p-4 md:p-5">
        {plan.length === 0 ? (
          <EmptyState
            titulo="El plan institucional está vacío"
            descripcion="Ejecuta el seed base (db:seed:base) para cargar las 12 semanas."
          />
        ) : (
          <ol className="divide-y divide-slate-200/70 rounded-lg border border-slate-200">
            {plan.map((s) => (
              <SemanaFila key={s.semana} semana={s} editar={editar} />
            ))}
          </ol>
        )}
      </div>
    </Card>
  );
}

function SemanaFila({ semana, editar }: { semana: SemanaPlanDTO; editar: Editar }) {
  const ejecutar = useEjecutar(editar);
  const [contenido, setContenido] = useState(semana.contenido);
  const [entregable, setEntregable] = useState(semana.entregable ?? "");
  const cambio = contenido !== semana.contenido || entregable !== (semana.entregable ?? "");
  const faltaEntregable = semana.esHito && entregable.trim() === "";
  const valido = contenido.trim().length >= 3 && !faltaEntregable;
  return (
    <li className="grid grid-cols-1 items-start gap-2 px-3 py-2 md:grid-cols-[84px_1fr_1fr_104px_auto]">
      <span className="pt-1.5 text-sm font-bold tabular-nums text-navy-950">
        Semana {semana.semana}
      </span>
      <input
        aria-label={`Contenido de la semana ${semana.semana}`}
        className={cn(controlClase, "h-8 text-sm")}
        value={contenido}
        onChange={(e) => setContenido(e.target.value)}
      />
      <div>
        <input
          aria-label={`Entregable de la semana ${semana.semana}`}
          className={cn(controlClase, "h-8 text-sm", faltaEntregable && "border-red-400")}
          placeholder={semana.esHito ? "Entregable del hito" : "Sin entregable"}
          value={entregable}
          onChange={(e) => setEntregable(e.target.value)}
        />
        {faltaEntregable && (
          <span className="mt-0.5 block text-xs font-medium text-red-700">
            Esta semana es un hito: escribe su entregable
          </span>
        )}
      </div>
      <span className="pt-1">
        {semana.esHito ? (
          <StatusBadge
            estado={semana.fijo ? "HITO_FIJO" : "HITO"}
            etiqueta={semana.fijo ? "Hito fijo" : "Hito"}
          />
        ) : (
          <span className="text-xs text-grafito-600">—</span>
        )}
      </span>
      <Button
        tamano="xs"
        variante="contorno"
        aria-label={`Guardar la semana ${semana.semana}`}
        disabled={!cambio || !valido || editar.isPending}
        onClick={() =>
          void ejecutar(
            {
              tipo: "editarSemanaPlan",
              semana: semana.semana,
              datos: { contenido, entregable: entregable.trim() === "" ? null : entregable },
            },
            `Semana ${semana.semana} actualizada`,
          )
        }
        type="button"
      >
        <Save size={13} />
      </Button>
    </li>
  );
}

// ── Especialidades ─────────────────────────────────────────────────────

function EspecialidadesCard({
  especialidades,
  editar,
}: {
  especialidades: EspecialidadDTO[];
  editar: Editar;
}) {
  const ejecutar = useEjecutar(editar);
  const [nueva, setNueva] = useState("");
  return (
    <Card>
      <CardEncabezado
        titulo={<Titulo icono={<Tags size={15} />} texto="Especialidades de los asesores" />}
        descripcion="Catálogo ampliable (la Secretaría también las agrega desde el perfil del asesor). Una especialidad desactivada deja de ofrecerse, pero los asesores que ya la tienen la conservan."
      />
      <div className="space-y-3 p-4 md:p-5">
        {especialidades.length === 0 ? (
          <p className="text-xs text-grafito-600">Aún no hay especialidades. Agrega la primera.</p>
        ) : (
          <ol className="divide-y divide-slate-200/70 rounded-lg border border-slate-200">
            {especialidades.map((e) => (
              <EspecialidadFila key={e.id} especialidad={e} editar={editar} />
            ))}
          </ol>
        )}
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]">
          <input
            aria-label="Nombre de la nueva especialidad"
            className={cn(controlClase, "h-9")}
            placeholder="Nueva especialidad (ej. Seguridad y salud ocupacional)"
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
          />
          <Button
            tamano="sm"
            variante="oscuro"
            disabled={nueva.trim().length < 2 || editar.isPending}
            onClick={() =>
              void ejecutar(
                { tipo: "agregarEspecialidad", datos: { nombre: nueva } },
                "Especialidad agregada",
              ).then((ok) => {
                if (ok) setNueva("");
              })
            }
            type="button"
          >
            <Plus size={14} />
            Agregar
          </Button>
        </div>
      </div>
    </Card>
  );
}

function EspecialidadFila({
  especialidad,
  editar,
}: {
  especialidad: EspecialidadDTO;
  editar: Editar;
}) {
  const ejecutar = useEjecutar(editar);
  const [nombre, setNombre] = useState(especialidad.nombre);
  const cambio = nombre !== especialidad.nombre;
  return (
    <li
      className={cn(
        "grid grid-cols-1 items-center gap-2 px-3 py-2 md:grid-cols-[1fr_110px_110px_auto]",
        !especialidad.activa && "bg-slate-50",
      )}
    >
      <input
        aria-label={`Nombre de la especialidad ${especialidad.nombre}`}
        className={cn(controlClase, "h-8 text-sm")}
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
      />
      <span className="text-xs text-grafito-600">
        {especialidad.asesores === 1 ? "1 asesor" : `${especialidad.asesores} asesores`}
      </span>
      <span>
        <StatusBadge
          estado={especialidad.activa ? "ACTIVA" : "INACTIVA"}
          etiqueta={especialidad.activa ? "Activa" : "Inactiva"}
        />
      </span>
      <span className="flex gap-1.5">
        <Button
          tamano="xs"
          variante="contorno"
          aria-label={`Guardar la especialidad ${especialidad.nombre}`}
          disabled={!cambio || nombre.trim().length < 2 || editar.isPending}
          onClick={() =>
            void ejecutar(
              { tipo: "editarEspecialidad", id: especialidad.id, cambios: { nombre } },
              "Especialidad actualizada",
            )
          }
          type="button"
        >
          <Save size={13} />
        </Button>
        <Button
          tamano="xs"
          variante={especialidad.activa ? "fantasma" : "contorno"}
          aria-label={`${especialidad.activa ? "Desactivar" : "Reactivar"} la especialidad ${especialidad.nombre}`}
          disabled={editar.isPending}
          onClick={() =>
            void ejecutar(
              {
                tipo: "editarEspecialidad",
                id: especialidad.id,
                cambios: { activa: !especialidad.activa },
              },
              especialidad.activa ? "Especialidad desactivada" : "Especialidad reactivada",
            )
          }
          type="button"
        >
          {especialidad.activa ? "Desactivar" : "Reactivar"}
        </Button>
      </span>
    </li>
  );
}

// ── Parámetros ─────────────────────────────────────────────────────────

function textoValor(p: ParametroTallerDTO, v: number | boolean): string {
  if (typeof v === "boolean") return v ? "Sí" : "No";
  return p.unidad ? `${v} ${p.unidad}` : String(v);
}

function ParametrosCard({
  parametros,
  editar,
}: {
  parametros: ParametroTallerDTO[];
  editar: Editar;
}) {
  return (
    <Card>
      <CardEncabezado
        titulo={<Titulo icono={<SlidersHorizontal size={15} />} texto="Parámetros del taller" />}
        descripcion="Reglas que la especificación deja configurables. Cada una trae un valor recomendado con su motivo; los cambios rigen desde que se guardan."
      />
      <div className="p-4 md:p-5">
        <ol className="divide-y divide-slate-200/70 rounded-lg border border-slate-200">
          {parametros.map((p) => (
            <ParametroFila key={p.clave} parametro={p} editar={editar} />
          ))}
        </ol>
      </div>
    </Card>
  );
}

function ParametroFila({
  parametro: p,
  editar,
}: {
  parametro: ParametroTallerDTO;
  editar: Editar;
}) {
  const ejecutar = useEjecutar(editar);
  const [valor, setValor] = useState(String(p.valor));
  const esNumero = p.tipo === "NUMERO";
  const numero = Number(valor);
  const error = esNumero
    ? valor.trim() === "" || !Number.isInteger(numero)
      ? "Escribe un número entero"
      : p.min !== null && p.max !== null && (numero < p.min || numero > p.max)
        ? `Debe estar entre ${p.min} y ${p.max}`
        : null
    : null;
  const nuevo: number | boolean = esNumero ? numero : valor === "true";
  const cambio = String(nuevo) !== String(p.valor);
  const distintoDelDefecto = String(p.valor) !== String(p.porDefecto);
  return (
    <li className="grid grid-cols-1 items-start gap-2 px-3 py-2.5 md:grid-cols-[1fr_200px_auto]">
      <div>
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-navy-950">
          {p.etiqueta}
        </p>
        <p className="text-xs text-grafito-600">
          Especificación {p.origen} · Recomendado: {textoValor(p, p.porDefecto)}
          {distintoDelDefecto ? " · modificado" : ""}
        </p>
        <p className="text-xs text-grafito-600">{p.decision}</p>
      </div>
      <div>
        {esNumero ? (
          <div className="flex items-center gap-2">
            <input
              aria-label={p.etiqueta}
              className={cn(controlClase, "h-8 w-24 text-sm", error && "border-red-400")}
              inputMode="numeric"
              max={p.max ?? undefined}
              min={p.min ?? undefined}
              type="number"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
            {p.unidad && <span className="text-xs text-grafito-600">{p.unidad}</span>}
          </div>
        ) : (
          <Select ariaLabel={p.etiqueta} value={valor} onChange={setValor}>
            <option value="true">Sí</option>
            <option value="false">No</option>
          </Select>
        )}
        {error && <span className="mt-0.5 block text-xs font-medium text-red-700">{error}</span>}
      </div>
      <Button
        tamano="xs"
        variante="contorno"
        aria-label={`Guardar ${p.etiqueta}`}
        disabled={!cambio || error !== null || editar.isPending}
        onClick={() =>
          void ejecutar(
            { tipo: "editarParametro", clave: p.clave, valor: nuevo },
            `${p.etiqueta}: ${textoValor(p, nuevo)}`,
          )
        }
        type="button"
      >
        <Save size={13} />
      </Button>
    </li>
  );
}
