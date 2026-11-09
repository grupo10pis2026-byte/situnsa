import { type APIRequestContext, expect, test } from "@playwright/test";

/**
 * Seguimiento del taller (spec v1.0 §9 P6–P14, §10 D3) contra Postgres real
 * con el seed demo TALLER 06: revisión del plan y aprobación (crea el
 * expediente), alcance del alumno, pagos (comprobante, observación, pago
 * directo), ficha, retiro desde una alerta, encuesta anónima y reportes.
 *
 * El seed se modifica: correr sobre una base recién sembrada.
 * Uso: E2E_BASE_URL=http://localhost:3001 pnpm --filter pis-e2e test taller-seguimiento
 */

const CLAVE = process.env.DEMO_PASSWORD ?? "x";
const MARIA = "11223344";
const CARLOS = "22334455";
const LUCIA = "33445566";
const ASESOR = "87654321";

test.describe.configure({ mode: "serial" });

type Json = Record<string, unknown> & { error?: { codigo: string; mensaje: string } };

let api: APIRequestContext;
const tokens: Record<string, string> = {};
let tallerId = "";
let p01 = "";

async function llamar<T = Json>(
  metodo: "GET" | "POST" | "PUT" | "PATCH",
  ruta: string,
  quien: string,
  data?: unknown,
): Promise<{ status: number; json: T & Json }> {
  const r = await api.fetch(ruta, {
    method: metodo,
    headers: { Authorization: `Bearer ${tokens[quien]}` },
    ...(data !== undefined ? { data } : {}),
  });
  const texto = await r.text();
  let json = {} as T & Json;
  try {
    json = JSON.parse(texto) as T & Json;
  } catch {
    // binario o vacío
  }
  return { status: r.status(), json };
}

async function login(dni: string): Promise<void> {
  const r = await api.post("/api/auth/login", { data: { identificador: dni, password: CLAVE } });
  expect(r.status(), `login ${dni}`).toBe(200);
  tokens[dni] = ((await r.json()) as { accessToken: string }).accessToken;
}

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

async function subir(ruta: string, quien: string, campos: Record<string, string> = {}) {
  const r = await api.fetch(ruta, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokens[quien]}` },
    multipart: {
      ...campos,
      file: { name: "documento.pdf", mimeType: "application/pdf", buffer: PDF },
    },
  });
  return { status: r.status(), json: (await r.json().catch(() => ({}))) as Json };
}

type Entregas = {
  proyecto: { expedienteCodigo: string | null; tesistas: Array<{ dni: string; estado: string }> };
  hitos: Array<{
    id: string;
    tipo: string;
    estado: string;
    versionesDetalle: Array<{ id: string; estado: string }>;
  }>;
};

test.beforeAll(async ({ playwright, baseURL }) => {
  api = await playwright.request.newContext({ baseURL: baseURL ?? "http://localhost:80" });
  for (const d of ["00000001", "00000002", ASESOR, MARIA, CARLOS, LUCIA]) await login(d);
  const mt = await llamar<{ taller: { id: string }; proyecto: { id: string; codigo: string } }>(
    "GET",
    "/api/mi-taller",
    MARIA,
  );
  expect(mt.status).toBe(200);
  tallerId = mt.json.taller.id;
  p01 = mt.json.proyecto.id;
  expect(mt.json.proyecto.codigo).toBe("P-01");
});

test("P6 plan y matriz: el asesor edita, el alumno solo lee", async () => {
  const plan = await llamar<{ semanas: unknown[]; editable: boolean }>(
    "GET",
    `/api/talleres/${tallerId}/plan`,
    MARIA,
  );
  expect(plan.status).toBe(200);
  expect(plan.json.semanas).toHaveLength(12);
  expect(plan.json.editable).toBe(false);
  const editar = await llamar("PATCH", `/api/talleres/${tallerId}/plan/3`, MARIA, {
    contenido: "x",
  });
  expect(editar.status).toBe(403);
  const ok = await llamar("PATCH", `/api/talleres/${tallerId}/plan/3`, ASESOR, {
    contenido: "Marco teórico y antecedentes (E2E)",
    indicaciones: "Traer 5 fuentes",
  });
  expect(ok.status, JSON.stringify(ok.json)).toBe(200);
  const m = await llamar<{ proyectos: Array<{ hitos: unknown[] }> }>(
    "GET",
    `/api/talleres/${tallerId}/hitos`,
    ASESOR,
  );
  expect(m.status).toBe(200);
  expect(m.json.proyectos.every((p) => p.hitos.length === 7)).toBe(true);
  // §4 el alumno no ve la matriz del taller (solo lo suyo).
  expect((await llamar("GET", `/api/talleres/${tallerId}/hitos`, MARIA)).status).toBe(403);
});

test("P6b revisar + D3 aprobar plan: crea el expediente y pasa a PLAN_APROBADO (#16, #17)", async () => {
  const e = await llamar<Entregas>("GET", `/api/proyectos/${p01}/entregas`, ASESOR);
  const plan = e.json.hitos.find((h) => h.tipo === "PLAN");
  const ultima = plan?.versionesDetalle[0];
  expect(plan?.estado).toBe("ENTREGADO");
  // El alumno no revisa.
  expect(
    (await llamar("POST", `/api/entregas/${ultima?.id}/revisar`, MARIA, { resultado: "CONFORME" }))
      .status,
  ).toBe(403);
  // Observar exige observaciones.
  const sinObs = await llamar("POST", `/api/entregas/${ultima?.id}/revisar`, ASESOR, {
    resultado: "OBSERVADA",
  });
  expect(sinObs.status).toBe(400);
  const rev = await llamar<Entregas>("POST", `/api/entregas/${ultima?.id}/revisar`, ASESOR, {
    resultado: "CONFORME",
  });
  expect(rev.status, JSON.stringify(rev.json)).toBe(200);
  // Conforme no aprueba el plan.
  expect(rev.json.hitos.find((h) => h.tipo === "PLAN")?.estado).toBe("ENTREGADO");

  const previa = await llamar<{ puede: boolean; titulo: string | null }>(
    "GET",
    `/api/proyectos/${p01}/aprobar-plan`,
    ASESOR,
  );
  expect(previa.status).toBe(200);
  expect(previa.json.puede).toBe(true);
  const corto = await llamar("POST", `/api/proyectos/${p01}/aprobar-plan`, ASESOR, {
    titulo: "corto",
    programa: "SEGUNDA ESPECIALIDAD EN INGENIERÍA DE SISTEMAS",
    modalidad: "TESIS",
  });
  expect(corto.status).toBe(400);
  const ap = await llamar<Entregas>("POST", `/api/proyectos/${p01}/aprobar-plan`, ASESOR, {
    titulo: previa.json.titulo ?? "Sistema de gestión del taller de tesis de la FIPS",
    programa: "SEGUNDA ESPECIALIDAD EN INGENIERÍA DE SISTEMAS",
    modalidad: "TESIS",
  });
  expect(ap.status, JSON.stringify(ap.json)).toBe(200);
  expect(ap.json.proyecto.expedienteCodigo).toMatch(/^SET\d+$/);
  expect(ap.json.hitos.find((h) => h.tipo === "PLAN")?.estado).toBe("APROBADO");
  expect(ap.json.proyecto.tesistas.every((t) => t.estado === "PLAN_APROBADO")).toBe(true);
  // No se aprueba dos veces.
  const otra = await llamar("POST", `/api/proyectos/${p01}/aprobar-plan`, ASESOR, {
    titulo: "Sistema de gestión del taller de tesis de la FIPS",
    programa: "SEGUNDA ESPECIALIDAD EN INGENIERÍA DE SISTEMAS",
    modalidad: "TESIS",
  });
  expect(otra.status).toBe(400);
});

test("P7 habilitar avance 1 y el alumno sube una versión; otro alumno no (#12–#15)", async () => {
  const e = await llamar<Entregas>("GET", `/api/proyectos/${p01}/entregas`, ASESOR);
  const av1 = e.json.hitos.find((h) => h.tipo === "AVANCE_1");
  expect(av1?.estado).toBe("NO_HABILITADO");
  // Subir antes de habilitar falla.
  expect((await subir(`/api/hitos/${av1?.id}/entregas`, MARIA)).status).toBe(400);
  const hab = await llamar("POST", `/api/hitos/${av1?.id}/habilitar`, ASESOR, {});
  expect(hab.status, JSON.stringify(hab.json)).toBe(200);
  // P6b el asesor ajusta la fecha (hito no fijo): la prueba no depende del día en que corre.
  const enDosSemanas = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  const fecha = await llamar("PATCH", `/api/hitos/${av1?.id}/fecha`, ASESOR, {
    fechaLimite: enDosSemanas,
  });
  expect(fecha.status, JSON.stringify(fecha.json)).toBe(200);
  // Carlos no es del proyecto.
  expect((await subir(`/api/hitos/${av1?.id}/entregas`, CARLOS)).status).toBe(403);
  const s = await subir(`/api/hitos/${av1?.id}/entregas`, MARIA, { comentario: "Primera versión" });
  expect(s.status, JSON.stringify(s.json)).toBe(201);
  const d = s.json as unknown as Entregas;
  const h = d.hitos.find((x) => x.tipo === "AVANCE_1");
  expect(h?.estado).toBe("ENTREGADO");
  expect(h?.versionesDetalle).toHaveLength(1);
  // La fecha del plan (semana 2) es fija.
  const plan = d.hitos.find((x) => x.tipo === "PLAN");
  expect(
    (await llamar("PATCH", `/api/hitos/${plan?.id}/fecha`, ASESOR, { fechaLimite: "2099-01-01" }))
      .status,
  ).toBe(400);
  // Descarga protegida.
  const dl = await api.fetch(`/api/entregas/${h?.versionesDetalle[0]?.id}/archivo`, {
    headers: { Authorization: `Bearer ${tokens[CARLOS]}` },
  });
  expect(dl.status()).toBe(403);
});

type Pagos = {
  items: Array<{
    id: string;
    dni: string;
    numero: number;
    estado: string;
    comprobante: { id: string } | null;
    diasAtraso: number;
  }>;
};

test("P8/P9 pagos: validar, observar con motivo, subir de nuevo y pago directo (#20, #21)", async () => {
  const lista = await llamar<Pagos>("GET", `/api/pagos-taller?tallerId=${tallerId}`, "00000001");
  expect(lista.status).toBe(200);
  // El alumno no ve P9.
  expect((await llamar("GET", "/api/pagos-taller", MARIA)).status).toBe(403);
  const maria2 = lista.json.items.find((p) => p.dni === MARIA && p.numero === 2);
  expect(maria2?.estado).toBe("EN_REVISION");
  const sinMotivo = await llamar(
    "POST",
    `/api/comprobantes/${maria2?.comprobante?.id}/observar`,
    "00000001",
    { motivo: " " },
  );
  expect(sinMotivo.status).toBe(400);
  const val = await llamar<{ estado: string }>(
    "POST",
    `/api/comprobantes/${maria2?.comprobante?.id}/validar`,
    "00000001",
    {},
  );
  expect(val.status, JSON.stringify(val.json)).toBe(200);
  expect(val.json.estado).toBe("VALIDADA");

  // Carlos: su 2.ª está OBSERVADA → sube otro comprobante.
  const mis = await llamar<{ pensiones: Array<{ id: string; numero: number; estado: string }> }>(
    "GET",
    "/api/mis-pagos",
    CARLOS,
  );
  const c2 = mis.json.pensiones.find((p) => p.numero === 2);
  expect(c2?.estado).toBe("OBSERVADA");
  const up = await subir(`/api/pensiones-alumno/${c2?.id}/comprobante`, CARLOS);
  expect(up.status, JSON.stringify(up.json)).toBe(201);
  // María no puede subir el comprobante de Carlos.
  expect((await subir(`/api/pensiones-alumno/${c2?.id}/comprobante`, MARIA)).status).toBe(403);

  const lucia = (
    await llamar<Pagos>("GET", `/api/pagos-taller?tallerId=${tallerId}&deudores=true`, "00000001")
  ).json.items.find((p) => p.dni === LUCIA && p.estado !== "VALIDADA");
  expect(lucia).toBeTruthy();
  const directo = await llamar<{ estado: string }>(
    "POST",
    `/api/pensiones-alumno/${lucia?.id}/pago-directo`,
    "00000001",
    {
      observacion: "Pagó en caja",
    },
  );
  expect(directo.status, JSON.stringify(directo.json)).toBe(200);
  expect(directo.json.estado).toBe("VALIDADA");
});

test("P11 ficha: registrar, subir firmada y modificar firmada exige motivo (#18)", async () => {
  const f = await llamar<{ filas: Array<{ id: string; semana: number; estado: string }> }>(
    "GET",
    `/api/proyectos/${p01}/ficha`,
    ASESOR,
  );
  expect(f.status).toBe(200);
  expect(f.json.filas).toHaveLength(6);
  const s2 = f.json.filas.find((x) => x.semana === 2);
  expect(s2?.estado).toBe("REVISADO");
  const firm = await subir(`/api/proyectos/${p01}/ficha/firmada`, ASESOR, { semanas: "2" });
  expect(firm.status, JSON.stringify(firm.json)).toBe(201);
  const sinMotivo = await llamar("PUT", `/api/ficha/${s2?.id}`, ASESOR, {
    fecha: "2026-10-25",
    observacionesAcuerdos: "Cambio",
  });
  expect(sinMotivo.status).toBe(400);
  const conMotivo = await llamar("PUT", `/api/ficha/${s2?.id}`, ASESOR, {
    fecha: "2026-10-25",
    observacionesAcuerdos: "Cambio",
    motivo: "Corrección de la fecha",
  });
  expect(conMotivo.status).toBe(200);
  // El alumno no registra la ficha.
  expect(
    (
      await llamar("PUT", `/api/ficha/${s2?.id}`, MARIA, {
        fecha: "2026-10-25",
        observacionesAcuerdos: "x",
      })
    ).status,
  ).toBe(403);
  // El cierre aún no se puede emitir.
  const k = await llamar<{ motivoNoEmitir: string | null }>(
    "GET",
    `/api/proyectos/${p01}/cierre`,
    ASESOR,
  );
  expect(k.json.motivoNoEmitir).not.toBeNull();
});

test("P12 alerta de faltas → registrar retiro deja al alumno RETIRADO (#22)", async () => {
  const al = await llamar<{
    items: Array<{
      id: string;
      tipo: string;
      alumnoId: string | null;
      tallerId: string;
      alumno: string | null;
    }>;
  }>("GET", `/api/alertas-taller?tallerId=${tallerId}&estado=ACTIVA`, "00000001");
  expect(al.status).toBe(200);
  const faltas = al.json.items.find((a) => a.tipo === "FALTAS_CONSECUTIVAS");
  expect(faltas?.alumnoId).toBeTruthy();
  const retiro = {
    alumnoId: faltas?.alumnoId,
    motivo: "Dos faltas consecutivas sin justificar",
    fecha: "2026-11-08",
    alertaId: faltas?.id,
  };
  // §4 el retiro es de la Secretaría, no del asesor.
  expect((await llamar("POST", `/api/talleres/${tallerId}/retiros`, ASESOR, retiro)).status).toBe(
    403,
  );
  const r = await llamar("POST", `/api/talleres/${tallerId}/retiros`, "00000001", retiro);
  expect(r.status, JSON.stringify(r.json)).toBe(201);
  const mt = await llamar<{ estadoTesista: string }>("GET", "/api/mi-taller", LUCIA);
  expect(mt.json.estadoTesista).toBe("RETIRADO");
  const rep = await api.fetch(`/api/talleres/${tallerId}/reportes/PLAN?formato=xlsx`, {
    headers: { Authorization: `Bearer ${tokens["00000001"]}` },
  });
  expect(rep.status()).toBe(200);
  expect(rep.headers()["content-type"]).toContain("spreadsheet");
});

test("P14 encuesta anónima: una sola respuesta; resultados ocultos bajo el mínimo (#23)", async () => {
  const e = await llamar<{ disponible: boolean; preguntas: Array<{ id: string }> }>(
    "GET",
    "/api/encuesta",
    MARIA,
  );
  expect(e.status).toBe(200);
  expect(e.json.disponible).toBe(true);
  const body = {
    puntajes: e.json.preguntas.map((p) => ({ preguntaId: p.id, puntaje: 4 })),
    comentario: "Muy claro",
  };
  expect((await llamar("POST", "/api/encuesta", MARIA, body)).status).toBe(201);
  expect((await llamar("POST", "/api/encuesta", MARIA, body)).status).toBe(400);
  // Retirada: no participa.
  expect((await llamar("POST", "/api/encuesta", LUCIA, body)).status).toBe(400);
  const res = await llamar<{
    items: Array<{ respuestas: number; visibles: boolean; comentarios: string[] }>;
  }>("GET", "/api/encuestas/resultados", ASESOR);
  expect(res.status).toBe(200);
  const mio = res.json.items[0];
  expect(mio?.respuestas).toBeGreaterThanOrEqual(1);
  expect(mio?.visibles).toBe(false);
  expect(mio?.comentarios).toHaveLength(0);
  expect((await llamar("GET", "/api/encuestas/resultados", MARIA)).status).toBe(403);
});

test("P13 cierre completo: avances, ficha firmada, borrador final e informe → ASESORIA_CERRADA y acta en el expediente (#18, #19)", async () => {
  const enDosSemanas = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  const entregas = async () =>
    (
      await llamar<Entregas & { proyecto: { expedienteId: string | null } }>(
        "GET",
        `/api/proyectos/${p01}/entregas`,
        ASESOR,
      )
    ).json;
  const hito = async (tipo: string) => {
    const h = (await entregas()).hitos.find((x) => x.tipo === tipo);
    if (!h) throw new Error(`sin hito ${tipo}`);
    return h;
  };

  // Avances 1–4 y borrador integrado: habilitar, prorrogar, subir y dar conformidad.
  for (const tipo of ["AVANCE_1", "AVANCE_2", "AVANCE_3", "AVANCE_4", "BORRADOR_INTEGRADO"]) {
    let h = await hito(tipo);
    if (h.estado === "NO_HABILITADO")
      expect((await llamar("POST", `/api/hitos/${h.id}/habilitar`, ASESOR, {})).status, tipo).toBe(
        200,
      );
    h = await hito(tipo);
    if (h.estado === "HABILITADO") {
      expect(
        (await llamar("PATCH", `/api/hitos/${h.id}/fecha`, ASESOR, { fechaLimite: enDosSemanas }))
          .status,
      ).toBe(200);
      expect((await subir(`/api/hitos/${h.id}/entregas`, MARIA)).status, tipo).toBe(201);
      h = await hito(tipo);
    }
    const ultima = h.versionesDetalle[0];
    const rev = await llamar("POST", `/api/entregas/${ultima?.id}/revisar`, ASESOR, {
      resultado: "CONFORME",
    });
    expect(rev.status, `${tipo} ${JSON.stringify(rev.json)}`).toBe(200);
    expect((await hito(tipo)).estado).toBe("APROBADO");
  }

  // El borrador final exige la ficha completa y firmada (#18).
  const final = await hito("BORRADOR_FINAL");
  expect((await llamar("POST", `/api/hitos/${final.id}/habilitar`, ASESOR, {})).status).toBe(200);
  expect((await subir(`/api/hitos/${final.id}/entregas`, MARIA)).status).toBe(400);

  const ficha = await llamar<{ filas: Array<{ id: string; semana: number; estado: string }> }>(
    "GET",
    `/api/proyectos/${p01}/ficha`,
    ASESOR,
  );
  for (const f of ficha.json.filas.filter((x) => x.estado === "SIN_REVISION"))
    expect(
      (
        await llamar("PUT", `/api/ficha/${f.id}`, ASESOR, {
          fecha: "2026-12-20",
          observacionesAcuerdos: "Revisión del borrador final",
        })
      ).status,
    ).toBe(200);
  const firmada = await subir(`/api/proyectos/${p01}/ficha/firmada`, ASESOR, {
    semanas: ficha.json.filas
      .filter((x) => x.estado !== "FIRMADO")
      .map((x) => x.semana)
      .join(","),
  });
  expect(firmada.status, JSON.stringify(firmada.json)).toBe(201);
  expect((await subir(`/api/hitos/${final.id}/entregas`, MARIA)).status).toBe(201);

  // Sin observaciones levantadas no se emite el informe (#19).
  const sinLevantar = await api.fetch(`/api/proyectos/${p01}/cierre/informe`, {
    headers: { Authorization: `Bearer ${tokens[ASESOR]}` },
  });
  expect(sinLevantar.status()).toBe(400);
  const datos = await llamar<{ motivoNoEmitir: string | null }>(
    "PATCH",
    `/api/proyectos/${p01}/cierre`,
    ASESOR,
    {
      similitudPreliminar: 12.5,
      observacionesLevantadas: true,
    },
  );
  expect(datos.status).toBe(200);
  expect(datos.json.motivoNoEmitir).toBeNull();
  const informe = await api.fetch(`/api/proyectos/${p01}/cierre/informe`, {
    headers: { Authorization: `Bearer ${tokens[ASESOR]}` },
  });
  expect(informe.status()).toBe(200);
  expect(informe.headers()["content-type"]).toContain("application/pdf");

  const cierre = await subir(`/api/proyectos/${p01}/cierre/firmado`, ASESOR);
  expect(cierre.status, JSON.stringify(cierre.json)).toBe(201);
  const e = await entregas();
  expect(e.proyecto.tesistas.every((t) => t.estado === "ASESORIA_CERRADA")).toBe(true);

  // El Anexo 21 firmado queda como Acta de conformidad del expediente.
  const exp = await llamar<{ checklist: Array<{ tipo: string; estado: string }> }>(
    "GET",
    `/api/expedientes/${e.proyecto.expedienteId}`,
    "00000001",
  );
  expect(exp.status).toBe(200);
  expect(exp.json.checklist.find((c) => c.tipo === "ACTA_CONFORMIDAD")?.estado).toBe("CARGADO");
});
