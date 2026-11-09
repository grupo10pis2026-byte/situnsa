import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FICHA_SEMANAS,
  fechaHito,
  fechaPensionPorDefecto,
  finSugerido,
  HITOS_TALLER,
  hashTransicion,
  marcasHitoSemana,
  proponerSesiones,
  sumarDias,
} from "@pis/domain";
import { desc, eq } from "drizzle-orm";
import type { Db } from "../client.js";
import { auditoriaTaller, tallerAsistencias, tallerSesiones } from "../schema/taller-operativa.js";
import {
  alertasTaller,
  asistenciaGrupos,
  comprobantesPension,
  entregasHito,
  feriados,
  fichaRegistros,
  gruposHorario,
  hitosProyecto,
  pensionesAlumno,
  pensionesTaller,
  planInstitucional,
  planTaller,
  proyectosTaller,
  proyectoTesistas,
} from "../schema/taller-v1.js";
import { tallerDias, talleres } from "../schema/talleres.js";
import { usuarios } from "../schema/usuarios.js";
import { ADMIN_ID, ASESOR_ID } from "./demo.js";

/**
 * Flujo demo del Taller de Tesis con el modelo v1.0 (idempotente, SOLO
 * dev/e2e). TALLER 06 empezó hace tres semanas (fechas relativas a hoy en
 * Lima: el demo no envejece):
 * - P-01 María y Jorge (Grupo 1): plan entregado, listo para aprobar (D3).
 * - P-02 Carlos (Grupo 1): plan v1 observado y v2 corregida por revisar.
 * - P-03 Lucía (Grupo 2): no presentó el plan y tiene 2 faltas seguidas
 *   (dos alertas activas para P12).
 * Pensiones: la 2.ª de María en revisión, la de Carlos observada y la de
 * Jorge validada. El DNI 12345678 queda libre para probar D1.
 */

export const JORGE_ID = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa1";
const TALLER06 = "TALLER 06";

/** Base documental: la misma que resuelve la API (ver cargar-env). */
function docsBase(): string {
  if (process.env.DOCS_VOLUME_PATH) return resolve(process.env.DOCS_VOLUME_PATH);
  const raiz = fileURLToPath(new URL("../../../..", import.meta.url));
  return join(raiz, "var", "data", "titulacion-docs");
}

/** PDF mínimo válido de una página (entregas y comprobantes del demo). */
export function pdfDemo(titulo: string): Uint8Array {
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

async function guardarPdf(carpeta: string, subcarpeta: string, nombre: string, titulo: string) {
  const bytes = pdfDemo(titulo);
  const dir = join(docsBase(), carpeta, subcarpeta);
  await mkdir(dir, { recursive: true });
  const ruta = join(dir, nombre);
  await writeFile(ruta, bytes);
  return {
    ruta,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    nombreOriginal: nombre,
    mime: "application/pdf",
    bytes: bytes.byteLength,
  };
}

function hoyLima(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Sábado de hace tres semanas: hoy cae en la semana 4 del curso. */
function inicioDemo(): string {
  const hoy = hoyLima();
  const dow = new Date(`${hoy}T12:00:00Z`).getUTCDay(); // 0 domingo … 6 sábado
  const sabadoActual = sumarDias(hoy, -((dow + 1) % 7));
  return sumarDias(sabadoActual, -21);
}

async function auditar(db: Db, tallerId: string, accion: string, detalle: string): Promise<void> {
  const prev = await db
    .select({ hash: auditoriaTaller.hash })
    .from(auditoriaTaller)
    .where(eq(auditoriaTaller.tallerId, tallerId))
    .orderBy(desc(auditoriaTaller.createdAt))
    .limit(1);
  const hashPrevio = prev[0]?.hash ?? null;
  const timestamp = new Date().toISOString();
  const hash = hashTransicion({
    hashPrevio,
    expedienteId: tallerId,
    actor: "00000001",
    nuevoEstado: accion,
    timestamp,
  });
  await db.insert(auditoriaTaller).values({
    tallerId,
    actorId: ADMIN_ID,
    actorDni: "00000001",
    accion,
    detalle,
    hashPrevio,
    hash,
    createdAt: new Date(timestamp),
  });
}

async function idPorDni(db: Db, dni: string): Promise<string> {
  const [u] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.dni, dni));
  if (!u) throw new Error(`Seed taller: falta el usuario ${dni}`);
  return u.id;
}

const DIAS = [
  { dia: 6, horaInicio: "15:00", horaFin: "20:00" },
  { dia: 7, horaInicio: "08:00", horaFin: "13:00" },
];

const PROYECTOS = [
  {
    codigo: "P-01",
    titulo: "Gestión de pensiones en talleres de tesis con trazabilidad",
    dnis: ["11223344", "44556677"],
    grupo: "Grupo 1",
  },
  {
    codigo: "P-02",
    titulo: "Prevención de riesgos ergonómicos en oficinas administrativas",
    dnis: ["22334455"],
    grupo: "Grupo 1",
  },
  {
    codigo: "P-03",
    titulo: "Seguridad de la información en una entidad pública regional",
    dnis: ["33445566"],
    grupo: "Grupo 2",
  },
] as const;

export async function seedTallerFlujo(db: Db): Promise<void> {
  const [existe] = await db
    .select({ id: talleres.id })
    .from(talleres)
    .where(eq(talleres.nombre, TALLER06))
    .limit(1);
  if (existe) {
    console.log(`Seed ${TALLER06}: ya existe`);
    return;
  }
  const hoy = hoyLima();
  const inicio = inicioDemo();
  const fin = finSugerido(inicio);
  const activos = await db.select().from(feriados).where(eq(feriados.activo, true));
  const cal = proponerSesiones({
    inicio,
    fin,
    dias: DIAS,
    feriados: new Map(activos.map((f) => [f.fecha, f.nombre])),
    objetivo: 24,
  });
  if (!cal.ok) throw new Error(`Seed ${TALLER06}: ${cal.error.message}`);

  const [t] = await db
    .insert(talleres)
    .values({
      nombre: TALLER06,
      periodo: "2026-II",
      asesorId: ASESOR_ID,
      estado: "EN_CURSO",
      fechaInicio: inicio,
      fechaFin: fin,
      numeroSesiones: 24,
      cupoProyectos: 15,
      enlaceSabado: "https://meet.google.com/abc-defg-hij",
      enlaceDomingo: "https://meet.google.com/xyz-uvwx-rst",
      creadoPor: ADMIN_ID,
    })
    .returning({ id: talleres.id });
  if (!t) throw new Error(`Seed ${TALLER06}: no se pudo crear`);
  const tallerId = t.id;
  await db.insert(tallerDias).values(DIAS.map((d) => ({ tallerId, ...d })));

  // Plan del taller (copia del institucional) y pensiones (§3).
  const plan = await db.select().from(planInstitucional);
  if (plan.length > 0)
    await db.insert(planTaller).values(
      plan.map((s) => ({
        tallerId,
        semana: s.semana,
        contenido: s.contenido,
        entregable: s.entregable,
        indicaciones: s.semana === 2 ? "Revisar el formato del Anexo 17 antes del domingo" : null,
        esHito: marcasHitoSemana(s.semana).esHito,
        fijo: marcasHitoSemana(s.semana).fijo,
      })),
    );
  const pensiones = await db
    .insert(pensionesTaller)
    .values([
      { tallerId, numero: 1, semana: null, fecha: null, monto: 1000 },
      { tallerId, numero: 2, semana: 4, fecha: fechaPensionPorDefecto(inicio, 4), monto: 1000 },
      { tallerId, numero: 3, semana: 8, fecha: fechaPensionPorDefecto(inicio, 8), monto: 1000 },
    ])
    .returning({ id: pensionesTaller.id, numero: pensionesTaller.numero });

  // Grupos de horario (los crea el asesor dentro del bloque del sábado).
  const grupos = await db
    .insert(gruposHorario)
    .values([
      { tallerId, nombre: "Grupo 1", horaInicio: "15:00", horaFin: "17:30", creadoPor: ASESOR_ID },
      { tallerId, nombre: "Grupo 2", horaInicio: "17:30", horaFin: "20:00", creadoPor: ASESOR_ID },
    ])
    .returning({ id: gruposHorario.id, nombre: gruposHorario.nombre });
  const grupoId = (n: string) => grupos.find((g) => g.nombre === n)?.id ?? null;

  // Sesiones: las pasadas, realizadas (la asistencia la registró el asesor).
  const sesiones = await db
    .insert(tallerSesiones)
    .values(
      cal.value.sesiones.map((s) => ({
        tallerId,
        nro: s.nro,
        fecha: s.fecha,
        horaInicio: s.horaInicio,
        horaFin: s.horaFin,
        estado: s.fecha < hoy ? ("REALIZADA" as const) : ("PROGRAMADA" as const),
      })),
    )
    .returning({ id: tallerSesiones.id, nro: tallerSesiones.nro, estado: tallerSesiones.estado });
  const realizadas = sesiones.filter((s) => s.estado === "REALIZADA").sort((a, b) => a.nro - b.nro);
  for (const s of realizadas)
    for (const g of grupos)
      await db.insert(asistenciaGrupos).values({
        sesionId: s.id,
        grupoHorarioId: g.id,
        guardadoPor: ASESOR_ID,
      });

  const alumnoIds: Record<string, string> = {};
  for (const p of PROYECTOS) for (const dni of p.dnis) alumnoIds[dni] = await idPorDni(db, dni);

  for (const p of PROYECTOS) {
    const [proyecto] = await db
      .insert(proyectosTaller)
      .values({
        tallerId,
        codigo: p.codigo,
        titulo: p.titulo,
        programa: "SEGUNDA ESPECIALIDAD EN INGENIERÍA DE SISTEMAS",
        grupoHorarioId: grupoId(p.grupo),
        creadoPor: ADMIN_ID,
      })
      .returning({ id: proyectosTaller.id });
    if (!proyecto) continue;
    for (const [i, dni] of p.dnis.entries()) {
      const alumnoId = alumnoIds[dni] as string;
      await db
        .insert(proyectoTesistas)
        .values({ proyectoId: proyecto.id, alumnoId, orden: i + 1, creadoPor: ADMIN_ID });
      // Asistencia: PENDIENTE en las futuras; en las realizadas, la marca del asesor.
      for (const s of sesiones) {
        const k = realizadas.findIndex((r) => r.id === s.id);
        let estado: "PENDIENTE" | "PRESENTE" | "FALTA" | "JUSTIFICADA" = "PENDIENTE";
        if (k >= 0) {
          const ultimas = k >= realizadas.length - 2;
          estado =
            dni === "33445566" && ultimas
              ? "FALTA"
              : dni === "44556677" && k === 1
                ? "JUSTIFICADA"
                : "PRESENTE";
        }
        await db.insert(tallerAsistencias).values({
          sesionId: s.id,
          usuarioId: alumnoId,
          estado,
          ...(estado !== "PENDIENTE" ? { marcadaAt: new Date(), registradaPor: ASESOR_ID } : {}),
          ...(estado === "JUSTIFICADA" ? { motivo: "Certificado médico" } : {}),
        });
      }
      // Pensiones: la 1.ª validada al inscribirse; la 2.ª según el caso del demo.
      for (const pt of pensiones) {
        const base = { pensionTallerId: pt.id, alumnoId, creadoPor: ADMIN_ID };
        if (pt.numero === 1) {
          await db.insert(pensionesAlumno).values({
            ...base,
            estado: "VALIDADA",
            medio: "INSCRIPCION",
            validadaPor: ADMIN_ID,
            validadaAt: new Date(),
          });
          continue;
        }
        const caso =
          pt.numero === 2
            ? dni === "11223344"
              ? "EN_REVISION"
              : dni === "22334455"
                ? "OBSERVADA"
                : dni === "44556677"
                  ? "VALIDADA"
                  : "PENDIENTE"
            : "PENDIENTE";
        const [pa] = await db
          .insert(pensionesAlumno)
          .values({
            ...base,
            estado: caso,
            ...(caso === "VALIDADA"
              ? { medio: "COMPROBANTE" as const, validadaPor: ADMIN_ID, validadaAt: new Date() }
              : {}),
            ...(caso === "OBSERVADA" ? { observacion: "El voucher no se lee completo" } : {}),
          })
          .returning({ id: pensionesAlumno.id });
        if (pa && caso !== "PENDIENTE") {
          const archivo = await guardarPdf(
            tallerId,
            "comprobantes",
            `pension_${pt.numero}_${dni}.pdf`,
            `Voucher pension ${pt.numero} DNI ${dni}`,
          );
          await db.insert(comprobantesPension).values({
            pensionAlumnoId: pa.id,
            ...archivo,
            estado:
              caso === "VALIDADA" ? "VALIDADO" : caso === "OBSERVADA" ? "OBSERVADO" : "EN_REVISION",
            ...(caso === "OBSERVADA" ? { motivo: "El voucher no se lee completo" } : {}),
            ...(caso === "VALIDADA" ? { validadoPor: ADMIN_ID, validadoAt: new Date() } : {}),
            creadoPor: alumnoId,
          });
        }
      }
    }

    // Hitos (§3) y ficha de control (6 filas) del proyecto.
    for (const h of HITOS_TALLER) {
      const fechaLimite = fechaHito(inicio, h.semana);
      const titular = alumnoIds[p.dnis[0]] as string;
      let estado: "NO_HABILITADO" | "HABILITADO" | "ENTREGADO" | "OBSERVADO" | "NO_ENTREGADO" =
        "NO_HABILITADO";
      if (h.tipo === "PLAN") estado = p.codigo === "P-03" ? "NO_ENTREGADO" : "ENTREGADO";
      const [hito] = await db
        .insert(hitosProyecto)
        .values({
          proyectoId: proyecto.id,
          tipo: h.tipo,
          semana: h.semana,
          fechaLimite,
          estado,
          ...(h.tipo === "PLAN" ? { habilitadoPor: ASESOR_ID, habilitadoAt: new Date() } : {}),
        })
        .returning({ id: hitosProyecto.id });
      if (hito && h.tipo === "PLAN" && p.codigo !== "P-03") {
        const archivo = await guardarPdf(
          proyecto.id,
          "entregas",
          `plan_${p.codigo}_v1.pdf`,
          `Plan de tesis ${p.codigo} v1`,
        );
        await db.insert(entregasHito).values({
          hitoId: hito.id,
          version: 1,
          ...archivo,
          comentario: "Primera versión del plan",
          entregadaPor: titular,
          estado: p.codigo === "P-02" ? "OBSERVADA" : "ENTREGADA",
          ...(p.codigo === "P-02"
            ? {
                observaciones: "Delimitar mejor el problema y actualizar las referencias",
                revisadaPor: ASESOR_ID,
                revisadaAt: new Date(),
              }
            : {}),
        });
        // P-02 ya levantó la observación: la v2 espera la revisión del asesor.
        if (p.codigo === "P-02") {
          const v2 = await guardarPdf(
            proyecto.id,
            "entregas",
            `plan_${p.codigo}_v2.pdf`,
            `Plan de tesis ${p.codigo} v2`,
          );
          await db.insert(entregasHito).values({
            hitoId: hito.id,
            version: 2,
            ...v2,
            comentario: "Versión corregida según las observaciones",
            entregadaPor: titular,
            estado: "ENTREGADA",
          });
        }
      }
    }
    for (const f of FICHA_SEMANAS) {
      const revisada = p.codigo === "P-02" && f.semana === 2;
      await db.insert(fichaRegistros).values({
        proyectoId: proyecto.id,
        semana: f.semana,
        avanceRevisado: f.avanceRevisado,
        estado: revisada ? "REVISADO" : "SIN_REVISION",
        ...(revisada
          ? {
              fecha: sumarDias(inicio, 8),
              observacionesAcuerdos: "Delimitar mejor el problema y actualizar las referencias",
              revisadoPor: ASESOR_ID,
            }
          : {}),
      });
    }

    if (p.codigo === "P-03") {
      const lucia = alumnoIds["33445566"] as string;
      await db.insert(alertasTaller).values([
        {
          tipo: "PLAN_NO_PRESENTADO",
          tallerId,
          proyectoId: proyecto.id,
          alumnoId: lucia,
          claveDedupe: `PLAN:${proyecto.id}`,
        },
        {
          tipo: "FALTAS_CONSECUTIVAS",
          tallerId,
          proyectoId: proyecto.id,
          alumnoId: lucia,
          claveDedupe: `FALTAS:${lucia}:${realizadas.at(-1)?.id ?? "x"}`,
        },
      ]);
    }
  }
  await auditar(
    db,
    tallerId,
    "CREAR_TALLER",
    `Taller «${TALLER06}» (demo) con ${sesiones.length} sesiones y 3 proyectos`,
  );
  console.log(
    `Seed ${TALLER06} OK. Inicio ${inicio}, ${realizadas.length} sesiones realizadas, 3 proyectos.`,
  );
}
