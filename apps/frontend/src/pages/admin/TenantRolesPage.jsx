// apps/frontend/src/pages/admin/TenantRolesPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext.jsx";

async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  return res.json();
}

export default function TenantRolesPage() {
  const { isSuperAdmin, hasPerm } = useAuth();
  const allowed = isSuperAdmin || hasPerm?.("tenant.users.manage");

  const [loading, setLoading] = useState(true);
  const [tenant, setTenant] = useState(null);     // 👈 NUEVO
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [assign, setAssign] = useState([]); // {user_id, role_code}

  // UI: creación
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    initialRoleCode: "TENANT_VIEWER",
  });
  const [creating, setCreating] = useState(false);
  const [lastCreateInfo, setLastCreateInfo] = useState(null);

  const assigned = useMemo(() => {
    const s = new Set(assign.map(a => `${a.user_id}::${a.role_code}`));
    return (userId, roleCode) => s.has(`${userId}::${roleCode}`);
  }, [assign]);

  async function load() {
    setLoading(true);
    const [u, r] = await Promise.all([
      api("/api/tenant/users"),
      api("/api/tenant/users/roles"),
    ]);
    if (u.ok) {
      setTenant(u.tenant || null);                                  // 👈 NUEVO
      setUsers(u.users || []);
      setAssign((u.assignments || []).map(a => ({
        user_id: a.user_id,
        role_code: a.role_code,
      })));
    }
    if (r.ok) setRoles(r.roles || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function toggle(userId, roleCode) {
    const res = await api(`/api/tenant/users/${userId}/roles/${roleCode}/toggle`, { method: "POST" });
    if (res.ok) load();
  }

  function onChange(k, v) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function submitCreate(e) {
    e?.preventDefault?.();
    if (!form.email) return;

    setCreating(true);
    const res = await api("/api/tenant/users", {
      method: "POST",
      body: JSON.stringify(form),
    });
    setCreating(false);

    if (res.ok) {
      setLastCreateInfo({
        email: res.user?.email || form.email,
        action: res.action,
        tempPassword: res.tempPassword || null,
      });
      setShowCreate(false);
      setForm({ name: "", email: "", password: "", initialRoleCode: "TENANT_VIEWER" });
      load();
    } else {
      alert(res.error || "No se pudo crear/adjuntar el usuario.");
    }
  }

  if (!allowed) return null;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Roles & Perfiles del Tenant</h1>
            <p className="text-sm text-[var(--muted)] mt-1">
              Asigna, revoca o crea usuarios y define su rol inicial de alcance <b>tenant</b>.
            </p>
          </div>
          {/* Badge con el tenant actual */}
          {tenant && (
            <span className="px-3 py-1 rounded-full text-xs font-medium border border-[var(--border)] bg-[var(--color-card)]">
              Tenant: {tenant.name || `#${tenant.id}`}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="h-9 px-4 rounded-lg bg-[var(--color-primary)] text-[var(--color-on-primary)] font-medium"
        >
          Nuevo usuario
        </button>
      </header>

      {lastCreateInfo && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--color-card)] px-4 py-3">
          <div className="text-sm">
            {lastCreateInfo.action === "created" ? (
              <>
                Usuario <b>{lastCreateInfo.email}</b>{" "}
                <span className="text-emerald-700 font-medium">creado</span> y añadido al tenant.
                {lastCreateInfo.tempPassword && (
                  <> Contraseña temporal: <code>{lastCreateInfo.tempPassword}</code></>
                )}
              </>
            ) : (
              <>
                Usuario <b>{lastCreateInfo.email}</b>{" "}
                <span className="text-emerald-700 font-medium">adjuntado</span> al tenant.
              </>
            )}
          </div>
        </div>
      )}

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--color-card)]">
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <h2 className="font-semibold">Asignaciones</h2>
        </div>

        {loading ? (
          <div className="p-6 text-[var(--muted)]">Cargando…</div>
        ) : (
          <div className="overflow-auto p-4">
            <table className="min-w-full border border-[var(--border)] rounded-xl overflow-hidden">
              <thead>
                <tr className="bg-[var(--color-bg)]">
                  {isSuperAdmin && ( // 👈 Columna solo para SuperAdmin
                    <th className="text-left p-2 border-b border-[var(--border)]">Tenant</th>
                  )}
                  <th className="text-left p-2 border-b border-[var(--border)]">Usuario</th>
                  {roles.map(r => (
                    <th key={r.code} className="text-left p-2 border-b border-[var(--border)]">
                      <div className="text-sm font-medium">{r.name}</div>
                      <div className="text-[10px] text-[var(--muted)]">{r.code}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="odd:bg-white even:bg-[var(--color-bg)]">
                    {isSuperAdmin && (
                      <td className="p-2 border-b border-[var(--border)] text-sm">
                        {tenant?.name || `#${tenant?.id ?? ""}`}
                      </td>
                    )}
                    <td className="p-2 border-b border-[var(--border)]">
                      <div className="font-medium">{u.name || u.email}</div>
                      <div className="text-xs text-[var(--muted)]">{u.email}</div>
                    </td>
                    {roles.map(r => (
                      <td key={r.code} className="p-2 border-b border-[var(--border)]">
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={assigned(u.id, r.code)}
                            onChange={() => toggle(u.id, r.code)}
                          />
                          <span className="text-xs">{r.code}</span>
                        </label>
                      </td>
                    ))}
                  </tr>
                ))}
                {!users.length && (
                  <tr>
                    <td
                      colSpan={(isSuperAdmin ? 1 : 0) + 1 + roles.length}
                      className="p-8 text-center text-[var(--muted)]"
                    >
                      No hay usuarios asociados a este tenant aún.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-[var(--muted)] px-1 pb-4">
        Solo visible para <b>SuperAdmin</b> o usuarios con permiso <code>tenant.users.manage</code>.
      </p>

      {/* Modal Crear Usuario */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowCreate(false)} />
          <div className="relative w-full max-w-lg rounded-2xl bg-[var(--color-card)] border border-[var(--border)] shadow-xl">
            <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
              <h3 className="font-semibold">Nuevo usuario del tenant</h3>
              <button className="text-[var(--muted)]" onClick={() => setShowCreate(false)}>✕</button>
            </div>

            <form onSubmit={submitCreate} className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[var(--muted)]">Nombre</label>
                  <input
                    className="mt-1 w-full border rounded-lg px-3 py-2"
                    placeholder="Opcional"
                    value={form.name}
                    onChange={e => onChange("name", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-[var(--muted)]">Email *</label>
                  <input
                    required
                    type="email"
                    className="mt-1 w-full border rounded-lg px-3 py-2"
                    placeholder="usuario@empresa.com"
                    value={form.email}
                    onChange={e => onChange("email", e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[var(--muted)]">Contraseña (opcional)</label>
                  <input
                    className="mt-1 w-full border rounded-lg px-3 py-2"
                    placeholder="Si la dejas vacía, se genera una temporal"
                    value={form.password}
                    onChange={e => onChange("password", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-[var(--muted)]">Rol inicial</label>
                  <select
                    className="mt-1 w-full border rounded-lg px-3 py-2"
                    value={form.initialRoleCode}
                    onChange={e => onChange("initialRoleCode", e.target.value)}
                  >
                    {roles.map(r => (
                      <option key={r.code} value={r.code}>{r.name} ({r.code})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="h-9 px-4 rounded-lg border border-[var(--border)]"
                  onClick={() => setShowCreate(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="h-9 px-4 rounded-lg bg-[var(--color-primary)] text-[var(--color-on-primary)] font-medium"
                >
                  {creating ? "Creando..." : "Crear"}
                </button>
              </div>

              <p className="text-[11px] text-[var(--muted)]">
                Si el email ya existe en la plataforma, se adjunta a este tenant y se asigna el rol seleccionado.
              </p>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
