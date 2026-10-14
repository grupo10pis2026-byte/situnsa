/**
 * Motor puro de POST /api/documentos/:id/analisis, invocado por analizar-documento.use-case.ts.
 * Solo recibe texto de páginas 1–3 y referencias esperadas; no lee PDF, DB ni proveedores de IA.
 */
export interface PaginaDocumento {
  numero: number;
  texto: string;
}

export interface IdentidadDocumento {
  nombre: string;
  dni?: string;
}

export interface DatosAnalisisDocumento {
  titulo: string;
  tesistas: readonly IdentidadDocumento[];
  asesor: IdentidadDocumento | null;
}

export interface HallazgoDocumento {
  tipo: string;
  mensaje: string;
  severidad: "ADVERTENCIA" | "INFO";
  pagina?: number | undefined;
  evidencia?: string | undefined;
  sugerencia?: string | undefined;
}

export interface ControlDocumento {
  tipo: string;
  estado: "CONFORME" | "ADVERTENCIA" | "NO_EVALUABLE";
  mensaje: string;
}

export interface AnalisisDocumento {
  estado: "COMPLETADO" | "PARCIAL" | "NO_EVALUABLE";
  tituloDetectado: string | null;
  similitudTitulo: number | null;
  resumen: string;
  resumenCompleto: boolean;
  controles: ControlDocumento[];
  hallazgos: HallazgoDocumento[];
}

/** Conserva tildes, ñ, cifras y negaciones. NFC solo unifica representación Unicode. */
export function normalizarTextoDocumento(texto: string): string {
  return texto
    .normalize("NFC")
    .toLocaleLowerCase("es")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Compara frases normalizadas con límites de palabra para evitar coincidencias parciales. */
function contieneFrase(texto: string, frase: string): boolean {
  const normal = normalizarTextoDocumento(frase);
  return normal.length > 0 && ` ${normalizarTextoDocumento(texto)} `.includes(` ${normal} `);
}

/** Dice sobre tokens: es una métrica informativa, nunca decide aprobación académica. */
export function similitudTituloDocumento(a: string, b: string): number {
  const izquierda = new Set(normalizarTextoDocumento(a).split(" ").filter(Boolean));
  const derecha = new Set(normalizarTextoDocumento(b).split(" ").filter(Boolean));
  if (!izquierda.size || !derecha.size) return 0;
  let comunes = 0;
  for (const token of izquierda) if (derecha.has(token)) comunes++;
  return Math.round((2 * comunes * 100) / (izquierda.size + derecha.size));
}

const ENCABEZADO = /^\s*(?:\d+[.)]?\s+)?(resumen|abstract)\s*:?[ \t]*$/iu;
const FIN_RESUMEN =
  /^\s*(?:palabras\s+clave|keywords|key\s+words|abstract|introducción|introduccion|índice|indice)\s*(?::|$)/iu;

/**
 * Delimita el resumen por encabezados y calcula si las páginas disponibles cubren su final.
 * Un resumen cortado al terminar la página 3 no se entrega a revisión editorial.
 */
function leerResumen(paginas: readonly PaginaDocumento[], totalPaginas: number) {
  let iniciado = false;
  let cerrado = false;
  let pagina = 0;
  const lineas: string[] = [];
  for (const p of paginas) {
    for (const linea of p.texto.split(/\r?\n/u)) {
      if (!iniciado && ENCABEZADO.test(linea)) {
        iniciado = true;
        pagina = p.numero;
        continue;
      }
      if (!iniciado || cerrado) continue;
      if (FIN_RESUMEN.test(linea)) {
        cerrado = true;
        continue;
      }
      lineas.push(linea);
    }
  }
  return {
    encontrado: iniciado,
    texto: lineas.join("\n").trim(),
    completo: cerrado || totalPaginas <= (paginas.at(-1)?.numero ?? 0),
    pagina,
  };
}

/** Busca etiquetas, comillas o bloques exactos en la carátula; no infiere títulos del resumen. */
function detectarTitulo(caratula: string, esperado: string): string | null {
  const lineas = caratula
    .split(/\r?\n/u)
    .map((l) => l.trim())
    .filter(Boolean);
  // Etiqueta explícita o bloque entre comillas, sin buscar en resumen ni otras páginas.
  const indice = lineas.findIndex((l) =>
    /^(?:título|titulo)(?:\s+de\s+(?:la\s+)?tesis)?\s*:/iu.test(l),
  );
  if (indice >= 0) {
    const primera = (lineas[indice] ?? "").replace(/^[^:]+:\s*/u, "");
    const siguientes: string[] = primera ? [primera] : [];
    for (const linea of lineas.slice(indice + 1, indice + 5)) {
      if (/^(?:asesor|autor|tesista|presentado|dni|resumen|abstract)\b/iu.test(linea)) break;
      siguientes.push(linea);
      if (normalizarTextoDocumento(siguientes.join(" ")) === normalizarTextoDocumento(esperado))
        break;
    }
    return siguientes.join(" ") || null;
  }
  const entreComillas = caratula.match(/[«“"]([^»”"\n]*(?:\n[^»”"]*)?)[»”"]/u)?.[1];
  if (entreComillas?.trim()) return entreComillas.trim();
  // Sin etiqueta solo se acepta un bloque exacto de hasta cuatro líneas.
  for (let i = 0; i < lineas.length; i++) {
    for (let n = 1; n <= 4; n++) {
      const bloque = lineas.slice(i, i + n).join(" ");
      if (normalizarTextoDocumento(bloque) === normalizarTextoDocumento(esperado)) return bloque;
    }
  }
  return null;
}

/**
 * Motor puro utilizado por POST /api/documentos/:id/analisis.
 * @param paginasEntrada Texto ya extraído; se descartan páginas fuera de 1–3.
 * @param datos Referencias del expediente suministradas por la capa de aplicación.
 * @param totalPaginas Total del PDF para distinguir un resumen completo de uno truncado.
 * @returns Controles y hallazgos orientativos; no cambia datos ni concede visto bueno.
 */
export function analizarCaratulaResumen(
  paginasEntrada: readonly PaginaDocumento[],
  datos: DatosAnalisisDocumento,
  totalPaginas: number,
): AnalisisDocumento {
  const paginas = paginasEntrada
    .filter((p) => p.numero >= 1 && p.numero <= 3)
    .map((p) => ({ numero: p.numero, texto: p.texto.slice(0, 100_000) }))
    .sort((a, b) => a.numero - b.numero);
  const controles: ControlDocumento[] = [];
  const hallazgos: HallazgoDocumento[] = [];
  const caratula = paginas.find((p) => p.numero === 1)?.texto ?? "";
  const legible = normalizarTextoDocumento(caratula).length >= 20;
  // Centraliza la correspondencia entre control no conforme y severidad del hallazgo.
  const agregar = (
    tipo: string,
    estado: ControlDocumento["estado"],
    mensaje: string,
    pagina?: number,
  ) => {
    controles.push({ tipo, estado, mensaje });
    if (estado !== "CONFORME")
      hallazgos.push({
        tipo,
        mensaje,
        severidad: estado === "NO_EVALUABLE" ? "INFO" : "ADVERTENCIA",
        ...(pagina ? { pagina } : {}),
      });
  };
  const tituloDetectado =
    datos.titulo.trim() && legible ? detectarTitulo(caratula, datos.titulo) : null;
  const similitudTitulo = tituloDetectado
    ? similitudTituloDocumento(tituloDetectado, datos.titulo)
    : null;
  if (!datos.titulo.trim())
    agregar("TITULO", "NO_EVALUABLE", "Falta el título registrado del expediente.");
  else if (!legible || !tituloDetectado)
    agregar("TITULO", "NO_EVALUABLE", "No se pudo identificar el título de la carátula.", 1);
  else if (normalizarTextoDocumento(tituloDetectado) === normalizarTextoDocumento(datos.titulo))
    agregar("TITULO", "CONFORME", "El título coincide con el registrado.", 1);
  else
    agregar(
      "TITULO",
      "ADVERTENCIA",
      "El título detectado presenta diferencias respecto al registrado.",
      1,
    );

  /** Verifica nombre completo y, si existe referencia, DNI con límites numéricos. */
  function identidad(persona: IdentidadDocumento, tipo: string) {
    if (!legible || !persona.nombre.trim())
      agregar(tipo, "NO_EVALUABLE", "No hay datos suficientes para verificar esta identidad.", 1);
    else
      agregar(
        tipo,
        contieneFrase(caratula, persona.nombre) ? "CONFORME" : "ADVERTENCIA",
        contieneFrase(caratula, persona.nombre)
          ? "El nombre figura en la carátula."
          : "No se encontró el nombre completo esperado en la carátula.",
        1,
      );
    if (persona.dni !== undefined) {
      const valido = /^\d{8}$/u.test(persona.dni);
      const encontrado = valido && new RegExp(`(?<!\\d)${persona.dni}(?!\\d)`, "u").test(caratula);
      agregar(
        `${tipo}_DNI`,
        !valido || !legible ? "NO_EVALUABLE" : encontrado ? "CONFORME" : "ADVERTENCIA",
        !valido
          ? "Falta un DNI válido de referencia."
          : encontrado
            ? "El DNI esperado figura en la carátula."
            : "No se encontró el DNI esperado en la carátula.",
        1,
      );
    }
  }
  if (!datos.tesistas.length)
    agregar("TESISTAS", "NO_EVALUABLE", "No hay tesistas registrados para comparar.");
  datos.tesistas.forEach((persona, indice) => {
    identidad(persona, `TESISTA_${indice + 1}`);
  });
  if (datos.asesor) identidad(datos.asesor, "ASESOR");
  else agregar("ASESOR", "NO_EVALUABLE", "No hay asesor registrado para comparar.");

  const resumen = leerResumen(paginas, totalPaginas);
  if (!paginas.some((p) => normalizarTextoDocumento(p.texto).length >= 20))
    agregar(
      "RESUMEN",
      "NO_EVALUABLE",
      "El PDF no contiene texto extraíble suficiente. Requiere revisión manual.",
    );
  else if (!resumen.encontrado)
    agregar(
      "RESUMEN",
      "ADVERTENCIA",
      "No se encontró un encabezado Resumen o Abstract en las páginas 1–3.",
    );
  else if (!resumen.texto)
    agregar(
      "RESUMEN",
      "NO_EVALUABLE",
      "El encabezado no contiene un resumen extraíble.",
      resumen.pagina,
    );
  else
    agregar(
      "RESUMEN",
      resumen.completo ? "CONFORME" : "NO_EVALUABLE",
      resumen.completo
        ? "Se encontró un resumen con contenido."
        : "El resumen puede continuar fuera de las páginas analizadas; revisión parcial.",
      resumen.pagina,
    );
  return {
    estado: !paginas.some((p) => normalizarTextoDocumento(p.texto).length >= 20)
      ? "NO_EVALUABLE"
      : controles.some((c) => c.estado === "NO_EVALUABLE")
        ? "PARCIAL"
        : "COMPLETADO",
    tituloDetectado,
    similitudTitulo,
    resumen: resumen.texto,
    resumenCompleto: resumen.completo && !!resumen.texto,
    controles,
    hallazgos,
  };
}
