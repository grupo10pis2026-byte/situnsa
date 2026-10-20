import { PROGRAMAS_OFICIALES } from "@pis/domain/dist/expediente/seguimiento-catalogo.js";
import { Link } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  ExternalLink,
  FileText,
  GraduationCap,
  Info,
  Mail,
  Paperclip,
  Send,
  Upload,
  User,
  Users,
} from "lucide-react";
import { useState } from "react";
import { crearSolicitudPublica } from "../api/solicitudes.js";
import { Button } from "../components/ui/button.js";
import { Card } from "../components/ui/card.js";
import { Field } from "../components/ui/field.js";
import { Select } from "../components/ui/select.js";

type Via = "REGULAR" | "TALLER";
type Modalidad = "TESIS" | "TRABAJO_ACADEMICO" | "ARTICULO";

interface DatosParticipante {
  nombres: string;
  apellidos: string;
  dni: string;
  cui: string;
  email: string;
  telefono: string;
  nacionalidad: string;
  ciudad: string;
  direccion: string;
}

const participanteInicial: DatosParticipante = {
  nombres: "",
  apellidos: "",
  dni: "",
  cui: "",
  email: "",
  telefono: "",
  nacionalidad: "Peruana",
  ciudad: "Arequipa",
  direccion: "",
};

export function MesaDePartesPage() {
  const [paso, setPaso] = useState<1 | 2 | 3 | 4>(1);

  // Paso 1: Académicos
  const [via, setVia] = useState<Via>("REGULAR");
  const [modalidad, setModalidad] = useState<Modalidad>("TESIS");
  const [programa, setPrograma] = useState(PROGRAMAS_OFICIALES[0]?.nombre ?? "");
  const [titulo, setTitulo] = useState("");
  const [anioEgreso, setAnioEgreso] = useState(new Date().getFullYear());
  const [cantidadTesistas, setCantidadTesistas] = useState<1 | 2>(1);

  // Paso 2: Participantes
  const [p1, setP1] = useState<DatosParticipante>({ ...participanteInicial });
  const [p2, setP2] = useState<DatosParticipante>({ ...participanteInicial });

  // Paso 3: Documentos
  const [archivos, setArchivos] = useState<Record<string, File>>({});

  // Paso 4: Declaración Jurada
  const [declaracionJurada, setDeclaracionJurada] = useState(false);

  // Estado de envío
  const [enviando, setEnviando] = useState(false);
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);
  const [resultadoExitoso, setResultadoExitoso] = useState<{ codigo: string } | null>(null);

  // Lista de documentos requeridos según vía con guías y enlaces
  interface RequisitoDoc {
    clave: string;
    nombre: string;
    requerido: boolean;
    esFoto?: boolean;
    formatos?: string;
    guiaTexto?: string;
    guiaCorreo?: string;
    guiaEnlaces?: Array<{ texto: string; url: string }>;
    guiaManual?: {
      texto: string;
      enlace: { texto: string; url: string };
      correoSoporte: string;
    };
  }

  const docsRequeridos: RequisitoDoc[] =
    via === "REGULAR"
      ? [
          { clave: "FUT", nombre: "Solicitud de Inscripción / FUT", requerido: true },
          {
            clave: "PLAN_TESIS",
            nombre: "El Plan de Tesis o Plan de Trabajo Académico",
            requerido: true,
            guiaTexto: "Se adjunta esquema. Utilizar el formato actualizado:",
            guiaEnlaces: [
              {
                texto: "Descargar Formato Plan de Tesis (Google Docs)",
                url: "https://docs.google.com/document/d/1rHSCqSIEXVKPxxQYG0jAPfF9hhZVCxbJ/edit?usp=drive_web&ouid=106454452671119045265&rtpof=true",
              },
              {
                texto: "Descargar Plan de Trabajo Académico (Google Docs)",
                url: "https://docs.google.com/document/d/1e3RGNju998E4rWh2pgwahXNyI269a0Ri/edit?rtpof=true&tab=t.0",
              },
            ],
          },
          {
            clave: "CONSTANCIA_NO_ADEUDO",
            nombre: "Constancia de No Adeudo",
            requerido: true,
            guiaTexto:
              "En caso de no contar con dicha información, deberá solicitarla al correo institucional de administración:",
            guiaCorreo: "fips_usesp_administracion@unsa.edu.pe",
          },
          {
            clave: "PAGO_TRAMITE",
            nombre: "Recibo de Pago por Derechos de Trámite",
            requerido: true,
            guiaTexto:
              "Adjuntar el abono correspondiente, generando su ticket con el correo institucional, indicando como concepto: PENSIÓN, a través del sistema UNSAPay:",
            guiaEnlaces: [
              {
                texto: "Acceder a UNSAPay (ouis.unsa.edu.pe/unsapay/login)",
                url: "https://ouis.unsa.edu.pe/unsapay/login",
              },
            ],
            guiaManual: {
              texto:
                "Para conocer el paso a paso sobre cómo generar tu código de ticket, ingresa al manual:",
              enlace: {
                texto: "Manual de Procedimientos: Pagos UNSAPay",
                url: "https://fips.unsa.edu.pe/usefc/pagos-unsapay/",
              },
              correoSoporte:
                "En caso de no poder ingresar a su correo institucional, deberá solicitar el soporte correspondiente escribiendo al correo: soportecorreo@unsa.edu.pe",
            },
          },
          {
            clave: "FOTO_ESTUDIANTE",
            nombre:
              cantidadTesistas === 2
                ? "Fotografía del Tesista Titular (Fondo blanco)"
                : "Fotografía del Estudiante (Fondo blanco)",
            requerido: true,
            esFoto: true,
            formatos: ".pdf,.jpg,.jpeg,.png",
            guiaTexto:
              "Obligatorio: Adjuntar fotografía formal reciente con fondo blanco (formato PDF, JPG o PNG).",
          },
          ...(cantidadTesistas === 2
            ? [
                {
                  clave: "FOTO_ESTUDIANTE_2",
                  nombre: "Fotografía del Segundo Tesista (Fondo blanco)",
                  requerido: true,
                  esFoto: true,
                  formatos: ".pdf,.jpg,.jpeg,.png",
                  guiaTexto:
                    "Obligatorio: Adjuntar fotografía formal reciente con fondo blanco del segundo participante (formato PDF, JPG o PNG).",
                },
              ]
            : []),
          { clave: "IDIOMA", nombre: "Certificado de Idioma Extranjero", requerido: false },
        ]
      : [
          { clave: "SOLICITUD_TALLER", nombre: "Ficha de Inscripción al Taller", requerido: true },
          {
            clave: "COMPROMISO",
            nombre: "Carta de Compromiso de Titulación",
            requerido: true,
            guiaTexto: "Descargue el formato oficial, complételo y adjúntelo firmado:",
            guiaEnlaces: [
              {
                texto: "Descargar aquí Carta de compromiso (Google Drive)",
                url: "https://drive.google.com/file/d/1oU8gFfeGe-nDMBzn1u7Cc8Uh0JDeDNq3/view?usp=drive_link",
              },
            ],
          },
          {
            clave: "CONSTANCIA_NO_ADEUDO",
            nombre: "Constancia de No Adeudo",
            requerido: true,
            guiaTexto: "En caso de no contar con dicha información, deberá solicitarla al correo:",
            guiaCorreo: "fips_usesp_administracion@unsa.edu.pe",
          },
          {
            clave: "PAGO_MATRICULA",
            nombre: "Recibo de Pago de Matrícula Taller",
            requerido: true,
            guiaTexto:
              "Adjuntar el abono correspondiente, generando su ticket con el correo institucional, indicando como concepto: PENSIÓN, a través del sistema UNSAPay:",
            guiaEnlaces: [
              {
                texto: "Acceder a UNSAPay (ouis.unsa.edu.pe/unsapay/login)",
                url: "https://ouis.unsa.edu.pe/unsapay/login",
              },
            ],
            guiaManual: {
              texto:
                "Para conocer el paso a paso sobre cómo generar tu código de ticket, ingresa al manual:",
              enlace: {
                texto: "Manual de Procedimientos: Pagos UNSAPay",
                url: "https://fips.unsa.edu.pe/usefc/pagos-unsapay/",
              },
              correoSoporte:
                "En caso de no poder ingresar a su correo institucional, deberá solicitar el soporte correspondiente escribiendo al correo: soportecorreo@unsa.edu.pe",
            },
          },
          { clave: "DNI_COPIA", nombre: "Copia de DNI Legible", requerido: true },
          {
            clave: "FOTO_ESTUDIANTE",
            nombre:
              cantidadTesistas === 2
                ? "Fotografía del Tesista Titular (Fondo blanco)"
                : "Fotografía del Estudiante (Fondo blanco)",
            requerido: true,
            esFoto: true,
            formatos: ".pdf,.jpg,.jpeg,.png",
            guiaTexto:
              "Obligatorio: Adjuntar fotografía formal reciente con fondo blanco (formato PDF, JPG o PNG).",
          },
          ...(cantidadTesistas === 2
            ? [
                {
                  clave: "FOTO_ESTUDIANTE_2",
                  nombre: "Fotografía del Segundo Tesista (Fondo blanco)",
                  requerido: true,
                  esFoto: true,
                  formatos: ".pdf,.jpg,.jpeg,.png",
                  guiaTexto:
                    "Obligatorio: Adjuntar fotografía formal reciente con fondo blanco del segundo participante (formato PDF, JPG o PNG).",
                },
              ]
            : []),
        ];

  function handleFileChange(clave: string, file: File | null, esFoto = false) {
    if (!file) {
      setArchivos((prev) => {
        const copy = { ...prev };
        delete copy[clave];
        return copy;
      });
      return;
    }

    if (esFoto) {
      const extensionValida = /\.(pdf|jpe?g|png)$/i.test(file.name);
      const mimeValido = ["application/pdf", "image/jpeg", "image/png", "image/jpg"].includes(
        file.type,
      );
      if (!extensionValida && !mimeValido) {
        setErrorGlobal(`La fotografía "${file.name}" debe ser formato JPG, PNG o PDF`);
        return;
      }
    } else {
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        setErrorGlobal(`El archivo "${file.name}" debe ser formato PDF`);
        return;
      }
    }
    if (file.size > 20 * 1024 * 1024) {
      setErrorGlobal(`El archivo "${file.name}" supera el límite máximo de 20MB`);
      return;
    }

    setErrorGlobal(null);
    setArchivos((prev) => ({ ...prev, [clave]: file }));
  }

  function validarPaso1(): boolean {
    setErrorGlobal(null);
    if (!titulo.trim() || titulo.trim().length < 10) {
      setErrorGlobal("El título del plan debe tener al menos 10 caracteres");
      return false;
    }
    if (!programa) {
      setErrorGlobal("Debe seleccionar un programa oficial");
      return false;
    }
    return true;
  }

  function validarPaso2(): boolean {
    setErrorGlobal(null);
    if (!p1.nombres.trim() || !p1.apellidos.trim()) {
      setErrorGlobal("Complete los nombres y apellidos del postulante titular");
      return false;
    }
    if (!/^\d{8}$/.test(p1.dni.trim())) {
      setErrorGlobal("El DNI del postulante titular debe tener 8 dígitos numéricos");
      return false;
    }
    if (p1.cui.trim() && !/^\d{8}$/.test(p1.cui.trim())) {
      setErrorGlobal("El CUI del postulante titular debe tener exactamente 8 dígitos numéricos");
      return false;
    }
    if (!p1.email.trim() || !p1.email.includes("@")) {
      setErrorGlobal("Ingrese un correo electrónico válido para el postulante titular");
      return false;
    }

    if (cantidadTesistas === 2) {
      if (!p2.nombres.trim() || !p2.apellidos.trim()) {
        setErrorGlobal("Complete los nombres y apellidos del segundo tesista");
        return false;
      }
      if (!/^\d{8}$/.test(p2.dni.trim())) {
        setErrorGlobal("El DNI del segundo tesista debe tener 8 dígitos numéricos");
        return false;
      }
      if (p2.cui.trim() && !/^\d{8}$/.test(p2.cui.trim())) {
        setErrorGlobal("El CUI del segundo tesista debe tener exactamente 8 dígitos numéricos");
        return false;
      }
      if (p1.dni.trim() === p2.dni.trim()) {
        setErrorGlobal("El primer y segundo tesista no pueden tener el mismo DNI");
        return false;
      }
      if (p1.email.trim().toLowerCase() === p2.email.trim().toLowerCase()) {
        setErrorGlobal("Cada tesista debe registrar un correo electrónico distinto");
        return false;
      }
    }
    return true;
  }

  function validarPaso3(): boolean {
    setErrorGlobal(null);
    for (const doc of docsRequeridos) {
      if (doc.requerido && !archivos[doc.clave]) {
        setErrorGlobal(`Debe adjuntar el archivo obligatorio: ${doc.nombre}`);
        return false;
      }
    }
    return true;
  }

  async function handleEnviarSolicitud() {
    setErrorGlobal(null);
    if (!declaracionJurada) {
      setErrorGlobal("Debe aceptar la declaración jurada para continuar");
      return;
    }

    setEnviando(true);
    try {
      const formData = new FormData();
      const payload = {
        via,
        modalidad,
        programa,
        titulo: titulo.trim(),
        anioEgreso,
        cantidadTesistas,
        participante1: {
          nombres: p1.nombres.trim(),
          apellidos: p1.apellidos.trim(),
          dni: p1.dni.trim(),
          cui: p1.cui.trim() || undefined,
          email: p1.email.trim().toLowerCase(),
          telefono: p1.telefono.trim() || undefined,
          nacionalidad: p1.nacionalidad.trim() || "Peruana",
          ciudad: p1.ciudad.trim() || undefined,
          direccion: p1.direccion.trim() || undefined,
        },
        participante2:
          cantidadTesistas === 2
            ? {
                nombres: p2.nombres.trim(),
                apellidos: p2.apellidos.trim(),
                dni: p2.dni.trim(),
                cui: p2.cui.trim() || undefined,
                email: p2.email.trim().toLowerCase(),
                telefono: p2.telefono.trim() || undefined,
                nacionalidad: p2.nacionalidad.trim() || "Peruana",
                ciudad: p2.ciudad.trim() || undefined,
                direccion: p2.direccion.trim() || undefined,
              }
            : undefined,
        declaracionJurada: true as const,
      };

      formData.append("datos", JSON.stringify(payload));

      for (const [clave, file] of Object.entries(archivos)) {
        const orden = clave.endsWith("_2") ? 2 : 1;
        formData.append(`archivo_${clave}_${orden}`, file);
      }

      const res = await crearSolicitudPublica(formData);
      setResultadoExitoso({ codigo: res.codigo });
    } catch (err: unknown) {
      setErrorGlobal(err instanceof Error ? err.message : "Error al registrar la solicitud");
    } finally {
      setEnviando(false);
    }
  }

  if (resultadoExitoso) {
    return (
      <main className="min-h-screen bg-[#eef1f4] py-12 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-xl">
          <Card className="p-8 text-center shadow-flotante">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-verde-inst-100 text-verde-inst-700 mb-4">
              <CheckCircle size={36} />
            </div>
            <h1 className="text-2xl font-bold text-navy-950">¡Solicitud Registrada con Éxito!</h1>
            <p className="mt-2 text-sm text-grafito-600">
              Tu solicitud ha sido remitida a la Unidad de Grados y Títulos de la FIPS - UNSA.
            </p>

            <div className="my-6 rounded-2xl border border-navy-200 bg-navy-50/60 p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-navy-800">
                Código de Trámite Generado
              </p>
              <p className="mt-1 font-mono text-3xl font-bold tracking-tight text-navy-950">
                {resultadoExitoso.codigo}
              </p>
              <p className="mt-2 text-xs text-grafito-600">
                Guarda este código para tus consultas. Hemos enviado un correo de confirmación a tu
                cuenta.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-left text-xs text-grafito-700 space-y-2 mb-6">
              <p className="font-bold text-navy-900">¿Qué sigue?</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>La secretaría académica revisará la conformidad de tus documentos.</li>
                <li>
                  Si todo está conforme, se creará tu expediente formal SET y recibirás tus
                  credenciales.
                </li>
                <li>
                  Si hay observaciones, recibirás un enlace de subsanación válido por 10 días
                  hábiles.
                </li>
              </ul>
            </div>

            <Link className="inline-block" to="/">
              <Button variante="contorno">Volver al Inicio</Button>
            </Link>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#eef1f4] py-8 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        {/* Encabezado Institucional */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-navy-950 text-white font-bold text-lg shadow-sm">
              <GraduationCap size={24} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-navy-950">Mesa de Partes Virtual</h1>
              <p className="text-xs text-grafito-600">
                Segunda Especialidad en Ingeniería de Sistemas · FIPS UNSA
              </p>
            </div>
          </div>
          <Link to="/login">
            <Button tamano="sm" variante="fantasma">
              Ingreso Personal
            </Button>
          </Link>
        </div>

        {/* Indicador de Pasos del Wizard */}
        <div className="mb-6 grid grid-cols-4 gap-2">
          {[
            { num: 1, label: "Datos Académicos", icono: <GraduationCap size={14} /> },
            { num: 2, label: "Tesista(s)", icono: <User size={14} /> },
            { num: 3, label: "Documentos", icono: <Upload size={14} /> },
            { num: 4, label: "Confirmación", icono: <Send size={14} /> },
          ].map((item) => (
            <div
              className={`flex items-center gap-2 rounded-xl p-3 border text-xs font-semibold transition-all ${
                paso === item.num
                  ? "border-navy-800 bg-navy-950 text-white shadow-md"
                  : paso > item.num
                    ? "border-verde-inst-300 bg-verde-inst-50 text-verde-inst-800"
                    : "border-slate-200 bg-white text-grafito-500"
              }`}
              key={item.num}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  paso === item.num
                    ? "bg-white text-navy-950"
                    : paso > item.num
                      ? "bg-verde-inst-600 text-white"
                      : "bg-slate-100 text-slate-600"
                }`}
              >
                {paso > item.num ? "✓" : item.num}
              </span>
              <span className="truncate hidden sm:inline">{item.label}</span>
            </div>
          ))}
        </div>

        {errorGlobal && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
            <AlertCircle size={16} className="shrink-0" />
            <span>{errorGlobal}</span>
          </div>
        )}

        <Card className="p-6 shadow-card">
          {/* PASO 1: DATOS ACADÉMICOS */}
          {paso === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-bold text-navy-950">
                  Paso 1: Modalidad y Datos Académicos
                </h2>
                <p className="text-xs text-grafito-600">
                  Seleccione la vía de titulación y programa de estudios.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field etiqueta="Vía de Ingreso">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      className={`flex items-center justify-center gap-2 rounded-lg border p-2.5 text-xs font-bold transition-all ${
                        via === "REGULAR"
                          ? "border-navy-800 bg-navy-50 text-navy-900"
                          : "border-slate-200 bg-white text-grafito-600 hover:border-slate-300"
                      }`}
                      onClick={() => setVia("REGULAR")}
                      type="button"
                    >
                      Vía Regular
                    </button>
                    <button
                      className={`flex items-center justify-center gap-2 rounded-lg border p-2.5 text-xs font-bold transition-all ${
                        via === "TALLER"
                          ? "border-navy-800 bg-navy-50 text-navy-900"
                          : "border-slate-200 bg-white text-grafito-600 hover:border-slate-300"
                      }`}
                      onClick={() => setVia("TALLER")}
                      type="button"
                    >
                      Taller de Tesis
                    </button>
                  </div>
                </Field>

                <Field etiqueta="Modalidad de Titulación">
                  <Select value={modalidad} onChange={(v) => setModalidad(v as Modalidad)}>
                    <option value="TESIS">Tesis</option>
                    <option value="TRABAJO_ACADEMICO">Trabajo Académico</option>
                    <option value="ARTICULO">Artículo Científico</option>
                  </Select>
                </Field>
              </div>

              <Field etiqueta="Programa de Segunda Especialidad">
                <Select value={programa} onChange={(v) => setPrograma(v)}>
                  {PROGRAMAS_OFICIALES.map((p) => (
                    <option key={p.codigo} value={p.nombre}>
                      {p.nombre}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                ayuda="Título tentativo del plan registrado en mesa de partes."
                etiqueta="Título del Plan de Tesis / Trabajo Académico"
              >
                <textarea
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-grafito-900 shadow-card placeholder:text-slate-400 focus:border-navy-800 focus:outline-none"
                  placeholder="Ej. Arquitectura orientada a servicios para la interoperabilidad en gobiernos regionales..."
                  rows={3}
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field etiqueta="Año de Egreso">
                  <input
                    className="h-9 w-full rounded-lg border border-slate-300 px-3 text-sm text-grafito-900 shadow-card focus:border-navy-800 focus:outline-none"
                    max={2100}
                    min={1970}
                    type="number"
                    value={anioEgreso}
                    onChange={(e) => setAnioEgreso(Number(e.target.value) || 2026)}
                  />
                </Field>

                <Field etiqueta="Cantidad de Tesistas">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      className={`flex items-center justify-center gap-1.5 rounded-lg border p-2 text-xs font-semibold ${
                        cantidadTesistas === 1
                          ? "border-navy-800 bg-navy-50 text-navy-950 font-bold"
                          : "border-slate-200 bg-white text-grafito-600"
                      }`}
                      onClick={() => setCantidadTesistas(1)}
                      type="button"
                    >
                      <User size={14} /> 1 Tesista
                    </button>
                    <button
                      className={`flex items-center justify-center gap-1.5 rounded-lg border p-2 text-xs font-semibold ${
                        cantidadTesistas === 2
                          ? "border-navy-800 bg-navy-50 text-navy-950 font-bold"
                          : "border-slate-200 bg-white text-grafito-600"
                      }`}
                      onClick={() => setCantidadTesistas(2)}
                      type="button"
                    >
                      <Users size={14} /> 2 Tesistas
                    </button>
                  </div>
                </Field>
              </div>

              <div className="flex justify-end pt-4 border-t border-slate-100">
                <Button
                  onClick={() => {
                    if (validarPaso1()) setPaso(2);
                  }}
                  variante="primario"
                >
                  Siguiente: Datos de Tesistas <ArrowRight size={16} />
                </Button>
              </div>
            </div>
          )}

          {/* PASO 2: DATOS DE PARTICIPANTES */}
          {paso === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-base font-bold text-navy-950">
                  Paso 2: Datos de Postulante(s)
                </h2>
                <p className="text-xs text-grafito-600">
                  {cantidadTesistas === 1
                    ? "Ingrese los datos personales y de contacto del postulante titular."
                    : "Ingrese los datos del postulante titular y co-tesista."}
                </p>
              </div>

              {/* Tesista 1 */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-navy-950 text-white text-xs font-bold">
                    1
                  </span>
                  <span className="text-xs font-bold text-navy-950 uppercase tracking-wide">
                    Tesista Titular
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field etiqueta="Nombres">
                    <input
                      className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs text-grafito-900 shadow-card focus:border-navy-800 focus:outline-none"
                      placeholder="Juan Carlos"
                      value={p1.nombres}
                      onChange={(e) => setP1({ ...p1, nombres: e.target.value })}
                    />
                  </Field>
                  <Field etiqueta="Apellidos">
                    <input
                      className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs text-grafito-900 shadow-card focus:border-navy-800 focus:outline-none"
                      placeholder="Pérez Gómez"
                      value={p1.apellidos}
                      onChange={(e) => setP1({ ...p1, apellidos: e.target.value })}
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Field etiqueta="DNI (8 dígitos)">
                    <input
                      className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs font-mono text-grafito-900 shadow-card focus:border-navy-800 focus:outline-none"
                      maxLength={8}
                      placeholder="76543210"
                      value={p1.dni}
                      onChange={(e) => setP1({ ...p1, dni: e.target.value.replace(/\D/g, "") })}
                    />
                  </Field>
                  <Field etiqueta="CUI (8 dígitos, opcional)">
                    <input
                      className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs font-mono text-grafito-900 shadow-card focus:border-navy-800 focus:outline-none"
                      maxLength={8}
                      placeholder="20180456"
                      value={p1.cui}
                      onChange={(e) =>
                        setP1({ ...p1, cui: e.target.value.replace(/\D/g, "").slice(0, 8) })
                      }
                    />
                  </Field>
                  <Field etiqueta="Teléfono / Celular">
                    <input
                      className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs text-grafito-900 shadow-card focus:border-navy-800 focus:outline-none"
                      placeholder="959123456"
                      value={p1.telefono}
                      onChange={(e) => setP1({ ...p1, telefono: e.target.value })}
                    />
                  </Field>
                </div>

                <Field
                  ayuda="A este correo se remitirán observaciones y credenciales de acceso."
                  etiqueta="Correo Electrónico"
                >
                  <input
                    className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs text-grafito-900 shadow-card focus:border-navy-800 focus:outline-none"
                    placeholder="postulante@unsa.edu.pe"
                    type="email"
                    value={p1.email}
                    onChange={(e) => setP1({ ...p1, email: e.target.value })}
                  />
                </Field>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field etiqueta="Ciudad">
                    <input
                      className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs text-grafito-900 shadow-card focus:border-navy-800 focus:outline-none"
                      placeholder="Arequipa"
                      value={p1.ciudad}
                      onChange={(e) => setP1({ ...p1, ciudad: e.target.value })}
                    />
                  </Field>
                  <Field etiqueta="Dirección Domiciliaria">
                    <input
                      className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs text-grafito-900 shadow-card focus:border-navy-800 focus:outline-none"
                      placeholder="Av. Independencia s/n"
                      value={p1.direccion}
                      onChange={(e) => setP1({ ...p1, direccion: e.target.value })}
                    />
                  </Field>
                </div>
              </div>

              {/* Tesista 2 si aplica */}
              {cantidadTesistas === 2 && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-navy-800 text-white text-xs font-bold">
                      2
                    </span>
                    <span className="text-xs font-bold text-navy-800 uppercase tracking-wide">
                      Segundo Tesista (Co-Tesista)
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field etiqueta="Nombres">
                      <input
                        className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs text-grafito-900 shadow-card focus:border-navy-800 focus:outline-none"
                        placeholder="María Elena"
                        value={p2.nombres}
                        onChange={(e) => setP2({ ...p2, nombres: e.target.value })}
                      />
                    </Field>
                    <Field etiqueta="Apellidos">
                      <input
                        className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs text-grafito-900 shadow-card focus:border-navy-800 focus:outline-none"
                        placeholder="Quispe Mamani"
                        value={p2.apellidos}
                        onChange={(e) => setP2({ ...p2, apellidos: e.target.value })}
                      />
                    </Field>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Field etiqueta="DNI (8 dígitos)">
                      <input
                        className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs font-mono text-grafito-900 shadow-card focus:border-navy-800 focus:outline-none"
                        maxLength={8}
                        placeholder="87654321"
                        value={p2.dni}
                        onChange={(e) => setP2({ ...p2, dni: e.target.value.replace(/\D/g, "") })}
                      />
                    </Field>
                    <Field etiqueta="CUI (8 dígitos, opcional)">
                      <input
                        className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs font-mono text-grafito-900 shadow-card focus:border-navy-800 focus:outline-none"
                        maxLength={8}
                        placeholder="20180457"
                        value={p2.cui}
                        onChange={(e) =>
                          setP2({ ...p2, cui: e.target.value.replace(/\D/g, "").slice(0, 8) })
                        }
                      />
                    </Field>
                    <Field etiqueta="Teléfono / Celular">
                      <input
                        className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs text-grafito-900 shadow-card focus:border-navy-800 focus:outline-none"
                        placeholder="959987654"
                        value={p2.telefono}
                        onChange={(e) => setP2({ ...p2, telefono: e.target.value })}
                      />
                    </Field>
                  </div>

                  <Field etiqueta="Correo Electrónico Distinto">
                    <input
                      className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs text-grafito-900 shadow-card focus:border-navy-800 focus:outline-none"
                      placeholder="co-tesista@unsa.edu.pe"
                      type="email"
                      value={p2.email}
                      onChange={(e) => setP2({ ...p2, email: e.target.value })}
                    />
                  </Field>
                </div>
              )}

              <div className="flex justify-between pt-4 border-t border-slate-100">
                <Button onClick={() => setPaso(1)} variante="contorno">
                  <ArrowLeft size={16} /> Atrás
                </Button>
                <Button
                  onClick={() => {
                    if (validarPaso2()) setPaso(3);
                  }}
                  variante="primario"
                >
                  Siguiente: Documentos <ArrowRight size={16} />
                </Button>
              </div>
            </div>
          )}

          {/* PASO 3: DOCUMENTOS DIGITALES */}
          {paso === 3 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-bold text-navy-950">
                  Paso 3: Carga de Requisitos Digitales
                </h2>
                <p className="text-xs text-grafito-600">
                  Adjunte los archivos requeridos en formato PDF (máximo 20MB por documento).
                </p>
              </div>

              <div className="space-y-4">
                {docsRequeridos.map((doc) => {
                  const cargado = archivos[doc.clave];
                  return (
                    <div
                      className={`flex flex-col gap-3 rounded-xl border p-4 transition-colors ${
                        cargado
                          ? "border-verde-inst-300 bg-verde-inst-50/40"
                          : "border-slate-200 bg-white"
                      }`}
                      key={doc.clave}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                              cargado
                                ? "bg-verde-inst-600 text-white"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {cargado ? <CheckCircle size={20} /> : <FileText size={20} />}
                          </span>
                          <div>
                            <p className="text-xs font-bold text-navy-950">
                              {doc.nombre}{" "}
                              {doc.requerido && <span className="text-red-600 font-bold">*</span>}
                            </p>
                            <p className="text-[11px] text-grafito-600">
                              {cargado
                                ? `${cargado.name} (${Math.round(cargado.size / 1024)} KB)`
                                : `Formatos permitidos: ${doc.esFoto ? "PDF, JPG o PNG" : "Solo PDF"}`}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <label className="cursor-pointer">
                            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-grafito-700 shadow-sm hover:bg-slate-50">
                              <Paperclip size={13} />
                              {cargado
                                ? "Cambiar archivo"
                                : doc.esFoto
                                  ? "Adjuntar Foto"
                                  : "Adjuntar PDF"}
                            </span>
                            <input
                              accept={doc.formatos ?? "application/pdf"}
                              className="hidden"
                              onChange={(e) =>
                                handleFileChange(doc.clave, e.target.files?.[0] ?? null, doc.esFoto)
                              }
                              type="file"
                            />
                          </label>
                        </div>
                      </div>

                      {/* Guías, anotaciones y enlaces de ayuda */}
                      {(doc.guiaTexto || doc.guiaCorreo || doc.guiaEnlaces || doc.guiaManual) && (
                        <div className="rounded-lg bg-blue-50/70 p-3 text-xs text-blue-950 border border-blue-100 space-y-1.5">
                          {doc.guiaTexto && (
                            <div className="flex items-start gap-1.5 font-medium leading-relaxed">
                              <Info size={14} className="mt-0.5 shrink-0 text-blue-700" />
                              <span>{doc.guiaTexto}</span>
                            </div>
                          )}

                          {doc.guiaEnlaces && (
                            <div className="flex flex-wrap gap-2 pt-1 pl-5">
                              {doc.guiaEnlaces.map((enl) => (
                                <a
                                  key={enl.url}
                                  href={enl.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 rounded bg-white px-2.5 py-1 text-[11px] font-semibold text-navy-800 shadow-sm border border-blue-200 hover:bg-blue-50 hover:text-navy-950"
                                >
                                  <ExternalLink size={12} className="text-blue-600" />
                                  {enl.texto}
                                </a>
                              ))}
                            </div>
                          )}

                          {doc.guiaCorreo && (
                            <div className="flex items-center gap-1.5 pl-5 text-[11px] font-semibold text-blue-900">
                              <Mail size={13} className="text-blue-700" />
                              <span>Solicitar a: </span>
                              <a
                                href={`mailto:${doc.guiaCorreo}`}
                                className="underline hover:text-navy-950"
                              >
                                {doc.guiaCorreo}
                              </a>
                            </div>
                          )}

                          {doc.guiaManual && (
                            <div className="pt-1.5 border-t border-blue-200/60 pl-5 space-y-1 text-[11px]">
                              <p className="font-semibold text-blue-900">{doc.guiaManual.texto}</p>
                              <a
                                href={doc.guiaManual.enlace.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 font-bold text-navy-800 underline hover:text-navy-950"
                              >
                                <ExternalLink size={12} className="text-blue-600" />
                                {doc.guiaManual.enlace.texto}
                              </a>
                              <p className="text-blue-800 italic">{doc.guiaManual.correoSoporte}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-between pt-4 border-t border-slate-100">
                <Button onClick={() => setPaso(2)} variante="contorno">
                  <ArrowLeft size={16} /> Atrás
                </Button>
                <Button
                  onClick={() => {
                    if (validarPaso3()) setPaso(4);
                  }}
                  variante="primario"
                >
                  Siguiente: Revisión Final <ArrowRight size={16} />
                </Button>
              </div>
            </div>
          )}

          {/* PASO 4: CONFIRMACIÓN Y DECLARACIÓN JURADA */}
          {paso === 4 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-bold text-navy-950">
                  Paso 4: Declaración Jurada y Envío
                </h2>
                <p className="text-xs text-grafito-600">
                  Verifique los datos de su solicitud antes de realizar el envío oficial.
                </p>
              </div>

              {/* Resumen */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-grafito-500 uppercase text-[10px] font-bold">Vía:</span>
                    <p className="font-semibold text-navy-950">
                      {via === "REGULAR" ? "Vía Regular" : "Taller de Tesis"}
                    </p>
                  </div>
                  <div>
                    <span className="text-grafito-500 uppercase text-[10px] font-bold">
                      Modalidad:
                    </span>
                    <p className="font-semibold text-navy-950">{modalidad}</p>
                  </div>
                </div>

                <div>
                  <span className="text-grafito-500 uppercase text-[10px] font-bold">
                    Programa:
                  </span>
                  <p className="font-semibold text-navy-950">{programa}</p>
                </div>

                <div>
                  <span className="text-grafito-500 uppercase text-[10px] font-bold">Título:</span>
                  <p className="font-semibold text-navy-950">{titulo}</p>
                </div>

                <div className="pt-2 border-t border-slate-200">
                  <span className="text-grafito-500 uppercase text-[10px] font-bold">
                    Postulante(s):
                  </span>
                  <p className="font-semibold text-navy-950">
                    1. {p1.nombres} {p1.apellidos} ({p1.dni} · {p1.email})
                  </p>
                  {cantidadTesistas === 2 && (
                    <p className="font-semibold text-navy-950">
                      2. {p2.nombres} {p2.apellidos} ({p2.dni} · {p2.email})
                    </p>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-200">
                  <span className="text-grafito-500 uppercase text-[10px] font-bold">
                    Archivos adjuntos:
                  </span>
                  <p className="text-grafito-700">
                    {Object.keys(archivos).length} documento(s) listos para transmisión
                  </p>
                </div>
              </div>

              {/* Declaración Jurada */}
              <label className="flex items-start gap-2.5 rounded-xl border border-navy-200 bg-navy-50/40 p-3.5 text-xs text-navy-950 cursor-pointer">
                <input
                  checked={declaracionJurada}
                  className="mt-0.5 rounded border-navy-300 text-navy-800 focus:ring-navy-800"
                  onChange={(e) => setDeclaracionJurada(e.target.checked)}
                  type="checkbox"
                />
                <span>
                  Declaro bajo juramento que toda la información consignada y los documentos
                  adjuntos son auténticos y corresponden a mi persona, asumiendo responsabilidad
                  administrativa, civil y penal en caso de falsedad (Ley N° 27444).
                </span>
              </label>

              <div className="flex justify-between pt-4 border-t border-slate-100">
                <Button disabled={enviando} onClick={() => setPaso(3)} variante="contorno">
                  <ArrowLeft size={16} /> Atrás
                </Button>
                <Button
                  disabled={!declaracionJurada || enviando}
                  onClick={() => void handleEnviarSolicitud()}
                  variante="primario"
                >
                  <Send size={16} />{" "}
                  {enviando ? "Transmitiendo..." : "Confirmar y Enviar Solicitud"}
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
