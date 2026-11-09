import { useEffect, useState } from "react";
import { useTalleresAsesor } from "../api/mi-taller.js";
import { useTaller } from "../api/taller.js";
import { EstadoTaller, ResumenTaller } from "../components/domain/taller-cabecera.js";
import { MatrizHitosCard, PlanTallerCard } from "../components/domain/taller-hitos.js";
import { ProyectosTab } from "../components/domain/taller-proyectos.js";
import { GruposHorarioTab, SesionesPanel } from "../components/domain/taller-sesiones.js";
import { AppShell } from "../components/layout/app-shell.js";
import { Card } from "../components/ui/card.js";
import { EmptyState } from "../components/ui/empty-state.js";
import { PageHeader } from "../components/ui/page-header.js";
import { Select } from "../components/ui/select.js";
import { Tab, TabPanel, Tabs, TabsLista } from "../components/ui/tabs.js";

/**
 * P5 Mi taller del asesor (spec v1.0 §9): registra la asistencia por grupo,
 * arma los grupos de horario, edita el plan y sigue los hitos de cada
 * proyecto (P6); desde un proyecto revisa entregas, ficha y cierre.
 */
export function AsesorTallerPage() {
  const lista = useTalleresAsesor();
  const items = lista.data?.items ?? [];
  const [tallerId, setTallerId] = useState<string | null>(null);
  useEffect(() => {
    if (tallerId === null && items[0]) setTallerId(items[0].id);
  }, [items, tallerId]);
  const t = useTaller(tallerId);
  const [tab, setTab] = useState("seguimiento");

  return (
    <AppShell activo="/asesor/taller">
      <PageHeader
        titulo={t.data?.nombre ?? "Mi taller"}
        descripcion="Asistencia, grupos de horario, plan del taller y seguimiento de hitos."
        insignia={t.data ? <EstadoTaller estado={t.data.estado} /> : undefined}
        acciones={
          items.length > 1 ? (
            <Select ariaLabel="Taller" value={tallerId ?? ""} onChange={setTallerId}>
              {items.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nombre}
                </option>
              ))}
            </Select>
          ) : undefined
        }
      />
      {lista.isPending ? (
        <Card className="p-5 text-sm text-grafito-600">Cargando…</Card>
      ) : !tallerId ? (
        <EmptyState
          titulo="No tienes talleres asignados"
          descripcion="La Secretaría del Taller te asigna un taller al crearlo."
        />
      ) : (
        <>
          {t.data && <ResumenTaller t={t.data} />}
          <Tabs value={tab} onValueChange={setTab}>
            <TabsLista>
              <Tab value="seguimiento">Seguimiento de hitos</Tab>
              <Tab value="sesiones">Sesiones y asistencia</Tab>
              <Tab value="grupos">Grupos de horario</Tab>
              <Tab value="plan">Plan del taller</Tab>
              <Tab value="alumnos">Alumnos</Tab>
            </TabsLista>
            <TabPanel value="seguimiento">
              <MatrizHitosCard tallerId={tallerId} />
            </TabPanel>
            <TabPanel value="sesiones">
              <SesionesPanel tallerId={tallerId} modo="asesor" />
            </TabPanel>
            <TabPanel value="grupos">
              <GruposHorarioTab tallerId={tallerId} editable />
            </TabPanel>
            <TabPanel value="plan">
              <PlanTallerCard tallerId={tallerId} />
            </TabPanel>
            <TabPanel value="alumnos">
              <ProyectosTab tallerId={tallerId} puedeAsignar={false} />
            </TabPanel>
          </Tabs>
        </>
      )}
    </AppShell>
  );
}
