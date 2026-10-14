import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generarSesiones, hashTransicion } from "@pis/domain";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../client.js";
import { cronogramaPensiones, grupoMiembros, gruposTaller } from "../schema/grupos-pagos.js";
import {
  auditoriaTaller,
  tallerAsistencias,
  tallerAvances,
  tallerCumplimiento,
  tallerFases,
  tallerPases,
  tallerSesiones,
} from "../schema/taller-operativa.js";
import { talleres } from "../schema/talleres.js";
import { usuarios } from "../schema/usuarios.js";
import { ADMIN_ID, ASESOR_ID } from "./demo.js";

export const JORGE_ID = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa1";
const TALLER06 = "TALLER 06";

/** Base documental: la misma que resuelve la API (ver cargar-env). */
function docsBase(): string {
  if (process.env.DOCS_VOLUME_PATH) return resolve(process.env.DOCS_VOLUME_PATH);
  const raiz = fileURLToPath(new URL("../../../..", import.meta.url));
  return join(raiz, "var", "data", "titulacion-docs");
}

/** Comprobante demo: PDF mínimo válido de una página. */
function pdfDemo(titulo: string): Uint8Array {
  const texto = `BT /F1 12 Tf 50 750 Td (${titulo}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${texto.length} >>\nstream\n${texto}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(out);
}

/** Guarda un comprobante como lo haría SubirComprobanteUseCase. */
async function guardarComprobante(
  tallerId: string,
  cuotaId: string,
  nroCuota: number,
  titulo: string,
): Promise<{ ruta: string; sha256: string; fecha: Date }> {
  const bytes = pdfDemo(titulo);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const nombre = `cuota_${nroCuota}_${cuotaId.slice(0, 8)}.pdf`;
  const dir = join(docsBase(), tallerId, "comprobantes");
  await mkdir(dir, { recursive: true });
  const ruta = join(dir, nombre);
  await writeFile(ruta, bytes);
  return { ruta, sha256, fecha: new Date() };
}

/** Hoy en Lima (AAAA-MM-DD). Las fechas del demo son relativas: el seed no se pudre. */
function hoyLima(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function sumarDias(base: string, dias: number): string {
  const d = new Date(`${base}T12:00:00-05:00`).getTime() + dias * 86_400_000;
  return hoyLimaDesde(new Date(d));
}

function hoyLimaDesde(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Próximo sábado (inclusive) en Lima: inicio del TALLER 06. */
function proximoSabado(): string {
  const hoy = hoyLima();
  const dow = new Date(`${hoy}T12:00:00-05:00`).getUTCDay();
  return sumarDias(hoy, (6 - dow + 7) % 7);
}

async function auditarTaller(
  db: Db,
  input: { tallerId: string; accion: string; detalle: string },
): Promise<void> {
  const prev = await db
    .select({ hash: auditoriaTaller.hash })
    .from(auditoriaTaller)
    .where(eq(auditoriaTaller.tallerId, input.tallerId))
    .orderBy(desc(auditoriaTaller.createdAt))
    .limit(1);
  const hashPrevio = prev[0]?.hash ?? null;
  const timestamp = new Date().toISOString();
  await db.insert(auditoriaTaller).values({
    tallerId: input.tallerId,
    actorId: ADMIN_ID,
    actorDni: "00000001",
    accion: input.accion,
    detalle: input.detalle,
    hashPrevio,
    hash: hashTransicion({
      hashPrevio,
      expedienteId: input.tallerId,
      actor: "00000001",
      nuevoEstado: input.accion,
      timestamp,
    }),
    createdAt: new Date(timestamp),
  });
}

/** ¿El usuario ya está en otro taller ACTIVO? (un taller activo por alumno). */
async function tallerActivoDe(db: Db, usuarioId: string): Promise<string | null> {
  const mem = await db
    .select({ grupoId: grupoMiembros.grupoId })
    .from(grupoMiembros)
    .where(eq(grupoMiembros.usuarioId, usuarioId));
  if (mem.length === 0) return null;
  for (const m of mem) {
    const g = await db
      .select({ tallerId: gruposTaller.tallerId })
      .from(gruposTaller)
      .where(eq(gruposTaller.id, m.grupoId))
      .limit(1);
    const t = g[0];
    if (!t) continue;
    const est = await db
      .select({ estado: talleres.estado })
      .from(talleres)
      .where(eq(talleres.id, t.tallerId))
      .limit(1);
    if (est[0]?.estado === "ACTIVO") return t.tallerId;
  }
  return null;
}

/**
 * Flujo demo del taller (idempotente, SOLO dev/e2e): TALLER 06 con 12
 * sesiones (sáb/dom 09:00), Grupo A (María, Carlos) y Grupo B (Lucía,
 * Jorge), cronograma de 4 cuotas, 3 fases con cumplimiento, un avance
 * solicitado y el pase de María. Fechas relativas a hoy (Lima).
 */
export async function seedTallerFlujo(db: Db): Promise<void> {
  // ---- Taller + sesiones ----
  const taller = (
    await db
      .select({ id: talleres.id })
      .from(talleres)
      .where(eq(talleres.nombre, TALLER06))
      .limit(1)
  )[0];
  let tallerId = taller?.id;
  let inicio = "";
  if (!tallerId) {
    inicio = proximoSabado();
    const sesiones = generarSesiones({
      fechaInicio: inicio,
      dias: [6, 7],
      horaInicio: "09:00",
      horaFin: "11:00",
      total: 12,
    });
    if (!sesiones.ok) throw new Error(`Seed TALLER 06: ${sesiones.error.message}`);
    const ins = await db
      .insert(talleres)
      .values({
        nombre: TALLER06,
        periodo: "2026-II",
        asesorId: ASESOR_ID,
        fechaInicio: inicio,
        diasSesion: "6,7",
        horaInicio: "09:00",
        horaFin: "11:00",
        cupoMax: 30,
        enlace: "https://meet.google.com/abc-defg-hij",
        inscritos: 0,
      })
      .returning({ id: talleres.id });
    tallerId = ins[0]?.id;
    if (!tallerId) throw new Error("Seed TALLER 06: no se pudo crear");
    await db.insert(tallerSesiones).values(
      sesiones.value.map(
        (s: { nro: number; fecha: string; horaInicio: string; horaFin: string }) => ({
          tallerId: tallerId as string,
          nro: s.nro,
          fecha: s.fecha,
          horaInicio: s.horaInicio,
          horaFin: s.horaFin,
        }),
      ),
    );
    await auditarTaller(db, {
      tallerId,
      accion: "CREAR_TALLER",
      detalle: `Taller «${TALLER06}» con ${sesiones.value.length} sesiones`,
    });
  }
  if (!tallerId) throw new Error("Seed TALLER 06: sin id de taller");
  const t0 = (
    await db
      .select({ fechaInicio: talleres.fechaInicio })
      .from(talleres)
      .where(eq(talleres.id, tallerId))
      .limit(1)
  )[0];
  inicio = t0?.fechaInicio ?? proximoSabado();
  const sesiones = await db
    .select({ id: tallerSesiones.id, nro: tallerSesiones.nro, fecha: tallerSesiones.fecha })
    .from(tallerSesiones)
    .where(eq(tallerSesiones.tallerId, tallerId));

  // ---- Grupos ----
  const grupos: Record<string, string> = {};
  for (const nombre of ["Grupo A", "Grupo B"]) {
    const g = (
      await db
        .select({ id: gruposTaller.id })
        .from(gruposTaller)
        .where(and(eq(gruposTaller.tallerId, tallerId), eq(gruposTaller.nombre, nombre)))
        .limit(1)
    )[0];
    if (g) {
      grupos[nombre] = g.id;
      continue;
    }
    const ins = await db
      .insert(gruposTaller)
      .values({ tallerId, nombre, asesorId: ASESOR_ID, estado: "ACTIVO" })
      .returning({ id: gruposTaller.id });
    if (!ins[0]) throw new Error(`Seed ${nombre}: no se pudo crear`);
    grupos[nombre] = ins[0].id;
  }

  // ---- Miembros + asistencias ----
  const dnis: Record<string, string[]> = {
    "Grupo A": ["11223344", "22334455"],
    "Grupo B": ["33445566", "44556677"],
  };
  for (const [grupoNombre, grupoId] of Object.entries(grupos)) {
    for (const dni of dnis[grupoNombre] ?? []) {
      const u = (
        await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.dni, dni)).limit(1)
      )[0];
      if (!u) continue;
      const otro = await tallerActivoDe(db, u.id);
      if (otro && otro !== tallerId) continue;
      await db.insert(grupoMiembros).values({ grupoId, usuarioId: u.id }).onConflictDoNothing();
      if (sesiones.length > 0) {
        await db
          .insert(tallerAsistencias)
          .values(sesiones.map((s) => ({ sesionId: s.id, usuarioId: u.id })))
          .onConflictDoNothing();
      }
      await auditarTaller(db, {
        tallerId,
        accion: "ASIGNAR_ALUMNO",
        detalle: `DNI ${dni} al grupo ${grupoId}`,
      });
    }
  }
  const conteo = await db
    .select({ usuarioId: grupoMiembros.usuarioId })
    .from(grupoMiembros)
    .innerJoin(gruposTaller, eq(gruposTaller.id, grupoMiembros.grupoId))
    .where(eq(gruposTaller.tallerId, tallerId));
  await db
    .update(talleres)
    .set({ inscritos: new Set(conteo.map((c) => c.usuarioId)).size })
    .where(eq(talleres.id, tallerId));

  // ---- Sesiones con estados variados: 1 realizada, 2 abierta, 3 cancelada ----
  const porNro = new Map(sesiones.map((s) => [s.nro, s]));
  const uid = async (dni: string): Promise<string | null> => {
    const u = (
      await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.dni, dni)).limit(1)
    )[0];
    return u?.id ?? null;
  };
  const s1 = porNro.get(1);
  if (s1) {
    const actual = (
      await db
        .select({ estado: tallerSesiones.estado })
        .from(tallerSesiones)
        .where(eq(tallerSesiones.id, s1.id))
        .limit(1)
    )[0];
    if (actual?.estado === "PROGRAMADA") {
      await db
        .update(tallerSesiones)
        .set({ estado: "REALIZADA" })
        .where(eq(tallerSesiones.id, s1.id));
      const marcas: Array<{
        dni: string;
        estado: "PRESENTE" | "FALTA" | "JUSTIFICADA";
        motivo: string | null;
      }> = [
        { dni: "11223344", estado: "PRESENTE", motivo: null },
        { dni: "22334455", estado: "PRESENTE", motivo: null },
        { dni: "33445566", estado: "FALTA", motivo: null },
        { dni: "44556677", estado: "JUSTIFICADA", motivo: "Cita médica familiar" },
      ];
      for (const m of marcas) {
        const id = await uid(m.dni);
        if (!id) continue;
        await db
          .insert(tallerAsistencias)
          .values({
            sesionId: s1.id,
            usuarioId: id,
            estado: m.estado,
            marcadaAt: m.estado === "FALTA" ? null : new Date(`${s1.fecha}T09:35:00-05:00`),
            motivo: m.motivo,
            actualizadaPor: m.estado === "JUSTIFICADA" ? ASESOR_ID : null,
          })
          .onConflictDoUpdate({
            target: [tallerAsistencias.sesionId, tallerAsistencias.usuarioId],
            set: {
              estado: m.estado,
              marcadaAt: m.estado === "FALTA" ? null : new Date(`${s1.fecha}T09:35:00-05:00`),
              motivo: m.motivo,
              actualizadaPor: m.estado === "JUSTIFICADA" ? ASESOR_ID : null,
            },
          });
      }
      await auditarTaller(db, { tallerId, accion: "ABRIR_ASISTENCIA", detalle: `Sesión ${s1.id}` });
      await auditarTaller(db, {
        tallerId,
        accion: "CERRAR_ASISTENCIA",
        detalle: `Sesión ${s1.id}`,
      });
    }
  }
  const s2 = porNro.get(2);
  if (s2) {
    const actual = (
      await db
        .select({ estado: tallerSesiones.estado })
        .from(tallerSesiones)
        .where(eq(tallerSesiones.id, s2.id))
        .limit(1)
    )[0];
    if (actual?.estado === "PROGRAMADA") {
      await db
        .update(tallerSesiones)
        .set({ estado: "ABIERTA" })
        .where(eq(tallerSesiones.id, s2.id));
      await auditarTaller(db, { tallerId, accion: "ABRIR_ASISTENCIA", detalle: `Sesión ${s2.id}` });
    }
  }
  const s3 = porNro.get(3);
  if (s3) {
    const actual = (
      await db
        .select({ estado: tallerSesiones.estado })
        .from(tallerSesiones)
        .where(eq(tallerSesiones.id, s3.id))
        .limit(1)
    )[0];
    if (actual?.estado === "PROGRAMADA") {
      await db
        .update(tallerSesiones)
        .set({ estado: "CANCELADA", motivo: "Feriado local" })
        .where(eq(tallerSesiones.id, s3.id));
      await auditarTaller(db, { tallerId, accion: "CANCELAR_SESION", detalle: `Sesión ${s3.id}` });
    }
  }

  // ---- Pensiones: 4 cuotas de S/150 por miembro ----
  const primerVto = sumarDias(inicio, 28);
  for (const grupoId of Object.values(grupos)) {
    const previas = await db
      .select({ id: cronogramaPensiones.id })
      .from(cronogramaPensiones)
      .where(eq(cronogramaPensiones.grupoId, grupoId))
      .limit(1);
    if (previas.length > 0) continue;
    const miembros = await db
      .select({ usuarioId: grupoMiembros.usuarioId })
      .from(grupoMiembros)
      .where(eq(grupoMiembros.grupoId, grupoId));
    const base = new Date(`${primerVto}T00:00:00`);
    for (const m of miembros) {
      for (let n = 1; n <= 4; n++) {
        const vto = new Date(base);
        vto.setMonth(vto.getMonth() + (n - 1));
        await db.insert(cronogramaPensiones).values({
          grupoId,
          usuarioId: m.usuarioId,
          nroCuota: n,
          monto: 150,
          vencimiento: vto.toISOString().slice(0, 10),
          estado: "PENDIENTE",
        });
      }
    }
  }

  // ---- Cuotas con estados variados (P8/P9 con ejemplos reales) ----
  async function cuotaDe(
    grupoId: string,
    dni: string,
    nro: number,
  ): Promise<{ id: string; estado: string } | null> {
    const u = (
      await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.dni, dni)).limit(1)
    )[0];
    if (!u) return null;
    const c = (
      await db
        .select({ id: cronogramaPensiones.id, estado: cronogramaPensiones.estado })
        .from(cronogramaPensiones)
        .where(
          and(
            eq(cronogramaPensiones.grupoId, grupoId),
            eq(cronogramaPensiones.usuarioId, u.id),
            eq(cronogramaPensiones.nroCuota, nro),
          ),
        )
        .limit(1)
    )[0];
    return c ?? null;
  }
  // Carlos, cuota 1 vencida (sigue PENDIENTE → deudor con atraso).
  const carlos1 = await cuotaDe(grupos["Grupo A"] ?? "", "22334455", 1);
  if (carlos1 && carlos1.estado === "PENDIENTE") {
    await db
      .update(cronogramaPensiones)
      .set({ vencimiento: sumarDias(hoyLima(), -12) })
      .where(eq(cronogramaPensiones.id, carlos1.id));
  }
  // María, cuota 1 validada con comprobante.
  const maria1 = await cuotaDe(grupos["Grupo A"] ?? "", "11223344", 1);
  if (maria1 && maria1.estado === "PENDIENTE") {
    const comp = await guardarComprobante(tallerId, maria1.id, 1, "Comprobante María T. cuota 1");
    await db
      .update(cronogramaPensiones)
      .set({
        estado: "VALIDADO",
        comprobanteRuta: comp.ruta,
        comprobanteSha256: comp.sha256,
        comprobanteFecha: comp.fecha,
        motivo: null,
      })
      .where(eq(cronogramaPensiones.id, maria1.id));
    await auditarTaller(db, {
      tallerId,
      accion: "SUBIR_COMPROBANTE",
      detalle: "Cuota 1 en revisión",
    });
    await auditarTaller(db, { tallerId, accion: "VALIDAR_COMPROBANTE", detalle: "Cuota 1 pagada" });
  }
  // Lucía, cuota 1 observada con comprobante y motivo.
  const lucia1 = await cuotaDe(grupos["Grupo B"] ?? "", "33445566", 1);
  if (lucia1 && lucia1.estado === "PENDIENTE") {
    const comp = await guardarComprobante(tallerId, lucia1.id, 1, "Comprobante Lucía M. cuota 1");
    await db
      .update(cronogramaPensiones)
      .set({
        estado: "OBSERVADO",
        comprobanteRuta: comp.ruta,
        comprobanteSha256: comp.sha256,
        comprobanteFecha: comp.fecha,
        motivo: "La imagen no se lee",
      })
      .where(eq(cronogramaPensiones.id, lucia1.id));
    await auditarTaller(db, {
      tallerId,
      accion: "SUBIR_COMPROBANTE",
      detalle: "Cuota 1 en revisión",
    });
    await auditarTaller(db, {
      tallerId,
      accion: "OBSERVAR_COMPROBANTE",
      detalle: "Cuota 1 observada",
    });
  }
  // Jorge, cuota 2 en revisión con comprobante.
  const jorge2 = await cuotaDe(grupos["Grupo B"] ?? "", "44556677", 2);
  if (jorge2 && jorge2.estado === "PENDIENTE") {
    const comp = await guardarComprobante(tallerId, jorge2.id, 2, "Comprobante Jorge R. cuota 2");
    await db
      .update(cronogramaPensiones)
      .set({
        estado: "EN_REVISION",
        comprobanteRuta: comp.ruta,
        comprobanteSha256: comp.sha256,
        comprobanteFecha: comp.fecha,
        motivo: null,
      })
      .where(eq(cronogramaPensiones.id, jorge2.id));
    await auditarTaller(db, {
      tallerId,
      accion: "SUBIR_COMPROBANTE",
      detalle: "Cuota 2 en revisión",
    });
  }
  // ---- Fases + cumplimiento ----
  const fases = await db
    .select({ id: tallerFases.id, orden: tallerFases.orden })
    .from(tallerFases)
    .where(eq(tallerFases.tallerId, tallerId))
    .orderBy(tallerFases.orden);
  if (fases.length === 0) {
    const defs = [
      { nombre: "Planteamiento del problema", fechaRef: sumarDias(inicio, 14) },
      { nombre: "Marco teórico", fechaRef: sumarDias(inicio, 42) },
      { nombre: "Metodología", fechaRef: sumarDias(inicio, 56) },
    ];
    let orden = 0;
    for (const d of defs) {
      orden += 1;
      const ins = await db
        .insert(tallerFases)
        .values({ tallerId, nombre: d.nombre, descripcion: null, fechaRef: d.fechaRef, orden })
        .returning({ id: tallerFases.id });
      if (ins[0]) fases.push({ id: ins[0].id, orden });
      await auditarTaller(db, { tallerId, accion: "CREAR_FASE", detalle: `Fase «${d.nombre}»` });
    }
  }
  async function marcar(
    tid: string,
    dni: string,
    orden: number,
    estado: "CUMPLIDA" | "OBSERVADA",
    comentario: string | null,
  ): Promise<void> {
    const fase = fases.find((f) => f.orden === orden);
    const u = (
      await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.dni, dni)).limit(1)
    )[0];
    if (!fase || !u) return;
    await db
      .insert(tallerCumplimiento)
      .values({ faseId: fase.id, usuarioId: u.id, estado, comentario })
      .onConflictDoUpdate({
        target: [tallerCumplimiento.faseId, tallerCumplimiento.usuarioId],
        set: { estado, comentario },
      });
    await auditarTaller(db, {
      tallerId: tid,
      accion: "MARCAR_CUMPLIMIENTO",
      detalle: `Fase ${fase.id}, DNI ${dni} → ${estado}`,
    });
  }
  await marcar(tallerId, "11223344", 1, "CUMPLIDA", null);
  await marcar(tallerId, "11223344", 2, "CUMPLIDA", null);
  await marcar(tallerId, "11223344", 3, "CUMPLIDA", null);
  await marcar(tallerId, "22334455", 1, "CUMPLIDA", null);
  await marcar(
    tallerId,
    "22334455",
    2,
    "OBSERVADA",
    "Precisar el marco teórico y corregir las citas",
  );

  // ---- Avance solicitado ----
  const avances = await db
    .select({ id: tallerAvances.id })
    .from(tallerAvances)
    .where(eq(tallerAvances.tallerId, tallerId))
    .limit(1);
  if (avances.length === 0) {
    await db.insert(tallerAvances).values({
      tallerId,
      sesionId: null,
      descripcion: "Planteamiento del problema",
      plazo: sumarDias(inicio, 40),
      solicitadoPor: ASESOR_ID,
    });
    await auditarTaller(db, {
      tallerId,
      accion: "SOLICITAR_AVANCE",
      detalle: `Plazo ${sumarDias(inicio, 40)}: Planteamiento del problema`,
    });
  }

  // ---- Pase de María (fases completas) ----
  const maria = (
    await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.dni, "11223344")).limit(1)
  )[0];
  if (maria) {
    const pase = await db
      .select({ id: tallerPases.id })
      .from(tallerPases)
      .where(and(eq(tallerPases.tallerId, tallerId), eq(tallerPases.usuarioId, maria.id)))
      .limit(1);
    if (pase.length === 0) {
      await db
        .insert(tallerPases)
        .values({ tallerId, usuarioId: maria.id, validadoPor: ASESOR_ID });
      await auditarTaller(db, {
        tallerId,
        accion: "VALIDAR_PASE",
        detalle: "DNI 11223344 pasa a Plan de tesis",
      });
    }
  }

  console.log(`Seed TALLER 06 OK. Inicio ${inicio}, grupos A/B, fases, avance y pase.`);
}
