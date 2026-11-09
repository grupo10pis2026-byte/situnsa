import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, Download, FileSignature, FileUp, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import {
  descargarFicha,
  descargarFirma,
  descargarInformeFirmado,
  emitirInforme,
  type FilaFichaDTO,
  useCierre,
  useFicha,
  useOperarCierre,
  useOperarFicha,
} from "../../api/ficha.js";
import { fechaLarga } from "../../api/taller.js";
import { cn } from "../../utils/cn.js";
import { Button } from "../ui/button.js";
import { Card, CardEncabezado } from "../ui/card.js";
import { DataTable } from "../ui/data-table.js";
import { Dialogo } from "../ui/dialog.js";
import { EmptyState } from "../ui/empty-state.js";
import { controlClase, Field } from "../ui/field.js";
import { StatusBadge } from "../ui/status-badge.js";
import { useToast } from "../ui/toast.js";

/** P11 Ficha de Control (Anexo 1) y P13 Cierre de asesoría (Anexo 21). */

function mensaje(e: unknown) {
  return e instanceof Error ? e.message : "Ocurrió un error";
}

const ETIQUETA_FICHA: Record<string, string> = {
  SIN_REVISION: "Sin revisión",
  REVISADO: "Revisado",
  FIRMADO: "Firmado",
};

function hoy(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

export function FichaProyecto({ proyectoId }: { proyectoId: string }) {
  const q = useFicha(proyectoId);
  const toast = useToast();
  const [editar, setEditar] = useState<FilaFichaDTO | null>(null);
  const [firmada, setFirmada] = useState(false);
  const f = q.data;
  if (q.isPending) return <Card className="p-5 text-sm text-grafito-600">Cargando ficha…</Card>;
  if (!f) return <EmptyState titulo="No se pudo cargar la ficha" />;
  return (
    <Card>
      <CardEncabezado
        titulo="Ficha de Control de Asesoría (Anexo 1)"
        descripcion={`${f.resumen.contador} · ${f.resumen.firmados} firmados${f.resumen.completa ? " · completa" : ""}`}
        accion={
          <span className="flex flex-wrap gap-1.5">
            <Button
              tamano="sm"
              variante="contorno"
              type="button"
              onClick={() =>
                descargarFicha(proyectoId, f.proyecto.codigo).catch((e: unknown) =>
                  toast(mensaje(e), "error"),
                )
              }
            >
              <Download size={14} />
              Descargar PDF
            </Button>
            {f.puedeEditar && (
              <Button
                tamano="sm"
                type="button"
                disabled={!f.filas.some((x) => x.estado === "REVISADO")}
                onClick={() => setFirmada(true)}
              >
                <FileUp size={14} />
                Subir ficha firmada
              </Button>
            )}
          </span>
        }
      />
      <div className="space-y-4 p-4 md:p-5">
        <DataTable
          vacio="Sin registros."
          filas={f.filas}
          columnas={[
            {
              encabezado: "Semana",
              celda: (r) => <strong className="tabular-nums">{r.semana}</strong>,
            },
            { encabezado: "Avance revisado", celda: (r) => r.avanceRevisado },
            { encabezado: "Fecha", celda: (r) => (r.fecha ? fechaLarga(r.fecha) : "—") },
            {
              encabezado: "Observaciones y acuerdos",
              celda: (r) => (
                <span className="block max-w-md text-sm">{r.observacionesAcuerdos ?? "—"}</span>
              ),
            },
            {
              encabezado: "Estado",
              celda: (r) => <StatusBadge estado={r.estado} etiqueta={ETIQUETA_FICHA[r.estado]} />,
            },
            {
              encabezado: "",
              clase: "text-right",
              celda: (r) =>
                f.puedeEditar ? (
                  <Button
                    tamano="xs"
                    variante="fantasma"
                    type="button"
                    onClick={() => setEditar(r)}
                  >
                    <Pencil size={13} />
                    {r.estado === "SIN_REVISION" ? "Registrar" : "Modificar"}
                  </Button>
                ) : null,
            },
          ]}
        />
        {f.firmas.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-grafito-600">Fichas firmadas</p>
            <ul className="space-y-1 text-sm">
              {f.firmas.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-2">
                  <span>
                    {new Date(x.subidoAt).toLocaleDateString("es-PE")} · semanas{" "}
                    {x.semanas.join(", ") || "(reemplazadas)"}
                  </span>
                  <Button
                    tamano="xs"
                    variante="fantasma"
                    type="button"
                    onClick={() =>
                      descargarFirma(x.id, x.nombreArchivo).catch((e: unknown) =>
                        toast(mensaje(e), "error"),
                      )
                    }
                  >
                    <Download size={13} />
                    {x.nombreArchivo}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {editar && (
        <RegistroDialogo proyectoId={proyectoId} fila={editar} onCerrar={() => setEditar(null)} />
      )}
      {firmada && (
        <FirmadaDialogo
          proyectoId={proyectoId}
          filas={f.filas.filter((x) => x.estado === "REVISADO")}
          onCerrar={() => setFirmada(false)}
        />
      )}
    </Card>
  );
}

function RegistroDialogo({
  proyectoId,
  fila,
  onCerrar,
}: {
  proyectoId: string;
  fila: FilaFichaDTO;
  onCerrar: () => void;
}) {
  const m = useOperarFicha(proyectoId);
  const toast = useToast();
  const [fecha, setFecha] = useState(fila.fecha ?? hoy());
  const [obs, setObs] = useState(fila.observacionesAcuerdos ?? "");
  const [motivo, setMotivo] = useState("");
  const firmado = fila.estado === "FIRMADO";
  return (
    <Dialogo
      abierto
      onAbierto={(v) => !v && onCerrar()}
      titulo={`Semana ${fila.semana} · ${fila.avanceRevisado}`}
      descripcion={
        firmado
          ? "Este registro está firmado: el cambio exige motivo y habrá que firmarlo otra vez."
          : undefined
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate(
            {
              tipo: "registrar",
              filaId: fila.id,
              datos: { fecha, observacionesAcuerdos: obs, motivo: firmado ? motivo : null },
            },
            {
              onSuccess: () => {
                toast("Registro guardado", "ok");
                onCerrar();
              },
              onError: (err) => toast(mensaje(err), "error"),
            },
          );
        }}
      >
        <Field etiqueta="Fecha de la revisión">
          <input
            type="date"
            className={controlClase}
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            required
          />
        </Field>
        <Field etiqueta="Observaciones y acuerdos">
          <textarea
            className={cn(controlClase, "min-h-28")}
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            required
          />
        </Field>
        {firmado && (
          <Field etiqueta="Motivo del cambio">
            <input
              className={controlClase}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              required
            />
          </Field>
        )}
        <div className="flex justify-end gap-2">
          <Button variante="contorno" type="button" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={m.isPending || obs.trim() === "" || (firmado && motivo.trim() === "")}
          >
            Guardar
          </Button>
        </div>
      </form>
    </Dialogo>
  );
}

function FirmadaDialogo({
  proyectoId,
  filas,
  onCerrar,
}: {
  proyectoId: string;
  filas: FilaFichaDTO[];
  onCerrar: () => void;
}) {
  const m = useOperarFicha(proyectoId);
  const toast = useToast();
  const [semanas, setSemanas] = useState<number[]>(filas.map((f) => f.semana));
  const [archivo, setArchivo] = useState<File | null>(null);
  return (
    <Dialogo
      abierto
      onAbierto={(v) => !v && onCerrar()}
      titulo="Subir ficha firmada"
      descripcion="PDF escaneado con las firmas del asesor y del tesista."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!archivo) return;
          m.mutate(
            { tipo: "firmada", semanas, archivo },
            {
              onSuccess: () => {
                toast("Ficha firmada guardada", "ok");
                onCerrar();
              },
              onError: (err) => toast(mensaje(err), "error"),
            },
          );
        }}
      >
        <fieldset className="space-y-1 text-sm">
          <legend className="mb-1 font-semibold">Registros que cubre</legend>
          {filas.map((f) => (
            <label key={f.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={semanas.includes(f.semana)}
                onChange={(e) =>
                  setSemanas((s) =>
                    e.target.checked ? [...s, f.semana] : s.filter((x) => x !== f.semana),
                  )
                }
              />
              Semana {f.semana} · {f.avanceRevisado}
            </label>
          ))}
        </fieldset>
        <Field etiqueta="PDF firmado">
          <input
            type="file"
            accept=".pdf"
            className={controlClase}
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            required
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variante="contorno" type="button" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" disabled={m.isPending || !archivo || semanas.length === 0}>
            Subir
          </Button>
        </div>
      </form>
    </Dialogo>
  );
}

// ── P13 Cierre de asesoría ─────────────────────────────────────────────
function Requisito({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <li
      className={cn(
        "flex items-center gap-2 text-sm",
        ok ? "text-verde-inst-700" : "text-grafito-600",
      )}
    >
      {ok ? <CheckCircle2 size={16} /> : <Circle size={16} />}
      {texto}
    </li>
  );
}

export function CierreProyecto({ proyectoId }: { proyectoId: string }) {
  const q = useCierre(proyectoId);
  const m = useOperarCierre(proyectoId);
  const qc = useQueryClient();
  const toast = useToast();
  const k = q.data;
  const [similitud, setSimilitud] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  useEffect(() => {
    if (k) setSimilitud(k.similitudPreliminar === null ? "" : String(k.similitudPreliminar));
  }, [k]);
  if (q.isPending) return <Card className="p-5 text-sm text-grafito-600">Cargando…</Card>;
  if (!k) return <EmptyState titulo="No se pudo cargar el cierre" />;
  const cerrado = k.cerradoAt !== null;
  const editable = k.puedeGestionar && !cerrado;
  return (
    <Card>
      <CardEncabezado
        titulo="Cierre de asesoría"
        descripcion={
          cerrado
            ? `Asesoría cerrada el ${new Date(k.cerradoAt ?? "").toLocaleDateString("es-PE")}. El trámite continúa en la Etapa 5.`
            : "El Informe de Conformidad (Anexo 21) se emite cuando se cumplen los requisitos."
        }
        accion={cerrado ? <StatusBadge estado="FINALIZADO" etiqueta="Cerrada" /> : null}
      />
      <div className="grid gap-6 p-4 md:grid-cols-2 md:p-5">
        <ul className="space-y-2">
          <Requisito ok={k.requisitos.borradorFinal} texto="Borrador final entregado" />
          <Requisito ok={k.requisitos.fichaCompleta} texto="Ficha de control completa y firmada" />
          <Requisito ok={k.requisitos.observacionesLevantadas} texto="Observaciones levantadas" />
          <Requisito ok={k.requisitos.similitud} texto="Similitud preliminar registrada" />
        </ul>
        <div className="space-y-3">
          <Field etiqueta="Similitud preliminar (%)">
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              className={controlClase}
              value={similitud}
              disabled={!editable}
              onChange={(e) => setSimilitud(e.target.value)}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={k.observacionesLevantadas}
              disabled={!editable || m.isPending}
              onChange={(e) =>
                m.mutate(
                  { tipo: "datos", datos: { observacionesLevantadas: e.target.checked } },
                  { onError: (err) => toast(mensaje(err), "error") },
                )
              }
            />
            Las observaciones fueron levantadas
          </label>
          {editable && (
            <Button
              tamano="sm"
              variante="contorno"
              type="button"
              disabled={m.isPending || similitud === ""}
              onClick={() =>
                m.mutate(
                  { tipo: "datos", datos: { similitudPreliminar: Number(similitud) } },
                  {
                    onSuccess: () => toast("Similitud guardada", "ok"),
                    onError: (err) => toast(mensaje(err), "error"),
                  },
                )
              }
            >
              Guardar similitud
            </Button>
          )}
        </div>
      </div>
      {k.puedeGestionar && (
        <div className="flex flex-wrap items-end gap-3 border-t border-slate-200 p-4 md:p-5">
          {!cerrado && (
            <Button
              type="button"
              disabled={k.motivoNoEmitir !== null}
              title={k.motivoNoEmitir ?? undefined}
              onClick={() =>
                emitirInforme(proyectoId, k.codigo)
                  .then(() =>
                    qc.invalidateQueries({ queryKey: ["proyecto", proyectoId, "cierre"] }),
                  )
                  .catch((e: unknown) => toast(mensaje(e), "error"))
              }
            >
              <FileSignature size={15} />
              Emitir Informe de Conformidad
            </Button>
          )}
          {!cerrado && k.informeGeneradoAt && (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!archivo) return;
                m.mutate(
                  { tipo: "firmado", archivo },
                  {
                    onSuccess: () => toast("Asesoría cerrada", "ok"),
                    onError: (err) => toast(mensaje(err), "error"),
                  },
                );
              }}
            >
              <Field etiqueta="Informe firmado (PDF)">
                <input
                  type="file"
                  accept=".pdf"
                  className={controlClase}
                  onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
                />
              </Field>
              <Button variante="exito" type="submit" disabled={!archivo || m.isPending}>
                <FileUp size={14} />
                Subir y cerrar asesoría
              </Button>
            </form>
          )}
          {k.motivoNoEmitir && !cerrado && (
            <p className="text-sm text-grafito-600">{k.motivoNoEmitir}</p>
          )}
        </div>
      )}
      {k.informeFirmado && (
        <div className="border-t border-slate-200 p-4">
          <Button
            tamano="sm"
            variante="contorno"
            type="button"
            onClick={() =>
              descargarInformeFirmado(proyectoId, k.codigo).catch((e: unknown) =>
                toast(mensaje(e), "error"),
              )
            }
          >
            <Download size={14} />
            Informe firmado
          </Button>
        </div>
      )}
    </Card>
  );
}
