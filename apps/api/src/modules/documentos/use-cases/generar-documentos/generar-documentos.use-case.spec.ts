import { describe, expect, it } from "vitest";
import { extraerCambiosExpedienteYUsuarios } from "./generar-documentos.use-case.js";

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
