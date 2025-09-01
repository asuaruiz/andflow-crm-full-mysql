import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { apiGet } from "../lib/api";
import { useAuth } from "./AuthContext.jsx";

const defaultTheme = {
  primary: "#263e8b",
  secondary: "#22c55e",
  card: "#ffffff",
  background: "#f7f7fb", // en seeds antiguos venía como "bg"
};

export const ThemeContext = createContext({
  theme: defaultTheme,
  setTheme: (_t) => {},
  resetTheme: () => {},
});

/* Contraste de texto sobre color primario */
function getOnPrimary(hex) {
  try {
    const c = hex.replace("#", "");
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.55 ? "#0f172a" : "#ffffff";
  } catch {
    return "#ffffff";
  }
}

function applyCssVars(t) {
  const root = document.documentElement;
  root.style.setProperty("--color-primary", t.primary);
  root.style.setProperty("--color-on-primary", getOnPrimary(t.primary));
  root.style.setProperty("--color-secondary", t.secondary);
  root.style.setProperty("--color-card", t.card);
  root.style.setProperty("--color-bg", t.background);
}

/* Normaliza { theme:{ bg,... } } -> { background,... } */
function normalizeThemeFromServer(settings) {
  const s = settings || {};
  const theme = s.theme && typeof s.theme === "object" ? s.theme : s;
  return {
    primary: theme.primary ?? defaultTheme.primary,
    secondary: theme.secondary ?? defaultTheme.secondary,
    card: theme.card ?? defaultTheme.card,
    background: theme.background ?? theme.bg ?? defaultTheme.background,
  };
}

export function ThemeProvider({ children }) {
  const { tenantId } = useAuth();
  const [theme, setThemeState] = useState(defaultTheme);

  // Aplica variables CSS cuando cambia el tema
  useEffect(() => { applyCssVars(theme); }, [theme]);

  // Carga el tema por TENANT cuando cambia el tenantId
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await apiGet("/api/tenant-settings"); // usa cookie de sesión
        const t = normalizeThemeFromServer(r?.settings);
        if (!cancelled) setThemeState(t);
      } catch {
        if (!cancelled) setThemeState(defaultTheme);
      }
    })();
    return () => { cancelled = true; };
  }, [tenantId]);

  // Funciones estables (evita relanzar efectos en consumidores)
  const setTheme = useCallback((t) => {
    setThemeState((prev) => ({ ...prev, ...t }));
  }, []);

  const resetTheme = useCallback(() => {
    setThemeState(defaultTheme);
  }, []);

  const value = useMemo(() => ({ theme, setTheme, resetTheme }), [theme, setTheme, resetTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
