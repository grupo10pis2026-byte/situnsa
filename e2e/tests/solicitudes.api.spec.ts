import { type APIRequestContext, expect, test } from "@playwright/test";

/**
 * Pruebas E2E de API para el Módulo de Obtención de Datos y Gestión de Solicitudes.
 * Cubre el ciclo de vida completo:
 * 1. Envío público de solicitud (Mesa de Partes Virtual multipart)
 * 2. Visualización y KPIs en bandeja administrativa
 * 3. Apertura de detalle (transición NUEVA -> EN_REVISION)
 * 4. Actualización de conformidad documentaria y datos menores
 * 5. Observación de solicitud y generación de token de subsanación
 * 6. Consulta y reenvío de subsanación pública guiada por token
 * 7. Aceptación de solicitud: generación de SETNNN, creación de expediente y usuario
 */

test.describe.configure({ mode: "serial" });

type Json = Record<string, unknown> & {
  error?: { codigo: string; mensaje: string };
};

interface Respuesta {
  status: number;
  json: Json;
  texto: string;
}

const CLAVE_DEMO = process.env.DEMO_PASSWORD ?? "x";
const PDF_BUFFER = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
);

let api: APIRequestContext;
let adminToken = "";
let solicitudId = "";
let codigoSolicitud = "";
let tokenSubsanacion = "";
let expedienteCreadoId = "";

const sufijo = String(Date.now()).slice(-6);
const dniTesista1 = `8${sufijo}1`.slice(0, 8);
const correoTesista1 = `tesista.${sufijo}.1@unsa.edu.pe`;
const dniTesista2 = `8${sufijo}2`.slice(0, 8);
const correoTesista2 = `tesista.${sufijo}.2@unsa.edu.pe`;

async function llamar(
  metodo: "GET" | "POST" | "PATCH",
  ruta: string,
  token?: string,
  data?: unknown,
): Promise<Respuesta> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const r = await api.fetch(ruta, {
    method: metodo,
    headers,
    ...(data !== undefined ? { data } : {}),
  });
  const texto = await r.text();
  let json: Json = {};
  try {
    json = JSON.parse(texto) as Json;
  } catch {
    json = {};
  }
  return { status: r.status(), json, texto };
}

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:80",
  });

  // Login de administrador con credenciales demo
  const r = await api.post("/api/auth/login", {
    data: { identificador: "00000001", password: CLAVE_DEMO },
  });
  expect(r.status(), "Login de admin demo").toBe(200);
  const data = (await r.json()) as { accessToken: string };
  adminToken = data.accessToken;
});

test.afterAll(async () => {
  await api.dispose();
});

test("01. Envío público de solicitud vía Mesa de Partes Virtual (multipart)", async () => {
  const datosTramite = {
    viaIngreso: "MESA_PARTES_VIRTUAL",
    modalidad: "TESIS",
    tituloProyecto: `Proyecto E2E Automatizado ${sufijo}`,
    lineaInvestigacion: "Ingeniería de Software",
    programa: "INGENIERIA_SISTEMAS",
    participantes: [
      {
        tipo: "TITULAR",
        dni: dniTesista1,
        nombres: "Juan Carlos",
        apellidos: `Pérez E2E ${sufijo}`,
        correo: correoTesista1,
        telefono: "958123456",
        direccion: "Av. Independencia 123",
      },
      {
        tipo: "SEGUNDO_TESISTA",
        dni: dniTesista2,
        nombres: "María Elena",
        apellidos: `Gómez E2E ${sufijo}`,
        correo: correoTesista2,
        telefono: "958654321",
        direccion: "Calle Paucarpata 456",
      },
    ],
  };

  const response = await api.post("/api/solicitudes-publicas", {
    multipart: {
      datos: JSON.stringify(datosTramite),
      solicitudInscripcion: {
        name: "solicitud_inscripcion.pdf",
        mimeType: "application/pdf",
        buffer: PDF_BUFFER,
      },
      planTesis: {
        name: "plan_tesis.pdf",
        mimeType: "application/pdf",
        buffer: PDF_BUFFER,
      },
      constanciaEgresado: {
        name: "constancia_egresado.pdf",
        mimeType: "application/pdf",
        buffer: PDF_BUFFER,
      },
    },
  });

  expect(response.status(), `Respuesta de envío público: ${await response.text()}`).toBe(201);
  const json = (await response.json()) as {
    id: string;
    codigo: string;
    mensaje: string;
  };

  expect(json.id).toBeDefined();
  expect(json.codigo).toMatch(/^SOL-\d{4}-\d{4}$/);
  solicitudId = json.id;
  codigoSolicitud = json.codigo;
});

test("02. Verificación en bandeja administrativa y KPIs", async () => {
  const res = await llamar("GET", "/api/solicitudes?limit=20&page=1", adminToken);
  expect(res.status).toBe(200);

  const body = res.json as {
    data: Array<{ id: string; codigo: string; estado: string }>;
    kpis: { nuevas: number; enRevision: number };
  };

  expect(body.kpis.nuevas).toBeGreaterThanOrEqual(1);
  const encontrada = body.data.find((s) => s.id === solicitudId);
  expect(encontrada, `Solicitud ${codigoSolicitud} encontrada en bandeja`).toBeDefined();
  expect(encontrada?.estado).toBe("NUEVA");
});

test("03. Apertura de detalle y transición automática a EN_REVISION", async () => {
  const res = await llamar("GET", `/api/solicitudes/${solicitudId}`, adminToken);
  expect(res.status).toBe(200);

  const detalle = res.json as {
    id: string;
    codigo: string;
    estado: string;
    participantes: Array<{ dni: string }>;
    documentos: Array<{ id: string; estadoConformidad: string }>;
  };

  expect(detalle.id).toBe(solicitudId);
  expect(detalle.estado).toBe("EN_REVISION");
  expect(detalle.participantes).toHaveLength(2);
  expect(detalle.documentos.length).toBeGreaterThanOrEqual(3);
});

test("04. Verificación documentaria y corrección de datos menores", async () => {
  const detalleRes = await llamar("GET", `/api/solicitudes/${solicitudId}`, adminToken);
  const detalle = detalleRes.json as {
    documentos: Array<{ id: string }>;
  };
  const docId = detalle.documentos[0]?.id;
  expect(docId).toBeDefined();

  const confRes = await llamar(
    "PATCH",
    `/api/solicitudes/${solicitudId}/documentos/${docId}/conformidad`,
    adminToken,
    {
      estado: "CONFORME",
      observacion: "Documento revisado y legible",
    },
  );
  expect(confRes.status).toBe(200);

  const modRes = await llamar(
    "PATCH",
    `/api/solicitudes/${solicitudId}/datos-menores`,
    adminToken,
    {
      tituloProyecto: `Proyecto E2E Automatizado Corregido ${sufijo}`,
    },
  );
  expect(modRes.status).toBe(200);
});

test("05. Observación de solicitud y generación de token de subsanación", async () => {
  const obsRes = await llamar("POST", `/api/solicitudes/${solicitudId}/observar`, adminToken, {
    observaciones: [
      "El plan de tesis requiere firma del asesor en la carátula.",
      "La constancia de egresado presenta sello tenue.",
    ],
    plazoDias: 5,
  });

  expect(obsRes.status).toBe(200);
  const obsBody = obsRes.json as {
    solicitud: { estado: string; fechaLimiteSubsanacion: string };
    tokenSubsanacion: string;
    enlaceSubsanacion: string;
  };

  expect(obsBody.solicitud.estado).toBe("OBSERVADA");
  expect(obsBody.tokenSubsanacion).toBeDefined();
  expect(obsBody.solicitud.fechaLimiteSubsanacion).toBeDefined();
  tokenSubsanacion = obsBody.tokenSubsanacion;
});

test("06. Consulta pública por token de subsanación", async () => {
  const tokenRes = await llamar("GET", `/api/solicitudes-publicas/subsanar/${tokenSubsanacion}`);

  expect(tokenRes.status).toBe(200);
  const portalBody = tokenRes.json as {
    codigo: string;
    estado: string;
    observaciones: string[];
    tokenValido: boolean;
  };

  expect(portalBody.codigo).toBe(codigoSolicitud);
  expect(portalBody.estado).toBe("OBSERVADA");
  expect(portalBody.tokenValido).toBe(true);
  expect(portalBody.observaciones).toHaveLength(2);
});

test("07. Envío de subsanación pública con token de un solo uso", async () => {
  const subRes = await api.post(`/api/solicitudes-publicas/subsanar/${tokenSubsanacion}`, {
    multipart: {
      archivosSubsanadosIds: JSON.stringify([]),
      documentoCorregido: {
        name: "plan_tesis_corregido.pdf",
        mimeType: "application/pdf",
        buffer: PDF_BUFFER,
      },
    },
  });

  expect(subRes.status()).toBe(200);
  const subBody = (await subRes.json()) as {
    id: string;
    estado: string;
    mensaje: string;
  };

  expect(subBody.estado).toBe("EN_REVISION");

  const reintento = await llamar("GET", `/api/solicitudes-publicas/subsanar/${tokenSubsanacion}`);
  expect(reintento.status).toBe(400);
});

test("08. Aceptación de solicitud y generación de expediente SET", async () => {
  const aceptarRes = await llamar("POST", `/api/solicitudes/${solicitudId}/aceptar`, adminToken, {
    observacionesAceptacion: "Documentos conformes tras subsanación. Procede apertura.",
  });

  expect(aceptarRes.status, `Respuesta aceptación: ${aceptarRes.texto}`).toBe(200);
  const aceptado = aceptarRes.json as {
    expedienteId: string;
    codigoExpediente: string;
    estado: string;
    credencialesEmitidas: Array<{ dni: string; correo: string }>;
  };

  expect(aceptado.expedienteId).toBeDefined();
  expect(aceptado.codigoExpediente).toMatch(/^SET\d+$/);
  expect(aceptado.estado).toBe("ACEPTADA");
  expedienteCreadoId = aceptado.expedienteId;

  const expRes = await llamar("GET", `/api/expedientes/${expedienteCreadoId}`, adminToken);
  expect(expRes.status).toBe(200);
  const expBody = expRes.json as {
    codigo: string;
    estado: string;
    subetapas: Array<{ clave: string | null }>;
  };

  expect(expBody.codigo).toBe(aceptado.codigoExpediente);
  expect(expBody.subetapas.length).toBe(38);
});
