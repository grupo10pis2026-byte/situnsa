import { useState } from "react";
import { useSession } from "../api/session.js";
import { useTaller } from "../api/taller.js";
import {
  AccionesTaller,
  EstadoTaller,
  PensionesTab,
  ResumenTaller,
} from "../components/domain/taller-cabecera.js";
import { MatrizHitosCard, PlanTallerCard } from "../components/domain/taller-hitos.js";
import { ProyectosTab } from "../components/domain/taller-proyectos.js";
import { GruposHorarioTab, SesionesPanel } from "../components/domain/taller-sesiones.js";
import { AppShell } from "../components/layout/app-shell.js";
import { EmptyState } from "../components/ui/empty-state.js";
import { PageHeader } from "../components/ui/page-header.js";
import { Tab, TabPanel, Tabs, TabsLista } from "../components/ui/tabs.js";

/**
 * P3 Detalle del taller (spec v1.0 §9): cabecera, acciones de la Secretaría
 * y pestañas Alumnos (proyectos), Sesiones (P4: consulta y corrige),
 * Grupos de horario (solo lectura) y Pensiones.
 */
export function TallerDetallePage({ id }: { id: string }) {
  const query = useTaller(id);
  const { sesion } = useSession();
  const esAsesor = sesion?.rol === "ASESOR";
  const [tab, setTab] = useState("alumnos");
  const t = query.data;

  return (
    <AppShell activo="/talleres">
      {!t ? (
        query.isPending ? (
          <PageHeader titulo="Detalle del taller" descripcion="Cargando…" />
        ) : (
          <EmptyState titulo="No se encontró el taller" />
        )
      ) : (
        <>
          <PageHeader
            titulo={t.nombre}
            insignia={<EstadoTaller estado={t.estado} />}
            migas={[{ etiqueta: "Talleres", href: "/talleres" }, { etiqueta: t.nombre }]}
            acciones={esAsesor ? undefined : <AccionesTaller t={t} />}
          />
          <ResumenTaller t={t} />
          <Tabs value={tab} onValueChange={setTab}>
            <TabsLista>
              <Tab value="alumnos">Alumnos</Tab>
              <Tab value="sesiones">Sesiones</Tab>
              <Tab value="hitos">Hitos</Tab>
              <Tab value="plan">Plan</Tab>
              <Tab value="grupos">Grupos de horario</Tab>
              <Tab value="pensiones">Pensiones</Tab>
            </TabsLista>
            <TabPanel value="alumnos">
              <ProyectosTab tallerId={id} puedeAsignar={!esAsesor} />
            </TabPanel>
            <TabPanel value="sesiones">
              <SesionesPanel tallerId={id} modo="secretaria" />
            </TabPanel>
            <TabPanel value="hitos">
              <MatrizHitosCard tallerId={id} />
            </TabPanel>
            <TabPanel value="plan">
              <PlanTallerCard tallerId={id} />
            </TabPanel>
            <TabPanel value="grupos">
              <GruposHorarioTab tallerId={id} editable={false} />
            </TabPanel>
            <TabPanel value="pensiones">
              <PensionesTab t={t} />
            </TabPanel>
          </Tabs>
        </>
      )}
    </AppShell>
  );
}
