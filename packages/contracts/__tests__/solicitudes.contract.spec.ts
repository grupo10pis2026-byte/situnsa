import { describe, expect, it } from "vitest";
import {
  AceptarSolicitudSchema,
  appContract,
  CrearSolicitudPayloadSchema,
  ObservarSolicitudSchema,
  RechazarSolicitudSchema,
  solicitudesContract,
} from "../src/index.js";

describe("Contratos y Validación Zod de Solicitudes", () => {
  it("valida exitosamente un payload de solicitud de 1 participante", () => {
    const valid = {
      via: "REGULAR",
      modalidad: "TESIS",
      programa: "Segunda Especialidad en Ingeniería de Sistemas",
      titulo: "Diseño e implementación de arquitectura serverless para expedientes",
      anioEgreso: 2024,
      cantidadTesistas: 1,
      participante1: {
        nombres: "Juan Carlos",
        apellidos: "Pérez Quispe",
        dni: "71234567",
        email: "jperez@unsa.edu.pe",
        telefono: "987654321",
        ciudad: "Arequipa",
        direccion: "Av. Independencia 123",
      },
      declaracionJurada: true,
    };

    const parsed = CrearSolicitudPayloadSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it("valida exitosamente un payload de 2 participantes con DNIs y correos distintos", () => {
    const valid = {
      via: "TALLER",
      modalidad: "ARTICULO",
      programa: "Segunda Especialidad en Ingeniería de Sistemas",
      titulo: "Evaluación de modelos de lenguaje en análisis forense digital",
      cantidadTesistas: 2,
      participante1: {
        nombres: "Juan Carlos",
        apellidos: "Pérez Quispe",
        dni: "71234567",
        email: "jperez@unsa.edu.pe",
      },
      participante2: {
        nombres: "María Elena",
        apellidos: "Torres Flores",
        dni: "79876543",
        email: "mtorres@gmail.com",
      },
      declaracionJurada: true,
    };

    const parsed = CrearSolicitudPayloadSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it("rechaza solicitud si cantidadTesistas es 2 pero no se envía participante2", () => {
    const invalid = {
      via: "REGULAR",
      modalidad: "TESIS",
      programa: "Segunda Especialidad en Ingeniería de Sistemas",
      titulo: "Título de prueba válido de más de diez caracteres",
      cantidadTesistas: 2,
      participante1: {
        nombres: "Juan Carlos",
        apellidos: "Pérez Quispe",
        dni: "71234567",
        email: "jperez@unsa.edu.pe",
      },
      declaracionJurada: true,
    };

    const parsed = CrearSolicitudPayloadSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });

  it("rechaza solicitud si ambos participantes tienen el mismo DNI", () => {
    const invalid = {
      via: "REGULAR",
      modalidad: "TESIS",
      programa: "Segunda Especialidad en Ingeniería de Sistemas",
      titulo: "Título de prueba válido de más de diez caracteres",
      cantidadTesistas: 2,
      participante1: {
        nombres: "Juan Carlos",
        apellidos: "Pérez Quispe",
        dni: "71234567",
        email: "jperez@unsa.edu.pe",
      },
      participante2: {
        nombres: "María Elena",
        apellidos: "Torres Flores",
        dni: "71234567",
        email: "mtorres@gmail.com",
      },
      declaracionJurada: true,
    };

    const parsed = CrearSolicitudPayloadSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });

  it("rechaza solicitud sin declaración jurada", () => {
    const invalid = {
      via: "REGULAR",
      modalidad: "TESIS",
      programa: "Segunda Especialidad en Ingeniería de Sistemas",
      titulo: "Título de prueba válido de más de diez caracteres",
      cantidadTesistas: 1,
      participante1: {
        nombres: "Juan Carlos",
        apellidos: "Pérez Quispe",
        dni: "71234567",
        email: "jperez@unsa.edu.pe",
      },
      declaracionJurada: false,
    };

    const parsed = CrearSolicitudPayloadSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });

  it("valida ObservarSolicitudSchema con motivos válidos", () => {
    const valid = {
      motivosPredefinidos: ["Expediente 17 ilegible o sin firma"],
      detalleObservacion: "Por favor cargar nuevamente el documento firmado en formato PDF",
      diasHabilesSubsanacion: 10,
    };

    const parsed = ObservarSolicitudSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it("valida RechazarSolicitudSchema exigiendo fundamento normativo mínimo", () => {
    const valid = {
      fundamentoReglamentario:
        "No cumple con los requisitos del Reglamento de Grados y Títulos FIPS Art. 12",
    };
    expect(RechazarSolicitudSchema.safeParse(valid).success).toBe(true);

    const invalid = {
      fundamentoReglamentario: "Corto",
    };
    expect(RechazarSolicitudSchema.safeParse(invalid).success).toBe(false);
  });

  it("valida AceptarSolicitudSchema exigiendo formato SETNNN", () => {
    const valid = {
      codigoSetConfirmado: "SET012",
      tituloConfirmado: "Título oficial confirmado del proyecto de tesis",
      programaConfirmado: "Segunda Especialidad en Ingeniería de Sistemas",
      crearCuentasUsuarios: true,
      participantesConfig: [
        {
          orden: 1,
          dni: "71234567",
          usuarioAsignado: "jperez_71234567",
          claveTemporalGenerada: "Temporal#2026",
          enviarCredencialesCorreo: true,
        },
      ],
    };
    expect(AceptarSolicitudSchema.safeParse(valid).success).toBe(true);

    const invalidCodigo = { ...valid, codigoSetConfirmado: "EXPEDIENTE-12" };
    expect(AceptarSolicitudSchema.safeParse(invalidCodigo).success).toBe(false);
  });

  it("expone el contrato ts-rest en appContract y solicitudesContract", () => {
    expect(solicitudesContract.listar).toBeDefined();
    expect(solicitudesContract.obtenerPorId).toBeDefined();
    expect(solicitudesContract.aceptar).toBeDefined();
    expect(solicitudesContract.observar).toBeDefined();
    expect(solicitudesContract.rechazar).toBeDefined();
    expect(appContract.solicitudes).toBeDefined();
  });
});
