import { Link, useNavigate } from "@tanstack/react-router";
import {
  ClipboardCheck,
  FilePlus,
  GraduationCap,
  Inbox,
  LayoutList,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
  Users,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { useSession } from "../../api/session.js";
import { cn } from "../../utils/cn.js";
import { BuscadorGlobal } from "./buscador-global.js";

interface Item {
  to: string;
  etiqueta: string;
  icono: ReactNode;
}

function navPorRol(rol: string | undefined): Item[] {
  if (rol === "TESISTA") {
    return [
      { to: "/mi-tramite", etiqueta: "Mi Trámite", icono: <LayoutList size={18} /> },
      { to: "/mi-taller", etiqueta: "Mi Taller", icono: <GraduationCap size={18} /> },
      { to: "/mis-pagos", etiqueta: "Mis Pagos", icono: <ClipboardCheck size={18} /> },
    ];
  }
  if (rol === "ASESOR" || rol === "JURADO") {
    return [
      { to: "/asesor", etiqueta: "Mis Alumnos", icono: <GraduationCap size={18} /> },
      { to: "/mis-talleres", etiqueta: "Mis Talleres", icono: <LayoutList size={18} /> },
    ];
  }
  return [
    { to: "/solicitudes", etiqueta: "Bandeja de Solicitudes", icono: <Inbox size={18} /> },
    { to: "/admin", etiqueta: "Listado de Expedientes", icono: <LayoutList size={18} /> },
    { to: "/expedientes/nuevo", etiqueta: "Nuevo Expediente", icono: <FilePlus size={18} /> },
    { to: "/inscripciones", etiqueta: "Validación", icono: <ClipboardCheck size={18} /> },
    { to: "/talleres", etiqueta: "Taller de Tesis", icono: <GraduationCap size={18} /> },
    { to: "/pagos-taller", etiqueta: "Pagos Taller", icono: <ClipboardCheck size={18} /> },
    { to: "/asesores", etiqueta: "Asesores", icono: <Users size={18} /> },
    // HU-0052: el proceso configurable es solo de administración del sistema.
    ...(rol === "ADMIN_FIPS"
      ? [{ to: "/configuracion", etiqueta: "Configuración", icono: <Settings2 size={18} /> }]
      : []),
  ];
}

/** AppShell §14.1: sidebar navy fijo + colapsable, drawer en móvil. */
export function AppShell({ children, activo }: { children: ReactNode; activo: string }) {
  const { sesion, salir } = useSession();
  const navigate = useNavigate();
  const [colapsado, setColapsado] = useState(
    () => localStorage.getItem("pis-sidebar") === "colapsado",
  );
  const [abierto, setAbierto] = useState(false);

  if (!sesion) {
    return (
      <main className="mx-auto max-w-md p-8 text-center">
        <p className="text-sm text-grafito-600">Debes iniciar sesión.</p>
        <Link className="text-sm text-navy-800 underline" to="/login">
          Ir al login
        </Link>
      </main>
    );
  }

  function alternar(): void {
    setColapsado((v) => {
      localStorage.setItem("pis-sidebar", v ? "expandido" : "colapsado");
      return !v;
    });
  }

  function cerrarSesion(): void {
    salir();
    void navigate({ to: "/login" });
  }

  const items = navPorRol(sesion.rol);
  const iniciales = sesion.nombres
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  const marca = (
    <>
      <p className="text-sm font-bold tracking-wide">SISTEMA DE TITULACIÓN</p>
      {!colapsado && <p className="text-xs text-navy-100">Segunda Especialidad - FIPS UNSA</p>}
    </>
  );

  return (
    <div className="min-h-screen bg-[#eef1f4] md:flex">
      {abierto && (
        <button
          aria-label="Cerrar menú"
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setAbierto(false)}
          type="button"
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-navy-950 text-white shadow-xl transition-all duration-150 print:hidden",
          "md:sticky md:top-0 md:h-screen md:shadow-none",
          colapsado && "md:w-16",
          !colapsado && "md:w-60",
          abierto ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-white/10 p-4">
          <div className={cn("min-w-0", colapsado && "md:hidden")}>{marca}</div>
          <button
            aria-label={colapsado ? "Expandir menú" : "Colapsar menú"}
            className="hidden rounded p-1.5 hover:bg-white/10 md:block"
            onClick={alternar}
            type="button"
          >
            {colapsado ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          <button
            aria-label="Cerrar menú"
            className="rounded p-1.5 hover:bg-white/10 md:hidden"
            onClick={() => setAbierto(false)}
            type="button"
          >
            <X size={18} />
          </button>
        </div>
        <div className={cn("px-2 pt-2", colapsado && "md:hidden")}>
          <BuscadorGlobal />
        </div>
        <nav className="flex gap-1 overflow-x-auto p-2 md:flex-col" aria-label="Menú principal">
          {items.map((i) => {
            const esActivo = activo === i.to;
            return (
              <Link
                className={cn(
                  "relative flex items-center gap-3 whitespace-nowrap rounded-md px-3 py-2.5 text-sm transition-colors",
                  esActivo
                    ? "bg-white/10 font-semibold"
                    : "text-white/80 hover:bg-white/5 hover:text-white",
                  colapsado && "md:justify-center md:px-0",
                )}
                key={i.to}
                title={i.etiqueta}
                to={i.to}
                onClick={() => setAbierto(false)}
              >
                {esActivo && (
                  <span
                    className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r bg-dorado-500"
                    aria-hidden
                  />
                )}
                <span className="shrink-0">{i.icono}</span>
                <span className={cn(colapsado && "md:hidden")}>{i.etiqueta}</span>
              </Link>
            );
          })}
        </nav>
        <div
          className={cn("mt-auto border-t border-white/10 p-3", colapsado && "md:hidden")}
          title={`${sesion.nombres} · DNI ${sesion.dni}`}
        >
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-dorado-500 text-xs font-bold text-navy-950"
              aria-hidden
            >
              {iniciales}
            </span>
            <span className="min-w-0 text-xs">
              <span className="block truncate font-semibold text-white">{sesion.nombres}</span>
              <span className="block truncate text-navy-100">
                DNI {sesion.dni} · {sesion.rol.replace("_", " ")}
              </span>
            </span>
          </div>
          <button
            className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-md bg-white/10 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/15 active:bg-white/20"
            onClick={cerrarSesion}
            type="button"
          >
            <LogOut size={14} />
            Cerrar sesión
          </button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        {/* Solo móvil: en desktop la identidad vive en el sidebar (sin duplicar). */}
        <div className="sticky top-0 z-30 flex items-center gap-2 border-b border-slate-200 bg-white/90 px-3 py-2 backdrop-blur md:hidden">
          <button
            aria-label="Abrir menú"
            className="rounded p-1.5 hover:bg-slate-100"
            onClick={() => setAbierto(true)}
            type="button"
          >
            <Menu size={20} />
          </button>
          <p className="truncate text-sm font-bold text-navy-950">SITUNSA · FIPS</p>
          <span
            className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-950 text-[11px] font-bold text-white"
            aria-hidden
          >
            {iniciales}
          </span>
          <button
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            className="rounded p-1.5 text-navy-800 hover:bg-slate-100"
            onClick={cerrarSesion}
            type="button"
          >
            <LogOut size={18} />
          </button>
        </div>
        <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">{children}</div>
      </div>
    </div>
  );
}
