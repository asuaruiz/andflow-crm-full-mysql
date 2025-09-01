// apps/frontend/src/App.jsx
import React, { useEffect } from "react";
import Sidebar from "./components/layout/Sidebar";
import Topbar from "./components/layout/Topbar";

import DashboardPage from "./pages/DashboardPage";
import MaestraPage from "./pages/inventory/MaestraPage";
import MovimientosPage from "./pages/inventory/MovimientosPage";
import AlertasPage from "./pages/inventory/AlertasPage";

// Ventas unificadas
 import VentasPage from "./pages/ventas/VentasPage.jsx";
 import VentaDetallePage from "./pages/ventas/VentaDetallePage.jsx";
 import VentaNuevaPage from "./pages/ventas/VentaNuevaPage.jsx";

import ClientesPage from "./pages/ClientesPage";
import ClienteDetallePage from "./pages/ClienteDetallePage.jsx";

import KpisPage from "./pages/KpisPage";
import ConfigPage from "./pages/ConfigPage";
import LibroDiarioPage from "./pages/accounting/LibroDiarioPage";
import LoginPage from "./pages/auth/LoginPage.jsx";
import IntegrationsPage from "./pages/IntegrationsPage.jsx";
import TenantRolesPage from "./pages/admin/TenantRolesPage.jsx";
import PickingPage from "./pages/inventory/PickingPage.jsx";

// Plataforma (Empresas)
import TenantsAdminPage from "./components/platform/TenantsAdminPage.jsx";

import { ThemeProvider } from "./context/ThemeContext";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";

import { Router, useRoute } from "./router";

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router defaultPath="/login">
          <AppShell />
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

function AppShell() {
  const { path, navigate } = useRoute();
  const auth = useAuth();

  useEffect(() => {
    document.body.style.background = "var(--color-bg)";
    document.body.style.color = "#0f172a";
  }, []);

  // Redirecciones en effect (evita setState en render)
  useEffect(() => {
    if (!auth.loaded) return;
    const requiresAuth = path !== "/login";
    if (requiresAuth && !auth.isAuthenticated) {
      navigate("/login");
    } else if (path === "/login" && auth.isAuthenticated) {
      navigate("/dashboard");
    }
  }, [path, auth.loaded, auth.isAuthenticated, navigate]);

  if (!auth.loaded) return null;

  const ForbiddenPage = () => (
    <div className="p-8">
      <h1 className="text-2xl font-semibold">403 — Sin autorización</h1>
      <p className="text-slate-600 mt-1">No tienes permisos para acceder a esta sección.</p>
    </div>
  );

  const canManageTenantUsers =
    auth.isSuperAdmin || (typeof auth.hasPerm === "function" && auth.hasPerm("tenant.users.manage"));
    const canSeePicking = typeof auth.hasPerm === "function" && auth.hasPerm("inventory.sessions.view");


  // Normaliza path
  const cleanPath = (path || "/").replace(/\?.*$/, "").replace(/\/+$/, "") || "/";

  // Plataforma (solo SuperAdmin)
  const isPlatformTenants =
    cleanPath === "/platform/tenants" ||
    cleanPath === "/platform/tenants/index" ||
    cleanPath.startsWith("/platform/tenants/");


    
  // Router
  const Page = (() => {
    if (cleanPath === "/login") return LoginPage;
      if (cleanPath === "/inventario/picking") return canSeePicking ? PickingPage : ForbiddenPage;

    if (isPlatformTenants) return auth.isSuperAdmin ? TenantsAdminPage : ForbiddenPage;

    if (cleanPath === "/dashboard") return DashboardPage;

    // Inventario
    if (cleanPath === "/inventario" || cleanPath === "/inventario/maestra") return MaestraPage;
    if (cleanPath === "/inventario/movimientos" || path.startsWith("/inventario/movimientos?"))
      return MovimientosPage;
    if (cleanPath === "/inventario/alertas") return AlertasPage;

    // Ventas unificadas
  if (cleanPath === "/ventas") return VentasPage;
  if (cleanPath === "/ventas/nueva") return VentaNuevaPage;
  if (cleanPath.startsWith("/ventas/orden/")) return VentaDetallePage;

    // Clientes
    if (cleanPath === "/clientes") return ClientesPage;
    if (cleanPath.startsWith("/clientes/")) return ClienteDetallePage;

    // KPIs
    if (cleanPath === "/kpis") return KpisPage;

    // Apariencia
    if (cleanPath === "/config") return ConfigPage;

    // Contabilidad
    if (cleanPath === "/contabilidad/libro") return LibroDiarioPage;

    // Integraciones
    if (cleanPath === "/integraciones") return IntegrationsPage;

    // Administración (Roles & Perfiles)
    if (cleanPath === "/admin/roles") return canManageTenantUsers ? TenantRolesPage : ForbiddenPage;

    // Fallback
    return DashboardPage;
  })();

  const isAuthPage = cleanPath === "/login";

  return (
    <div className="h-screen w-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      {!isAuthPage && <Topbar />}
      <div className={isAuthPage ? "h-full" : "flex h-[calc(100vh-56px)]"}>
        {!isAuthPage && <Sidebar />}
        <main className={isAuthPage ? "h-full" : "flex-1 overflow-auto p-4 lg:p-6 space-y-4"}>
          <Page />
        </main>
      </div>
    </div>
  );
}
