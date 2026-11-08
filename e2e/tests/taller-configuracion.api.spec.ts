import { type APIRequestContext, expect, test } from "@playwright/test";

/**
 * P16 Configuración del taller (spec v1.0) contra Postgres real: feriados,
 * plan institucional, especialidades y parámetros. Solo el Administrador.
 *
 * Requiere el entorno levantado (make dev o make prod-local) con el seed demo.
 * Deja la BD como la encontró en lo que importa: restaura la semana del plan
 * y el parámetro que toca; el feriado y la especialidad de prueba quedan
 * desactivados (no se borra nada, §15).
 * Uso: E2E_BASE_URL=http://localhost:3001 pnpm --filter pis-e2e test taller-configuracion
 */

const CLAVE_DEMO = process.env.DEMO_PASSWORD ?? "x";

test.describe.configure({ mode: "serial" });

type Config = {
  feriados: Array<{ id: string; fecha: string; nombre: string; activo: boolean }>;
  plan: Array<{
    semana: number;
    contenido: string;
    entregable: string | null;
    esHito: boolean;
    fijo: boolean;
  }>;
  especialidades: Array<{ id: string; nombre: string; activa: boolean; asesores: number }>;
  parametros: Array<{ clave: string; valor: number | boolean; porDefecto: number | boolean }>;
};

type Respuesta = { status: number; json: Config & { error?: { codigo: string; mensaje: string } } };

let api: APIRequestContext;
let admin = "";
let secretaria = "";

// Datos únicos por corrida (el año lejano evita chocar con feriados reales).
const sufijo = String(Date.now()).slice(-6);
const anio = 2090 + (Number(sufijo) % 9);
const mes = String((Number(sufijo) % 12) + 1).padStart(2, "0");
const dia = String((Number(sufijo) % 27) + 1).padStart(2, "0");
const FECHA = `${anio}-${mes}-${dia}`;
const ESPECIALIDAD = `Prueba E2E ${sufijo}`;

async function llamar(
  metodo: "GET" | "POST" | "PATCH",
  ruta: string,
  token: string,
  data?: unknown,
): Promise<Respuesta> {
  const r = await api.fetch(ruta, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}` },
    ...(data !== undefined ? { data } : {}),
  });
  const texto = await r.text();
  let json = {} as Respuesta["json"];
  try {
    json = JSON.parse(texto) as Respuesta["json"];
  } catch {
    // cuerpo vacío
  }
  return { status: r.status(), json };
}

async function login(identificador: string): Promise<string> {
  const r = await api.post("/api/auth/login", { data: { identificador, password: CLAVE_DEMO } });
  expect(r.status(), `login ${identificador}`).toBe(200);
  return ((await r.json()) as { accessToken: string }).accessToken;
}

test.beforeAll(async ({ playwright, baseURL }) => {
  api = await playwright.request.newContext({ baseURL: baseURL ?? "http://localhost:80" });
  admin = await login("00000001");
  secretaria = await login("00000002");
});

test.afterAll(async () => {
  await api.dispose();
});

test("solo el Administrador ve y cambia la configuración del taller", async () => {
  expect((await llamar("GET", "/api/configuracion/taller", secretaria)).status).toBe(403);
  const r = await llamar("POST", "/api/configuracion/taller/feriados", secretaria, {
    fecha: FECHA,
    nombre: "No debería guardarse",
  });
  expect(r.status).toBe(403);
  const sinToken = await api.get("/api/configuracion/taller");
  expect(sinToken.status()).toBe(401);
});

test("la configuración trae las 12 semanas con sus hitos y los 15 parámetros", async () => {
  const r = await llamar("GET", "/api/configuracion/taller", admin);
  expect(r.status).toBe(200);
  expect(r.json.plan).toHaveLength(12);
  const hitos = r.json.plan.filter((s) => s.esHito).map((s) => s.semana);
  expect(hitos).toEqual([2, 4, 6, 8, 10, 11, 12]);
  expect(r.json.plan.filter((s) => s.fijo).map((s) => s.semana)).toEqual([2, 12]);
  expect(r.json.parametros).toHaveLength(15);
});

test("feriados: agregar, duplicado, editar y desactivar", async () => {
  const alta = await llamar("POST", "/api/configuracion/taller/feriados", admin, {
    fecha: FECHA,
    nombre: "  Feriado   de prueba ",
  });
  expect(alta.status).toBe(201);
  const creado = alta.json.feriados.find((f) => f.fecha === FECHA);
  expect(creado?.nombre).toBe("Feriado de prueba");
  expect(creado?.activo).toBe(true);

  const repetido = await llamar("POST", "/api/configuracion/taller/feriados", admin, {
    fecha: FECHA,
    nombre: "Otro",
  });
  expect(repetido.status).toBe(409);
  expect(repetido.json.error?.codigo).toBe("DATOS_DUPLICADOS");

  const invalido = await llamar("POST", "/api/configuracion/taller/feriados", admin, {
    fecha: "2026-02-30",
    nombre: "Fecha que no existe",
  });
  expect(invalido.status).toBe(400);

  const editado = await llamar("PATCH", `/api/configuracion/taller/feriados/${creado?.id}`, admin, {
    nombre: "Feriado regional de prueba",
    activo: false,
  });
  expect(editado.status).toBe(200);
  const f = editado.json.feriados.find((x) => x.id === creado?.id);
  expect(f).toMatchObject({ nombre: "Feriado regional de prueba", activo: false });

  const inexistente = await llamar(
    "PATCH",
    "/api/configuracion/taller/feriados/00000000-0000-4000-8000-000000000000",
    admin,
    { activo: true },
  );
  expect(inexistente.status).toBe(404);
});

test("plan institucional: edita contenido; una semana hito exige entregable", async () => {
  const antes = await llamar("GET", "/api/configuracion/taller", admin);
  const semana3 = antes.json.plan.find((s) => s.semana === 3);
  expect(semana3).toBeDefined();

  const sinEntregable = await llamar("PATCH", "/api/configuracion/taller/plan/4", admin, {
    contenido: "Marco teórico",
    entregable: "",
  });
  expect(sinEntregable.status).toBe(400);

  const r = await llamar("PATCH", "/api/configuracion/taller/plan/3", admin, {
    contenido: `Marco teórico (E2E ${sufijo})`,
    entregable: null,
  });
  expect(r.status).toBe(200);
  expect(r.json.plan.find((s) => s.semana === 3)?.contenido).toBe(`Marco teórico (E2E ${sufijo})`);

  // Restaurar.
  const restaurar = await llamar("PATCH", "/api/configuracion/taller/plan/3", admin, {
    contenido: semana3?.contenido,
    entregable: semana3?.entregable ?? null,
  });
  expect(restaurar.status).toBe(200);
});

test("especialidades: nombre único sin distinguir mayúsculas; se desactivan", async () => {
  const alta = await llamar("POST", "/api/configuracion/taller/especialidades", admin, {
    nombre: ESPECIALIDAD,
  });
  expect(alta.status).toBe(201);
  const creada = alta.json.especialidades.find((e) => e.nombre === ESPECIALIDAD);
  expect(creada).toMatchObject({ activa: true, asesores: 0 });

  const repetida = await llamar("POST", "/api/configuracion/taller/especialidades", admin, {
    nombre: ESPECIALIDAD.toUpperCase(),
  });
  expect(repetida.status).toBe(409);

  const baja = await llamar(
    "PATCH",
    `/api/configuracion/taller/especialidades/${creada?.id}`,
    admin,
    { activa: false },
  );
  expect(baja.status).toBe(200);
  expect(baja.json.especialidades.find((e) => e.id === creada?.id)?.activa).toBe(false);
});

test("parámetros: valida tipo y rango, y se puede restaurar", async () => {
  const antes = await llamar("GET", "/api/configuracion/taller", admin);
  const original = antes.json.parametros.find((p) => p.clave === "umbralAsistenciaBaja");
  expect(original).toBeDefined();

  const fuera = await llamar(
    "PATCH",
    "/api/configuracion/taller/parametros/umbralAsistenciaBaja",
    admin,
    {
      valor: 150,
    },
  );
  expect(fuera.status).toBe(400);

  const tipo = await llamar(
    "PATCH",
    "/api/configuracion/taller/parametros/retiroLiberaCupo",
    admin,
    {
      valor: 1,
    },
  );
  expect(tipo.status).toBe(400);

  const desconocido = await llamar(
    "PATCH",
    "/api/configuracion/taller/parametros/noExiste",
    admin,
    {
      valor: 1,
    },
  );
  expect(desconocido.status).toBe(404);

  const ok = await llamar(
    "PATCH",
    "/api/configuracion/taller/parametros/umbralAsistenciaBaja",
    admin,
    {
      valor: 65,
    },
  );
  expect(ok.status).toBe(200);
  expect(ok.json.parametros.find((p) => p.clave === "umbralAsistenciaBaja")?.valor).toBe(65);

  // Restaurar.
  const r = await llamar(
    "PATCH",
    "/api/configuracion/taller/parametros/umbralAsistenciaBaja",
    admin,
    {
      valor: original?.valor,
    },
  );
  expect(r.status).toBe(200);
});
