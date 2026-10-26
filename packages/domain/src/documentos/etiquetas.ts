/**
 * Inserción de etiquetas <<CAMPO>> (port de legacy-code/DocumentosExpedientes.js
 * `insertarDatosEnDocumento`): reemplaza solo etiquetas con dato, conserva
 * las vacías y las informa como pendientes (el legacy las pintaba de
 * amarillo; aquí el renderer las resalta). Puro, sin I/O.
 */

export interface Segmento {
  readonly texto: string;
  /** true = etiqueta sin dato (se resalta en el documento generado). */
  readonly pendiente: boolean;
}

const PATRON = /<<([^<>]+)>>/g;

/** Normaliza el nombre de la etiqueta: mayúsculas, sin espacios extremos. */
export function claveEtiqueta(nombre: string): string {
  return nombre.trim().replace(/\s+/g, " ").toUpperCase();
}

/** Etiquetas presentes en un texto (claves normalizadas, sin duplicados). */
export function extraerEtiquetas(texto: string): string[] {
  const vistas = new Set<string>();
  for (const m of texto.matchAll(PATRON)) {
    if (m[1]) vistas.add(claveEtiqueta(m[1]));
  }
  return [...vistas];
}

/**
 * Divide el texto en segmentos: los datos insertados y las etiquetas
 * pendientes (sin dato o vacías) por separado, en orden.
 */
export function segmentar(
  texto: string,
  datos: Readonly<Record<string, string>>,
): { segmentos: Segmento[]; pendientes: string[] } {
  const segmentos: Segmento[] = [];
  const pendientes = new Set<string>();
  let ultimo = 0;
  for (const m of texto.matchAll(PATRON)) {
    const inicio = m.index ?? 0;
    if (inicio > ultimo) segmentos.push({ texto: texto.slice(ultimo, inicio), pendiente: false });
    const clave = claveEtiqueta(m[1] ?? "");
    const valor = (datos[clave] ?? "").trim();
    if (valor) {
      segmentos.push({ texto: valor, pendiente: false });
    } else {
      segmentos.push({ texto: `<<${clave}>>`, pendiente: true });
      pendientes.add(clave);
    }
    ultimo = inicio + m[0].length;
  }
  if (ultimo < texto.length) segmentos.push({ texto: texto.slice(ultimo), pendiente: false });
  return { segmentos, pendientes: [...pendientes] };
}

/** Versión texto plano de segmentar (útil para correos y pruebas). */
export function insertarEtiquetas(
  texto: string,
  datos: Readonly<Record<string, string>>,
): { texto: string; pendientes: string[] } {
  const { segmentos, pendientes } = segmentar(texto, datos);
  return { texto: segmentos.map((s) => s.texto).join(""), pendientes };
}

export const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

/**
 * Convierte cualquier fecha válida ("2026-09-01", "2026-09-01T...", "01/09/2026")
 * al formato formal civil español: "1 de septiembre de 2026".
 * Si ya viene en formato largo español o no es reconocible, preserva el texto limpio.
 */
export function fechaLarga(iso: string | null | undefined): string {
  if (!iso) return "";
  const texto = iso.trim();
  if (!texto) return "";

  // 1. Formato ISO "YYYY-MM-DD" o con timestamp "YYYY-MM-DDTHH:mm:ss..."
  const mIso = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto);
  if (mIso?.[1] && mIso[2] && mIso[3]) {
    const mes = MESES[Number.parseInt(mIso[2], 10) - 1];
    if (mes) return `${Number.parseInt(mIso[3], 10)} de ${mes} de ${mIso[1]}`;
  }

  // 2. Formato común "DD/MM/YYYY" o "DD-MM-YYYY"
  const mSlash = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(texto);
  if (mSlash?.[1] && mSlash[2] && mSlash[3]) {
    const mes = MESES[Number.parseInt(mSlash[2], 10) - 1];
    if (mes) return `${Number.parseInt(mSlash[1], 10)} de ${mes} de ${mSlash[3]}`;
  }

  // 3. Ya está en texto formal o libre
  return texto;
}

/**
 * Convierte cualquier representación de fecha a formato ISO estricto "YYYY-MM-DD",
 * requerido por los controles nativos `<input type="date">`.
 * Acepta: "YYYY-MM-DD", "YYYY-MM-DDTHH:mm:ss...", "16 de octubre de 2026", "16/10/2026".
 */
export function fechaIso(texto: string | null | undefined): string {
  if (!texto) return "";
  const limpio = texto.trim();
  if (!limpio) return "";

  // 1. "YYYY-MM-DD" (o ISO timestamp)
  const mIso = /^(\d{4})-(\d{2})-(\d{2})/.exec(limpio);
  if (mIso?.[1] && mIso[2] && mIso[3]) {
    return `${mIso[1]}-${mIso[2]}-${mIso[3]}`;
  }

  // 2. "DD/MM/YYYY" o "DD-MM-YYYY"
  const mSlash = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(limpio);
  if (mSlash?.[1] && mSlash[2] && mSlash[3]) {
    const d = mSlash[1].padStart(2, "0");
    const m = mSlash[2].padStart(2, "0");
    return `${mSlash[3]}-${m}-${d}`;
  }

  // 3. "16 de octubre de 2026" o "16 de octubre del 2026"
  const mTexto = /^(\d{1,2})\s+de\s+([a-záéíóú]+)(?:\s+del?|\s+de)?\s+(\d{4})/i.exec(limpio);
  if (mTexto?.[1] && mTexto[2] && mTexto[3]) {
    const mesNombre = mTexto[2].toLowerCase();
    const idx = (MESES as readonly string[]).indexOf(mesNombre);
    if (idx !== -1) {
      const d = mTexto[1].padStart(2, "0");
      const m = String(idx + 1).padStart(2, "0");
      return `${mTexto[3]}-${m}-${d}`;
    }
  }

  return "";
}

/**
 * Convierte cualquier fecha a formato civil latinoamericano estricto: "DD/MM/AAAA".
 * Acepta: "2026-10-16", "2026-10-16T...", "16 de octubre de 2026", "16/10/2026".
 * Si no es reconocible, retorna la cadena limpia o vacía.
 */
export function fechaLatina(texto: string | null | undefined): string {
  if (!texto) return "";
  const iso = fechaIso(texto);
  if (!iso) return texto.trim();
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return texto.trim();
  return `${d}/${m}/${y}`;
}

/**
 * Normaliza horas a formato estricto 24h "HH:mm", requerido por `<input type="time">`.
 * Acepta: "9:00", "09:00", "09:00:00", "09:00 hrs", "14:30".
 */
export function horaLimpia(v: string | null | undefined): string {
  if (!v) return "";
  const limpio = v.trim();
  const m = /^(\d{1,2}):(\d{2})/.exec(limpio);
  if (!m?.[1] || !m[2]) return "";
  const h = m[1].padStart(2, "0");
  const min = m[2];
  return `${h}:${min}`;
}

/** Determina si una clave o etiqueta de documento representa una fecha. */
export function esEtiquetaFecha(clave: string): boolean {
  const k = clave.trim().toUpperCase();
  if (k.startsWith("FECHA") || k.includes("FECHA")) return true;
  if (k === "DIA" || k === "MES" || k === "ANIO" || k === "AÑO") return true;
  return false;
}

/** Determina si una clave o etiqueta de documento representa una hora. */
export function esEtiquetaHora(clave: string): boolean {
  const k = clave.trim().toUpperCase();
  return k.startsWith("HORA") || k.includes("HORA");
}

const PREFIJOS_GRADO: Record<string, string> = {
  dr: "Dr.",
  "dr.": "Dr.",
  dra: "Dra.",
  "dra.": "Dra.",
  mg: "Mg.",
  "mg.": "Mg.",
  mgtr: "Mgtr.",
  "mgtr.": "Mgtr.",
  msc: "MSc.",
  "msc.": "MSc.",
  "m.sc.": "MSc.",
  ing: "Ing.",
  "ing.": "Ing.",
  lic: "Lic.",
  "lic.": "Lic.",
  abg: "Abg.",
  "abg.": "Abg.",
  bach: "Bach.",
  "bach.": "Bach.",
};

const CONECTORES_NOMBRE = new Set(["de", "del", "la", "las", "los", "y", "e"]);

/**
 * Normaliza nombres de autoridades y personas a Title Case formal,
 * preservando los prefijos de grado académico estándar ("Dr.", "Mg.", "Ing.", etc.).
 * Evita mayúsculas sostenidas en los documentos institucionales.
 */
export function formatoAutoridad(texto: string | null | undefined): string {
  if (!texto) return "";
  const partes = texto.trim().replace(/\s+/g, " ").split(" ");
  const primeraRaw = partes[0];
  if (!primeraRaw) return "";

  const resultado: string[] = [];
  let inicio = 0;

  const primera = primeraRaw.toLowerCase();
  const prefijo = PREFIJOS_GRADO[primera];
  if (prefijo) {
    resultado.push(prefijo);
    inicio = 1;
  }

  for (let i = inicio; i < partes.length; i++) {
    const p = partes[i];
    if (!p) continue;
    const pLower = p.toLowerCase();
    if (i > inicio && CONECTORES_NOMBRE.has(pLower)) {
      resultado.push(pLower);
    } else {
      resultado.push(p.charAt(0).toUpperCase() + p.slice(1).toLowerCase());
    }
  }

  return resultado.join(" ");
}
