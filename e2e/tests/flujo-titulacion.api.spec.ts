import { type APIRequestContext, expect, test } from "@playwright/test";

/**
 * Regresión de API (sin navegador): un expediente recorre el trámite
 * completo, de REGISTRADO a TITULO_EMITIDO, ejercitando las reglas de
 * avance, observaciones, Turnitin, el acceso del tesista y los correos.
 *
 * Requiere el entorno levantado (make dev o make prod-local) con el seed
 * demo. Correos: Mailpit (E2E_MAILPIT_URL, default http://localhost:8025);
 * sin Mailpit se omite la parte del portal del tesista.
 * Uso: E2E_BASE_URL=http://localhost:5173 pnpm --filter pis-e2e test flujo-titulacion
 */

const MAILPIT = process.env.E2E_MAILPIT_URL ?? "http://localhost:8025";
const CLAVE_DEMO = process.env.DEMO_PASSWORD ?? "x";
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF");

test.describe.configure({ mode: "serial" });

type Json = Record<string, unknown> & {
  error?: { codigo: string; mensaje: string };
};

interface Respuesta {
  status: number;
  json: Json;
  texto: string;
}

let api: APIRequestContext;
let admin = "";
let tesista = "";
let expedienteId = "";
const sufijo = String(Date.now()).slice(-6);
const dni = `7${sufijo}1`.slice(0, 8);
const correo = `qa.tesista.${sufijo}@unsa.edu.pe`;

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
  let json: Json = {};
  try {
    json = JSON.parse(texto) as Json;
  } catch {
    json = {};
  }
  return { status: r.status(), json, texto };
}

async function login(identificador: string, password: string): Promise<string> {
  const r = await api.post("/api/auth/login", { data: { identificador, password } });
  expect(r.status(), `login ${identificador}`).toBe(200);
  return ((await r.json()) as { accessToken: string }).accessToken;
}

async function detalle(): Promise<{
  estado: string;
  observadoDesde: string | null;
  subetapaActiva: { id: string; clave: string | null } | null;
  subetapas: Array<{ clave: string | null; estado: string }>;
  mensajes: Array<{ texto: string }>;
  avance: { pct: number };
}> {
  const r = await llamar("GET", `/api/expedientes/${expedienteId}`, admin);
  expect(r.status).toBe(200);
  return r.json as never;
}

/** Finaliza la subetapa en curso y verifica su clave. */
async function finalizar(clave: string, esperado = 200): Promise<Respuesta> {
  const d = await detalle();
  expect(d.subetapaActiva?.clave, "subetapa en curso").toBe(clave);
  const r = await llamar("POST", `/api/subetapas/${d.subetapaActiva?.id}/finalizar`, admin, {});
  expect(r.status, `${clave}: ${r.texto}`).toBe(esperado);
  return r;
}

async function subir(token: string, tipo: string, esperado = 201): Promise<Respuesta> {
  const r = await api.post("/api/documentos/upload", {
    headers: { Authorization: `Bearer ${token}` },
    multipart: {
      expedienteId,
      tipo,
      file: { name: `${tipo.toLowerCase()}.pdf`, mimeType: "application/pdf", buffer: PDF },
    },
  });
  const texto = await r.text();
  expect(r.status(), `subir ${tipo}: ${texto}`).toBe(esperado);
  return { status: r.status(), json: JSON.parse(texto) as Json, texto };
}

async function designar(instancia: "TERNA" | "JURADO", dniJurado: string, rol: string) {
  const r = await llamar("POST", `/api/expedientes/${expedienteId}/jurados`, admin, {
    dni: dniJurado,
    nombres: `Miembro ${rol}`,
    apellidos: instancia,
    grado: "MG.",
    rol,
    instancia,
  });
  expect(r.status, r.texto).toBe(201);
  return (r.json as { id: string }).id;
}

async function dictaminar(vinculo: string, dictamen: string, comentario?: string) {
  const r = await llamar(
    "POST",
    `/api/expedientes/${expedienteId}/jurados/${vinculo}/dictamen`,
    admin,
    comentario ? { dictamen, comentario } : { dictamen },
  );
  expect(r.status, r.texto).toBe(200);
}

async function validacion(instancia: string, extra: Record<string, unknown> = {}) {
  const r = await llamar("POST", `/api/expedientes/${expedienteId}/validaciones`, admin, {
    instancia,
    estado: "APROBADO",
    ...extra,
  });
  expect(r.status, r.texto).toBe(200);
  return r.json;
}

function fechaLima(diasDesdeHoy: number): string {
  const d = new Date(Date.now() + diasDesdeHoy * 86_400_000);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

async function mailpitDisponible(): Promise<boolean> {
  try {
    return (await api.get(`${MAILPIT}/api/v1/messages`)).ok();
  } catch {
    return false;
  }
}

async function enlaceActivacion(email: string): Promise<string | null> {
  for (let i = 0; i < 20; i++) {
    const r = await api.get(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}" subject:"Activa"`)}`,
    );
    const lista = (await r.json()) as { messages?: Array<{ ID: string }> };
    const id = lista.messages?.[0]?.ID;
    if (id) {
      const m = (await (await api.get(`${MAILPIT}/api/v1/message/${id}`)).json()) as {
        Text: string;
      };
      const token = /activar\?token=([A-Za-z0-9_\-%]+)/.exec(m.Text)?.[1];
      if (token) return decodeURIComponent(token);
    }
    await new Promise((res) => setTimeout(res, 500));
  }
  return null;
}

test.beforeAll(async ({ playwright, baseURL }) => {
  api = await playwright.request.newContext({ baseURL: baseURL ?? "http://localhost:80" });
  admin = await login("00000001", CLAVE_DEMO);
});

test.afterAll(async () => {
  await api.dispose();
});

test("salud y errores homogéneos (INC-04, INC-02)", async () => {
  expect((await api.get("/api/health")).status()).toBe(200);
  const r = await llamar("GET", "/api/ruta-inexistente", admin);
  expect(r.status).toBe(404);
  expect(r.json.error?.codigo).toBe("RUTA_NO_ENCONTRADA");
  const uuidMalo = await llamar("GET", "/api/documentos/no-es-uuid", admin);
  expect(uuidMalo.status).toBe(404);
});

test("registro: valida programa, identidad y correo (INC-01, INC-02, HU-0019)", async () => {
  const base = {
    modalidad: "TESIS",
    programa: "SEGUNDA ESPECIALIDAD EN INGENIERÍA DE SISTEMAS",
    titulo: "plataforma de prueba de regresión del trámite de titulación",
    participante1: { nombres: "Rosa", apellidos: "Prueba Regresión", dni, email: correo },
  };
  const sinPrograma = await llamar("POST", "/api/expedientes/inscribir-plan", admin, {
    ...base,
    programa: "Seleccione",
  });
  expect(sinPrograma.status).toBe(400);

  const ok = await llamar("POST", "/api/expedientes/inscribir-plan", admin, base);
  expect(ok.status, ok.texto).toBe(201);
  expedienteId = (ok.json as { id: string }).id;

  const correoRepetido = await llamar("POST", "/api/expedientes/inscribir-plan", admin, {
    ...base,
    participante1: { ...base.participante1, dni: `8${sufijo}2`.slice(0, 8), nombres: "Otra" },
  });
  expect(correoRepetido.status).toBe(409);
  expect(correoRepetido.json.error?.codigo).toBe("DATOS_DUPLICADOS");
  expect(correoRepetido.texto).not.toMatch(/insert into|Failed query/i);

  const dniAjeno = await llamar("POST", "/api/expedientes/inscribir-plan", admin, {
    ...base,
    participante1: { ...base.participante1, nombres: "Persona Distinta", email: `x${correo}` },
  });
  expect(dniAjeno.status).toBe(409);
});

test("validación: genera 38 subetapas con claves y envía el acceso", async () => {
  const r = await llamar("POST", `/api/expedientes/${expedienteId}/validar`, admin, {});
  expect(r.status, r.texto).toBe(200);
  const d = await detalle();
  expect(d.estado).toBe("EN_PLAN");
  expect(d.subetapas).toHaveLength(38);
  expect(d.subetapaActiva?.clave).toBe("E1_PRESENTACION_PLAN");
  // Re-validar no duplica el seguimiento.
  await llamar("POST", `/api/expedientes/${expedienteId}/validar`, admin, {});
  expect((await detalle()).subetapas).toHaveLength(38);
});

test("portal del tesista: activación, alcance y RN-06", async () => {
  test.skip(!(await mailpitDisponible()), "Mailpit no disponible");
  const token = await enlaceActivacion(correo);
  expect(token, "correo de activación en Mailpit").not.toBeNull();
  const activar = await api.post("/api/auth/activar", {
    data: { token, password: "Titulo2026" },
  });
  expect(activar.status()).toBe(200);
  const reuso = await api.post("/api/auth/activar", { data: { token, password: "Titulo2026" } });
  expect(reuso.status()).toBe(400);
  tesista = await login(dni, "Titulo2026");

  const lista = await llamar("GET", "/api/expedientes", tesista);
  expect(lista.json.total).toBe(1);
  expect((lista.json.resumen as { total: number }).total).toBe(1); // INC-03

  await subir(tesista, "ANEXO_27", 403); // E2 fuera de la subetapa activa
  for (const tipo of [
    "SOLICITUD_INSCRIPCION",
    "ACEPTACION_ASESORIA",
    "PLAN_ESTRUCTURADO",
    "DJ_CONFIDENCIALIDAD",
    "ANEXO_18",
    "ANEXO_33",
  ]) {
    await subir(tesista, tipo);
  }
  const fin = await llamar(
    "POST",
    `/api/subetapas/${(await detalle()).subetapaActiva?.id}/finalizar`,
    tesista,
    {},
  );
  expect(fin.status).toBe(403); // RN-08: solo el responsable cierra subetapas
});

test("E1: guardas de terna, observación y decreto → PLAN_APROBADO", async () => {
  if (!tesista) {
    for (const tipo of [
      "SOLICITUD_INSCRIPCION",
      "ACEPTACION_ASESORIA",
      "PLAN_ESTRUCTURADO",
      "DJ_CONFIDENCIALIDAD",
      "ANEXO_18",
      "ANEXO_33",
    ]) {
      await subir(admin, tipo);
    }
  }
  await finalizar("E1_PRESENTACION_PLAN");
  await finalizar("E1_VALIDACION_DOCUMENTOS");
  const sinTerna = await finalizar("E1_ASIGNACION_TERNA", 400);
  expect(sinTerna.json.error?.codigo).toBe("JURADO_NO_ASIGNADO");
  const presidente = await designar("TERNA", `6${sufijo}1`.slice(0, 8), "PRESIDENTE");
  const secretario = await designar("TERNA", `6${sufijo}2`.slice(0, 8), "SECRETARIO");
  const vocal = await designar("TERNA", `6${sufijo}3`.slice(0, 8), "VOCAL");
  await finalizar("E1_ASIGNACION_TERNA");
  await finalizar("E1_REVISION_TERNA", 400); // dictámenes pendientes
  await dictaminar(presidente, "FAVORABLE");
  await dictaminar(secretario, "OBSERVADO", "Precisar el objetivo general");
  await dictaminar(vocal, "FAVORABLE");
  const obs = await finalizar("E1_REVISION_TERNA");
  expect(obs.json.estadoExpediente).toBe("OBSERVADO");
  const d = await detalle();
  expect(d.observadoDesde).toBe("EN_PLAN");
  expect(d.mensajes.some((m) => m.texto.includes("Precisar el objetivo general"))).toBe(true);
  await finalizar("E1_LEVANTAMIENTO", 400); // la terna mantiene la observación
  await dictaminar(secretario, "FAVORABLE");
  expect((await finalizar("E1_LEVANTAMIENTO")).json.estadoExpediente).toBe("EN_PLAN");
  await finalizar("E1_DECRETO", 400); // falta N° de decreto
  const patch = await llamar("PATCH", `/api/expedientes/${expedienteId}`, admin, {
    nroDecreto: "015-2026",
  });
  expect(patch.status).toBe(200);
  expect((await finalizar("E1_DECRETO")).json.estadoExpediente).toBe("PLAN_APROBADO");
});

test("generador documental: formatos PDF con campos pendientes", async () => {
  const r = await llamar("POST", `/api/expedientes/${expedienteId}/documentos/generar`, admin, {
    etapa: "E1",
  });
  expect(r.status, r.texto).toBe(200);
  const generados = (
    r.json as { generados: Array<{ id: string; tipo: string; pendientes: string[] }> }
  ).generados;
  expect(generados.length).toBeGreaterThanOrEqual(4);
  const decreto = generados.find((g) => g.tipo === "DECRETO_APROBACION");
  expect(decreto?.pendientes).not.toContain("DECRETO");
  const pdf = await api.get(`/api/documentos-generados/${decreto?.id}/descargar`, {
    headers: { Authorization: `Bearer ${admin}` },
  });
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
});

test("E2–E3: borrador y dictamen de jurados → APTO_SUSTENTACION", async () => {
  for (const tipo of ["ACTA_CONFORMIDAD", "ANEXO_27", "ANEXO_01_DJ", "ANEXO_32_VERACIDAD"]) {
    await subir(admin, tipo);
  }
  expect((await finalizar("E2_CARGA_DOCUMENTOS")).json.estadoExpediente).toBe("EN_BORRADOR");
  await finalizar("E2_REVISION_DOCUMENTAL");
  await finalizar("E2_VALIDACION_EXPEDIENTE");
  await finalizar("E3_RECEPCION");
  const jurados = [
    await designar("JURADO", `5${sufijo}1`.slice(0, 8), "PRESIDENTE"),
    await designar("JURADO", `5${sufijo}2`.slice(0, 8), "SECRETARIO"),
    await designar("JURADO", `5${sufijo}3`.slice(0, 8), "VOCAL"),
  ];
  await finalizar("E3_SORTEO_JURADOS", 400); // falta resolución decanal
  await llamar("PATCH", `/api/expedientes/${expedienteId}`, admin, {
    decanal: "RESOLUCIÓN DECANAL 099-2026",
  });
  expect((await finalizar("E3_SORTEO_JURADOS")).json.estadoExpediente).toBe("EN_DICTAMEN");
  for (const j of jurados) await dictaminar(j, "FAVORABLE");
  await finalizar("E3_REVISION_JURADOS");
  expect((await finalizar("E3_OBSERVACIONES")).json.estadoExpediente).toBe("EN_DICTAMEN");
  await finalizar("E3_LEVANTAMIENTO");
  await finalizar("E3_CONFORMIDAD_FINAL", 400); // falta el acta de dictamen
  await subir(admin, "ACTA_DICTAMEN");
  expect((await finalizar("E3_CONFORMIDAD_FINAL")).json.estadoExpediente).toBe("APTO_SUSTENTACION");
});

test("E4: rango del tesista, programación (7 días), acta → SUSTENTADO → EN_VALIDACION", async () => {
  await finalizar("E4_PROPUESTA_FECHAS", 400); // sin propuesta del tesista (HU-0038)
  const proponer = (desde: number, hasta: number) =>
    llamar("POST", `/api/expedientes/${expedienteId}/sustentacion/propuesta`, tesista, {
      desde: fechaLima(desde),
      hasta: fechaLima(hasta),
    });
  expect((await proponer(10, 10)).status).toBe(400); // RN-05.1: rango, nunca fecha única
  const propuesta = await proponer(2, 14);
  expect(propuesta.status, propuesta.texto).toBe(201);
  expect(propuesta.json.desde).toBe(fechaLima(2));
  await finalizar("E4_PROPUESTA_FECHAS");
  await finalizar("E4_COORDINACION_JURADOS", 400); // sin sustentación programada
  const programar = (dias: number) =>
    llamar("POST", `/api/expedientes/${expedienteId}/sustentacion`, admin, {
      fecha: fechaLima(dias),
      hora: "10:00",
      lugar: "AUDITORIO FIPS",
      modalidad: "PRESENCIAL",
    });
  const fuera = await programar(20);
  expect(fuera.status).toBe(400); // fuera del rango propuesto por el tesista
  expect(fuera.json.error?.mensaje).toContain("rango propuesto");
  expect((await programar(3)).status).toBe(200);
  await finalizar("E4_COORDINACION_JURADOS");
  const pronto = await finalizar("E4_PUBLICACION", 400);
  expect(pronto.json.error?.codigo).toBe("PLAZO_VENCIDO"); // RN-PLZ-04
  expect((await programar(10)).status).toBe(200);
  await finalizar("E4_PUBLICACION");
  await finalizar("E4_VERSION_FINAL", 400);
  await subir(admin, "AUTORIZACION_IMPRESION");
  await finalizar("E4_VERSION_FINAL");
  await finalizar("E4_SUSTENTACION", 400); // sin acta
  const acta = await llamar("POST", `/api/expedientes/${expedienteId}/sustentacion/acta`, admin, {
    veredicto: "UNANIMIDAD",
  });
  expect(acta.status, acta.texto).toBe(200);
  await subir(admin, "ACTA_SUSTENTACION");
  expect((await finalizar("E4_SUSTENTACION")).json.estadoExpediente).toBe("EN_VALIDACION");
});

test("E5: Turnitin ≥ 20 % observa; < 20 % levanta → EN_APROBACION", async () => {
  await validacion("OTI_SIMILITUD", { porcentaje: 25 });
  expect((await detalle()).estado).toBe("OBSERVADO");
  await finalizar("E5_TURNITIN", 400);
  await validacion("OTI_SIMILITUD", { porcentaje: 12 });
  expect((await detalle()).estado).toBe("EN_VALIDACION");
  await finalizar("E5_TURNITIN");
  await finalizar("E5_REVISION_SIMILITUD");
  await finalizar("E5_INFORME_SIMILITUD");
  await finalizar("E5_FIRMA_INFORME");
  await subir(admin, "AUTORIZACION_PUBLICACION");
  await validacion("REPOSITORIO", { detalle: "https://repositorio.unsa.edu.pe/handle/UNSA/qa" });
  await finalizar("E5_REPOSITORIO");
  expect((await finalizar("E5_URL_REPOSITORIO")).json.estadoExpediente).toBe("EN_APROBACION");
});

async function listadoConsejo(
  token: string,
  alcance = "consejo",
): Promise<{ status: number; tipo: string; contenido: string }> {
  const r = await api.get(`/api/reportes/consejo-facultad?alcance=${alcance}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  // ZIP sin compresión: el XML de la hoja viaja como texto plano.
  return {
    status: r.status(),
    tipo: r.headers()["content-type"] ?? "",
    contenido: (await r.body()).toString("utf8"),
  };
}

test("E6: informe para Secretaría (HU-0045) y listado del Consejo (HU-0046)", async () => {
  const informe = await llamar(
    "POST",
    `/api/expedientes/${expedienteId}/documentos/generar`,
    admin,
    {
      etapa: "E6",
    },
  );
  expect(informe.status, informe.texto).toBe(200);
  const generado = (informe.json.generados as Array<{ id: string; pendientes: string[] }>)[0];
  // Jurado, acta, similitud y repositorio ya registrados: solo falta el asesor (no se registró).
  expect(generado?.pendientes).toEqual(["ASESOR"]);
  const pdf = await api.get(`/api/documentos-generados/${generado?.id}/descargar`, {
    headers: { Authorization: `Bearer ${admin}` },
  });
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");

  expect((await listadoConsejo(tesista)).status).toBe(403); // reportes.exportar
  const antes = await listadoConsejo(admin);
  expect(antes.status).toBe(200);
  expect(antes.tipo).toContain("spreadsheetml");
  expect(antes.contenido).not.toContain(dni); // aún no llega a la subetapa del Consejo
  expect((await listadoConsejo(admin, "aprobacion")).contenido).toContain(dni);
});

test("E6–E7: aprobaciones institucionales → TITULO_EMITIDO", async () => {
  const pasos: Array<[string, string | null]> = [
    ["E6_SECRETARIA", "SECRETARIA"],
    ["E6_COMISION", "COMISION"],
    ["E6_CONSEJO_FACULTAD", "CONSEJO_FACULTAD"],
    ["E6_RESOLUCION", "RESOLUCION"],
    ["E6_SISGRAD", "SISGRAD"],
    ["E6_VALIDACION_DATOS", null],
    ["E6_FIRMA_DECANO", "DECANO"],
    ["E6_GRADOS_TITULOS", "GRADOS_TITULOS"],
    ["E6_CONSEJO_UNIVERSITARIO", "CONSEJO_UNIVERSITARIO"],
    ["E7_COLACION", "COLACION"],
    ["E7_EMISION_TITULO", null],
  ];
  for (const [clave, instancia] of pasos) {
    if (clave === "E6_CONSEJO_FACULTAD") {
      const listado = await listadoConsejo(admin);
      expect(listado.contenido).toContain(dni); // RN-07.1: agendado para la sesión
      expect(listado.contenido).toContain("XXX");
    }
    if (instancia) {
      await finalizar(clave, 400); // sin la validación registrada
      await validacion(instancia);
    }
    await finalizar(clave);
  }
  await finalizar("E7_SUNEDU", 400);
  await validacion("SUNEDU");
  expect((await finalizar("E7_SUNEDU")).json.estadoExpediente).toBe("TITULO_EMITIDO");
  const d = await detalle();
  expect(d.avance.pct).toBe(100);
  expect(d.subetapaActiva).toBeNull();
});
