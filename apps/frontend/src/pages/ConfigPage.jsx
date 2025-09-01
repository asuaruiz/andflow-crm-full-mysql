import React, { useContext, useEffect, useState } from "react";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { ThemeContext } from "../context/ThemeContext";
import { Palette, CheckCircle2, AlertCircle } from "lucide-react";
import { apiGet, apiJson } from "../lib/api";
import { useAuth } from "../context/AuthContext.jsx";

const DEFAULTS = {
  primary: "#263e8b",
  secondary: "#22c55e",
  card: "#ffffff",
  background: "#f7f7fb",
};

function sanitizeHex(v) {
  if (!v) return "";
  let x = String(v).trim();
  if (x[0] !== "#") x = `#${x}`;
  if (x.length === 4) x = `#${x[1]}${x[1]}${x[2]}${x[2]}${x[3]}${x[3]}`;
  return x.slice(0, 7).toLowerCase();
}

function ColorField({ label, value, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-[var(--muted)]">{value}</div>
      </div>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(sanitizeHex(e.target.value))}
        className="w-12 h-10 rounded-md border"
        style={{ borderColor: "var(--border)" }}
      />
    </div>
  );
}

function pickThemeFromSettings(settings) {
  const s = settings || {};
  const src = s.theme && typeof s.theme === "object" ? s.theme : s;
  return {
    primary: src.primary ?? DEFAULTS.primary,
    secondary: src.secondary ?? DEFAULTS.secondary,
    card: src.card ?? DEFAULTS.card,
    background: src.background ?? src.bg ?? DEFAULTS.background,
  };
}

export default function ConfigPage() {
  const { tenantId } = useAuth();
  const { setTheme, resetTheme } = useContext(ThemeContext);

  const [local, setLocal] = useState(DEFAULTS);
  const [themeStatus, setThemeStatus] = useState(null);
  const [themeSaving, setThemeSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await apiGet("/api/tenant-settings");
        const theme = pickThemeFromSettings(r?.settings);
        if (!cancelled) {
          setLocal(theme);
          setTheme(theme);
        }
      } catch {
        if (!cancelled) {
          setLocal(DEFAULTS);
          setTheme(DEFAULTS);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tenantId, setTheme]);

  const update = (k, v) => setLocal((s) => ({ ...s, [k]: v }));

  const apply = async () => {
    setThemeSaving(true);
    setThemeStatus(null);
    try {
      setTheme(local);
      const resp = await apiJson("/api/tenant-settings", "PUT", { settings: { theme: local } });
      if (resp?.ok) setThemeStatus({ ok: true, msg: "Configuración guardada correctamente." });
      else setThemeStatus({ ok: false, msg: "Error al guardar la configuración." });
    } catch (e) {
      setThemeStatus({ ok: false, msg: "Error al actualizar los colores: " + (e?.message || "desconocido") });
    } finally {
      setThemeSaving(false);
    }
  };

  const restoreDefaults = () => {
    setLocal(DEFAULTS);
    resetTheme();
    setThemeStatus(null);
  };

  if (loading) return <div />;

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Palette size={18} />
          <h3 className="font-semibold">Apariencia</h3>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <ColorField label="Color primario" value={local.primary} onChange={(v) => update("primary", v)} />
          <ColorField label="Color secundario" value={local.secondary} onChange={(v) => update("secondary", v)} />
          <ColorField label="Fondo (background)" value={local.background} onChange={(v) => update("background", v)} />
          <ColorField label="Cards" value={local.card} onChange={(v) => update("card", v)} />
        </div>

        <div className="flex items-center gap-2 mt-4">
          <Button onClick={apply} disabled={themeSaving}>Aplicar</Button>
          <Button variant="secondary" onClick={restoreDefaults}>Restablecer</Button>
        </div>

        {themeStatus && (
          <div className="flex items-center gap-2 mt-3 text-sm" style={{ color: themeStatus.ok ? "#15803d" : "#b91c1c" }}>
            {themeStatus.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{themeStatus.msg}</span>
          </div>
        )}
      </Card>

      <Card>
        <h3 className="font-semibold mb-2">Vista previa</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl p-4 border" style={{ borderColor: "var(--border)", background: "var(--color-card)" }}>
            <div className="text-xs text-[var(--muted)] mb-1">Card</div>
            <div className="font-medium">Contenido ejemplo</div>
            <p className="text-sm text-[var(--muted)]">Texto descriptivo con contraste correcto.</p>
          </div>
          <div className="rounded-2xl p-4 border" style={{ borderColor: "var(--border)", background: "var(--color-primary)", color: "var(--color-on-primary)" }}>
            <div className="text-xs opacity-80 mb-1">Primario</div>
            <div className="font-medium">Bloque destacado</div>
            <p className="text-sm opacity-80">Chequea legibilidad de texto.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
