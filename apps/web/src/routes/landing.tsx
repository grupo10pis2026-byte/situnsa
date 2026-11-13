import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpen,
  Briefcase,
  Check,
  CheckCircle2,
  GraduationCap,
  LockKeyhole,
  Mail,
  Newspaper,
  Sparkles,
} from "lucide-react";
import { useId } from "react";

export interface LandingPageProps {
  /** Enlace o acción para iniciar el wizard del formulario. */
  onIniciarTramite?: () => void;
  /** Ruta destino para el botón principal si no se pasa callback (por defecto "/mesa-de-partes"). */
  rutaWizard?: string;
}

/**
 * Landing Page de la Mesa de Partes Virtual - Sistema de Titulación (Segunda Especialidad UNSA).
 * Diseño limpio en tonos claros, institucional, profesional y accesible.
 */
export function LandingPage({
  onIniciarTramite,
  rutaWizard = "/mesa-de-partes",
}: LandingPageProps) {
  const idModalidades = useId();
  const idRequisitos = useId();
  const idAvisoNormativo = useId();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors duration-200">
      {/* 1. NAVEGACIÓN INSTITUCIONAL */}
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          {/* Logo UNSA / FIPS */}
          <Link
            to="/"
            className="group flex items-center gap-3 transition-opacity hover:opacity-90 focus-visible:outline-none"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-navy-950 text-dorado-500 shadow-sm transition-transform group-hover:scale-105">
              <GraduationCap size={24} className="stroke-[2.2]" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold tracking-widest text-guinda-800 uppercase">
                UNSA · FIPS
              </span>
              <span className="text-sm font-extrabold tracking-tight text-navy-950 sm:text-base">
                Segunda Especialidad
              </span>
              <span className="hidden text-[11px] text-slate-500 sm:block">
                Mesa de Partes Virtual de Titulación
              </span>
            </div>
          </Link>

          {/* Navegación central */}
          <nav className="hidden items-center gap-8 md:flex">
            <a
              href={`#${idModalidades}`}
              className="text-xs font-semibold text-slate-600 transition-colors hover:text-navy-950"
            >
              Modalidades
            </a>
            <a
              href={`#${idRequisitos}`}
              className="text-xs font-semibold text-slate-600 transition-colors hover:text-navy-950"
            >
              Requisitos
            </a>
            <a
              href={`#${idAvisoNormativo}`}
              className="text-xs font-semibold text-slate-600 transition-colors hover:text-navy-950"
            >
              Aviso Normativo
            </a>
          </nav>

          {/* Ingreso Personal / Administrativo */}
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:text-navy-950 sm:text-sm"
            >
              <LockKeyhole size={14} className="opacity-70" />
              <span>Ingreso Administrativo</span>
            </Link>
          </div>
        </div>
      </header>

      {/* 2. HERO SECTION */}
      <section className="relative px-4 pt-12 pb-16 sm:px-6 lg:px-8 lg:pt-16 lg:pb-20 border-b border-slate-200/80 bg-gradient-to-b from-white to-slate-50">
        <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-12 lg:gap-8">
          {/* Columna Izquierda: Texto y CTA */}
          <div className="text-center lg:col-span-7 lg:text-left">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-guinda-800/20 bg-guinda-50 px-3.5 py-1 text-xs font-semibold text-guinda-800">
              <Sparkles size={14} />
              <span>Vía Regular de Titulación · 100% Digital</span>
            </div>

            <h1 className="text-3xl font-black tracking-tight text-navy-950 sm:text-4xl md:text-5xl lg:text-5xl leading-tight">
              Mesa de Partes Virtual de Titulación
            </h1>

            <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600 sm:text-lg lg:mx-0 leading-relaxed">
              Presenta la inscripción de tu tema y plan de tesis, trabajo académico o artículo
              científico para optar el Título de Segunda Especialidad en la FIPS - UNSA.
            </p>

            {/* Botón CTA principal destacado */}
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row lg:justify-start">
              {onIniciarTramite ? (
                <button
                  type="button"
                  onClick={onIniciarTramite}
                  className="group inline-flex w-full items-center justify-center gap-3 rounded-xl bg-navy-950 px-8 py-3.5 text-sm font-bold text-white shadow-md transition-all duration-200 hover:bg-navy-900 active:scale-[0.98] sm:w-auto"
                >
                  <span>Iniciar Solicitud de Inscripción</span>
                  <ArrowRight
                    size={18}
                    className="transition-transform duration-200 group-hover:translate-x-1"
                  />
                </button>
              ) : (
                <Link
                  to={rutaWizard}
                  className="group inline-flex w-full items-center justify-center gap-3 rounded-xl bg-navy-950 px-8 py-3.5 text-sm font-bold text-white shadow-md transition-all duration-200 hover:bg-navy-900 active:scale-[0.98] sm:w-auto"
                >
                  <span>Iniciar Solicitud de Inscripción</span>
                  <ArrowRight
                    size={18}
                    className="transition-transform duration-200 group-hover:translate-x-1"
                  />
                </Link>
              )}

              <a
                href={`#${idModalidades}`}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3.5 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 sm:w-auto"
              >
                <span>Conoce las Modalidades</span>
              </a>
            </div>

            <div className="mt-6 flex items-center justify-center lg:justify-start gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 size={15} className="text-verde-inst-600" />
                Trámite en 4 sencillos pasos
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 size={15} className="text-verde-inst-600" />
                Validación con correo institucional
              </span>
            </div>
          </div>

          {/* Columna Derecha: Tarjeta Ilustrativa de Pasos */}
          <div className="lg:col-span-5">
            <div className="relative mx-auto max-w-md lg:max-w-none">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-md">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-verde-inst-500 animate-pulse" />
                    <span className="text-xs font-bold text-navy-950 uppercase tracking-wide">
                      Flujo de Inscripción
                    </span>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-700">
                    FIPS · UNSA
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-navy-950 text-white font-bold text-xs">
                        1
                      </div>
                      <div>
                        <p className="text-xs font-bold text-navy-950">Datos Académicos</p>
                        <p className="text-[11px] text-slate-500">Modalidad, programa y tema</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold text-verde-inst-700">Paso 1</span>
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-navy-950 text-white font-bold text-xs">
                        2
                      </div>
                      <div>
                        <p className="text-xs font-bold text-navy-950">Participante(s)</p>
                        <p className="text-[11px] text-slate-500">
                          DNI y correo institucional UNSA
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold text-verde-inst-700">Paso 2</span>
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-navy-950 text-white font-bold text-xs">
                        3
                      </div>
                      <div>
                        <p className="text-xs font-bold text-navy-950">Carga de Documentos</p>
                        <p className="text-[11px] text-slate-500">
                          Plan PDF, Anexo 17, 18 y foto JPG
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold text-verde-inst-700">Paso 3</span>
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-navy-950 text-white font-bold text-xs">
                        4
                      </div>
                      <div>
                        <p className="text-xs font-bold text-navy-950">Confirmación y Envío</p>
                        <p className="text-[11px] text-slate-500">
                          Declaración jurada y notificación
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold text-verde-inst-700">Paso 4</span>
                  </div>
                </div>

                <div className="mt-4 rounded-xl bg-slate-100/70 p-3 text-center text-[11px] text-slate-600">
                  <p className="font-semibold text-navy-950">
                    Revisión directa por la Secretaría de Grados y Títulos
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. SECCIÓN DE MODALIDADES DE TITULACIÓN */}
      <section id={idModalidades} className="py-16 sm:py-20 border-b border-slate-200/80">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <span className="text-xs font-bold tracking-wider text-guinda-800 uppercase">
              Procedimientos Oficiales FIPS
            </span>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-navy-950 sm:text-3xl">
              Modalidades de Titulación Habilitadas
            </h2>
            <p className="mt-3 text-sm text-slate-600">
              Conforme al Reglamento de Grados y Títulos de la FIPS - UNSA, la 1ra Etapa
              (Inscripción del Tema) contempla tres modalidades en Vía Regular:
            </p>
          </div>

          <div id={idRequisitos} className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* MODALIDAD 1: TESIS */}
            <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-slate-300 hover:shadow-md transition-all">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-navy-950 text-white shadow-sm">
                    <BookOpen size={20} />
                  </div>
                  <span className="rounded-full bg-navy-50 px-2.5 py-0.5 text-[11px] font-bold text-navy-900 border border-navy-200">
                    Investigación
                  </span>
                </div>

                <h3 className="mt-4 text-lg font-bold text-navy-950">Modalidad de Tesis</h3>
                <p className="mt-1 text-xs text-slate-600">
                  Desarrollo de un proyecto o plan de tesis de investigación original con asesoría
                  docente.
                </p>

                <div className="mt-5 space-y-2.5 text-xs text-slate-700">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    Documentos requeridos (Etapa 1):
                  </p>
                  <div className="flex items-start gap-2">
                    <Check size={14} className="mt-0.5 text-verde-inst-600 shrink-0" />
                    <span>Solicitud de Inscripción Proyecto Plan de Tesis (ANEXO 17)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check size={14} className="mt-0.5 text-verde-inst-600 shrink-0" />
                    <span>Carta de Aceptación de Asesoramiento (ANEXO 18)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check size={14} className="mt-0.5 text-verde-inst-600 shrink-0" />
                    <span>Proyecto Plan de Tesis en PDF</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check size={14} className="mt-0.5 text-verde-inst-600 shrink-0" />
                    <span>Recibo por Trámite Documentario S/. 6.00</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check size={14} className="mt-0.5 text-verde-inst-600 shrink-0" />
                    <span>Fotografía formal a color en JPG (fondo blanco)</span>
                  </div>
                  <div className="flex items-start gap-2 text-slate-500">
                    <Check size={14} className="mt-0.5 text-slate-400 shrink-0" />
                    <span>Autorización de uso de nombre de empresa (si aplica)</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-3 border-t border-slate-100 text-[11px] text-slate-500">
                Permite registro individual o en parejas (máximo 2 participantes).
              </div>
            </div>

            {/* MODALIDAD 2: TRABAJO ACADÉMICO */}
            <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-slate-300 hover:shadow-md transition-all">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-guinda-800 text-white shadow-sm">
                    <Briefcase size={20} />
                  </div>
                  <span className="rounded-full bg-guinda-50 px-2.5 py-0.5 text-[11px] font-bold text-guinda-800 border border-guinda-200">
                    Experiencia
                  </span>
                </div>

                <h3 className="mt-4 text-lg font-bold text-navy-950">Trabajo Académico</h3>
                <p className="mt-1 text-xs text-slate-600">
                  Acreditación de experiencia profesional de al menos 2 años desde la fecha de
                  egreso.
                </p>

                <div className="mt-5 space-y-2.5 text-xs text-slate-700">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    Documentos requeridos (Etapa 1):
                  </p>
                  <div className="flex items-start gap-2">
                    <Check size={14} className="mt-0.5 text-verde-inst-600 shrink-0" />
                    <span>Solicitud de Inscripción Trabajo Académico (ANEXO 17)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check size={14} className="mt-0.5 text-verde-inst-600 shrink-0" />
                    <span>Constancia o Certificado de Trabajo de 2 años</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check size={14} className="mt-0.5 text-verde-inst-600 shrink-0" />
                    <span>Certificado de Vigencia Personas Jurídicas SUNARP</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check size={14} className="mt-0.5 text-verde-inst-600 shrink-0" />
                    <span>Carta de Aceptación de Asesoramiento (ANEXO 18)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check size={14} className="mt-0.5 text-verde-inst-600 shrink-0" />
                    <span>Proyecto de Trabajo Académico en PDF</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check size={14} className="mt-0.5 text-verde-inst-600 shrink-0" />
                    <span>Recibo por Trámite Documentario S/. 6.00 y foto JPG</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-3 border-t border-slate-100 text-[11px] text-slate-500">
                Postulación individual sustentada en experiencia laboral.
              </div>
            </div>

            {/* MODALIDAD 3: ARTÍCULO EN REVISTA INDEXADA */}
            <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-slate-300 hover:shadow-md transition-all">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-900 text-white shadow-sm">
                    <Newspaper size={20} />
                  </div>
                  <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-900 border border-blue-200">
                    Publicación
                  </span>
                </div>

                <h3 className="mt-4 text-lg font-bold text-navy-950">
                  Artículo en Revista Indexada
                </h3>
                <p className="mt-1 text-xs text-slate-600">
                  Tesis en formato de artículo publicado en revistas indexadas en Scopus o Web of
                  Science.
                </p>

                <div className="mt-5 space-y-2.5 text-xs text-slate-700">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    Documentos requeridos (Etapa 1):
                  </p>
                  <div className="flex items-start gap-2">
                    <Check size={14} className="mt-0.5 text-verde-inst-600 shrink-0" />
                    <span>Solicitud de Inscripción Formato Artículo (ANEXO 17)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check size={14} className="mt-0.5 text-verde-inst-600 shrink-0" />
                    <span>Carta de Aceptación de Asesoramiento (ANEXO 18)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check size={14} className="mt-0.5 text-verde-inst-600 shrink-0" />
                    <span>Artículo publicado en Scopus o Web of Science (afiliación UNSA)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check size={14} className="mt-0.5 text-verde-inst-600 shrink-0" />
                    <span>Recibo por Trámite Documentario S/. 6.00</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check size={14} className="mt-0.5 text-verde-inst-600 shrink-0" />
                    <span>Fotografía formal a color en JPG (fondo blanco)</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-3 border-t border-slate-100 text-[11px] text-slate-500">
                Asesor externo con índice H5 y CV documentado.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. AVISO NORMATIVO INSTITUCIONAL */}
      <section id={idAvisoNormativo} className="py-14 bg-white border-b border-slate-200">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-navy-950 text-white">
                <Mail size={22} />
              </div>
              <div className="space-y-2 text-xs text-slate-700">
                <h3 className="text-base font-bold text-navy-950">
                  Uso Obligatorio de Correo Institucional UNSA (@unsa.edu.pe)
                </h3>
                <p className="leading-relaxed">
                  A través del correo institucional se realizará todo trámite de titulación. No se
                  admiten cuentas personales (Gmail, Hotmail, etc.).
                </p>
                <p className="leading-relaxed text-slate-600">
                  En caso de no contar con correo institucional activo, solicítalo enviando un
                  correo desde tu mail personal a:{" "}
                  <a
                    href="mailto:soportecorreo@unsa.edu.pe"
                    className="font-bold text-navy-950 underline"
                  >
                    soportecorreo@unsa.edu.pe
                  </a>{" "}
                  indicando número de DNI, CUI, apellidos y nombres, o comunicándote al 958362273 de
                  lunes a viernes de 8:00 a 15:45 h.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. FOOTER */}
      <footer className="bg-slate-100 py-10 text-xs text-slate-500">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 font-bold text-navy-950">
            <GraduationCap size={18} />
            <span>UNSA · FIPS · Segunda Especialidad</span>
          </div>
          <p>
            © 2026 Universidad Nacional de San Agustín de Arequipa. Todos los derechos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}
