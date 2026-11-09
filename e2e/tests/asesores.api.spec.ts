import { type APIRequestContext, expect, test } from "@playwright/test";

/**
 * P15 Lista de asesores y P10 Perfil (spec v1.0) contra Postgres real:
 * permisos, alta con rol y acceso, duplicados, desactivación, perfil,
 * especialidades y archivos.
 *
 * Requiere el entorno levantado (make dev o make prod-local) con el seed demo.
 * Correos: Mailpit (E2E_MAILPIT_URL, default http://localhost:8025); sin
 * Mailpit se omite la activación de la cuenta del asesor nuevo.
 * Uso: E2E_BASE_URL=http://localhost:3001 pnpm --filter pis-e2e test asesores
 */

const MAILPIT = process.env.E2E_MAILPIT_URL ?? "http://localhost:8025";
const CLAVE_DEMO = process.env.DEMO_PASSWORD ?? "x";
const ASESOR_DEMO_ID = "22222222-2222-4222-8222-222222222222"; // DNI 87654321, TALLER 06
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF");

test.describe.configure({ mode: "serial" });

type Asesor = {
  id: string;
  dni: string;
  email: string;
  telefono: string | null;
  grado: string | null;
  activo: boolean;
  especialidades: Array<{ id: string; nombre: string }>;
  tallerActual: { id: string; nombre: string } | null;
  disponibilidad: string;
};
type Perfil = {
  asesor: Asesor;
  archivos: Array<{ id: string; nombre: string; bytes: number }>;
  historial: Array<{ nombre: string; estado: string }>;
  encuesta: { respuestas: number; promedio: number | null };
};
type Json = Record<string, unknown> & {
  error?: { codigo: string; mensaje: string; detalles?: Array<{ campo?: string }> };
};

let api: APIRequestContext;
let admin = "";
let asesorDemo = "";
let tesista = "";
let nuevo: Asesor;

const sufijo = String(Date.now()).slice(-6);
const DNI = `4${sufijo}7`.slice(0, 8);
const CORREO = `asesor.e2e.${sufijo}@unsa.edu.pe`;

async function llamar<T = Json>(
  metodo: "GET" | "POST" | "PATCH" | "DELETE",
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
    // sin cuerpo JSON
  }
  return { status: r.status(), json };
}

async function login(identificador: string, password = CLAVE_DEMO): Promise<string> {
  const r = await api.post("/api/auth/login", { data: { identificador, password } });
  expect(r.status(), `login ${identificador}`).toBe(200);
  return ((await r.json()) as { accessToken: string }).accessToken;
}

async function mailpitDisponible(): Promise<boolean> {
  try {
    return (await api.get(`${MAILPIT}/api/v1/messages`)).ok();
  } catch {
    return false;
  }
}

async function tokenActivacion(email: string): Promise<string | null> {
  for (let i = 0; i < 30; i++) {
    const r = await api.get(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}" subject:"Activa"`)}`,
    );
    const id = ((await r.json()) as { messages?: Array<{ ID: string }> }).messages?.[0]?.ID;
    if (id) {
      const m = (await (await api.get(`${MAILPIT}/api/v1/message/${id}`)).json()) as {
        Text: string;
      };
      const t = /activar\?token=([A-Za-z0-9_\-%]+)/.exec(m.Text)?.[1];
      if (t) return decodeURIComponent(t);
    }
    await new Promise((res) => setTimeout(res, 500));
  }
  return null;
}

test.beforeAll(async ({ playwright, baseURL }) => {
  api = await playwright.request.newContext({ baseURL: baseURL ?? "http://localhost:80" });
  admin = await login("00000001");
  asesorDemo = await login("87654321");
  tesista = await login("12345678");
});

test.afterAll(async () => {
  await api.dispose();
});

test("solo el personal ve el catálogo; solo la Secretaría lo gestiona", async () => {
  expect((await llamar("GET", "/api/asesores", asesorDemo)).status).toBe(403);
  expect((await llamar("GET", "/api/asesores", tesista)).status).toBe(403);
  expect((await api.get("/api/asesores")).status()).toBe(401);
  const crear = await llamar("POST", "/api/asesores", asesorDemo, {
    dni: DNI,
    nombres: "No",
    apellidos: "Autorizado",
    email: CORREO,
  });
  expect(crear.status).toBe(403);
  expect((await llamar("GET", `/api/asesores/${ASESOR_DEMO_ID}/perfil`, tesista)).status).toBe(403);
});

test("nuevo asesor: valida campos, crea con especialidades y queda disponible", async () => {
  const malo = await llamar("POST", "/api/asesores", admin, {
    dni: "123",
    nombres: "Rosa",
    apellidos: "Prueba",
    email: "rosa@gmail.com",
  });
  expect(malo.status).toBe(400);
  expect(malo.json.error?.detalles?.map((d) => d.campo)).toEqual(["dni", "email"]);

  const r = await llamar<Asesor>("POST", "/api/asesores", admin, {
    dni: DNI,
    nombres: "  Rosa  ",
    apellidos: "Prueba E2E",
    email: CORREO.toUpperCase(),
    telefono: "959 000 111",
    grado: "Mg.",
    especialidades: ["Sistemas", `Gestión E2E ${sufijo}`, "sistemas"],
  });
  expect(r.status, JSON.stringify(r.json)).toBe(201);
  nuevo = r.json;
  expect(nuevo).toMatchObject({
    dni: DNI,
    email: CORREO,
    activo: true,
    disponibilidad: "DISPONIBLE",
    tallerActual: null,
  });
  expect(nuevo.especialidades).toHaveLength(2);

  const lista = await llamar<{ items: Asesor[] }>("GET", "/api/asesores", admin);
  expect(lista.json.items.some((a) => a.id === nuevo.id)).toBe(true);
  const demo = lista.json.items.find((a) => a.id === ASESOR_DEMO_ID);
  expect(demo?.disponibilidad).toBe("CON_TALLER_ACTIVO");
  expect(demo?.tallerActual?.nombre).toBe("TALLER 06");
});

test("duplicados: DNI y correo (sin distinguir mayúsculas)", async () => {
  const dni = await llamar("POST", "/api/asesores", admin, {
    dni: DNI,
    nombres: "Otra",
    apellidos: "Persona",
    email: `otra.${sufijo}@unsa.edu.pe`,
  });
  expect(dni.status).toBe(409);
  expect(dni.json.error?.codigo).toBe("DATOS_DUPLICADOS");
  const correo = await llamar("POST", "/api/asesores", admin, {
    dni: `5${sufijo}8`.slice(0, 8),
    nombres: "Otra",
    apellidos: "Persona",
    email: CORREO.toUpperCase(),
  });
  expect(correo.status).toBe(409);
});

test("el asesor nuevo recibe su acceso y entra con el rol Asesor", async () => {
  test.skip(!(await mailpitDisponible()), "Mailpit no disponible");
  const token = await tokenActivacion(CORREO);
  expect(token, "correo de activación en Mailpit").not.toBeNull();
  const activar = await api.post("/api/auth/activar", {
    data: { token, password: "Asesor2026" },
  });
  expect(activar.status()).toBe(200);
  const propio = await login(DNI, "Asesor2026");
  // Tiene el rol Asesor (no es personal): no ve el catálogo.
  expect((await llamar("GET", "/api/asesores", propio)).status).toBe(403);
});

test("editar datos; no se desactiva un asesor con taller activo", async () => {
  const r = await llamar<Asesor>("PATCH", `/api/asesores/${nuevo.id}`, admin, {
    telefono: "959 222 333",
    grado: "Dr.",
  });
  expect(r.status).toBe(200);
  expect(r.json).toMatchObject({ telefono: "959 222 333", grado: "Dr." });

  const correoAjeno = await llamar("PATCH", `/api/asesores/${nuevo.id}`, admin, {
    email: "ANGELA@unsa.edu.pe",
  });
  expect(correoAjeno.status).toBe(409);

  const conTaller = await llamar("PATCH", `/api/asesores/${ASESOR_DEMO_ID}`, admin, {
    activo: false,
  });
  expect(conTaller.status).toBe(400);
  expect(conTaller.json.error?.codigo).toBe("REQUISITO_PENDIENTE");

  const baja = await llamar<Asesor>("PATCH", `/api/asesores/${nuevo.id}`, admin, { activo: false });
  expect(baja.json.activo).toBe(false);
  const alta = await llamar<Asesor>("PATCH", `/api/asesores/${nuevo.id}`, admin, { activo: true });
  expect(alta.json.activo).toBe(true);
});

test("perfil: historial del asesor con taller y encuesta sin respuestas", async () => {
  const demo = await llamar<Perfil>("GET", `/api/asesores/${ASESOR_DEMO_ID}/perfil`, admin);
  expect(demo.status).toBe(200);
  expect(demo.json.historial.some((t) => t.nombre === "TALLER 06")).toBe(true);
  const propio = await llamar<Perfil>("GET", `/api/asesores/${nuevo.id}/perfil`, admin);
  expect(propio.json).toMatchObject({ archivos: [], historial: [] });
  expect(propio.json.encuesta).toMatchObject({ respuestas: 0, promedio: null });
  const ajeno = await llamar(
    "GET",
    "/api/asesores/00000000-0000-4000-8000-000000000000/perfil",
    admin,
  );
  expect(ajeno.status).toBe(404);
});

test("especialidades del perfil: agregar, repetir, quitar y desactivadas", async () => {
  const repetida = await llamar<Perfil>("POST", `/api/asesores/${nuevo.id}/especialidades`, admin, {
    nombre: "  SISTEMAS ",
  });
  expect(repetida.status).toBe(200);
  expect(repetida.json.asesor.especialidades).toHaveLength(2);

  const otra = await llamar<Perfil>("POST", `/api/asesores/${nuevo.id}/especialidades`, admin, {
    nombre: `Calidad E2E ${sufijo}`,
  });
  expect(otra.json.asesor.especialidades).toHaveLength(3);
  const calidad = otra.json.asesor.especialidades.find((e) => e.nombre.startsWith("Calidad"));

  const quitar = await llamar<Perfil>(
    "DELETE",
    `/api/asesores/${nuevo.id}/especialidades/${calidad?.id}`,
    admin,
    {},
  );
  expect(quitar.json.asesor.especialidades).toHaveLength(2);
  const otraVez = await llamar(
    "DELETE",
    `/api/asesores/${nuevo.id}/especialidades/${calidad?.id}`,
    admin,
    {},
  );
  expect(otraVez.status).toBe(404);

  // Una especialidad desactivada en Configuración no se asigna.
  await llamar("PATCH", `/api/configuracion/taller/especialidades/${calidad?.id}`, admin, {
    activa: false,
  });
  const inactiva = await llamar("POST", `/api/asesores/${nuevo.id}/especialidades`, admin, {
    nombre: calidad?.nombre,
  });
  expect(inactiva.status).toBe(400);
  const catalogo = await llamar<{ items: Array<{ id: string }> }>(
    "GET",
    "/api/especialidades",
    admin,
  );
  expect(catalogo.json.items.some((e) => e.id === calidad?.id)).toBe(false);
});

test("archivos del perfil: solo PDF; ver, descargar y eliminar", async () => {
  const subir = await api.post(`/api/asesores/${nuevo.id}/archivos`, {
    headers: { Authorization: `Bearer ${admin}` },
    multipart: { file: { name: "CV Rosa.pdf", mimeType: "application/pdf", buffer: PDF } },
  });
  expect(subir.status(), await subir.text()).toBe(201);
  const perfil = (await subir.json()) as Perfil;
  expect(perfil.archivos).toHaveLength(1);
  const archivo = perfil.archivos[0];
  expect(archivo?.nombre).toBe("CV Rosa.pdf");

  const imagen = await api.post(`/api/asesores/${nuevo.id}/archivos`, {
    headers: { Authorization: `Bearer ${admin}` },
    multipart: { file: { name: "foto.png", mimeType: "image/png", buffer: Buffer.from("x") } },
  });
  expect(imagen.status()).toBe(400);
  const ajeno = await api.post(`/api/asesores/${nuevo.id}/archivos`, {
    headers: { Authorization: `Bearer ${asesorDemo}` },
    multipart: { file: { name: "cv.pdf", mimeType: "application/pdf", buffer: PDF } },
  });
  expect(ajeno.status()).toBe(403);

  const bajar = await api.get(`/api/asesores/${nuevo.id}/archivos/${archivo?.id}`, {
    headers: { Authorization: `Bearer ${admin}` },
  });
  expect(bajar.status()).toBe(200);
  expect(bajar.headers()["content-type"]).toContain("application/pdf");
  expect((await bajar.body()).subarray(0, 5).toString()).toBe("%PDF-");

  const borrar = await llamar<Perfil>(
    "DELETE",
    `/api/asesores/${nuevo.id}/archivos/${archivo?.id}`,
    admin,
    {},
  );
  expect(borrar.json.archivos).toHaveLength(0);
  const yaNo = await api.get(`/api/asesores/${nuevo.id}/archivos/${archivo?.id}`, {
    headers: { Authorization: `Bearer ${admin}` },
  });
  expect(yaNo.status()).toBe(404);
});
