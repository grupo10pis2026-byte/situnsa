/**
 * Plantilla de correo institucional (HU-0058/0062, CR-MOD-OBT-001 §2).
 * Pura (testeable). Todo el contenido dinámico se escapa: los casos de uso
 * NO envían HTML; describen el correo con bloques estructurados (saludo,
 * párrafos, datos clave, lista, botón, nota) y la plantilla les da formato.
 * Única marca admitida en el texto: `**negrita**`.
 *
 * Colores = tokens de `apps/web/src/index.css` (@theme). Estilos en línea y
 * tablas para compatibilidad con Gmail/Outlook.
 */

export type VarianteCorreo = "informativo" | "exito" | "observacion" | "alerta";

export interface DatoCorreo {
  etiqueta: string;
  valor: string;
}

export interface ListaCorreo {
  titulo: string;
  items: readonly string[];
}

export interface DatosCorreo {
  titulo: string;
  /** Párrafos separados por línea en blanco; admite `**negrita**`. */
  texto: string;
  codigo?: string | null;
  estado?: string | null;
  enlace?: string | null;
  textoEnlace?: string | null;
  variante?: VarianteCorreo | null;
  /** Etiqueta corta del aviso (p. ej. "Solicitud observada"). */
  etiqueta?: string | null;
  saludo?: string | null;
  datos?: readonly DatoCorreo[] | null;
  lista?: ListaCorreo | null;
  /** Texto pequeño bajo el botón (vigencia del enlace, avisos). */
  nota?: string | null;
}

export interface CorreoRenderizado {
  html: string;
  texto: string;
}

/** Tokens de color de la app (index.css). */
export const COLORES_CORREO = {
  navy950: "#0b1f30",
  navy800: "#123149",
  navy100: "#d3e0e8",
  grafito900: "#1b2228",
  grafito600: "#4b5563",
  guinda800: "#610617",
  guinda700: "#78152f",
  dorado500: "#d1a84b",
  verde700: "#197648",
  verde100: "#e5f2e9",
  aviso100: "#fef3c7",
  aviso800: "#92400e",
  rojo100: "#fee2e2",
  rojo700: "#b91c1c",
  fondo: "#eef1f4",
  borde: "#e2e8f0",
} as const;

const ACENTO: Readonly<Record<VarianteCorreo, { texto: string; fondo: string }>> = {
  informativo: { texto: COLORES_CORREO.navy800, fondo: COLORES_CORREO.navy100 },
  exito: { texto: COLORES_CORREO.verde700, fondo: COLORES_CORREO.verde100 },
  observacion: { texto: COLORES_CORREO.aviso800, fondo: COLORES_CORREO.aviso100 },
  alerta: { texto: COLORES_CORREO.rojo700, fondo: COLORES_CORREO.rojo100 },
};

export function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escapa y luego convierte `**x**` en <strong> (seguro: se aplica sobre texto ya escapado). */
function enriquecer(valor: string): string {
  return escaparHtml(valor)
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#0b1f30">$1</strong>')
    .replace(/\n/g, "<br>");
}

/** Versión texto plano: quita las marcas de negrita. */
function plano(valor: string): string {
  return valor.replace(/\*\*(.+?)\*\*/g, "$1");
}

/** Solo enlaces http(s): evita `javascript:` u otros esquemas en el HTML. */
function enlaceSeguro(url: string | null | undefined): string | null {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : null;
}

const ESTADO_LEGIBLE: Readonly<Record<string, string>> = {
  REGISTRADO: "Registrado",
  EN_PLAN: "En evaluación del plan",
  PLAN_APROBADO: "Plan aprobado",
  EN_BORRADOR: "Borrador en revisión",
  EN_DICTAMEN: "En dictamen de jurados",
  APTO_SUSTENTACION: "Apto para sustentación",
  SUSTENTADO: "Sustentado",
  EN_VALIDACION: "En validaciones institucionales",
  EN_APROBACION: "En aprobaciones institucionales",
  TITULO_EMITIDO: "Título emitido",
  OBSERVADO: "Observado",
  DESAPROBADO_TRUNCO: "Desaprobado",
  ANULADO: "Anulado",
};

export function renderizarCorreo(d: DatosCorreo): CorreoRenderizado {
  const c = COLORES_CORREO;
  const variante = d.variante ?? "informativo";
  const acento = ACENTO[variante];
  const enlace = enlaceSeguro(d.enlace);
  const textoBoton = d.textoEnlace ?? "Ingresar al portal";
  const estado = d.estado ? (ESTADO_LEGIBLE[d.estado] ?? d.estado) : null;

  const datos: DatoCorreo[] = [
    ...(d.codigo ? [{ etiqueta: "Expediente", valor: d.codigo }] : []),
    ...(estado ? [{ etiqueta: "Estado", valor: estado }] : []),
    ...(d.datos ?? []),
  ];
  const parrafosTexto = d.texto.split(/\n{2,}/).filter((p) => p.trim() !== "");
  const items = d.lista?.items.filter((i) => i.trim() !== "") ?? [];

  /* ------------------------------ Texto plano ----------------------------- */
  const texto = [
    d.titulo,
    "",
    ...(d.saludo ? [d.saludo, ""] : []),
    ...parrafosTexto.flatMap((p) => [plano(p), ""]),
    ...datos.map((x) => `${x.etiqueta}: ${x.valor}`),
    ...(items.length > 0 && d.lista
      ? ["", `${d.lista.titulo}:`, ...items.map((i) => `  - ${plano(i)}`)]
      : []),
    ...(enlace ? ["", `${textoBoton}: ${enlace}`] : []),
    ...(d.nota ? ["", plano(d.nota)] : []),
    "",
    "Unidad de Segunda Especialidad — FIPS UNSA",
    "Este es un mensaje automático; no responda a este correo.",
  ].join("\n");

  /* --------------------------------- HTML --------------------------------- */
  const etiqueta = d.etiqueta
    ? `<p style="margin:0 0 12px"><span style="display:inline-block;background:${acento.fondo};color:${acento.texto};font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;padding:4px 10px;border-radius:999px">${escaparHtml(d.etiqueta)}</span></p>`
    : "";
  const saludo = d.saludo
    ? `<p style="margin:0 0 12px;font-size:14px;font-weight:600">${escaparHtml(d.saludo)}</p>`
    : "";
  const parrafos = parrafosTexto
    .map((p) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.6">${enriquecer(p)}</p>`)
    .join("");
  const tablaDatos =
    datos.length > 0
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid ${c.borde};border-radius:8px;border-collapse:separate">${datos
          .map(
            (x, i) =>
              `<tr><td style="padding:9px 14px;font-size:12px;color:${c.grafito600};width:40%;${i > 0 ? `border-top:1px solid ${c.borde};` : ""}">${escaparHtml(x.etiqueta)}</td><td style="padding:9px 14px;font-size:14px;font-weight:700;color:${c.navy950};${i > 0 ? `border-top:1px solid ${c.borde};` : ""}">${escaparHtml(x.valor)}</td></tr>`,
          )
          .join("")}</table>`
      : "";
  const lista =
    items.length > 0 && d.lista
      ? `<div style="margin:16px 0;padding:14px 16px;background:${acento.fondo};border-left:4px solid ${acento.texto};border-radius:6px"><p style="margin:0 0 8px;font-size:13px;font-weight:700;color:${acento.texto}">${escaparHtml(d.lista.titulo)}</p><ul style="margin:0;padding-left:18px;color:${c.grafito900};font-size:13px;line-height:1.5">${items
          .map((i) => `<li style="margin:3px 0">${enriquecer(i)}</li>`)
          .join("")}</ul></div>`
      : "";
  const boton = enlace
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 8px"><tr><td style="background:${c.guinda800};border-radius:8px"><a href="${escaparHtml(enlace)}" style="display:inline-block;padding:12px 22px;color:#ffffff;font-weight:700;font-size:14px;text-decoration:none">${escaparHtml(textoBoton)}</a></td></tr></table><p style="margin:0 0 12px;font-size:11px;color:${c.grafito600};word-break:break-all">Si el botón no funciona, copie este enlace: <a href="${escaparHtml(enlace)}" style="color:${c.navy800}">${escaparHtml(enlace)}</a></p>`
    : "";
  const nota = d.nota
    ? `<p style="margin:12px 0 0;font-size:12px;color:${c.grafito600};line-height:1.5">${enriquecer(d.nota)}</p>`
    : "";

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escaparHtml(d.titulo)}</title></head>
<body style="margin:0;padding:0;background:${c.fondo};font-family:Inter,'Segoe UI',Arial,Helvetica,sans-serif;color:${c.grafito900}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.fondo}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${c.borde};border-radius:12px;border-collapse:separate;overflow:hidden">
<tr><td style="background:${c.navy950};padding:18px 28px">
<div style="font-size:11px;letter-spacing:1.5px;color:${c.navy100}">UNIVERSIDAD NACIONAL DE SAN AGUSTÍN DE AREQUIPA</div>
<div style="font-size:17px;font-weight:700;color:#ffffff;margin-top:2px">Sistema de Titulación · Segunda Especialidad FIPS</div>
</td></tr>
<tr><td style="height:4px;background:${c.dorado500};font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:28px">
${etiqueta}<h1 style="font-size:20px;line-height:1.3;margin:0 0 16px;color:${c.guinda700}">${escaparHtml(d.titulo)}</h1>
${saludo}${parrafos}${tablaDatos}${lista}${boton}${nota}
</td></tr>
<tr><td style="padding:16px 28px;background:#f8fafc;border-top:1px solid ${c.borde};font-size:11px;color:${c.grafito600};line-height:1.5">
Unidad de Segunda Especialidad — Facultad de Ingeniería de Producción y Servicios, UNSA.<br>Este es un mensaje automático; por favor no responda a este correo.
</td></tr>
</table></td></tr></table></body></html>`;

  return { html, texto };
}
