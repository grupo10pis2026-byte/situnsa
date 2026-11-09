import { useState } from "react";
import { useEntregasProyecto } from "../api/hitos.js";
import { useSession } from "../api/session.js";
import { CierreProyecto, FichaProyecto } from "../components/domain/taller-ficha.js";
import { EntregasProyecto } from "../components/domain/taller-hitos.js";
import { AppShell } from "../components/layout/app-shell.js";
import { Card } from "../components/ui/card.js";
import { PageHeader } from "../components/ui/page-header.js";
import { Tab, TabPanel, Tabs, TabsLista } from "../components/ui/tabs.js";

/**
 * P6b Entregas, P11 Ficha y P13 Cierre de un proyecto (asesor: habilita, revisa, ajusta fechas y
 * aprueba el plan; Secretaría: consulta; alumno: sube versiones).
 */
export function ProyectoEntregasPage({ id }: { id: string }) {
  const q = useEntregasProyecto(id);
  const [tab, setTab] = useState("entregas");
  const { sesion } = useSession();
  const rol = sesion?.rol;
  const p = q.data?.proyecto;
  const volver =
    rol === "ASESOR"
      ? { etiqueta: "Mi taller", href: "/asesor/taller" }
      : rol === "TESISTA"
        ? { etiqueta: "Mi taller", href: "/mi-taller" }
        : {
            etiqueta: p?.tallerNombre ?? "Taller",
            href: p ? `/taller/${p.tallerId}` : "/talleres",
          };
  const activo =
    rol === "ASESOR" ? "/asesor/taller" : rol === "TESISTA" ? "/mi-taller" : "/talleres";
  return (
    <AppShell activo={activo}>
      <PageHeader
        titulo={p ? `Proyecto ${p.codigo}` : "Entregas del proyecto"}
        descripcion={p?.titulo ?? "Sin título registrado"}
        migas={[volver, { etiqueta: p ? `Proyecto ${p.codigo}` : "Proyecto" }]}
      />
      {p && (
        <Card className="mb-4 grid gap-3 p-4 text-sm md:grid-cols-4">
          <div>
            <p className="text-xs font-semibold uppercase text-grafito-600">Tesistas</p>
            {p.tesistas.map((t) => (
              <p key={t.alumnoId}>
                {t.nombre}
                {t.estado === "RETIRADO" && <span className="text-red-700"> · retirado</span>}
              </p>
            ))}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-grafito-600">Asesor</p>
            <p>{p.asesor ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-grafito-600">Programa</p>
            <p>{p.programa ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-grafito-600">Expediente</p>
            <p>{p.expedienteCodigo ?? "Se crea al aprobar el plan"}</p>
          </div>
        </Card>
      )}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsLista>
          <Tab value="entregas">Entregas</Tab>
          <Tab value="ficha">Ficha de control</Tab>
          <Tab value="cierre">Cierre</Tab>
        </TabsLista>
        <TabPanel value="entregas">
          <EntregasProyecto proyectoId={id} />
        </TabPanel>
        <TabPanel value="ficha">
          <FichaProyecto proyectoId={id} />
        </TabPanel>
        <TabPanel value="cierre">
          <CierreProyecto proyectoId={id} />
        </TabPanel>
      </Tabs>
    </AppShell>
  );
}
