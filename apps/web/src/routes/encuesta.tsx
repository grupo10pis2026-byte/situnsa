import { CheckCircle2, Lock, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useMiEncuesta, useResponderEncuesta, useResultadosEncuesta } from "../api/encuestas.js";
import { AppShell } from "../components/layout/app-shell.js";
import { Button } from "../components/ui/button.js";
import { Card, CardEncabezado } from "../components/ui/card.js";
import { EmptyState } from "../components/ui/empty-state.js";
import { controlClase, Field } from "../components/ui/field.js";
import { PageHeader } from "../components/ui/page-header.js";
import { Select } from "../components/ui/select.js";
import { useToast } from "../components/ui/toast.js";
import { cn } from "../utils/cn.js";

/** P14 Encuesta anónima del alumno y P14b Resultados por asesor (spec v1.0 §9). */

function mensaje(e: unknown) {
  return e instanceof Error ? e.message : "Ocurrió un error";
}

export function EncuestaPage() {
  const q = useMiEncuesta();
  const m = useResponderEncuesta();
  const toast = useToast();
  const [puntajes, setPuntajes] = useState<Record<string, number>>({});
  const [comentario, setComentario] = useState("");
  const e = q.data;
  const completas = e ? e.preguntas.every((p) => puntajes[p.id] !== undefined) : false;
  return (
    <AppShell activo="/encuesta">
      <PageHeader
        titulo="Encuesta sobre tu asesor"
        descripcion="Tu opinión ayuda a mejorar el Taller de Tesis."
      />
      {q.isPending ? (
        <Card className="p-5 text-sm text-grafito-600">Cargando…</Card>
      ) : !e ? (
        <EmptyState titulo="No se pudo cargar la encuesta" />
      ) : !e.disponible ? (
        <EmptyState
          icono={e.yaRespondio ? <CheckCircle2 size={22} /> : <Lock size={22} />}
          titulo={e.yaRespondio ? "Ya respondiste" : "Encuesta no disponible"}
          descripcion={e.motivo ?? undefined}
        />
      ) : (
        <Card>
          <CardEncabezado
            titulo={`Asesor: ${e.asesor ?? "—"}`}
            descripcion={`${e.taller?.nombre ?? ""} · período ${e.periodo ?? ""}`}
          />
          <form
            className="space-y-5 p-4 md:p-5"
            onSubmit={(ev) => {
              ev.preventDefault();
              m.mutate(
                {
                  puntajes: Object.entries(puntajes).map(([preguntaId, puntaje]) => ({
                    preguntaId,
                    puntaje,
                  })),
                  comentario: comentario.trim() || null,
                },
                {
                  onSuccess: () => toast("¡Gracias por responder!", "ok"),
                  onError: (err) => toast(mensaje(err), "error"),
                },
              );
            }}
          >
            <p className="flex items-center gap-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
              <ShieldCheck size={16} />
              Es anónima: tu respuesta no guarda tu nombre ni la hora. Solo se registra que ya
              participaste.
            </p>
            {e.preguntas.map((p, i) => (
              <fieldset key={p.id} className="space-y-2">
                <legend className="text-sm font-semibold">
                  {i + 1}. {p.texto}
                </legend>
                <div className="flex flex-wrap gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <label
                      key={n}
                      className={cn(
                        "flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border text-sm font-semibold",
                        puntajes[p.id] === n
                          ? "border-navy-800 bg-navy-950 text-white"
                          : "border-slate-300 bg-white",
                      )}
                    >
                      <input
                        type="radio"
                        className="sr-only"
                        name={p.id}
                        checked={puntajes[p.id] === n}
                        onChange={() => setPuntajes((x) => ({ ...x, [p.id]: n }))}
                      />
                      {n}
                    </label>
                  ))}
                  <span className="self-center text-xs text-grafito-600">
                    1 = muy en desacuerdo · 5 = muy de acuerdo
                  </span>
                </div>
              </fieldset>
            ))}
            <Field etiqueta="Comentario (opcional)">
              <textarea
                className={cn(controlClase, "min-h-24")}
                value={comentario}
                onChange={(ev) => setComentario(ev.target.value)}
              />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" disabled={!completas || m.isPending}>
                Enviar respuestas
              </Button>
            </div>
          </form>
        </Card>
      )}
    </AppShell>
  );
}

export function EncuestasResultadosPage() {
  const [periodo, setPeriodo] = useState("");
  const q = useResultadosEncuesta(periodo);
  const d = q.data;
  return (
    <AppShell activo="/encuestas-resultados">
      <PageHeader
        titulo="Resultados de encuestas"
        descripcion="Promedios por asesor (1 a 5). Se muestran desde un mínimo de respuestas para cuidar el anonimato."
      />
      <Card className="mb-4 p-4">
        <Select label="Período" value={periodo} onChange={setPeriodo}>
          <option value="">Todos</option>
          {(d?.periodos ?? []).map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
      </Card>
      {q.isPending ? (
        <Card className="p-5 text-sm text-grafito-600">Cargando…</Card>
      ) : !d || d.items.length === 0 ? (
        <EmptyState titulo="Aún no hay respuestas" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {d.items.map((r) => (
            <Card key={`${r.asesorId}-${r.periodo}`}>
              <CardEncabezado
                titulo={r.asesor}
                descripcion={`Período ${r.periodo} · ${r.respuestas} respuesta${r.respuestas === 1 ? "" : "s"}`}
                accion={
                  r.promedioGeneral !== null ? (
                    <span className="text-2xl font-bold text-navy-950">{r.promedioGeneral}</span>
                  ) : null
                }
              />
              <div className="space-y-3 p-4 text-sm">
                {!r.visibles ? (
                  <p className="text-grafito-600">
                    Se muestran con al menos {r.minimo} respuestas (hay {r.respuestas}).
                  </p>
                ) : (
                  <>
                    <ul className="space-y-2">
                      {r.preguntas.map((p) => (
                        <li key={p.texto}>
                          <div className="flex justify-between gap-2">
                            <span>{p.texto}</span>
                            <strong className="tabular-nums">{p.promedio ?? "—"}</strong>
                          </div>
                          <div className="mt-1 h-1.5 rounded bg-slate-100">
                            <div
                              className="h-1.5 rounded bg-navy-800"
                              style={{ width: `${((p.promedio ?? 0) / 5) * 100}%` }}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                    {r.comentarios.length > 0 && (
                      <div>
                        <p className="mb-1 text-xs font-semibold uppercase text-grafito-600">
                          Comentarios
                        </p>
                        <ul className="list-disc space-y-1 pl-5">
                          {r.comentarios.map((c) => (
                            <li key={c}>{c}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
