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
import { AgendaPage } from "./routes/agenda.js";
import { AsesorPage } from "./routes/asesor.js";
import { ConfiguracionPage } from "./routes/configuracion.js";
import { ExpedienteDetallePage } from "./routes/expedientes.$id.js";
import { NuevoExpedientePage } from "./routes/expedientes-nuevo.js";
import { HomePage } from "./routes/index.js";
import { InscripcionesPage } from "./routes/inscripciones.js";
import { LoginPage } from "./routes/login.js";
import { MesaDePartesPage } from "./routes/mesa-de-partes.js";
import { MiTallerPage } from "./routes/mi-taller.js";
import { MiTramitePage } from "./routes/mi-tramite.js";
import { MisPagosPage } from "./routes/mis-pagos.js";
import { MisTalleresPage } from "./routes/mis-talleres.js";
import { PagosTallerPage } from "./routes/pagos-taller.js";
import { RestablecerPage } from "./routes/restablecer.js";
import { SolicitudDetallePage } from "./routes/solicitudes.$id.js";
import { SolicitudesPage } from "./routes/solicitudes.js";
import { SubsanarSolicitudPage } from "./routes/subsanar-solicitud.$token.js";
import { TallerDetallePage } from "./routes/taller-detalle.js";
import { AsesoresPage, TalleresPage } from "./routes/talleres-asesores.js";
import { TalleresNuevoPage } from "./routes/talleres-nuevo.js";

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
const talleresNuevoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/talleres/nuevo",
  beforeLoad: guard("/talleres/nuevo"),
  component: TalleresNuevoPage,
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
const misTalleresRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/mis-talleres",
  beforeLoad: guard("/mis-talleres"),
  component: MisTalleresPage,
});
const agendaRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/agenda/$id",
  beforeLoad: guard("/agenda/x"),
  component: function AgendaRouteWrapper() {
    const { id } = agendaRoute.useParams();
    return <AgendaPage id={id} />;
  },
});
const miTallerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/mi-taller",
  beforeLoad: guard("/mi-taller"),
  component: MiTallerPage,
});
const misPagosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/mis-pagos",
  beforeLoad: guard("/mis-pagos"),
  component: MisPagosPage,
});
const pagosTallerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/pagos-taller",
  beforeLoad: guard("/pagos-taller"),
  component: PagosTallerPage,
});
const mesaDePartesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/mesa-de-partes",
  component: MesaDePartesPage,
});
const subsanarRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/subsanar/$token",
  component: SubsanarSolicitudPage,
});
const solicitudesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/solicitudes",
  beforeLoad: guard("/solicitudes"),
  component: SolicitudesPage,
});
const solicitudDetalleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/solicitudes/$id",
  beforeLoad: guard("/solicitudes/x"),
  component: SolicitudDetallePage,
});
const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  activarRoute,
  restablecerRoute,
  configuracionRoute,
  adminRoute,
  solicitudesRoute,
  solicitudDetalleRoute,
  mesaDePartesRoute,
  subsanarRoute,
  miTramiteRoute,
  asesorRoute,
  nuevoRoute,
  detalleRoute,
  inscripcionesRoute,
  talleresRoute,
  asesoresRoute,
  talleresNuevoRoute,
  tallerDetalleRoute,
  misTalleresRoute,
  agendaRoute,
  miTallerRoute,
  misPagosRoute,
  pagosTallerRoute,
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
