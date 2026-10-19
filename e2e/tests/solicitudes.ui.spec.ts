import { expect, type Page, test } from "@playwright/test";

/**
 * Pruebas E2E de interfaz de usuario (UI) para el Módulo de Obtención de Datos.
 * Ejercita:
 * 1. Acceso y renderizado del Wizard de Mesa de Partes Virtual (/mesa-de-partes)
 * 2. Visualización de la Bandeja Administrativa de Solicitudes (/solicitudes)
 * 3. Métricas KPIs y filtros multicriterio
 * 4. Navegación hacia el Detalle de Solicitud con checklist documentario
 */

async function loginAdmin(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByPlaceholder("DNI, CUI o correo").fill("00000001");
  await page.getByPlaceholder("Ingrese su contraseña").fill("x");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test("UI 01: Portal público de Mesa de Partes Virtual renderiza correctamente", async ({
  page,
}) => {
  await page.goto("/mesa-de-partes");
  await expect(page.getByText("Mesa de Partes Virtual")).toBeVisible();
  await expect(page.getByText("Facultad de Ingeniería de Producción y Servicios")).toBeVisible();

  // Verificar la presencia de los 4 pasos del wizard
  await expect(page.getByText("1. Modalidad")).toBeVisible();
  await expect(page.getByText("2. Trámite y Tesistas")).toBeVisible();
  await expect(page.getByText("3. Requisitos")).toBeVisible();
  await expect(page.getByText("4. Confirmación")).toBeVisible();

  // El botón "Continuar al Paso 2" debe existir
  const btnContinuar = page.getByRole("button", { name: /Continuar al Paso 2/i });
  await expect(btnContinuar).toBeVisible();
});

test("UI 02: Bandeja administrativa de Solicitudes accesible para STAFF con KPIs", async ({
  page,
}) => {
  await loginAdmin(page);

  // Acceder a la bandeja mediante menú lateral o URL directa
  await page.goto("/solicitudes");
  await expect(page.getByRole("heading", { name: "Bandeja de Solicitudes" })).toBeVisible();

  // Verificar tarjetas de métricas (KPIs)
  await expect(page.getByText("Nuevas")).toBeVisible();
  await expect(page.getByText("En Revisión")).toBeVisible();
  await expect(page.getByText("Expedientes Creados")).toBeVisible();
  await expect(page.getByText("Observadas")).toBeVisible();
  await expect(page.getByText("Espera Promedio")).toBeVisible();

  // Verificar controles de filtro
  await expect(
    page.getByPlaceholder("Buscar por código, título, DNI o apellidos..."),
  ).toBeVisible();
  await expect(page.getByRole("combobox").first()).toBeVisible();

  // Verificar encabezados de la tabla de solicitudes
  await expect(page.getByText("CÓDIGO")).toBeVisible();
  await expect(page.getByText("MODALIDAD")).toBeVisible();
  await expect(page.getByText("ESTADO")).toBeVisible();
  await expect(page.getByText("ACCIONES")).toBeVisible();
});

test("UI 03: Detalle de solicitud renderiza checklist, participantes y acciones", async ({
  page,
}) => {
  await loginAdmin(page);
  await page.goto("/solicitudes");

  // Si hay alguna solicitud listada, hacer clic en "Gestionar" o "Ver detalle"
  const enlaceDetalle = page.getByRole("link", { name: /Gestionar|Ver detalle/i }).first();
  if (await enlaceDetalle.isVisible()) {
    await enlaceDetalle.click();
    await page.waitForURL(/\/solicitudes\/[a-f0-9-]+/);

    // Verificar secciones clave del detalle
    await expect(page.getByText("Datos de la Solicitud")).toBeVisible();
    await expect(page.getByText("Participantes")).toBeVisible();
    await expect(page.getByText("Documentos Adjuntos")).toBeVisible();
    await expect(page.getByText("Historial y Trazabilidad")).toBeVisible();

    // Verificar presencia de botones de acción
    await expect(page.getByRole("button", { name: /Observar/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Rechazar/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Aceptar y Crear Expediente/i })).toBeVisible();
  }
});
