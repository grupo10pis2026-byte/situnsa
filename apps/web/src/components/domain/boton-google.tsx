import { useEffect, useRef, useState } from "react";
import { configGoogleRequest } from "../../api/auth.js";

/**
 * Botón «Acceder con Google» (Google Identity Services, flujo de ID token en
 * popup: sin redirect URI ni client secret). `hd` solo sugiere la cuenta
 * institucional en el selector; el filtro real de dominio y de cuenta activa
 * lo hace el servidor. Sin GOOGLE_CLIENT_ID configurado no se renderiza.
 */

const SCRIPT_GIS = "https://accounts.google.com/gsi/client";

interface RespuestaCredencial {
  credential: string;
}

interface GoogleIdentity {
  accounts: {
    id: {
      initialize(opciones: {
        client_id: string;
        callback: (r: RespuestaCredencial) => void;
        hd?: string;
        ux_mode?: "popup" | "redirect";
        auto_select?: boolean;
        cancel_on_tap_outside?: boolean;
      }): void;
      renderButton(
        contenedor: HTMLElement,
        opciones: {
          type?: "standard" | "icon";
          theme?: "outline" | "filled_blue" | "filled_black";
          size?: "large" | "medium" | "small";
          text?: "signin_with" | "continue_with" | "signin";
          shape?: "rectangular" | "pill";
          width?: number;
          locale?: string;
        },
      ): void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

let cargaScript: Promise<GoogleIdentity> | null = null;

function cargarGis(): Promise<GoogleIdentity> {
  if (window.google) return Promise.resolve(window.google);
  if (!cargaScript) {
    cargaScript = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SCRIPT_GIS;
      s.async = true;
      s.defer = true;
      s.onload = () =>
        window.google ? resolve(window.google) : reject(new Error("Google no disponible"));
      s.onerror = () => {
        cargaScript = null;
        reject(new Error("No se pudo cargar el acceso con Google"));
      };
      document.head.appendChild(s);
    });
  }
  return cargaScript;
}

export function BotonGoogle({
  onCredencial,
  deshabilitado = false,
}: {
  onCredencial: (idToken: string) => void;
  deshabilitado?: boolean;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const callback = useRef(onCredencial);
  callback.current = onCredencial;
  const [config, setConfig] = useState<{ clientId: string; dominio: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void configGoogleRequest().then((c) => {
      if (vivo && c.clientId) setConfig({ clientId: c.clientId, dominio: c.dominio });
    });
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    if (!config) return;
    let vivo = true;
    cargarGis()
      .then((g) => {
        if (!vivo || !contenedor.current) return;
        g.accounts.id.initialize({
          client_id: config.clientId,
          callback: (r) => callback.current(r.credential),
          hd: config.dominio,
          ux_mode: "popup",
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        g.accounts.id.renderButton(contenedor.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "signin_with",
          shape: "rectangular",
          width: contenedor.current.offsetWidth || 320,
          locale: "es",
        });
      })
      .catch((e: unknown) => {
        if (vivo) setError(e instanceof Error ? e.message : "Acceso con Google no disponible");
      });
    return () => {
      vivo = false;
    };
  }, [config]);

  if (!config) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-[11px] font-semibold tracking-wider text-grafito-500 uppercase">
        <span className="h-px flex-1 bg-slate-200" aria-hidden />o
        <span className="h-px flex-1 bg-slate-200" aria-hidden />
      </div>
      <div
        aria-busy={deshabilitado}
        className={deshabilitado ? "pointer-events-none opacity-60" : undefined}
        ref={contenedor}
      />
      <p className="text-center text-[11px] text-grafito-500">
        Solo cuentas institucionales <strong>@{config.dominio}</strong>
      </p>
      {error && <p className="text-center text-[11px] font-medium text-red-700">{error}</p>}
    </div>
  );
}
