import { type APIRequestContext, expect, test } from "@playwright/test";

/**
 * D1 Asignar alumno (spec v1.0 §10) contra Postgres real: candidato por DNI,
 * proyecto de 1 o 2 tesistas con sus pensiones, y pruebas de aceptación #4
 * (cupo lleno), #5 (alumno en otro taller) y #6 (el proyecto que llena el
 * cupo deja el taller COMPLETO).
 *
 * Requiere el entorno levantado con el seed demo (TALLER 06 con P-01 a P-03).
 * Uso: E2E_BASE_URL=http://localhost:3001 pnpm --filter pis-e2e test proyectos
 */

const CLAVE_DEMO = process.env.DEMO_PASSWORD ?? "x";
const MARIA = "11223344"; // demo: P-01 del TALLER 06

test.describe.configure({ mode: "serial" });

type Json = Record<string, unknown> & {
  error?: { codigo: string; mensaje: string; detalles?: Array<{ campo?: string }> };
};
type Lista = {
  items: Array<{
    codigo: string;
    tesistas: Array<{
      dni: string;
      pensionesPagadas: number;
      pensionesTotal: number;
      estado: string;
    }>;
  }>;
  cupo: { asignados: number; cupo: number };
  estadoTaller: string;
};

let api: APIRequestContext;
let admin = "";
let secretaria = "";
let asesorDemo = "";
let tallerId = "";
let taller06 = "";
const sufijo = String(Date.now()).slice(-6);
const alumnos: string[] = [];

async function llamar<T = Json>(
  metodo: "GET" | "POST",
  ruta: string,
  token: string,
  data?: unknown,
): Promise<{ status: number; json: T & Json }> {
  const r = await api.fetch(ruta, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}` },
    ...(data !== undefined ? { data } : {}),
  });
  const texto = await r.text();
  let json = {} as T & Json;
  try {
    json = JSON.parse(texto) as T & Json;
  } catch {
    // sin cuerpo
  }
  return { status: r.status(), json };
}

async function login(identificador: string): Promise<string> {
  const r = await api.post("/api/auth/login", {
    data: { identificador, password: CLAVE_DEMO },
  });
  expect(r.status(), `login ${identificador}`).toBe(200);
  return ((await r.json()) as { accessToken: string }).accessToken;
}

/** Un tesista nuevo (la inscripción por expediente crea su cuenta TESISTA). */
async function nuevoTesista(n: number): Promise<string> {
  const dni = `5${sufijo}${n}`.slice(0, 8);
  const r = await llamar("POST", "/api/expedientes/inscribir-plan", admin, {
    modalidad: "TESIS",
    programa: "SEGUNDA ESPECIALIDAD EN INGENIERÍA DE SISTEMAS",
    titulo: `proyecto de prueba de asignación al taller ${sufijo} ${n}`,
    participante1: {
      nombres: `Alumno${n}`,
      apellidos: `Taller E2E ${sufijo}`,
      dni,
      email: `alumno.taller${n}.${sufijo}@unsa.edu.pe`,
    },
  });
  expect(r.status, JSON.stringify(r.json)).toBe(201);
  return dni;
}

test.beforeAll(async ({ playwright, baseURL }) => {
  api = await playwright.request.newContext({ baseURL: baseURL ?? "http://localhost:80" });
  admin = await login("00000001");
  secretaria = await login("00000002");
  asesorDemo = await login("87654321");
  for (const n of [1, 2, 3, 4]) alumnos.push(await nuevoTesista(n));

  const asesor = await llamar<{ id: string }>("POST", "/api/asesores", admin, {
    dni: `7${sufijo}9`.slice(0, 8),
    nombres: "Asesor",
    apellidos: `Proyectos ${sufijo}`,
    email: `asesor.proyectos.${sufijo}@unsa.edu.pe`,
  });
  expect(asesor.status).toBe(201);
  const dias = [
    { dia: 6, horaInicio: "15:00", horaFin: "20:00" },
    { dia: 7, horaInicio: "08:00", horaFin: "13:00" },
  ];
  const t = await llamar<{ id: string }>("POST", "/api/talleres", admin, {
    nombre: `TALLER PROYECTOS ${sufijo}`,
    periodo: "2027-I",
    asesorId: asesor.json.id,
    inicio: "2027-04-03",
    fin: "2027-06-20",
    numeroSesiones: 2,
    dias,
    cupoProyectos: 2,
    enlaceSabado: null,
    enlaceDomingo: null,
    pensiones: { montos: [1000, 1000, 1000], fecha2: "2027-04-24", fecha3: "2027-05-22" },
    sesiones: [
      { fecha: "2027-04-03", horaInicio: "15:00", horaFin: "20:00" },
      { fecha: "2027-04-04", horaInicio: "08:00", horaFin: "13:00" },
    ],
  });
  expect(t.status, JSON.stringify(t.json)).toBe(201);
  tallerId = t.json.id;
  const lista = await llamar<{ items: Array<{ id: string; nombre: string }> }>(
    "GET",
    "/api/talleres",
    admin,
  );
  taller06 = lista.json.items.find((x) => x.nombre === "TALLER 06")?.id ?? "";
});

test.afterAll(async () => {
  await api.dispose();
});

test("D1: el DNI muestra el nombre y por qué no se puede asignar", async () => {
  const desconocido = await llamar<{ encontrado: boolean; motivo: string }>(
    "GET",
    `/api/talleres/${tallerId}/candidato?dni=99999998`,
    admin,
  );
  expect(desconocido.json).toMatchObject({
    encontrado: false,
    motivo: "No hay un alumno con ese DNI",
  });

  const asesor = await llamar<{ inscripcionValidada: boolean }>(
    "GET",
    `/api/talleres/${tallerId}/candidato?dni=87654321`,
    admin,
  );
  expect(asesor.json.inscripcionValidada).toBe(false);

  const libre = await llamar<{
    inscripcionValidada: boolean;
    tallerActivo: unknown;
    motivo: unknown;
  }>("GET", `/api/talleres/${tallerId}/candidato?dni=${alumnos[0]}`, admin);
  expect(libre.json).toMatchObject({ inscripcionValidada: true, tallerActivo: null, motivo: null });

  const maria = await llamar<{ tallerActivo: { nombre: string } }>(
    "GET",
    `/api/talleres/${tallerId}/candidato?dni=${MARIA}`,
    admin,
  );
  expect(maria.json.tallerActivo?.nombre).toBe("TALLER 06");
});

test("aceptación #5: un alumno de otro taller no se asigna", async () => {
  const r = await llamar("POST", `/api/talleres/${tallerId}/proyectos`, admin, { dni1: MARIA });
  expect(r.status).toBe(409);
  expect(r.json.error?.detalles?.[0]?.campo).toBe("dni1");
});

test("proyecto de dos tesistas: 3 pensiones cada uno con la 1.ª pagada", async () => {
  const r = await llamar<Lista>("POST", `/api/talleres/${tallerId}/proyectos`, admin, {
    dni1: alumnos[0],
    dni2: alumnos[1],
  });
  expect(r.status, JSON.stringify(r.json)).toBe(201);
  expect(r.json.cupo).toEqual({ asignados: 1, cupo: 2 });
  expect(r.json.estadoTaller).toBe("ABIERTO_INSCRIPCIONES");
  const p1 = r.json.items.find((p) => p.codigo === "P-01");
  expect(p1?.tesistas.map((t) => [t.dni, t.pensionesPagadas, t.pensionesTotal, t.estado])).toEqual([
    [alumnos[0], 1, 3, "EN_TALLER"],
    [alumnos[1], 1, 3, "EN_TALLER"],
  ]);

  const otraVez = await llamar("POST", `/api/talleres/${tallerId}/proyectos`, admin, {
    dni1: alumnos[1],
  });
  expect(otraVez.status).toBe(409);
});

test("aceptación #6 y #4: el proyecto que llena el cupo cierra el taller", async () => {
  const lleno = await llamar<Lista>("POST", `/api/talleres/${tallerId}/proyectos`, admin, {
    dni1: alumnos[2],
  });
  expect(lleno.status).toBe(201);
  expect(lleno.json.items.map((p) => p.codigo)).toEqual(["P-01", "P-02"]);
  expect(lleno.json.estadoTaller).toBe("COMPLETO");

  const sinCupo = await llamar("POST", `/api/talleres/${tallerId}/proyectos`, admin, {
    dni1: alumnos[3],
  });
  expect(sinCupo.status).toBe(400);
  expect(sinCupo.json.error?.mensaje).toContain("Cupo lleno");
});

test("permisos: asigna la Secretaría; el asesor ve solo su taller", async () => {
  expect(
    (await llamar("POST", `/api/talleres/${tallerId}/proyectos`, secretaria, { dni1: alumnos[3] }))
      .status,
  ).toBe(403);
  const propio = await llamar<Lista>("GET", `/api/talleres/${taller06}/proyectos`, asesorDemo);
  expect(propio.status).toBe(200);
  expect(propio.json.items.map((p) => p.codigo)).toEqual(
    expect.arrayContaining(["P-01", "P-02", "P-03"]),
  );
  expect((await llamar("GET", `/api/talleres/${tallerId}/proyectos`, asesorDemo)).status).toBe(403);
});
