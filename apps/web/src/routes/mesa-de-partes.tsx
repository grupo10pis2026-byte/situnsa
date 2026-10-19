import { PROGRAMAS_OFICIALES } from "@pis/domain/dist/expediente/seguimiento-catalogo.js";
import { Link } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  FileText,
  GraduationCap,
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

  // Lista de documentos requeridos según vía
  const docsRequeridos =
    via === "REGULAR"
      ? [
          { clave: "FUT", nombre: "Solicitud de Inscripción / FUT", requerido: true },
          {
            clave: "PLAN_TESIS",
            nombre: "Plan de Tesis o Trabajo Académico (PDF)",
            requerido: true,
          },
          { clave: "CONSTANCIA_EGRESO", nombre: "Constancia de Egresado", requerido: true },
          {
            clave: "PAGO_TRAMITE",
            nombre: "Recibo de Pago por Derechos de Trámite",
            requerido: true,
          },
          { clave: "IDIOMA", nombre: "Certificado de Idioma Extranjero", requerido: false },
        ]
      : [
          { clave: "SOLICITUD_TALLER", nombre: "Ficha de Inscripción al Taller", requerido: true },
          { clave: "COMPROMISO", nombre: "Carta de Compromiso de Titulación", requerido: true },
          {
            clave: "PAGO_MATRICULA",
            nombre: "Recibo de Pago de Matrícula Taller",
            requerido: true,
          },
          { clave: "DNI_COPIA", nombre: "Copia de DNI Legible", requerido: true },
        ];

  function handleFileChange(clave: string, file: File | null) {
    if (!file) {
      setArchivos((prev) => {
        const copy = { ...prev };
        delete copy[clave];
        return copy;
      });
      return;
    }

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setErrorGlobal(`El archivo "${file.name}" debe ser formato PDF`);
      return;
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
        formData.append(`archivo_${clave}_1`, file);
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
                  <Field etiqueta="CUI (Opcional)">
                    <input
                      className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs font-mono text-grafito-900 shadow-card focus:border-navy-800 focus:outline-none"
                      placeholder="20180456"
                      value={p1.cui}
                      onChange={(e) => setP1({ ...p1, cui: e.target.value })}
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
                    <Field etiqueta="CUI (Opcional)">
                      <input
                        className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs font-mono text-grafito-900 shadow-card focus:border-navy-800 focus:outline-none"
                        placeholder="20180457"
                        value={p2.cui}
                        onChange={(e) => setP2({ ...p2, cui: e.target.value })}
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

              <div className="space-y-3">
                {docsRequeridos.map((doc) => {
                  const cargado = archivos[doc.clave];
                  return (
                    <div
                      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border p-3.5 transition-colors ${
                        cargado
                          ? "border-verde-inst-300 bg-verde-inst-50/40"
                          : "border-slate-200 bg-white"
                      }`}
                      key={doc.clave}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                            cargado ? "bg-verde-inst-600 text-white" : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {cargado ? <CheckCircle size={18} /> : <FileText size={18} />}
                        </span>
                        <div>
                          <p className="text-xs font-bold text-navy-950">
                            {doc.nombre}{" "}
                            {doc.requerido && <span className="text-red-600 font-bold">*</span>}
                          </p>
                          <p className="text-[11px] text-grafito-600">
                            {cargado
                              ? `${cargado.name} (${Math.round(cargado.size / 1024)} KB)`
                              : "No adjuntado aún"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <label className="cursor-pointer">
                          <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-grafito-700 shadow-sm hover:bg-slate-50">
                            <Paperclip size={13} />
                            {cargado ? "Cambiar archivo" : "Adjuntar PDF"}
                          </span>
                          <input
                            accept="application/pdf"
                            className="hidden"
                            onChange={(e) =>
                              handleFileChange(doc.clave, e.target.files?.[0] ?? null)
                            }
                            type="file"
                          />
                        </label>
                      </div>
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
