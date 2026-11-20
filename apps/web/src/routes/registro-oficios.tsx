import type {
  FiltroRegistros,
  ImportacionDTO,
  RegistroNumeracionDTO,
  TipoNumeracionDTO,
} from "@pis/contracts";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, FileSpreadsheet, Link2, Upload } from "lucide-react";
import { useState } from "react";
import { useImportarRegistro, useRegistros } from "../api/numeracion.js";
import { AppShell } from "../components/layout/app-shell.js";
import { Button } from "../components/ui/button.js";
import { Card, CardEncabezado } from "../components/ui/card.js";
import { type Columna, DataTable } from "../components/ui/data-table.js";
import { Dialogo } from "../components/ui/dialog.js";
import { EmptyState } from "../components/ui/empty-state.js";
import { controlClase, Field } from "../components/ui/field.js";
import { PageHeader } from "../components/ui/page-header.js";
import { Select } from "../components/ui/select.js";
import { StatCard } from "../components/ui/stat-card.js";
import { StatusBadge } from "../components/ui/status-badge.js";
import { Tab, TabPanel, Tabs, TabsLista } from "../components/ui/tabs.js";
import { useToast } from "../components/ui/toast.js";

const POR_PAGINA = 50;

function fechaCorta(iso: string | undefined): string {
  if (!iso) return "—";
  return /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? new Date(`${iso}T12:00:00`).toLocaleDateString("es-PE")
    : iso;
}

function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" });
}

function texto(v: string | undefined) {
  return <span className="line-clamp-2 text-sm text-grafito-900">{v || "—"}</span>;
}

function celdaVinculo(r: RegistroNumeracionDTO) {
  if (!r.vinculo) {
    return r.vigente ? <StatusBadge estado="PENDIENTE" etiqueta="Libre" /> : <span>—</span>;
  }
  return (
    <div className="flex flex-col items-start gap-1">
      <Link
        className="inline-flex items-center gap-1 font-semibold text-navy-800 hover:underline"
        params={{ id: r.vinculo.expedienteId }}
        to="/expedientes/$id"
      >
        <Link2 size={13} /> {r.vinculo.codigo}
      </Link>
      <span className="text-[11px] text-grafito-600">
        {r.vinculo.origen === "AUTOMATICO" ? "Vinculado automáticamente" : "Vinculado a mano"}
      </span>
    </div>
  );
}

const COLUMNAS: Record<TipoNumeracionDTO, Array<Columna<RegistroNumeracionDTO>>> = {
  OFICIO: [
    {
      encabezado: "N°",
      celda: (r) => <span className="font-bold tabular-nums">{r.numeroFormateado}</span>,
    },
    { encabezado: "Asunto", celda: (r) => texto(r.datos.asunto) },
    { encabezado: "Enviado a", celda: (r) => texto(r.datos.enviadoA) },
    { encabezado: "Fecha del doc.", celda: (r) => fechaCorta(r.datos.fechaDoc) },
    { encabezado: "Expediente (Excel)", celda: (r) => texto(r.datos.expediente) },
    { encabezado: "Vinculado a", celda: celdaVinculo },
    {
      encabezado: "Estado",
      celda: (r) =>
        r.vigente ? (
          <StatusBadge estado="ACTIVO" etiqueta="En el Excel" />
        ) : (
          <StatusBadge estado="RECHAZADO" etiqueta="Retirado" />
        ),
    },
  ],
  DECRETO: [
    {
      encabezado: "N°",
      celda: (r) => <span className="font-bold tabular-nums">{r.numeroFormateado}</span>,
    },
    { encabezado: "Alumno", celda: (r) => texto(r.datos.nombreAlumno) },
    { encabezado: "Plan de tesis", celda: (r) => texto(r.datos.tesis) },
    { encabezado: "Especialidad", celda: (r) => texto(r.datos.especialidad) },
    { encabezado: "Emisión", celda: (r) => fechaCorta(r.datos.fechaEmision) },
    { encabezado: "Vinculado a", celda: celdaVinculo },
    {
      encabezado: "Estado",
      celda: (r) =>
        r.vigente ? (
          <StatusBadge estado="ACTIVO" etiqueta="En el Excel" />
        ) : (
          <StatusBadge estado="RECHAZADO" etiqueta="Retirado" />
        ),
    },
  ],
};

/**
 * Registro de oficios y decretos: el Excel del área sigue siendo la fuente
 * maestra; aquí se importa y se consulta qué número pertenece a qué expediente.
 */
export function RegistroOficiosPage() {
  const [tipo, setTipo] = useState<TipoNumeracionDTO>("DECRETO");
  const [importar, setImportar] = useState(false);
  return (
    <AppShell activo="/registro-oficios">
      <PageHeader
        titulo="Oficios y decretos"
        descripcion="Registro importado del Excel del área (fuente maestra). Cada oficio circular y cada decreto pertenece a un único expediente."
        migas={[{ etiqueta: "Inicio", href: "/admin" }, { etiqueta: "Oficios y decretos" }]}
        acciones={
          <Button onClick={() => setImportar(true)}>
            <Upload size={16} /> Importar Excel
          </Button>
        }
      />
      <Tabs
        className="space-y-4"
        onValueChange={(v) => setTipo(v === "OFICIO" ? "OFICIO" : "DECRETO")}
        value={tipo}
      >
        <TabsLista>
          <Tab value="DECRETO">Decretos</Tab>
          <Tab value="OFICIO">Oficios</Tab>
        </TabsLista>
        <TabPanel value="DECRETO">
          <TablaRegistro tipo="DECRETO" />
        </TabPanel>
        <TabPanel value="OFICIO">
          <TablaRegistro tipo="OFICIO" />
        </TabPanel>
      </Tabs>
      {importar && <DialogoImportar onCerrar={() => setImportar(false)} />}
    </AppShell>
  );
}

function TablaRegistro({ tipo }: { tipo: TipoNumeracionDTO }) {
  const [filtro, setFiltro] = useState<FiltroRegistros>({ tipo, estado: "todos", pagina: 1 });
  const [q, setQ] = useState("");
  const registros = useRegistros({ ...filtro, ...(q.trim() ? { q: q.trim() } : {}) });
  const total = registros.data?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const ultima = registros.data?.ultimaImportacion ?? null;

  if (registros.isSuccess && !ultima && total === 0 && filtro.estado === "todos" && !q) {
    return (
      <EmptyState
        icono={<FileSpreadsheet size={22} />}
        titulo="Aún no se importó el Excel de oficios y decretos"
        descripcion="Use «Importar Excel» con el libro que tiene las hojas OFICIOS y DECRETOS. Mientras tanto, los números se escriben a mano en cada expediente."
      />
    );
  }

  return (
    <div className="space-y-4">
      {ultima && <ResumenImportacion importacion={ultima} tipo={tipo} />}
      <Card>
        <CardEncabezado
          titulo={tipo === "OFICIO" ? "Oficios" : "Decretos"}
          descripcion={`${total} registro(s)`}
        />
        <div className="space-y-3 p-3 md:p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
            <Field etiqueta="Buscar">
              <input
                className={controlClase}
                onChange={(e) => {
                  setQ(e.target.value);
                  setFiltro((f) => ({ ...f, pagina: 1 }));
                }}
                placeholder={tipo === "OFICIO" ? "N°, asunto, SET…" : "N°, alumno, plan de tesis…"}
                value={q}
              />
            </Field>
            <Select
              label="Mostrar"
              onChange={(v) =>
                setFiltro((f) => ({
                  ...f,
                  pagina: 1,
                  estado: v === "libres" || v === "vinculados" || v === "retirados" ? v : "todos",
                }))
              }
              value={filtro.estado}
            >
              <option value="todos">Todos</option>
              <option value="libres">Libres (sin expediente)</option>
              <option value="vinculados">Vinculados</option>
              <option value="retirados">Retirados del Excel</option>
            </Select>
          </div>
          <DataTable
            cargando={registros.isPending}
            columnas={COLUMNAS[tipo]}
            filas={registros.data?.items ?? []}
            vacio="Sin registros que coincidan"
          />
          {paginas > 1 && (
            <div className="flex items-center justify-end gap-2 text-sm text-grafito-600">
              <Button
                disabled={filtro.pagina <= 1}
                onClick={() => setFiltro((f) => ({ ...f, pagina: f.pagina - 1 }))}
                tamano="sm"
                variante="contorno"
              >
                Anterior
              </Button>
              <span className="tabular-nums">
                Página {filtro.pagina} de {paginas}
              </span>
              <Button
                disabled={filtro.pagina >= paginas}
                onClick={() => setFiltro((f) => ({ ...f, pagina: f.pagina + 1 }))}
                tamano="sm"
                variante="contorno"
              >
                Siguiente
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function Avisos({ importacion, tipo }: { importacion: ImportacionDTO; tipo?: TipoNumeracionDTO }) {
  const r = importacion.resumen;
  const tipos: TipoNumeracionDTO[] = tipo ? [tipo] : ["OFICIO", "DECRETO"];
  const avisos: string[] = [];
  for (const t of tipos) {
    const h = r[t];
    const nombre = t === "OFICIO" ? "OFICIOS" : "DECRETOS";
    if (!h.hojaEncontrada) avisos.push(`El Excel no tenía la hoja ${nombre}: no se modificó.`);
    if (h.duplicados.length > 0) {
      avisos.push(
        `${nombre}: números repetidos (se tomó la primera fila): ${h.duplicados.join(", ")}.`,
      );
    }
    if (h.columnasFaltantes.length > 0) {
      avisos.push(`${nombre}: columnas no encontradas: ${h.columnasFaltantes.join(", ")}.`);
    }
  }
  for (const v of r.vinculosRetirados.filter((x) => !tipo || x.tipo === tipo)) {
    avisos.push(
      `El ${v.tipo === "OFICIO" ? "oficio" : "decreto"} N° ${v.numero} del expediente ${v.codigo} ya no figura en el Excel.`,
    );
  }
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

function ResumenImportacion({
  importacion,
  tipo,
}: {
  importacion: ImportacionDTO;
  tipo: TipoNumeracionDTO;
}) {
  const h = importacion.resumen[tipo];
  return (
    <div className="space-y-3">
      <p className="text-xs text-grafito-600">
        Última importación: <strong>{importacion.nombreArchivo}</strong> ·{" "}
        {fechaHora(importacion.createdAt)}
        {importacion.creadoPor ? ` · ${importacion.creadoPor}` : ""}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          acento="bg-navy-800"
          etiqueta="Leídos del Excel"
          icono={<FileSpreadsheet size={18} />}
          valor={h.leidos}
        />
        <StatCard
          acento="bg-verde-inst-700"
          etiqueta="Nuevos"
          icono={<Upload size={18} />}
          valor={h.nuevos}
        />
        <StatCard
          acento="bg-dorado-500"
          etiqueta="Vinculados automáticamente"
          icono={<Link2 size={18} />}
          valor={importacion.resumen.vinculadosAutomaticamente}
          pie="Oficios y decretos, en esta importación"
        />
        <StatCard
          acento="bg-red-700"
          etiqueta="Retirados"
          icono={<AlertTriangle size={18} />}
          valor={h.retirados}
          pie="Ya no figuran en el Excel"
        />
      </div>
      <Avisos importacion={importacion} tipo={tipo} />
    </div>
  );
}

function DialogoImportar({ onCerrar }: { onCerrar: () => void }) {
  const importar = useImportarRegistro();
  const avisar = useToast();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [resultado, setResultado] = useState<ImportacionDTO | null>(null);

  async function enviar() {
    if (!archivo) return;
    try {
      setResultado(await importar.mutateAsync(archivo));
      avisar("Registro de oficios y decretos actualizado");
    } catch (e) {
      avisar(e instanceof Error ? e.message : "No se pudo importar el Excel", "error");
    }
  }

  return (
    <Dialogo
      abierto
      ancho="max-w-lg"
      onAbierto={(v) => !v && onCerrar()}
      titulo={resultado ? "Importación completada" : "Importar Excel de oficios y decretos"}
    >
      {resultado ? (
        <div className="space-y-3 text-sm text-grafito-900">
          <ul className="space-y-1">
            {(["OFICIO", "DECRETO"] as const).map((t) => {
              const h = resultado.resumen[t];
              return (
                <li key={t}>
                  <strong>{t === "OFICIO" ? "Oficios" : "Decretos"}:</strong>{" "}
                  {h.hojaEncontrada
                    ? `${h.leidos} leídos · ${h.nuevos} nuevos · ${h.actualizados} actualizados · ${h.retirados} retirados`
                    : "hoja no incluida (sin cambios)"}
                </li>
              );
            })}
            <li>
              <strong>Vinculados automáticamente:</strong>{" "}
              {resultado.resumen.vinculadosAutomaticamente}
            </li>
          </ul>
          <Avisos importacion={resultado} />
          <div className="flex justify-end">
            <Button onClick={onCerrar}>Listo</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-grafito-600">
            El libro debe tener la hoja <strong>OFICIOS</strong> (columna N°) y/o{" "}
            <strong>DECRETOS</strong> (columna Nro.CC). Cada importación refleja el Excel tal como
            está: los números que ya no figuran quedan como «retirados». Solo se vinculan solos los
            casos exactos (oficio con el código SET en EXPEDIENTE; decreto con el mismo alumno y
            plan de tesis); el resto se vincula desde cada expediente.
          </p>
          <Field etiqueta="Excel (.xlsx)">
            <input
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className={controlClase}
              onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              type="file"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button onClick={onCerrar} variante="contorno">
              Cancelar
            </Button>
            <Button disabled={!archivo || importar.isPending} onClick={() => void enviar()}>
              <Upload size={16} /> {importar.isPending ? "Importando…" : "Importar"}
            </Button>
          </div>
        </div>
      )}
    </Dialogo>
  );
}
