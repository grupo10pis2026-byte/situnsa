import { FLUJO_TITULACION, hashTransicion } from "@pis/domain";
import { desc, eq } from "drizzle-orm";
import type { Db } from "../client.js";
import { auditoriaTransiciones } from "../schema/auditoria-transiciones.js";
import {
  jurados,
  juradosExpediente,
  sustentaciones,
  validacionesInstitucionales,
} from "../schema/cierre.js";
import { expedientes } from "../schema/expedientes.js";
import { mensajes } from "../schema/mensajes.js";
import { subetapas } from "../schema/subetapas.js";
import { talleres } from "../schema/talleres.js";
import { usuarios } from "../schema/usuarios.js";
import { asignarRolesLegacy, fijarClavesDemo } from "./roles-permisos.js";
import { JORGE_ID, seedTallerFlujo } from "./taller-demo.js";

export const TESISTA_ID = "11111111-1111-4111-8111-111111111111";
export const ASESOR_ID = "22222222-2222-4222-8222-222222222222";
export const ADMIN_ID = "44444444-4444-4444-8444-444444444444";
export const EXPEDIENTE_ID = "33333333-3333-4333-8333-333333333333";

const TESISTA2_ID = "66666666-6666-4666-8666-666666666666";
const P2A_ID = "88888888-8888-4888-8888-888888888888";
const P2B_ID = "99999999-9999-4999-8999-999999999999";
const SET004_ID = "55555555-5555-4555-8555-555555555555";
const SET007_ID = "77777777-7777-4777-8777-777777777777";

type EstadoSub = "NO_INICIADO" | "EN_CURSO" | "FINALIZADO";

async function auditar(
  db: Db,
  input: {
    expedienteId: string;
    actorId: string | null;
    actorDni: string;
    anterior: string | null;
    nuevo: string;
    detalle: string;
    at: Date;
  },
): Promise<void> {
  const prev = await db
    .select({ hash: auditoriaTransiciones.hash })
    .from(auditoriaTransiciones)
    .where(eq(auditoriaTransiciones.expedienteId, input.expedienteId))
    .orderBy(desc(auditoriaTransiciones.createdAt))
    .limit(1);
  const hashPrevio = prev[0]?.hash ?? null;
  await db.insert(auditoriaTransiciones).values({
    expedienteId: input.expedienteId,
    actorId: input.actorId,
    actorDni: input.actorDni,
    estadoAnterior: input.anterior,
    estadoNuevo: input.nuevo,
    hashPrevio,
    hash: hashTransicion({
      hashPrevio,
      expedienteId: input.expedienteId,
      actor: input.actorDni,
      nuevoEstado: input.nuevo,
      timestamp: input.at.toISOString(),
    }),
    detalle: input.detalle,
    createdAt: input.at,
  });
}

async function tieneSeguimiento(db: Db, expedienteId: string): Promise<boolean> {
  const rows = await db
    .select({ id: subetapas.id })
    .from(subetapas)
    .where(eq(subetapas.expedienteId, expedienteId))
    .limit(1);
  return rows.length > 0;
}

async function tieneMensajes(db: Db, expedienteId: string): Promise<boolean> {
  const rows = await db
    .select({ id: mensajes.id })
    .from(mensajes)
    .where(eq(mensajes.expedienteId, expedienteId))
    .limit(1);
  return rows.length > 0;
}

async function generarSeguimiento(
  db: Db,
  expedienteId: string,
  plan: (
    etapa: number,
    orden: number,
  ) => { estado: EstadoSub; inicio: Date | null; fin: Date | null },
): Promise<void> {
  if (await tieneSeguimiento(db, expedienteId)) return;
  for (const etapa of FLUJO_TITULACION) {
    for (const s of etapa.subetapas) {
      const p = plan(etapa.numero, s.orden);
      await db.insert(subetapas).values({
        expedienteId,
        etapa: etapa.numero,
        orden: s.orden,
        clave: s.clave,
        nombre: s.nombre,
        plazo: s.plazo,
        estado: p.estado,
        responsable: etapa.responsable,
        inicio: p.inicio,
        fin: p.fin,
      });
    }
  }
}

/**
 * Seed DEMO (idempotente, SOLO dev/e2e): usuarios de prueba y 3 fixtures:
 * SET004 completado (grupo 2, 38/38), SET005 en plan y SET007 en dictamen.
 * Nunca en prod (datos ficticios).
 */
export async function seedDemo(db: Db): Promise<void> {
  await db
    .insert(usuarios)
    .values([
      {
        id: ADMIN_ID,
        dni: "00000001",
        email: "angela@unsa.edu.pe",
        nombres: "Angela",
        apellidos: "Administrativa FIPS",
        rol: "ADMIN_FIPS",
      },
      {
        dni: "00000002",
        email: "magnolia@unsa.edu.pe",
        nombres: "Magnolia",
        apellidos: "Secretaría FIPS",
        rol: "SECRETARIA",
      },
      {
        id: TESISTA_ID,
        dni: "12345678",
        cui: "2020123456",
        email: "tesista.prueba@unsa.edu.pe",
        nombres: "Tesista",
        apellidos: "Prueba",
        telefono: "999888777",
        nacionalidad: "Peruana",
        ciudad: "Arequipa",
        rol: "TESISTA",
      },
      {
        id: ASESOR_ID,
        dni: "87654321",
        email: "asesor.prueba@unsa.edu.pe",
        nombres: "Asesor",
        apellidos: "Prueba",
        grado: "Dr.",
        telefono: "999111222",
        rol: "ASESOR",
      },
      {
        id: TESISTA2_ID,
        dni: "11223344",
        cui: "2021122334",
        email: "maria.torres@unsa.edu.pe",
        nombres: "María",
        apellidos: "Torres Flores",
        telefono: "999333444",
        nacionalidad: "Peruana",
        ciudad: "Arequipa",
        rol: "TESISTA",
      },
      {
        id: P2A_ID,
        dni: "22334455",
        email: "carlos.quispe@unsa.edu.pe",
        nombres: "Carlos",
        apellidos: "Quispe Huamán",
        rol: "TESISTA",
      },
      {
        id: P2B_ID,
        dni: "33445566",
        email: "lucia.mamani@unsa.edu.pe",
        nombres: "Lucía",
        apellidos: "Mamani Condori",
        rol: "TESISTA",
      },
      {
        id: JORGE_ID,
        dni: "44556677",
        email: "jorge.ramos@unsa.edu.pe",
        nombres: "Jorge",
        apellidos: "Ramos Cutipa",
        rol: "TESISTA",
      },
    ])
    .onConflictDoNothing({ target: usuarios.dni });
  await db.update(usuarios).set({ id: TESISTA_ID }).where(eq(usuarios.dni, "12345678"));
  await db
    .update(usuarios)
    .set({ id: ASESOR_ID, grado: "Dr.", telefono: "999111222" })
    .where(eq(usuarios.dni, "87654321"));
  await db.update(usuarios).set({ id: ADMIN_ID }).where(eq(usuarios.dni, "00000001"));
  await db.update(usuarios).set({ id: TESISTA2_ID }).where(eq(usuarios.dni, "11223344"));
  await db.update(usuarios).set({ id: P2A_ID }).where(eq(usuarios.dni, "22334455"));
  await db.update(usuarios).set({ id: P2B_ID }).where(eq(usuarios.dni, "33445566"));
  await db.update(usuarios).set({ id: JORGE_ID }).where(eq(usuarios.dni, "44556677"));

  // ---- SET005 (en plan, grupo 1) ----
  await db
    .insert(expedientes)
    .values([
      {
        id: EXPEDIENTE_ID,
        codigo: "SET005",
        estado: "EN_PLAN",
        modalidad: "TESIS",
        programa: "SEGUNDA ESPECIALIDAD EN INGENIERÍA DE SISTEMAS",
        titulo: "Sistema de titulación FIPS con trazabilidad criptográfica",
        participante1Id: TESISTA_ID,
        asesorId: ASESOR_ID,
        nroDecreto: "007",
        presidente: "DR. PRESIDENTE TERNA",
        secretario: "MG. SECRETARIO TERNA",
        fechaApertura: "2026-09-01",
        fechaPresentacion: "2026-09-10",
        nroOficio: "OF-2026-042",
      },
    ])
    .onConflictDoNothing({ target: expedientes.codigo });
  await generarSeguimiento(db, EXPEDIENTE_ID, (etapa, orden) => ({
    estado: etapa === 1 && orden === 1 ? "EN_CURSO" : "NO_INICIADO",
    inicio: etapa === 1 && orden === 1 ? new Date() : null,
    fin: null,
  }));
  if (!(await tieneMensajes(db, EXPEDIENTE_ID))) {
    await db.insert(mensajes).values({
      expedienteId: EXPEDIENTE_ID,
      autorId: ADMIN_ID,
      texto: "FALTA CORREGIR LOS OBJETIVOS ESPECÍFICOS",
    });
  }

  // ---- SET004 (completado, grupo 2, 38/38) ----
  await db
    .insert(expedientes)
    .values([
      {
        id: SET004_ID,
        codigo: "SET004",
        estado: "TITULO_EMITIDO",
        modalidad: "TRABAJO_ACADEMICO",
        modalidad02: "Plan de Trabajo Académico",
        modalidadFinal: "El Trabajo Académico",
        programa: "SEGUNDA ESPECIALIDAD EN INGENIERÍA DE PRODUCCIÓN",
        titulo: "optimización del proceso de envasado en planta de alimentos",
        titulo02: "optimización del proceso de envasado en planta de alimentos",
        participante1Id: P2A_ID,
        participante2Id: P2B_ID,
        asesorId: ASESOR_ID,
        asesorNombre: "DR. ASESOR PRUEBA",
        nroDecreto: "003",
        presidente: "DR. PRESIDENTE TERNA",
        secretario: "MG. SECRETARIO TERNA",
        coAsesor: "ING. COASESOR INVITADO",
        fechaApertura: "2025-03-01",
        fechaPresentacion: "2025-03-20",
        nroOficio: "OF-2025-011",
        integrante: "PLANTA DE ALIMENTOS S.A.",
        presidenteE2: "DR. PRESIDENTE JURADO",
        secretarioE2: "MG. SECRETARIO JURADO",
        suplenteE2: "MG. SUPLENTE JURADO",
        decanal: "RESOLUCIÓN DECANAL 042-2025",
        fechaSustentacion: "2025-11-20",
        horaSustentacion: "10:00",
        lugarSustentacion: "AUDITORIO FIPS",
        modalidadVirtual: "El Trabajo Académico",
      },
    ])
    .onConflictDoNothing({ target: expedientes.codigo });
  const base2025 = new Date("2025-03-03T09:00:00-05:00").getTime();
  await generarSeguimiento(db, SET004_ID, (etapa, orden) => {
    const idx =
      FLUJO_TITULACION.slice(0, etapa - 1).reduce(
        (n: number, e: { subetapas: readonly unknown[] | unknown[] }) => n + e.subetapas.length,
        0,
      ) +
      (orden - 1);
    const inicio = new Date(base2025 + idx * 3 * 86400000);
    return { estado: "FINALIZADO", inicio, fin: new Date(inicio.getTime() + 2 * 86400000) };
  });
  if (!(await tieneMensajes(db, SET004_ID))) {
    await db.insert(mensajes).values({
      expedienteId: SET004_ID,
      autorId: ADMIN_ID,
      texto: "SUSTENTACIÓN APROBADA POR UNANIMIDAD. FELICITACIONES.",
      createdAt: new Date("2025-11-20T14:00:00-05:00"),
    });
  }
  const cadena004: Array<[string | null, string, string]> = [
    [null, "REGISTRADO", "Registro de expediente SET004"],
    ["REGISTRADO", "EN_PLAN", "Validación de inscripción"],
    ["EN_PLAN", "PLAN_APROBADO", "Decreto de aprobación"],
    ["PLAN_APROBADO", "EN_BORRADOR", "Conformidad del asesor"],
    ["EN_BORRADOR", "EN_DICTAMEN", "Sorteo de jurados"],
    ["EN_DICTAMEN", "APTO_SUSTENTACION", "Conformidad final"],
    ["APTO_SUSTENTACION", "SUSTENTADO", "Acta de sustentación"],
    ["SUSTENTADO", "EN_VALIDACION", "Envío a Turnitin"],
    ["EN_VALIDACION", "EN_APROBACION", "Informe de similitud conforme"],
    ["EN_APROBACION", "TITULO_EMITIDO", "Registro SUNEDU"],
  ];
  const audit004 = await db
    .select({ id: auditoriaTransiciones.id })
    .from(auditoriaTransiciones)
    .where(eq(auditoriaTransiciones.expedienteId, SET004_ID))
    .limit(1);
  if (audit004.length === 0) {
    let at = new Date("2025-03-01T09:00:00-05:00").getTime();
    for (const [anterior, nuevo, detalle] of cadena004) {
      at += 12 * 86400000;
      await auditar(db, {
        expedienteId: SET004_ID,
        actorId: ADMIN_ID,
        actorDni: "00000001",
        anterior,
        nuevo,
        detalle,
        at: new Date(at),
      });
    }
  }

  // ---- SET007 (en dictamen, 12/38 = 32 %) ----
  await db
    .insert(expedientes)
    .values([
      {
        id: SET007_ID,
        codigo: "SET007",
        estado: "EN_DICTAMEN",
        modalidad: "TESIS",
        programa: "SEGUNDA ESPECIALIDAD EN INGENIERÍA DE SISTEMAS",
        titulo: "detección de similitud en documentos académicos con ia",
        participante1Id: TESISTA2_ID,
        asesorId: ASESOR_ID,
        asesorNombre: "DR. ASESOR PRUEBA",
        nroDecreto: "009",
        presidente: "DR. PRESIDENTE TERNA",
        secretario: "MG. SECRETARIO TERNA",
        decanal: "RESOLUCIÓN DECANAL 058-2026",
        presidenteE2: "DR. PRESIDENTE JURADO",
        secretarioE2: "MG. SECRETARIO JURADO",
        suplenteE2: "MG. SUPLENTE JURADO",
        fechaApertura: "2026-06-01",
        fechaPresentacion: "2026-06-15",
      },
    ])
    .onConflictDoNothing({ target: expedientes.codigo });
  await generarSeguimiento(db, SET007_ID, (etapa, orden) => {
    if (etapa <= 2)
      return {
        estado: "FINALIZADO",
        inicio: new Date("2026-06-02T09:00:00-05:00"),
        fin: new Date("2026-07-10T09:00:00-05:00"),
      };
    if (etapa === 3 && orden <= 3) {
      return {
        estado: "FINALIZADO",
        inicio: new Date("2026-08-01T09:00:00-05:00"),
        fin: new Date("2026-08-20T09:00:00-05:00"),
      };
    }
    if (etapa === 3 && orden === 4) return { estado: "EN_CURSO", inicio: new Date(), fin: null };
    return { estado: "NO_INICIADO", inicio: null, fin: null };
  });
  if (!(await tieneMensajes(db, SET007_ID))) {
    await db.insert(mensajes).values({
      expedienteId: SET007_ID,
      autorId: ADMIN_ID,
      texto: "LEVANTAR LAS OBSERVACIONES DEL JURADO ANTES DEL VIERNES",
    });
  }
  const audit007 = await db
    .select({ id: auditoriaTransiciones.id })
    .from(auditoriaTransiciones)
    .where(eq(auditoriaTransiciones.expedienteId, SET007_ID))
    .limit(1);
  if (audit007.length === 0) {
    const cadena007: Array<[string | null, string, string, string]> = [
      [null, "REGISTRADO", "Registro de expediente SET007", "2026-06-01T09:00:00-05:00"],
      ["REGISTRADO", "EN_PLAN", "Validación de inscripción", "2026-06-05T09:00:00-05:00"],
      ["EN_PLAN", "PLAN_APROBADO", "Decreto de aprobación", "2026-07-01T09:00:00-05:00"],
      ["PLAN_APROBADO", "EN_BORRADOR", "Conformidad del asesor", "2026-07-15T09:00:00-05:00"],
      ["EN_BORRADOR", "EN_DICTAMEN", "Sorteo de jurados", "2026-08-01T09:00:00-05:00"],
    ];
    for (const [anterior, nuevo, detalle, at] of cadena007) {
      await auditar(db, {
        expedienteId: SET007_ID,
        actorId: ADMIN_ID,
        actorDni: "00000001",
        anterior,
        nuevo,
        detalle,
        at: new Date(at),
      });
    }
  }

  await seedCierreDemo(db);

  const tall = await db.select({ id: talleres.id }).from(talleres);
  if (tall.length === 0) {
    await db.insert(talleres).values([
      { nombre: "TALLER 04", asesorId: ASESOR_ID, periodo: "2025-II", inscritos: 32 },
      { nombre: "TALLER DE TESIS 05", asesorId: ASESOR_ID, periodo: "2025-II", inscritos: 34 },
      { nombre: "TALLER 07", asesorId: ASESOR_ID, periodo: "2026-I", inscritos: 24 },
    ]);
  }

  // ---- SET008 (Jorge, en plan: inscripción validada para el taller) ----
  await db
    .insert(expedientes)
    .values([
      {
        codigo: "SET008",
        estado: "EN_PLAN",
        modalidad: "TESIS",
        programa: "SEGUNDA ESPECIALIDAD EN INGENIERÍA DE SISTEMAS",
        titulo: "gestión de pensiones en talleres de tesis con trazabilidad",
        participante1Id: JORGE_ID,
        asesorId: ASESOR_ID,
        fechaApertura: "2026-09-15",
        fechaPresentacion: "2026-09-20",
      },
    ])
    .onConflictDoNothing({ target: expedientes.codigo });

  // ---- Flujo demo del taller (TALLER 06 + grupos + fases + avance + pase) ----
  await seedTallerFlujo(db);

  // Claves demo (bcrypt coste 12) + roles nuevos según rol legacy.
  await fijarClavesDemo(db, [
    "00000001",
    "00000002",
    "12345678",
    "87654321",
    "11223344",
    "22334455",
    "33445566",
    "44556677",
    "99990001",
  ]);
  await asignarRolesLegacy(db);

  const rows = await db.select({ codigo: expedientes.codigo }).from(expedientes);
  console.log(`Seed demo OK. Expedientes: ${rows.map((r) => r.codigo).join(", ")}`);
}

type DefJurado = { dni: string; nombres: string; apellidos: string; grado: string };

const TERNA_DEMO: Array<DefJurado & { rol: string }> = [
  { dni: "29000101", nombres: "Presidente", apellidos: "Terna", grado: "DR.", rol: "PRESIDENTE" },
  { dni: "29000102", nombres: "Secretario", apellidos: "Terna", grado: "MG.", rol: "SECRETARIO" },
  { dni: "87654321", nombres: "Asesor", apellidos: "Prueba", grado: "DR.", rol: "VOCAL" },
];

const JURADO_DEMO: Array<DefJurado & { rol: string }> = [
  { dni: "29000201", nombres: "Presidente", apellidos: "Jurado", grado: "DR.", rol: "PRESIDENTE" },
  { dni: "29000202", nombres: "Secretario", apellidos: "Jurado", grado: "MG.", rol: "SECRETARIO" },
  { dni: "29000203", nombres: "Vocal", apellidos: "Jurado", grado: "MG.", rol: "VOCAL" },
  { dni: "29000204", nombres: "Suplente", apellidos: "Jurado", grado: "MG.", rol: "SUPLENTE" },
];

async function designar(
  db: Db,
  expedienteId: string,
  instancia: "TERNA" | "JURADO",
  lista: Array<DefJurado & { rol: string }>,
  dictamen: (rol: string) => string,
): Promise<void> {
  for (const j of lista) {
    await db
      .insert(jurados)
      .values({ dni: j.dni, nombres: j.nombres, apellidos: j.apellidos, grado: j.grado })
      .onConflictDoNothing({ target: jurados.dni });
    const fila = await db.select({ id: jurados.id }).from(jurados).where(eq(jurados.dni, j.dni));
    const juradoId = fila[0]?.id;
    if (!juradoId) continue;
    const d = dictamen(j.rol);
    await db.insert(juradosExpediente).values({
      juradoId,
      expedienteId,
      instancia,
      rol: j.rol,
      dictamen: d,
      comentario: d === "OBSERVADO" ? "Precisar la metodología del capítulo III" : null,
    });
  }
}

/**
 * Cierre demo coherente con el estado de cada fixture (idempotente):
 * SET004 completo (terna, jurados, acta, validaciones) y SET007 en dictamen
 * con una observación del jurado pendiente de levantar.
 */
async function seedCierreDemo(db: Db): Promise<void> {
  const ya = await db
    .select({ id: juradosExpediente.id })
    .from(juradosExpediente)
    .where(eq(juradosExpediente.expedienteId, SET007_ID))
    .limit(1);
  if (ya.length > 0) return;

  await designar(db, SET004_ID, "TERNA", TERNA_DEMO, () => "FAVORABLE");
  await designar(db, SET004_ID, "JURADO", JURADO_DEMO, () => "FAVORABLE");
  await db
    .insert(sustentaciones)
    .values({
      expedienteId: SET004_ID,
      fecha: "2025-11-20",
      hora: "10:00",
      lugar: "AUDITORIO FIPS",
      modalidad: "PRESENCIAL",
      actaVeredicto: "UNANIMIDAD",
      actaFecha: new Date("2025-11-20T15:00:00Z"),
    })
    .onConflictDoNothing({ target: sustentaciones.expedienteId });
  const instancias: Array<[string, number | null, string | null]> = [
    ["OTI_SIMILITUD", 12, "Reporte Turnitin conforme"],
    ["REPOSITORIO", null, "https://repositorio.unsa.edu.pe/handle/UNSA/0004"],
    ["SECRETARIA", null, null],
    ["COMISION", null, null],
    ["CONSEJO_FACULTAD", null, null],
    ["RESOLUCION", null, null],
    ["SISGRAD", null, null],
    ["DECANO", null, null],
    ["GRADOS_TITULOS", null, null],
    ["CONSEJO_UNIVERSITARIO", null, null],
    ["COLACION", null, null],
    ["SUNEDU", null, null],
  ];
  for (const [instancia, porcentaje, detalle] of instancias) {
    await db.insert(validacionesInstitucionales).values({
      expedienteId: SET004_ID,
      instancia,
      estado: "APROBADO",
      porcentaje,
      detalle,
    });
  }

  await designar(db, SET007_ID, "TERNA", TERNA_DEMO, () => "FAVORABLE");
  await designar(db, SET007_ID, "JURADO", JURADO_DEMO, (rol) =>
    rol === "SECRETARIO" ? "OBSERVADO" : "FAVORABLE",
  );
}
