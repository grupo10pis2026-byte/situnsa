import { AlertTriangle, BadgeCheck, Clock, Eye, Wallet } from "lucide-react";
import { useState } from "react";
import {
  ETIQUETA_PENSION,
  type PensionFilaDTO,
  useOperarPago,
  usePagosTaller,
  verComprobante,
} from "../api/pagos.js";
import { fechaCorta } from "../api/taller.js";
import { AppShell } from "../components/layout/app-shell.js";
import { Button } from "../components/ui/button.js";
import { Card } from "../components/ui/card.js";
import { DataTable } from "../components/ui/data-table.js";
import { Dialogo } from "../components/ui/dialog.js";
import { controlClase, Field } from "../components/ui/field.js";
import { PageHeader } from "../components/ui/page-header.js";
import { Select } from "../components/ui/select.js";
import { StatCard } from "../components/ui/stat-card.js";
import { StatusBadge } from "../components/ui/status-badge.js";
import { useToast } from "../components/ui/toast.js";
import { cn } from "../utils/cn.js";

/**
 * P9 Pagos y deudores (spec v1.0 §9): la Secretaría del Taller valida u
 * observa comprobantes (con motivo) o registra un pago directo. Filtros por
 * taller, estado y solo deudores; los días de atraso se calculan al día.
 */

type Estado = "" | "PENDIENTE" | "EN_REVISION" | "VALIDADA" | "OBSERVADA" | "VENCIDA";
type Dialogos = { tipo: "observar" | "pago"; fila: PensionFilaDTO } | null;

function mensaje(e: unknown) {
  return e instanceof Error ? e.message : "Ocurrió un error";
}

export function PagosTallerPage() {
  const [tallerId, setTallerId] = useState("");
  const [estado, setEstado] = useState<Estado>("");
  const [deudores, setDeudores] = useState(false);
  const [q, setQ] = useState("");
  const query = usePagosTaller({
    ...(tallerId ? { tallerId } : {}),
    ...(estado ? { estado } : {}),
    ...(deudores ? { deudores: "true" as const } : {}),
    ...(q.trim() ? { q: q.trim() } : {}),
  });
  const operar = useOperarPago();
  const toast = useToast();
  const [dialogo, setDialogo] = useState<Dialogos>(null);
  const d = query.data;

  return (
    <AppShell activo="/pagos-taller">
      <PageHeader
        titulo="Pagos y deudores"
        descripcion="Pensiones del Taller de Tesis: valida los comprobantes, registra pagos directos y consulta la deuda."
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          etiqueta="Por validar"
          valor={d?.resumen.porValidar ?? "—"}
          icono={<Clock size={20} />}
          acento="bg-navy-950"
        />
        <StatCard
          etiqueta="Vencidas"
          valor={d?.resumen.vencidas ?? "—"}
          icono={<AlertTriangle size={20} />}
          acento="bg-red-700"
        />
        <StatCard
          etiqueta="Alumnos con deuda"
          valor={d?.resumen.deudores ?? "—"}
          icono={<Wallet size={20} />}
          acento="bg-dorado-500"
        />
        <StatCard
          etiqueta="Deuda total"
          valor={d ? `S/ ${d.resumen.deudaTotal.toLocaleString("es-PE")}` : "—"}
          icono={<BadgeCheck size={20} />}
          acento="bg-verde-inst-700"
        />
      </div>
      <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
        <Select label="Taller" value={tallerId} onChange={setTallerId}>
          <option value="">Todos</option>
          {(d?.talleres ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </Select>
        <Select label="Estado" value={estado} onChange={(v) => setEstado(v as Estado)}>
          <option value="">Todos</option>
          {Object.entries(ETIQUETA_PENSION).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Field etiqueta="Alumno o DNI">
          <input className={controlClase} value={q} onChange={(e) => setQ(e.target.value)} />
        </Field>
        <label className="flex h-10 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={deudores}
            onChange={(e) => setDeudores(e.target.checked)}
          />
          Solo deudores
        </label>
      </Card>
      <DataTable
        cargando={query.isPending}
        vacio="No hay pensiones con estos filtros."
        filas={d?.items ?? []}
        columnas={[
          {
            encabezado: "Alumno",
            celda: (f) => (
              <span>
                <strong>{f.alumno}</strong>
                <span className="block text-xs text-grafito-600">
                  DNI {f.dni} · {f.taller}
                  {f.proyecto ? ` · ${f.proyecto}` : ""}
                </span>
              </span>
            ),
          },
          {
            encabezado: "Pensión",
            celda: (f) => <strong className="tabular-nums">{f.numero}.ª</strong>,
          },
          {
            encabezado: "Vence",
            celda: (f) => (f.fecha ? fechaCorta(f.fecha) : "Al inscribirse"),
          },
          { encabezado: "Monto", celda: (f) => `S/ ${f.monto}` },
          {
            encabezado: "Estado",
            celda: (f) => (
              <span>
                <StatusBadge estado={f.estado} etiqueta={ETIQUETA_PENSION[f.estado]} />
                {f.diasAtraso > 0 && (
                  <span className="mt-0.5 block text-xs font-semibold text-red-700">
                    {f.diasAtraso} día{f.diasAtraso === 1 ? "" : "s"} de atraso
                  </span>
                )}
                {f.observacion && (
                  <span className="mt-0.5 block max-w-[220px] text-xs text-grafito-600">
                    {f.observacion}
                  </span>
                )}
                {f.medio === "PAGO_DIRECTO" && (
                  <span className="mt-0.5 block text-xs text-grafito-600">Pago directo</span>
                )}
              </span>
            ),
          },
          {
            encabezado: "Acciones",
            clase: "text-right",
            celda: (f) => (
              <span className="flex flex-wrap justify-end gap-1.5">
                {f.comprobante && (
                  <Button
                    tamano="xs"
                    variante="fantasma"
                    type="button"
                    onClick={() =>
                      f.comprobante &&
                      verComprobante(f.comprobante).catch((e: unknown) =>
                        toast(mensaje(e), "error"),
                      )
                    }
                  >
                    <Eye size={13} />
                    Comprobante
                  </Button>
                )}
                {f.estado === "EN_REVISION" && f.comprobante && (
                  <>
                    <Button
                      tamano="xs"
                      variante="exito"
                      type="button"
                      disabled={operar.isPending}
                      onClick={() =>
                        f.comprobante &&
                        operar.mutate(
                          { tipo: "validar", comprobanteId: f.comprobante.id },
                          {
                            onSuccess: () => toast("Pago validado", "ok"),
                            onError: (e) => toast(mensaje(e), "error"),
                          },
                        )
                      }
                    >
                      Validar
                    </Button>
                    <Button
                      tamano="xs"
                      variante="contorno"
                      type="button"
                      onClick={() => setDialogo({ tipo: "observar", fila: f })}
                    >
                      Observar
                    </Button>
                  </>
                )}
                {f.estado !== "VALIDADA" && f.estado !== "EN_REVISION" && (
                  <Button
                    tamano="xs"
                    variante="contorno"
                    type="button"
                    onClick={() => setDialogo({ tipo: "pago", fila: f })}
                  >
                    Registrar pago
                  </Button>
                )}
              </span>
            ),
          },
        ]}
      />
      {dialogo && <DialogoPago d={dialogo} onCerrar={() => setDialogo(null)} />}
    </AppShell>
  );
}

function DialogoPago({ d, onCerrar }: { d: NonNullable<Dialogos>; onCerrar: () => void }) {
  const operar = useOperarPago();
  const toast = useToast();
  const [texto, setTexto] = useState("");
  const observar = d.tipo === "observar";
  return (
    <Dialogo
      abierto
      onAbierto={(v) => !v && onCerrar()}
      titulo={observar ? "Observar comprobante" : "Registrar pago directo"}
      descripcion={`${d.fila.alumno} · pensión ${d.fila.numero} · S/ ${d.fila.monto}`}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const op =
            observar && d.fila.comprobante
              ? { tipo: "observar" as const, comprobanteId: d.fila.comprobante.id, motivo: texto }
              : {
                  tipo: "pagoDirecto" as const,
                  pensionId: d.fila.id,
                  observacion: texto.trim() || null,
                };
          operar.mutate(op, {
            onSuccess: () => {
              toast(observar ? "Comprobante observado" : "Pago registrado", "ok");
              onCerrar();
            },
            onError: (err) => toast(mensaje(err), "error"),
          });
        }}
      >
        <Field etiqueta={observar ? "Motivo (se envía al alumno)" : "Observación (opcional)"}>
          <textarea
            className={cn(controlClase, "min-h-24")}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            required={observar}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variante="contorno" type="button" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" disabled={operar.isPending || (observar && texto.trim() === "")}>
            {observar ? "Observar" : "Registrar pago"}
          </Button>
        </div>
      </form>
    </Dialogo>
  );
}
