import { type APIRequestContext, expect, test } from "@playwright/test";

/**
 * P1–P3 del Taller de Tesis (spec v1.0) contra Postgres real: calendario
 * propuesto con feriados, alta con sesiones, 3 pensiones y copia del plan,
 * edición, cambio de asesor y cancelación. Pruebas de aceptación #1, #2 y #3.
 *
 * Requiere el entorno levantado (make dev o make prod-local) con el seed demo
 * (feriados del año en curso: usa el ejemplo 2026-II de la especificación).
 * Uso: E2E_BASE_URL=http://localhost:3001 pnpm --filter pis-e2e test talleres
 */

const CLAVE_DEMO = process.env.DEMO_PASSWORD ?? "x";
const ASESOR_DEMO_ID = "22222222-2222-4222-8222-222222222222"; // tiene TALLER 06 vigente

test.describe.configure({ mode: "serial" });

type Json = Record<string, unknown> & {
  error?: { codigo: string; mensaje: string; detalles?: Array<{ campo?: string }> };
};
type Detalle = {
  id: string;
  nombre: string;
  estado: string;
  asesorId: string | null;
  fechaInicio: string;
  fechaFin: string;
  cupoProyectos: number;
  dias: Array<{ dia: number; horaInicio: string; horaFin: string }>;
  sesiones: { realizadas: number; total: number };
  calendario: Array<{ nro: number; fecha: string; estado: string }>;
  pensiones: Array<{ numero: number; semana: number | null; fecha: string | null; monto: number }>;
  planSemanas: number;
  enlaceDomingo: string | null;
  motivoCancelacion: string | null;
  fechasEditables: boolean;
};
type Calendario = {
  sesiones: Array<{ nro: number; fecha: string; horaInicio: string; horaFin: string }>;
  omitidas: Array<{ fecha: string; nota: string }>;
  contador: string;
  coincide: boolean;
  finSugerido: string;
  pensionesSugeridas: { fecha2: string; fecha3: string };
};

let api: APIRequestContext;
let admin = "";
let secretaria = "";
let asesorA = "";
let asesorB = "";
let taller: Detalle;
let sesiones: Array<{ fecha: string; horaInicio: string; horaFin: string }> = [];

const sufijo = String(Date.now()).slice(-6);
const NOMBRE = `TALLER E2E ${sufijo}`;
const DIAS = [
  { dia: 6, horaInicio: "15:00", horaFin: "20:00" },
  { dia: 7, horaInicio: "08:00", horaFin: "13:00" },
];

async function llamar<T = Json>(
  metodo: "GET" | "POST" | "PATCH",
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

async function nuevoAsesor(n: string): Promise<string> {
  const r = await llamar<{ id: string }>("POST", "/api/asesores", admin, {
    dni: `6${sufijo}${n}`.slice(0, 8),
    nombres: `Asesor ${n}`,
    apellidos: `Taller E2E ${sufijo}`,
    email: `asesor.taller${n}.${sufijo}@unsa.edu.pe`,
  });
  expect(r.status, JSON.stringify(r.json)).toBe(201);
  return r.json.id;
}

function datos(extra: Record<string, unknown> = {}) {
  return {
    nombre: NOMBRE,
    periodo: "2026-II",
    inicio: "2026-10-10",
    fin: "2026-12-27",
    numeroSesiones: 24,
    dias: DIAS,
    cupoProyectos: 15,
    enlaceSabado: "https://meet.google.com/sab-e2e",
    enlaceDomingo: null,
    pensiones: { montos: [1000, 1000, 1000], fecha2: "2026-10-31", fecha3: "2026-11-28" },
    sesiones,
    ...extra,
  };
}

test.beforeAll(async ({ playwright, baseURL }) => {
  api = await playwright.request.newContext({ baseURL: baseURL ?? "http://localhost:80" });
  admin = await login("00000001");
  secretaria = await login("00000002");
  asesorA = await nuevoAsesor("1");
  asesorB = await nuevoAsesor("2");
});

test.afterAll(async () => {
  await api.dispose();
});

test("aceptación #2: el calendario propuesto omite el feriado y avisa si no suman 24", async () => {
  const completo = await llamar<Calendario>("POST", "/api/talleres/calendario", admin, {
    inicio: "2026-10-10",
    fin: "2026-12-27",
    dias: DIAS,
    numeroSesiones: 24,
  });
  expect(completo.status).toBe(200);
  expect(completo.json.contador).toBe("23 de 24 · falta 1");
  expect(completo.json.omitidas).toEqual([
    { fecha: "2026-11-01", dia: "Domingo", nota: "Feriado, omitida" },
  ]);
  expect(completo.json.finSugerido).toBe("2026-12-27");
  expect(completo.json.pensionesSugeridas).toEqual({ fecha2: "2026-10-31", fecha3: "2026-11-28" });
  sesiones = completo.json.sesiones.map(({ fecha, horaInicio, horaFin }) => ({
    fecha,
    horaInicio,
    horaFin,
  }));

  const corto = await llamar<Calendario>("POST", "/api/talleres/calendario", admin, {
    inicio: "2026-10-10",
    fin: "2026-11-28",
    dias: DIAS,
    numeroSesiones: 24,
  });
  expect(corto.json.sesiones).toHaveLength(14);
  expect(corto.json.coincide).toBe(false);
});

test("solo la Secretaría crea y gestiona talleres", async () => {
  expect(
    (await llamar("POST", "/api/talleres", secretaria, { ...datos(), asesorId: asesorA })).status,
  ).toBe(403);
  expect(
    (
      await llamar("POST", "/api/talleres/calendario", secretaria, {
        inicio: "2026-10-10",
        fin: "2026-12-27",
        dias: DIAS,
        numeroSesiones: 24,
      })
    ).status,
  ).toBe(403);
});

test("nuevo taller: errores por campo y aceptación #1 (asesor con taller activo)", async () => {
  const malo = await llamar("POST", "/api/talleres", admin, {
    ...datos({ fin: "2026-10-01", enlaceDomingo: "http://x.local" }),
    asesorId: asesorA,
  });
  expect(malo.status).toBe(400);
  expect(malo.json.error?.detalles?.map((d) => d.campo)).toEqual(["fin", "enlaceDomingo"]);

  const ocupado = await llamar("POST", "/api/talleres", admin, {
    ...datos(),
    asesorId: ASESOR_DEMO_ID,
  });
  expect(ocupado.status).toBe(400);
  expect(ocupado.json.error?.codigo).toBe("REQUISITO_PENDIENTE");
  expect(ocupado.json.error?.detalles?.[0]?.campo).toBe("asesorId");
});

test("aceptación #3: guardar crea sesiones, 3 pensiones y la copia del plan", async () => {
  const r = await llamar<Detalle>("POST", "/api/talleres", admin, {
    ...datos(),
    asesorId: asesorA,
  });
  expect(r.status, JSON.stringify(r.json)).toBe(201);
  taller = r.json;
  expect(taller).toMatchObject({
    nombre: NOMBRE,
    estado: "ABIERTO_INSCRIPCIONES",
    asesorId: asesorA,
    fechaInicio: "2026-10-10",
    fechaFin: "2026-12-27",
    cupoProyectos: 15,
    planSemanas: 12,
    fechasEditables: true,
  });
  expect(taller.sesiones.total).toBe(23);
  expect(taller.calendario.map((s) => s.nro)).toEqual(Array.from({ length: 23 }, (_, i) => i + 1));
  expect(taller.pensiones).toEqual([
    { numero: 1, semana: null, fecha: null, monto: 1000, pagadas: 0 },
    { numero: 2, semana: 4, fecha: "2026-10-31", monto: 1000, pagadas: 0 },
    { numero: 3, semana: 8, fecha: "2026-11-28", monto: 1000, pagadas: 0 },
  ]);
  expect(taller.dias).toEqual(DIAS);

  const repetido = await llamar("POST", "/api/talleres", admin, {
    ...datos({ nombre: NOMBRE.toLowerCase() }),
    asesorId: asesorB,
  });
  expect(repetido.status).toBe(409);

  // El asesor ya no está disponible para otro taller.
  const otra = await llamar("POST", "/api/talleres", admin, {
    ...datos({ nombre: `${NOMBRE} B` }),
    asesorId: asesorA,
  });
  expect(otra.status).toBe(400);

  const lista = await llamar<{
    items: Array<{ id: string; proyectos: number; cupoProyectos: number }>;
  }>("GET", "/api/talleres?estado=ABIERTO_INSCRIPCIONES", admin);
  expect(lista.json.items.find((t) => t.id === taller.id)).toMatchObject({
    proyectos: 0,
    cupoProyectos: 15,
  });
});

test("editar: cupo, enlaces, pensiones y calendario sin sesiones realizadas", async () => {
  const sinUltima = sesiones.slice(0, -1);
  const r = await llamar<Detalle>("PATCH", `/api/talleres/${taller.id}`, admin, {
    ...datos({
      cupoProyectos: 12,
      enlaceDomingo: "https://meet.google.com/dom-e2e",
      pensiones: { montos: [1000, 900, 900], fecha2: "2026-11-07", fecha3: "2026-12-05" },
    }),
    sesiones: sinUltima,
  });
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  expect(r.json).toMatchObject({
    cupoProyectos: 12,
    enlaceDomingo: "https://meet.google.com/dom-e2e",
  });
  expect(r.json.sesiones.total).toBe(22);
  expect(r.json.pensiones[1]).toMatchObject({ fecha: "2026-11-07", monto: 900 });
});

test("cambiar asesor: solo a uno disponible y con motivo; el anterior queda libre", async () => {
  const sinMotivo = await llamar("POST", `/api/talleres/${taller.id}/asesor`, admin, {
    asesorId: asesorB,
    motivo: "",
  });
  expect(sinMotivo.status).toBe(400);
  const ocupado = await llamar("POST", `/api/talleres/${taller.id}/asesor`, admin, {
    asesorId: ASESOR_DEMO_ID,
    motivo: "Prueba de asesor ocupado",
  });
  expect(ocupado.status).toBe(400);
  const r = await llamar<Detalle>("POST", `/api/talleres/${taller.id}/asesor`, admin, {
    asesorId: asesorB,
    motivo: "Licencia del asesor anterior",
  });
  expect(r.status).toBe(200);
  expect(r.json.asesorId).toBe(asesorB);
  const asesores = await llamar<{ items: Array<{ id: string; disponibilidad: string }> }>(
    "GET",
    "/api/asesores",
    admin,
  );
  expect(asesores.json.items.find((a) => a.id === asesorA)?.disponibilidad).toBe("DISPONIBLE");
  expect(asesores.json.items.find((a) => a.id === asesorB)?.disponibilidad).toBe(
    "CON_TALLER_ACTIVO",
  );
});

test("cancelar: con motivo; luego no se edita ni se vuelve a cancelar", async () => {
  const sinMotivo = await llamar("POST", `/api/talleres/${taller.id}/cancelar`, admin, {
    motivo: " ",
  });
  expect(sinMotivo.status).toBe(400);
  const r = await llamar<Detalle>("POST", `/api/talleres/${taller.id}/cancelar`, admin, {
    motivo: "Sin inscritos suficientes",
  });
  expect(r.status).toBe(200);
  expect(r.json).toMatchObject({
    estado: "CANCELADO",
    motivoCancelacion: "Sin inscritos suficientes",
  });
  expect(r.json.calendario.every((s) => s.estado === "CANCELADA")).toBe(true);
  expect(
    (await llamar("POST", `/api/talleres/${taller.id}/cancelar`, admin, { motivo: "Otra vez" }))
      .status,
  ).toBe(400);
  expect((await llamar("PATCH", `/api/talleres/${taller.id}`, admin, datos())).status).toBe(400);
});
