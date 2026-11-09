import { Link } from "@tanstack/react-router";
import { GraduationCap, Pencil, Plus, RotateCw, UserCheck, Users } from "lucide-react";
import { useState } from "react";
import { type AsesorDTO, useAsesores, useCrearAsesor, useEditarAsesor } from "../api/asesores.js";
import { ApiError } from "../api/errores.js";
import { EspecialidadesInput } from "../components/domain/especialidades-input.js";
import { AppShell } from "../components/layout/app-shell.js";
import { Button, botonClases } from "../components/ui/button.js";
import { Card, CardEncabezado } from "../components/ui/card.js";
import { DataTable } from "../components/ui/data-table.js";
import { Dialogo } from "../components/ui/dialog.js";
import { controlClase, Field } from "../components/ui/field.js";
import { PageHeader } from "../components/ui/page-header.js";
import { Select } from "../components/ui/select.js";
import { StatCard } from "../components/ui/stat-card.js";
import { StatusBadge } from "../components/ui/status-badge.js";
import { useToast } from "../components/ui/toast.js";
import { Tooltip } from "../components/ui/tooltip.js";
import { cn } from "../utils/cn.js";

/**
 * P15 Lista de asesores (spec v1.0 §9): tarjetas, alta con especialidades,
 * edición de datos personales y desactivación (no con un taller activo).
 * La gestiona la Secretaría del Taller; el servidor revalida todo.
 */

const GRADOS = ["Dr.", "Mg."];

type Campos = Partial<
  Record<"dni" | "nombres" | "apellidos" | "email" | "telefono" | "grado", string | undefined>
>;

const VACIO = { dni: "", nombres: "", apellidos: "", email: "", telefono: "", grado: "" };

/** Errores del cliente antes de llamar a la API (los mismos que valida el servidor). */
function validar(f: typeof VACIO, conDni: boolean): Campos {
  const e: Campos = {};
  if (conDni && !/^\d{8}$/.test(f.dni.trim())) e.dni = "El DNI tiene 8 dígitos";
  if (f.nombres.trim().length < 2) e.nombres = "Escribe los nombres";
  if (f.apellidos.trim().length < 2) e.apellidos = "Escribe los apellidos";
  if (!/^[^\s@]+@unsa\.edu\.pe$/i.test(f.email.trim()))
    e.email = "Usa el correo institucional (@unsa.edu.pe)";
  if (f.telefono.trim() !== "" && !/^\+?[0-9 ]{6,20}$/.test(f.telefono.trim()))
    e.telefono = "Escribe solo números (6 a 20)";
  return e;
}

function camposDeError(e: unknown): Campos {
  return e instanceof ApiError ? (e.campos as Campos) : {};
}

export function AsesoresPage() {
  const query = useAsesores();
  const [nuevo, setNuevo] = useState(false);
  const [editando, setEditando] = useState<AsesorDTO | null>(null);
  const items = query.data ?? [];

  return (
    <AppShell activo="/asesores">
      <PageHeader
        titulo="Asesores"
        descripcion="Catálogo y gestión de los asesores del Taller de Tesis. Al registrar un asesor se le envía su acceso al sistema."
        acciones={
          <span className="flex gap-2">
            <Button variante="contorno" onClick={() => void query.refetch()} type="button">
              <RotateCw size={15} />
              RECARGAR
            </Button>
            <Button variante="oscuro" onClick={() => setNuevo((v) => !v)} type="button">
              <Plus size={16} />
              Nuevo asesor
            </Button>
          </span>
        }
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          etiqueta="Asesores"
          valor={items.length}
          icono={<Users size={20} />}
          acento="bg-navy-950"
        />
        <StatCard
          etiqueta="Activos"
          valor={items.filter((a) => a.activo).length}
          icono={<UserCheck size={20} />}
          acento="bg-verde-inst-700"
        />
        <StatCard
          etiqueta="Con taller activo"
          valor={items.filter((a) => a.tallerActual !== null).length}
          icono={<GraduationCap size={20} />}
          acento="bg-dorado-500"
        />
      </div>
      {nuevo && <NuevoAsesorCard onCerrar={() => setNuevo(false)} />}
      <DataTable
        cargando={query.isPending}
        vacio="Aún no hay asesores registrados."
        columnas={[
          {
            encabezado: "Asesor",
            celda: (a) => (
              <span>
                <span className="font-medium">
                  {a.nombres} {a.apellidos}
                </span>
                <br />
                <span className="text-xs tabular-nums text-grafito-600">
                  DNI {a.dni} · {a.email}
                </span>
              </span>
            ),
          },
          { encabezado: "Grado", celda: (a) => a.grado ?? "—" },
          {
            encabezado: "Especialidades",
            celda: (a) =>
              a.especialidades.length === 0 ? (
                <span className="text-xs text-grafito-600">—</span>
              ) : (
                <span className="flex max-w-[260px] flex-wrap gap-1">
                  {a.especialidades.map((e) => (
                    <span
                      key={e.id}
                      className="rounded-full border border-navy-800/25 bg-navy-950/[0.05] px-2 py-0.5 text-[11px] font-semibold text-navy-950"
                    >
                      {e.nombre}
                    </span>
                  ))}
                </span>
              ),
          },
          {
            encabezado: "Taller actual",
            celda: (a) =>
              a.tallerActual ? (
                <Link
                  className="font-medium text-navy-800 hover:underline"
                  to="/taller/$id"
                  params={{ id: a.tallerActual.id }}
                >
                  {a.tallerActual.nombre}
                </Link>
              ) : (
                <span className="text-xs text-grafito-600">Disponible</span>
              ),
          },
          {
            encabezado: "Estado",
            celda: (a) => (
              <StatusBadge
                estado={a.activo ? "ACTIVO" : "INACTIVO"}
                etiqueta={a.activo ? "Activo" : "Inactivo"}
              />
            ),
          },
          {
            encabezado: "Acciones",
            clase: "text-right",
            celda: (a) => <Acciones asesor={a} onEditar={() => setEditando(a)} />,
          },
        ]}
        filas={items}
      />
      {editando && <EditarAsesorDialogo asesor={editando} onCerrar={() => setEditando(null)} />}
    </AppShell>
  );
}

function Acciones({ asesor, onEditar }: { asesor: AsesorDTO; onEditar: () => void }) {
  const avisar = useToast();
  const editar = useEditarAsesor();
  const nombre = `${asesor.nombres} ${asesor.apellidos}`;
  const bloqueado = asesor.activo && asesor.tallerActual !== null;
  const motivo = bloqueado
    ? `Tiene un taller activo (${asesor.tallerActual?.nombre}): ciérralo o cambia de asesor primero`
    : null;

  async function alternar(): Promise<void> {
    try {
      await editar.mutateAsync({ id: asesor.id, cambios: { activo: !asesor.activo } });
      avisar(asesor.activo ? `${nombre} desactivado` : `${nombre} activado`);
    } catch (e) {
      avisar(e instanceof Error ? e.message : "No se pudo cambiar el estado", "error");
    }
  }

  return (
    <span className="flex justify-end gap-1.5">
      <Link
        aria-label={`Ver el perfil de ${nombre}`}
        className={botonClases({ variante: "contorno", tamano: "sm" })}
        to="/asesores/$id"
        params={{ id: asesor.id }}
      >
        Ver perfil
      </Link>
      <Button
        aria-label={`Editar los datos de ${nombre}`}
        tamano="sm"
        variante="contorno"
        onClick={onEditar}
        type="button"
      >
        <Pencil size={13} />
      </Button>
      {motivo ? (
        // aria-disabled (no `disabled`): el botón sigue enfocable y el tooltip
        // muestra el motivo también con teclado (§15).
        <Tooltip texto={motivo}>
          <Button
            aria-disabled="true"
            aria-label={`Desactivar a ${nombre}: no disponible. ${motivo}`}
            className="cursor-not-allowed opacity-55"
            tamano="sm"
            variante="fantasma"
            type="button"
          >
            Desactivar
          </Button>
        </Tooltip>
      ) : (
        <Button
          aria-label={`${asesor.activo ? "Desactivar" : "Activar"} a ${nombre}`}
          tamano="sm"
          variante={asesor.activo ? "fantasma" : "contorno"}
          disabled={editar.isPending}
          onClick={() => void alternar()}
          type="button"
        >
          {asesor.activo ? "Desactivar" : "Activar"}
        </Button>
      )}
    </span>
  );
}

function CamposPersonales({
  f,
  setF,
  errores,
  dniEditable,
  limpiarError,
}: {
  f: typeof VACIO;
  setF: (f: typeof VACIO) => void;
  errores: Campos;
  dniEditable: boolean;
  /** Al editar un campo su error deja de mostrarse (se revalida al guardar). */
  limpiarError: (campo: keyof Campos) => void;
}) {
  const cambiar = (campo: keyof typeof VACIO, valor: string) => {
    setF({ ...f, [campo]: valor });
    limpiarError(campo);
  };
  const grados = f.grado && !GRADOS.includes(f.grado) ? [...GRADOS, f.grado] : GRADOS;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Field
        etiqueta="DNI *"
        error={errores.dni}
        ayuda={dniEditable ? undefined : "El DNI identifica la cuenta y no se cambia"}
      >
        <input
          aria-label="DNI"
          className={cn(controlClase, "h-10", errores.dni && "border-red-400")}
          disabled={!dniEditable}
          inputMode="numeric"
          maxLength={8}
          value={f.dni}
          onChange={(e) => cambiar("dni", e.target.value.replace(/\D/g, ""))}
        />
      </Field>
      <Field etiqueta="Nombres *" error={errores.nombres}>
        <input
          aria-label="Nombres"
          className={cn(controlClase, "h-10", errores.nombres && "border-red-400")}
          value={f.nombres}
          onChange={(e) => cambiar("nombres", e.target.value)}
        />
      </Field>
      <Field etiqueta="Apellidos *" error={errores.apellidos}>
        <input
          aria-label="Apellidos"
          className={cn(controlClase, "h-10", errores.apellidos && "border-red-400")}
          value={f.apellidos}
          onChange={(e) => cambiar("apellidos", e.target.value)}
        />
      </Field>
      <Field etiqueta="Correo institucional *" error={errores.email}>
        <input
          aria-label="Correo institucional"
          className={cn(controlClase, "h-10", errores.email && "border-red-400")}
          placeholder="nombre@unsa.edu.pe"
          type="email"
          value={f.email}
          onChange={(e) => cambiar("email", e.target.value)}
        />
      </Field>
      <Field etiqueta="Teléfono" error={errores.telefono}>
        <input
          aria-label="Teléfono"
          className={cn(controlClase, "h-10", errores.telefono && "border-red-400")}
          inputMode="tel"
          value={f.telefono}
          onChange={(e) => cambiar("telefono", e.target.value)}
        />
      </Field>
      <Select label="GRADO" value={f.grado} onChange={(grado) => cambiar("grado", grado)}>
        <option value="">Sin grado</option>
        {grados.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </Select>
    </div>
  );
}

function NuevoAsesorCard({ onCerrar }: { onCerrar: () => void }) {
  const avisar = useToast();
  const crear = useCrearAsesor();
  const [f, setF] = useState(VACIO);
  const [especialidades, setEspecialidades] = useState<string[]>([]);
  const [errores, setErrores] = useState<Campos>({});

  async function guardar(): Promise<void> {
    const locales = validar(f, true);
    setErrores(locales);
    if (Object.keys(locales).length > 0) return;
    try {
      const a = await crear.mutateAsync({
        dni: f.dni.trim(),
        nombres: f.nombres,
        apellidos: f.apellidos,
        email: f.email,
        telefono: f.telefono.trim() === "" ? null : f.telefono,
        grado: f.grado === "" ? null : f.grado,
        especialidades,
      });
      avisar(`Asesor registrado. Le enviamos su acceso a ${a.email}`);
      onCerrar();
    } catch (e) {
      setErrores(camposDeError(e));
      avisar(e instanceof Error ? e.message : "No se pudo registrar", "error");
    }
  }

  return (
    <Card>
      <CardEncabezado
        titulo="Nuevo asesor"
        descripcion="Se le asigna el rol Asesor y recibe en su correo el enlace para crear su clave."
      />
      <div className="space-y-4 p-4 md:p-5">
        <CamposPersonales
          f={f}
          setF={setF}
          errores={errores}
          dniEditable
          limpiarError={(c) => setErrores((e) => ({ ...e, [c]: undefined }))}
        />
        <div>
          <p className="mb-1 text-[11px] font-bold tracking-wider text-grafito-600 uppercase">
            Especialidades
          </p>
          <EspecialidadesInput
            etiquetas={especialidades.map((n) => ({ clave: n, nombre: n }))}
            onAgregar={(n) => {
              setEspecialidades((xs) => [...xs, n]);
              return true;
            }}
            onQuitar={(n) => setEspecialidades((xs) => xs.filter((x) => x !== n))}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variante="contorno" onClick={onCerrar} type="button">
            Cancelar
          </Button>
          <Button
            variante="oscuro"
            disabled={crear.isPending}
            onClick={() => void guardar()}
            type="button"
          >
            Guardar asesor
          </Button>
        </div>
      </div>
    </Card>
  );
}

function EditarAsesorDialogo({ asesor, onCerrar }: { asesor: AsesorDTO; onCerrar: () => void }) {
  const avisar = useToast();
  const editar = useEditarAsesor();
  const [f, setF] = useState({
    dni: asesor.dni,
    nombres: asesor.nombres,
    apellidos: asesor.apellidos,
    email: asesor.email,
    telefono: asesor.telefono ?? "",
    grado: asesor.grado ?? "",
  });
  const [errores, setErrores] = useState<Campos>({});

  async function guardar(): Promise<void> {
    const locales = validar(f, false);
    setErrores(locales);
    if (Object.keys(locales).length > 0) return;
    try {
      await editar.mutateAsync({
        id: asesor.id,
        cambios: {
          nombres: f.nombres,
          apellidos: f.apellidos,
          email: f.email,
          telefono: f.telefono.trim() === "" ? null : f.telefono,
          grado: f.grado === "" ? null : f.grado,
        },
      });
      avisar("Datos del asesor actualizados");
      onCerrar();
    } catch (e) {
      setErrores(camposDeError(e));
      avisar(e instanceof Error ? e.message : "No se pudo guardar", "error");
    }
  }

  return (
    <Dialogo
      abierto
      onAbierto={(v) => {
        if (!v) onCerrar();
      }}
      titulo={`Editar a ${asesor.nombres} ${asesor.apellidos}`}
      descripcion="Datos personales del asesor. Las especialidades y archivos se editan en su perfil."
      ancho="max-w-3xl"
    >
      <div className="mt-4 space-y-4">
        <CamposPersonales
          f={f}
          setF={setF}
          errores={errores}
          dniEditable={false}
          limpiarError={(c) => setErrores((e) => ({ ...e, [c]: undefined }))}
        />
        <div className="flex justify-end gap-2">
          <Button variante="contorno" onClick={onCerrar} type="button">
            Cancelar
          </Button>
          <Button
            variante="oscuro"
            disabled={editar.isPending}
            onClick={() => void guardar()}
            type="button"
          >
            Guardar cambios
          </Button>
        </div>
      </div>
    </Dialogo>
  );
}
