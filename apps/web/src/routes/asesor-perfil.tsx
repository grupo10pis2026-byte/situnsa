import { Link } from "@tanstack/react-router";
import { ArrowLeft, Download, Eye, FileText, Star, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import {
  archivoAsesorUrl,
  type OperacionPerfil,
  type PerfilAsesorDTO,
  useEditarPerfilAsesor,
  usePerfilAsesor,
} from "../api/asesores.js";
import { abrirArchivoProtegido, descargarArchivoProtegido } from "../api/expedientes.js";
import { EspecialidadesInput } from "../components/domain/especialidades-input.js";
import { AppShell } from "../components/layout/app-shell.js";
import { Button, botonClases } from "../components/ui/button.js";
import { Card, CardEncabezado } from "../components/ui/card.js";
import { ConfirmDialog } from "../components/ui/confirm-dialog.js";
import { EmptyState } from "../components/ui/empty-state.js";
import { PageHeader } from "../components/ui/page-header.js";
import { StatusBadge } from "../components/ui/status-badge.js";
import { useToast } from "../components/ui/toast.js";

/**
 * P10 Perfil del asesor (spec v1.0 §9): estado calculado, especialidades,
 * archivos (CV y otros), historial de talleres y encuestas. Lo llena la
 * Secretaría del Taller; los datos personales se editan en P15.
 */

const MAX_MB = 10;

function tamano(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-PE", { timeZone: "America/Lima" });
}

export function AsesorPerfilPage({ id }: { id: string }) {
  const perfil = usePerfilAsesor(id);
  const editar = useEditarPerfilAsesor(id);
  const avisar = useToast();

  async function ejecutar(op: OperacionPerfil, ok: string): Promise<boolean> {
    try {
      await editar.mutateAsync(op);
      avisar(ok);
      return true;
    } catch (e) {
      avisar(e instanceof Error ? e.message : "No se pudo guardar", "error");
      return false;
    }
  }

  if (perfil.isPending)
    return (
      <AppShell activo="/asesores">
        <p className="text-sm text-grafito-600">Cargando…</p>
      </AppShell>
    );
  if (perfil.isError)
    return (
      <AppShell activo="/asesores">
        <EmptyState
          titulo="No se pudo cargar el perfil"
          descripcion={perfil.error instanceof Error ? perfil.error.message : "Error inesperado"}
        />
      </AppShell>
    );

  const { asesor } = perfil.data;
  const nombre = `${asesor.grado ? `${asesor.grado} ` : ""}${asesor.nombres} ${asesor.apellidos}`;

  return (
    <AppShell activo="/asesores">
      <PageHeader
        titulo={nombre}
        descripcion="Perfil del asesor · lo llena la Secretaría del Taller. Los datos personales se editan en la lista de asesores."
        migas={[{ etiqueta: "Asesores", href: "/asesores" }, { etiqueta: "Perfil" }]}
        insignia={
          <span className="flex flex-wrap gap-1.5">
            {asesor.tallerActual ? (
              <StatusBadge
                estado="EN_CURSO"
                etiqueta={`Con taller activo: ${asesor.tallerActual.nombre}`}
              />
            ) : (
              <StatusBadge estado="ACTIVO" etiqueta="Disponible" />
            )}
            {!asesor.activo && <StatusBadge estado="INACTIVO" etiqueta="Inactivo" />}
          </span>
        }
        acciones={
          <Link className={botonClases({ variante: "contorno" })} to="/asesores">
            <ArrowLeft size={15} />
            Volver
          </Link>
        }
      />
      <p className="text-sm text-grafito-600">
        DNI {asesor.dni} · {asesor.email}
        {asesor.telefono ? ` · ${asesor.telefono}` : ""}
      </p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardEncabezado
            titulo="Especialidades"
            descripcion="Escribe una nueva o elige una existente. Al crear un taller se muestran las especialidades del asesor."
          />
          <div className="p-4 md:p-5">
            <EspecialidadesInput
              etiquetas={asesor.especialidades.map((e) => ({ clave: e.id, nombre: e.nombre }))}
              ocupado={editar.isPending}
              onAgregar={(n) =>
                ejecutar({ tipo: "agregarEspecialidad", nombre: n }, `Especialidad "${n}" agregada`)
              }
              onQuitar={(clave) =>
                void ejecutar(
                  { tipo: "quitarEspecialidad", especialidadId: clave },
                  "Especialidad quitada",
                )
              }
            />
          </div>
        </Card>
        <HistorialCard historial={perfil.data.historial} />
        <ArchivosCard
          asesorId={id}
          archivos={perfil.data.archivos}
          ocupado={editar.isPending}
          ejecutar={ejecutar}
        />
        <EncuestasCard encuesta={perfil.data.encuesta} />
      </div>
    </AppShell>
  );
}

function HistorialCard({ historial }: { historial: PerfilAsesorDTO["historial"] }) {
  return (
    <Card>
      <CardEncabezado titulo="Historial de talleres" />
      <div className="p-4 md:p-5">
        {historial.length === 0 ? (
          <p className="text-xs text-grafito-600">Aún no ha tenido talleres.</p>
        ) : (
          <ul className="divide-y divide-slate-200/70 rounded-lg border border-slate-200">
            {historial.map((t) => (
              <li
                key={t.id}
                className="grid grid-cols-[1fr_auto] items-center gap-2 px-3 py-2 text-sm sm:grid-cols-[1fr_90px_110px_auto]"
              >
                <Link
                  className="font-medium text-navy-800 hover:underline"
                  to="/taller/$id"
                  params={{ id: t.id }}
                >
                  {t.nombre}
                </Link>
                <span className="text-xs text-grafito-600">{t.periodo ?? "—"}</span>
                <span className="text-xs text-grafito-600">
                  {t.proyectos === 1 ? "1 proyecto" : `${t.proyectos} proyectos`}
                </span>
                <span>
                  <StatusBadge estado={t.estado} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function ArchivosCard({
  asesorId,
  archivos,
  ocupado,
  ejecutar,
}: {
  asesorId: string;
  archivos: PerfilAsesorDTO["archivos"];
  ocupado: boolean;
  ejecutar: (op: OperacionPerfil, ok: string) => Promise<boolean>;
}) {
  const avisar = useToast();
  const entrada = useRef<HTMLInputElement>(null);
  const [borrar, setBorrar] = useState<PerfilAsesorDTO["archivos"][number] | null>(null);

  async function abrir(archivoId: string, descargar: string | null): Promise<void> {
    try {
      const url = archivoAsesorUrl(asesorId, archivoId);
      if (descargar) await descargarArchivoProtegido(url, descargar);
      else await abrirArchivoProtegido(url);
    } catch (e) {
      avisar(e instanceof Error ? e.message : "No se pudo abrir el archivo", "error");
    }
  }

  function elegido(archivo: File | undefined): void {
    if (entrada.current) entrada.current.value = "";
    if (!archivo) return;
    if (archivo.type !== "application/pdf") {
      avisar("Solo se aceptan archivos PDF", "error");
      return;
    }
    if (archivo.size > MAX_MB * 1024 * 1024) {
      avisar(`El archivo pasa de ${MAX_MB} MB`, "error");
      return;
    }
    void ejecutar({ tipo: "subirArchivo", archivo }, `${archivo.name} subido`);
  }

  return (
    <Card>
      <CardEncabezado
        titulo="Archivos"
        descripcion={`CV, constancias y otros documentos (PDF de hasta ${MAX_MB} MB).`}
        accion={
          <>
            <input
              ref={entrada}
              accept="application/pdf"
              aria-label="Archivo PDF del asesor"
              className="hidden"
              type="file"
              onChange={(e) => elegido(e.target.files?.[0])}
            />
            <Button
              tamano="sm"
              variante="oscuro"
              disabled={ocupado}
              onClick={() => entrada.current?.click()}
              type="button"
            >
              <Upload size={14} />
              Subir archivo
            </Button>
          </>
        }
      />
      <div className="p-4 md:p-5">
        {archivos.length === 0 ? (
          <p className="text-xs text-grafito-600">Aún no hay archivos.</p>
        ) : (
          <ul className="divide-y divide-slate-200/70 rounded-lg border border-slate-200">
            {archivos.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <FileText size={16} className="shrink-0 text-navy-800" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{a.nombre}</span>
                  <span className="text-xs text-grafito-600">
                    {fecha(a.subidoEn)} · {tamano(a.bytes)}
                  </span>
                </span>
                <span className="flex gap-1">
                  <Button
                    aria-label={`Ver ${a.nombre}`}
                    tamano="xs"
                    variante="contorno"
                    onClick={() => void abrir(a.id, null)}
                    type="button"
                  >
                    <Eye size={13} />
                  </Button>
                  <Button
                    aria-label={`Descargar ${a.nombre}`}
                    tamano="xs"
                    variante="contorno"
                    onClick={() => void abrir(a.id, a.nombre)}
                    type="button"
                  >
                    <Download size={13} />
                  </Button>
                  <Button
                    aria-label={`Eliminar ${a.nombre}`}
                    tamano="xs"
                    variante="peligro"
                    disabled={ocupado}
                    onClick={() => setBorrar(a)}
                    type="button"
                  >
                    <Trash2 size={13} />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {borrar && (
        <ConfirmDialog
          titulo="Eliminar archivo"
          mensaje={`¿Eliminar «${borrar.nombre}» del perfil? Deja de mostrarse, pero queda registrado en el historial.`}
          confirmar="Eliminar"
          peligroso
          onConfirmar={() => {
            const a = borrar;
            setBorrar(null);
            void ejecutar({ tipo: "eliminarArchivo", archivoId: a.id }, `${a.nombre} eliminado`);
          }}
          onCancelar={() => setBorrar(null)}
        />
      )}
    </Card>
  );
}

function EncuestasCard({ encuesta }: { encuesta: PerfilAsesorDTO["encuesta"] }) {
  return (
    <Card>
      <CardEncabezado
        titulo="Encuestas de satisfacción"
        descripcion="Anónimas: nunca se muestra quién respondió."
      />
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 md:p-5">
        {encuesta.promedio !== null ? (
          <p className="flex items-center gap-2 text-sm">
            <Star size={16} className="text-dorado-500" />
            <span>
              Puntaje <strong>{encuesta.promedio.toFixed(1)} / 5</strong> · {encuesta.respuestas}{" "}
              respuestas
            </span>
          </p>
        ) : (
          <p className="text-sm text-grafito-600">
            {encuesta.respuestas === 0
              ? "Aún no hay respuestas."
              : `${encuesta.respuestas} respuestas: se muestran desde ${encuesta.minimo}.`}
          </p>
        )}
        <Button
          tamano="sm"
          variante="contorno"
          disabled
          title="Los resultados por pregunta estarán disponibles con el módulo de encuestas"
          type="button"
        >
          Ver resultados
        </Button>
      </div>
    </Card>
  );
}
