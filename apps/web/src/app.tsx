import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  redirect,
} from "@tanstack/react-router";
import { reintentarConsulta } from "./api/errores.js";
import { redirigirSiNoPuede, rolGuardado } from "./api/guard.js";
import { SessionProvider } from "./api/session.js";
import { ToastProvider } from "./components/ui/toast.js";
import { ActivarPage } from "./routes/activar.js";
import { AdminPage } from "./routes/admin.js";
import { AsesorPage } from "./routes/asesor.js";
import { AsesorPerfilPage } from "./routes/asesor-perfil.js";
import { AsesorTallerPage } from "./routes/asesor-taller.js";
import { AsesoresPage } from "./routes/asesores.js";
import { ConfiguracionPage } from "./routes/configuracion.js";
import { EncuestaPage, EncuestasResultadosPage } from "./routes/encuesta.js";
import { ExpedienteDetallePage } from "./routes/expedientes.$id.js";
import { NuevoExpedientePage } from "./routes/expedientes-nuevo.js";
import { HomePage } from "./routes/index.js";
import { InscripcionesPage } from "./routes/inscripciones.js";
import { LoginPage } from "./routes/login.js";
import { MiTallerPage } from "./routes/mi-taller.js";
import { MiTramitePage } from "./routes/mi-tramite.js";
import { MisPagosPage } from "./routes/mis-pagos.js";
import { PagosTallerPage } from "./routes/pagos-taller.js";
import { ProyectoEntregasPage } from "./routes/proyecto-entregas.js";
import { ReportesTallerPage } from "./routes/reportes-taller.js";
import { RestablecerPage } from "./routes/restablecer.js";
import { TallerDetallePage } from "./routes/taller-detalle.js";
import { TalleresPage } from "./routes/talleres-asesores.js";
import { TallerEditarPage, TalleresNuevoPage } from "./routes/talleres-nuevo.js";

const rootRoute = createRootRoute();

/** Guard de rol solo-UI (el servidor revalida): redirige según matriz. */
function guard(path: string) {
  return () => {
    const destino = redirigirSiNoPuede(rolGuardado(), path);
    if (destino) throw redirect({ to: destino });
  };
}
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: HomePage });
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});
const activarRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/activar",
  component: ActivarPage,
});
const restablecerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/restablecer",
  component: RestablecerPage,
});
const configuracionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/configuracion",
  beforeLoad: guard("/configuracion"),
  component: ConfiguracionPage,
});
const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin",
  beforeLoad: guard("/admin"),
  component: AdminPage,
});
const miTramiteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/mi-tramite",
  beforeLoad: guard("/mi-tramite"),
  component: MiTramitePage,
});
const asesorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/asesor",
  beforeLoad: guard("/asesor"),
  component: AsesorPage,
});
const nuevoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/expedientes/nuevo",
  beforeLoad: guard("/expedientes/nuevo"),
  component: NuevoExpedientePage,
});
const detalleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/expedientes/$id",
  beforeLoad: guard("/expedientes/x"),
  component: ExpedienteDetallePage,
});
const inscripcionesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/inscripciones",
  beforeLoad: guard("/inscripciones"),
  component: InscripcionesPage,
});
const talleresRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/talleres",
  beforeLoad: guard("/talleres"),
  component: TalleresPage,
});
const asesoresRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/asesores",
  beforeLoad: guard("/asesores"),
  component: AsesoresPage,
});
const asesorPerfilRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/asesores/$id",
  beforeLoad: guard("/asesores/x"),
  component: function AsesorPerfilRouteWrapper() {
    const { id } = asesorPerfilRoute.useParams();
    return <AsesorPerfilPage id={id} />;
  },
});
const talleresNuevoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/talleres/nuevo",
  beforeLoad: guard("/talleres/nuevo"),
  component: TalleresNuevoPage,
});
const tallerEditarRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/talleres/$id/editar",
  beforeLoad: guard("/talleres/x/editar"),
  component: function TallerEditarRouteWrapper() {
    const { id } = tallerEditarRoute.useParams();
    return <TallerEditarPage id={id} />;
  },
});
const tallerDetalleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/taller/$id",
  beforeLoad: guard("/taller/x"),
  component: function TallerDetalleRouteWrapper() {
    const { id } = tallerDetalleRoute.useParams();
    return <TallerDetallePage id={id} />;
  },
});
const proyectoEntregasRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/proyectos/$id/entregas",
  beforeLoad: guard("/proyectos/x/entregas"),
  component: function ProyectoEntregasRouteWrapper() {
    const { id } = proyectoEntregasRoute.useParams();
    return <ProyectoEntregasPage id={id} />;
  },
});
const pagosTallerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/pagos-taller",
  beforeLoad: guard("/pagos-taller"),
  component: PagosTallerPage,
});
const misPagosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/mis-pagos",
  beforeLoad: guard("/mis-pagos"),
  component: MisPagosPage,
});
const reportesTallerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reportes-taller",
  beforeLoad: guard("/reportes-taller"),
  component: ReportesTallerPage,
});
const encuestaRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/encuesta",
  beforeLoad: guard("/encuesta"),
  component: EncuestaPage,
});
const encuestasResultadosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/encuestas-resultados",
  beforeLoad: guard("/encuestas-resultados"),
  component: EncuestasResultadosPage,
});
const asesorTallerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/asesor/taller",
  beforeLoad: guard("/asesor/taller"),
  component: AsesorTallerPage,
});
const miTallerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/mi-taller",
  beforeLoad: guard("/mi-taller"),
  component: MiTallerPage,
});
const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  activarRoute,
  restablecerRoute,
  configuracionRoute,
  adminRoute,
  miTramiteRoute,
  asesorRoute,
  nuevoRoute,
  detalleRoute,
  inscripcionesRoute,
  talleresRoute,
  asesoresRoute,
  asesorPerfilRoute,
  talleresNuevoRoute,
  tallerEditarRoute,
  tallerDetalleRoute,
  proyectoEntregasRoute,
  pagosTallerRoute,
  misPagosRoute,
  reportesTallerRoute,
  encuestaRoute,
  encuestasResultadosRoute,
  asesorTallerRoute,
  miTallerRoute,
]);

const router = createRouter({ routeTree });
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// INC-07: un 403/404 no se reintenta (antes la vista quedaba "cargando" varios segundos).
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: reintentarConsulta } },
});

export function App() {
  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
