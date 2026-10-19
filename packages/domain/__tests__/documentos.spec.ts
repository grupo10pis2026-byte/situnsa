import { describe, expect, it } from "vitest";
import {
  construirDatosDocumento,
  type ExpedienteDocumento,
  formatoAsesor,
  formatoNombrePersona,
  formatoTituloFormal,
} from "../src/documentos/datos-documento.js";
import {
  esEtiquetaFecha,
  esEtiquetaHora,
  extraerEtiquetas,
  fechaIso,
  fechaLarga,
  formatoAutoridad,
  horaLimpia,
  insertarEtiquetas,
} from "../src/documentos/etiquetas.js";
import {
  PLANTILLAS,
  plantillaDe,
  renderizarPlantilla,
  resolverNombreArchivo,
  resolverSubcarpetaEtapa,
} from "../src/documentos/plantillas.js";
import { CHECKLIST_COMPLETO } from "../src/expediente/checklist-catalogo.js";

const EXP: ExpedienteDocumento = {
  codigo: "SET010",
  titulo: "sistema de gestión de expedientes para la fips",
  programa: "SEGUNDA ESPECIALIDAD EN INGENIERÍA DE SISTEMAS",
  modalidad: "TESIS",
  participante1: { nombres: "María", apellidos: "Pérez Quispe", dni: "70112233", cui: "20240001" },
  participante2: null,
  asesor: { nombres: "Juan", apellidos: "Torres", dni: "29000001", grado: "Dr." },
  datosAdmin: { nroDecreto: "015-2026", presidente: "dr. ana ruiz", fechaApertura: "2026-09-01" },
};

describe("inserción de etiquetas (legacy insertarDatosEnDocumento)", () => {
  it("reemplaza las etiquetas con dato y conserva las vacías como pendientes", () => {
    const r = insertarEtiquetas("Decreto <<DECRETO>> de <<NOMBRES>> · <<OFICIO>>", {
      DECRETO: "015",
      NOMBRES: "María Pérez",
      OFICIO: "  ",
    });
    expect(r.texto).toBe("Decreto 015 de María Pérez · <<OFICIO>>");
    expect(r.pendientes).toEqual(["OFICIO"]);
  });

  it("normaliza el nombre de la etiqueta (espacios/mayúsculas)", () => {
    expect(extraerEtiquetas("<<presidente etapa 02>> y <<PRESIDENTE  ETAPA 02>>")).toEqual([
      "PRESIDENTE ETAPA 02",
    ]);
  });

  it("formatea fechas civiles en español", () => {
    expect(fechaLarga("2026-09-01")).toBe("1 de septiembre de 2026");
    expect(fechaLarga("2026-09-01T15:30:00Z")).toBe("1 de septiembre de 2026");
    expect(fechaLarga("01/09/2026")).toBe("1 de septiembre de 2026");
    expect(fechaLarga("16 de octubre de 2026")).toBe("16 de octubre de 2026");
    expect(fechaLarga(null)).toBe("");
  });

  it("convierte fechas a formato ISO para inputs nativos (YYYY-MM-DD)", () => {
    expect(fechaIso("2026-09-01")).toBe("2026-09-01");
    expect(fechaIso("2026-09-01T15:30:00Z")).toBe("2026-09-01");
    expect(fechaIso("01/09/2026")).toBe("2026-09-01");
    expect(fechaIso("16 de octubre de 2026")).toBe("2026-10-16");
    expect(fechaIso("")).toBe("");
    expect(fechaIso(null)).toBe("");
  });

  it("normaliza horas a formato HH:mm (24 horas)", () => {
    expect(horaLimpia("9:00")).toBe("09:00");
    expect(horaLimpia("09:00")).toBe("09:00");
    expect(horaLimpia("09:00:00")).toBe("09:00");
    expect(horaLimpia("14:30")).toBe("14:30");
    expect(horaLimpia("")).toBe("");
  });

  it("detecta etiquetas de fecha y hora", () => {
    expect(esEtiquetaFecha("FECHA")).toBe(true);
    expect(esEtiquetaFecha("FECHA DE CONFORMIDAD")).toBe(true);
    expect(esEtiquetaFecha("FECHA_OFICIO_OTI")).toBe(true);
    expect(esEtiquetaFecha("PRESIDENTE")).toBe(false);
    expect(esEtiquetaHora("HORA")).toBe(true);
    expect(esEtiquetaHora("HORAS DE LA SUSTENTACION")).toBe(true);
    expect(esEtiquetaHora("FECHA")).toBe(false);
  });
});

describe("datos del expediente (formato formal de nombres y títulos)", () => {
  const datos = construirDatosDocumento(EXP, new Date("2026-10-05T15:00:00Z"));

  it("asesor y autoridades en formato profesional Title Case (iniciales mayúsculas y prefijo)", () => {
    expect(formatoAsesor(EXP.asesor)).toBe("Dr. Juan Torres");
    expect(datos.ASESOR).toBe("Dr. Juan Torres");
    expect(datos.PRESIDENTE).toBe("Dr. Ana Ruiz");
    expect(formatoAutoridad("DR. CECILIO MAURO VILLAVICENCIO MELGAREJO")).toBe(
      "Dr. Cecilio Mauro Villavicencio Melgarejo",
    );
    expect(formatoAutoridad("mg. hugo rufino llamosas barriga")).toBe(
      "Mg. Hugo Rufino Llamosas Barriga",
    );
  });

  it("la tesis se formatea como título formal y los administrativos van en mayúsculas", () => {
    expect(datos.TESIS).toBe("Sistema de Gestión de Expedientes para la FIPS");
    expect(datos.MODALIDAD).toBe("Plan de Tesis");
    expect(datos.MOD_F).toBe("La Tesis");
    expect(datos["FECHA APERTURA"]).toBe("1 de septiembre de 2026");
    expect(datos.FECHA_EMISION).toBe("5 de octubre de 2026");
  });

  it("en expediente de 2 tesistas ambos comparten el título de tesis formal y NOM_MIN tiene saltos de línea", () => {
    const exp2: ExpedienteDocumento = {
      ...EXP,
      participante2: { nombres: "Carlos", apellidos: "Gómez López", dni: "70223344" },
      datosAdmin: { ...EXP.datosAdmin, titulo02: "otro titulo desfasado" },
    };
    const d2 = construirDatosDocumento(exp2, new Date("2026-10-05T15:00:00Z"));
    expect(d2.TESIS).toBe("Sistema de Gestión de Expedientes para la FIPS");
    expect(d2["TESIS 02"]).toBe("Sistema de Gestión de Expedientes para la FIPS");
    expect(d2.TESIS02).toBe("Sistema de Gestión de Expedientes para la FIPS");
    expect(d2.NOM_MIN).toBe("María Pérez Quispe\nCarlos Gómez López");
  });

  it("formatoNombrePersona respeta grados, preposiciones y partículas", () => {
    expect(formatoNombrePersona("MARÍA DEL PILAR NÚÑEZ DE LA TORRE")).toBe(
      "María del Pilar Núñez de la Torre",
    );
    expect(formatoNombrePersona("MARIA DEL PILAR NUÑEZ DE LA TORRE")).toBe(
      "Maria del Pilar Nuñez de la Torre",
    );
    expect(formatoNombrePersona("DR. JUAN CARLOS PEREZ")).toBe("Dr. Juan Carlos Perez");
    expect(formatoNombrePersona("DRA. ANA RUIZ")).toBe("Dra. Ana Ruiz");
    expect(formatoNombrePersona("MG. HUGO RUFINO LLAMOSAS BARRIGA")).toBe(
      "Mg. Hugo Rufino Llamosas Barriga",
    );
    expect(formatoNombrePersona("DE LA CRUZ, JUAN")).toBe("De la Cruz, Juan");
  });

  it("formatoTituloFormal retira comillas, puntos finales y aplica mayúsculas formales conservando acrónimos", () => {
    expect(formatoTituloFormal("«SISTEMA WEB DE GESTIÓN DE EXPEDIENTES PARA LA FIPS.»")).toBe(
      "Sistema Web de Gestión de Expedientes para la FIPS",
    );
    expect(formatoTituloFormal("SISTEMA BASADO EN IA Y TIC PARA LA UNSA.")).toBe(
      "Sistema Basado en IA y TIC para la UNSA",
    );
    expect(
      formatoTituloFormal("Diseño e Implementación de un Sistema de Monitoreo para la FIPS"),
    ).toBe("Diseño e Implementación de un Sistema de Monitoreo para la FIPS");
=======
    expect(d2.TESIS).toBe("sistema de gestión de expedientes para la fips");
    expect(d2["TESIS 02"]).toBe("sistema de gestión de expedientes para la fips");
    expect(d2.TESIS02).toBe("sistema de gestión de expedientes para la fips");
    expect(d2.NOM_MIN).toBe("María Pérez Quispe\nCarlos Gómez López");
>>>>>>> feat/modulo-almacenamiento-y-gestion-documental
  });
});

describe("plantillas", () => {
  it("cada plantilla de tipo checklist corresponde a un documento del catálogo", () => {
    const tipos = new Set(CHECKLIST_COMPLETO.map((d) => d.tipo));
    const extras = new Set([
      "CARATULA_PLAN",
      "DECRETO_APROBACION",
      "OFICIO_CIRCULAR_TERNA",
      "OBSERVACIONES_PLAN",
      "ANEXO_08",
      "ANEXO_02_DJ",
      "ANEXO_01_DJ_P1",
      "ANEXO_01_DJ_P2",
      "ANEXO_02_DJ_P1",
      "ANEXO_02_DJ_P2",
      "OBSERVACIONES_TESIS",
      "INFORME_SIMILITUD",
      "INVITACION_PUBLICA",
      "OFICIO_OTI_SIMILITUD",
      "OFICIO_UGI_REPOSITORIO",
      "RESOLUCION_DECANAL",
      "INFORME_SECRETARIA",
      "ETIQUETAS",
    ]);
    for (const p of PLANTILLAS) expect(tipos.has(p.tipo) || extras.has(p.tipo)).toBe(true);
  });

  it("el decreto informa campos pendientes cuando faltan datos", () => {
    const plantilla = plantillaDe("DECRETO_APROBACION");
    expect(plantilla).not.toBeNull();
    if (!plantilla) return;
    const doc = renderizarPlantilla(plantilla, construirDatosDocumento(EXP, new Date()));
    expect(doc.pendientes).toEqual(["RECOMENDACION", "SECRETARIO"]);
    expect(doc.titulo.map((s) => s.texto).join("")).toBe("DECRETO N° 015-2026");
  });

  it("informe para Secretaría (HU-0045): jurado de Cierre, similitud y repositorio", () => {
    const plantilla = plantillaDe("INFORME_SECRETARIA");
    expect(plantilla?.etapa).toBe("E6");
    if (!plantilla) return;
    const completo = renderizarPlantilla(
      plantilla,
      construirDatosDocumento(
        {
          ...EXP,
          datosAdmin: { ...EXP.datosAdmin, decanal: "RD 042-2026" },
          sustentacion: {
            fecha: "2026-11-20",
            hora: "10:00",
            lugar: "Auditorio FIPS",
            actaVeredicto: "UNANIMIDAD",
          },
          jurado: [
            { rol: "VOCAL", nombre: "Ing. Luis Soto" },
            { rol: "PRESIDENTE", nombre: "Dr. Ana Ruiz" },
            { rol: "SECRETARIO", nombre: "Mg. Rosa Díaz" },
          ],
          validaciones: { similitud: 12, urlRepositorio: "https://repositorio.unsa.edu.pe/x/1" },
        },
        new Date("2026-12-01T15:00:00Z"),
      ),
    );
    expect(completo.pendientes).toEqual([]);
    const texto = completo.parrafos.map((p) => p.map((x) => x.texto).join("")).join("\n");
    expect(texto).toContain(
      "Dr. Ana Ruiz (presidente), Mg. Rosa Díaz (secretario) y Ing. Luis Soto (vocal)",
    );
    expect(texto).toContain("similitud del reporte Turnitin es de 12 %");
    expect(texto).toContain("APROBADO POR UNANIMIDAD");

    const incompleto = renderizarPlantilla(plantilla, construirDatosDocumento(EXP, new Date()));
    expect(incompleto.pendientes).toEqual([
      "DECANAL",
      "FECHA",
      "JURADO",
      "SIMILITUD",
      "URL REPOSITORIO",
      "VEREDICTO",
    ]);
  });

  it("resuelve nombres oficiales exactos de archivos para 1 y 2 tesistas", () => {
    expect(resolverNombreArchivo("SOLICITUD_INSCRIPCION", 1)).toBe("ANEXO 17 - 01 TESISTA.pdf");
    expect(resolverNombreArchivo("SOLICITUD_INSCRIPCION", 2)).toBe("ANEXO 17 - 02 TESISTAS.pdf");
    expect(resolverNombreArchivo("CARATULA_PLAN", 1)).toBe("CARATULA_PLAN DE TESIS.pdf");
    expect(resolverNombreArchivo("CARATULA_PLAN", 2)).toBe("CARATULA_PLAN DE TESIS.pdf");
    expect(resolverNombreArchivo("DECRETO_APROBACION", 1)).toBe("DECRETO - 01 TESISTA.pdf");
    expect(resolverNombreArchivo("DECRETO_APROBACION", 2)).toBe("DECRETO - 02 TESISTAS.pdf");
    expect(resolverNombreArchivo("OFICIO_CIRCULAR_TERNA", 1)).toBe(
      "OFICIO CIRCULAR- 01 TESISTA.pdf",
    );
    expect(resolverNombreArchivo("OFICIO_CIRCULAR_TERNA", 2)).toBe(
      "OFICIO CIRCULAR- 02 TESISTAS.pdf",
    );
    expect(resolverNombreArchivo("OBSERVACIONES_PLAN", 1)).toBe(
      "OBSERVACIONES DE PLAN DE TESIS - 01 TESISTA.pdf",
    );
    expect(resolverNombreArchivo("OBSERVACIONES_PLAN", 2)).toBe(
      "OBSERVACIONES DE PLAN DE TESIS - 02 TESISTAS.pdf",
    );
  });

  it("resuelve las subcarpetas institucionales por etapa", () => {
    expect(resolverSubcarpetaEtapa("E1")).toBe("01. Plan de Tesis");
    expect(resolverSubcarpetaEtapa("E2")).toBe("02. Desarrollo y Sustentacion");
  });
});
