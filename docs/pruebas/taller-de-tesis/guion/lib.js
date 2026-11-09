// Utilidades del guion de pruebas del Taller de Tesis (QA manual automatizado).
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(__dirname, "../../../../e2e/node_modules/@playwright/test"));

const WEB = "http://localhost:5173";
const API = "http://localhost:3001";
const MAILPIT = "http://localhost:8025";
const DIR = path.join(__dirname, ".."); // docs/pruebas/taller-de-tesis
const CAPT = path.join(DIR, "capturas");
const QA = __dirname;
const RES = path.join(QA, "resultados.json");
const EST = path.join(QA, "estado.json");
fs.mkdirSync(CAPT, { recursive: true });

const leer = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : d);
const estado = leer(EST, {});
const guardarEstado = () => fs.writeFileSync(EST, JSON.stringify(estado, null, 2));

/** Registra (o reemplaza) el resultado de un caso de prueba. */
function registrar(caso) {
  const lista = leer(RES, []);
  const i = lista.findIndex((c) => c.id === caso.id);
  const fila = { capturas: [], ...caso, fecha: new Date().toISOString() };
  if (i >= 0) lista[i] = fila;
  else lista.push(fila);
  fs.writeFileSync(RES, JSON.stringify(lista, null, 2));
  console.log(`${fila.estado.padEnd(9)} ${fila.id} ${fila.titulo}`);
}

let nCap = leer(path.join(QA, "ncap.json"), { n: 0 }).n;
/** Captura de pantalla numerada; devuelve el nombre del archivo. */
async function captura(page, nombre, opciones = {}) {
  nCap += 1;
  fs.writeFileSync(path.join(QA, "ncap.json"), JSON.stringify({ n: nCap }));
  const archivo = `${String(nCap).padStart(3, "0")}-${nombre}.png`;
  await page.waitForTimeout(opciones.espera ?? 600);
  await page.screenshot({ path: path.join(CAPT, archivo), fullPage: opciones.completa ?? false });
  return archivo;
}

async function abrirNavegador() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 860 }, locale: "es-PE" });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  return { browser, context, page };
}

/** Entra con un usuario (cierra antes cualquier sesión). */
async function entrar(page, dni, clave = "x") {
  await page.context().clearCookies();
  await page.goto(`${WEB}/login`);
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(`${WEB}/login`);
  await page.getByPlaceholder("DNI, CUI o correo").fill(dni);
  await page.getByPlaceholder("Ingrese su contraseña").fill(clave);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  await page.waitForTimeout(700);
}

// ── API ────────────────────────────────────────────────────────────────
const tokens = {};
async function token(dni, clave = "x") {
  if (tokens[dni]) return tokens[dni];
  const r = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identificador: dni, password: clave }),
  });
  if (!r.ok) throw new Error(`login ${dni}: ${r.status}`);
  tokens[dni] = (await r.json()).accessToken;
  return tokens[dni];
}

async function api(metodo, ruta, quien, cuerpo) {
  const r = await fetch(`${API}${ruta}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${await token(quien.dni ?? quien, quien.clave)}`,
      ...(cuerpo !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo) } : {}),
  });
  const texto = await r.text();
  let json = null;
  try {
    json = JSON.parse(texto);
  } catch {}
  return { status: r.status, json, texto };
}

/** Subida multipart (entregas, comprobantes, ficha, informe). */
async function subir(ruta, quien, archivo, campos = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.append(k, v);
  fd.append("file", new Blob([fs.readFileSync(archivo.ruta)], { type: archivo.mime }), archivo.nombre);
  const r = await fetch(`${API}${ruta}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await token(quien.dni ?? quien, quien.clave)}` },
    body: fd,
  });
  const texto = await r.text();
  let json = null;
  try {
    json = JSON.parse(texto);
  } catch {}
  return { status: r.status, json, texto };
}

async function correos(filtro) {
  const r = filtro
    ? await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(filtro)}&limit=500`)
    : await fetch(`${MAILPIT}/api/v1/messages?limit=500`);
  return (await r.json()).messages ?? [];
}
/** Destinatarios (únicos) de los correos que cumplen el filtro. */
async function destinatarios(filtro) {
  return [...new Set((await correos(filtro)).flatMap((m) => (m.To ?? []).map((t) => t.Address)))];
}

async function tokenActivacion(email) {
  for (let i = 0; i < 40; i++) {
    const [m] = await correos(`to:"${email}" subject:"Activa"`);
    if (m) {
      const d = await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json();
      const t = /activar\?token=([A-Za-z0-9_\-%]+)/.exec(d.Text)?.[1];
      if (t) return decodeURIComponent(t);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

function sql(consulta) {
  const { execFileSync } = require("node:child_process");
  return execFileSync("docker", ["exec", "pis-postgres", "psql", "-U", "pis", "-d", "pis_titulacion", "-t", "-A", "-F", "|", "-c", consulta], {
    encoding: "utf8",
  }).trim();
}

function ok(cond) {
  return cond ? "APROBADO" : "FALLIDO";
}

module.exports = {
  WEB,
  API,
  MAILPIT,
  DIR,
  CAPT,
  QA,
  estado,
  guardarEstado,
  registrar,
  captura,
  abrirNavegador,
  entrar,
  token,
  api,
  subir,
  correos,
  destinatarios,
  tokenActivacion,
  sql,
  ok,
};
