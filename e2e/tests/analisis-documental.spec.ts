/**
 * Pruebas de POST /api/documentos/upload y POST /api/documentos/:id/analisis.
 * La vista se prueba en /expedientes/$id; solo crea PDFs/identidades sintéticos en el entorno local o CI.
 */
import { writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

test.describe.configure({ mode: "serial" });
const titulo = "Optimización del consumo energético en sistemas de bombeo 2026";
let token = "";
let expedienteId = "";
let documentoId = "";

test.beforeAll(async ({ request }) => {
  const login = await request.post("/api/auth/login", {
    data: { identificador: "00000001", password: process.env.DEMO_PASSWORD ?? "x" },
  });
  expect(login.ok()).toBe(true);
  token = (await login.json()).accessToken;
  const sufijo = Date.now().toString().slice(-7);
  const dni = `7${sufijo}`;
  const registro = await request.post("/api/expedientes/inscribir-plan", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      modalidad: "TESIS",
      programa: "SEGUNDA ESPECIALIDAD EN INGENIERÍA DE SISTEMAS",
      titulo,
      participante1: {
        nombres: "María",
        apellidos: "Núñez García",
        dni,
        email: `analisis.${sufijo}@example.test`,
      },
    },
  });
  expect(registro.status(), await registro.text()).toBe(201);
  expedienteId = (await registro.json()).id;
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const textos = [
    `UNIVERSIDAD\nTítulo: ${titulo}\nTesista: María Núñez García\nDNI: ${dni}`,
    "Resumen\nSe estudió el consumo energético del sistema.\nPalabras clave: energía",
    "Abstract\nThe energy use was studied.",
    "SOLO_PAGINA_4",
  ];
  for (const texto of textos)
    pdf.addPage().drawText(texto, { x: 50, y: 720, size: 11, font, lineHeight: 18 });
  const upload = await request.post("/api/documentos/upload", {
    headers: { Authorization: `Bearer ${token}` },
    multipart: {
      expedienteId,
      tipo: "PLAN_ESTRUCTURADO",
      file: {
        name: "plan.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from(await pdf.save()),
      },
    },
  });
  expect(upload.status(), await upload.text()).toBe(201);
  documentoId = (await upload.json()).id;
});

test("API: permisos, páginas, identidad y revisión parcial sin proveedor", async ({ request }) => {
  expect(
    (await request.post(`/api/documentos/${documentoId}/analisis`, { data: {} })).status(),
  ).toBe(401);
  const accesoAjeno = await request.post("/api/auth/login", {
    data: { identificador: "87654321", password: process.env.DEMO_PASSWORD ?? "x" },
  });
  expect(accesoAjeno.ok()).toBe(true);
  const tokenAjeno = (await accesoAjeno.json()).accessToken;
  expect(
    (
      await request.post(`/api/documentos/${documentoId}/analisis`, {
        headers: { Authorization: `Bearer ${tokenAjeno}` },
        data: {},
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/documentos/id-invalido/analisis", {
        headers: { Authorization: `Bearer ${token}` },
        data: {},
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await request.post(`/api/documentos/${documentoId}/analisis`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { ruta: "/etc/passwd" },
      })
    ).status(),
  ).toBe(400);
  const response = await request.post(`/api/documentos/${documentoId}/analisis`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { revisionEditorial: false },
  });
  expect(response.status(), await response.text()).toBe(200);
  const resultado = await response.json();
  await writeFile(
    test.info().outputPath("analisis-documental.json"),
    JSON.stringify(resultado, null, 2),
  );
  expect(resultado.editorial).toBe("NO_SOLICITADA");
  expect(resultado.documentoId).toBe(documentoId);
  expect(resultado.paginasAnalizadas).toEqual([1, 2, 3]);
  expect(resultado.controles).toContainEqual({
    tipo: "TITULO",
    estado: "CONFORME",
    mensaje: "El título coincide con el registrado.",
  });
  expect(resultado.controles.find((c: { tipo: string }) => c.tipo === "TESISTA_1_DNI").estado).toBe(
    "CONFORME",
  );
  expect(JSON.stringify(resultado)).not.toContain("SOLO_PAGINA_4");
  const editorial = await request.post(`/api/documentos/${documentoId}/analisis`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { revisionEditorial: true },
  });
  expect(editorial.status(), await editorial.text()).toBe(200);
  expect((await editorial.json()).editorial).toBe("NO_DISPONIBLE");
});

test("vista: analiza plan y muestra controles y resumen", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("DNI, CUI o correo").fill("00000001");
  await page.getByPlaceholder("Ingrese su contraseña").fill(process.env.DEMO_PASSWORD ?? "x");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  await page.goto(`/expedientes/${expedienteId}`);
  await page.getByRole("tab", { name: "Documentos Etapa 01" }).click();
  await expect(
    page.getByText("Revisión de ortografía y redacción con IA pendiente de activación.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Analizar carátula y resumen", exact: true }).click();
  await expect(
    page.getByText("Conforme: El título coincide con el registrado.", { exact: true }),
  ).toBeVisible({ timeout: 25_000 });
  await expect(page.getByText("Análisis parcial", { exact: false })).toBeVisible();
  await expect(
    page.getByText("Ortografía y redacción no evaluadas con IA.", { exact: true }),
  ).toBeVisible();
  await page.getByText("Ver resumen extraído", { exact: true }).click();
  await expect(
    page.getByText("Se estudió el consumo energético del sistema.", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/analisis-documental.png", fullPage: true });
});

test("cuota: permite cinco análisis y rechaza el sexto", async ({ request }) => {
  // Los casos anteriores consumieron tres análisis del admin autenticado.
  for (let i = 0; i < 2; i++) {
    const response = await request.post(`/api/documentos/${documentoId}/analisis`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {},
    });
    expect(response.status(), await response.text()).toBe(200);
  }
  const exceso = await request.post(`/api/documentos/${documentoId}/analisis`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {},
  });
  expect(exceso.status()).toBe(429);
  expect(exceso.headers()["retry-after"]).toBeTruthy();
});
