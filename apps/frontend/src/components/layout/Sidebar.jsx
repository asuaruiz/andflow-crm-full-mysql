import React, { useState } from "react";
import {
  Home, Package, Settings, Users, FileSpreadsheet, NotebookText, Bell,
  ShoppingCart, BarChart3, ChevronDown, BookOpenCheck, Building2, LogOut, Plug,
  ShieldCheck
} from "lucide-react";
import { cn } from "../../lib/cn";
import { Link, useRoute } from "../../router";
import { useAuth } from "../../context/AuthContext.jsx";

export default function Sidebar(){
  const { path } = useRoute();
  const [invOpen, setInvOpen] = useState(true);

  const { isSuperAdmin, hasPerm, tenantId, tenantName, logout } = useAuth();
  const can = (permCode) => isSuperAdmin || hasPerm(permCode);
  const canManageTenantUsers = isSuperAdmin || hasPerm("tenant.users.manage");

  const Item = ({ icon:Icon, label, to, disabled=false }) => {
    const active = path === to || (to !== "/" && path.startsWith(to));
    return (
      <Link
        to={disabled ? path : to}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm hover:bg-black/5 transition",
          active && "bg-[var(--color-primary)] text-[var(--color-on-primary)]",
          disabled && "opacity-50 cursor-not-allowed hover:bg-transparent"
        )}
        activeClassName="bg-[var(--color-primary)] text-[var(--color-on-primary)]"
        aria-disabled={disabled}
      >
        <Icon size={18} /><span>{label}</span>
      </Link>
    );
  };

  const Group = ({ title, children }) => (
    <div className="mt-2">
      <div className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );

  return (
    <aside
      className="h-full w-64 shrink-0 px-3 py-4"
      style={{ background:"linear-gradient(180deg, var(--color-card), transparent)", borderRight:"1px solid var(--border)"}}
    >
      {/* Encabezado: logo + nombre del tenant */}
      <div className="flex items-center gap-2 px-2 mb-4">
        <div className="w-8 h-8 rounded-xl" style={{ background:"var(--color-primary)" }} />
        <div className="font-semibold truncate max-w-[11rem]" title={tenantName || "andflow CRM"}>
          {tenantName || "andflow CRM"}
        </div>
      </div>

      <nav className="space-y-2">
        {isSuperAdmin && (
          <Group title="Plataforma">
            <Item icon={Building2} label="Empresas" to="/platform/tenants" />
          </Group>
        )}

        {can("module.dashboard.view") && <Item icon={Home} label="Dashboard" to="/dashboard" />}

        {can("module.inventario.view") && (
          <Group title="Inventario">
            <button
              onClick={() => setInvOpen(o => !o)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm hover:bg-black/5"
            >
              <span className="flex items-center gap-3"><Package size={18}/> Inventario</span>
              <ChevronDown size={16} className={cn("transition", invOpen && "rotate-180")} />
            </button>
            {invOpen && (
              <div className="pl-9 pr-2 py-1 space-y-1">
                <Item icon={FileSpreadsheet} label="Maestra de productos" to="/inventario/maestra" />
                {can("inventory.sessions.view") && (
                  <Item icon={Package} label="Picking / Inventario" to="/inventario/picking" />
                )}
                <Item icon={NotebookText} label="Movimientos" to="/inventario/movimientos" />
                <Item icon={Bell} label="Alertas" to="/inventario/alertas" />
              </div>
            )}
            
          </Group>
        )}

        {can("module.ventas.view") && <Item icon={ShoppingCart} label="Ventas (CRM)" to="/ventas" />}

        {can("module.clientes.view") && <Item icon={Users} label="Clientes" to="/clientes" />}
        {can("module.kpis.view") && <Item icon={BarChart3} label="KPIs" to="/kpis" />}

        <Group title="Contabilidad">
          <Item icon={BookOpenCheck} label="Libro diario" to="/contabilidad/libro" />
        </Group>

        <Group title="Integraciones">
          <Item icon={Plug} label="Conexiones" to="/integraciones" disabled={!tenantId} />
        </Group>

        {canManageTenantUsers && (
          <Group title="Administración">
            <Item icon={ShieldCheck} label="Roles & Perfiles" to="/admin/roles" disabled={!tenantId} />
          </Group>
        )}

        <Item icon={Settings} label="Configuración" to="/config" disabled={!tenantId} />

        <div className="px-2">
          <button
            onClick={logout}
            className="w-full h-9 mt-1 px-3 rounded-lg text-sm flex items-center gap-2 justify-start hover:bg-black/5"
            title="Cerrar sesión"
          >
            <LogOut size={16} />
            <span>Salir</span>
          </button>
        </div>
      </nav>

      <div className="mt-6 text-xs text-[var(--muted)] px-2">Desarrollado con amor por Andflow SPA</div>
    </aside>
  );
}
