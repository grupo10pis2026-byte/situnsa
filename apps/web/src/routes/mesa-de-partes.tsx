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
  HelpCircle,
  Image as ImageIcon,
  Info,
  Mail,
  Send,
  UploadCloud,
  User,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { crearSolicitudPublica } from "../api/solicitudes.js";
import { Button } from "../components/ui/button.js";
import { Card } from "../components/ui/card.js";
import { Field } from "../components/ui/field.js";
import { Select } from "../components/ui/select.js";
import { LandingPage } from "./landing.js";

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

export function MesaDePartesPage() {
  const [enWizard, setEnWizard] = useState(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("iniciar") === "true";
    }
    return false;
  });
  const [paso, setPaso] = useState<1 | 2 | 3 | 4>(1);

  // Paso 1: Académicos
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
  const [guiaAbierta, setGuiaAbierta] = useState<Record<string, boolean>>({});

  // Paso 4: Declaración Jurada
  const [declaracionJurada, setDeclaracionJurada] = useState(false);

  // Estado de envío
  const [enviando, setEnviando] = useState(false);
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);
  const [resultadoExitoso, setResultadoExitoso] = useState<{
    modalidad: string;
    fecha: string;
  } | null>(null);

  // Requisitos documentarios según la modalidad seleccionada
  const docsRequeridos: RequisitoDoc[] = [
    ...(modalidad === "TESIS"
      ? [
          {
            clave: "ANEXO_17",
            nombre: "Solicitud de Inscripción de Proyecto Plan de Tesis (ANEXO 17)",
            requerido: true,
            guiaTexto:
              "Completar y adjuntar el formato oficial Anexo 17 debidamente firmado por el/los tesista(s).",
          },
          {
            clave: "ANEXO_18",
            nombre: "Carta de Aceptación de Asesoramiento (ANEXO 18)",
            requerido: true,
            guiaTexto: "Carta de aceptación de asesoramiento firmada por el asesor propuesto.",
          },
          {
            clave: "PLAN_TESIS",
            nombre: "Proyecto Plan de Tesis en PDF",
            requerido: true,
            guiaTexto: "Se adjunta esquema. Utilizar el formato oficial actualizado:",
            guiaEnlaces: [
              {
                texto: "Descargar Formato Plan de Tesis (Google Docs)",
                url: "https://docs.google.com/document/d/1rHSCqSIEXVKPxxQYG0jAPfF9hhZVCxbJ/edit?usp=drive_web&ouid=106454452671119045265&rtpof=true",
              },
            ],
          },
          {
            clave: "AUTORIZACION_EMPRESA",
            nombre: "Autorización de Uso de Información de Empresa / Institución",
            requerido: false,
            guiaTexto:
              "En caso se haga uso del nombre o información de una empresa o institución, adjuntar la autorización suscrita por su representante o titular.",
          },
          {
            clave: "PAGO_TRAMITE",
            nombre: "Recibo por Trámite Documentario (S/. 6.00)",
            requerido: true,
            guiaTexto:
              "Adjuntar el abono correspondiente por trámite documentario (S/. 6.00), generando su ticket con el correo institucional indicando PENSIÓN a través de UNSAPay.",
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
                "En caso de no poder ingresar a su correo institucional, solicite soporte a: soportecorreo@unsa.edu.pe",
            },
          },
        ]
      : modalidad === "TRABAJO_ACADEMICO"
        ? [
            {
              clave: "ANEXO_17",
              nombre: "Solicitud de Inscripción de Proyecto de Trabajo Académico (ANEXO 17)",
              requerido: true,
              guiaTexto: "Completar y adjuntar el formato oficial Anexo 17 debidamente firmado.",
            },
            {
              clave: "CONSTANCIA_TRABAJO",
              nombre: "Constancia o Certificado de Trabajo (≥ 2 años desde egreso)",
              requerido: true,
              guiaTexto:
                "Acreditar la experiencia en la especialidad con una constancia o certificado de trabajo de al menos 2 años a partir de la fecha de egreso.",
            },
            {
              clave: "CERTIFICADO_SUNARP",
              nombre: "Certificado de Vigencia de Personas Jurídicas expedido por SUNARP",
              requerido: true,
              guiaTexto:
                "Certificado de vigencia de personas jurídicas expedida por SUNARP del registro de la entidad donde desarrolló el trabajo.",
            },
            {
              clave: "AUTORIZACION_EMPRESA",
              nombre: "Autorización de Uso de Información de Empresa / Institución",
              requerido: false,
              guiaTexto:
                "En caso se haga uso del nombre o información de una empresa o institución, adjuntar la autorización suscrita por su representante o titular.",
            },
            {
              clave: "ANEXO_18",
              nombre: "Carta de Aceptación de Asesoramiento (ANEXO 18)",
              requerido: true,
              guiaTexto: "Carta de aceptación debidamente suscrita por el docente asesor.",
            },
            {
              clave: "PLAN_TRABAJO_ACADEMICO",
              nombre: "Proyecto de Trabajo Académico en PDF",
              requerido: true,
              guiaTexto: "Descargar y completar el esquema oficial de Plan de Trabajo Académico:",
              guiaEnlaces: [
                {
                  texto: "Descargar Plan de Trabajo Académico (Google Docs)",
                  url: "https://docs.google.com/document/d/1e3RGNju998E4rWh2pgwahXNyI269a0Ri/edit?rtpof=true&tab=t.0",
                },
              ],
            },
            {
              clave: "PAGO_TRAMITE",
              nombre: "Recibo por Trámite Documentario (S/. 6.00)",
              requerido: true,
              guiaTexto:
                "Recibo de trámite documentario por S/. 6.00 emitido mediante el portal UNSAPay.",
              guiaEnlaces: [
                {
                  texto: "Acceder a UNSAPay",
                  url: "https://ouis.unsa.edu.pe/unsapay/login",
                },
              ],
            },
          ]
        : [
            {
              clave: "ANEXO_17",
              nombre: "Solicitud de Inscripción de Proyecto de Tesis Formato Artículo (ANEXO 17)",
              requerido: true,
              guiaTexto:
                "Solicitud de inscripción de proyecto formato artículo Anexo 17 suscrita por el postulante.",
            },
            {
              clave: "ANEXO_18",
              nombre: "Carta de Aceptación de Asesoramiento (ANEXO 18)",
              requerido: true,
              guiaTexto:
                "Si el asesor es externo nacional o internacional, debe contar con índice H5, con reconocida trayectoria y refrendado con CV documentado.",
            },
            {
              clave: "ARTICULO_INDEXADO",
              nombre: "Artículo en Revista Indexada (Scopus o Web of Science)",
              requerido: true,
              guiaTexto:
                "Publicación del artículo en revista indexada en Scopus o Web of Science, con filiación a la UNSA.",
            },
            {
              clave: "PAGO_TRAMITE",
              nombre: "Recibo por Trámite Documentario (S/. 6.00)",
              requerido: true,
              guiaTexto:
                "Recibo de pago por trámite documentario S/. 6.00 emitido mediante UNSAPay.",
              guiaEnlaces: [
                {
                  texto: "Acceder a UNSAPay",
                  url: "https://ouis.unsa.edu.pe/unsapay/login",
                },
              ],
            },
          ]),
    // Fotografías obligatorias para todas las modalidades
    {
      clave: "FOTO_ESTUDIANTE",
      nombre:
        cantidadTesistas === 2
          ? "Fotografía del Participante 1 (Fondo blanco, JPG)"
          : "Fotografía del Estudiante (Fondo blanco, JPG)",
      requerido: true,
      esFoto: true,
      formatos: ".jpg,.jpeg,.png,.pdf",
      guiaTexto:
        "Fotografía reciente, de frente, a color con fondo blanco digitalizada, vestimenta formal – Formato JPG.",
    },
    ...(cantidadTesistas === 2
      ? [
          {
            clave: "FOTO_PARTICIPANTE_2",
            nombre: "Fotografía del Participante 2 (Fondo blanco, JPG)",
            requerido: true,
            esFoto: true,
            formatos: ".jpg,.jpeg,.png,.pdf",
            guiaTexto:
              "Fotografía reciente, de frente, a color con fondo blanco digitalizada del segundo participante – Formato JPG.",
          },
        ]
      : []),
  ];

  function toggleGuia(clave: string) {
    setGuiaAbierta((prev) => ({ ...prev, [clave]: !prev[clave] }));
  }

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
      setErrorGlobal("El título del plan o trabajo debe tener al menos 10 caracteres");
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
      setErrorGlobal("Complete los nombres y apellidos del Participante 1");
      return false;
    }
    if (!/^\d{8}$/.test(p1.dni.trim())) {
      setErrorGlobal("El DNI del Participante 1 debe tener exactamente 8 dígitos numéricos");
      return false;
    }
    if (p1.cui.trim() && !/^\d{8}$/.test(p1.cui.trim())) {
      setErrorGlobal("El CUI del Participante 1 debe tener exactamente 8 dígitos numéricos");
      return false;
    }
    if (!p1.email.trim() || !p1.email.trim().toLowerCase().endsWith("@unsa.edu.pe")) {
      setErrorGlobal(
        "El Participante 1 debe registrar obligatoriamente su correo institucional (@unsa.edu.pe)",
      );
      return false;
    }
    if (p1.telefono.trim() && !/^\d{9}$/.test(p1.telefono.trim())) {
      setErrorGlobal("El teléfono del Participante 1 debe tener exactamente 9 dígitos");
      return false;
    }

    if (cantidadTesistas === 2) {
      if (!p2.nombres.trim() || !p2.apellidos.trim()) {
        setErrorGlobal("Complete los nombres y apellidos del Participante 2");
        return false;
      }
      if (!/^\d{8}$/.test(p2.dni.trim())) {
        setErrorGlobal("El DNI del Participante 2 debe tener exactamente 8 dígitos numéricos");
        return false;
      }
      if (p2.cui.trim() && !/^\d{8}$/.test(p2.cui.trim())) {
        setErrorGlobal("El CUI del Participante 2 debe tener exactamente 8 dígitos numéricos");
        return false;
      }
      if (!p2.email.trim() || !p2.email.trim().toLowerCase().endsWith("@unsa.edu.pe")) {
        setErrorGlobal(
          "El Participante 2 debe registrar obligatoriamente su correo institucional (@unsa.edu.pe)",
        );
        return false;
      }
      if (p2.telefono.trim() && !/^\d{9}$/.test(p2.telefono.trim())) {
        setErrorGlobal("El teléfono del Participante 2 debe tener exactamente 9 dígitos");
        return false;
      }
      if (p1.dni.trim() === p2.dni.trim()) {
        setErrorGlobal("El Participante 1 y el Participante 2 no pueden tener el mismo DNI");
        return false;
      }
      if (p1.email.trim().toLowerCase() === p2.email.trim().toLowerCase()) {
        setErrorGlobal("Cada participante debe registrar un correo institucional distinto");
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

      await crearSolicitudPublica(formData);

      const nombresModalidad: Record<Modalidad, string> = {
        TESIS: "Modalidad de Tesis",
        TRABAJO_ACADEMICO: "Modalidad de Trabajo Académico",
        ARTICULO: "Tesis en Formato de Artículo en Revista Indexada",
      };

      setResultadoExitoso({
        modalidad: nombresModalidad[modalidad],
        fecha: new Date().toLocaleDateString("es-PE", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        }),
      });
    } catch (err: unknown) {
      setErrorGlobal(err instanceof Error ? err.message : "Error al registrar la solicitud");
    } finally {
      setEnviando(false);
    }
  }

  // Pantalla de confirmación amigable sin IDs internos
  if (resultadoExitoso) {
    return (
      <main className="min-h-screen bg-slate-50 py-16 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
        <div className="w-full max-w-xl">
          <Card className="p-8 sm:p-10 text-center shadow-lg border border-slate-200/80 bg-white rounded-2xl">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-verde-inst-50 text-verde-inst-600 mb-6">
              <CheckCircle size={48} className="stroke-[2.2]" />
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-navy-950 tracking-tight">
              ¡Solicitud Recibida con Éxito!
            </h1>
            <p className="mt-3 text-sm text-grafito-600 leading-relaxed">
              Tu documentación para titulación ha sido transmitida satisfactoriamente a la Unidad de
              Grados y Títulos de la FIPS - UNSA.
            </p>

            {/* Resumen sutil de la postulación */}
            <div className="my-6 rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-left space-y-2 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-slate-200">
                <span className="text-grafito-500 font-medium">Modalidad elegida:</span>
                <span className="font-bold text-navy-950">{resultadoExitoso.modalidad}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200">
                <span className="text-grafito-500 font-medium">Fecha de registro:</span>
                <span className="font-semibold text-slate-800">{resultadoExitoso.fecha}</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-grafito-500 font-medium">Notificación:</span>
                <span className="font-semibold text-verde-inst-700">
                  Enviada al correo institucional
                </span>
              </div>
            </div>

            {/* Siguientes pasos */}
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-left text-xs text-blue-950 space-y-2 mb-8">
              <p className="font-bold text-navy-900 flex items-center gap-1.5">
                <Info size={14} className="text-blue-700" /> ¿Qué sucede ahora?
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-700">
                <li>La secretaría revisará la conformidad y legibilidad de tus requisitos.</li>
                <li>
                  De estar conforme, se apertura tu expediente oficial (SET) y recibirás tus accesos
                  personales.
                </li>
                <li>
                  Si existiera alguna precisión o documento observado, recibirás un enlace seguro a
                  tu correo UNSA para subsanarlo.
                </li>
              </ul>
            </div>

            <Link className="inline-block" to="/">
              <Button variante="primario" className="px-6">
                Volver a la Página Principal
              </Button>
            </Link>
          </Card>
        </div>
      </main>
    );
  }

  if (!enWizard) {
    return <LandingPage onIniciarTramite={() => setEnWizard(true)} />;
  }

  return (
    <main className="min-h-screen bg-slate-50/90 py-8 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        {/* Encabezado Institucional */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setEnWizard(false)}
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-navy-950 text-white font-bold text-lg shadow-sm hover:bg-navy-800 transition-colors"
              title="Volver a la presentación"
            >
              <GraduationCap size={24} />
            </button>
            <div>
              <h1 className="text-lg font-bold text-navy-950">Mesa de Partes Virtual</h1>
              <p className="text-xs text-grafito-600">
                Segunda Especialidad en Ingeniería de Sistemas · FIPS UNSA
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              tamano="sm"
              variante="fantasma"
              type="button"
              onClick={() => setEnWizard(false)}
            >
              Ver Requisitos
            </Button>
            <Link to="/login">
              <Button tamano="sm" variante="contorno">
                Ingreso Personal
              </Button>
            </Link>
          </div>
        </div>

        {/* Indicador de Pasos del Wizard */}
        <div className="mb-6 grid grid-cols-4 gap-2">
          {[
            { num: 1, label: "Datos Académicos", icono: <GraduationCap size={14} /> },
            { num: 2, label: "Participantes", icono: <User size={14} /> },
            { num: 3, label: "Documentos", icono: <UploadCloud size={14} /> },
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
          <div className="mb-5 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs font-medium text-red-700">
            <AlertCircle size={16} className="shrink-0" />
            <span>{errorGlobal}</span>
          </div>
        )}

        <Card className="p-6 sm:p-8 shadow-card border border-slate-200 bg-white rounded-2xl">
          {/* PASO 1: DATOS ACADÉMICOS */}
          {paso === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-base font-bold text-navy-950">
                  Paso 1: Modalidad y Datos Académicos
                </h2>
                <p className="text-xs text-grafito-600">
                  Seleccione la modalidad de titulación en Segunda Especialidad y registre el tema.
                </p>
              </div>

              {/* Grid 2 columnas pares */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field etiqueta="Modalidad de Titulación">
                  <Select
                    value={modalidad}
                    onChange={(v) => {
                      setModalidad(v as Modalidad);
                      setArchivos({}); // Limpiar archivos al cambiar modalidad
                    }}
                  >
                    <option value="TESIS">Modalidad de Tesis</option>
                    <option value="TRABAJO_ACADEMICO">Modalidad de Trabajo Académico</option>
                    <option value="ARTICULO">
                      Tesis o Artículo en Revista Indexada (Scopus/WoS)
                    </option>
                  </Select>
                </Field>

                <Field etiqueta="Programa de Segunda Especialidad">
                  <Select value={programa} onChange={(v) => setPrograma(v)}>
                    {PROGRAMAS_OFICIALES.map((p) => (
                      <option key={p.codigo} value={p.nombre}>
                        {p.nombre}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <Field
                ayuda="Título del proyecto según su plan presentado."
                etiqueta="Título del Plan de Tesis o Trabajo Académico"
              >
                <textarea
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-grafito-900 shadow-card placeholder:text-slate-400 focus:border-navy-800 focus:outline-none"
                  placeholder="Ej. Implementación de una plataforma de analítica para la optimización de procesos..."
                  rows={3}
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                />
              </Field>

              {/* Grid 2 columnas pares */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field etiqueta="Año de Egreso">
                  <input
                    className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs text-grafito-900 shadow-card focus:border-navy-800 focus:outline-none"
                    max={2100}
                    min={1970}
                    type="number"
                    value={anioEgreso}
                    onChange={(e) => setAnioEgreso(Number(e.target.value) || 2026)}
                  />
                </Field>

                <Field etiqueta="Cantidad de Participantes">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      className={`flex items-center justify-center gap-1.5 rounded-lg border p-2 text-xs font-semibold ${
                        cantidadTesistas === 1
                          ? "border-navy-800 bg-navy-50 text-navy-950 font-bold"
                          : "border-slate-200 bg-white text-grafito-600 hover:bg-slate-50"
                      }`}
                      onClick={() => setCantidadTesistas(1)}
                      type="button"
                    >
                      <User size={14} /> 1 Participante
                    </button>
                    <button
                      className={`flex items-center justify-center gap-1.5 rounded-lg border p-2 text-xs font-semibold ${
                        cantidadTesistas === 2
                          ? "border-navy-800 bg-navy-50 text-navy-950 font-bold"
                          : "border-slate-200 bg-white text-grafito-600 hover:bg-slate-50"
                      }`}
                      onClick={() => setCantidadTesistas(2)}
                      type="button"
                    >
                      <Users size={14} /> 2 Participantes
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
                  Siguiente: Datos de Participantes <ArrowRight size={16} />
                </Button>
              </div>
            </div>
          )}

          {/* PASO 2: DATOS DE PARTICIPANTES */}
          {paso === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-base font-bold text-navy-950">
                  Paso 2: Datos de Participante(s)
                </h2>
                <p className="text-xs text-grafito-600">
                  Ingrese los datos de filiación y contacto institucional para el trámite.
                </p>
              </div>

              {/* Alerta sutil */}
              <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-900">
                <Info size={15} className="shrink-0 text-blue-700" />
                <span>
                  Es obligatorio registrar su correo institucional <strong>@unsa.edu.pe</strong>.
                </span>
              </div>

              {/* Participante 1 */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-navy-950 text-white text-[11px] font-bold">
                    1
                  </span>
                  <span className="text-xs font-bold text-navy-950 uppercase tracking-wide">
                    Participante 1
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field etiqueta="Nombres">
                    <input
                      className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs text-grafito-900 shadow-card focus:border-navy-800 focus:outline-none"
                      placeholder="Nombres completos"
                      value={p1.nombres}
                      onChange={(e) => setP1({ ...p1, nombres: e.target.value })}
                    />
                  </Field>
                  <Field etiqueta="Apellidos">
                    <input
                      className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs text-grafito-900 shadow-card focus:border-navy-800 focus:outline-none"
                      placeholder="Apellidos completos"
                      value={p1.apellidos}
                      onChange={(e) => setP1({ ...p1, apellidos: e.target.value })}
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field etiqueta="DNI (8 dígitos)">
                    <input
                      className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs font-mono text-grafito-900 shadow-card focus:border-navy-800 focus:outline-none"
                      maxLength={8}
                      placeholder="12345678"
                      value={p1.dni}
                      onChange={(e) => setP1({ ...p1, dni: e.target.value.replace(/\D/g, "") })}
                    />
                  </Field>
                  <Field etiqueta="CUI (8 dígitos, opcional)">
                    <input
                      className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs font-mono text-grafito-900 shadow-card focus:border-navy-800 focus:outline-none"
                      maxLength={8}
                      placeholder="20201234"
                      value={p1.cui}
                      onChange={(e) =>
                        setP1({ ...p1, cui: e.target.value.replace(/\D/g, "").slice(0, 8) })
                      }
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field etiqueta="Correo Institucional UNSA">
                    <input
                      className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs text-grafito-900 shadow-card focus:border-navy-800 focus:outline-none"
                      placeholder="estudiante@unsa.edu.pe"
                      type="email"
                      value={p1.email}
                      onChange={(e) => setP1({ ...p1, email: e.target.value })}
                    />
                  </Field>
                  <Field etiqueta="Teléfono / Celular (9 dígitos, opcional)">
                    <input
                      className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs text-grafito-900 shadow-card focus:border-navy-800 focus:outline-none"
                      maxLength={9}
                      placeholder="987654321"
                      value={p1.telefono}
                      onChange={(e) =>
                        setP1({ ...p1, telefono: e.target.value.replace(/\D/g, "").slice(0, 9) })
                      }
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field etiqueta="Dirección Domiciliaria (opcional)">
                    <input
                      className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs text-grafito-900 shadow-card focus:border-navy-800 focus:outline-none"
                      placeholder="Av. Independencia s/n"
                      value={p1.direccion}
                      onChange={(e) => setP1({ ...p1, direccion: e.target.value })}
                    />
                  </Field>
                  <Field etiqueta="Ciudad">
                    <input
                      className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs text-grafito-900 shadow-card focus:border-navy-800 focus:outline-none"
                      placeholder="Arequipa"
                      value={p1.ciudad}
                      onChange={(e) => setP1({ ...p1, ciudad: e.target.value })}
                    />
                  </Field>
                </div>
              </div>

              {/* Participante 2 si aplica */}
              {cantidadTesistas === 2 && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 space-y-4">
                  <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-navy-800 text-white text-[11px] font-bold">
                      2
                    </span>
                    <span className="text-xs font-bold text-navy-800 uppercase tracking-wide">
                      Participante 2
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field etiqueta="Nombres">
                      <input
                        className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs text-grafito-900 shadow-card focus:border-navy-800 focus:outline-none"
                        placeholder="Nombres completos"
                        value={p2.nombres}
                        onChange={(e) => setP2({ ...p2, nombres: e.target.value })}
                      />
                    </Field>
                    <Field etiqueta="Apellidos">
                      <input
                        className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs text-grafito-900 shadow-card focus:border-navy-800 focus:outline-none"
                        placeholder="Apellidos completos"
                        value={p2.apellidos}
                        onChange={(e) => setP2({ ...p2, apellidos: e.target.value })}
                      />
                    </Field>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                        placeholder="20205678"
                        value={p2.cui}
                        onChange={(e) =>
                          setP2({ ...p2, cui: e.target.value.replace(/\D/g, "").slice(0, 8) })
                        }
                      />
                    </Field>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field etiqueta="Correo Institucional UNSA">
                      <input
                        className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs text-grafito-900 shadow-card focus:border-navy-800 focus:outline-none"
                        placeholder="segundo_estudiante@unsa.edu.pe"
                        type="email"
                        value={p2.email}
                        onChange={(e) => setP2({ ...p2, email: e.target.value })}
                      />
                    </Field>
                    <Field etiqueta="Teléfono / Celular (9 dígitos, opcional)">
                      <input
                        className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs text-grafito-900 shadow-card focus:border-navy-800 focus:outline-none"
                        maxLength={9}
                        placeholder="912345678"
                        value={p2.telefono}
                        onChange={(e) =>
                          setP2({ ...p2, telefono: e.target.value.replace(/\D/g, "").slice(0, 9) })
                        }
                      />
                    </Field>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field etiqueta="Dirección Domiciliaria (opcional)">
                      <input
                        className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs text-grafito-900 shadow-card focus:border-navy-800 focus:outline-none"
                        placeholder="Calle Los Rosales 123"
                        value={p2.direccion}
                        onChange={(e) => setP2({ ...p2, direccion: e.target.value })}
                      />
                    </Field>
                    <Field etiqueta="Ciudad">
                      <input
                        className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs text-grafito-900 shadow-card focus:border-navy-800 focus:outline-none"
                        placeholder="Arequipa"
                        value={p2.ciudad}
                        onChange={(e) => setP2({ ...p2, ciudad: e.target.value })}
                      />
                    </Field>
                  </div>
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
                  Siguiente: Documentos Requeridos <ArrowRight size={16} />
                </Button>
              </div>
            </div>
          )}

          {/* PASO 3: DOCUMENTOS DIGITALES CON DRAG & DROP Y AYUDAS SUTILES */}
          {paso === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-base font-bold text-navy-950">
                  Paso 3: Carga de Documentos Requeridos
                </h2>
                <p className="text-xs text-grafito-600">
                  Arrastre o seleccione cada documento en formato PDF (o imagen JPG para las
                  fotografías).
                </p>
              </div>

              <div className="space-y-3.5">
                {docsRequeridos.map((doc) => {
                  const cargado = archivos[doc.clave];
                  const tieneGuia =
                    Boolean(doc.guiaTexto) ||
                    Boolean(doc.guiaEnlaces) ||
                    Boolean(doc.guiaCorreo) ||
                    Boolean(doc.guiaManual);
                  const guiaVisible = guiaAbierta[doc.clave] ?? false;

                  return (
                    <section
                      key={doc.clave}
                      aria-label={`Zona de carga: ${doc.nombre}`}
                      className={`rounded-xl border p-4 transition-all ${
                        cargado
                          ? "border-verde-inst-300 bg-verde-inst-50/20 shadow-sm"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const file = e.dataTransfer.files?.[0];
                        if (file) handleFileChange(doc.clave, file, doc.esFoto);
                      }}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <span
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                              cargado
                                ? "bg-verde-inst-600 text-white"
                                : doc.esFoto
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {cargado ? (
                              <CheckCircle size={20} />
                            ) : doc.esFoto ? (
                              <ImageIcon size={20} />
                            ) : (
                              <FileText size={20} />
                            )}
                          </span>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-xs font-bold text-navy-950">{doc.nombre}</p>
                              {doc.requerido ? (
                                <span className="rounded bg-red-50 text-red-600 px-1.5 py-0.2 text-[10px] font-bold">
                                  Obligatorio
                                </span>
                              ) : (
                                <span className="rounded bg-slate-100 text-slate-600 px-1.5 py-0.2 text-[10px] font-semibold">
                                  Opcional
                                </span>
                              )}
                              {tieneGuia && (
                                <button
                                  type="button"
                                  onClick={() => toggleGuia(doc.clave)}
                                  className="text-slate-400 hover:text-navy-950 inline-flex items-center gap-0.5 text-[11px] ml-1 transition-colors"
                                  title="Ver guía y formato"
                                >
                                  <HelpCircle size={13} />
                                  <span className="underline text-[10px]">Ayuda</span>
                                </button>
                              )}
                            </div>

                            {cargado ? (
                              <div className="mt-1 flex items-center gap-2 text-[11px] text-verde-inst-700 font-medium">
                                <span className="truncate max-w-xs">{cargado.name}</span>
                                <span className="text-slate-400">·</span>
                                <span>{(cargado.size / 1024).toFixed(0)} KB</span>
                              </div>
                            ) : (
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                Arrastre el archivo aquí o haga clic para examinar
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Botón de adjuntar o quitar */}
                        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                          {cargado ? (
                            <button
                              type="button"
                              onClick={() => handleFileChange(doc.clave, null)}
                              className="inline-flex items-center gap-1 text-[11px] text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50"
                              title="Quitar archivo"
                            >
                              <X size={14} /> Quitar
                            </button>
                          ) : null}

                          <label className="cursor-pointer">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors ${
                                cargado
                                  ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                                  : "border-navy-800 bg-navy-950 text-white hover:bg-navy-900"
                              }`}
                            >
                              <UploadCloud size={14} />
                              {cargado ? "Reemplazar" : "Subir Archivo"}
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

                      {/* Guía desplegable sutil */}
                      {tieneGuia && guiaVisible && (
                        <div className="mt-3 pt-3 border-t border-slate-100 rounded-lg bg-slate-50/80 p-3 text-xs text-slate-700 space-y-2">
                          {doc.guiaTexto && (
                            <div className="flex items-start gap-1.5">
                              <Info size={14} className="mt-0.5 shrink-0 text-navy-800" />
                              <span className="leading-relaxed">{doc.guiaTexto}</span>
                            </div>
                          )}

                          {doc.guiaEnlaces && (
                            <div className="flex flex-wrap gap-2 pl-5 pt-0.5">
                              {doc.guiaEnlaces.map((enl) => (
                                <a
                                  key={enl.url}
                                  href={enl.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 rounded bg-white px-2.5 py-1 text-[11px] font-semibold text-navy-800 shadow-sm border border-slate-200 hover:bg-slate-100"
                                >
                                  <ExternalLink size={12} className="text-blue-600" />
                                  {enl.texto}
                                </a>
                              ))}
                            </div>
                          )}

                          {doc.guiaCorreo && (
                            <div className="flex items-center gap-1.5 pl-5 text-[11px] font-semibold text-slate-800">
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
                            <div className="pt-1.5 border-t border-slate-200/60 pl-5 space-y-1 text-[11px]">
                              <p className="font-semibold text-slate-800">{doc.guiaManual.texto}</p>
                              <a
                                href={doc.guiaManual.enlace.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 font-bold text-navy-800 underline hover:text-navy-950"
                              >
                                <ExternalLink size={12} className="text-blue-600" />
                                {doc.guiaManual.enlace.texto}
                              </a>
                              <p className="text-slate-600 italic">
                                {doc.guiaManual.correoSoporte}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </section>
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
                  Siguiente: Revisión y Envío <ArrowRight size={16} />
                </Button>
              </div>
            </div>
          )}

          {/* PASO 4: REVISIÓN FINAL Y DECLARACIÓN JURADA */}
          {paso === 4 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-base font-bold text-navy-950">
                  Paso 4: Declaración Jurada y Envío
                </h2>
                <p className="text-xs text-grafito-600">
                  Revise el resumen de su solicitud antes de realizar el envío oficial.
                </p>
              </div>

              {/* Resumen en 2 columnas */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-5 space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-3 border-b border-slate-200">
                  <div>
                    <span className="text-grafito-500 uppercase text-[10px] font-bold">
                      Modalidad:
                    </span>
                    <p className="font-semibold text-navy-950">
                      {modalidad === "TESIS"
                        ? "Modalidad de Tesis"
                        : modalidad === "TRABAJO_ACADEMICO"
                          ? "Modalidad de Trabajo Académico"
                          : "Tesis o Artículo en Revista Indexada"}
                    </p>
                  </div>
                  <div>
                    <span className="text-grafito-500 uppercase text-[10px] font-bold">
                      Programa:
                    </span>
                    <p className="font-semibold text-navy-950">{programa}</p>
                  </div>
                </div>

                <div>
                  <span className="text-grafito-500 uppercase text-[10px] font-bold">Título:</span>
                  <p className="font-semibold text-navy-950">{titulo}</p>
                </div>

                <div className="pt-3 border-t border-slate-200">
                  <span className="text-grafito-500 uppercase text-[10px] font-bold">
                    Participante(s):
                  </span>
                  <p className="font-semibold text-navy-950 mt-0.5">
                    1. {p1.nombres} {p1.apellidos} (DNI: {p1.dni} · {p1.email})
                  </p>
                  {cantidadTesistas === 2 && (
                    <p className="font-semibold text-navy-950 mt-1">
                      2. {p2.nombres} {p2.apellidos} (DNI: {p2.dni} · {p2.email})
                    </p>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-200">
                  <span className="text-grafito-500 uppercase text-[10px] font-bold">
                    Documentos listos:
                  </span>
                  <p className="text-grafito-700 font-medium mt-0.5">
                    {Object.keys(archivos).length} archivo(s) digital(es) cargados y validados
                  </p>
                </div>
              </div>

              {/* Declaración Jurada */}
              <label className="flex items-start gap-2.5 rounded-xl border border-navy-200 bg-navy-50/40 p-4 text-xs text-navy-950 cursor-pointer">
                <input
                  checked={declaracionJurada}
                  className="mt-0.5 rounded border-navy-300 text-navy-800 focus:ring-navy-800"
                  onChange={(e) => setDeclaracionJurada(e.target.checked)}
                  type="checkbox"
                />
                <span className="leading-relaxed">
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
                  {enviando ? "Transmitiendo solicitud..." : "Confirmar y Enviar Solicitud"}
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
