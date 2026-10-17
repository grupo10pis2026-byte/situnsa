import { Link } from "@tanstack/react-router";
import { destinoPorRol } from "../api/auth.js";
import { useSession } from "../api/session.js";

/** Raíz: redirige a la vista según rol o al login. */
export function HomePage() {
  const { sesion } = useSession();
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8 text-center">
      <h1 className="text-2xl font-bold text-navy-950">PIS Titulación — FIPS / UNSA</h1>
      {sesion ? (
        <Link
          className="inline-block rounded bg-guinda-800 px-6 py-2.5 text-sm font-bold text-white"
          to={destinoPorRol(sesion.rol)}
        >
          Ir a mi panel ({sesion.rol.replace("_", " ")})
        </Link>
      ) : (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            className="inline-block rounded-lg bg-navy-950 px-6 py-2.5 text-sm font-bold text-white shadow hover:bg-navy-900"
            to="/mesa-de-partes"
          >
            Mesa de Partes Virtual
          </Link>
          <Link
            className="inline-block rounded-lg bg-guinda-800 px-6 py-2.5 text-sm font-bold text-white shadow hover:bg-guinda-700"
            to="/login"
          >
            Iniciar sesión
          </Link>
        </div>
      )}
    </main>
  );
}
