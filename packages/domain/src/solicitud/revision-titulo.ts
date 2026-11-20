/**
 * Revisión del título (CR-MOD-OBT-001 §3). Funciones puras, sin I/O ni
 * dependencias: las usa la web (Mesa de Partes y detalle de solicitud) para
 * subrayar posibles errores. Nunca corrigen solas: devuelven sugerencias que
 * el usuario decide aplicar o ignorar.
 *
 * - `revisarFormatoTitulo`: reglas ortotipográficas (espacios, puntuación,
 *   mayúsculas, signos sin cerrar, palabras repetidas).
 * - `palabrasRevisables` + `variantesOrtograficasEs`: apoyo al corrector
 *   ortográfico (diccionarios Hunspell en el navegador).
 */

export type TipoSugerenciaTitulo = "ortografia" | "formato";

export interface SugerenciaTitulo {
  /** Rango [inicio, fin) sobre el texto analizado. */
  inicio: number;
  fin: number;
  tipo: TipoSugerenciaTitulo;
  mensaje: string;
  /** Reemplazos propuestos para el rango (vacío = solo aviso). */
  reemplazos: string[];
}

export interface PalabraTitulo {
  palabra: string;
  inicio: number;
  fin: number;
}

const LETRA = /\p{L}/u;
const MAYUSCULA = /\p{Lu}/u;

function capitalizar(s: string): string {
  return s.charAt(0).toLocaleUpperCase("es") + s.slice(1);
}

/** Pasa un texto a tipo oración (solo la primera letra en mayúscula). */
export function aTipoOracion(texto: string): string {
  const minus = texto.toLocaleLowerCase("es");
  const i = minus.search(LETRA);
  if (i < 0) return minus;
  return minus.slice(0, i) + minus.charAt(i).toLocaleUpperCase("es") + minus.slice(i + 1);
}

/** Palabras (letras Unicode, con apóstrofo interno) y su posición en el texto. */
export function tokenizarPalabras(texto: string): PalabraTitulo[] {
  const out: PalabraTitulo[] = [];
  for (const m of texto.matchAll(/\p{L}+(?:['’]\p{L}+)*/gu)) {
    const inicio = m.index ?? 0;
    out.push({ palabra: m[0], inicio, fin: inicio + m[0].length });
  }
  return out;
}

/**
 * Palabras que vale la pena pasar por el diccionario. Se omiten siglas
 * (UNSA, TIC), palabras de una letra y nombres propios (mayúscula inicial que
 * no inicia el título ni una oración), para reducir falsos positivos.
 */
export function palabrasRevisables(texto: string): PalabraTitulo[] {
  return tokenizarPalabras(texto).filter(({ palabra, inicio }) => {
    if (palabra.length < 2) return false;
    if (palabra === palabra.toLocaleUpperCase("es")) return false; // sigla o texto en mayúsculas
    const inicial = palabra.charAt(0);
    if (MAYUSCULA.test(inicial)) {
      const previo = texto.slice(0, inicio).trimEnd();
      const iniciaOracion = previo === "" || /[.:?!¿¡"“(]$/.test(previo);
      if (!iniciaOracion) return false; // probable nombre propio
    }
    return true;
  });
}

const TILDE: Readonly<Record<string, string>> = { a: "á", e: "é", i: "í", o: "ó", u: "ú" };
const SIN_TILDE: Readonly<Record<string, string>> = { á: "a", é: "e", í: "i", ó: "o", ú: "u" };

/** Confusiones frecuentes del español (una sustitución por candidato). */
const CONFUSIONES: ReadonlyArray<readonly [string, string]> = [
  ["s", "c"],
  ["c", "s"],
  ["s", "z"],
  ["z", "s"],
  ["c", "z"],
  ["z", "c"],
  ["b", "v"],
  ["v", "b"],
  ["y", "ll"],
  ["ll", "y"],
  ["g", "j"],
  ["j", "g"],
  ["x", "s"],
];

const TERMINACIONES: ReadonlyArray<readonly [RegExp, string]> = [
  [/[sz]i[oó]n$/, "ción"],
  [/ci[oó]n$/, "ción"],
  [/si[oó]n$/, "sión"],
  [/[sz]iones$/, "ciones"],
];

/**
 * Candidatos a 1–2 cambios típicos (s/c/z, b/v, y/ll, g/j, h, tildes) que
 * Hunspell no sugiere por estar a más de una edición. El llamador conserva
 * solo los que el diccionario reconoce. Respeta la mayúscula inicial.
 */
export function variantesOrtograficasEs(palabra: string): string[] {
  const p = palabra.toLocaleLowerCase("es");
  const base = new Set<string>([p]);

  for (const [re, r] of TERMINACIONES) if (re.test(p)) base.add(p.replace(re, r));
  if (p.startsWith("h")) base.add(p.slice(1));
  else base.add(`h${p}`);
  for (const [de, a] of CONFUSIONES) {
    let i = p.indexOf(de);
    while (i >= 0) {
      base.add(p.slice(0, i) + a + p.slice(i + de.length));
      i = p.indexOf(de, i + 1);
    }
  }

  const todos = new Set<string>(base);
  for (const c of base) {
    const desacentuada = [...c].map((ch) => SIN_TILDE[ch] ?? ch).join("");
    todos.add(desacentuada);
    for (let i = 0; i < desacentuada.length; i++) {
      const con = TILDE[desacentuada.charAt(i)];
      if (con) todos.add(desacentuada.slice(0, i) + con + desacentuada.slice(i + 1));
    }
  }
  todos.delete(p);

  const mayus = MAYUSCULA.test(palabra.charAt(0));
  return [...todos].map((c) => (mayus ? capitalizar(c) : c));
}

/** Reglas de formato del título (no dependen de diccionarios). */
export function revisarFormatoTitulo(texto: string): SugerenciaTitulo[] {
  const out: SugerenciaTitulo[] = [];
  const agregar = (s: SugerenciaTitulo) => out.push(s);

  // 1. Título íntegro en MAYÚSCULAS → tipo oración.
  const letras = [...texto].filter((c) => LETRA.test(c));
  const mayus = letras.filter((c) => MAYUSCULA.test(c)).length;
  const todoMayus = letras.length >= 12 && mayus / letras.length > 0.8;
  if (todoMayus) {
    const ini = texto.length - texto.trimStart().length;
    agregar({
      inicio: ini,
      fin: texto.trimEnd().length,
      tipo: "formato",
      mensaje: "El título está en MAYÚSCULAS. Se recomienda escribirlo en tipo oración.",
      reemplazos: [aTipoOracion(texto.trim())],
    });
  }

  // 2. Espacios al inicio o al final.
  const inicioEsp = /^\s+/.exec(texto);
  if (inicioEsp && texto.trim() !== "") {
    agregar({
      inicio: 0,
      fin: inicioEsp[0].length,
      tipo: "formato",
      mensaje: "Espacios al inicio del título.",
      reemplazos: [""],
    });
  }
  const finEsp = /\s+$/.exec(texto);
  if (finEsp && texto.trim() !== "") {
    agregar({
      inicio: finEsp.index,
      fin: texto.length,
      tipo: "formato",
      mensaje: "Espacios al final del título.",
      reemplazos: [""],
    });
  }

  // 3. Espacios dobles internos.
  const contenido = texto.trimEnd();
  for (const m of contenido.matchAll(/(?<=\S) {2,}(?=\S)/g)) {
    const i = m.index ?? 0;
    agregar({
      inicio: i,
      fin: i + m[0].length,
      tipo: "formato",
      mensaje: "Espacio doble.",
      reemplazos: [" "],
    });
  }

  // 4. Espacio antes de signo de puntuación.
  for (const m of texto.matchAll(/(?<=\S)[ \t]+([,;:.)\]?!])/g)) {
    const i = m.index ?? 0;
    agregar({
      inicio: i,
      fin: i + m[0].length,
      tipo: "formato",
      mensaje: "Sobra el espacio antes del signo de puntuación.",
      reemplazos: [m[1] ?? ""],
    });
  }

  // 5. Falta espacio después de coma, punto y coma o dos puntos.
  for (const m of texto.matchAll(/([,;:])(?=\p{L})/gu)) {
    const i = m.index ?? 0;
    agregar({
      inicio: i,
      fin: i + 1,
      tipo: "formato",
      mensaje: "Falta un espacio después del signo.",
      reemplazos: [`${m[1]} `],
    });
  }

  // 6. Punto final (los títulos no lo llevan; se respetan los puntos suspensivos).
  const fin = /(?<!\.)\.\s*$/.exec(texto);
  if (fin) {
    agregar({
      inicio: fin.index,
      fin: fin.index + 1,
      tipo: "formato",
      mensaje: "Los títulos no llevan punto final.",
      reemplazos: [""],
    });
  }

  // 7. Primera letra en minúscula.
  const primera = texto.search(LETRA);
  if (primera >= 0 && !todoMayus) {
    const c = texto.charAt(primera);
    if (c !== c.toLocaleUpperCase("es")) {
      agregar({
        inicio: primera,
        fin: primera + 1,
        tipo: "formato",
        mensaje: "El título debe iniciar con mayúscula.",
        reemplazos: [c.toLocaleUpperCase("es")],
      });
    }
  }

  // 8. Palabra repetida consecutiva ("de de").
  const palabras = tokenizarPalabras(texto);
  for (let k = 1; k < palabras.length; k++) {
    const a = palabras[k - 1];
    const b = palabras[k];
    if (!a || !b) continue;
    const entre = texto.slice(a.fin, b.inicio);
    if (
      /^\s+$/.test(entre) &&
      a.palabra.toLocaleLowerCase("es") === b.palabra.toLocaleLowerCase("es")
    ) {
      agregar({
        inicio: a.fin,
        fin: b.fin,
        tipo: "formato",
        mensaje: `Palabra repetida: «${b.palabra}».`,
        reemplazos: [""],
      });
    }
  }

  // 9. Paréntesis y comillas sin cerrar (solo aviso).
  const pila: number[] = [];
  for (let i = 0; i < texto.length; i++) {
    if (texto[i] === "(") pila.push(i);
    else if (texto[i] === ")") {
      if (pila.length > 0) pila.pop();
      else
        agregar({
          inicio: i,
          fin: i + 1,
          tipo: "formato",
          mensaje: "Paréntesis de cierre sin apertura.",
          reemplazos: [],
        });
    }
  }
  for (const i of pila) {
    agregar({
      inicio: i,
      fin: i + 1,
      tipo: "formato",
      mensaje: "Paréntesis sin cerrar.",
      reemplazos: [],
    });
  }
  const comillas = [...texto.matchAll(/"/g)].map((m) => m.index ?? 0);
  const ultimaComilla = comillas.at(-1);
  if (comillas.length % 2 === 1 && ultimaComilla !== undefined) {
    agregar({
      inicio: ultimaComilla,
      fin: ultimaComilla + 1,
      tipo: "formato",
      mensaje: "Comillas sin cerrar.",
      reemplazos: [],
    });
  }

  return out.sort((x, y) => x.inicio - y.inicio);
}

/**
 * Une sugerencias de formato y ortografía descartando las que se solapan.
 * A igual inicio gana el rango más largo (una palabra mal escrita prima sobre
 * la regla de su primera letra); si lo descartado era un cambio de un solo
 * carácter al inicio (p. ej. la mayúscula inicial), se incorpora a los
 * reemplazos de la sugerencia que queda, para resolver ambas con un clic.
 */
export function combinarSugerencias(
  ...grupos: ReadonlyArray<readonly SugerenciaTitulo[]>
): SugerenciaTitulo[] {
  const todas = grupos
    .flat()
    .sort((a, b) => a.inicio - b.inicio || b.fin - a.fin || (a.tipo === "formato" ? -1 : 1));
  const out: SugerenciaTitulo[] = [];
  let limite = -1;
  for (const s of todas) {
    if (s.inicio < limite) {
      const previa = out.at(-1);
      const unCaracter = s.fin - s.inicio === 1 && s.reemplazos.length === 1;
      if (previa && unCaracter && previa.inicio === s.inicio && previa.reemplazos.length > 0) {
        const c = s.reemplazos[0] ?? "";
        out[out.length - 1] = {
          ...previa,
          reemplazos: previa.reemplazos.map((r) => c + r.slice(1)),
        };
      }
      continue;
    }
    out.push(s);
    limite = Math.max(s.fin, s.inicio + 1);
  }
  return out;
}

/** Aplica un reemplazo y devuelve el nuevo texto y la posición del cursor. */
export function aplicarSugerencia(
  texto: string,
  s: Pick<SugerenciaTitulo, "inicio" | "fin">,
  reemplazo: string,
): { texto: string; cursor: number } {
  return {
    texto: texto.slice(0, s.inicio) + reemplazo + texto.slice(s.fin),
    cursor: s.inicio + reemplazo.length,
  };
}
