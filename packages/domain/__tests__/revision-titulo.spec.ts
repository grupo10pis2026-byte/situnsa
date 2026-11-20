import { describe, expect, it } from "vitest";
import {
  aplicarSugerencia,
  aTipoOracion,
  combinarSugerencias,
  palabrasRevisables,
  revisarFormatoTitulo,
  variantesOrtograficasEs,
} from "../src/solicitud/revision-titulo.js";

const mensajes = (t: string) => revisarFormatoTitulo(t).map((s) => s.mensaje);

describe("revisarFormatoTitulo", () => {
  it("título correcto: sin sugerencias", () => {
    expect(
      revisarFormatoTitulo("Implementación de una plataforma de analítica en Arequipa"),
    ).toEqual([]);
  });

  it("detecta espacio doble y propone uno simple", () => {
    const [s] = revisarFormatoTitulo("Sistema  de gestión");
    expect(s).toMatchObject({ inicio: 7, fin: 9, reemplazos: [" "] });
  });

  it("detecta punto final pero respeta puntos suspensivos", () => {
    expect(mensajes("Sistema de gestión.")).toContain("Los títulos no llevan punto final.");
    expect(mensajes("Sistema de gestión...")).not.toContain("Los títulos no llevan punto final.");
  });

  it("propone tipo oración para títulos en MAYÚSCULAS", () => {
    const [s] = revisarFormatoTitulo("SISTEMA DE GESTIÓN DOCUMENTAL");
    expect(s?.reemplazos).toEqual(["Sistema de gestión documental"]);
  });

  it("primera letra minúscula, espacio antes de coma, falta espacio tras coma", () => {
    const m = mensajes("sistema de control ,gestión");
    expect(m).toContain("El título debe iniciar con mayúscula.");
    expect(m).toContain("Sobra el espacio antes del signo de puntuación.");
    expect(m).toContain("Falta un espacio después del signo.");
  });

  it("palabra repetida y paréntesis sin cerrar", () => {
    const m = mensajes("Gestión de de procesos (caso Arequipa");
    expect(m).toContain("Palabra repetida: «de».");
    expect(m).toContain("Paréntesis sin cerrar.");
  });
});

describe("apoyo ortográfico", () => {
  it("omite siglas, nombres propios y palabras de una letra", () => {
    const p = palabrasRevisables("Plataforma web para la UNSA en Arequipa y Lima").map(
      (x) => x.palabra,
    );
    expect(p).toEqual(["Plataforma", "web", "para", "la", "en"]);
  });

  it("genera variantes de tilde y s/c/z a más de una edición", () => {
    expect(variantesOrtograficasEs("implementasion")).toContain("implementación");
    expect(variantesOrtograficasEs("Metodologia")).toContain("Metodología");
    expect(variantesOrtograficasEs("analisis")).toContain("análisis");
  });

  it("aTipoOracion y aplicarSugerencia", () => {
    expect(aTipoOracion("  HOLA MUNDO")).toBe("  Hola mundo");
    expect(aplicarSugerencia("ab  cd", { inicio: 2, fin: 4 }, " ")).toEqual({
      texto: "ab cd",
      cursor: 3,
    });
  });

  it("la palabra mal escrita prima sobre la mayúscula inicial y la incorpora", () => {
    const r = combinarSugerencias(
      [{ inicio: 0, fin: 1, tipo: "formato", mensaje: "may", reemplazos: ["I"] }],
      [{ inicio: 0, fin: 14, tipo: "ortografia", mensaje: "orto", reemplazos: ["implementación"] }],
    );
    expect(r).toEqual([
      { inicio: 0, fin: 14, tipo: "ortografia", mensaje: "orto", reemplazos: ["Implementación"] },
    ]);
  });

  it("combinarSugerencias descarta solapes", () => {
    const r = combinarSugerencias(
      [{ inicio: 0, fin: 10, tipo: "formato", mensaje: "a", reemplazos: [] }],
      [{ inicio: 3, fin: 5, tipo: "ortografia", mensaje: "b", reemplazos: [] }],
    );
    expect(r).toHaveLength(1);
  });
});
