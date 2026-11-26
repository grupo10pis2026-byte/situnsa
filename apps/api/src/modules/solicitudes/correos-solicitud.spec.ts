import { describe, expect, it } from "vitest";
import { renderizarCorreo } from "../../infra/mail/plantilla-correo.js";
import { correoAcceso } from "../auth/use-cases/acceso/emitir-acceso.use-case.js";
import {
  correoExpedienteCreado,
  correoSolicitudObservada,
  correoSolicitudRechazada,
  correoSolicitudRecibida,
  itemsObservacion,
} from "./correos-solicitud.js";

/** Renderiza un payload del catálogo igual que el worker. */
function render(p: ReturnType<typeof correoSolicitudRecibida>) {
  return renderizarCorreo({
    titulo: p.titulo,
    texto: p.texto,
    enlace: p.enlace ?? null,
    textoEnlace: p.textoEnlace ?? null,
    variante: p.variante ?? null,
    etiqueta: p.etiqueta ?? null,
    saludo: p.saludo ?? null,
    datos: p.datos ?? null,
    lista: p.lista ?? null,
    nota: p.nota ?? null,
  });
}

describe("plantilla de correo: bloques estructurados", () => {
  it("convierte **negrita** sin permitir HTML inyectado", () => {
    const c = renderizarCorreo({ titulo: "t", texto: "Código **SOL-1** <img src=x>" });
    expect(c.html).toContain("<strong");
    expect(c.html).toContain("SOL-1</strong>");
    expect(c.html).toContain("&lt;img src=x&gt;");
    expect(c.texto).toContain("Código SOL-1");
    expect(c.texto).not.toContain("**");
  });

  it("usa los colores institucionales de la app", () => {
    const c = renderizarCorreo({ titulo: "t", texto: "x", enlace: "https://a.pe" });
    expect(c.html).toContain("#0b1f30"); // navy-950 (cabecera)
    expect(c.html).toContain("#d1a84b"); // dorado-500 (filete)
    expect(c.html).toContain("#610617"); // guinda-800 (botón)
  });
});

describe("catálogo de correos de Mesa de Partes", () => {
  it("acuse de recibo: código y modalidad legibles, sin etiquetas literales", () => {
    const c = render(
      correoSolicitudRecibida({ codigo: "SOL-2026-0007", modalidad: "TESIS", para: ["a@b.pe"] }),
    );
    expect(c.html).toContain("SOL-2026-0007");
    expect(c.html).toContain("Tesis");
    expect(c.html).not.toContain("&lt;strong&gt;");
  });

  it("observación con cuenta nueva: motivos y enlace para crear la clave, sin fecha límite", () => {
    const p = correoSolicitudObservada({
      codigo: "SOL-2026-0007",
      detalle: "- Falta firma en el Anexo 17\n- El DNI no coincide",
      nombres: "Ana",
      dni: "12345678",
      acceso: { tipo: "ACTIVAR", enlace: "https://titulacion.unsa.edu.pe/activar?token=abc" },
      conGoogle: true,
      para: ["a@unsa.edu.pe"],
    });
    expect(p.lista?.items).toEqual(["Falta firma en el Anexo 17", "El DNI no coincide"]);
    expect(p.textoEnlace).toBe("Crear mi clave e ingresar");
    const c = render(p);
    expect(c.html).toContain('href="https://titulacion.unsa.edu.pe/activar?token=abc"');
    expect(c.html).toContain("Ingresar con Google");
    expect(c.texto).toContain("  - El DNI no coincide");
    // Sin plazo de subsanación ni enlace de subsanación aparte
    expect(c.texto.toLowerCase()).not.toMatch(/fecha l[ií]mite|d[ií]as h[aá]biles|subsanar\//);
  });

  it("observación con cuenta activa: lleva al inicio de sesión y no menciona vencimientos", () => {
    const p = correoSolicitudObservada({
      codigo: "SOL-2026-0008",
      detalle: "Foto con fondo de color",
      nombres: "Luis",
      dni: "87654321",
      acceso: { tipo: "INGRESAR", enlace: "https://titulacion.unsa.edu.pe/login" },
      conGoogle: false,
      para: ["l@unsa.edu.pe"],
    });
    expect(p.textoEnlace).toBe("Ingresar al portal");
    expect(p.nota).toBeUndefined();
    expect(p.texto).not.toContain("Google");
  });

  it("rechazo: incluye el fundamento escapado", () => {
    const c = render(
      correoSolicitudRechazada({ codigo: "SOL-1", fundamento: "Art. 5 <b>", para: ["a@b.pe"] }),
    );
    expect(c.html).toContain("Art. 5 &lt;b&gt;");
  });

  it("expediente creado sin acceso: no muestra usuario ni botón", () => {
    const p = correoExpedienteCreado({
      nombres: "Ana",
      codigoSet: "SET010",
      dni: "12345678",
      conAcceso: false,
      enlace: "https://a.pe/mi-tramite",
      para: ["a@b.pe"],
    });
    expect(p.enlace).toBeUndefined();
    expect(p.datos?.some((d) => d.valor === "12345678")).toBe(false);
  });

  it("activación con contexto de expediente: enlace /activar y nunca una contraseña", () => {
    const p = correoAcceso(
      "ACTIVACION",
      { email: "a@b.pe", token: "tok", nombres: "Ana", dni: "12345678" },
      { codigoExpediente: "SET010" },
    );
    expect(p.enlace).toContain("/activar?token=tok");
    expect(p.asunto).toContain("SET010");
    expect(JSON.stringify(p).toLowerCase()).not.toContain("contraseña temporal");
  });

  it("itemsObservacion separa líneas y quita viñetas/numeración", () => {
    expect(itemsObservacion("1. Uno\n2) Dos\n\n• Tres")).toEqual(["Uno", "Dos", "Tres"]);
  });
});
