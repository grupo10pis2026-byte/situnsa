import { type APIRequestContext, expect, test } from "@playwright/test";

/**
 * Adenda 1.2 (cambios pedidos por el cliente):
 *  A1 un solo enlace de reunión · A2 horario opcional y grupos por día ·
 *  N1 código de comprobante único · N2 dashboard del taller y su PDF.
 * Requiere el seed demo (TALLER 06). Uso:
 *   E2E_BASE_URL=http://localhost:3101 pnpm --filter pis-e2e test taller-adenda12
 */

const CLAVE = process.env.DEMO_PASSWORD ?? "x";
const ADMIN = "00000001";
const SECRETARIA = "00000002";
const ASESOR = "87654321";
const MARIA = "11223344";
const LUCIA = "33445566";
const JUAN = "44556677";

type Json = Record<string, unknown> & {
  error?: { codigo: string; mensaje: string; detalles?: Array<{ campo: string }> };
};

let api: APIRequestContext;
const tokens: Record<string, string> = {};
const sufijo = String(Date.now()).slice(-6);
let taller06 = "";

async function llamar<T = Json>(
  metodo: "GET" | "POST" | "PATCH" | "DELETE",
  ruta: string,
  quien: string,
  data?: unknown,
): Promise<{ status: number; json: T & Json; tipo: string | null }> {
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
    // binario
  }
  return { status: r.status(), json, tipo: r.headers()["content-type"] ?? null };
}

async function subirComprobante(pensionId: string, quien: string, codigo?: string) {
  const r = await api.fetch(`/api/pensiones-alumno/${pensionId}/comprobante`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokens[quien]}` },
    multipart: {
      ...(codigo !== undefined ? { codigo } : {}),
      file: {
        name: "voucher.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"),
      },
    },
  });
  return { status: r.status(), json: (await r.json().catch(() => ({}))) as Json };
}

async function nuevoAsesor(n: string): Promise<string> {
  const r = await llamar<{ id: string }>("POST", "/api/asesores", ADMIN, {
    dni: `7${sufijo}${n}`.slice(0, 8),
    nombres: `Asesor ${n}`,
    apellidos: `Adenda ${sufijo}`,
    email: `asesor.adenda${n}.${sufijo}@unsa.edu.pe`,
  });
  expect(r.status, JSON.stringify(r.json)).toBe(201);
  return r.json.id;
}

type Detalle = {
  id: string;
  enlaceReunion: string | null;
  enlaceRevisar: boolean;
  conHorario: boolean;
  dias: Array<{ dia: number; horaInicio: string | null; horaFin: string | null }>;
  calendario: Array<{ fecha: string; horaInicio: string | null; horaFin: string | null }>;
  grupos: Array<{ id: string; nombre: string; horario: string; proyectos: number }>;
};

test.beforeAll(async ({ playwright, baseURL }) => {
  api = await playwright.request.newContext({ baseURL: baseURL ?? "http://localhost:80" });
  for (const dni of [ADMIN, SECRETARIA, ASESOR, MARIA, LUCIA, JUAN]) {
    const r = await api.post("/api/auth/login", { data: { identificador: dni, password: CLAVE } });
    expect(r.status(), `login ${dni}`).toBe(200);
    tokens[dni] = ((await r.json()) as { accessToken: string }).accessToken;
  }
  const lista = await llamar<{ items: Array<{ id: string; nombre: string }> }>(
    "GET",
    "/api/talleres",
    ADMIN,
  );
  taller06 = lista.json.items.find((t) => t.nombre === "TALLER 06")?.id ?? "";
  expect(taller06).not.toBe("");
});

test.describe.configure({ mode: "serial" });

test("A1/A2: taller sin horario, un solo enlace; al completar el horario se crea el Grupo A", async () => {
  const asesorId = await nuevoAsesor("1");
  const sinHora = [
    { dia: 6, horaInicio: null, horaFin: null },
    { dia: 7, horaInicio: null, horaFin: null },
  ];
  const sesiones = [
    { fecha: "2027-05-01", horaInicio: null, horaFin: null },
    { fecha: "2027-05-02", horaInicio: null, horaFin: null },
  ];
  const base = {
    nombre: `TALLER ADENDA ${sufijo}`,
    periodo: "2027-I",
    inicio: "2027-05-01",
    fin: "2027-07-25",
    numeroSesiones: 2,
    dias: sinHora,
    cupoProyectos: 10,
    enlaceReunion: "https://meet.google.com/adenda-unico",
    pensiones: { montos: [1000, 1000, 1000], fecha2: "2027-05-29", fecha3: "2027-06-26" },
    sesiones,
  };
  // Horario a medias: todo o nada.
  const medias = await llamar("POST", "/api/talleres", ADMIN, {
    ...base,
    asesorId,
    dias: [sinHora[0], { dia: 7, horaInicio: "08:00", horaFin: "13:00" }],
  });
  expect(medias.status).toBe(400);
  expect(medias.json.error?.detalles?.map((d) => d.campo)).toContain("horario");

  const c = await llamar<Detalle>("POST", "/api/talleres", ADMIN, { ...base, asesorId });
  expect(c.status, JSON.stringify(c.json)).toBe(201);
  expect(c.json).toMatchObject({
    enlaceReunion: "https://meet.google.com/adenda-unico",
    enlaceRevisar: false,
    conHorario: false,
  });
  expect(c.json.grupos).toHaveLength(0);
  expect(c.json.calendario.every((s) => s.horaInicio === null)).toBe(true);

  // Se completa el horario después: las sesiones toman su hora y nace el Grupo A.
  const e = await llamar<Detalle>("PATCH", `/api/talleres/${c.json.id}`, ADMIN, {
    ...base,
    dias: [
      { dia: 6, horaInicio: "15:00", horaFin: "20:00" },
      { dia: 7, horaInicio: "08:00", horaFin: "13:00" },
    ],
  });
  expect(e.status, JSON.stringify(e.json)).toBe(200);
  expect(e.json.conHorario).toBe(true);
  expect(e.json.calendario.map((s) => `${s.horaInicio}-${s.horaFin}`)).toEqual([
    "15:00-20:00",
    "08:00-13:00",
  ]);
  expect(e.json.grupos.map((g) => g.nombre)).toEqual(["Grupo A"]);
  expect(e.json.grupos[0]?.horario).toContain("15:00");
});

test("A2: el asesor arma grupos con horario por día dentro del bloque de cada día", async () => {
  const s = await llamar<{
    puedeGrupos: boolean;
    nombreSugerido: string;
    grupos: Array<{ id: string; nombre: string; horario: string }>;
  }>("GET", `/api/talleres/${taller06}/sesiones`, ASESOR);
  expect(s.status).toBe(200);
  expect(s.json.puedeGrupos).toBe(true);
  expect(s.json.nombreSugerido).toMatch(/^Grupo [C-Z]$/);
  const nombre = s.json.nombreSugerido;

  const fuera = await llamar("POST", `/api/talleres/${taller06}/grupos`, ASESOR, {
    nombre,
    horarios: [
      { dia: 6, horaInicio: "14:00", horaFin: "16:00" },
      { dia: 7, horaInicio: "08:00", horaFin: "09:00" },
    ],
    proyectoIds: [],
  });
  expect(fuera.status).toBe(400);
  expect(fuera.json.error?.detalles?.map((d) => d.campo)).toContain("horario.6");

  const ok = await llamar<{ grupos: Array<{ id: string; nombre: string; horario: string }> }>(
    "POST",
    `/api/talleres/${taller06}/grupos`,
    ASESOR,
    {
      nombre,
      horarios: [
        { dia: 6, horaInicio: "15:00", horaFin: "16:00" },
        { dia: 7, horaInicio: "08:00", horaFin: "09:30" },
      ],
      proyectoIds: [],
    },
  );
  expect(ok.status, JSON.stringify(ok.json)).toBe(201);
  const c = ok.json.grupos.find((g) => g.nombre === nombre);
  expect(c?.horario).toBe("Sáb 15:00–16:00 · Dom 08:00–09:30");
  // La Secretaría ve los grupos pero no los arma.
  const sec = await llamar<{ puedeGrupos: boolean }>(
    "GET",
    `/api/talleres/${taller06}/sesiones`,
    SECRETARIA,
  );
  expect(sec.json.puedeGrupos).toBe(false);
  expect((await llamar("DELETE", `/api/grupos/${c?.id}`, ASESOR, {})).status).toBe(200);
});

test("A1: el alumno ve el único enlace en Mi Taller", async () => {
  const mt = await llamar<{ proximaSesion: { enlace: string | null } | null }>(
    "GET",
    "/api/mi-taller",
    MARIA,
  );
  expect(mt.status).toBe(200);
  if (mt.json.proximaSesion) expect(mt.json.proximaSesion.enlace).toMatch(/^https:\/\//);
});

type MisPagos = { pensiones: Array<{ id: string; numero: number; estado: string }> };
type Pagos = {
  items: Array<{
    id: string;
    dni: string;
    numero: number;
    estado: string;
    diasAtraso: number;
    comprobante: { id: string; codigo: string | null } | null;
  }>;
};

test("N1: el código del comprobante es obligatorio y no se repite; el admin lo corrige con motivo", async () => {
  const codigo = `OP-${sufijo}-01`;
  const lucia3 = (await llamar<MisPagos>("GET", "/api/mis-pagos", LUCIA)).json.pensiones.find(
    (p) => p.numero === 3,
  );
  const juan3 = (await llamar<MisPagos>("GET", "/api/mis-pagos", JUAN)).json.pensiones.find(
    (p) => p.numero === 3,
  );
  expect(lucia3 && juan3).toBeTruthy();

  const sinCodigo = await subirComprobante(lucia3?.id ?? "", LUCIA);
  expect(sinCodigo.status).toBe(400);
  const up = await subirComprobante(lucia3?.id ?? "", LUCIA, codigo);
  expect(up.status, JSON.stringify(up.json)).toBe(201);

  // Mismo código con otro formato (espacios, minúsculas) = repetido.
  const dup = await subirComprobante(juan3?.id ?? "", JUAN, ` op-${sufijo}-01 `);
  expect(dup.status).toBe(409);
  expect(dup.json.error?.mensaje).toBe(
    "Este código de comprobante ya fue registrado. Revisa que sea el correcto",
  );

  const lista = await llamar<Pagos>("GET", "/api/pagos-taller", ADMIN);
  const fila = lista.json.items.find((p) => p.id === lucia3?.id);
  expect(fila?.comprobante?.codigo).toBe(codigo);
  const ruta = `/api/comprobantes/${fila?.comprobante?.id}/codigo`;

  // Corrección: motivo obligatorio; el alumno no corrige.
  expect((await llamar("PATCH", ruta, ADMIN, { codigo: `${codigo}X`, motivo: "" })).status).toBe(
    400,
  );
  expect(
    (await llamar("PATCH", ruta, LUCIA, { codigo: `${codigo}X`, motivo: "tipeo" })).status,
  ).toBe(403);
  const corr = await llamar<{ comprobante: { codigo: string } }>("PATCH", ruta, ADMIN, {
    codigo: `${codigo}-B`,
    motivo: "La alumna escribió mal el número de operación",
  });
  expect(corr.status, JSON.stringify(corr.json)).toBe(200);
  expect(corr.json.comprobante.codigo).toBe(`${codigo}-B`);

  // Con el código corregido, el original queda libre.
  const juan = await subirComprobante(juan3?.id ?? "", JUAN, codigo);
  expect(juan.status, JSON.stringify(juan.json)).toBe(201);
  // Y no se puede corregir hacia un código en uso.
  expect(
    (await llamar("PATCH", ruta, ADMIN, { codigo, motivo: "Prueba de duplicado" })).status,
  ).toBe(409);
});

type Dashboard = {
  titulo: string;
  inscripcion: { proyectos: number; cupo: number };
  pensiones: { vencidas: { cantidad: number } };
  asistencia: { alumnosConFaltas: unknown[] };
  comparacion: Array<{ tallerId: string }>;
  opciones: { grupos: Array<{ id: string }> };
};

test("N2: dashboard solo para Secretaría, Dirección y Administrador; mismos números que P3/P9", async () => {
  expect((await llamar("GET", "/api/dashboard-taller", ASESOR)).status).toBe(403);
  expect((await llamar("GET", "/api/dashboard-taller", MARIA)).status).toBe(403);
  expect((await llamar("GET", "/api/dashboard-taller/pdf", ASESOR)).status).toBe(403);

  const todos = await llamar<Dashboard>("GET", "/api/dashboard-taller", SECRETARIA);
  expect(todos.status, JSON.stringify(todos.json)).toBe(200);
  expect(todos.json.titulo).toBe("Todos los talleres");
  expect(todos.json.comparacion.some((t) => t.tallerId === taller06)).toBe(true);
  // La vista de todos no lista datos personales.
  expect(todos.json.asistencia.alumnosConFaltas).toEqual([]);

  const uno = await llamar<Dashboard>("GET", `/api/dashboard-taller?tallerId=${taller06}`, ADMIN);
  expect(uno.status).toBe(200);
  expect(uno.json.titulo).toBe("TALLER 06");
  const detalle = await llamar<{ proyectos: number; cupoProyectos: number }>(
    "GET",
    `/api/talleres/${taller06}`,
    ADMIN,
  );
  expect(uno.json.inscripcion).toMatchObject({
    proyectos: detalle.json.proyectos,
    cupo: detalle.json.cupoProyectos,
  });
  const deudas = await llamar<Pagos>(
    "GET",
    `/api/pagos-taller?tallerId=${taller06}&deudores=true`,
    ADMIN,
  );
  expect(uno.json.pensiones.vencidas.cantidad).toBe(deudas.json.items.length);

  const grupo = uno.json.opciones.grupos[0]?.id;
  if (grupo) {
    const g = await llamar(
      "GET",
      `/api/dashboard-taller?tallerId=${taller06}&grupoId=${grupo}`,
      ADMIN,
    );
    expect(g.status).toBe(200);
  }

  const pdf = await llamar("GET", `/api/dashboard-taller/pdf?tallerId=${taller06}`, SECRETARIA);
  expect(pdf.status).toBe(200);
  expect(pdf.tipo).toContain("application/pdf");
});
