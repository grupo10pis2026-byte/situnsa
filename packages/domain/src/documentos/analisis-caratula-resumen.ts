/**
 * Motor puro de POST /api/documentos/:id/analisis, invocado por analizar-documento.use-case.ts.
 * Valida carátula, presentación, resumen y abstract según la guía oficial
 * "FORMATO PRESENTACIÓN BORRADOR DE TESIS O TRABAJO ACAD." de la FIPS - UNSA.
 * Solo recibe texto de páginas 1–6 y referencias esperadas; no lee PDF, DB ni proveedores de IA.
 */

export interface PaginaDocumento {
  numero: number;
  texto: string;
}

export interface IdentidadDocumento {
  nombre: string;
  dni?: string | undefined;
  grado?: string | undefined;
}

export interface DatosAnalisisDocumento {
  titulo: string;
  tesistas: readonly IdentidadDocumento[];
  asesor: IdentidadDocumento | null;
  modalidad?: "TESIS" | "TRABAJO_ACADEMICO" | "ARTICULO" | string | undefined;
  programa?: string | undefined;
  anoReferencia?: number | string | undefined;
}

export interface HallazgoDocumento {
  tipo: string;
  mensaje: string;
  severidad: "ADVERTENCIA" | "INFO";
  pagina?: number | undefined;
  esperado?: string | undefined;
  encontrado?: string | undefined;
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
export function contieneFrase(texto: string, frase: string): boolean {
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
 * Un resumen cortado no se entrega a revisión editorial.
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
export function detectarTitulo(caratula: string, esperado: string): string | null {
  const lineas = caratula
    .split(/\r?\n/u)
    .map((l) => l.trim())
    .filter(Boolean);
  // Etiqueta explícita o bloque entre comillas, sin buscar en resumen ni otras páginas.
  const indice = lineas.findIndex((l) =>
    /^(?:título|titulo)(?:\s+de\s+(?:la\s+)?(?:tesis|trabajo(?:\s+acad[eé]mico)?))?\s*:/iu.test(l),
  );
  if (indice >= 0) {
    const primera = (lineas[indice] ?? "").replace(/^[^:]+:\s*/u, "");
    const siguientes: string[] = primera ? [primera] : [];
    for (const linea of lineas.slice(indice + 1, indice + 5)) {
      if (
        /^(?:asesor|autor|tesista|presentado|dni|para\s+optar|facultad|resumen|abstract)\b/iu.test(
          linea,
        )
      )
        break;
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
 * Motor puro utilizado por POST /api/documentos/:id/analisis y background workers.
 * @param paginasEntrada Texto ya extraído; se procesan páginas dentro de 1–6.
 * @param datos Referencias del expediente suministradas por la capa de aplicación.
 * @param totalPaginas Total del PDF para distinguir secciones completas de truncadas.
 * @returns Controles y hallazgos orientativos estructurados con esperado y encontrado.
 */
export function analizarCaratulaResumen(
  paginasEntrada: readonly PaginaDocumento[],
  datos: DatosAnalisisDocumento,
  totalPaginas: number,
): AnalisisDocumento {
  const paginas = paginasEntrada
    .filter((p) => p.numero >= 1 && p.numero <= 6)
    .map((p) => ({ numero: p.numero, texto: p.texto.slice(0, 100_000) }))
    .sort((a, b) => a.numero - b.numero);

  const controles: ControlDocumento[] = [];
  const hallazgos: HallazgoDocumento[] = [];
  const caratula = paginas.find((p) => p.numero === 1)?.texto ?? "";
  const legible = normalizarTextoDocumento(caratula).length >= 20;

  const agregar = (
    tipo: string,
    estado: ControlDocumento["estado"],
    mensaje: string,
    pagina?: number,
    esperado?: string,
    encontrado?: string,
  ) => {
    controles.push({ tipo, estado, mensaje });
    if (estado !== "CONFORME") {
      hallazgos.push({
        tipo,
        mensaje,
        severidad: estado === "NO_EVALUABLE" ? "INFO" : "ADVERTENCIA",
        ...(pagina ? { pagina } : {}),
        ...(esperado ? { esperado } : {}),
        ...(encontrado ? { encontrado } : {}),
      });
    }
  };

  // 1. TÍTULO: Detección y formato normativo
  const tituloDetectado =
    datos.titulo.trim() && legible ? detectarTitulo(caratula, datos.titulo) : null;
  const similitudTitulo = tituloDetectado
    ? similitudTituloDocumento(tituloDetectado, datos.titulo)
    : null;

  if (!datos.titulo.trim()) {
    agregar("TITULO", "NO_EVALUABLE", "Falta el título registrado del expediente.");
  } else if (!legible || !tituloDetectado) {
    agregar(
      "TITULO",
      "NO_EVALUABLE",
      "No se pudo identificar el título en la carátula.",
      1,
      datos.titulo,
      "No identificado",
    );
  } else {
    // Restricciones de la guía oficial sobre el título:
    // a) No comillas
    if (/[«“"”]/u.test(tituloDetectado)) {
      agregar(
        "TITULO_COMILLAS",
        "ADVERTENCIA",
        "El título no debe contener comillas (« », “ ”) según el formato oficial.",
        1,
        datos.titulo.replace(/[«“"”]/gu, "").trim(),
        tituloDetectado,
      );
    }
    // b) No punto final
    if (/\.\s*$/u.test(tituloDetectado)) {
      agregar(
        "TITULO_PUNTO_FINAL",
        "ADVERTENCIA",
        "El título no debe terminar con un punto final (.) según el formato oficial.",
        1,
        datos.titulo.replace(/\.+$/u, "").trim(),
        tituloDetectado,
      );
    }
    // c) No mayúsculas sostenidas en todo el título
    const soloLetras = tituloDetectado.replace(/[^\p{L}]/gu, "");
    if (soloLetras.length > 10 && soloLetras === soloLetras.toUpperCase()) {
      agregar(
        "TITULO_MAYUSCULAS",
        "ADVERTENCIA",
        "El título no debe escribirse en mayúsculas sostenidas; se recomienda tipo oración o título.",
        1,
        "Título en mayúsculas y minúsculas (tipo oración)",
        tituloDetectado,
      );
    }

    if (normalizarTextoDocumento(tituloDetectado) === normalizarTextoDocumento(datos.titulo)) {
      agregar("TITULO", "CONFORME", "El título coincide con el registrado.", 1);
    } else {
      agregar(
        "TITULO",
        "ADVERTENCIA",
        "El título detectado en la carátula presenta diferencias respecto al registrado.",
        1,
        datos.titulo,
        tituloDetectado,
      );
    }
  }

  // 2. MODALIDAD Y FÓRMULA DE PRESENTACIÓN (Página 1 o 2 de la guía)
  const esTrabajoAcademico =
    datos.modalidad === "TRABAJO_ACADEMICO" ||
    (datos.modalidad && normalizarTextoDocumento(datos.modalidad).includes("trabajo"));

  if (esTrabajoAcademico && legible) {
    const tieneFormulaTesis = contieneFrase(caratula, "tesis presentada por");
    const tieneFormulaTrabajo =
      contieneFrase(caratula, "trabajo academico presentado por") ||
      contieneFrase(caratula, "trabajo de suficiencia profesional presentado por");

    if (tieneFormulaTesis) {
      agregar(
        "MODALIDAD_FORMULA",
        "ADVERTENCIA",
        "Para la modalidad de Trabajo Académico, la carátula debe indicar 'Trabajo Académico presentado por:' y no 'Tesis presentada por:'.",
        1,
        "Trabajo Académico presentado por:",
        "Tesis presentada por:",
      );
    } else if (!tieneFormulaTrabajo && datos.modalidad) {
      agregar(
        "MODALIDAD_FORMULA",
        "ADVERTENCIA",
        "La carátula debe incluir la fórmula: 'Trabajo Académico presentado por:'.",
        1,
        "Trabajo Académico presentado por:",
        "Fórmula no detectada",
      );
    } else {
      agregar(
        "MODALIDAD_FORMULA",
        "CONFORME",
        "Fórmula de presentación para Trabajo Académico conforme.",
        1,
      );
    }
  } else if (datos.modalidad === "TESIS" && legible) {
    const tieneFormulaTrabajo =
      contieneFrase(caratula, "trabajo academico presentado por") ||
      contieneFrase(caratula, "trabajo de suficiencia profesional presentado por");
    if (tieneFormulaTrabajo) {
      agregar(
        "MODALIDAD_FORMULA",
        "ADVERTENCIA",
        "Para la modalidad de Tesis, la carátula debe indicar 'Tesis presentada por:' y no 'Trabajo Académico presentado por:'.",
        1,
        "Tesis presentada por:",
        "Trabajo Académico presentado por:",
      );
    }
  }

  // 3. IDENTIDAD DE TESISTAS / AUTORES (Nombre completo y DNI)
  function verificarIdentidad(persona: IdentidadDocumento, tipo: string) {
    if (!legible || !persona.nombre.trim()) {
      agregar(
        tipo,
        "NO_EVALUABLE",
        "No hay datos suficientes para verificar esta identidad.",
        1,
        persona.nombre || "Nombre registrado",
        "Datos insuficientes",
      );
    } else {
      const coincide = contieneFrase(caratula, persona.nombre);
      agregar(
        tipo,
        coincide ? "CONFORME" : "ADVERTENCIA",
        coincide
          ? "El nombre figura en la carátula."
          : "No se encontró el nombre completo esperado en la carátula.",
        1,
        persona.nombre,
        coincide ? persona.nombre : "No detectado en la carátula",
      );
    }
  }

  if (!datos.tesistas.length) {
    agregar("TESISTAS", "NO_EVALUABLE", "No hay tesistas registrados para comparar.");
  }
  datos.tesistas.forEach((persona, indice) => {
    verificarIdentidad(persona, `TESISTA_${indice + 1}`);
  });

  // 4. ASESOR: Nombre y grado académico previo
  if (datos.asesor) {
    verificarIdentidad(datos.asesor, "ASESOR");
    if (legible && contieneFrase(caratula, datos.asesor.nombre)) {
      // Verificar si figura el grado académico previo (Mg., Dr., MSc., Ing., etc.)
      const tieneGrado = /\b(?:dr|dra|mg|msc|mag|ing|lic|abg)\b\.?/iu.test(caratula);
      if (!tieneGrado) {
        agregar(
          "ASESOR_GRADO",
          "ADVERTENCIA",
          "El asesor debe consignar su grado académico previo (ej. Mg., Dr., MSc., Ing.) según la normativa.",
          1,
          `Mg./Dr./MSc. ${datos.asesor.nombre}`,
          datos.asesor.nombre,
        );
      }
    }
  } else {
    agregar("ASESOR", "NO_EVALUABLE", "No hay asesor registrado para comparar.");
  }

  // 5. RESUMEN Y PALABRAS CLAVE
  const resumen = leerResumen(paginas, totalPaginas);
  if (!paginas.some((p) => normalizarTextoDocumento(p.texto).length >= 20)) {
    agregar(
      "RESUMEN",
      "NO_EVALUABLE",
      "El PDF no contiene texto extraíble suficiente. Requiere revisión manual.",
    );
  } else if (!resumen.encontrado) {
    agregar(
      "RESUMEN",
      "ADVERTENCIA",
      "No se encontró un encabezado Resumen en las páginas analizadas.",
      undefined,
      "Encabezado RESUMEN",
      "No detectado",
    );
  } else if (!resumen.texto) {
    agregar(
      "RESUMEN",
      "NO_EVALUABLE",
      "El encabezado no contiene un resumen extraíble.",
      resumen.pagina,
      "Contenido del resumen",
      "Texto vacío",
    );
  } else {
    agregar(
      "RESUMEN",
      resumen.completo ? "CONFORME" : "NO_EVALUABLE",
      resumen.completo
        ? "Se encontró un resumen con contenido."
        : "El resumen puede continuar fuera de las páginas analizadas; revisión parcial.",
      resumen.pagina,
    );

    // Verificación de PALABRAS CLAVE obligatorias
    const paginaResumenTexto = paginas.find((p) => p.numero === resumen.pagina)?.texto ?? "";
    const tienePalabrasClave = /\b(?:palabras\s+clave|palabra\s+clave)\b\s*:/iu.test(
      paginaResumenTexto,
    );
    if (!tienePalabrasClave) {
      agregar(
        "RESUMEN_PALABRAS_CLAVE",
        "ADVERTENCIA",
        "La sección de Resumen debe incluir obligatoriamente 'PALABRAS CLAVE:' (de 3 a 5 términos).",
        resumen.pagina,
        "PALABRAS CLAVE: término 1, término 2, término 3",
        "No se detectó la sección 'PALABRAS CLAVE:'",
      );
    }
  }

  // 6. ABSTRACT Y KEYWORDS (Para documentos completos con totalPaginas >= 4)
  if (totalPaginas >= 4) {
    const paginaAbstract = paginas.find((p) =>
      /^\s*(?:\d+[.)]?\s+)?abstract\s*:?[ \t]*$/imu.test(p.texto),
    );
    if (!paginaAbstract) {
      agregar(
        "ABSTRACT",
        "ADVERTENCIA",
        "No se encontró la sección de ABSTRACT en inglés en las primeras páginas analizadas.",
        undefined,
        "Encabezado ABSTRACT y contenido en inglés",
        "No detectado",
      );
    } else {
      const tieneKeywords = /\b(?:keywords|key\s+words)\b\s*:/iu.test(paginaAbstract.texto);
      if (!tieneKeywords) {
        agregar(
          "ABSTRACT_KEYWORDS",
          "ADVERTENCIA",
          "La sección de Abstract debe incluir obligatoriamente 'KEYWORDS:' en inglés.",
          paginaAbstract.numero,
          "KEYWORDS: keyword 1, keyword 2, keyword 3",
          "No se detectó la sección 'KEYWORDS:'",
        );
      } else {
        agregar(
          "ABSTRACT",
          "CONFORME",
          "Sección de Abstract y KEYWORDS conforme.",
          paginaAbstract.numero,
        );
      }
    }
  }

  // 7. PRESENTACIÓN: En caso de Trabajo Académico verificar mención a la empresa/centro laboral
  if (esTrabajoAcademico && totalPaginas >= 3) {
    const paginasPresentacion = paginas.filter((p) => p.numero === 2 || p.numero === 3);
    const textoPresentacion = paginasPresentacion.map((p) => p.texto).join("\n");
    const esPaginaPresentacion = /presentaci[oó]n|se[ñn]or(?:a)?\s+decano/iu.test(
      textoPresentacion,
    );
    if (esPaginaPresentacion) {
      const tieneMencionEmpresa =
        /\b(?:empresa|instituci[oó]n|laborando|laboral|centro\s+de\s+trabajo|experiencia\s+laboral)\b/iu.test(
          textoPresentacion,
        );
      if (!tieneMencionEmpresa) {
        agregar(
          "PRESENTACION_EMPRESA",
          "ADVERTENCIA",
          "En la presentación de Trabajo Académico debe mencionarse la empresa o centro de labores de la experiencia profesional.",
          paginasPresentacion[0]?.numero ?? 2,
          "Mención del centro de labores / empresa",
          "No se detectó mención de empresa o centro de labores",
        );
      }
    }
  }

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
