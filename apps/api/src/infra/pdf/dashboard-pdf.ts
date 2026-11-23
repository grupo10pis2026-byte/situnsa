import type { DashboardTallerDTO } from "@pis/contracts";
import { PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from "pdf-lib";

/**
 * Adenda 1.2 N2: PDF del dashboard del taller con los filtros activos, la
 * fecha de generación y el título del taller (o «Todos los talleres»).
 * Los gráficos se dibujan con los mismos números del endpoint.
 * Colores: paleta categórica validada (skill dataviz) y paleta de estado
 * (al día / pendiente / vencida), siempre con su texto al lado.
 */

const A4 = { ancho: 595.28, alto: 841.89 };
const M = 48;
const ANCHO = A4.ancho - M * 2;
const hex = (h: string) =>
  rgb(
    Number.parseInt(h.slice(1, 3), 16) / 255,
    Number.parseInt(h.slice(3, 5), 16) / 255,
    Number.parseInt(h.slice(5, 7), 16) / 255,
  );
const TINTA = hex("#0b0b0b");
const TINTA2 = hex("#52514e");
const MUTED = hex("#898781");
const GRID = hex("#e1e0d9");
const GUINDA = hex("#7a0019");
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"].map(hex);
const ESTADO = { good: hex("#0ca30c"), warning: hex("#fab219"), critical: hex("#d03b3b") };

function texto(f: PDFFont): (t: string) => string {
  const ok = new Set(f.getCharacterSet());
  return (t) =>
    [...t]
      .map((c) =>
        ok.has(c.codePointAt(0) ?? 0) ? c : c === "–" || c === "—" ? "-" : c === "·" ? "-" : "?",
      )
      .join("");
}

class Hoja {
  page: PDFPage;
  y: number;
  constructor(
    private readonly pdf: PDFDocument,
    private readonly pie: (p: PDFPage) => void,
  ) {
    this.page = pdf.addPage([A4.ancho, A4.alto]);
    this.y = A4.alto - M;
  }
  asegurar(alto: number) {
    if (this.y - alto > M + 30) return;
    this.pie(this.page);
    this.page = this.pdf.addPage([A4.ancho, A4.alto]);
    this.y = A4.alto - M;
  }
}

export async function renderDashboardPdf(
  d: DashboardTallerDTO,
  filtrosTexto: string,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Dashboard del taller - ${d.titulo}`);
  pdf.setAuthor("SITUNSA · Unidad de Segunda Especialidad FIPS UNSA");
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const c = texto(sans);
  const generado = new Date(d.generadoAt).toLocaleString("es-PE", { timeZone: "America/Lima" });
  const pie = (p: PDFPage) => {
    p.drawLine({
      start: { x: M, y: M - 6 },
      end: { x: A4.ancho - M, y: M - 6 },
      thickness: 0.5,
      color: MUTED,
    });
    p.drawText(c(`Dashboard del taller · ${d.titulo} · generado el ${generado}`), {
      x: M,
      y: M - 18,
      size: 8,
      font: sans,
      color: MUTED,
    });
  };
  const h = new Hoja(pdf, pie);
  const escribir = (
    t: string,
    o: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; x?: number } = {},
  ) => {
    const size = o.size ?? 10;
    h.asegurar(size + 6);
    h.page.drawText(c(t), {
      x: o.x ?? M,
      y: h.y - size,
      size,
      font: o.font ?? sans,
      color: o.color ?? TINTA,
    });
    h.y -= size + 6;
  };
  const titulo = (t: string) => {
    h.asegurar(60);
    h.y -= 8;
    escribir(t, { size: 12, font: bold, color: GUINDA });
  };
  /** Barras horizontales con etiqueta a la izquierda y valor visible a la derecha. */
  const barras = (
    filas: Array<{
      etiqueta: string;
      valor: number;
      max: number;
      texto: string;
      color: ReturnType<typeof rgb>;
    }>,
  ) => {
    const ancho = ANCHO - 150 - 90;
    for (const f of filas) {
      h.asegurar(20);
      const y = h.y - 12;
      h.page.drawText(c(f.etiqueta), { x: M, y: y + 2, size: 9, font: sans, color: TINTA2 });
      h.page.drawRectangle({ x: M + 150, y, width: ancho, height: 10, color: GRID });
      const w = f.max > 0 ? Math.max(0, Math.min(1, f.valor / f.max)) * ancho : 0;
      if (w > 0) h.page.drawRectangle({ x: M + 150, y, width: w, height: 10, color: f.color });
      h.page.drawText(c(f.texto), {
        x: M + 150 + ancho + 8,
        y: y + 2,
        size: 9,
        font: bold,
        color: TINTA,
      });
      h.y -= 18;
    }
  };

  // Encabezado
  for (const l of [
    "UNIVERSIDAD NACIONAL DE SAN AGUSTÍN DE AREQUIPA",
    "FACULTAD DE INGENIERÍA DE PRODUCCIÓN Y SERVICIOS · UNIDAD DE SEGUNDA ESPECIALIDAD",
  ])
    escribir(l, { size: 8, font: bold, color: MUTED });
  h.page.drawLine({
    start: { x: M, y: h.y },
    end: { x: A4.ancho - M, y: h.y },
    thickness: 1,
    color: GUINDA,
  });
  h.y -= 12;
  escribir(`Dashboard del taller · ${d.titulo}`, { size: 16, font: bold, color: hex("#0b1f30") });
  escribir(`Filtros: ${filtrosTexto}`, { size: 9, color: TINTA2 });
  escribir(`Generado el ${generado} (hora de Perú)`, { size: 9, color: TINTA2 });

  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)} %` : "—");

  titulo("Inscripción");
  barras([
    {
      etiqueta: "Proyectos / cupo",
      valor: d.inscripcion.proyectos,
      max: d.inscripcion.cupo,
      texto: `${d.inscripcion.proyectos} de ${d.inscripcion.cupo}`,
      color: SERIES[0] ?? TINTA,
    },
  ]);
  escribir(`Alumnos inscritos (activos): ${d.inscripcion.alumnos}`, { size: 9, color: TINTA2 });

  titulo("Asistencia");
  escribir(
    `Promedio: ${d.asistencia.promedio === null ? "—" : `${d.asistencia.promedio} %`} · con faltas consecutivas: ${d.asistencia.conFaltasConsecutivas}`,
    { size: 10 },
  );
  if (d.asistencia.porGrupo.length)
    barras(
      d.asistencia.porGrupo.map((g) => ({
        etiqueta: g.grupo,
        valor: g.promedio ?? 0,
        max: 100,
        texto: g.promedio === null ? "—" : `${g.promedio} %`,
        color: SERIES[0] ?? TINTA,
      })),
    );
  for (const a of d.asistencia.alumnosConFaltas)
    escribir(`· ${a.nombre} (${a.proyecto})`, { size: 9, color: TINTA2 });

  titulo("Plan de tesis");
  const totalPlan =
    d.plan.presentados +
    d.plan.aprobados +
    d.plan.observados +
    d.plan.noPresentados +
    d.plan.pendientes;
  barras(
    [
      ["Aprobados", d.plan.aprobados],
      ["Presentados (por revisar)", d.plan.presentados],
      ["Observados", d.plan.observados],
      ["No presentados", d.plan.noPresentados],
      ["Pendientes", d.plan.pendientes],
    ].map(([e, v], i) => ({
      etiqueta: String(e),
      valor: Number(v),
      max: totalPlan,
      texto: `${v} (${pct(Number(v), totalPlan)})`,
      color: SERIES[i] ?? TINTA,
    })),
  );

  titulo("Avances (entregadas y aprobadas por hito)");
  for (const a of d.avances) {
    barras([
      {
        etiqueta: `${a.nombre} · entregadas`,
        valor: a.entregadas,
        max: a.proyectos,
        texto: `${a.entregadas}/${a.proyectos}`,
        color: SERIES[0] ?? TINTA,
      },
      {
        etiqueta: `${a.nombre} · aprobadas`,
        valor: a.aprobadas,
        max: a.proyectos,
        texto: `${a.aprobadas}/${a.proyectos}`,
        color: SERIES[1] ?? TINTA,
      },
    ]);
  }

  titulo("Pensiones");
  const totalPen =
    d.pensiones.alDia.cantidad + d.pensiones.pendientes.cantidad + d.pensiones.vencidas.cantidad;
  barras([
    {
      etiqueta: "Al día (pagadas)",
      valor: d.pensiones.alDia.cantidad,
      max: totalPen,
      texto: `${d.pensiones.alDia.cantidad} · S/ ${d.pensiones.alDia.monto}`,
      color: ESTADO.good,
    },
    {
      etiqueta: "Pendientes",
      valor: d.pensiones.pendientes.cantidad,
      max: totalPen,
      texto: `${d.pensiones.pendientes.cantidad} · S/ ${d.pensiones.pendientes.monto}`,
      color: ESTADO.warning,
    },
    {
      etiqueta: "Vencidas / con deuda",
      valor: d.pensiones.vencidas.cantidad,
      max: totalPen,
      texto: `${d.pensiones.vencidas.cantidad} · S/ ${d.pensiones.vencidas.monto}`,
      color: ESTADO.critical,
    },
  ]);

  titulo("Alertas activas");
  for (const a of d.alertas) escribir(`${a.etiqueta}: ${a.cantidad}`, { size: 10 });

  titulo("Sesiones");
  barras([
    {
      etiqueta: "Dictadas",
      valor: d.sesiones.realizadas,
      max: d.sesiones.total,
      texto: `${d.sesiones.realizadas} de ${d.sesiones.total}`,
      color: SERIES[0] ?? TINTA,
    },
  ]);

  if (d.comparacion.length) {
    titulo("Comparación por taller");
    escribir(
      "Taller · proyectos/cupo · asistencia · planes aprobados · pensiones con deuda · alertas",
      { size: 8, font: bold, color: TINTA2 },
    );
    for (const t of d.comparacion)
      escribir(
        `${t.nombre} (${t.estado.replace(/_/g, " ").toLowerCase()}) · ${t.proyectos}/${t.cupo} · ${t.asistencia === null ? "—" : `${t.asistencia} %`} · ${t.planesAprobados} · ${t.vencidas} · ${t.alertas}`,
        { size: 9 },
      );
  }
  pie(h.page);
  return pdf.save();
}
