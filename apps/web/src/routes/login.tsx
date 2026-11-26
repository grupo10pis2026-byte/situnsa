import { Link, useNavigate } from "@tanstack/react-router";
import { GraduationCap, LockKeyhole } from "lucide-react";
import { useId, useState } from "react";
import { destinoPorRol } from "../api/auth.js";
import { useSession } from "../api/session.js";
import { BotonGoogle } from "../components/domain/boton-google.js";
import { Button } from "../components/ui/button.js";
import { controlClase, Field } from "../components/ui/field.js";

/**
 * §3 Login: identidad UNSA/FIPS + acceso (clave o Google institucional) +
 * error controlado + navegación por rol.
 */
export function LoginPage() {
  const { entrar, entrarConGoogle, sesion } = useSession();
  const navigate = useNavigate();
  const [identificador, setIdentificador] = useState("");
  const [password, setPassword] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idUsuario = useId();
  const idClave = useId();

  if (sesion) {
    void navigate({ to: destinoPorRol(sesion.rol) });
    return null;
  }

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (cargando) return;
    setError(null);
    setCargando(true);
    try {
      const s = await entrar(identificador.trim(), password);
      void navigate({ to: destinoPorRol(s.rol) });
    } catch (err) {
      // Mensaje del servidor solo para bloqueo/cuenta sin clave; el resto es genérico.
      setError(err instanceof Error ? err.message : "Credenciales inválidas o usuario inactivo");
    } finally {
      setCargando(false);
    }
  }

  async function onGoogle(idToken: string): Promise<void> {
    if (cargando) return;
    setError(null);
    setCargando(true);
    try {
      const s = await entrarConGoogle(idToken);
      void navigate({ to: destinoPorRol(s.rol) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión con Google");
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className="login-fondo flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center text-white">
          <div
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-dorado-500 bg-white/5 shadow-flotante"
            aria-hidden
          >
            <GraduationCap size={30} className="text-dorado-500" />
          </div>
          <p className="mt-3 text-[11px] font-semibold tracking-[0.18em] text-navy-100 uppercase">
            Universidad Nacional de San Agustín
          </p>
          <p className="mt-0.5 text-xs text-navy-100/80">
            Facultad de Ingeniería de Producción y Servicios
          </p>
          <div className="mx-auto mt-3 h-px w-24 bg-dorado-500/70" aria-hidden />
          <h1 className="mt-3 text-xl font-bold tracking-wide">SISTEMA DE TITULACIÓN</h1>
          <p className="mt-0.5 text-xs text-navy-100">
            Segunda Especialidad · Acceso institucional
          </p>
        </div>
        <form
          aria-label="Iniciar sesión"
          className="space-y-4 rounded-2xl bg-white p-6 shadow-flotante"
          onSubmit={(e) => {
            void onSubmit(e);
          }}
        >
          <Field etiqueta="Usuario" htmlFor={idUsuario}>
            <input
              autoComplete="username"
              className={controlClase}
              id={idUsuario}
              placeholder="DNI, CUI o correo"
              value={identificador}
              onChange={(e) => setIdentificador(e.target.value)}
            />
          </Field>
          <Field etiqueta="Contraseña" htmlFor={idClave}>
            <input
              autoComplete="current-password"
              className={controlClase}
              id={idClave}
              placeholder="Ingrese su contraseña"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {error && (
            <p
              className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-800"
              role="alert"
            >
              {error}
            </p>
          )}
          <Button
            className="w-full"
            disabled={cargando || !identificador || !password}
            tamano="lg"
            type="submit"
          >
            <LockKeyhole size={16} />
            {cargando ? "Validando credenciales…" : "Ingresar"}
          </Button>
          <BotonGoogle
            deshabilitado={cargando}
            onCredencial={(t) => {
              void onGoogle(t);
            }}
          />
          <p className="text-center text-xs">
            <Link className="font-semibold text-navy-800 hover:underline" to="/restablecer">
              ¿Primera vez u olvidaste tu clave?
            </Link>
          </p>
        </form>
        <p className="mt-5 text-center text-[11px] text-navy-100/70">
          Uso institucional · Segunda Especialidad FIPS — UNSA
        </p>
      </div>
    </main>
  );
}
