import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";
import { apiGet, apiJson } from "../lib/api";

/* ------------------------ Helpers ------------------------ */

// Normaliza el “nombre” de un tenant cualquiera sea el shape
const pickTenantName = (t) =>
  t?.display_name ||
  t?.name ||
  t?.label ||
  t?.razon_social ||
  t?.company_name ||
  null;

// Extrae tenantId desde distintas variantes comunes
const extractTenantId = (r) =>
  r?.tenantId ??
  r?.tenant_id ??
  r?.tenant?.id ??
  r?.user?.tenantId ??
  r?.user?.tenant_id ??
  null;

// Busca el nombre dentro de memberships/tenants del usuario (si existieran)
const nameFromUserPools = (user, tenantId) => {
  if (!user || !tenantId) return null;
  const pools = [user.memberships, user.tenants, user.userTenants];
  for (const list of pools) {
    const arr = Array.isArray(list) ? list : [];
    const found = arr.find(
      (x) =>
        String(x?.tenant_id ?? x?.id ?? x?.tenant?.id ?? "") ===
        String(tenantId)
    );
    if (found) {
      return (
        pickTenantName(found?.tenant) ||
        pickTenantName(found) ||
        found?.tenant_name ||
        found?.name ||
        null
      );
    }
  }
  return null;
};

// Fallback amistoso si no tenemos nombre real
const fallbackTenantName = (tenantId) =>
  tenantId != null ? `Empresa #${tenantId}` : null;

/* ------------------------ Contexto ------------------------ */

const AuthContext = createContext({
  loaded: false,
  isAuthenticated: false,
  isSuperAdmin: false,
  user: null,
  tenantId: null,
  tenantName: null,
  tenant: null,
  login: async () => {},
  logout: async () => {},
  refresh: async () => {},
  setTenantId: async () => {},
  switchTenant: async () => {},
  hasPerm: () => false,
});

export function AuthProvider({ children }) {
  const [state, setState] = useState({
    loaded: false,
    isAuthenticated: false,
    isSuperAdmin: false,
    user: null,
    tenantId: null,
    tenantName: null,
    tenant: null,
  });

  const safeReset = useCallback(() => {
    setState({
      loaded: true,
      isAuthenticated: false,
      isSuperAdmin: false,
      user: null,
      tenantId: null,
      tenantName: null,
      tenant: null,
    });
  }, []);

  // Refresca datos de sesión + tenant SIN llamarle a endpoints de plataforma
const refresh = useCallback(async () => {
  try {
    const curr = await apiGet("/auth/tenant/current"); // { ok, tenantId, user, [tenant], [tenantName] }
    if (!curr?.ok) return safeReset();

    const tid = extractTenantId(curr);
    const isSA = !!curr?.user?.isSuperAdmin;

    let tenantName =
      curr?.tenantName ||
      pickTenantName(curr?.tenant) ||
      nameFromUserPools(curr?.user, tid) ||
      null;

    let tenantObj = curr?.tenant || null;

    // --- Cache local
    const cacheKey = tid != null ? `tenant.name:${tid}` : null;
    if (!tenantName && cacheKey) {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) tenantName = cached;
      } catch {}
    }

    // ¿Es un fallback tipo "Empresa #n"?
    const isFallback =
      typeof tenantName === "string" && /^empresa\s*#\d+$/i.test(tenantName);

    // --- Resolver en vivo si soy SA y NO tengo nombre real o es fallback
    const shouldResolveLive = isSA && tid != null && (!tenantName || isFallback);
    if (shouldResolveLive) {
      try {
        // Si tienes este endpoint, es más directo (lo agrego más abajo)
        const t = await apiGet(`/api/platform/tenants/${tid}`);
        const nm = pickTenantName(t?.tenant || t);
        if (nm) { tenantName = nm; tenantObj = t?.tenant || tenantObj; }
      } catch {
        // Fallback: listar y buscar por id
        try {
          const list = await apiGet(`/api/platform/tenants?limit=200`);
          const arr = list?.items || list?.tenants || [];
          const f = Array.isArray(arr) ? arr.find(x => String(x.id) === String(tid)) : null;
          const nm = pickTenantName(f);
          if (nm) { tenantName = nm; tenantObj = f || tenantObj; }
        } catch {}
      }
    }

    // Último recurso
    if (!tenantName) tenantName = fallbackTenantName(tid);

    // Actualiza cache
    if (cacheKey && tenantName) {
      try { localStorage.setItem(cacheKey, tenantName); } catch {}
    }

    setState({
      loaded: true,
      isAuthenticated: true,
      isSuperAdmin: isSA,
      user: curr?.user || null,
      tenantId: tid ?? null,
      tenantName: tenantName ?? null,
      tenant: tenantObj,
    });

    try { window.dispatchEvent(new CustomEvent("tenant:changed")); } catch {}
  } catch {
    safeReset();
  }
}, [safeReset]);



  const login = useCallback(
    async (email, password) => {
      await apiJson("/auth/login", { method: "POST", body: { email, password } });
      await refresh();
    },
    [refresh]
  );

  const logout = useCallback(async () => {
    try {
      await apiJson("/auth/logout", { method: "POST" });
    } catch {}
    safeReset();
  }, [safeReset]);

  const switchTenant = useCallback(
    async (newTenantId) => {
      await apiJson("/auth/tenant/switch", {
        method: "POST",
        body: { tenantId: newTenantId },
      });
      await refresh();
    },
    [refresh]
  );

  // Alias de compatibilidad
  const setTenantId = switchTenant;

  const hasPerm = useCallback(
    (code) => !!state.user?.permissions?.includes(code),
    [state.user]
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      ...state,
      login,
      logout,
      refresh,
      setTenantId,
      switchTenant,
      hasPerm,
    }),
    [state, login, logout, refresh, switchTenant, hasPerm]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
