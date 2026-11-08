import type { ProcesoConfigDTO } from "@pis/contracts";
import { Plus, Save, Settings2, Trash2 } from "lucide-react";
import { useState } from "react";
import { useEditarProceso, useProceso } from "../api/configuracion.js";
import { ConfiguracionTallerPanel } from "../components/domain/config-taller.js";
import { AppShell } from "../components/layout/app-shell.js";
import { Button } from "../components/ui/button.js";
import { Card, CardEncabezado } from "../components/ui/card.js";
import { ConfirmDialog } from "../components/ui/confirm-dialog.js";
import { EmptyState } from "../components/ui/empty-state.js";
import { controlClase } from "../components/ui/field.js";
import { PageHeader } from "../components/ui/page-header.js";
import { Select } from "../components/ui/select.js";
import { Tab, TabPanel, Tabs, TabsLista } from "../components/ui/tabs.js";
import { useToast } from "../components/ui/toast.js";
import { cn } from "../utils/cn.js";

type Etapa = ProcesoConfigDTO["etapas"][number];
type Subetapa = Etapa["subetapas"][number];
type Documento = ProcesoConfigDTO["documentos"][number];
type Editar = ReturnType<typeof useEditarProceso>;

/**
 * Configuración (solo administración): el proceso de titulación (HU-0052)
 * y el Módulo Taller de Tesis (spec v1.0 P16), cada uno en su pestaña.
 */
export function ConfiguracionPage() {
  const [seccion, setSeccion] = useState("proceso");
  return (
    <AppShell activo="/configuracion">
      <PageHeader
        titulo="Configuración"
        descripcion={
          seccion === "taller"
            ? "Feriados, plan institucional, especialidades y parámetros del Taller de Tesis. Los talleres ya creados conservan lo que copiaron al crearse."
            : "Etapas, subetapas y documentos requeridos. Los cambios aplican a los expedientes que se validen desde ahora."
        }
      />
      <Tabs value={seccion} onValueChange={setSeccion}>
        <TabsLista>
          <Tab value="proceso">Proceso de titulación</Tab>
          <Tab value="taller">Taller de Tesis</Tab>
        </TabsLista>
        <TabPanel value="proceso">
          <ProcesoPanel />
        </TabPanel>
        <TabPanel value="taller">
          <ConfiguracionTallerPanel />
        </TabPanel>
      </Tabs>
    </AppShell>
  );
}

function ProcesoPanel() {
  const proceso = useProceso();
  const editar = useEditarProceso();
  return (
    <div className="space-y-4">
      {proceso.isPending && <p className="text-sm text-grafito-600">Cargando…</p>}
      {proceso.isError && (
        <EmptyState
          titulo="No se pudo cargar la configuración"
          descripcion={proceso.error instanceof Error ? proceso.error.message : "Error inesperado"}
        />
      )}
      {proceso.data && (
        <>
          {proceso.data.etapas.map((e) => (
            <EtapaCard key={e.numero} etapa={e} editar={editar} />
          ))}
          <DocumentosCard proceso={proceso.data} editar={editar} />
        </>
      )}
    </div>
  );
}

function useEjecutar(editar: Editar) {
  const avisar = useToast();
  return async (op: Parameters<Editar["mutateAsync"]>[0], ok: string): Promise<boolean> => {
    try {
      await editar.mutateAsync(op);
      avisar(ok);
      return true;
    } catch (e) {
      avisar(e instanceof Error ? e.message : "No se pudo guardar", "error");
      return false;
    }
  };
}

function EtapaCard({ etapa, editar }: { etapa: Etapa; editar: Editar }) {
  const ejecutar = useEjecutar(editar);
  const [nombre, setNombre] = useState(etapa.nombre);
  const [responsable, setResponsable] = useState(etapa.responsable);
  const [nueva, setNueva] = useState({ nombre: "", plazo: "", obligatoria: true });
  const cambio = nombre !== etapa.nombre || responsable !== etapa.responsable;
  return (
    <Card>
      <CardEncabezado
        titulo={
          <span className="flex items-center gap-2">
            <Settings2 size={15} className="text-navy-800" />
            Etapa {etapa.numero}
          </span>
        }
        descripcion={`${etapa.subetapas.length} subetapas`}
      />
      <div className="space-y-3 p-4 md:p-5">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_280px_auto]">
          <input
            aria-label={`Nombre de la etapa ${etapa.numero}`}
            className={cn(controlClase, "h-9")}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
          <input
            aria-label={`Responsable de la etapa ${etapa.numero}`}
            className={cn(controlClase, "h-9")}
            type="email"
            value={responsable}
            onChange={(e) => setResponsable(e.target.value)}
          />
          <Button
            tamano="sm"
            variante="contorno"
            disabled={!cambio || editar.isPending}
            onClick={() =>
              void ejecutar(
                {
                  tipo: "editarEtapa",
                  numero: etapa.numero,
                  cambios: {
                    ...(nombre !== etapa.nombre ? { nombre } : {}),
                    ...(responsable !== etapa.responsable ? { responsable } : {}),
                  },
                },
                `Etapa ${etapa.numero} actualizada`,
              )
            }
            type="button"
          >
            <Save size={14} />
            Guardar
          </Button>
        </div>
        <ol className="divide-y divide-slate-200/70 rounded-lg border border-slate-200">
          {etapa.subetapas.map((s) => (
            <SubetapaFila key={s.id} etapa={etapa.numero} sub={s} editar={editar} />
          ))}
        </ol>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_220px_auto_auto]">
          <input
            aria-label="Nombre de la nueva subetapa"
            className={cn(controlClase, "h-9")}
            placeholder="Nueva subetapa (personalizada)"
            value={nueva.nombre}
            onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })}
          />
          <input
            aria-label="Plazo de la nueva subetapa"
            className={cn(controlClase, "h-9")}
            placeholder="Plazo (ej. 1 a 3 días hábiles)"
            value={nueva.plazo}
            onChange={(e) => setNueva({ ...nueva, plazo: e.target.value })}
          />
          <label className="flex items-center gap-1.5 text-xs font-semibold text-grafito-600">
            <input
              checked={nueva.obligatoria}
              type="checkbox"
              onChange={(e) => setNueva({ ...nueva, obligatoria: e.target.checked })}
            />
            Obligatoria
          </label>
          <Button
            tamano="sm"
            variante="oscuro"
            disabled={nueva.nombre.trim().length < 3 || nueva.plazo.trim().length < 2}
            onClick={() =>
              void ejecutar(
                {
                  tipo: "agregarSubetapa",
                  numero: etapa.numero,
                  datos: {
                    nombre: nueva.nombre.trim(),
                    plazo: nueva.plazo.trim(),
                    obligatoria: nueva.obligatoria,
                  },
                },
                "Subetapa agregada",
              ).then((ok) => {
                if (ok) setNueva({ nombre: "", plazo: "", obligatoria: true });
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

function SubetapaFila({ etapa, sub, editar }: { etapa: number; sub: Subetapa; editar: Editar }) {
  const ejecutar = useEjecutar(editar);
  const [nombre, setNombre] = useState(sub.nombre);
  const [plazo, setPlazo] = useState(sub.plazo ?? "");
  const [borrar, setBorrar] = useState(false);
  const sistema = sub.clave !== null;
  const cambio = nombre !== sub.nombre || plazo !== (sub.plazo ?? "");
  return (
    <li className="grid grid-cols-1 items-center gap-2 px-3 py-2 md:grid-cols-[48px_1fr_220px_130px_auto]">
      <span className="text-sm font-bold tabular-nums text-navy-950">
        {etapa}.{sub.orden}
      </span>
      <input
        aria-label={`Nombre de la subetapa ${etapa}.${sub.orden}`}
        className={cn(controlClase, "h-8 text-sm")}
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
      />
      <input
        aria-label={`Plazo de la subetapa ${etapa}.${sub.orden}`}
        className={cn(controlClase, "h-8 text-sm")}
        value={plazo}
        onChange={(e) => setPlazo(e.target.value)}
      />
      <span
        className={cn(
          "w-fit rounded-full border px-2 py-0.5 text-[11px] font-bold",
          sistema
            ? "border-slate-300 bg-slate-100 text-grafito-600"
            : "border-yellow-300 bg-aviso-100 text-aviso-800",
        )}
        title={sistema ? `Regla de avance: ${sub.clave}` : "Sin reglas de avance"}
      >
        {sistema ? "Del sistema" : sub.obligatoria ? "Personalizada" : "Opcional"}
      </span>
      <span className="flex gap-1.5">
        <Button
          tamano="xs"
          variante="contorno"
          disabled={!cambio || editar.isPending}
          onClick={() =>
            void ejecutar(
              {
                tipo: "editarSubetapa",
                id: sub.id,
                cambios: {
                  ...(nombre !== sub.nombre ? { nombre } : {}),
                  ...(plazo !== (sub.plazo ?? "") ? { plazo } : {}),
                },
              },
              `Subetapa ${etapa}.${sub.orden} actualizada`,
            )
          }
          type="button"
        >
          <Save size={13} />
        </Button>
        {!sistema && (
          <Button tamano="xs" variante="peligro" onClick={() => setBorrar(true)} type="button">
            <Trash2 size={13} />
          </Button>
        )}
      </span>
      {borrar && (
        <ConfirmDialog
          titulo="Eliminar subetapa"
          mensaje={`¿Eliminar la subetapa personalizada «${sub.nombre}»? Los expedientes ya validados conservan su seguimiento.`}
          confirmar="Eliminar"
          peligroso
          onConfirmar={() => {
            setBorrar(false);
            void ejecutar({ tipo: "eliminarSubetapa", id: sub.id }, "Subetapa eliminada");
          }}
          onCancelar={() => setBorrar(false)}
        />
      )}
    </li>
  );
}

function DocumentosCard({ proceso, editar }: { proceso: ProcesoConfigDTO; editar: Editar }) {
  const ejecutar = useEjecutar(editar);
  const claves = proceso.etapas.flatMap((e) =>
    e.subetapas
      .filter((s) => s.clave !== null)
      .map((s) => ({ clave: s.clave ?? "", etiqueta: `${e.numero}.${s.orden} ${s.nombre}` })),
  );
  const [nuevo, setNuevo] = useState({
    tipo: "",
    nombre: "",
    etapa: "E1" as "E1" | "E2",
    obligatorio: true,
    requeridoEn: "",
  });
  return (
    <Card>
      <CardEncabezado
        titulo="Documentos requeridos"
        descripcion="Checklist documental: la subetapa indicada no se puede finalizar sin el documento, y es donde lo carga el tesista."
      />
      <div className="space-y-3 p-4 md:p-5">
        <ol className="divide-y divide-slate-200/70 rounded-lg border border-slate-200">
          {proceso.documentos.map((d) => (
            <DocumentoFila key={d.tipo} doc={d} claves={claves} editar={editar} />
          ))}
        </ol>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[200px_1fr_90px_1fr_auto_auto]">
          <input
            aria-label="Tipo del nuevo documento"
            className={cn(controlClase, "h-9")}
            placeholder="TIPO_EN_MAYUSCULAS"
            value={nuevo.tipo}
            onChange={(e) => setNuevo({ ...nuevo, tipo: e.target.value.toUpperCase() })}
          />
          <input
            aria-label="Nombre del nuevo documento"
            className={cn(controlClase, "h-9")}
            placeholder="Nombre visible"
            value={nuevo.nombre}
            onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
          />
          <Select
            ariaLabel="Etapa del nuevo documento"
            value={nuevo.etapa}
            onChange={(v) => setNuevo({ ...nuevo, etapa: v === "E2" ? "E2" : "E1" })}
          >
            <option value="E1">E1</option>
            <option value="E2">E2</option>
          </Select>
          <Select
            ariaLabel="Subetapa que lo exige"
            value={nuevo.requeridoEn}
            onChange={(requeridoEn) => setNuevo({ ...nuevo, requeridoEn })}
          >
            <option value="">— Sin guarda —</option>
            {claves.map((c) => (
              <option key={c.clave} value={c.clave}>
                {c.etiqueta}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-grafito-600">
            <input
              checked={nuevo.obligatorio}
              type="checkbox"
              onChange={(e) => setNuevo({ ...nuevo, obligatorio: e.target.checked })}
            />
            Obligatorio
          </label>
          <Button
            tamano="sm"
            variante="oscuro"
            disabled={!/^[A-Z][A-Z0-9_]{2,63}$/.test(nuevo.tipo) || nuevo.nombre.trim().length < 3}
            onClick={() =>
              void ejecutar(
                {
                  tipo: "agregarDocumento",
                  datos: {
                    tipo: nuevo.tipo,
                    nombre: nuevo.nombre.trim(),
                    etapa: nuevo.etapa,
                    obligatorio: nuevo.obligatorio,
                    requeridoEn: nuevo.requeridoEn || null,
                  },
                },
                "Documento agregado",
              ).then((ok) => {
                if (ok) {
                  setNuevo({
                    tipo: "",
                    nombre: "",
                    etapa: "E1",
                    obligatorio: true,
                    requeridoEn: "",
                  });
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

function DocumentoFila({
  doc,
  claves,
  editar,
}: {
  doc: Documento;
  claves: Array<{ clave: string; etiqueta: string }>;
  editar: Editar;
}) {
  const ejecutar = useEjecutar(editar);
  const [nombre, setNombre] = useState(doc.nombre);
  const [obligatorio, setObligatorio] = useState(doc.obligatorio);
  const [requeridoEn, setRequeridoEn] = useState(doc.requeridoEn ?? "");
  const cambio =
    nombre !== doc.nombre ||
    obligatorio !== doc.obligatorio ||
    requeridoEn !== (doc.requeridoEn ?? "");
  return (
    <li className="grid grid-cols-1 items-center gap-2 px-3 py-2 md:grid-cols-[200px_1fr_48px_1fr_auto_auto]">
      <span className="truncate text-xs font-bold text-navy-950" title={doc.tipo}>
        {doc.tipo}
      </span>
      <input
        aria-label={`Nombre de ${doc.tipo}`}
        className={cn(controlClase, "h-8 text-sm")}
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
      />
      <span className="text-xs font-semibold text-grafito-600">{doc.etapa}</span>
      <Select
        ariaLabel={`Subetapa que exige ${doc.tipo}`}
        value={requeridoEn}
        onChange={setRequeridoEn}
      >
        <option value="">— Sin guarda —</option>
        {claves.map((c) => (
          <option key={c.clave} value={c.clave}>
            {c.etiqueta}
          </option>
        ))}
      </Select>
      <label className="flex items-center gap-1.5 text-xs font-semibold text-grafito-600">
        <input
          checked={obligatorio}
          type="checkbox"
          onChange={(e) => setObligatorio(e.target.checked)}
        />
        Obligatorio
      </label>
      <Button
        tamano="xs"
        variante="contorno"
        disabled={!cambio || editar.isPending}
        onClick={() =>
          void ejecutar(
            {
              tipo: "editarDocumento",
              tipoDocumento: doc.tipo,
              cambios: {
                ...(nombre !== doc.nombre ? { nombre } : {}),
                ...(obligatorio !== doc.obligatorio ? { obligatorio } : {}),
                ...(requeridoEn !== (doc.requeridoEn ?? "")
                  ? { requeridoEn: requeridoEn || null }
                  : {}),
              },
            },
            `${doc.tipo} actualizado`,
          )
        }
        type="button"
      >
        <Save size={13} />
      </Button>
    </li>
  );
}
