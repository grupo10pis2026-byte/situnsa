import { Eye, FileUp, Lock } from "lucide-react";
import { useState } from "react";
import {
  ETIQUETA_PENSION,
  type MiPensionDTO,
  useMisPagos,
  useSubirComprobante,
  verComprobante,
} from "../api/pagos.js";
import { fechaLarga } from "../api/taller.js";
import { AppShell } from "../components/layout/app-shell.js";
import { Button } from "../components/ui/button.js";
import { Card, CardEncabezado } from "../components/ui/card.js";
import { Dialogo } from "../components/ui/dialog.js";
import { EmptyState } from "../components/ui/empty-state.js";
import { controlClase, Field } from "../components/ui/field.js";
import { PageHeader } from "../components/ui/page-header.js";
import { StatusBadge } from "../components/ui/status-badge.js";
import { useToast } from "../components/ui/toast.js";

/**
 * P8 Mis pagos (spec v1.0 §9): las 3 pensiones del alumno; sube el
 * comprobante (imagen o PDF) y ve si la Secretaría lo validó u observó.
 */

function mensaje(e: unknown) {
  return e instanceof Error ? e.message : "Ocurrió un error";
}

export function MisPagosPage() {
  const q = useMisPagos();
  const [subir, setSubir] = useState<MiPensionDTO | null>(null);
  const toast = useToast();
  const d = q.data;
  return (
    <AppShell activo="/mis-pagos">
      <PageHeader
        titulo="Mis pagos"
        descripcion={
          d?.taller ? `Pensiones del ${d.taller.nombre}` : "Pensiones del Taller de Tesis"
        }
      />
      {q.isPending ? (
        <Card className="p-5 text-sm text-grafito-600">Cargando…</Card>
      ) : !d?.taller ? (
        <EmptyState
          titulo="Aún no estás en un taller"
          descripcion="Cuando te asignen a un taller verás aquí tus pensiones."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {d.pensiones.map((p) => (
            <Card key={p.id}>
              <CardEncabezado
                titulo={`Pensión ${p.numero}`}
                descripcion={p.fecha ? `Vence el ${fechaLarga(p.fecha)}` : "Al inscribirse"}
                accion={<StatusBadge estado={p.estado} etiqueta={ETIQUETA_PENSION[p.estado]} />}
              />
              <div className="space-y-3 p-4 text-sm">
                <p className="text-2xl font-bold text-navy-950">
                  S/ {p.monto.toLocaleString("es-PE")}
                </p>
                {p.diasAtraso > 0 && (
                  <p className="font-semibold text-red-700">
                    {p.diasAtraso} día{p.diasAtraso === 1 ? "" : "s"} de atraso
                  </p>
                )}
                {p.estado === "OBSERVADA" && p.observacion && (
                  <p className="rounded bg-orange-50 p-2 text-orange-900">
                    Observación: {p.observacion}
                  </p>
                )}
                {p.medio === "INSCRIPCION" && (
                  <p className="text-grafito-600">Pagada con la inscripción.</p>
                )}
                {p.medio === "PAGO_DIRECTO" && (
                  <p className="text-grafito-600">Pago registrado por la Secretaría.</p>
                )}
                {p.comprobantes.length > 0 && (
                  <ul className="space-y-1">
                    {p.comprobantes.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs">
                          {new Date(c.subidoAt).toLocaleDateString("es-PE")} ·{" "}
                          {c.estado === "VALIDADO"
                            ? "Validado"
                            : c.estado === "OBSERVADO"
                              ? "Observado"
                              : "En revisión"}
                        </span>
                        <Button
                          tamano="xs"
                          variante="fantasma"
                          type="button"
                          onClick={() =>
                            verComprobante(c).catch((e: unknown) => toast(mensaje(e), "error"))
                          }
                        >
                          <Eye size={13} />
                          Ver
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                {p.motivoNoSubir === null ? (
                  <Button className="w-full" type="button" onClick={() => setSubir(p)}>
                    <FileUp size={14} />
                    {p.estado === "OBSERVADA" ? "Subir nuevo comprobante" : "Subir comprobante"}
                  </Button>
                ) : (
                  p.estado !== "VALIDADA" && (
                    <p className="flex items-center gap-1 text-xs text-grafito-600">
                      <Lock size={12} />
                      {p.motivoNoSubir}
                    </p>
                  )
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      {subir && d && (
        <SubirComprobante pension={subir} maxMb={d.maxMb} onCerrar={() => setSubir(null)} />
      )}
    </AppShell>
  );
}

function SubirComprobante({
  pension,
  maxMb,
  onCerrar,
}: {
  pension: MiPensionDTO;
  maxMb: number;
  onCerrar: () => void;
}) {
  const m = useSubirComprobante();
  const toast = useToast();
  const [archivo, setArchivo] = useState<File | null>(null);
  const grande = archivo !== null && archivo.size > maxMb * 1024 * 1024;
  return (
    <Dialogo
      abierto
      onAbierto={(v) => !v && onCerrar()}
      titulo={`Comprobante de la pensión ${pension.numero}`}
      descripcion={`Imagen (JPG o PNG) o PDF de hasta ${maxMb} MB.`}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!archivo) return;
          m.mutate(
            { pensionId: pension.id, archivo },
            {
              onSuccess: () => {
                toast("Comprobante enviado: la Secretaría lo revisará", "ok");
                onCerrar();
              },
              onError: (err) => toast(mensaje(err), "error"),
            },
          );
        }}
      >
        <Field etiqueta="Archivo" error={grande ? `Pasa de ${maxMb} MB` : undefined}>
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className={controlClase}
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            required
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variante="contorno" type="button" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" disabled={m.isPending || !archivo || grande}>
            Enviar
          </Button>
        </div>
      </form>
    </Dialogo>
  );
}
