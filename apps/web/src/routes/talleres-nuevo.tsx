import {
  fechaPensionPorDefecto,
  finSugerido,
  textoContador,
} from "@pis/domain/dist/taller/calendario.js";
import { Link, useNavigate } from "@tanstack/react-router";
import { CalendarPlus, RotateCcw, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAsesores } from "../api/asesores.js";
import { ApiError } from "../api/errores.js";
import {
  type DatosTallerInput,
  fechaLarga,
  type TallerDetalleDTO,
  useCrearTaller,
  useDefectosTaller,
  useEditarTaller,
  useProponerCalendario,
  useTaller,
} from "../api/taller.js";
import { AppShell } from "../components/layout/app-shell.js";
import { Button, botonClases } from "../components/ui/button.js";
import { Card, CardEncabezado } from "../components/ui/card.js";
import { ConfirmDialog } from "../components/ui/confirm-dialog.js";
import { EmptyState } from "../components/ui/empty-state.js";
import { controlClase, Field } from "../components/ui/field.js";
import { PageHeader } from "../components/ui/page-header.js";
import { useToast } from "../components/ui/toast.js";
import { cn } from "../utils/cn.js";

/**
 * P2 Nuevo o editar taller (spec v1.0 §9): datos, horario por día,
 * calendario propuesto (omite feriados) y ajustable a mano, 3 pensiones y
 * la copia del plan institucional al guardar. La Secretaría del Taller.
 */

const DIAS = [
  { dia: 1, corto: "L", nombre: "Lunes" },
  { dia: 2, corto: "M", nombre: "Martes" },
  { dia: 3, corto: "X", nombre: "Miércoles" },
  { dia: 4, corto: "J", nombre: "Jueves" },
  { dia: 5, corto: "V", nombre: "Viernes" },
  { dia: 6, corto: "S", nombre: "Sábado" },
  { dia: 7, corto: "D", nombre: "Domingo" },
] as const;

const HORARIO_DEFECTO: Record<number, { horaInicio: string; horaFin: string }> = {
  6: { horaInicio: "15:00", horaFin: "20:00" },
  7: { horaInicio: "08:00", horaFin: "13:00" },
};

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

type Dia = { activo: boolean; horaInicio: string; horaFin: string };
type Sesion = {
  clave: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  agregada: boolean;
};
type Errores = Record<string, string | undefined>;

interface Formulario {
  nombre: string;
  periodo: string;
  asesorId: string;
  inicio: string;
  fin: string;
  numeroSesiones: string;
  cupo: string;
  enlaceSabado: string;
  enlaceDomingo: string;
  montos: [string, string, string];
  fecha2: string;
  fecha3: string;
  dias: Record<number, Dia>;
}

function diasIniciales(lista?: Array<{ dia: number; horaInicio: string; horaFin: string }>) {
  const out: Record<number, Dia> = {};
  for (const d of DIAS) {
    const guardado = lista?.find((x) => x.dia === d.dia);
    const defecto = HORARIO_DEFECTO[d.dia] ?? { horaInicio: "08:00", horaFin: "13:00" };
    out[d.dia] = guardado
      ? { activo: true, horaInicio: guardado.horaInicio, horaFin: guardado.horaFin }
      : { activo: lista === undefined && (d.dia === 6 || d.dia === 7), ...defecto };
  }
  return out;
}

function diaIso(fecha: string): number {
  const d = new Date(`${fecha}T12:00:00Z`);
  return ((d.getUTCDay() + 6) % 7) + 1;
}

function nombreDia(fecha: string): string {
  return DIAS.find((d) => d.dia === diaIso(fecha))?.nombre ?? "";
}

let contadorClaves = 0;
const nuevaClave = () => `s${++contadorClaves}`;

export function TalleresNuevoPage() {
  return <FormularioTaller />;
}

export function TallerEditarPage({ id }: { id: string }) {
  const taller = useTaller(id);
  if (taller.isPending)
    return (
      <AppShell activo="/talleres">
        <p className="text-sm text-grafito-600">Cargando…</p>
      </AppShell>
    );
  if (!taller.data)
    return (
      <AppShell activo="/talleres">
        <EmptyState titulo="No se encontró el taller" />
      </AppShell>
    );
  return <FormularioTaller taller={taller.data} />;
}

function FormularioTaller({ taller }: { taller?: TallerDetalleDTO }) {
  const avisar = useToast();
  const navigate = useNavigate();
  const editando = taller !== undefined;
  const defectos = useDefectosTaller();
  const asesores = useAsesores();
  const crear = useCrearTaller();
  const editar = useEditarTaller(taller?.id ?? "");
  const proponer = useProponerCalendario();
  const fechasBloqueadas = editando && !taller.fechasEditables;

  const [f, setF] = useState<Formulario>(() => ({
    nombre: taller?.nombre ?? "",
    periodo: taller?.periodo ?? "",
    asesorId: taller?.asesorId ?? "",
    inicio: taller?.fechaInicio ?? "",
    fin: taller?.fechaFin ?? "",
    numeroSesiones: String(taller?.numeroSesiones ?? 24),
    cupo: String(taller?.cupoProyectos ?? 15),
    enlaceSabado: taller?.enlaceSabado ?? "",
    enlaceDomingo: taller?.enlaceDomingo ?? "",
    montos: [
      String(taller?.pensiones[0]?.monto ?? 1000),
      String(taller?.pensiones[1]?.monto ?? 1000),
      String(taller?.pensiones[2]?.monto ?? 1000),
    ],
    fecha2: taller?.pensiones[1]?.fecha ?? "",
    fecha3: taller?.pensiones[2]?.fecha ?? "",
    dias: diasIniciales(editando ? taller.dias : undefined),
  }));
  const [sesiones, setSesiones] = useState<Sesion[]>(() =>
    (taller?.calendario ?? []).map((s) => ({
      clave: nuevaClave(),
      fecha: s.fecha,
      horaInicio: s.horaInicio,
      horaFin: s.horaFin,
      agregada: false,
    })),
  );
  const [omitidas, setOmitidas] = useState<Array<{ fecha: string; nota: string }>>([]);
  const [feriados, setFeriados] = useState<Map<string, string>>(new Map());
  /** El calendario se ajustó a mano (o es el guardado): no se reemplaza sin preguntar. */
  const [manual, setManual] = useState(editando);
  const [preguntarRecalculo, setPreguntarRecalculo] = useState(false);
  const [tocados, setTocados] = useState({ fin: editando, fecha2: editando, fecha3: editando });
  const [errores, setErrores] = useState<Errores>({});
  const [salir, setSalir] = useState(false);
  const [sucio, setSucio] = useState(false);
  const [nuevaFecha, setNuevaFecha] = useState("");

  // Valores iniciales desde los parámetros (solo al crear).
  const aplicoDefectos = useRef(false);
  useEffect(() => {
    if (editando || aplicoDefectos.current || !defectos.data) return;
    aplicoDefectos.current = true;
    const d = defectos.data;
    setF((x) => ({
      ...x,
      cupo: String(d.cupoProyectos),
      numeroSesiones: String(d.numeroSesiones),
      montos: [String(d.montoPension), String(d.montoPension), String(d.montoPension)],
    }));
  }, [defectos.data, editando]);

  const diasActivos = useMemo(
    () =>
      DIAS.filter((d) => f.dias[d.dia]?.activo).map((d) => ({
        dia: d.dia,
        horaInicio: f.dias[d.dia]?.horaInicio ?? "",
        horaFin: f.dias[d.dia]?.horaFin ?? "",
      })),
    [f.dias],
  );
  const objetivo = Number(f.numeroSesiones);
  const entradaCalendario = JSON.stringify({ i: f.inicio, f: f.fin, d: diasActivos, n: objetivo });

  function cambiar<K extends keyof Formulario>(campo: K, valor: Formulario[K], error?: string) {
    setF((x) => ({ ...x, [campo]: valor }));
    setSucio(true);
    if (error) setErrores((e) => ({ ...e, [error]: undefined }));
  }

  // Al elegir el inicio se sugieren el fin (domingo de la semana 12) y las pensiones.
  function cambiarInicio(inicio: string): void {
    setF((x) => {
      const valido = FECHA_RE.test(inicio);
      return {
        ...x,
        inicio,
        fin: valido && !tocados.fin ? finSugerido(inicio) : x.fin,
        fecha2: valido && !tocados.fecha2 ? fechaPensionPorDefecto(inicio, 4) : x.fecha2,
        fecha3: valido && !tocados.fecha3 ? fechaPensionPorDefecto(inicio, 8) : x.fecha3,
      };
    });
    setSucio(true);
    setErrores((e) => ({ ...e, inicio: undefined }));
  }

  async function recalcular(): Promise<void> {
    const datos = JSON.parse(entradaCalendario) as {
      i: string;
      f: string;
      d: Array<{ dia: number; horaInicio: string; horaFin: string }>;
      n: number;
    };
    if (!FECHA_RE.test(datos.i) || !FECHA_RE.test(datos.f) || datos.f <= datos.i) return;
    if (datos.d.length === 0 || !Number.isInteger(datos.n) || datos.n < 1) return;
    if (datos.d.some((d) => !/^\d{2}:\d{2}$/.test(d.horaInicio) || d.horaFin <= d.horaInicio))
      return;
    try {
      const r = await proponer.mutateAsync({
        inicio: datos.i,
        fin: datos.f,
        dias: datos.d,
        numeroSesiones: datos.n,
      });
      setSesiones(
        r.sesiones.map((s) => ({
          clave: nuevaClave(),
          fecha: s.fecha,
          horaInicio: s.horaInicio,
          horaFin: s.horaFin,
          agregada: false,
        })),
      );
      setOmitidas(r.omitidas);
      setFeriados(new Map(r.feriados.map((x) => [x.fecha, x.nombre])));
      setManual(false);
      setErrores((e) => ({ ...e, calendario: undefined }));
    } catch (e) {
      avisar(e instanceof Error ? e.message : "No se pudo proponer el calendario", "error");
    }
  }

  // §9 P2: se recalcula al cambiar inicio, fin, días, horarios o número de
  // sesiones; si hubo cambios a mano, se pregunta antes de volver a proponer.
  const ultimaEntrada = useRef(editando ? entradaCalendario : "");
  // biome-ignore lint/correctness/useExhaustiveDependencies: se recalcula solo cuando cambian los datos del calendario
  useEffect(() => {
    if (fechasBloqueadas || entradaCalendario === ultimaEntrada.current) return;
    ultimaEntrada.current = entradaCalendario;
    if (manual) {
      setPreguntarRecalculo(true);
      return;
    }
    const t = setTimeout(() => void recalcular(), 350);
    return () => clearTimeout(t);
  }, [entradaCalendario]);

  function ajustar(nuevas: Sesion[]): void {
    setSesiones(nuevas);
    setManual(true);
    setSucio(true);
    setErrores((e) => ({ ...e, calendario: undefined }));
  }

  function agregarSesion(): void {
    if (!FECHA_RE.test(nuevaFecha)) return;
    if (sesiones.some((s) => s.fecha === nuevaFecha)) {
      avisar("Ya hay una sesión ese día", "error");
      return;
    }
    const horario = f.dias[diaIso(nuevaFecha)] ?? { horaInicio: "15:00", horaFin: "20:00" };
    ajustar(
      [
        ...sesiones,
        {
          clave: nuevaClave(),
          fecha: nuevaFecha,
          horaInicio: horario.horaInicio,
          horaFin: horario.horaFin,
          agregada: true,
        },
      ].sort((a, b) => a.fecha.localeCompare(b.fecha)),
    );
    setNuevaFecha("");
  }

  async function guardar(): Promise<void> {
    const datos: DatosTallerInput = {
      nombre: f.nombre,
      periodo: f.periodo,
      inicio: f.inicio,
      fin: f.fin,
      numeroSesiones: Number(f.numeroSesiones),
      dias: diasActivos,
      cupoProyectos: Number(f.cupo),
      enlaceSabado: f.enlaceSabado.trim() || null,
      enlaceDomingo: f.enlaceDomingo.trim() || null,
      pensiones: {
        montos: [Number(f.montos[0]), Number(f.montos[1]), Number(f.montos[2])],
        fecha2: f.fecha2,
        fecha3: f.fecha3,
      },
      sesiones: sesiones.map(({ fecha, horaInicio, horaFin }) => ({ fecha, horaInicio, horaFin })),
    };
    const locales: Errores = {};
    if (!editando && !f.asesorId) locales.asesorId = "Elige el asesor";
    if (!FECHA_RE.test(f.inicio)) locales.inicio = "Elige la fecha de inicio del curso";
    if (!FECHA_RE.test(f.fin)) locales.fin = "Elige la fecha de fin del curso";
    if (!FECHA_RE.test(f.fecha2)) locales["pension.2.fecha"] = "Elige la fecha de la 2.ª pensión";
    if (!FECHA_RE.test(f.fecha3)) locales["pension.3.fecha"] = "Elige la fecha de la 3.ª pensión";
    if (sesiones.length === 0) locales.calendario = "El calendario no tiene sesiones";
    if (Object.keys(locales).length > 0) {
      setErrores(locales);
      avisar("Revisa los campos marcados", "error");
      return;
    }
    try {
      const d = editando
        ? await editar.mutateAsync(datos)
        : await crear.mutateAsync({ ...datos, asesorId: f.asesorId });
      setSucio(false);
      avisar(editando ? "Taller actualizado" : `Taller ${d.nombre} creado`);
      void navigate({ to: "/taller/$id", params: { id: d.id } });
    } catch (e) {
      const campos = e instanceof ApiError ? e.campos : {};
      setErrores(campos);
      avisar(e instanceof Error ? e.message : "No se pudo guardar", "error");
    }
  }

  function volver(): void {
    if (editando && taller) void navigate({ to: "/taller/$id", params: { id: taller.id } });
    else void navigate({ to: "/talleres" });
  }

  const disponibles = (asesores.data ?? []).filter(
    (a) => a.activo && (a.disponibilidad === "DISPONIBLE" || a.id === taller?.asesorId),
  );
  const asesorElegido = (asesores.data ?? []).find((a) => a.id === f.asesorId);
  const coincide = sesiones.length === objetivo;
  const filas = [
    ...sesiones.map((s) => ({ tipo: "sesion" as const, fecha: s.fecha, s })),
    ...omitidas
      .filter((o) => !sesiones.some((s) => s.fecha === o.fecha))
      .map((o) => ({ tipo: "omitida" as const, fecha: o.fecha, o })),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha));
  let nro = 0;
  const guardando = crear.isPending || editar.isPending;
  const motivoBloqueo = "El taller ya tiene sesiones realizadas: las fechas no se cambian";

  return (
    <AppShell activo="/talleres">
      <PageHeader
        titulo={editando ? `Editar ${taller.nombre}` : "Nuevo taller"}
        descripcion={
          editando
            ? "Los cambios de enlaces valen para las sesiones futuras. Las pensiones ya pagadas no cambian."
            : "Al guardar se crean las sesiones, las 3 pensiones y la copia del plan institucional. El taller queda abierto a inscripciones."
        }
        migas={[
          { etiqueta: "Talleres", href: "/talleres" },
          { etiqueta: editando ? "Editar" : "Nuevo" },
        ]}
      />

      <Card>
        <CardEncabezado titulo="Datos del taller" />
        <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3 md:p-5">
          <Field etiqueta="Nombre *" error={errores.nombre}>
            <input
              aria-label="Nombre del taller"
              className={cn(controlClase, "h-10", errores.nombre && "border-red-400")}
              placeholder="Ejemplo: TALLER 08"
              value={f.nombre}
              onChange={(e) => cambiar("nombre", e.target.value, "nombre")}
            />
          </Field>
          <Field etiqueta="Período *" error={errores.periodo}>
            <input
              aria-label="Período"
              className={cn(controlClase, "h-10", errores.periodo && "border-red-400")}
              placeholder="Ejemplo: 2026-II"
              value={f.periodo}
              onChange={(e) => cambiar("periodo", e.target.value, "periodo")}
            />
          </Field>
          {editando ? (
            <Field
              etiqueta="Asesor"
              ayuda="Se cambia con «Cambiar asesor» en el detalle del taller"
            >
              <input
                aria-label="Asesor"
                className={cn(controlClase, "h-10")}
                disabled
                value={taller.asesorNombre ?? "—"}
              />
            </Field>
          ) : (
            <Field
              etiqueta="Asesor * (solo disponibles)"
              error={errores.asesorId}
              ayuda={
                asesorElegido
                  ? asesorElegido.especialidades.map((e) => e.nombre).join(", ") ||
                    "Sin especialidades registradas"
                  : disponibles.length === 0 && !asesores.isPending
                    ? "No hay asesores disponibles: todos tienen un taller activo"
                    : undefined
              }
            >
              <select
                aria-label="Asesor"
                className={cn(controlClase, "h-10", errores.asesorId && "border-red-400")}
                value={f.asesorId}
                onChange={(e) => cambiar("asesorId", e.target.value, "asesorId")}
              >
                <option value="">Elige un asesor…</option>
                {disponibles.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.grado ? `${a.grado} ` : ""}
                    {a.nombres} {a.apellidos}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field
            etiqueta="Inicio del curso *"
            error={errores.inicio}
            ayuda={fechasBloqueadas ? motivoBloqueo : undefined}
          >
            <input
              aria-label="Inicio del curso"
              className={cn(controlClase, "h-10", errores.inicio && "border-red-400")}
              disabled={fechasBloqueadas}
              type="date"
              value={f.inicio}
              onChange={(e) => cambiarInicio(e.target.value)}
            />
          </Field>
          <Field
            etiqueta="Fin del curso *"
            error={errores.fin}
            ayuda={
              FECHA_RE.test(f.inicio) ? `Sugerido: ${fechaLarga(finSugerido(f.inicio))}` : undefined
            }
          >
            <input
              aria-label="Fin del curso"
              className={cn(controlClase, "h-10", errores.fin && "border-red-400")}
              disabled={fechasBloqueadas}
              type="date"
              value={f.fin}
              onChange={(e) => {
                setTocados((t) => ({ ...t, fin: true }));
                cambiar("fin", e.target.value, "fin");
              }}
            />
          </Field>
          <Field etiqueta="Número de sesiones *" error={errores.numeroSesiones}>
            <input
              aria-label="Número de sesiones"
              className={cn(controlClase, "h-10", errores.numeroSesiones && "border-red-400")}
              inputMode="numeric"
              min={1}
              type="number"
              value={f.numeroSesiones}
              onChange={(e) => cambiar("numeroSesiones", e.target.value, "numeroSesiones")}
            />
          </Field>
          <Field etiqueta="Cupo máximo (proyectos) *" error={errores.cupoProyectos}>
            <input
              aria-label="Cupo máximo de proyectos"
              className={cn(controlClase, "h-10", errores.cupoProyectos && "border-red-400")}
              inputMode="numeric"
              min={1}
              type="number"
              value={f.cupo}
              onChange={(e) => cambiar("cupo", e.target.value, "cupoProyectos")}
            />
          </Field>
          <Field etiqueta="Enlace del sábado" error={errores.enlaceSabado}>
            <input
              aria-label="Enlace del sábado"
              className={cn(controlClase, "h-10", errores.enlaceSabado && "border-red-400")}
              placeholder="https://meet.google.com/…"
              value={f.enlaceSabado}
              onChange={(e) => cambiar("enlaceSabado", e.target.value, "enlaceSabado")}
            />
          </Field>
          <Field etiqueta="Enlace del domingo" error={errores.enlaceDomingo}>
            <input
              aria-label="Enlace del domingo"
              className={cn(controlClase, "h-10", errores.enlaceDomingo && "border-red-400")}
              placeholder="https://meet.google.com/…"
              value={f.enlaceDomingo}
              onChange={(e) => cambiar("enlaceDomingo", e.target.value, "enlaceDomingo")}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardEncabezado
          titulo="Días y horario de las sesiones *"
          descripcion="Sábado y domingo por defecto. Otros días solo en casos especiales; cada día marcado necesita su horario."
        />
        <div className="space-y-2 p-4 md:p-5">
          {errores.dias && <p className="text-xs font-medium text-red-700">{errores.dias}</p>}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {DIAS.map((d) => {
              const dia = f.dias[d.dia] ?? { activo: false, horaInicio: "", horaFin: "" };
              const error = errores[`horario.${d.dia}`];
              return (
                <div
                  key={d.dia}
                  className={cn(
                    "rounded-lg border p-2.5",
                    dia.activo ? "border-navy-800/40 bg-navy-950/[0.03]" : "border-slate-200",
                  )}
                >
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <input
                      aria-label={`Sesiones los ${d.nombre.toLowerCase()}`}
                      checked={dia.activo}
                      disabled={fechasBloqueadas}
                      type="checkbox"
                      onChange={(e) =>
                        cambiar(
                          "dias",
                          { ...f.dias, [d.dia]: { ...dia, activo: e.target.checked } },
                          "dias",
                        )
                      }
                    />
                    {d.nombre}
                  </label>
                  {dia.activo && (
                    <div className="mt-2 flex items-center gap-1.5">
                      <input
                        aria-label={`Hora de inicio del ${d.nombre}`}
                        className={cn(controlClase, "h-8 px-2 text-sm", error && "border-red-400")}
                        disabled={fechasBloqueadas}
                        type="time"
                        value={dia.horaInicio}
                        onChange={(e) =>
                          cambiar(
                            "dias",
                            { ...f.dias, [d.dia]: { ...dia, horaInicio: e.target.value } },
                            `horario.${d.dia}`,
                          )
                        }
                      />
                      <span className="text-xs text-grafito-600">a</span>
                      <input
                        aria-label={`Hora de fin del ${d.nombre}`}
                        className={cn(controlClase, "h-8 px-2 text-sm", error && "border-red-400")}
                        disabled={fechasBloqueadas}
                        type="time"
                        value={dia.horaFin}
                        onChange={(e) =>
                          cambiar(
                            "dias",
                            { ...f.dias, [d.dia]: { ...dia, horaFin: e.target.value } },
                            `horario.${d.dia}`,
                          )
                        }
                      />
                    </div>
                  )}
                  {error && <p className="mt-1 text-xs font-medium text-red-700">{error}</p>}
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      <Card>
        <CardEncabezado
          titulo="Calendario de sesiones"
          descripcion={
            fechasBloqueadas
              ? motivoBloqueo
              : "Propuesto con los días marcados entre el inicio y el fin, sin feriados. Puedes cambiar una fecha, quitar o agregar sesiones."
          }
          accion={
            <span
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs font-bold",
                coincide
                  ? "border-green-300 bg-verde-inst-100 text-verde-inst-700"
                  : "border-yellow-300 bg-aviso-100 text-aviso-800",
              )}
            >
              {Number.isInteger(objetivo) && objetivo > 0
                ? textoContador(sesiones.length, objetivo)
                : `${sesiones.length} sesiones`}
            </span>
          }
        />
        <div className="space-y-3 p-4 md:p-5">
          {!coincide && sesiones.length > 0 && (
            <p className="text-xs text-aviso-800">
              El calendario no suma el número de sesiones del taller. Puedes guardarlo igual o
              agregar sesiones.
            </p>
          )}
          {errores.calendario && (
            <p className="text-xs font-medium text-red-700">{errores.calendario}</p>
          )}
          {preguntarRecalculo && !fechasBloqueadas && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-yellow-300 bg-aviso-100 px-3 py-2 text-sm text-aviso-800">
              <span>
                Cambiaste los datos del calendario, pero hay ajustes hechos a mano. ¿Volver a
                proponerlo? Se perderán esos ajustes.
              </span>
              <span className="flex gap-1.5">
                <Button
                  tamano="xs"
                  variante="contorno"
                  onClick={() => setPreguntarRecalculo(false)}
                  type="button"
                >
                  Mantener
                </Button>
                <Button
                  tamano="xs"
                  variante="oscuro"
                  onClick={() => {
                    setPreguntarRecalculo(false);
                    void recalcular();
                  }}
                  type="button"
                >
                  <RotateCcw size={13} />
                  Volver a proponer
                </Button>
              </span>
            </div>
          )}
          {filas.length === 0 ? (
            <p className="text-sm text-grafito-600">
              {proponer.isPending
                ? "Proponiendo el calendario…"
                : "Elige el inicio, el fin y los días para proponer el calendario."}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="bg-navy-950 text-[11px] font-bold tracking-wider text-white uppercase">
                    <th className="px-3 py-2">N°</th>
                    <th className="px-3 py-2">Fecha</th>
                    <th className="px-3 py-2">Día</th>
                    <th className="px-3 py-2">Nota</th>
                    <th className="px-3 py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70">
                  {filas.map((fila) => {
                    if (fila.tipo === "omitida")
                      return (
                        <tr key={`o-${fila.fecha}`} className="bg-slate-50 text-grafito-600">
                          <td className="px-3 py-1.5">—</td>
                          <td className="px-3 py-1.5 line-through">{fechaLarga(fila.fecha)}</td>
                          <td className="px-3 py-1.5 line-through">{nombreDia(fila.fecha)}</td>
                          <td className="px-3 py-1.5" colSpan={2}>
                            {fila.o.nota}
                          </td>
                        </tr>
                      );
                    nro += 1;
                    const s = fila.s;
                    const feriado = feriados.get(s.fecha);
                    return (
                      <tr key={s.clave}>
                        <td className="px-3 py-1.5 font-bold tabular-nums">{nro}</td>
                        <td className="px-3 py-1.5">
                          <input
                            aria-label={`Fecha de la sesión ${nro}`}
                            className={cn(controlClase, "h-8 w-40 px-2 text-sm")}
                            disabled={fechasBloqueadas}
                            type="date"
                            value={s.fecha}
                            onChange={(e) => {
                              const fecha = e.target.value;
                              if (!FECHA_RE.test(fecha)) return;
                              if (sesiones.some((x) => x.fecha === fecha && x.clave !== s.clave)) {
                                avisar("Ya hay una sesión ese día", "error");
                                return;
                              }
                              const horario = f.dias[diaIso(fecha)];
                              ajustar(
                                sesiones
                                  .map((x) =>
                                    x.clave === s.clave
                                      ? {
                                          ...x,
                                          fecha,
                                          ...(horario?.activo
                                            ? {
                                                horaInicio: horario.horaInicio,
                                                horaFin: horario.horaFin,
                                              }
                                            : {}),
                                        }
                                      : x,
                                  )
                                  .sort((a, b) => a.fecha.localeCompare(b.fecha)),
                              );
                            }}
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          {nombreDia(s.fecha)}
                          <span className="block text-[11px] text-grafito-600">
                            {s.horaInicio}–{s.horaFin}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-xs">
                          {feriado ? (
                            <span className="font-semibold text-aviso-800">Feriado: {feriado}</span>
                          ) : s.agregada ? (
                            <span className="text-grafito-600">Agregada</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <Button
                            aria-label={`Quitar la sesión del ${s.fecha}`}
                            disabled={fechasBloqueadas}
                            tamano="xs"
                            variante="fantasma"
                            onClick={() => ajustar(sesiones.filter((x) => x.clave !== s.clave))}
                            type="button"
                          >
                            <Trash2 size={13} />
                            Quitar
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {!fechasBloqueadas && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                aria-label="Fecha de la sesión a agregar"
                className={cn(controlClase, "h-9 w-44")}
                type="date"
                value={nuevaFecha}
                onChange={(e) => setNuevaFecha(e.target.value)}
              />
              <Button
                tamano="sm"
                variante="contorno"
                disabled={!FECHA_RE.test(nuevaFecha)}
                onClick={agregarSesion}
                type="button"
              >
                <CalendarPlus size={14} />
                Agregar sesión
              </Button>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardEncabezado
          titulo="Pensiones (3)"
          descripcion="La 1.ª se da por pagada al validar la inscripción. La 2.ª y la 3.ª se sugieren el sábado de las semanas 4 y 8; el sistema avisa al alumno antes de cada fecha."
        />
        <div className="space-y-2 p-4 md:p-5">
          {[0, 1, 2].map((i) => {
            const numero = i + 1;
            const errorMonto = errores[`pension.${numero}.monto`];
            const errorFecha = errores[`pension.${numero}.fecha`];
            return (
              <div
                key={numero}
                className="grid grid-cols-1 items-start gap-2 sm:grid-cols-[80px_1fr_180px]"
              >
                <span className="pt-2 text-sm font-bold text-navy-950">{numero}.ª pensión</span>
                {numero === 1 ? (
                  <p className="pt-2 text-sm text-grafito-600">Al inscribirse</p>
                ) : (
                  <Field etiqueta={`Fecha (semana ${numero === 2 ? 4 : 8})`} error={errorFecha}>
                    <input
                      aria-label={`Fecha de la ${numero}.ª pensión`}
                      className={cn(controlClase, "h-9", errorFecha && "border-red-400")}
                      type="date"
                      value={numero === 2 ? f.fecha2 : f.fecha3}
                      onChange={(e) => {
                        const campo = numero === 2 ? "fecha2" : "fecha3";
                        setTocados((t) => ({ ...t, [campo]: true }));
                        cambiar(campo, e.target.value, `pension.${numero}.fecha`);
                      }}
                    />
                  </Field>
                )}
                <Field etiqueta="Monto (S/)" error={errorMonto}>
                  <input
                    aria-label={`Monto de la ${numero}.ª pensión`}
                    className={cn(controlClase, "h-9", errorMonto && "border-red-400")}
                    inputMode="numeric"
                    min={1}
                    type="number"
                    value={f.montos[i]}
                    onChange={(e) => {
                      const montos = [...f.montos] as [string, string, string];
                      montos[i] = e.target.value;
                      cambiar("montos", montos, `pension.${numero}.monto`);
                    }}
                  />
                </Field>
              </div>
            );
          })}
        </div>
      </Card>

      {!editando && (
        <Card>
          <CardEncabezado
            titulo="Plan de 12 semanas"
            descripcion="Al guardar, el sistema copia el plan institucional (contenido y entregable de cada semana) a este taller. El asesor podrá ajustar el contenido y escribir indicaciones en su pantalla de seguimiento. Los hitos de las semanas 2 y 12 son fijos."
          />
        </Card>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variante="contorno"
          onClick={() => (sucio ? setSalir(true) : volver())}
          type="button"
        >
          Cancelar
        </Button>
        <Button variante="oscuro" disabled={guardando} onClick={() => void guardar()} type="button">
          <Save size={15} />
          {editando ? "Guardar cambios" : "Guardar taller"}
        </Button>
      </div>
      {salir && (
        <ConfirmDialog
          titulo="Salir sin guardar"
          mensaje="Hay cambios sin guardar. ¿Salir de todos modos?"
          confirmar="Salir sin guardar"
          onConfirmar={() => {
            setSalir(false);
            volver();
          }}
          onCancelar={() => setSalir(false)}
        />
      )}
      {editando && (
        <p className="text-right text-xs text-grafito-600">
          <Link
            className={botonClases({ variante: "fantasma", tamano: "xs" })}
            to="/taller/$id"
            params={{ id: taller.id }}
          >
            Volver al detalle
          </Link>
        </p>
      )}
    </AppShell>
  );
}
