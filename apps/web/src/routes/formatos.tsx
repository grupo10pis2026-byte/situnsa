import type {
  EditarFormatoResultadoDTO,
  EtapaFormato,
  FormatoDTO,
  FormatoVersionDTO,
  ReemplazoFormato,
  SubirFormatoResultadoDTO,
} from "@pis/contracts";
import {
  AlertTriangle,
  Download,
  Eye,
  FilePlus,
  FileText,
  History,
  Pencil,
  Plus,
  Replace,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { useMemo, useState } from "react";
import { ApiError } from "../api/errores.js";
import { descargarArchivoProtegido } from "../api/expedientes.js";
import {
  formatoVigenteUrl,
  formatoVistaPreviaUrl,
  useActivarVersion,
  useActualizarFormato,
  useAgregarFormato,
  useEditarFormato,
  useEliminarFormato,
  useFormatos,
  useReactivarFormato,
  useRestaurarBase,
  useSubirFormato,
  useVersionesFormato,
  versionFormatoUrl,
  versionVistaPreviaUrl,
} from "../api/formatos.js";
import { ModalVisorDocumento } from "../components/domain/modal-visor-documento.js";
import { AppShell } from "../components/layout/app-shell.js";
import { Button } from "../components/ui/button.js";
import { Card, CardEncabezado } from "../components/ui/card.js";
import { ConfirmDialog } from "../components/ui/confirm-dialog.js";
import { DataTable } from "../components/ui/data-table.js";
import { Dialogo } from "../components/ui/dialog.js";
import { EmptyState } from "../components/ui/empty-state.js";
import { controlClase, Field } from "../components/ui/field.js";
import { PageHeader } from "../components/ui/page-header.js";
import { Select } from "../components/ui/select.js";
import { StatusBadge } from "../components/ui/status-badge.js";
import { Tab, TabPanel, Tabs, TabsLista } from "../components/ui/tabs.js";
import { useToast } from "../components/ui/toast.js";

type Fila = FormatoDTO & { id: string };

/** Lo que muestra el visor: PDF de la plantilla (etiquetas visibles) + su Word. */
interface VistaPrevia {
  titulo: string;
  subtitulo: string;
  pdfUrl: string;
  docxUrl: string;
  nombre: string;
  version: number | null;
}

function etiquetaVariante(f: Pick<FormatoDTO, "variante">): string {
  return f.variante === 1 ? "1 tesista" : "2 tesistas";
}

const ETAPAS: Array<{ etapa: EtapaFormato; titulo: string; corto: string }> = [
  { etapa: "E1", titulo: "Etapa 01 · Plan", corto: "Etapa 01" },
  { etapa: "E2", titulo: "Etapa 02 · Borrador y sustentación", corto: "Etapa 02" },
  { etapa: "MP", titulo: "Mesa de Partes · Formatos para el postulante", corto: "Mesa de Partes" },
];

function etiquetaEtapa(etapa: EtapaFormato): string {
  return ETAPAS.find((e) => e.etapa === etapa)?.corto ?? etapa;
}

/** Mesa de Partes = formatos en blanco que descarga el postulante (no se generan). */
function esMesaDePartes(f: Pick<FormatoDTO, "etapa">): boolean {
  return f.etapa === "MP";
}

function aEtapa(v: string): EtapaFormato {
  return ETAPAS.find((e) => e.etapa === v)?.etapa ?? "E1";
}

/** Vista previa de la plantilla vigente de un formato (versión activa o base). */
function previaVigente(f: FormatoDTO): VistaPrevia {
  return {
    titulo: f.nombre,
    subtitulo: `${etiquetaVariante(f)} · ${
      f.versionActiva ? `Versión ${f.versionActiva.version} en uso` : "Plantilla base del sistema"
    } · ${
      esMesaDePartes(f)
        ? "se entrega en blanco al postulante en la Mesa de Partes"
        : "las etiquetas <<CAMPO>> se rellenan al generar"
    }`,
    pdfUrl: formatoVistaPreviaUrl(f),
    docxUrl: formatoVigenteUrl(f),
    nombre: f.archivoBase.replace(/\.docx$/i, ""),
    version: f.versionActiva?.version ?? null,
  };
}

function VisorFormato({ previa, onCerrar }: { previa: VistaPrevia; onCerrar: () => void }) {
  return (
    <ModalVisorDocumento
      abierto
      documentoUrl={previa.pdfUrl}
      formatoUrl={previa.docxUrl}
      nombreDocx={`${previa.nombre}.docx`}
      nombrePdf={`${previa.nombre}.pdf`}
      onCerrar={onCerrar}
      subtitulo={previa.subtitulo}
      titulo={`Vista previa: ${previa.titulo}`}
      version={previa.version}
    />
  );
}

function fecha(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Gestión de formatos: el área reemplaza las plantillas DOCX institucionales
 * (por ejemplo, al cambiar el año o el reglamento) sin esperar un despliegue,
 * y organiza los formatos por etapa en cada variante (1|2 tesistas): agrega
 * formatos nuevos a la Etapa 01 o 02 y mueve cualquiera de etapa. La sección
 * Mesa de Partes guarda los formatos en blanco que ofrece el wizard público.
 */
export function FormatosPage() {
  const formatos = useFormatos();
  const [variante, setVariante] = useState("1");
  const [busqueda, setBusqueda] = useState("");
  const [subir, setSubir] = useState<FormatoDTO | null>(null);
  const [editar, setEditar] = useState<FormatoDTO | null>(null);
  const [historial, setHistorial] = useState<FormatoDTO | null>(null);
  const [previa, setPrevia] = useState<VistaPrevia | null>(null);
  const [agregarEn, setAgregarEn] = useState<{ variante: number; etapa: EtapaFormato } | null>(
    null,
  );
  const [renombrar, setRenombrar] = useState<FormatoDTO | null>(null);
  const [quitar, setQuitar] = useState<FormatoDTO | null>(null);
  const eliminar = useEliminarFormato();
  const reactivar = useReactivarFormato();
  const avisar = useToast();

  const filas = useMemo<Fila[]>(() => {
    const q = busqueda.trim().toLowerCase();
    return (formatos.data?.formatos ?? [])
      .filter((f) => String(f.variante) === variante)
      .filter(
        (f) => !q || f.nombre.toLowerCase().includes(q) || f.archivoBase.toLowerCase().includes(q),
      )
      .map((f) => ({ ...f, id: `${f.variante}:${f.tipo}` }));
  }, [formatos.data, variante, busqueda]);

  const personalizados = (formatos.data?.formatos ?? []).filter(
    (f) => f.origen === "PERSONALIZADO" && !f.archivado,
  ).length;

  async function confirmarQuitar() {
    const f = quitar;
    setQuitar(null);
    if (!f) return;
    try {
      await eliminar.mutateAsync(f);
      avisar(`Se eliminó «${f.nombre}» de ${etiquetaVariante(f)}`);
    } catch (e) {
      avisar(e instanceof Error ? e.message : "No se pudo eliminar el formato", "error");
    }
  }

  async function restaurar(f: FormatoDTO) {
    try {
      await reactivar.mutateAsync(f);
      avisar(`Se restauró «${f.nombre}» en la ${etiquetaEtapa(f.etapa)}`);
    } catch (e) {
      avisar(e instanceof Error ? e.message : "No se pudo restaurar el formato", "error");
    }
  }

  async function descargar(f: FormatoDTO) {
    try {
      await descargarArchivoProtegido(formatoVigenteUrl(f), f.archivoBase);
    } catch (e) {
      avisar(e instanceof Error ? e.message : "No se pudo descargar", "error");
    }
  }

  const columnas = [
    {
      encabezado: "Formato",
      celda: (f: Fila) => (
        <div className="min-w-0 space-y-1">
          <p className="font-semibold text-navy-950">{f.nombre}</p>
          <p className="truncate text-xs text-grafito-600">{f.archivoBase}</p>
          {f.agregado && <StatusBadge estado="NUEVA" etiqueta="Agregado por el área" />}
        </div>
      ),
    },
    {
      encabezado: "Plantilla vigente",
      celda: (f: Fila) =>
        !f.disponible ? (
          <StatusBadge estado="PENDIENTE" etiqueta="Falta subir el archivo" />
        ) : f.versionActiva ? (
          <div className="space-y-1">
            <StatusBadge estado="VALIDADO" etiqueta={`Versión ${f.versionActiva.version}`} />
            <p className="text-xs text-grafito-600">
              {fecha(f.versionActiva.createdAt)}
              {f.versionActiva.creadoPor ? ` · ${f.versionActiva.creadoPor}` : ""}
            </p>
          </div>
        ) : (
          <StatusBadge estado="REGISTRADO" etiqueta="Base del sistema" />
        ),
    },
    {
      encabezado: "Avisos",
      celda: (f: Fila) => {
        const n = f.versionActiva?.advertencias.length ?? 0;
        return n > 0 ? (
          <button
            className="inline-flex items-center gap-1 text-xs font-semibold text-aviso-800 hover:underline"
            onClick={() => setHistorial(f)}
            type="button"
          >
            <AlertTriangle size={14} /> {n} aviso{n > 1 ? "s" : ""}
          </button>
        ) : (
          <span className="text-xs text-grafito-600">—</span>
        );
      },
    },
    {
      encabezado: "Acciones",
      clase: "text-right",
      celda: (f: Fila) => (
        <div className="flex flex-wrap justify-end gap-1.5">
          {f.agregado && (
            <Button
              aria-label={`Renombrar ${f.nombre}`}
              onClick={() => setRenombrar(f)}
              tamano="sm"
              title="Renombrar formato"
              variante="fantasma"
            >
              <Pencil size={14} />
            </Button>
          )}
          <Button
            aria-label={`Eliminar ${f.nombre}`}
            onClick={() => setQuitar(f)}
            tamano="sm"
            title="Eliminar formato"
            variante="fantasma"
          >
            <Trash2 size={14} />
          </Button>
          <Button
            aria-label={`Vista previa de ${f.nombre}`}
            disabled={!f.disponible}
            onClick={() => setPrevia(previaVigente(f))}
            tamano="sm"
            title="Ver la plantilla vigente"
            variante="fantasma"
          >
            <Eye size={14} />
          </Button>
          <Button
            aria-label={`Descargar ${f.nombre}`}
            disabled={!f.disponible}
            onClick={() => void descargar(f)}
            tamano="sm"
            title="Descargar la plantilla vigente"
            variante="fantasma"
          >
            <Download size={14} />
          </Button>
          <Button onClick={() => setHistorial(f)} tamano="sm" variante="fantasma">
            <History size={14} />
            {f.totalVersiones > 0 ? f.totalVersiones : ""}
          </Button>
          <Button
            disabled={!f.disponible}
            onClick={() => setEditar(f)}
            tamano="sm"
            title="Buscar y reemplazar texto en la plantilla vigente"
            variante="contorno"
          >
            <Replace size={14} /> Editar texto
          </Button>
          <Button onClick={() => setSubir(f)} tamano="sm" variante="contorno">
            <Upload size={14} /> {f.disponible ? "Subir versión" : "Subir formato"}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <AppShell activo="/formatos">
      <PageHeader
        titulo="Gestión de formatos"
        descripcion="Plantillas Word que usa «Insertar datos en documentos», agrupadas por etapa para 1 y 2 tesistas, y los formatos en blanco que el postulante descarga en la Mesa de Partes. Puede agregar formatos nuevos, eliminarlos y subir versiones; las anteriores quedan en el historial."
        migas={[{ etiqueta: "Inicio", href: "/admin" }, { etiqueta: "Gestión de formatos" }]}
        insignia={
          personalizados > 0 ? (
            <StatusBadge estado="VALIDADO" etiqueta={`${personalizados} personalizado(s)`} />
          ) : undefined
        }
      />
      {formatos.isError && (
        <EmptyState
          titulo="No se pudo cargar los formatos"
          {...(formatos.error instanceof Error ? { descripcion: formatos.error.message } : {})}
        />
      )}
      {!formatos.isError && (
        <Tabs className="space-y-4" onValueChange={setVariante} value={variante}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <TabsLista>
              <Tab value="1">1 tesista</Tab>
              <Tab value="2">2 tesistas</Tab>
            </TabsLista>
            <Field className="w-full max-w-xs" etiqueta="Buscar formato">
              <input
                className={controlClase}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Decreto, anexo 17, acta…"
                value={busqueda}
              />
            </Field>
          </div>
          {["1", "2"].map((v) => (
            <TabPanel className="space-y-4" key={v} value={v}>
              {ETAPAS.map(({ etapa, titulo }) => {
                const enEtapa = filas.filter((f) => f.etapa === etapa && !f.archivado);
                const eliminados = filas.filter((f) => f.etapa === etapa && f.archivado);
                return (
                  <Card key={etapa}>
                    <CardEncabezado
                      accion={
                        <Button
                          onClick={() => setAgregarEn({ variante: Number(v), etapa })}
                          tamano="sm"
                          variante="contorno"
                        >
                          <FilePlus size={14} /> Agregar formato
                        </Button>
                      }
                      descripcion={`${enEtapa.length} formato(s) · ${v === "1" ? "1 tesista" : "2 tesistas"}${
                        etapa === "MP"
                          ? " · el postulante los descarga, llena y adjunta en el wizard público (los que agregue el área son opcionales); no se generan con datos del expediente"
                          : ""
                      }`}
                      titulo={titulo}
                    />
                    <div className="p-3 md:p-4">
                      <DataTable
                        cargando={formatos.isPending}
                        columnas={columnas}
                        filas={enEtapa}
                        vacio="Sin formatos que coincidan"
                      />
                    </div>
                    {eliminados.length > 0 && (
                      <div className="space-y-2 border-t border-slate-200/80 px-4 py-3 md:px-5">
                        <p className="text-xs font-semibold text-grafito-600">
                          Formatos eliminados ({eliminados.length}):{" "}
                          {etapa === "MP"
                            ? "no se ofrecen en la Mesa de Partes"
                            : "no se generan en los expedientes"}
                        </p>
                        <ul className="space-y-1.5">
                          {eliminados.map((f) => (
                            <li
                              className="flex flex-wrap items-center justify-between gap-2 text-sm text-grafito-600"
                              key={f.id}
                            >
                              <span className="line-through">{f.nombre}</span>
                              <Button
                                disabled={reactivar.isPending}
                                onClick={() => void restaurar(f)}
                                tamano="xs"
                                variante="contorno"
                              >
                                <RotateCcw size={12} /> Restaurar
                              </Button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </Card>
                );
              })}
            </TabPanel>
          ))}
        </Tabs>
      )}
      {subir && <DialogoSubir formato={subir} onCerrar={() => setSubir(null)} />}
      {editar && <DialogoEditar formato={editar} onCerrar={() => setEditar(null)} />}
      {historial && <DialogoHistorial formato={historial} onCerrar={() => setHistorial(null)} />}
      {agregarEn && (
        <DialogoAgregar
          etapaInicial={agregarEn.etapa}
          onCerrar={() => setAgregarEn(null)}
          variante={agregarEn.variante}
        />
      )}
      {renombrar && <DialogoRenombrar formato={renombrar} onCerrar={() => setRenombrar(null)} />}
      {quitar && (
        <ConfirmDialog
          confirmar="Eliminar formato"
          mensaje={
            esMesaDePartes(quitar)
              ? `«${quitar.nombre}» dejará de ofrecerse en la Mesa de Partes para ${etiquetaVariante(quitar)}. Podrá restaurarlo desde la lista de eliminados.`
              : `«${quitar.nombre}» dejará de generarse en los expedientes de ${etiquetaVariante(quitar)}. Los documentos ya generados se conservan y podrá restaurarlo desde la lista de eliminados.`
          }
          onCancelar={() => setQuitar(null)}
          onConfirmar={() => void confirmarQuitar()}
          peligroso
          titulo="¿Eliminar este formato?"
        />
      )}
      {previa && <VisorFormato onCerrar={() => setPrevia(null)} previa={previa} />}
    </AppShell>
  );
}

function ListaAvisos({ avisos }: { avisos: readonly string[] }) {
  if (avisos.length === 0) return null;
  return (
    <ul className="space-y-1 rounded-lg border border-yellow-300 bg-aviso-100 p-3 text-xs text-aviso-800">
      {avisos.map((a) => (
        <li className="flex gap-1.5" key={a}>
          <AlertTriangle className="mt-0.5 shrink-0" size={13} />
          <span>{a}</span>
        </li>
      ))}
    </ul>
  );
}

function DialogoSubir({ formato, onCerrar }: { formato: FormatoDTO; onCerrar: () => void }) {
  const subir = useSubirFormato();
  const avisar = useToast();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [nota, setNota] = useState("");
  const [resultado, setResultado] = useState<SubirFormatoResultadoDTO | null>(null);

  async function enviar() {
    if (!archivo) return;
    try {
      const r = await subir.mutateAsync({
        variante: formato.variante,
        tipo: formato.tipo,
        file: archivo,
        nota,
      });
      setResultado(r);
      avisar(`Versión ${r.version.version} activa para «${formato.nombre}»`);
    } catch (e) {
      avisar(e instanceof Error ? e.message : "No se pudo subir el formato", "error");
    }
  }

  return (
    <Dialogo
      abierto
      ancho="max-w-lg"
      descripcion={`${formato.variante === 1 ? "1 tesista" : "2 tesistas"} · ${formato.archivoBase}`}
      onAbierto={(v) => !v && onCerrar()}
      titulo={resultado ? "Formato actualizado" : `Subir nueva versión: ${formato.nombre}`}
    >
      {resultado ? (
        <div className="space-y-3">
          <p className="text-sm text-grafito-900">
            {esMesaDePartes(formato)
              ? `La versión ${resultado.version.version} ya está activa: la Mesa de Partes la ofrece desde ahora a los postulantes.`
              : `La versión ${resultado.version.version} ya está activa. Los documentos que se generen desde ahora usarán esta plantilla (${resultado.version.etiquetas.length} etiqueta(s) detectada(s)).`}
          </p>
          <ListaAvisos avisos={resultado.version.advertencias} />
          <div className="flex justify-end">
            <Button onClick={onCerrar}>Listo</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {esMesaDePartes(formato) ? (
            <p className="text-xs text-grafito-600">
              Suba el formato en blanco tal como lo descargará el postulante en la Mesa de Partes.
              No se rellena con datos: no use etiquetas <code>{"<<CAMPO>>"}</code>.
            </p>
          ) : (
            <p className="text-xs text-grafito-600">
              Descargue la plantilla vigente, modifíquela en Word conservando las etiquetas{" "}
              <code>{"<<CAMPO>>"}</code> y súbala aquí. Si Word partió alguna etiqueta, el sistema
              la repara.
            </p>
          )}
          <Field etiqueta="Archivo Word (.docx)">
            <input
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className={controlClase}
              onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              type="file"
            />
          </Field>
          <Field ayuda="Opcional: qué cambió (ej. año 2027, nuevo reglamento)." etiqueta="Nota">
            <input
              className={controlClase}
              maxLength={500}
              onChange={(e) => setNota(e.target.value)}
              value={nota}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button onClick={onCerrar} variante="contorno">
              Cancelar
            </Button>
            <Button disabled={!archivo || subir.isPending} onClick={() => void enviar()}>
              <Upload size={16} /> {subir.isPending ? "Subiendo…" : "Subir y activar"}
            </Button>
          </div>
        </div>
      )}
    </Dialogo>
  );
}

const MAX_REEMPLAZOS = 20;
const NOMBRE_PARTE = { CUERPO: "Cuerpo", ENCABEZADO: "Encabezado", PIE: "Pie de página" } as const;

/**
 * Edición en línea: buscar y reemplazar texto en la plantilla vigente sin
 * salir del sistema. Primero se revisan las coincidencias (simulación) y
 * luego se crea una versión nueva activa; la anterior queda en el historial.
 */
function DialogoEditar({ formato, onCerrar }: { formato: FormatoDTO; onCerrar: () => void }) {
  const editar = useEditarFormato();
  const avisar = useToast();
  const [reemplazos, setReemplazos] = useState<ReemplazoFormato[]>([{ buscar: "", reemplazo: "" }]);
  const [nota, setNota] = useState("");
  const [simulacion, setSimulacion] = useState<EditarFormatoResultadoDTO | null>(null);
  const [resultado, setResultado] = useState<SubirFormatoResultadoDTO | null>(null);
  const versionBase = formato.versionActiva?.version ?? null;
  const completos = reemplazos.every((r) => r.buscar.trim().length > 0);
  const todosEncontrados = simulacion?.coincidencias.every((c) => c.total > 0) ?? false;

  function cambiar(i: number, campo: keyof ReemplazoFormato, valor: string) {
    setSimulacion(null);
    setReemplazos((rs) => rs.map((r, j) => (j === i ? { ...r, [campo]: valor } : r)));
  }

  function quitar(i: number) {
    setSimulacion(null);
    setReemplazos((rs) => rs.filter((_, j) => j !== i));
  }

  async function enviar(aplicar: boolean) {
    try {
      const r = await editar.mutateAsync({
        formato,
        cuerpo: { reemplazos, versionBase, aplicar, ...(nota.trim() ? { nota: nota.trim() } : {}) },
      });
      if (r.resultado) {
        setResultado(r.resultado);
        avisar(`Versión ${r.resultado.version.version} activa para «${formato.nombre}»`);
      } else {
        setSimulacion(r);
      }
    } catch (e) {
      avisar(e instanceof Error ? e.message : "No se pudo editar el formato", "error");
      if (e instanceof ApiError && e.status === 409) onCerrar();
    }
  }

  return (
    <Dialogo
      abierto
      ancho="max-w-2xl"
      descripcion={`${etiquetaVariante(formato)} · ${
        versionBase === null ? "Plantilla base del sistema" : `Versión ${versionBase}`
      }`}
      onAbierto={(v) => !v && onCerrar()}
      titulo={resultado ? "Formato actualizado" : `Editar texto: ${formato.nombre}`}
    >
      {resultado ? (
        <div className="space-y-3">
          <p className="text-sm text-grafito-900">
            La versión {resultado.version.version} ya está activa. Los documentos que se generen
            desde ahora usarán esta plantilla. Si algo no quedó bien, active la versión anterior
            desde el historial.
          </p>
          <ListaAvisos avisos={resultado.version.advertencias} />
          <div className="flex justify-end">
            <Button onClick={onCerrar}>Listo</Button>
          </div>
        </div>
      ) : (
        <div className="max-h-[70vh] space-y-3 overflow-y-auto">
          <p className="text-xs text-grafito-600">
            Escriba el texto tal como aparece en la plantilla (distingue mayúsculas). Para que el
            sistema lo complete, reemplácelo por una etiqueta: por ejemplo{" "}
            <code>-2026-USE-FIPS</code> → <code>{"-<<ANIO>>-USE-FIPS"}</code>. Solo cambia el texto:
            conserva el formato del lugar donde empieza la coincidencia.
          </p>
          {reemplazos.map((r, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: filas editables sin id propio
            <div className="flex items-end gap-2" key={i}>
              <Field className="flex-1" etiqueta="Buscar">
                <input
                  className={controlClase}
                  maxLength={500}
                  onChange={(e) => cambiar(i, "buscar", e.target.value)}
                  placeholder="Texto actual"
                  value={r.buscar}
                />
              </Field>
              <Field className="flex-1" etiqueta="Reemplazar por">
                <input
                  className={controlClase}
                  maxLength={500}
                  onChange={(e) => cambiar(i, "reemplazo", e.target.value)}
                  placeholder="Texto nuevo o <<ETIQUETA>>"
                  value={r.reemplazo}
                />
              </Field>
              {reemplazos.length > 1 && (
                <Button
                  aria-label="Quitar reemplazo"
                  onClick={() => quitar(i)}
                  tamano="icono"
                  variante="fantasma"
                >
                  <Trash2 size={14} />
                </Button>
              )}
            </div>
          ))}
          {reemplazos.length < MAX_REEMPLAZOS && (
            <Button
              onClick={() => {
                setSimulacion(null);
                setReemplazos((rs) => [...rs, { buscar: "", reemplazo: "" }]);
              }}
              tamano="xs"
              variante="fantasma"
            >
              <Plus size={12} /> Agregar otro reemplazo
            </Button>
          )}
          <Field ayuda="Opcional: si la deja vacía se anotan los reemplazos." etiqueta="Nota">
            <input
              className={controlClase}
              maxLength={500}
              onChange={(e) => setNota(e.target.value)}
              value={nota}
            />
          </Field>
          {simulacion && (
            <div className="space-y-2">
              {simulacion.coincidencias.map((c, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: mismo orden que los reemplazos
                <Card className="space-y-1.5 p-3" key={i}>
                  <p className="text-sm font-semibold text-navy-950">
                    «{c.buscar}» → «{c.reemplazo}»:{" "}
                    {c.total === 0 ? (
                      <span className="text-aviso-800">sin coincidencias</span>
                    ) : (
                      `${c.total} coincidencia(s)`
                    )}
                  </p>
                  <ul className="space-y-1 text-xs text-grafito-600">
                    {c.muestras.map((m, j) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: muestras sin id propio
                      <li key={j}>
                        {m.parte !== "CUERPO" && (
                          <span className="font-semibold">{NOMBRE_PARTE[m.parte]}: </span>
                        )}
                        …{m.antes}
                        <del className="text-red-700">{m.texto}</del>
                        <ins className="font-semibold text-verde-inst-700 no-underline">
                          {c.reemplazo}
                        </ins>
                        {m.despues}…
                      </li>
                    ))}
                    {c.total > c.muestras.length && <li>y {c.total - c.muestras.length} más.</li>}
                  </ul>
                </Card>
              ))}
              <ListaAvisos avisos={simulacion.advertencias} />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button onClick={onCerrar} variante="contorno">
              Cancelar
            </Button>
            {simulacion && todosEncontrados ? (
              <Button disabled={editar.isPending} onClick={() => void enviar(true)}>
                <Replace size={16} /> {editar.isPending ? "Aplicando…" : "Aplicar y activar"}
              </Button>
            ) : (
              <Button
                disabled={!completos || editar.isPending}
                onClick={() => void enviar(false)}
                variante="oscuro"
              >
                {editar.isPending ? "Buscando…" : "Revisar coincidencias"}
              </Button>
            )}
          </div>
        </div>
      )}
    </Dialogo>
  );
}

function DialogoHistorial({ formato, onCerrar }: { formato: FormatoDTO; onCerrar: () => void }) {
  const versiones = useVersionesFormato(formato);
  const activar = useActivarVersion();
  const restaurar = useRestaurarBase();
  const avisar = useToast();
  const [confirmarBase, setConfirmarBase] = useState(false);
  const [previa, setPrevia] = useState<VistaPrevia | null>(null);
  const hayActiva = (versiones.data ?? []).some((v) => v.activa);

  async function usar(v: FormatoVersionDTO) {
    try {
      await activar.mutateAsync(v.id);
      await versiones.refetch();
      avisar(`Ahora se usa la versión ${v.version}`);
    } catch (e) {
      avisar(e instanceof Error ? e.message : "No se pudo activar la versión", "error");
    }
  }

  async function volverABase() {
    setConfirmarBase(false);
    try {
      await restaurar.mutateAsync(formato);
      await versiones.refetch();
      avisar("Se restauró la plantilla base del sistema");
    } catch (e) {
      avisar(e instanceof Error ? e.message : "No se pudo restaurar", "error");
    }
  }

  async function descargar(v: FormatoVersionDTO) {
    try {
      await descargarArchivoProtegido(
        versionFormatoUrl(v.id),
        `${formato.tipo}_v${v.version}.docx`,
      );
    } catch (e) {
      avisar(e instanceof Error ? e.message : "No se pudo descargar", "error");
    }
  }

  return (
    <Dialogo
      abierto
      ancho="max-w-2xl"
      descripcion={`${formato.variante === 1 ? "1 tesista" : "2 tesistas"} · ${formato.archivoBase}`}
      onAbierto={(v) => !v && onCerrar()}
      titulo={`Historial: ${formato.nombre}`}
    >
      <div className="max-h-[60vh] space-y-3 overflow-y-auto">
        {versiones.isPending && <p className="text-sm text-grafito-600">Cargando…</p>}
        {versiones.data?.length === 0 && (
          <EmptyState
            icono={<FileText size={22} />}
            titulo="Sin versiones subidas"
            descripcion="Este formato usa la plantilla base del sistema."
          />
        )}
        {versiones.data?.map((v) => (
          <Card className="space-y-2 p-3" key={v.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-navy-950">Versión {v.version}</p>
                {v.activa && <StatusBadge estado="ACTIVO" etiqueta="En uso" />}
              </div>
              <div className="flex gap-1.5">
                <Button
                  onClick={() =>
                    setPrevia({
                      titulo: formato.nombre,
                      subtitulo: `${etiquetaVariante(formato)} · Versión ${v.version}${v.activa ? " (en uso)" : ""} · ${v.nombreArchivo}`,
                      pdfUrl: versionVistaPreviaUrl(v.id),
                      docxUrl: versionFormatoUrl(v.id),
                      nombre: `${formato.tipo}_v${v.version}`,
                      version: v.version,
                    })
                  }
                  tamano="sm"
                  variante="fantasma"
                >
                  <Eye size={14} /> Ver
                </Button>
                <Button onClick={() => void descargar(v)} tamano="sm" variante="fantasma">
                  <Download size={14} /> Descargar
                </Button>
                {!v.activa && (
                  <Button
                    disabled={activar.isPending}
                    onClick={() => void usar(v)}
                    tamano="sm"
                    variante="contorno"
                  >
                    Usar esta versión
                  </Button>
                )}
              </div>
            </div>
            <p className="text-xs text-grafito-600">
              {fecha(v.createdAt)}
              {v.creadoPor ? ` · ${v.creadoPor}` : ""} · {v.nombreArchivo} · {v.etiquetas.length}{" "}
              etiqueta(s)
            </p>
            {v.nota && <p className="text-sm text-grafito-900">{v.nota}</p>}
            <ListaAvisos avisos={v.advertencias} />
          </Card>
        ))}
      </div>
      <div className="mt-4 flex justify-between gap-2 border-t border-slate-200/80 pt-3">
        {formato.agregado ? (
          <span />
        ) : (
          <Button
            disabled={!hayActiva || restaurar.isPending}
            onClick={() => setConfirmarBase(true)}
            variante="contorno"
          >
            <RotateCcw size={16} /> Volver a la plantilla base
          </Button>
        )}
        <Button
          onClick={() =>
            setPrevia({
              ...previaVigente(formato),
              titulo: formato.nombre,
              subtitulo: `${etiquetaVariante(formato)} · Plantilla vigente`,
              version: null,
            })
          }
          variante="fantasma"
        >
          <Eye size={16} /> Ver vigente
        </Button>
        <Button onClick={onCerrar} variante="oscuro">
          Cerrar
        </Button>
      </div>
      {previa && <VisorFormato onCerrar={() => setPrevia(null)} previa={previa} />}
      {confirmarBase && (
        <ConfirmDialog
          confirmar="Restaurar base"
          mensaje="Los próximos documentos se generarán con la plantilla original del sistema. Las versiones subidas se conservan en el historial."
          onCancelar={() => setConfirmarBase(false)}
          onConfirmar={() => void volverABase()}
          titulo="¿Volver a la plantilla base?"
        />
      )}
    </Dialogo>
  );
}

/** Agrega un formato nuevo a la etapa elegida de la variante (1|2 tesistas). */
function DialogoAgregar({
  variante,
  etapaInicial,
  onCerrar,
}: {
  variante: number;
  etapaInicial: EtapaFormato;
  onCerrar: () => void;
}) {
  const agregar = useAgregarFormato();
  const avisar = useToast();
  const [nombre, setNombre] = useState("");
  const [etapa, setEtapa] = useState<EtapaFormato>(etapaInicial);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [nota, setNota] = useState("");
  const [resultado, setResultado] = useState<SubirFormatoResultadoDTO | null>(null);
  const variantes = variante === 1 ? "1 tesista" : "2 tesistas";
  const nombreValido = nombre.trim().length >= 3;
  const mp = etapa === "MP";

  async function enviar() {
    if (!archivo || !nombreValido) return;
    try {
      const r = await agregar.mutateAsync({ variante, etapa, nombre, file: archivo, nota });
      setResultado(r);
      avisar(`«${r.formato.nombre}» agregado a la ${etiquetaEtapa(r.formato.etapa)}`);
    } catch (e) {
      avisar(e instanceof Error ? e.message : "No se pudo agregar el formato", "error");
    }
  }

  return (
    <Dialogo
      abierto
      ancho="max-w-lg"
      descripcion={`${variantes} · ${
        mp
          ? "el postulante podrá descargarlo, llenarlo y adjuntarlo en la Mesa de Partes"
          : "se generará con «Insertar datos en documentos» de la etapa elegida"
      }`}
      onAbierto={(v) => !v && onCerrar()}
      titulo={resultado ? "Formato agregado" : "Agregar formato"}
    >
      {resultado ? (
        <div className="space-y-3">
          <p className="text-sm text-grafito-900">
            {esMesaDePartes(resultado.formato)
              ? `«${resultado.formato.nombre}» ya está en la Mesa de Partes de ${variantes}: el postulante puede descargarlo, llenarlo y adjuntarlo (opcional).`
              : `«${resultado.formato.nombre}» ya está en la ${etiquetaEtapa(resultado.formato.etapa)} de ${variantes} (${resultado.version.etiquetas.length} etiqueta(s) detectada(s)). Los expedientes lo verán al insertar datos en esa etapa.`}
          </p>
          <ListaAvisos avisos={resultado.version.advertencias} />
          <div className="flex justify-end">
            <Button onClick={onCerrar}>Listo</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {mp ? (
            <p className="text-xs text-grafito-600">
              Suba el formato en blanco que el postulante podrá descargar, llenar y adjuntar en la
              Mesa de Partes como documento opcional (no se rellena con datos del expediente).
            </p>
          ) : (
            <p className="text-xs text-grafito-600">
              Prepare el documento en Word con las etiquetas <code>{"<<CAMPO>>"}</code> que deben
              rellenarse con los datos del expediente (por ejemplo <code>{"<<NOMBRES>>"}</code>,{" "}
              <code>{"<<TESIS>>"}</code>).
            </p>
          )}
          <Field
            ayuda={
              mp ? "Como lo verá el área en este catálogo." : "Como aparecerá en el expediente."
            }
            etiqueta="Nombre del formato"
          >
            <input
              className={controlClase}
              maxLength={120}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Constancia de egresado"
              value={nombre}
            />
          </Field>
          <Select label="Categoría" onChange={(v) => setEtapa(aEtapa(v))} value={etapa}>
            {ETAPAS.map((e) => (
              <option key={e.etapa} value={e.etapa}>
                {e.titulo}
              </option>
            ))}
          </Select>
          <Field etiqueta="Archivo Word (.docx)">
            <input
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className={controlClase}
              onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              type="file"
            />
          </Field>
          <Field ayuda="Opcional: para qué se usa o qué norma lo exige." etiqueta="Nota">
            <input
              className={controlClase}
              maxLength={500}
              onChange={(e) => setNota(e.target.value)}
              value={nota}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button onClick={onCerrar} variante="contorno">
              Cancelar
            </Button>
            <Button
              disabled={!archivo || !nombreValido || agregar.isPending}
              onClick={() => void enviar()}
            >
              <FilePlus size={16} /> {agregar.isPending ? "Agregando…" : "Agregar formato"}
            </Button>
          </div>
        </div>
      )}
    </Dialogo>
  );
}

/** Renombra un formato agregado por el área (los del sistema conservan su nombre). */
function DialogoRenombrar({ formato, onCerrar }: { formato: FormatoDTO; onCerrar: () => void }) {
  const actualizar = useActualizarFormato();
  const avisar = useToast();
  const [nombre, setNombre] = useState(formato.nombre);
  const valido = nombre.trim().length >= 3 && nombre.trim() !== formato.nombre;

  async function guardar() {
    try {
      await actualizar.mutateAsync({ formato, cambios: { nombre: nombre.trim() } });
      avisar("Formato renombrado");
      onCerrar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : "No se pudo renombrar el formato", "error");
    }
  }

  return (
    <Dialogo
      abierto
      ancho="max-w-md"
      descripcion={`${etiquetaVariante(formato)} · ${etiquetaEtapa(formato.etapa)}`}
      onAbierto={(v) => !v && onCerrar()}
      titulo="Renombrar formato"
    >
      <div className="space-y-3">
        <Field etiqueta="Nombre del formato">
          <input
            className={controlClase}
            maxLength={120}
            onChange={(e) => setNombre(e.target.value)}
            value={nombre}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button onClick={onCerrar} variante="contorno">
            Cancelar
          </Button>
          <Button disabled={!valido || actualizar.isPending} onClick={() => void guardar()}>
            Guardar
          </Button>
        </div>
      </div>
    </Dialogo>
  );
}
