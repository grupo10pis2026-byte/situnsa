import { PLANTILLAS } from "@pis/domain";
import { describe, expect, it } from "vitest";
import { aplicarAjustes, CATALOGO_FORMATOS } from "../../../formatos/catalogo-formatos.js";
import {
  descartarOverridesNumeracion,
  extraerCambiosExpedienteYUsuarios,
  itemsDeEtapa,
} from "./generar-documentos.use-case.js";

describe("extraerCambiosExpedienteYUsuarios", () => {
  it("mapea campos de participante 1 y 2 correctamente", () => {
    const overrides = {
      DIRECCION: "Calle Los Pinos 123",
      TELEFONO: "987654321",
      CIUDAD: "Arequipa",
      NACIONALIDAD: "Peruana",
      CUI: "20180001",
      CORREO: "tesista1@unsa.edu.pe",
      DIRECCION02: "Av. Independencia 456",
      TELEFONO02: "912345678",
      CIUDAD02: "Cayma",
      NACIONALIDAD02: "Peruana",
      CUI02: "20180002",
      EMAIL02: "tesista2@unsa.edu.pe",
    };

    const res = extraerCambiosExpedienteYUsuarios(overrides);

    expect(res.participante1).toEqual({
      direccion: "Calle Los Pinos 123",
      telefono: "987654321",
      ciudad: "Arequipa",
      nacionalidad: "Peruana",
      cui: "20180001",
      email: "tesista1@unsa.edu.pe",
    });

    expect(res.participante2).toEqual({
      direccion: "Av. Independencia 456",
      telefono: "912345678",
      ciudad: "Cayma",
      nacionalidad: "Peruana",
      cui: "20180002",
      email: "tesista2@unsa.edu.pe",
    });
  });

  it("mapea campos de expediente con normalización y formato de autoridad", () => {
    const overrides = {
      DECRETO: "DEC-2026-042",
      OFICIO: "OF-100-2026",
      RECOMENDACION: "Aprobado sin observaciones",
      COASESOR: "dr. cecilio mauro villavicencio melgarejo",
      ASESOR: "mg. alvaro hugo mamani ali",
      PRESIDENTE: "ing. juan perez",
      SECRETARIO: "dr. carlos ruiz",
      INTEGRANTE: "dra. maria salas",
      SUPLENTE: "mgtr. ana gomez",
      FECHA_SUSTENTACION: "25/11/2026",
      HORA: "10:30:00",
      LUGAR_SUSTENTACION: "Sala de Grados 1",
    };

    const res = extraerCambiosExpedienteYUsuarios(overrides);

    expect(res.expediente).toEqual({
      nroDecreto: "DEC-2026-042",
      nroOficio: "OF-100-2026",
      recomendacion: "Aprobado sin observaciones",
      coAsesor: "Dr. Cecilio Mauro Villavicencio Melgarejo",
      asesorNombre: "Mg. Alvaro Hugo Mamani Ali",
      presidente: "Ing. Juan Perez",
      secretario: "Dr. Carlos Ruiz",
      integrante: "Dra. Maria Salas",
      suplenteE2: "Mgtr. Ana Gomez",
      fechaSustentacion: "2026-11-25",
      horaSustentacion: "10:30",
      lugarSustentacion: "Sala de Grados 1",
    });
  });

  it("ignora claves vacías o no reconocidas", () => {
    const overrides = {
      DIRECCION: "",
      CLAVE_DESCONOCIDA: "algún valor",
    };

    const res = extraerCambiosExpedienteYUsuarios(overrides);

    expect(res.expediente).toEqual({});
    expect(res.participante1).toEqual({});
    expect(res.participante2).toEqual({});
  });
});

describe("descartarOverridesNumeracion", () => {
  it("conserva todo si el expediente no tiene vínculos", () => {
    const o = { DECRETO: "99", TESIS: "x" };
    expect(descartarOverridesNumeracion(o, new Set())).toEqual(o);
  });

  it("descarta solo las etiquetas del número vinculado", () => {
    const o = { DECRETO: "99", "n° decreto": "99", OFICIO: "5", FECHA_DECRETO: "2026-01-01" };
    expect(descartarOverridesNumeracion(o, new Set(["DECRETO"]))).toEqual({
      OFICIO: "5",
      FECHA_DECRETO: "2026-01-01",
    });
  });
});

describe("itemsDeEtapa (formatos agrupados por etapa en «Gestión de formatos»)", () => {
  const tipos = (xs: Array<{ tipo: string }>) => xs.map((x) => x.tipo);

  it("sin ajustes genera las plantillas del sistema en su etapa original", () => {
    const e1 = itemsDeEtapa(PLANTILLAS, CATALOGO_FORMATOS, 1, "E1");
    expect(tipos(e1)).toContain("DECRETO_APROBACION");
    expect(tipos(e1)).not.toContain("ACTA_DICTAMEN");
    const e2 = itemsDeEtapa(PLANTILLAS, CATALOGO_FORMATOS, 2, "E2");
    expect(tipos(e2)).toContain("ANEXO_01_DJ_P2");
    expect(tipos(e2)).not.toContain("ANEXO_01_DJ");
  });

  it("un formato movido se genera en su nueva etapa y solo en su variante", () => {
    const catalogo = aplicarAjustes(CATALOGO_FORMATOS, [
      {
        tipo: "ACTA_DICTAMEN",
        variante: 2,
        etapa: "E1",
        nombre: null,
        agregado: false,
        archivado: false,
      },
    ]);
    const e1de2 = itemsDeEtapa(PLANTILLAS, catalogo, 2, "E1");
    const movido = e1de2.find((i) => i.tipo === "ACTA_DICTAMEN");
    expect(movido).toMatchObject({ etapa: "E1", etapaBase: "E2" });
    expect(tipos(itemsDeEtapa(PLANTILLAS, catalogo, 2, "E2"))).not.toContain("ACTA_DICTAMEN");
    expect(tipos(itemsDeEtapa(PLANTILLAS, catalogo, 1, "E2"))).toContain("ACTA_DICTAMEN");
  });

  it("incluye los formatos agregados por el área (sin plantilla de texto)", () => {
    const catalogo = aplicarAjustes(CATALOGO_FORMATOS, [
      {
        tipo: "AREA_CONSTANCIA",
        variante: 1,
        etapa: "E2",
        nombre: "Constancia",
        agregado: true,
        archivado: false,
      },
    ]);
    const e2 = itemsDeEtapa(PLANTILLAS, catalogo, 1, "E2");
    expect(e2.find((i) => i.tipo === "AREA_CONSTANCIA")).toMatchObject({
      nombre: "Constancia",
      plantilla: null,
    });
    expect(tipos(itemsDeEtapa(PLANTILLAS, catalogo, 2, "E2"))).not.toContain("AREA_CONSTANCIA");
    expect(tipos(itemsDeEtapa(PLANTILLAS, catalogo, 1, "E1"))).not.toContain("AREA_CONSTANCIA");
  });

  it("nunca genera los formatos de Mesa de Partes (del sistema ni agregados)", () => {
    const catalogo = aplicarAjustes(CATALOGO_FORMATOS, [
      {
        tipo: "AREA_REQUISITO",
        variante: 1,
        etapa: "MP",
        nombre: "Requisito extra",
        agregado: true,
        archivado: false,
      },
    ]);
    for (const etapa of ["E1", "E2", "E6"] as const) {
      const ts = tipos(itemsDeEtapa(PLANTILLAS, catalogo, 1, etapa));
      expect(ts.some((t) => t.startsWith("MP_"))).toBe(false);
      expect(ts).not.toContain("AREA_REQUISITO");
    }
  });

  it("no genera los formatos que el área eliminó", () => {
    const catalogo = aplicarAjustes(
      CATALOGO_FORMATOS,
      [
        {
          tipo: "ANEXO_17",
          variante: 1,
          etapa: "E1",
          nombre: null,
          agregado: false,
          archivado: true,
        },
        {
          tipo: "AREA_VIEJO",
          variante: 1,
          etapa: "E1",
          nombre: "Viejo",
          agregado: true,
          archivado: true,
        },
      ],
      { incluirArchivados: true },
    );
    const e1 = tipos(itemsDeEtapa(PLANTILLAS, catalogo, 1, "E1"));
    // SOLICITUD_INSCRIPCION se edita como ANEXO_17: al eliminarlo deja de generarse.
    expect(e1).not.toContain("SOLICITUD_INSCRIPCION");
    expect(e1).not.toContain("AREA_VIEJO");
    expect(e1).toContain("DECRETO_APROBACION");
    expect(tipos(itemsDeEtapa(PLANTILLAS, catalogo, 2, "E1"))).toContain("SOLICITUD_INSCRIPCION");
  });

  it("el informe de Secretaría (E6) no depende del catálogo de formatos", () => {
    expect(tipos(itemsDeEtapa(PLANTILLAS, CATALOGO_FORMATOS, 1, "E6"))).toEqual([
      "INFORME_SECRETARIA",
    ]);
  });
});
