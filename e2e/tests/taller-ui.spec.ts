import { type APIRequestContext, expect, type Page, test } from "@playwright/test";

/**
 * Pruebas de aceptación del Taller en la interfaz (spec v1.0 §16):
 * #7 el alumno no marca su asistencia, #11 un asesor no abre un taller ajeno,
 * #18/#19 botones deshabilitados con su motivo y #24 la Secretaría ve las
 * entregas en solo lectura.
 *
 * Requiere la web y la API levantadas con el seed demo (TALLER 06).
 * Uso: E2E_BASE_URL=http://localhost:5173 pnpm --filter pis-e2e test taller-ui
 */

const CLAVE = process.env.DEMO_PASSWORD ?? "x";
const MARIA = "11223344";
const CARLOS = "22334455";
const ASESOR = "87654321";
const SECRETARIA = "00000002";

test.describe.configure({ mode: "serial" });

let api: APIRequestContext;
let p01 = "";
let p02 = "";
let tallerAjeno = "";
const sufijo = String(Date.now()).slice(-6);

async function token(dni: string): Promise<string> {
  const r = await api.post("/api/auth/login", { data: { identificador: dni, password: CLAVE } });
  expect(r.status(), `login ${dni}`).toBe(200);
  return ((await r.json()) as { accessToken: string }).accessToken;
}

async function entrarComo(page: Page, dni: string): Promise<void> {
  // Cierra la sesión anterior (cambio de usuario dentro del mismo test):
  // el refresh vive en una cookie HttpOnly y la meta en localStorage.
  await page.context().clearCookies();
  await page.goto("/login");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto("/login");
  await page.getByPlaceholder("DNI, CUI o correo").fill(dni);
  await page.getByPlaceholder("Ingrese su contraseña").fill(CLAVE);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test.beforeAll(async ({ playwright, baseURL }) => {
  api = await playwright.request.newContext({ baseURL: baseURL ?? "http://localhost:80" });
  const maria = await token(MARIA);
  const mt = await api.get("/api/mi-taller", { headers: { Authorization: `Bearer ${maria}` } });
  p01 = ((await mt.json()) as { proyecto: { id: string } }).proyecto.id;
  const carlos = await token(CARLOS);
  const mc = await api.get("/api/mi-taller", { headers: { Authorization: `Bearer ${carlos}` } });
  p02 = ((await mc.json()) as { proyecto: { id: string } }).proyecto.id;

  // Un taller de otro asesor (para #11).
  const admin = await token("00000001");
  const h = { Authorization: `Bearer ${admin}` };
  const asesor = await api.post("/api/asesores", {
    headers: h,
    data: {
      dni: `6${sufijo}7`.slice(0, 8),
      nombres: "Asesor",
      apellidos: `Ajeno ${sufijo}`,
      email: `asesor.ajeno.${sufijo}@unsa.edu.pe`,
    },
  });
  expect(asesor.status()).toBe(201);
  const t = await api.post("/api/talleres", {
    headers: h,
    data: {
      nombre: `TALLER AJENO ${sufijo}`,
      periodo: "2027-I",
      asesorId: ((await asesor.json()) as { id: string }).id,
      inicio: "2027-04-03",
      fin: "2027-06-20",
      numeroSesiones: 2,
      dias: [
        { dia: 6, horaInicio: "15:00", horaFin: "20:00" },
        { dia: 7, horaInicio: "08:00", horaFin: "13:00" },
      ],
      cupoProyectos: 2,
      enlaceSabado: null,
      enlaceDomingo: null,
      pensiones: { montos: [1000, 1000, 1000], fecha2: "2027-04-24", fecha3: "2027-05-22" },
      sesiones: [
        { fecha: "2027-04-03", horaInicio: "15:00", horaFin: "20:00" },
        { fecha: "2027-04-04", horaInicio: "08:00", horaFin: "13:00" },
      ],
    },
  });
  expect(t.status(), await t.text()).toBe(201);
  tallerAjeno = ((await t.json()) as { id: string }).id;
});

test("#7 el alumno no tiene la acción de marcar asistencia y el servidor la rechaza", async ({
  page,
}) => {
  await entrarComo(page, MARIA);
  await page.goto("/mi-taller");
  await expect(page.getByRole("heading", { name: "Mi Taller" })).toBeVisible();
  await page.getByRole("tab", { name: "Sesiones y asistencia" }).click();
  await expect(page.getByText("La asistencia la registra tu asesor.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Registrar asistencia/ })).toHaveCount(0);

  const maria = await token(MARIA);
  const mt = await api.get("/api/mi-taller", { headers: { Authorization: `Bearer ${maria}` } });
  const sesion = ((await mt.json()) as { sesiones: Array<{ id: string }> }).sesiones[0];
  const r = await api.post(`/api/sesiones/${sesion?.id}/asistencia`, {
    headers: { Authorization: `Bearer ${maria}` },
    data: {
      grupoId: null,
      marcas: [{ alumnoId: "11111111-1111-4111-8111-111111111111", estado: "PRESENTE" }],
    },
  });
  expect([403, 404]).toContain(r.status());
});

test("#11 el asesor no abre un taller ajeno", async ({ page }) => {
  await entrarComo(page, ASESOR);
  await page.goto(`/taller/${tallerAjeno}`);
  await expect(page.getByText("No se encontró el taller")).toBeVisible();
  await expect(page.getByText(`TALLER AJENO ${sufijo}`)).toHaveCount(0);
  const r = await api.get(`/api/talleres/${tallerAjeno}`, {
    headers: { Authorization: `Bearer ${await token(ASESOR)}` },
  });
  expect(r.status()).toBe(403);
});

test("#18/#19 la subida del borrador final y el informe quedan bloqueados con su motivo", async ({
  page,
}) => {
  await entrarComo(page, CARLOS);
  await page.goto("/mi-taller");
  await expect(page.getByText("Borrador final").first()).toBeVisible();
  // Ningún hito no habilitado ofrece "Subir versión".
  await expect(page.getByText("El hito no está habilitado para entregas").first()).toBeVisible();

  await entrarComo(page, ASESOR);
  await page.goto(`/proyectos/${p02}/entregas`);
  await page.getByRole("tab", { name: "Cierre" }).click();
  const emitir = page.getByRole("button", { name: /Emitir Informe de Conformidad/ });
  await expect(emitir).toBeDisabled();
  await expect(page.getByText("Aún no hay borrador final entregado").first()).toBeVisible();
});

test("#24 la Secretaría abre las entregas de un proyecto en solo lectura", async ({ page }) => {
  await entrarComo(page, SECRETARIA);
  await page.goto(`/proyectos/${p01}/entregas`);
  await expect(page.getByRole("heading", { name: "Proyecto P-01" })).toBeVisible();
  await expect(page.getByText("Plan de tesis").first()).toBeVisible();
  for (const accion of [
    /^Habilitar$/,
    /Revisar v/,
    /Aprobar plan/,
    /Ajustar fecha/,
    /Subir versión/,
  ]) {
    await expect(page.getByRole("button", { name: accion })).toHaveCount(0);
  }
});
