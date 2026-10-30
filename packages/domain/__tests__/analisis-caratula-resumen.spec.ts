/**
 * Pruebas puras del motor documentos/analisis-caratula-resumen.ts, usado por POST /api/documentos/:id/analisis.
 * Cubren normalización, identidad, encabezados y cobertura del resumen sin I/O.
 */
import { describe, expect, it } from "vitest";
import {
  analizarCaratulaResumen,
  normalizarTextoDocumento,
  similitudTituloDocumento,
} from "../src/documentos/analisis-caratula-resumen.js";

const datos = {
  titulo: "Optimización del consumo energético en sistemas de bombeo 2026",
  tesistas: [{ nombre: "María Núñez García", dni: "01234567" }],
  asesor: { nombre: "José Pérez Torres", dni: "07654321" },
};
const caratula = `UNIVERSIDAD\nTítulo: ${datos.titulo}\nTesista: María Núñez García\nDNI: 01234567\nAsesor: Dr. José Pérez Torres\nDNI: 07654321`;
const paginas = [
  { numero: 1, texto: caratula },
  {
    numero: 2,
    texto: "RESUMEN\nSe estudió la termodinámica de los sistemas.\nPalabras clave: energía",
  },
];
const analizar = (texto = caratula) =>
  analizarCaratulaResumen(
    [{ ...paginas[0], numero: 1, texto }, paginas[1] ?? { numero: 2, texto: "" }],
    datos,
    2,
  );

describe("motor puro de carátula y resumen", () => {
  it("coincide con título, identidades y resumen del fixture válido", () => {
    const resultado = analizar();
    expect(resultado.estado).toBe("COMPLETADO");
    expect(resultado.hallazgos).toEqual([]);
    expect(resultado.similitudTitulo).toBe(100);
    expect(resultado.resumen).toBe("Se estudió la termodinámica de los sistemas.");
  });
  it("normaliza Unicode NFC, mayúsculas y espacios sin perder ñ", () => {
    expect(normalizarTextoDocumento("  NÚÑEZ\nGarcía ".normalize("NFD"))).toBe("núñez garcía");
    expect(normalizarTextoDocumento("Núñez")).not.toBe(normalizarTextoDocumento("Nunez"));
  });
  it.each(["2025", "no 2026"])(
    "advierte cambios significativos aunque la similitud sea alta: %s",
    (cambio) => {
      expect(
        analizar(caratula.replace("2026", cambio)).controles.find((c) => c.tipo === "TITULO")
          ?.estado,
      ).toBe("ADVERTENCIA");
    },
  );
  it("no evalúa DNI en la carátula según formato oficial", () => {
    const r = analizar();
    expect(r.controles.some((c) => c.tipo.includes("DNI"))).toBe(false);
    expect(r.hallazgos.some((h) => h.tipo.includes("DNI"))).toBe(false);
  });
  it("verifica todos los tesistas", () => {
    const resultado = analizarCaratulaResumen(
      paginas,
      { ...datos, tesistas: [...datos.tesistas, { nombre: "Ana Torres", dni: "11111111" }] },
      2,
    );
    expect(resultado.controles.find((c) => c.tipo === "TESISTA_2")?.estado).toBe("ADVERTENCIA");
  });
  it("no encuentra el título en páginas posteriores como si fuera carátula", () => {
    const resultado = analizarCaratulaResumen(
      [
        { numero: 1, texto: "UNIVERSIDAD\nTítulo: Otro título\nTesista: María Núñez García" },
        { numero: 2, texto: `Resumen\n${datos.titulo}` },
      ],
      datos,
      2,
    );
    expect(resultado.controles.find((c) => c.tipo === "TITULO")?.estado).toBe("ADVERTENCIA");
  });
  it.each(["Resumen", "RESUMEN", "Abstract"])("reconoce encabezado %s", (encabezado) => {
    expect(
      analizarCaratulaResumen(
        [
          { numero: 1, texto: caratula },
          { numero: 2, texto: `${encabezado}\nContenido del estudio` },
        ],
        datos,
        2,
      ).resumen,
    ).toBe("Contenido del estudio");
  });
  it("no trata una palabra dentro de una oración como encabezado", () => {
    const r = analizarCaratulaResumen(
      [
        { numero: 1, texto: caratula },
        { numero: 2, texto: "Este resumen presenta resultados." },
      ],
      datos,
      2,
    );
    expect(r.resumen).toBe("");
    expect(r.hallazgos.some((h) => h.tipo === "RESUMEN")).toBe(true);
  });
  it("encabezado vacío no es conformidad", () => {
    expect(
      analizarCaratulaResumen(
        [
          { numero: 1, texto: caratula },
          { numero: 2, texto: "Resumen\n " },
        ],
        datos,
        2,
      ).estado,
    ).toBe("PARCIAL");
  });
  it("PDF escaneado no produce aprobación falsa", () => {
    expect(analizarCaratulaResumen([{ numero: 1, texto: "" }], datos, 1).estado).toBe(
      "NO_EVALUABLE",
    );
  });
  it("no procesa página 7 y reconoce cobertura parcial", () => {
    const r = analizarCaratulaResumen(
      [
        { numero: 1, texto: caratula },
        { numero: 6, texto: "Resumen\nContenido inconcluso" },
        { numero: 7, texto: "MARCADOR_PAGINA_7" },
      ],
      datos,
      7,
    );
    expect(r.resumen).not.toContain("MARCADOR_PAGINA_7");
    expect(r.resumenCompleto).toBe(false);
    expect(r.estado).toBe("PARCIAL");
  });
  it("datos base ausentes son no evaluables", () => {
    const r = analizarCaratulaResumen(paginas, { titulo: "", tesistas: [], asesor: null }, 2);
    expect(r.estado).toBe("PARCIAL");
    expect(r.controles.filter((c) => c.estado === "NO_EVALUABLE")).toHaveLength(3);
  });
  it("detecta comillas en el título según formato oficial", () => {
    const conComillas = caratula.replace(datos.titulo, `"${datos.titulo}"`);
    const r = analizar(conComillas);
    const hallazgo = r.hallazgos.find((h) => h.tipo === "TITULO_COMILLAS");
    expect(hallazgo).toBeDefined();
    expect(hallazgo?.severidad).toBe("ADVERTENCIA");
    expect(hallazgo?.esperado).toBe(datos.titulo);
    expect(hallazgo?.encontrado).toContain(`"${datos.titulo}"`);
  });
  it("detecta punto final en el título según formato oficial", () => {
    const conPunto = caratula.replace(datos.titulo, `${datos.titulo}.`);
    const r = analizar(conPunto);
    const hallazgo = r.hallazgos.find((h) => h.tipo === "TITULO_PUNTO_FINAL");
    expect(hallazgo).toBeDefined();
    expect(hallazgo?.esperado).toBe(datos.titulo);
    expect(hallazgo?.encontrado).toContain(`${datos.titulo}.`);
  });
  it("detecta título en mayúsculas sostenidas", () => {
    const enMayusculas = caratula.replace(datos.titulo, datos.titulo.toUpperCase());
    const r = analizar(enMayusculas);
    const hallazgo = r.hallazgos.find((h) => h.tipo === "TITULO_MAYUSCULAS");
    expect(hallazgo).toBeDefined();
    expect(hallazgo?.encontrado).toBe(datos.titulo.toUpperCase());
  });
  it("detecta fórmula errónea de presentación en Trabajo Académico", () => {
    const caratulaTrabajoErronea = `UNIVERSIDAD\nTítulo: ${datos.titulo}\nTesis presentada por: María Núñez García\nDNI: 01234567\nAsesor: Dr. José Pérez Torres\nDNI: 07654321`;
    const r = analizarCaratulaResumen(
      [
        { numero: 1, texto: caratulaTrabajoErronea },
        { numero: 2, texto: "RESUMEN\nSe estudió el sistema.\nPalabras clave: red" },
      ],
      { ...datos, modalidad: "TRABAJO_ACADEMICO" },
      2,
    );
    const hallazgo = r.hallazgos.find((h) => h.tipo === "MODALIDAD_FORMULA");
    expect(hallazgo).toBeDefined();
    expect(hallazgo?.esperado).toBe("Trabajo Académico presentado por:");
    expect(hallazgo?.encontrado).toBe("Tesis presentada por:");
  });
  it("detecta falta de PALABRAS CLAVE en el resumen", () => {
    const r = analizarCaratulaResumen(
      [
        { numero: 1, texto: caratula },
        { numero: 2, texto: "RESUMEN\nTexto sin sección de palabras clave." },
      ],
      datos,
      2,
    );
    const hallazgo = r.hallazgos.find((h) => h.tipo === "RESUMEN_PALABRAS_CLAVE");
    expect(hallazgo).toBeDefined();
    expect(hallazgo?.esperado).toContain("PALABRAS CLAVE:");
  });
  it("detecta falta de grado académico en el asesor", () => {
    const caratulaSinGrado = caratula.replace("Dr. José Pérez Torres", "José Pérez Torres");
    const r = analizar(caratulaSinGrado);
    const hallazgo = r.hallazgos.find((h) => h.tipo === "ASESOR_GRADO");
    expect(hallazgo).toBeDefined();
    expect(hallazgo?.esperado).toContain("Mg./Dr./MSc.");
  });
  it("determinismo y ausencia de mutación", () => {
    const antes = JSON.stringify({ paginas, datos });
    expect(analizarCaratulaResumen(paginas, datos, 2)).toEqual(
      analizarCaratulaResumen(paginas, datos, 2),
    );
    expect(JSON.stringify({ paginas, datos })).toBe(antes);
    expect(similitudTituloDocumento("", "otro")).toBe(0);
  });
});

describe("motor de revisión de documentos subidos y boletas", () => {
  it("detecta tipos de boletas y comprobantes", async () => {
    const { esTipoBoleta } = await import("../src/documentos/analisis-caratula-resumen.js");
    expect(esTipoBoleta("BOLETA_PAGO")).toBe(true);
    expect(esTipoBoleta("RECIBO")).toBe(true);
    expect(esTipoBoleta("COMPROBANTE_CUOTA")).toBe(true);
    expect(esTipoBoleta("PLAN_ESTRUCTURADO")).toBe(false);
    expect(esTipoBoleta("ACEPTACION_ASESORIA")).toBe(false);
  });

  it("boleta válida: valida DNI y nombre insensible a mayúsculas/minúsculas", async () => {
    const { analizarDocumentoSubido } = await import(
      "../src/documentos/analisis-caratula-resumen.js"
    );
    const textoBoleta =
      "BANCO DE LA NACIÓN\nOPERACIÓN: 482910\nCLIENTE: MARÍA NÚÑEZ GARCÍA\nDNI: 01234567\nMONTO: S/ 250.00";
    const res = analizarDocumentoSubido("BOLETA", [{ numero: 1, texto: textoBoleta }], datos, 1);
    expect(res.estado).toBe("COMPLETADO");
    expect(res.hallazgos).toHaveLength(0);
    expect(res.controles.find((c) => c.tipo === "BOLETA_DNI")?.estado).toBe("CONFORME");
    expect(res.controles.find((c) => c.tipo === "BOLETA_NOMBRE")?.estado).toBe("CONFORME");
  });

  it("boleta con DNI diferente: emite advertencia con fragmento esperado vs encontrado", async () => {
    const { analizarDocumentoSubido } = await import(
      "../src/documentos/analisis-caratula-resumen.js"
    );
    const textoBoletaErronea =
      "BANCO DE LA NACIÓN\nCLIENTE: maría núñez garcía\nDNI: 99887766\nMONTO: S/ 250.00";
    const res = analizarDocumentoSubido(
      "BOLETA",
      [{ numero: 1, texto: textoBoletaErronea }],
      datos,
      1,
    );
    expect(res.hallazgos.some((h) => h.tipo === "BOLETA_DNI")).toBe(true);
    const hallazgo = res.hallazgos.find((h) => h.tipo === "BOLETA_DNI");
    expect(hallazgo?.esperado).toBe("01234567");
    expect(hallazgo?.encontrado).toContain("99887766");
  });

  it("documento sin asesor: no exige asesor si el documento no lo contiene", async () => {
    const { analizarDocumentoSubido } = await import(
      "../src/documentos/analisis-caratula-resumen.js"
    );
    const textoDJ =
      "DECLARACIÓN JURADA DE CONFIDENCIALIDAD\nYo, María Núñez García, identificada con DNI 01234567...";
    const res = analizarDocumentoSubido(
      "DJ_CONFIDENCIALIDAD",
      [{ numero: 1, texto: textoDJ }],
      datos,
      1,
    );
    expect(res.hallazgos).toHaveLength(0);
    expect(res.controles.some((c) => c.tipo === "ASESOR")).toBe(false);
  });

  it("documento que menciona asesor diferente: advierte discrepancia", async () => {
    const { analizarDocumentoSubido } = await import(
      "../src/documentos/analisis-caratula-resumen.js"
    );
    const textoCarta =
      "CARTA DE ACEPTACIÓN\nYo, Dr. Pedro Quispe Mamani, acepto ser asesor del proyecto de la tesista María Núñez García...";
    const res = analizarDocumentoSubido(
      "ACEPTACION_ASESORIA",
      [{ numero: 1, texto: textoCarta }],
      datos,
      1,
    );
    const hallazgoAsesor = res.hallazgos.find((h) => h.tipo === "ASESOR");
    expect(hallazgoAsesor).toBeDefined();
    expect(hallazgoAsesor?.esperado).toBe("José Pérez Torres");
  });

  it("documento escaneado sin texto extraíble: marca NO_EVALUABLE", async () => {
    const { analizarDocumentoSubido } = await import(
      "../src/documentos/analisis-caratula-resumen.js"
    );
    const res = analizarDocumentoSubido("ANEXO_33", [{ numero: 1, texto: "    " }], datos, 1);
    expect(res.estado).toBe("NO_EVALUABLE");
    expect(res.controles.find((c) => c.tipo === "DOCUMENTO_LEGIBILIDAD")?.estado).toBe(
      "NO_EVALUABLE",
    );
  });

  it("solicitud Anexo 17: valida destinatario Director de Unidad y presencia de firma", async () => {
    const { analizarDocumentoSubido } = await import(
      "../src/documentos/analisis-caratula-resumen.js"
    );
    const textoValido = `SEÑOR DIRECTOR DE LA UNIDAD DE SEGUNDAS ESPECIALIDADES
Yo, María Núñez García, con DNI 01234567, CUI 20180123...
Solicito inscripción del plan de tesis: Optimización del consumo energético en sistemas de bombeo 2026.
Firmado digitalmente por: María Núñez García`;

    const res = analizarDocumentoSubido(
      "SOLICITUD_INSCRIPCION",
      [{ numero: 1, texto: textoValido }],
      { ...datos, tesistas: [{ ...datos.tesistas[0], cui: "20180123" }] },
      1,
    );
    expect(res.controles.find((c) => c.tipo === "AUTORIDAD_DESTINO")?.estado).toBe("CONFORME");
    expect(res.controles.find((c) => c.tipo === "FIRMA_DOCUMENTO")?.estado).toBe("CONFORME");
    expect(res.controles.find((c) => c.tipo === "CUI_TESISTA")?.estado).toBe("CONFORME");
    expect(res.hallazgos).toHaveLength(0);
  });

  it("solicitud Anexo 17 con línea de firma vacía: emite advertencia de firma faltante", async () => {
    const { analizarDocumentoSubido } = await import(
      "../src/documentos/analisis-caratula-resumen.js"
    );
    const textoSinFirma = `SEÑOR DIRECTOR DE LA UNIDAD
Yo, María Núñez García, con DNI 01234567...
___________________________
Firma del solicitante`;

    const res = analizarDocumentoSubido(
      "SOLICITUD_INSCRIPCION",
      [{ numero: 1, texto: textoSinFirma }],
      datos,
      1,
    );
    const hallazgoFirma = res.hallazgos.find((h) => h.tipo === "FIRMA_DOCUMENTO");
    expect(hallazgoFirma).toBeDefined();
    expect(hallazgoFirma?.mensaje).toContain("línea de firma en blanco");
  });

  it("solicitud Anexo 27: valida destinatario Decano y advierte si falta", async () => {
    const { analizarDocumentoSubido } = await import(
      "../src/documentos/analisis-caratula-resumen.js"
    );
    const textoErroneo = `SEÑOR RECTOR DE LA UNIVERSIDAD
Yo, María Núñez García, DNI 01234567, solicito optar el título...`;

    const res = analizarDocumentoSubido(
      "ANEXO_27",
      [{ numero: 1, texto: textoErroneo }],
      datos,
      1,
    );
    const hallazgoDecano = res.hallazgos.find((h) => h.tipo === "AUTORIDAD_DESTINO");
    expect(hallazgoDecano).toBeDefined();
    expect(hallazgoDecano?.esperado).toContain("Decano");
  });

  it("anexo 02 DJ antecedentes: valida cláusulas penales y de terrorismo", async () => {
    const { analizarDocumentoSubido } = await import(
      "../src/documentos/analisis-caratula-resumen.js"
    );
    const textoIncompleto = `DECLARACIÓN JURADA
Yo, María Núñez García, con DNI 01234567, declaro no tener antecedentes penales.`;

    const res = analizarDocumentoSubido(
      "ANEXO_02_DJ",
      [{ numero: 1, texto: textoIncompleto }],
      datos,
      1,
    );
    const hallazgoClausula = res.hallazgos.find((h) => h.tipo === "CLAUSULA_NORMATIVA");
    expect(hallazgoClausula).toBeDefined();
    expect(hallazgoClausula?.mensaje).toContain("terrorismo");
  });

  it("anexo 32 DJ veracidad: valida cláusula de veracidad y originalidad", async () => {
    const { analizarDocumentoSubido } = await import(
      "../src/documentos/analisis-caratula-resumen.js"
    );
    const textoConforme = `DECLARACIÓN JURADA DE VERACIDAD DE INFORMACIÓN
Yo, María Núñez García, con DNI 01234567, declaro bajo juramento la veracidad y autenticidad del contenido presentado en mi tesis...
Firma del declarante`;

    const res = analizarDocumentoSubido(
      "ANEXO_32_VERACIDAD",
      [{ numero: 1, texto: textoConforme }],
      datos,
      1,
    );
    expect(res.controles.find((c) => c.tipo === "CLAUSULA_NORMATIVA")?.estado).toBe("CONFORME");
    expect(res.hallazgos).toHaveLength(0);
  });

  it("ortotipografía: advierte si el nombre en documento omite tildes oficiales", async () => {
    const { analizarDocumentoSubido } = await import(
      "../src/documentos/analisis-caratula-resumen.js"
    );
    const textoSinTildes = `SOLICITUD
Yo, Maria Nunez Garcia, identificada con DNI 01234567...`;

    const res = analizarDocumentoSubido(
      "ANEXO_17",
      [{ numero: 1, texto: textoSinTildes }],
      datos,
      1,
    );
    const hallazgoOrtografia = res.hallazgos.find((h) => h.tipo === "TESISTA_ORTOTIPOGRAFIA");
    expect(hallazgoOrtografia).toBeDefined();
    expect(hallazgoOrtografia?.esperado).toBe("María Núñez García");
  });

  it("descarte previo: descarta documento ajeno sin encabezado oficial y no continúa analizando", async () => {
    const { analizarDocumentoSubido } = await import(
      "../src/documentos/analisis-caratula-resumen.js"
    );
    const textoAjeno = `SÍLABO DE CURSO: INTRODUCCIÓN A LA PROGRAMACIÓN
Docente: Ing. Roberto Sánchez
Competencias: El estudiante aprenderá algoritmos básicos y estructuras de control.
Bibliografía: Deitel & Deitel, 2020.`;

    const res = analizarDocumentoSubido(
      "SOLICITUD_INSCRIPCION",
      [{ numero: 1, texto: textoAjeno }],
      datos,
      1,
    );
    expect(res.estado).toBe("PARCIAL");
    expect(res.controles.some((c) => c.tipo === "DOCUMENTO_ERRONEO")).toBe(true);
    expect(res.hallazgos).toHaveLength(1);
    expect(res.hallazgos[0].tipo).toBe("DOCUMENTO_ERRONEO");
    expect(res.hallazgos[0].mensaje).toContain("Documento erróneo");
    // No debe evaluar tesistas ni dar falsos conformes cuando el archivo es ajeno
    expect(res.controles.some((c) => c.tipo === "TESISTA")).toBe(false);
    expect(res.controles.some((c) => c.tipo === "PROGRAMA")).toBe(false);
  });
});
