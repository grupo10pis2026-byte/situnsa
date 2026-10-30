import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpen,
  Briefcase,
  Building2,
  Check,
  CheckCircle2,
  ExternalLink,
  FileCheck2,
  GraduationCap,
  HelpCircle,
  LockKeyhole,
  Mail,
  ShieldAlert,
  ShieldCheck,
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
 * Vista de presentación amigable, moderna, minimalista con soporte de Dark Mode y Glassmorphism.
 */
export function LandingPage({
  onIniciarTramite,
  rutaWizard = "/mesa-de-partes",
}: LandingPageProps) {
  const idModalidades = useId();
  const idRequisitos = useId();
  const idAvisoNormativo = useId();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-100 to-slate-200/90 text-slate-900 transition-colors duration-300 dark:from-[#07131e] dark:via-[#0b1f30] dark:to-[#050c13] dark:text-slate-100">
      {/* Halo de luz decorativo de fondo */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 left-1/2 h-96 w-[48rem] -translate-x-1/2 rounded-full bg-gradient-to-tr from-guinda-800/15 via-dorado-500/10 to-transparent blur-3xl dark:from-guinda-700/20 dark:via-dorado-500/15 dark:to-transparent" />
        <div className="absolute top-1/3 -right-40 h-80 w-80 rounded-full bg-navy-800/10 blur-3xl dark:bg-navy-800/30" />
      </div>

      {/* 1. NAVEGACIÓN (HEADER) */}
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/75 backdrop-blur-md transition-colors duration-300 dark:border-white/10 dark:bg-[#0b1f30]/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          {/* Logo UNSA / EPIS */}
          <Link
            to="/"
            className="group flex items-center gap-3 transition-opacity hover:opacity-90 focus-visible:outline-none"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800 text-dorado-500 shadow-md ring-1 ring-dorado-500/30 transition-transform group-hover:scale-105">
              <GraduationCap size={24} className="stroke-[2.2]" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold tracking-widest text-guinda-800 uppercase dark:text-dorado-500">
                UNSA · FIPS
              </span>
              <span className="text-sm font-extrabold tracking-tight text-navy-950 sm:text-base dark:text-white">
                EPIS Titulación
              </span>
              <span className="hidden text-[11px] text-slate-500 sm:block dark:text-slate-400">
                Mesa de Partes Virtual
              </span>
            </div>
          </Link>

          {/* Navegación central (Navegación Fácil) */}
          <nav className="hidden items-center gap-8 md:flex">
            <a
              href={`#${idModalidades}`}
              className="text-xs font-semibold text-slate-600 transition-colors hover:text-navy-950 dark:text-slate-300 dark:hover:text-white"
            >
              Modalidades
            </a>
            <a
              href={`#${idRequisitos}`}
              className="text-xs font-semibold text-slate-600 transition-colors hover:text-navy-950 dark:text-slate-300 dark:hover:text-white"
            >
              Requisitos
            </a>
            <a
              href={`#${idAvisoNormativo}`}
              className="text-xs font-semibold text-slate-600 transition-colors hover:text-navy-950 dark:text-slate-300 dark:hover:text-white"
            >
              Aviso Normativo
            </a>
          </nav>

          {/* Botón discreto: Ingreso Administrativo */}
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300/80 bg-white/60 px-3.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm backdrop-blur-sm transition-all hover:border-slate-400 hover:bg-slate-100 hover:text-navy-950 sm:text-sm dark:border-white/15 dark:bg-slate-800/40 dark:text-slate-200 dark:hover:border-white/30 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <LockKeyhole size={14} className="opacity-70" />
              <span>Ingreso Administrativo</span>
            </Link>
          </div>
        </div>
      </header>

      {/* 2. HERO SECTION (LLAMADA A LA ACCIÓN) */}
      <section className="relative px-4 pt-10 pb-16 sm:px-6 lg:px-8 lg:pt-16 lg:pb-24">
        <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-12 lg:gap-8">
          {/* Columna Izquierda: Texto y CTA */}
          <div className="text-center lg:col-span-7 lg:text-left">
            {/* Badge institucional */}
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-guinda-800/20 bg-guinda-800/10 px-3.5 py-1 text-xs font-semibold text-guinda-800 backdrop-blur-md dark:border-dorado-500/30 dark:bg-dorado-500/15 dark:text-dorado-500">
              <Sparkles size={14} />
              <span>Trámite Oficial 100% Digital</span>
            </div>

            {/* Título Principal */}
            <h1 className="text-3xl font-black tracking-tight text-navy-950 sm:text-4xl md:text-5xl lg:text-6xl dark:text-white">
              Sistema de Titulación - Segunda Especialidad
            </h1>

            {/* Subtítulo breve */}
            <p className="mx-auto mt-5 max-w-2xl text-base text-slate-600 sm:text-lg lg:mx-0 dark:text-slate-300">
              Inicia tu trámite de grado académico de forma digital, rápida y segura.
            </p>

            {/* Botón CTA principal destacado */}
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row lg:justify-start">
              {onIniciarTramite ? (
                <button
                  type="button"
                  onClick={onIniciarTramite}
                  className="group inline-flex w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-guinda-800 via-guinda-700 to-guinda-800 px-8 py-4 text-base font-bold text-white shadow-lg shadow-guinda-800/25 transition-all duration-200 hover:from-guinda-700 hover:to-guinda-800 hover:shadow-xl hover:shadow-guinda-800/40 active:scale-[0.98] sm:w-auto"
                >
                  <span>Iniciar Trámite de Titulación</span>
                  <ArrowRight
                    size={18}
                    className="transition-transform duration-200 group-hover:translate-x-1"
                  />
                </button>
              ) : (
                <Link
                  to={rutaWizard}
                  className="group inline-flex w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-guinda-800 via-guinda-700 to-guinda-800 px-8 py-4 text-base font-bold text-white shadow-lg shadow-guinda-800/25 transition-all duration-200 hover:from-guinda-700 hover:to-guinda-800 hover:shadow-xl hover:shadow-guinda-800/40 active:scale-[0.98] sm:w-auto"
                >
                  <span>Iniciar Trámite de Titulación</span>
                  <ArrowRight
                    size={18}
                    className="transition-transform duration-200 group-hover:translate-x-1"
                  />
                </Link>
              )}

              <a
                href="#requisitos"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white/60 px-5 py-4 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur-sm transition-all hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800/50 dark:text-slate-200 dark:hover:bg-slate-800 sm:w-auto"
              >
                <span>Ver Requisitos</span>
              </a>
            </div>

            {/* Garantías y sellos de confianza */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-500 lg:justify-start dark:text-slate-400">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
                <span>Sin colas presenciales</span>
              </div>
              <div className="flex items-center gap-1.5">
                <ShieldCheck size={16} className="text-emerald-600 dark:text-emerald-400" />
                <span>Validación con firma digital</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Mail size={16} className="text-emerald-600 dark:text-emerald-400" />
                <span>Notificación en tu correo UNSA</span>
              </div>
            </div>
          </div>

          {/* Columna Derecha: Tarjeta Visual Ilustrativa (Imagen / Wireframe Hero) */}
          <div className="lg:col-span-5">
            <div className="relative mx-auto max-w-md lg:max-w-none">
              {/* Tarjeta de cristal representativa del trámite SET */}
              <div className="relative rounded-3xl border border-white/60 bg-white/60 p-6 shadow-2xl backdrop-blur-xl transition-all duration-300 dark:border-white/10 dark:bg-slate-900/60 dark:shadow-black/50">
                {/* Cabecera de la tarjeta ilustrativa */}
                <div className="flex items-center justify-between border-b border-slate-200/60 pb-4 dark:border-white/10">
                  <div className="flex items-center gap-2.5">
                    <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-bold text-navy-950 uppercase tracking-wide dark:text-white">
                      Mesa de Partes Virtual
                    </span>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    SET · FIPS
                  </span>
                </div>

                {/* Contenido ilustrativo de los pasos */}
                <div className="mt-5 space-y-3.5">
                  <div className="rounded-xl border border-slate-200/80 bg-white/80 p-3.5 shadow-sm dark:border-white/10 dark:bg-slate-800/60">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-navy-950 text-white dark:bg-white dark:text-navy-950">
                          <Check size={14} className="stroke-[3]" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-navy-950 dark:text-white">
                            Paso 1: Datos Académicos
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            Modalidad y programa seleccionado
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                        Completado
                      </span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200/80 bg-white/80 p-3.5 shadow-sm dark:border-white/10 dark:bg-slate-800/60">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-navy-950 text-white dark:bg-white dark:text-navy-950">
                          <Check size={14} className="stroke-[3]" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-navy-950 dark:text-white">
                            Paso 2: Datos de Participantes
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            Validación de DNI y correo @unsa.edu.pe
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                        Completado
                      </span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-dorado-500/40 bg-dorado-500/10 p-3.5 shadow-sm dark:border-dorado-500/30 dark:bg-dorado-500/10">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-dorado-500 text-navy-950 font-bold text-xs">
                          3
                        </div>
                        <div>
                          <p className="text-xs font-bold text-navy-950 dark:text-white">
                            Paso 3: Carga de Documentos
                          </p>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300">
                            Plan / Proyecto, Anexos 17 y 18 en PDF
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-amber-700 dark:text-dorado-500">
                        En curso
                      </span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-dashed border-slate-300 bg-white/40 p-3.5 opacity-70 dark:border-slate-700 dark:bg-slate-800/20">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-200 text-slate-600 text-xs font-bold dark:bg-slate-700 dark:text-slate-300">
                        4
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          Paso 4: Declaración Jurada y Envío
                        </p>
                        <p className="text-[11px] text-slate-400">Generación de código SET</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sello de seguridad institucional al pie de la tarjeta */}
                <div className="mt-5 rounded-2xl border border-navy-100 bg-gradient-to-r from-navy-950/5 to-guinda-800/5 p-3 text-center dark:border-white/10 dark:from-white/5 dark:to-transparent">
                  <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    Universidad Nacional de San Agustín de Arequipa
                  </p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-400">
                    Plataforma Oficial de Grados y Títulos
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. SECCIÓN DE BENEFICIOS / FLUJO AMIGABLE */}
      <section className="border-y border-slate-200/80 bg-white/50 py-10 backdrop-blur-sm dark:border-white/10 dark:bg-slate-900/40">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 md:grid-cols-3">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-950 text-dorado-500 dark:bg-white dark:text-navy-950">
                <FileCheck2 size={20} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-navy-950 dark:text-white">
                  1. Prepara tus Requisitos
                </h2>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  Verifica tu modalidad y ten listos en formato PDF tu plan de tesis o proyecto y
                  anexos.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-950 text-dorado-500 dark:bg-white dark:text-navy-950">
                <Building2 size={20} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-navy-950 dark:text-white">
                  2. Registra tu Solicitud
                </h2>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  Completa el formulario en 4 sencillos pasos con tus datos personales y correo
                  institucional.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-950 text-dorado-500 dark:bg-white dark:text-navy-950">
                <ShieldCheck size={20} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-navy-950 dark:text-white">
                  3. Seguimiento Transparente
                </h2>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  Recibe tu código único SET para conocer en todo momento el avance de tu
                  expediente.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. SECCIÓN DE MODALIDADES Y REQUISITOS (TARJETAS INFORMATIVAS CON GLASSMORPHISM) */}
      <section id={idModalidades} className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <span className="text-xs font-bold tracking-wider text-guinda-800 uppercase dark:text-dorado-500">
              Modalidades y Requisitos
            </span>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-navy-950 sm:text-3xl dark:text-white">
              Conoce las vías habilitadas para tu titulación
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
              Asegúrate de contar con la documentación requerida antes de comenzar tu registro
              virtual.
            </p>
          </div>

          <div id={idRequisitos} className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-3">
            {/* TARJETA 1: TESIS */}
            <div className="group relative flex flex-col justify-between rounded-3xl border border-white/60 bg-white/70 p-7 shadow-xl shadow-slate-200/50 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-2xl dark:border-white/10 dark:bg-slate-900/60 dark:shadow-black/40 dark:hover:border-white/20">
              <div>
                {/* Cabecera de la tarjeta */}
                <div className="flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-navy-950 to-navy-800 text-white shadow-md dark:from-white dark:to-slate-200 dark:text-navy-950">
                    <BookOpen size={24} />
                  </div>
                  <span className="rounded-full bg-navy-100 px-3 py-1 text-[11px] font-bold text-navy-950 dark:bg-white/10 dark:text-slate-200">
                    Investigación
                  </span>
                </div>

                <h3 className="mt-5 text-xl font-bold text-navy-950 dark:text-white">Tesis</h3>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  Desarrollo de un trabajo de investigación riguroso orientado al campo de
                  especialidad.
                </p>

                {/* Lista de requisitos */}
                <div className="mt-6 space-y-3">
                  <p className="text-xs font-bold tracking-wide text-slate-800 uppercase dark:text-slate-300">
                    Requisitos principales:
                  </p>

                  <div className="flex items-start gap-2.5 rounded-xl border border-slate-200/80 bg-white/70 p-3 text-xs text-slate-700 shadow-sm dark:border-white/5 dark:bg-slate-800/50 dark:text-slate-200">
                    <CheckCircle2
                      size={16}
                      className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                    />
                    <div>
                      <span className="font-bold text-navy-950 dark:text-white">
                        Plan de Tesis:
                      </span>{" "}
                      Documento formal del plan de investigación debidamente estructurado.
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 rounded-xl border border-slate-200/80 bg-white/70 p-3 text-xs text-slate-700 shadow-sm dark:border-white/5 dark:bg-slate-800/50 dark:text-slate-200">
                    <CheckCircle2
                      size={16}
                      className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                    />
                    <div>
                      <span className="font-bold text-navy-950 dark:text-white">Anexo 17:</span>{" "}
                      Declaración jurada de autenticidad del plan de tesis.
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 rounded-xl border border-slate-200/80 bg-white/70 p-3 text-xs text-slate-700 shadow-sm dark:border-white/5 dark:bg-slate-800/50 dark:text-slate-200">
                    <CheckCircle2
                      size={16}
                      className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                    />
                    <div>
                      <span className="font-bold text-navy-950 dark:text-white">Anexo 18:</span>{" "}
                      Carta de conformidad y compromiso del docente asesor.
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8 border-t border-slate-200/70 pt-4 dark:border-white/10">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Habilita postulación individual o en parejas (máximo 2 tesistas).
                </p>
              </div>
            </div>

            {/* TARJETA 2: TRABAJO ACADÉMICO */}
            <div className="group relative flex flex-col justify-between rounded-3xl border border-white/60 bg-white/70 p-7 shadow-xl shadow-slate-200/50 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-2xl dark:border-white/10 dark:bg-slate-900/60 dark:shadow-black/40 dark:hover:border-white/20">
              <div>
                {/* Cabecera de la tarjeta */}
                <div className="flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-guinda-800 to-guinda-700 text-white shadow-md">
                    <Briefcase size={24} />
                  </div>
                  <span className="rounded-full bg-guinda-800/10 px-3 py-1 text-[11px] font-bold text-guinda-800 dark:bg-dorado-500/15 dark:text-dorado-500">
                    Profesional
                  </span>
                </div>

                <h3 className="mt-5 text-xl font-bold text-navy-950 dark:text-white">
                  Trabajo Académico
                </h3>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  Desarrollo de proyectos aplicados basados en la experiencia profesional en
                  ingeniería.
                </p>

                {/* Lista de requisitos */}
                <div className="mt-6 space-y-3">
                  <p className="text-xs font-bold tracking-wide text-slate-800 uppercase dark:text-slate-300">
                    Requisitos principales:
                  </p>

                  <div className="flex items-start gap-2.5 rounded-xl border border-slate-200/80 bg-white/70 p-3 text-xs text-slate-700 shadow-sm dark:border-white/5 dark:bg-slate-800/50 dark:text-slate-200">
                    <CheckCircle2
                      size={16}
                      className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                    />
                    <div>
                      <span className="font-bold text-navy-950 dark:text-white">
                        Proyecto de Trabajo:
                      </span>{" "}
                      Propuesta técnica aplicada al sector productivo o empresarial.
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 rounded-xl border border-slate-200/80 bg-white/70 p-3 text-xs text-slate-700 shadow-sm dark:border-white/5 dark:bg-slate-800/50 dark:text-slate-200">
                    <CheckCircle2
                      size={16}
                      className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                    />
                    <div>
                      <span className="font-bold text-navy-950 dark:text-white">
                        Anexo 17 y Anexo 18:
                      </span>{" "}
                      Declaración de autenticidad y conformidad del asesor correspondiente.
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 rounded-xl border border-dorado-500/40 bg-dorado-500/10 p-3 text-xs text-navy-950 shadow-sm dark:border-dorado-500/30 dark:bg-dorado-500/10 dark:text-dorado-500">
                    <CheckCircle2
                      size={16}
                      className="mt-0.5 shrink-0 text-amber-600 dark:text-dorado-500"
                    />
                    <div>
                      <span className="font-bold text-navy-950 dark:text-white">
                        Constancia de Experiencia de 2 años:
                      </span>{" "}
                      Documento probatorio de ejercicio laboral continuo en la especialidad.
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8 border-t border-slate-200/70 pt-4 dark:border-white/10">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Modalidad de postulación individual con respaldo de trayectoria laboral
                  comprobada.
                </p>
              </div>
            </div>

            {/* TARJETA 3: AVISO NORMATIVO */}
            <div
              id={idAvisoNormativo}
              className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-amber-300/60 bg-gradient-to-br from-amber-500/10 via-white/80 to-amber-500/5 p-7 shadow-xl shadow-amber-900/5 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-amber-400/80 hover:shadow-2xl dark:border-amber-500/30 dark:from-amber-950/20 dark:via-slate-900/70 dark:to-amber-900/10 dark:shadow-black/40 dark:hover:border-amber-400/50"
            >
              {/* Resplandor decorativo de aviso */}
              <div
                className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-amber-400/15 blur-2xl dark:bg-amber-500/10"
                aria-hidden="true"
              />

              <div className="relative">
                {/* Cabecera de la tarjeta */}
                <div className="flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-md dark:from-amber-600 dark:to-amber-700">
                    <ShieldAlert size={24} />
                  </div>
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/20 px-3 py-1 text-[11px] font-bold text-amber-900 dark:text-amber-300">
                    Aviso Normativo
                  </span>
                </div>

                <h3 className="mt-5 text-xl font-bold text-navy-950 dark:text-white">
                  Correo Institucional Obligatorio
                </h3>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  Disposición obligatoria de identidad digital para egresados y participantes UNSA.
                </p>

                {/* Bloque destacado */}
                <div className="mt-6 rounded-2xl border border-amber-300/80 bg-amber-50/90 p-4 text-xs shadow-inner dark:border-amber-500/30 dark:bg-amber-950/40">
                  <div className="flex items-start gap-2.5">
                    <Mail
                      size={18}
                      className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-400"
                    />
                    <div>
                      <p className="font-extrabold text-amber-950 dark:text-amber-200">
                        El uso del correo institucional (@unsa.edu.pe) es estrictamente obligatorio
                        para todo trámite.
                      </p>
                      <p className="mt-2 text-slate-700 leading-relaxed dark:text-slate-300">
                        Todas las notificaciones, observaciones del jurado, resoluciones decanales y
                        credenciales oficiales del expediente se envían exclusivamente a casillas
                        institucionales.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Nota de restricción */}
                <div className="mt-3 rounded-xl bg-slate-100/70 p-3 text-[11px] text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
                  <p className="font-semibold text-rose-700 dark:text-rose-400">Importante:</p>
                  <p className="mt-0.5">
                    No se admitirán registros con correos personales (Gmail, Hotmail, etc.).
                  </p>
                </div>
              </div>

              <div className="relative mt-6 border-t border-amber-300/50 pt-4 dark:border-amber-500/20">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 dark:text-slate-400">
                    ¿Problemas con tu cuenta?
                  </span>
                  <a
                    href="mailto:soportecorreo@unsa.edu.pe"
                    className="inline-flex items-center gap-1 font-bold text-guinda-800 hover:underline dark:text-dorado-500"
                  >
                    <span>soportecorreo@unsa.edu.pe</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. FOOTER INSTITUCIONAL */}
      <footer className="border-t border-slate-200/70 bg-white/70 py-12 backdrop-blur-md dark:border-white/10 dark:bg-[#07131e]/90">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {/* Columna 1: Datos Institucionales */}
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-950 text-dorado-500 shadow-sm dark:bg-white dark:text-navy-950">
                  <GraduationCap size={18} />
                </div>
                <span className="font-extrabold text-sm text-navy-950 dark:text-white">
                  UNSA · FIPS · EPIS
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Universidad Nacional de San Agustín de Arequipa. Segunda Especialidad en Ingeniería
                de Sistemas.
              </p>
            </div>

            {/* Columna 2: Enlaces Rápidos */}
            <div>
              <p className="text-xs font-bold text-navy-950 uppercase tracking-wider dark:text-white">
                Navegación
              </p>
              <ul className="mt-3 space-y-2 text-xs text-slate-600 dark:text-slate-400">
                <li>
                  <a
                    href="#modalidades"
                    className="hover:text-guinda-800 dark:hover:text-dorado-500"
                  >
                    Modalidades de Titulación
                  </a>
                </li>
                <li>
                  <a
                    href="#requisitos"
                    className="hover:text-guinda-800 dark:hover:text-dorado-500"
                  >
                    Requisitos y Anexos Oficiales
                  </a>
                </li>
                <li>
                  <Link to="/login" className="hover:text-guinda-800 dark:hover:text-dorado-500">
                    Ingreso Administrativo
                  </Link>
                </li>
              </ul>
            </div>

            {/* Columna 3: Normativa y Soporte */}
            <div>
              <p className="text-xs font-bold text-navy-950 uppercase tracking-wider dark:text-white">
                Ayuda y Normativa
              </p>
              <ul className="mt-3 space-y-2 text-xs text-slate-600 dark:text-slate-400">
                <li>
                  <a
                    href="https://fips.unsa.edu.pe/usefc/pagos-unsapay/"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 hover:text-guinda-800 dark:hover:text-dorado-500"
                  >
                    <span>Manual de Pagos UNSAPay</span>
                    <ExternalLink size={11} />
                  </a>
                </li>
                <li>
                  <a
                    href="mailto:soportecorreo@unsa.edu.pe"
                    className="hover:text-guinda-800 dark:hover:text-dorado-500"
                  >
                    Soporte de Correo Institucional
                  </a>
                </li>
                <li>
                  <span className="text-slate-500">Horario: Lun - Vie 08:00 a 15:45 h</span>
                </li>
              </ul>
            </div>

            {/* Columna 4: Canal de Contacto */}
            <div>
              <p className="text-xs font-bold text-navy-950 uppercase tracking-wider dark:text-white">
                Atención al Usuario
              </p>
              <p className="mt-3 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Para consultas sobre el estado de tu solicitud, ingresa con tu código SET generado
                al momento del envío.
              </p>
              <div className="mt-3">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-guinda-800 hover:underline dark:text-dorado-500"
                >
                  <HelpCircle size={14} />
                  <span>Consultar con personal administrativo</span>
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-10 border-t border-slate-200/60 pt-6 text-center text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
            <p>
              © 2026 Universidad Nacional de San Agustín de Arequipa. Todos los derechos reservados.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
