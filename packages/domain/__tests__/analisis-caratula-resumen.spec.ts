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
  it("conserva el cero inicial del DNI", () => {
    expect(analizar().controles.find((c) => c.tipo === "TESISTA_1_DNI")?.estado).toBe("CONFORME");
  });
  it.each(["01234568", "9012345670"])("no usa similitud ni subcadenas para DNI: %s", (dni) => {
    expect(
      analizar(caratula.replace("01234567", dni)).controles.find((c) => c.tipo === "TESISTA_1_DNI")
        ?.estado,
    ).toBe("ADVERTENCIA");
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
