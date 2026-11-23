import { BarChart3, Table2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { cn } from "../../utils/cn.js";
import { Card, CardEncabezado } from "./card.js";
import { EmptyState } from "./empty-state.js";

/**
 * Gráfico de barras horizontales (Adenda 1.2 N2).
 * Reglas (skill dataviz): una sola escala, barras finas ancladas a la base
 * con el extremo redondeado de 4px, valor siempre visible junto a la barra
 * (la paleta tiene un aviso de contraste), leyenda con 2+ series, el texto
 * nunca toma el color de la serie, vista de tabla y estado vacío.
 */

/** Paleta categórica validada (orden fijo, nunca rotada). */
export const SERIES_COLOR = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"] as const;
/** Paleta de estado: se usa siempre con icono y texto. */
export const ESTADO_COLOR = { bien: "#0ca30c", aviso: "#fab219", critico: "#d03b3b" } as const;

export type SerieBarra = { nombre: string; color: string };
export type FilaBarra = {
  id: string;
  etiqueta: string;
  /** Un valor por serie. */
  valores: number[];
  /** Texto visible por serie (por defecto, el número). */
  textos?: string[];
  /** Color por fila (series de estado); reemplaza al de la serie única. */
  color?: string;
  icono?: ReactNode;
  /** Enlace al detalle filtrado. */
  href?: string;
};

export function GraficoBarras({
  titulo,
  descripcion,
  series,
  filas,
  max,
  vacio = "Sin datos para los filtros elegidos.",
  pie,
}: {
  titulo: string;
  descripcion?: string;
  series: SerieBarra[];
  filas: FilaBarra[];
  /** Escala común (por defecto, el mayor valor). */
  max?: number;
  vacio?: string;
  pie?: ReactNode;
}) {
  const [tabla, setTabla] = useState(false);
  const tope = max ?? Math.max(0, ...filas.flatMap((f) => f.valores));
  const sinDatos = filas.length === 0 || filas.every((f) => f.valores.every((v) => v === 0));
  return (
    <Card>
      <CardEncabezado
        titulo={titulo}
        descripcion={descripcion}
        accion={
          sinDatos ? null : (
            <button
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-grafito-900 hover:bg-slate-100"
              onClick={() => setTabla((x) => !x)}
              type="button"
            >
              {tabla ? <BarChart3 size={13} /> : <Table2 size={13} />}
              {tabla ? "Ver gráfico" : "Ver tabla"}
            </button>
          )
        }
      />
      <div className="space-y-3 p-4 md:p-5">
        {sinDatos ? (
          <EmptyState titulo={vacio} />
        ) : tabla ? (
          <TablaBarras series={series} filas={filas} />
        ) : (
          <>
            {series.length >= 2 && <Leyenda series={series} />}
            <ul className="space-y-2.5">
              {filas.map((f) => (
                <li key={f.id} className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3">
                  <Etiqueta fila={f} />
                  <div className="relative space-y-1">
                    <Rejilla />
                    {f.valores.map((v, i) => {
                      const serie = series[i];
                      const color = (series.length === 1 ? f.color : undefined) ?? serie?.color;
                      const texto = f.textos?.[i] ?? String(v);
                      const ancho = tope > 0 ? Math.min(100, (v / tope) * 100) : 0;
                      return (
                        <div
                          key={serie?.nombre ?? i}
                          className="relative flex items-center gap-2"
                          title={`${f.etiqueta}${series.length > 1 ? ` · ${serie?.nombre}` : ""}: ${texto}`}
                        >
                          <div className="relative h-2.5 flex-1">
                            {ancho > 0 && (
                              <span
                                className="absolute inset-y-0 left-0 rounded-r-[4px]"
                                style={{ width: `${ancho}%`, backgroundColor: color }}
                              />
                            )}
                          </div>
                          <span className="w-24 shrink-0 text-xs font-semibold tabular-nums text-grafito-900">
                            {texto}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        {pie && <div className="text-xs text-grafito-600">{pie}</div>}
      </div>
    </Card>
  );
}

function Etiqueta({ fila }: { fila: FilaBarra }) {
  const contenido = (
    <span className="flex min-w-0 items-center gap-1.5">
      {fila.icono}
      <span className="truncate">{fila.etiqueta}</span>
    </span>
  );
  return fila.href ? (
    <a
      className="text-sm text-navy-800 underline-offset-2 hover:underline"
      href={fila.href}
      title={`Ver detalle: ${fila.etiqueta}`}
    >
      {contenido}
    </a>
  ) : (
    <span className="text-sm text-grafito-900">{contenido}</span>
  );
}

/** Líneas guía recesivas al 25/50/75 % del área de barras. */
function Rejilla() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 right-26">
      {[25, 50, 75].map((p) => (
        <span
          key={p}
          className="absolute inset-y-[-4px] w-px"
          style={{ left: `${p}%`, backgroundColor: "#e1e0d9" }}
        />
      ))}
    </div>
  );
}

export function Leyenda({ series }: { series: SerieBarra[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-grafito-900">
      {series.map((s) => (
        <li key={s.nombre} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: s.color }}
          />
          {s.nombre}
        </li>
      ))}
    </ul>
  );
}

function TablaBarras({ series, filas }: { series: SerieBarra[]; filas: FilaBarra[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="bg-navy-950 text-[11px] font-bold tracking-wider text-white uppercase">
            <th className="px-3 py-2">Indicador</th>
            {series.map((s) => (
              <th key={s.nombre} className="px-3 py-2 text-right">
                {s.nombre}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200/70">
          {filas.map((f) => (
            <tr key={f.id}>
              <td className={cn("px-3 py-1.5")}>{f.etiqueta}</td>
              {f.valores.map((v, i) => (
                <td key={series[i]?.nombre ?? i} className="px-3 py-1.5 text-right tabular-nums">
                  {f.textos?.[i] ?? v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
