import { Eye, FileText } from "lucide-react";
import {
  abrirArchivoProtegido,
  descargarArchivoProtegido,
  formatoDescargaUrl,
  useExpedienteDetalle,
  useGenerarDocumentos,
} from "../../api/expedientes.js";
import { Button } from "../ui/button.js";
import { useToast } from "../ui/toast.js";

/**
 * Informe para Secretaría Académica (HU-0045): formato E6 generado con los
 * datos vigentes (jurado, sustentación, similitud, repositorio). Los campos
 * sin dato se informan como pendientes antes de remitirlo.
 */
export function InformeSecretaria({ expedienteId }: { expedienteId: string }) {
  const detalle = useExpedienteDetalle(expedienteId);
  const generar = useGenerarDocumentos(expedienteId);
  const avisar = useToast();
  const informe = detalle.data?.generados.find((g) => g.tipo === "INFORME_SECRETARIA") ?? null;

  async function onGenerar(): Promise<void> {
    try {
      const r = await generar.mutateAsync("E6");
      const pendientes = r.generados[0]?.pendientes.length ?? 0;
      avisar(
        pendientes > 0
          ? `Informe generado con ${pendientes} campo(s) pendiente(s)`
          : "Informe generado",
        pendientes > 0 ? "error" : "ok",
      );
    } catch (e) {
      avisar(e instanceof Error ? e.message : "No se pudo generar el informe", "error");
    }
  }

  async function onVer(id: string): Promise<void> {
    try {
      const codigo = detalle.data?.codigo ?? "EXP";
      await descargarArchivoProtegido(
        formatoDescargaUrl(id),
        `${codigo} - Informe para Secretaría Académica.docx`,
      );
    } catch (e) {
      avisar(e instanceof Error ? e.message : "No se pudo descargar el informe", "error");
    }
  }

  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold tracking-wider text-grafito-600 uppercase">
        <FileText size={14} />
        Informe para Secretaría Académica
      </h3>
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-100/70 px-3 py-2 text-sm">
        <span className="mr-auto">
          {informe
            ? `Versión ${informe.version} · ${
                informe.pendientes.length > 0
                  ? `pendiente: ${informe.pendientes.join(", ").toLowerCase()}`
                  : "datos completos"
              }`
            : "Aún no generado."}
        </span>
        {informe && (
          <Button variante="contorno" onClick={() => void onVer(informe.id)} type="button">
            <Eye size={15} />
            VER
          </Button>
        )}
        <Button disabled={generar.isPending} onClick={() => void onGenerar()} type="button">
          <FileText size={15} />
          {generar.isPending ? "Generando…" : informe ? "ACTUALIZAR" : "GENERAR"}
        </Button>
      </div>
    </section>
  );
}
