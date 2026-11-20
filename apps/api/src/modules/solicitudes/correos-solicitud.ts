import type { CorreoPayload } from "../../infra/jobs/colas.js";

/**
 * Catálogo de correos de la Mesa de Partes (CR-MOD-OBT-001 §2).
 * Funciones puras: cada evento arma su `CorreoPayload` con bloques
 * estructurados; la plantilla (`infra/mail/plantilla-correo.ts`) da el
 * formato y escapa el contenido. Para un evento nuevo basta con agregar aquí
 * una función y llamarla tras el commit con `enqueueCorreo`.
 */

const MODALIDAD_LEGIBLE: Readonly<Record<string, string>> = {
  TESIS: "Tesis",
  TRABAJO_ACADEMICO: "Trabajo académico",
  ARTICULO: "Tesis en formato artículo",
};

/** Fecha legible en hora de Lima, p. ej. "lunes, 7 de diciembre de 2026". */
export function fechaLegible(fecha: Date): string {
  return fecha.toLocaleDateString("es-PE", {
    timeZone: "America/Lima",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Separa la observación libre en ítems (una por línea, sin viñetas iniciales). */
export function itemsObservacion(detalle: string): string[] {
  return detalle
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, "").trim())
    .filter((l) => l.length > 0);
}

export function correoSolicitudRecibida(d: {
  codigo: string;
  modalidad: string;
  para: string[];
}): CorreoPayload {
  return {
    para: d.para,
    asunto: `Solicitud ${d.codigo} recibida`,
    titulo: "Recibimos tu solicitud de titulación",
    etiqueta: "Solicitud recibida",
    variante: "informativo",
    texto:
      `Tu solicitud fue registrada con el código **${d.codigo}**. Consérvalo para cualquier consulta.\n\n` +
      "El área de titulación revisará tus datos y documentos. Te escribiremos a este correo con el resultado; si hay observaciones, recibirás un enlace para subsanarlas.",
    datos: [
      { etiqueta: "Código de solicitud", valor: d.codigo },
      { etiqueta: "Modalidad", valor: MODALIDAD_LEGIBLE[d.modalidad] ?? d.modalidad },
      { etiqueta: "Fecha de recepción", valor: fechaLegible(new Date()) },
    ],
  };
}

export function correoSolicitudObservada(d: {
  codigo: string;
  detalle: string;
  fechaLimite: Date;
  enlace: string;
  para: string[];
}): CorreoPayload {
  const items = itemsObservacion(d.detalle);
  return {
    para: d.para,
    asunto: `[${d.codigo}] Solicitud observada – subsane en 10 días hábiles`,
    titulo: "Tu solicitud requiere subsanación",
    etiqueta: "Solicitud observada",
    variante: "observacion",
    texto:
      `Revisamos tu solicitud **${d.codigo}** y encontramos observaciones que debes corregir para continuar con el trámite.\n\n` +
      "Ingresa con el botón de abajo, corrige lo indicado y confirma la subsanación antes de la fecha límite.",
    datos: [
      { etiqueta: "Código de solicitud", valor: d.codigo },
      { etiqueta: "Fecha límite", valor: fechaLegible(d.fechaLimite) },
    ],
    lista: { titulo: "Observaciones", items: items.length > 0 ? items : [d.detalle.trim()] },
    enlace: d.enlace,
    textoEnlace: "Subsanar mi solicitud",
    nota: "El enlace es personal, de un solo uso y vence en la fecha límite (10 días hábiles). Si vence sin subsanar, la solicitud podrá ser rechazada.",
  };
}

export function correoSubsanacionRecibida(d: { codigo: string; para: string[] }): CorreoPayload {
  return {
    para: d.para,
    asunto: `[${d.codigo}] Subsanación recibida`,
    titulo: "Recibimos tu subsanación",
    etiqueta: "Subsanación registrada",
    variante: "exito",
    texto:
      `Registramos la subsanación de tu solicitud **${d.codigo}**.\n\n` +
      "El área de titulación revisará nuevamente los documentos y te notificará el resultado a este correo.",
    datos: [{ etiqueta: "Código de solicitud", valor: d.codigo }],
  };
}

export function correoSolicitudRechazada(d: {
  codigo: string;
  fundamento: string;
  para: string[];
}): CorreoPayload {
  return {
    para: d.para,
    asunto: `[${d.codigo}] Solicitud no admitida`,
    titulo: "Tu solicitud no fue admitida",
    etiqueta: "Solicitud no admitida",
    variante: "alerta",
    texto:
      `Tu solicitud **${d.codigo}** fue revisada y no fue admitida por el siguiente fundamento.\n\n` +
      "Si corresponde, puedes presentar una nueva solicitud en la Mesa de Partes Virtual con la documentación corregida.",
    lista: { titulo: "Fundamento", items: [d.fundamento.trim()] },
  };
}

/**
 * Expediente creado. `conAcceso`: el tesista ya tiene clave del portal.
 * Los usuarios sin clave reciben, en su lugar, el correo de activación
 * (`correoAcceso` en `emitir-acceso.use-case.ts`).
 */
export function correoExpedienteCreado(d: {
  nombres: string;
  codigoSet: string;
  dni: string;
  conAcceso: boolean;
  enlace: string;
  para: string[];
}): CorreoPayload {
  return {
    para: d.para,
    aParticipantes: false,
    asunto: `¡Solicitud aprobada! Expediente ${d.codigoSet} creado`,
    titulo: "Tu expediente de titulación fue creado",
    etiqueta: "Solicitud aprobada",
    variante: "exito",
    saludo: `Hola, ${d.nombres}:`,
    texto:
      `Tu solicitud fue aprobada y se registró tu expediente de titulación con el código **${d.codigoSet}**.\n\n` +
      (d.conAcceso
        ? "Ingresa al portal con tu usuario y tu clave habitual para seguir tu trámite."
        : "Te enviaremos el enlace para crear tu clave del portal cuando se habilite tu acceso."),
    datos: [
      { etiqueta: "Expediente", valor: d.codigoSet },
      ...(d.conAcceso ? [{ etiqueta: "Usuario (DNI)", valor: d.dni }] : []),
    ],
    ...(d.conAcceso ? { enlace: d.enlace, textoEnlace: "Ver mi trámite" } : {}),
  };
}
