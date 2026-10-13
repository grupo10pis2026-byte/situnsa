import { cargaHabilitadaTesista } from "@pis/domain/dist/expediente/checklist-catalogo.js";
import { AlertTriangle, Eye, FileDown, FileText, Stamp, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import {
  abrirArchivoProtegido,
  documentoDescargaUrl,
  formatoDescargaUrl,
  useSubirDocumento,
} from "../../api/expedientes.js";
import { useVistoBueno } from "../../api/seguimiento.js";
import { useSession } from "../../api/session.js";
import { cn } from "../../utils/cn.js";
import { Button, botonClases } from "../ui/button.js";
import { Card } from "../ui/card.js";
import { ConfirmDialog } from "../ui/confirm-dialog.js";
import { StatusBadge } from "../ui/status-badge.js";
import { useToast } from "../ui/toast.js";
import { AnalisisDocumentalPanel } from "./analisis-documental-panel.js";

interface Props {
  expedienteId: string;
  tipo: string;
  nombre: string;
  estado: string;
  version: number | null;
  faltantes: string[];
  documentoId: string | null;
  /** Subetapa que exige el documento (RN-06). */
  requeridoEn?: string | null;
  /** Clave de la subetapa en curso del expediente. */
  subetapaActiva?: string | null;
  /** Formato generado por "Insertar datos" (si existe). */
  formato?: { id: string; version: number; pendientes: string[] } | null;
}

const PERSONAL = ["ADMIN_FIPS", "SECRETARIA", "DECANO"];

/** Tarjeta documental §§7–8: estado + faltantes + VER + formato + ADJUNTAR/REEMPLAZAR + V°B°. */
export function DocumentoCard(p: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const subir = useSubirDocumento(p.expedienteId);
  const vistoBueno = useVistoBueno(p.expedienteId);
  const { sesion } = useSession();
  const avisar = useToast();
  const [error, setError] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [pendiente, setPendiente] = useState<File | null>(null);
  const esPersonal = !!sesion && PERSONAL.includes(sesion.rol);
  const esTesista = sesion?.rol === "TESISTA";
  // RN-06: el tesista solo carga lo de su subetapa activa (o lo observado) y
  // nunca reemplaza un documento aprobado. El servidor lo vuelve a validar.
  const puedeCargar = esPersonal
    ? true
    : esTesista &&
      p.estado !== "APROBADO" &&
      cargaHabilitadaTesista(
        { tipo: p.tipo, requeridoEn: p.requeridoEn ?? null, estado: p.estado },
        p.subetapaActiva ?? null,
      );
  // V°B°: asesor asignado o personal; solo sobre documento cargado u observado.
  const puedeVisar =
    !!p.documentoId &&
    (p.estado === "CARGADO" || p.estado === "OBSERVADO") &&
    !!sesion &&
    ["ASESOR", ...PERSONAL].includes(sesion.rol);

  async function abrir(url: string): Promise<void> {
    try {
      await abrirArchivoProtegido(url);
    } catch (e) {
      avisar(e instanceof Error ? e.message : "No se pudo abrir el documento", "error");
    }
  }

  async function visar(aprobado: boolean): Promise<void> {
    if (!p.documentoId) return;
    const comentario = aprobado
      ? undefined
      : window.prompt("Motivo de la observación para el tesista:");
    if (!aprobado && !(comentario ?? "").trim()) return;
    try {
      await vistoBueno.mutateAsync({
        documentoId: p.documentoId,
        aprobado,
        ...(comentario != null ? { comentario } : {}),
      });
      avisar(aprobado ? "V°B° registrado" : "Documento observado");
    } catch (e) {
      avisar(e instanceof Error ? e.message : "No se pudo visar", "error");
    }
  }

  async function ejecutar(file: File): Promise<void> {
    setError(null);
    try {
      const r = await subir.mutateAsync({ tipo: p.tipo, file });
      avisar(`${p.nombre}: versión ${r.version} cargada`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al subir");
    }
  }

  function onFile(file: File | undefined): void {
    if (!file || !puedeCargar) return;
    if (p.version !== null) {
      setPendiente(file);
      return;
    }
    void ejecutar(file);
  }

  return (
    <Card
      className={cn(
        "p-4 transition-colors",
        arrastrando && "border-dashed border-navy-800 bg-navy-950/[0.03]",
      )}
      onDragOver={(e) => {
        if (!puedeCargar) return;
        e.preventDefault();
        setArrastrando(true);
      }}
      onDragLeave={() => setArrastrando(false)}
      onDrop={(e) => {
        e.preventDefault();
        setArrastrando(false);
        onFile(e.dataTransfer.files?.[0]);
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-950/[0.06] text-navy-800">
            <FileText size={18} aria-hidden />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold text-navy-950">{p.nombre}</h3>
            <p className="text-xs text-grafito-600">
              {p.tipo}
              {p.version !== null ? ` · v${p.version}` : ""}
            </p>
          </div>
        </div>
        <StatusBadge estado={p.estado} />
      </div>
      {p.faltantes.length > 0 && (
        <p className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-aviso-100 px-2.5 py-2 text-xs text-aviso-800">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            <strong>Campos pendientes:</strong> {p.faltantes.join("; ")}
          </span>
        </p>
      )}
      {error && (
        <p className="mt-2 text-xs font-medium text-red-700" role="alert">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200/70 pt-3">
        {p.documentoId ? (
          <Button
            tamano="sm"
            variante="oscuro"
            onClick={() => void abrir(documentoDescargaUrl(p.documentoId ?? ""))}
            type="button"
          >
            <Eye size={14} />
            VER
          </Button>
        ) : (
          <span
            className={cn(
              botonClases({ variante: "contorno", tamano: "sm" }),
              "pointer-events-none opacity-50",
            )}
            aria-disabled
          >
            <Eye size={14} />
            VER
          </span>
        )}
        {p.formato && (
          <Button
            tamano="sm"
            variante="contorno"
            onClick={() => void abrir(formatoDescargaUrl(p.formato?.id ?? ""))}
            title={
              p.formato.pendientes.length > 0
                ? `Campos pendientes: ${p.formato.pendientes.join(", ")}`
                : "Formato con todos los datos insertados"
            }
            type="button"
          >
            <FileDown size={14} />
            FORMATO v{p.formato.version}
          </Button>
        )}
        {puedeCargar ? (
          <button
            className={cn(botonClases({ variante: "contorno", tamano: "sm" }))}
            disabled={subir.isPending}
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            <UploadCloud size={14} />
            {subir.isPending ? "SUBIENDO…" : p.version === null ? "ADJUNTAR" : "REEMPLAZAR"}
          </button>
        ) : (
          esTesista && (
            <span className="text-xs text-grafito-600">
              {p.estado === "APROBADO"
                ? "Documento aprobado"
                : "Se carga en la subetapa correspondiente"}
            </span>
          )
        )}
        {puedeVisar && (
          <span className="flex gap-1.5">
            <Button
              tamano="sm"
              variante="exito"
              disabled={vistoBueno.isPending}
              onClick={() => void visar(true)}
              type="button"
            >
              <Stamp size={14} />
              V°B°
            </Button>
            <Button
              tamano="sm"
              variante="contorno"
              disabled={vistoBueno.isPending}
              onClick={() => void visar(false)}
              type="button"
            >
              Observar
            </Button>
          </span>
        )}
        <input
          accept="application/pdf"
          className="hidden"
          ref={inputRef}
          type="file"
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      {p.documentoId && p.tipo === "PLAN_ESTRUCTURADO" && (
        <AnalisisDocumentalPanel key={p.documentoId} documentoId={p.documentoId} />
      )}
      {pendiente && (
        <ConfirmDialog
          titulo="Reemplazar documento"
          mensaje={`Reemplazar ${p.nombre} (v${p.version}) por ${pendiente.name}? Se creará la v${(p.version ?? 0) + 1}.`}
          confirmar="Reemplazar"
          onConfirmar={() => {
            const f = pendiente;
            setPendiente(null);
            void ejecutar(f);
          }}
          onCancelar={() => setPendiente(null)}
        />
      )}
    </Card>
  );
}
