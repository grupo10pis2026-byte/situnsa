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
  cui?: string | undefined;
  email?: string | undefined;
}

export interface DatosAnalisisDocumento {
  titulo: string;
  tesistas: readonly IdentidadDocumento[];
  asesor: IdentidadDocumento | null;
  modalidad?: "TESIS" | "TRABAJO_ACADEMICO" | "ARTICULO" | string | undefined;
  programa?: string | undefined;
  anoReferencia?: number | string | undefined;
  presidente?: string | null | undefined;
  secretario?: string | null | undefined;
  integrante?: string | null | undefined;
  decanal?: string | null | undefined;
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

export function esTipoBoleta(tipo: string): boolean {
  const t = tipo.toUpperCase();
  return (
    t.includes("BOLETA") ||
    t.includes("RECIBO") ||
    t.includes("PAGO") ||
    t.includes("COMPROBANTE") ||
    t.includes("VOUCHER")
  );
}

/**
 * Comprueba si el texto contiene el encabezado o título oficial esperado para el tipo
 * documental, permitiendo descartar de inmediato documentos ajenos o no pertinentes.
 */
export function verificarTituloEncabezadoDocumento(
  tipo: string,
  textoCompleto: string,
): { valido: boolean; nombreOficial: string; razon?: string | undefined } {
  const t = tipo.toUpperCase();

  // 1. Boletas y comprobantes de pago
  if (esTipoBoleta(tipo)) {
    const esValido =
      /(?:boleta|recibo|comprobante|dep[oó]sito|voucher|transacci[oó]n|operaci[oó]n|banco\s+de\s+la\s+naci[oó]n|caja\s+unsa|bcp|bbva|interbank)/iu.test(
        textoCompleto,
      );
    return {
      valido: esValido,
      nombreOficial: "Boleta / Comprobante de Pago",
      razon: esValido
        ? undefined
        : "No se identificó un formato de boleta, voucher bancario ni comprobante de depósito.",
    };
  }

  // 2. Anexo 17 / Solicitud de inscripción del plan
  if (t === "SOLICITUD_INSCRIPCION" || t === "ANEXO_17" || t.includes("INSCRIPCION")) {
    const esValido =
      /(?:anexo\s*(?:n[°o.]*\s*)?17|solicit(?:ud|o)|inscripci[oó]n|se[nñ]or\s+(?:director|decano)|director\s+de\s+(?:la\s+)?unidad|plan\s+de\s+tesis)/iu.test(
        textoCompleto,
      );
    return {
      valido: esValido,
      nombreOficial: "Anexo 17 — Solicitud de inscripción del plan de tesis",
      razon: esValido
        ? undefined
        : "No se detectó el encabezado oficial de Solicitud de Inscripción ni mención a Anexo 17.",
    };
  }

  // 3. Aceptación de asesoría
  if (t.includes("ASESORIA") || t === "ACEPTACION_ASESORIA") {
    const esValido =
      /(?:aceptaci[oó]n\s+(?:de\s+)?asesor[ií]a|designaci[oó]n\s+(?:de\s+)?asesor|acepto\s+asesorar|compromiso\s+(?:de\s+)?asesor[ií]a|carta\s+de\s+aceptaci[oó]n|acepta\s+asesorar)/iu.test(
        textoCompleto,
      );
    return {
      valido: esValido,
      nombreOficial: "Formato de aceptación de asesoría",
      razon: esValido
        ? undefined
        : "No se detectó el título de Aceptación o Compromiso de Asesoría.",
    };
  }

  // 4. Plan de tesis / Proyecto / Tesis estructurada
  if (t === "PLAN_ESTRUCTURADO" || t.includes("PLAN") || t.includes("TESIS")) {
    const esValido =
      /(?:plan\s+de\s+tesis|proyecto\s+de\s+(?:plan\s+de\s+)?tesis|plan\s+de\s+trabajo\s+acad[eé]mico|borrador\s+de\s+tesis|segunda\s+especialidad|tesis\s+presentada)/iu.test(
        textoCompleto,
      );
    return {
      valido: esValido,
      nombreOficial: "Plan estructurado de tesis / Trabajo académico",
      razon: esValido
        ? undefined
        : "No se identificó la carátula o estructura de un Plan de Tesis o Trabajo Académico.",
    };
  }

  // 5. Declaración jurada de confidencialidad
  if (t.includes("CONFIDENCIALIDAD")) {
    const esValido =
      /(?:confidencialidad|autorizaci[oó]n\s+de\s+uso\s+de\s+informaci[oó]n|reserva\s+de\s+informaci[oó]n)/iu.test(
        textoCompleto,
      );
    return {
      valido: esValido,
      nombreOficial: "Declaración jurada de confidencialidad",
      razon: esValido
        ? undefined
        : "No se detectó el encabezado de Confidencialidad o Autorización de Uso de Información.",
    };
  }

  // 6. Anexo 18
  if (t === "ANEXO_18" || t.includes("ANEXO_18")) {
    const esValido =
      /(?:anexo\s*(?:n[°o.]*\s*)?18|conformidad\s+(?:de\s+)?asesoramiento|conformidad\s+de\s+proyecto|acta\s+de\s+conformidad)/iu.test(
        textoCompleto,
      );
    return {
      valido: esValido,
      nombreOficial: "Anexo 18 — Acta de conformidad de asesoramiento de proyecto",
      razon: esValido
        ? undefined
        : "No se identificó el encabezado de Anexo 18 o Conformidad de Asesoramiento.",
    };
  }

  // 7. Anexo 33
  if (t === "ANEXO_33" || t.includes("ANEXO_33")) {
    const esValido =
      /(?:anexo\s*(?:n[°o.]*\s*)?33|nombramiento\s+(?:de\s+)?jurado|jurado\s+evaluador|terna\s+evaluadora|propuesta\s+(?:de\s+)?jurado)/iu.test(
        textoCompleto,
      );
    return {
      valido: esValido,
      nombreOficial: "Anexo 33 — Nombramiento de jurado evaluador",
      razon: esValido
        ? undefined
        : "No se identificó el encabezado de Anexo 33 o Nombramiento de Jurado Evaluador.",
    };
  }

  // 8. Anexo 27
  if (t === "ANEXO_27" || t.includes("ANEXO_27")) {
    const esValido =
      /(?:anexo\s*(?:n[°o.]*\s*)?27|solicit(?:ud|o)|optar|dictamen|t[ií]tulo|segunda\s+especialidad)/iu.test(
        textoCompleto,
      );
    return {
      valido: esValido,
      nombreOficial: "Anexo 27 — Solicitud para optar título de segunda especialidad",
      razon: esValido
        ? undefined
        : "No se detectó el encabezado de Anexo 27 ni solicitud para optar título.",
    };
  }

  // 9. Anexo 01 DJ
  if (t.includes("ANEXO_01") || t.includes("ANEXO_1")) {
    const esValido =
      /(?:anexo\s*(?:n[°o.]*\s*)?0?1\b|autorizaci[oó]n\s+.*publicaci[oó]n|repositorio\s+institucional)/iu.test(
        textoCompleto,
      );
    return {
      valido: esValido,
      nombreOficial: "Anexo 1 — Autorización para publicación digital en el repositorio",
      razon: esValido
        ? undefined
        : "No se identificó el encabezado de Anexo 1 ni autorización de publicación digital.",
    };
  }

  // 10. Anexo 02 DJ
  if (t.includes("ANEXO_02") || t.includes("ANEXO_2")) {
    const esValido =
      /(?:anexo\s*(?:n[°o.]*\s*)?0?2\b|declaraci[oó]n\s+jurada\s+.*antecedentes|antecedentes\s+penales|terrorismo)/iu.test(
        textoCompleto,
      );
    return {
      valido: esValido,
      nombreOficial: "Anexo 2 — Declaración jurada de no antecedentes penales / terrorismo",
      razon: esValido
        ? undefined
        : "No se identificó el encabezado de Anexo 2 ni declaración jurada de antecedentes.",
    };
  }

  // 11. Anexo 32 DJ Veracidad
  if (t.includes("ANEXO_32") || t.includes("VERACIDAD")) {
    const esValido =
      /(?:anexo\s*(?:n[°o.]*\s*)?32|veracidad\s+(?:de\s+la\s+)?informaci[oó]n|declaraci[oó]n\s+jurada\s+.*(?:veracidad|autenticidad|originalidad))/iu.test(
        textoCompleto,
      );
    return {
      valido: esValido,
      nombreOficial: "Anexo 32 — Declaración jurada de veracidad de la información",
      razon: esValido
        ? undefined
        : "No se identificó el encabezado de Anexo 32 ni declaración de veracidad.",
    };
  }

  // 12. Actas e informes institucionales
  if (t.includes("ACTA_CONFORMIDAD")) {
    const esValido = /acta\s+de\s+conformidad/iu.test(textoCompleto);
    return {
      valido: esValido,
      nombreOficial: "Acta de conformidad de tesis",
      razon: esValido ? undefined : "No se identificó el encabezado de Acta de Conformidad.",
    };
  }

  if (t.includes("ACTA_DICTAMEN")) {
    const esValido = /acta\s+de\s+dictamen/iu.test(textoCompleto);
    return {
      valido: esValido,
      nombreOficial: "Acta de dictamen de tesis",
      razon: esValido ? undefined : "No se identificó el encabezado de Acta de Dictamen.",
    };
  }

  if (t.includes("ACTA_SUSTENTACION")) {
    const esValido = /acta\s+de\s+sustentaci[oó]n/iu.test(textoCompleto);
    return {
      valido: esValido,
      nombreOficial: "Acta de sustentación",
      razon: esValido ? undefined : "No se identificó el encabezado de Acta de Sustentación.",
    };
  }

  if (t.includes("RESOLUCION_DECANAL")) {
    const esValido = /resoluci[oó]n\s+decanal/iu.test(textoCompleto);
    return {
      valido: esValido,
      nombreOficial: "Resolución Decanal",
      razon: esValido ? undefined : "No se identificó el encabezado de Resolución Decanal.",
    };
  }

  if (t.includes("DECRETO")) {
    const esValido = /decreto/iu.test(textoCompleto);
    return {
      valido: esValido,
      nombreOficial: "Decreto de aprobación",
      razon: esValido ? undefined : "No se identificó el encabezado de Decreto.",
    };
  }

  if (t.includes("OFICIO")) {
    const esValido = /oficio/iu.test(textoCompleto);
    return {
      valido: esValido,
      nombreOficial: "Oficio formal",
      razon: esValido ? undefined : "No se identificó el formato u oficio formal.",
    };
  }

  return { valido: true, nombreOficial: tipo };
}

/**
 * Analiza documentos subidos que no poseen una plantilla para autorrellenar:
 * 1. Para boletas/comprobantes de pago:
 *    - Verifica nombres del tesista (sin importar mayúsculas/minúsculas).
 *    - Verifica número de DNI de 8 dígitos según el sistema.
 * 2. Para los demás documentos (cartas de aceptación, DJ confidencialidad, anexo 33, etc.):
 *    - Verifica nombres de los tesistas.
 *    - Verifica DNI solo si el documento lo menciona.
 *    - Verifica asesor solo si el documento a analizar lo contiene.
 *    - Verifica título solo si el documento a analizar lo contiene.
 */
export function analizarDocumentoSubido(
  tipo: string,
  paginas: readonly PaginaDocumento[],
  datos: DatosAnalisisDocumento,
  _totalPaginas: number,
): AnalisisDocumento {
  const textoCompleto = paginas.map((p) => p.texto).join("\n");
  const textoNormalizado = normalizarTextoDocumento(textoCompleto);
  const controles: ControlDocumento[] = [];
  const hallazgos: HallazgoDocumento[] = [];

  const agregar = (
    tipoCtrl: string,
    estado: ControlDocumento["estado"],
    mensaje: string,
    pagina?: number,
    esperado?: string,
    encontrado?: string,
  ) => {
    controles.push({ tipo: tipoCtrl, estado, mensaje });
    if (estado === "ADVERTENCIA") {
      hallazgos.push({
        tipo: tipoCtrl,
        mensaje,
        severidad: "ADVERTENCIA",
        ...(pagina ? { pagina } : {}),
        ...(esperado ? { esperado } : {}),
        ...(encontrado ? { encontrado } : {}),
      });
    }
  };

  if (textoNormalizado.length < 15) {
    agregar(
      "DOCUMENTO_LEGIBILIDAD",
      "NO_EVALUABLE",
      "El archivo es un escaneo o imagen sin texto digital extraíble. Requiere revisión visual directa en el visor.",
    );
    return {
      estado: "NO_EVALUABLE",
      tituloDetectado: null,
      similitudTitulo: null,
      resumen: "",
      resumenCompleto: false,
      controles,
      hallazgos,
    };
  }

  // 0. DESCARTE PREVIO: Validación del título / encabezado oficial del documento
  const verifEncabezado = verificarTituloEncabezadoDocumento(tipo, textoCompleto);
  if (!verifEncabezado.valido) {
    agregar(
      "DOCUMENTO_ERRONEO",
      "ADVERTENCIA",
      `Documento erróneo: El archivo cargado no corresponde a "${verifEncabezado.nombreOficial}". Se requiere adjuntar el documento oficial pertinente para habilitar la validación de tesistas, firmas y autoridades.`,
      1,
      verifEncabezado.nombreOficial,
      "Encabezado oficial no detectado en el archivo subido",
    );
    return {
      estado: "PARCIAL",
      tituloDetectado: null,
      similitudTitulo: null,
      resumen: "",
      resumenCompleto: false,
      controles,
      hallazgos,
    };
  }

  agregar(
    "DOCUMENTO_OFICIAL",
    "CONFORME",
    `Encabezado oficial verificado: Corresponde a "${verifEncabezado.nombreOficial}".`,
  );

  const dnisEncontrados = Array.from(new Set(textoCompleto.match(/\b\d{8}\b/g) ?? []));
  const esBoleta = esTipoBoleta(tipo);

  if (esBoleta) {
    // 1. REGLAS PARA BOLETAS / COMPROBANTES DE PAGO
    for (const tesista of datos.tesistas) {
      // DNI del tesista
      if (tesista.dni) {
        if (dnisEncontrados.includes(tesista.dni)) {
          agregar(
            "BOLETA_DNI",
            "CONFORME",
            `DNI ${tesista.dni} del tesista verificado en la boleta.`,
          );
        } else if (dnisEncontrados.length > 0) {
          agregar(
            "BOLETA_DNI",
            "ADVERTENCIA",
            `El DNI detectado en la boleta (${dnisEncontrados.join(", ")}) no coincide con el DNI del tesista registrado (${tesista.dni}).`,
            1,
            tesista.dni,
            dnisEncontrados.join(", "),
          );
        } else {
          agregar(
            "BOLETA_DNI",
            "ADVERTENCIA",
            `No se detectó un número de DNI de 8 dígitos en la boleta (esperado: ${tesista.dni}).`,
            1,
            tesista.dni,
            "No detectado",
          );
        }
      }

      // Nombre del tesista (sin importar mayúsculas o minúsculas)
      const partesNombre = normalizarTextoDocumento(tesista.nombre)
        .split(" ")
        .filter((p) => p.length > 2);
      const coincidencias = partesNombre.filter((p) => textoNormalizado.includes(p));

      if (
        contieneFrase(textoCompleto, tesista.nombre) ||
        coincidencias.length === partesNombre.length
      ) {
        agregar(
          "BOLETA_NOMBRE",
          "CONFORME",
          `Nombre del tesista (${tesista.nombre}) verificado en la boleta.`,
        );
      } else if (coincidencias.length >= 2) {
        agregar(
          "BOLETA_NOMBRE",
          "CONFORME",
          `Apellidos/nombres del tesista (${coincidencias.join(" ")}) identificados en la boleta.`,
        );
      } else {
        agregar(
          "BOLETA_NOMBRE",
          "ADVERTENCIA",
          `El nombre del tesista registrado (${tesista.nombre}) no fue detectado en la boleta.`,
          1,
          tesista.nombre,
          "No detectado en el texto de la boleta",
        );
      }
    }

    // Código de operación / número de recibo o comprobante
    const matchOperacion = /(?:operaci[oó]n|nro\s*recibo|recibo\s*n[o°]|transacci[oó]n|comprobante|secuencia|referencia|dep[oó]sito)[\s:#№.]*([0-9]{5,14})/iu.exec(textoCompleto);
    if (matchOperacion?.[1]) {
      agregar(
        "BOLETA_OPERACION",
        "CONFORME",
        `Código de operación / recibo bancario detectado (${matchOperacion[1]}).`,
      );
    } else {
      agregar(
        "BOLETA_OPERACION",
        "CONFORME",
        "Comprobante de pago procesado para verificación visual de fecha y tasa.",
      );
    }

    // Entidad recaudadora
    const tieneEntidad = /(?:banco\s+de\s+la\s+naci[oó]n|caja\s+unsa|banco\s+de\s+cr[eé]dito|bcp|bbva|interbank|scotiabank|yape|plin)/iu.test(textoCompleto);
    if (tieneEntidad) {
      agregar(
        "BOLETA_ENTIDAD",
        "CONFORME",
        "Entidad recaudadora / canal de pago formal identificado en el comprobante.",
      );
    }

    return {
      estado: "COMPLETADO",
      tituloDetectado: null,
      similitudTitulo: null,
      resumen: "",
      resumenCompleto: false,
      controles,
      hallazgos,
    };
  }

  // 2. REGLAS PARA DEMÁS DOCUMENTOS SUBIDOS (ANEXOS 17, 18, 27, 01, 02, 32, ACEPTACION_ASESORIA, DJ, ETC.)
  const tipoDoc = tipo.toUpperCase();

  // A. Identidad, ortotipografía y DNI de tesistas
  for (const tesista of datos.tesistas) {
    const partesNombre = normalizarTextoDocumento(tesista.nombre)
      .split(" ")
      .filter((p) => p.length > 2);
    const coincidencias = partesNombre.filter((p) => textoNormalizado.includes(p));

    // A1. Identificación del nombre
    if (
      contieneFrase(textoCompleto, tesista.nombre) ||
      coincidencias.length >= Math.min(2, partesNombre.length)
    ) {
      agregar("TESISTA", "CONFORME", `Tesista ${tesista.nombre} identificado en el documento.`);
    } else {
      agregar(
        "TESISTA",
        "ADVERTENCIA",
        `No se detectó el nombre del tesista registrado (${tesista.nombre}) en el documento.`,
        1,
        tesista.nombre,
        "No detectado",
      );
    }

    // A2. Ortotipografía y tildes oficiales en nombres propios
    const tieneTildesEnRegistro = /[áéíóúÁÉÍÓÚñÑ]/.test(tesista.nombre);
    if (tieneTildesEnRegistro) {
      const nombreSinTilde = tesista.nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const mencionaSinTilde = new RegExp(`\\b${nombreSinTilde}\\b`, "i").test(textoCompleto);
      const mencionaConTilde = new RegExp(`\\b${tesista.nombre}\\b`, "i").test(textoCompleto);

      if (mencionaSinTilde && !mencionaConTilde) {
        agregar(
          "TESISTA_ORTOTIPOGRAFIA",
          "ADVERTENCIA",
          `El nombre del tesista en el documento (${nombreSinTilde}) carece de las tildes oficiales registradas (${tesista.nombre}).`,
          1,
          tesista.nombre,
          nombreSinTilde,
        );
      } else if (mencionaConTilde) {
        agregar(
          "TESISTA_ORTOTIPOGRAFIA",
          "CONFORME",
          `Ortotipografía y tildes del nombre del tesista (${tesista.nombre}) verificadas.`,
        );
      }
    }

    // A3. DNI de 8 dígitos
    const mencionaDni =
      /\b(?:dni|d\.n\.i|documento\s+de\s+identidad|documento\s+nacional)\b/iu.test(textoCompleto);
    const exigeDni =
      mencionaDni ||
      dnisEncontrados.length > 0 ||
      tipoDoc.includes("ANEXO") ||
      tipoDoc.includes("SOLICITUD") ||
      tipoDoc.includes("DJ") ||
      tipoDoc.includes("CONFIDENCIALIDAD") ||
      tipoDoc.includes("VERACIDAD");

    if (tesista.dni && exigeDni) {
      if (dnisEncontrados.includes(tesista.dni)) {
        agregar(
          "DNI_TESISTA",
          "CONFORME",
          `DNI ${tesista.dni} del tesista verificado en el documento.`,
        );
      } else if (dnisEncontrados.length > 0) {
        agregar(
          "DNI_TESISTA",
          "ADVERTENCIA",
          `El DNI consignado en el documento (${dnisEncontrados.join(", ")}) no coincide con el del tesista registrado (${tesista.dni}).`,
          1,
          tesista.dni,
          dnisEncontrados.join(", "),
        );
      } else if (mencionaDni) {
        agregar(
          "DNI_TESISTA",
          "ADVERTENCIA",
          `No se detectó el número de DNI de 8 dígitos del tesista (esperado: ${tesista.dni}).`,
          1,
          tesista.dni,
          "No detectado",
        );
      }
    }

    // A4. Código Universitario (CUI) en solicitudes
    if (tesista.cui) {
      if (textoCompleto.includes(tesista.cui)) {
        agregar(
          "CUI_TESISTA",
          "CONFORME",
          `Código Universitario (CUI ${tesista.cui}) verificado en el documento.`,
        );
      } else if (/\b(?:cui|c\.u\.i|c[oó]digo\s+(?:de\s+alumno|universitario|de\s+estudiante))\b/iu.test(textoCompleto)) {
        agregar(
          "CUI_TESISTA",
          "ADVERTENCIA",
          `El CUI del estudiante difiere o no coincide con el CUI registrado (${tesista.cui}).`,
          1,
          tesista.cui,
          "Difiere o no detectado",
        );
      }
    }
  }

  // B. Autoridad y Destinatario de solicitudes
  if (tipoDoc.includes("SOLICITUD_INSCRIPCION") || tipoDoc === "ANEXO_17") {
    const tieneDirector = /(?:director(?:a)?\s+(?:de\s+la\s+)?unidad|unidad\s+de\s+(?:segundas?\s+especialidades|posgrado)|se[nñ]or\s+director)/iu.test(textoCompleto);
    if (tieneDirector) {
      agregar(
        "AUTORIDAD_DESTINO",
        "CONFORME",
        "Solicitud correctamente dirigida al Señor Director de la Unidad de Segundas Especialidades.",
      );
    } else {
      agregar(
        "AUTORIDAD_DESTINO",
        "ADVERTENCIA",
        "La solicitud de inscripción de plan debe dirigirse al Señor Director de la Unidad de Segundas Especialidades.",
        1,
        "Señor Director de la Unidad de Segundas Especialidades",
        "Destinatario no identificado",
      );
    }
  } else if (tipoDoc.includes("ANEXO_27") || tipoDoc.includes("SOLICITUD_TITULACION")) {
    const tieneDecano = /(?:decano\s+de\s+la\s+facultad|se[nñ]or\s+decano|decanato)/iu.test(textoCompleto);
    if (tieneDecano) {
      agregar(
        "AUTORIDAD_DESTINO",
        "CONFORME",
        "Solicitud de titulación correctamente dirigida al Señor Decano de la Facultad.",
      );
    } else {
      agregar(
        "AUTORIDAD_DESTINO",
        "ADVERTENCIA",
        "La solicitud de titulación debe dirigirse formalmente al Señor Decano de la Facultad de Ingeniería de Producción y Servicios.",
        1,
        "Señor Decano de la Facultad",
        "Destinatario no identificado",
      );
    }
  }

  // C. Asesor docente y Grado Académico
  const mencionaAsesor = /\b(?:asesor|asesora|asesor[ií]a|asesoramiento|docente\s+asesor)\b/iu.test(
    textoCompleto,
  );
  if (mencionaAsesor || tipoDoc === "ACEPTACION_ASESORIA" || tipoDoc === "ANEXO_18") {
    if (datos.asesor) {
      const partesAsesor = normalizarTextoDocumento(datos.asesor.nombre)
        .split(" ")
        .filter((p) => p.length > 2);
      const coincidenciasAsesor = partesAsesor.filter((p) => textoNormalizado.includes(p));

      if (
        contieneFrase(textoCompleto, datos.asesor.nombre) ||
        coincidenciasAsesor.length >= Math.min(2, partesAsesor.length)
      ) {
        agregar("ASESOR", "CONFORME", `Asesor ${datos.asesor.nombre} verificado en el documento.`);

        // Grado académico formal del asesor (Dr. / Mg. / Ing.)
        const tieneGrado = /(?:dr\.|doctor|dra\.|doctora|mg\.|mag[ií]ster|mtro\.|maestr[oí]a|ing\.|ingenier[oa])/iu.test(textoCompleto);
        if (tieneGrado) {
          agregar(
            "ASESOR_GRADO",
            "CONFORME",
            "Grado académico o título profesional del docente asesor verificado.",
          );
        } else if (tipoDoc === "ACEPTACION_ASESORIA" || tipoDoc === "ANEXO_18") {
          agregar(
            "ASESOR_GRADO",
            "ADVERTENCIA",
            "Se recomienda consignar el grado académico formal (Dr. / Mg.) del docente asesor.",
            1,
            "Dr. o Mg.",
            "Grado no identificado",
          );
        }

        // DNI del asesor docente si está registrado
        if (datos.asesor.dni && dnisEncontrados.includes(datos.asesor.dni)) {
          agregar(
            "ASESOR_DNI",
            "CONFORME",
            `DNI ${datos.asesor.dni} del docente asesor verificado.`,
          );
        }
      } else {
        agregar(
          "ASESOR",
          "ADVERTENCIA",
          `El documento menciona asesor pero no coincide con el registrado en el expediente (${datos.asesor.nombre}).`,
          1,
          datos.asesor.nombre,
          "Nombre de asesor diferente en el documento",
        );
      }
    } else {
      agregar(
        "ASESOR",
        "NO_EVALUABLE",
        "El documento hace referencia a asesor, pero no hay un asesor registrado en el expediente para contrastar.",
      );
    }
  }

  // D. Terna / Jurado evaluador
  if (tipoDoc === "ANEXO_33" || /\b(?:terna|jurado\s+evaluador)\b/iu.test(textoCompleto)) {
    const tieneTerna = /(?:presidente|secretario|integrante|vocal|primer\s+miembro|segundo\s+miembro)/iu.test(textoCompleto);
    if (tieneTerna) {
      agregar(
        "JURADO_TERNA",
        "CONFORME",
        "Estructura de la terna / jurado evaluador identificada en el documento.",
      );
    } else if (tipoDoc === "ANEXO_33") {
      agregar(
        "JURADO_TERNA",
        "ADVERTENCIA",
        "El formato de nombramiento de jurado debe especificar los miembros de la terna (Presidente, Integrante, Secretario).",
        1,
        "Presidente / Integrante / Secretario",
        "No detectado",
      );
    }
  }

  // E. Programa oficial FIPS
  if (datos.programa && (tipoDoc.includes("ANEXO") || tipoDoc.includes("SOLICITUD"))) {
    const palabrasProg = normalizarTextoDocumento(datos.programa)
      .split(" ")
      .filter((p) => p.length > 4);
    const matchProg = palabrasProg.filter((p) => textoNormalizado.includes(p));
    if (matchProg.length >= Math.min(2, palabrasProg.length)) {
      agregar(
        "PROGRAMA",
        "CONFORME",
        `Mención al programa académico oficial verificada.`,
      );
    }
  }

  // F. Cláusulas reglamentarias específicas según el tipo de Anexo
  if (tipoDoc.includes("ANEXO_01") || tipoDoc.includes("AUTORIZACION_PUBLICACION")) {
    const tieneRepositorio = /(?:repositorio|publicaci[oó]n\s+digital|difusi[oó]n|acceso\s+abierto|restringido|embargo|licencia)/iu.test(textoCompleto);
    if (tieneRepositorio) {
      agregar(
        "CLAUSULA_NORMATIVA",
        "CONFORME",
        "Cláusula de autorización de publicación digital en el repositorio institucional verificada.",
      );
    } else {
      agregar(
        "CLAUSULA_NORMATIVA",
        "ADVERTENCIA",
        "El Anexo 01 debe incluir la autorización formal de publicación en el repositorio institucional UNSA.",
        1,
        "Autorización de publicación en repositorio institucional",
        "Cláusula no detectada",
      );
    }
  } else if (tipoDoc.includes("ANEXO_02")) {
    const tienePenales = /(?:antecedentes|policiales|penales|judiciales)/iu.test(textoCompleto);
    const tieneTerrorismo = /(?:terrorismo|apolog[ií]a)/iu.test(textoCompleto);
    if (tienePenales && tieneTerrorismo) {
      agregar(
        "CLAUSULA_NORMATIVA",
        "CONFORME",
        "Declaración jurada de no antecedentes penales ni condenas por terrorismo verificada.",
      );
    } else {
      agregar(
        "CLAUSULA_NORMATIVA",
        "ADVERTENCIA",
        "El Anexo 02 debe declarar expresamente no tener antecedentes policiales/penales ni condenas por terrorismo.",
        1,
        "No antecedentes policiales/penales ni terrorismo",
        "Declaración incompleta",
      );
    }
  } else if (tipoDoc.includes("ANEXO_32") || tipoDoc.includes("VERACIDAD")) {
    const tieneVeracidad = /(?:veracidad|autenticidad|originalidad|autor[ií]a|plagio)/iu.test(textoCompleto);
    if (tieneVeracidad) {
      agregar(
        "CLAUSULA_NORMATIVA",
        "CONFORME",
        "Declaración jurada de veracidad de la información y autenticidad del trabajo verificada.",
      );
    } else {
      agregar(
        "CLAUSULA_NORMATIVA",
        "ADVERTENCIA",
        "El Anexo 32 debe incluir la declaración formal de veracidad de la información y originalidad.",
        1,
        "Veracidad y originalidad",
        "Cláusula no detectada",
      );
    }
  } else if (tipoDoc.includes("CONFIDENCIALIDAD")) {
    const tieneConf = /(?:confidencialidad|reserva|secreto|uso\s+de\s+informaci[oó]n)/iu.test(textoCompleto);
    if (tieneConf) {
      agregar(
        "CLAUSULA_NORMATIVA",
        "CONFORME",
        "Compromiso de confidencialidad y autorización de uso de información verificado.",
      );
    } else {
      agregar(
        "CLAUSULA_NORMATIVA",
        "ADVERTENCIA",
        "La DJ debe declarar el compromiso de confidencialidad y uso adecuado de la información de la empresa.",
        1,
        "Compromiso de confidencialidad",
        "Cláusula no detectada",
      );
    }
  } else if (tipoDoc.includes("ANEXO_18")) {
    const tieneConformidad = /(?:conformidad|asesoramiento|satisfactorio|aprobado|favorable)/iu.test(textoCompleto);
    if (tieneConformidad) {
      agregar(
        "CLAUSULA_NORMATIVA",
        "CONFORME",
        "Dictamen de conformidad de asesoramiento de proyecto identificado.",
      );
    } else {
      agregar(
        "CLAUSULA_NORMATIVA",
        "ADVERTENCIA",
        "El Anexo 18 debe contener la conformidad explícita del docente asesor respecto al plan de tesis.",
        1,
        "Conformidad explícita de asesoramiento",
        "No detectado",
      );
    }
  }

  // G. Verificación de firma gráfica o digital
  const tieneFirmaDigital = /(?:firmado\s+digitalmente|firma\s+digital|digital\s+signature|certificado\s+digital|firmado\s+electr[oó]nicamente|r[uú]brica\s+digital)/iu.test(textoCompleto);
  const tieneBloqueFirma = /(?:firma\s+del\s+solicitante|firma\s+del\s+tesista|firma\s+del\s+asesor|firma\s+del\s+postulante|firma\s+del\s+graduando|firma\s+del\s+declarante|huella\s+dactilar|firma\s+y\s+sello|post\s*firma)/iu.test(textoCompleto);
  const lineaVaciaFirma = /_{6,}\s*(?:\r?\n\s*)*(?:firma|solicitante|tesista|postulante|asesor|declarante)/iu.test(textoCompleto);

  if (tieneFirmaDigital) {
    agregar(
      "FIRMA_DOCUMENTO",
      "CONFORME",
      "Firma digital / electrónica identificada en el documento.",
    );
  } else if (lineaVaciaFirma) {
    agregar(
      "FIRMA_DOCUMENTO",
      "ADVERTENCIA",
      "Se detectó la línea de firma en blanco sin rúbrica ni firma digital estampada. Asegúrese de estampar su firma manuscrita o digital antes de enviar.",
      1,
      "Firma estampada o digital",
      "Línea de firma vacía (___________)",
    );
  } else if (tieneBloqueFirma) {
    agregar(
      "FIRMA_DOCUMENTO",
      "CONFORME",
      "Bloque formal de suscripción y firma identificado en el documento.",
    );
  }

  // H. Título: contraste de similitud si el documento hace referencia a título
  let tituloDetectado: string | null = null;
  let similitudTitulo: number | null = null;
  const mencionaTitulo =
    /\b(?:t[ií]tulo|denominad[oa]|proyecto\s+de\s+tesis|plan\s+de\s+tesis|trabajo\s+acad[eé]mico)\b/iu.test(
      textoCompleto,
    );

  if (mencionaTitulo && datos.titulo) {
    const similitud = similitudTituloDocumento(datos.titulo, textoCompleto);
    similitudTitulo = similitud;
    if (similitud >= 35 || contieneFrase(textoCompleto, datos.titulo)) {
      tituloDetectado = datos.titulo;
      agregar(
        "TITULO",
        "CONFORME",
        "Referencia al título del proyecto/tesis verificada en el documento.",
      );
    } else {
      agregar(
        "TITULO",
        "ADVERTENCIA",
        "El documento hace referencia a un título o proyecto que difiere del registrado en el expediente.",
        1,
        datos.titulo,
        "Título diferente en documento",
      );
    }
  }

  return {
    estado: controles.some((c) => c.estado === "NO_EVALUABLE") ? "PARCIAL" : "COMPLETADO",
    tituloDetectado,
    similitudTitulo,
    resumen: "",
    resumenCompleto: false,
    controles,
    hallazgos,
  };
}
