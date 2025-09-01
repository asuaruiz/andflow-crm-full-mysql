// apps/frontend/src/components/platform/TenantsAdminPage.jsx
import React, { useEffect, useMemo, useRef, useState, forwardRef } from "react";
import { apiGet, apiJson } from "../../lib/api";
import { useAuth } from "../../context/AuthContext.jsx";
import { Plus, Loader2, Check, X, Trash2, AlertTriangle, Pencil } from "lucide-react";

/* ---------- UI helpers ---------- */
const Section = ({ title, description, right, children }) => (
  <section className="rounded-2xl border border-[var(--border)] bg-[var(--color-card)]">
    {(title || description || right) && (
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
        <div>
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {description && <p className="text-xs text-[var(--muted)] mt-0.5">{description}</p>}
        </div>
        {right}
      </div>
    )}
    <div className="p-5">{children}</div>
  </section>
);

const Button = ({ children, variant = "primary", className = "", ...rest }) => {
  const base =
    "h-10 px-4 rounded-xl text-sm font-medium inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed";
  const style =
    variant === "primary"
      ? "bg-[var(--color-primary)] text-[var(--color-on-primary)] hover:opacity-90"
      : variant === "danger"
      ? "bg-red-600 text-white hover:bg-red-700"
      : variant === "ghost"
      ? "hover:bg-black/5"
      : "bg-slate-100 hover:bg-slate-200";
  return (
    <button {...rest} className={`${base} ${style} ${className}`}>
      {children}
    </button>
  );
};

const Input = forwardRef(function Input({ label, required, ...props }, ref) {
  return (
    <label className="block">
      {label && (
        <div className="text-xs font-medium text-slate-600 mb-1">
          {label} {required && <span className="text-red-500">*</span>}
        </div>
      )}
      <input
        ref={ref}
        {...props}
        className={
          "w-full h-10 px-3 rounded-xl border outline-none transition " +
          "border-[var(--border)] bg-white focus:ring-2 focus:ring-[var(--color-primary)]/30"
        }
      />
    </label>
  );
});

const Modal = ({ open, title, onClose, children, footer }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="w-[680px] max-w-[92vw] rounded-2xl bg-white shadow-xl border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-base font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="h-8 px-3 rounded-lg hover:bg-black/5 text-slate-600"
            title="Cerrar"
          >
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-slate-200">{footer}</div>}
      </div>
    </div>
  );
};
/* ---------- /UI helpers ---------- */

export default function TenantsAdminPage() {
  const { isSuperAdmin, switchTenant } = useAuth();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modal Crear
  const [openCreate, setOpenCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  // Modal Editar
  const [openEdit, setOpenEdit] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [editRut, setEditRut] = useState("");
  const [editName, setEditName] = useState("");
  const [editSubdomain, setEditSubdomain] = useState("");
  const [editActive, setEditActive] = useState(1);

  // Modal Eliminar
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [target, setTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  // Form Crear: RUT + Nombre + Subdominio? + Admin
  const [rut, setRut] = useState("");
  const [name, setName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  const firstFieldRef = useRef(null);
  useEffect(() => {
    if (openCreate) setTimeout(() => firstFieldRef.current?.focus(), 0);
  }, [openCreate]);

  // Solo SuperAdmin edita/ve acciones
  const canEdit = isSuperAdmin;

  async function load() {
    setLoading(true);
    setError("");
    try {
      const r = await apiGet("/api/platform/tenants");
      setItems(r.items || r.tenants || []);
    } catch (e) {
      setError(e.message || "Error al cargar empresas");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const canCreate =
    !!rut.trim() && !!name.trim() && !!adminEmail.trim() && !!adminPassword.trim() && !creating;

  async function createTenant(e) {
    e?.preventDefault?.();
    if (!canCreate) return;

    setCreating(true);
    setError("");
    try {
      const body = {
        rut: rut.trim(),
        name: name.trim(),
        subdomain: subdomain.trim() || null,
        adminEmail: adminEmail.trim(),
        adminName: adminName.trim() || null,
        adminPassword: adminPassword.trim(),
      };
      const r = await apiJson("/api/platform/tenants", { method: "POST", body });

      // limpiar y cerrar
      setRut("");
      setName("");
      setSubdomain("");
      setAdminEmail("");
      setAdminName("");
      setAdminPassword("");
      setOpenCreate(false);

      await load();

      // entrar al tenant recién creado (opcional)
      const newId = r?.item?.id || r?.tenant?.id;
      if (newId) {
        try { await switchTenant(newId); } catch {}
      }
    } catch (e) {
      setError(e.message || "No se pudo crear");
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(t) {
    setError("");
    const next = { ...t, is_active: t.is_active ? 0 : 1 };
    try {
      await apiJson(`/api/platform/tenants/${t.id}`, {
        method: "PUT",
        body: { is_active: next.is_active, name: t.name, rut: t.rut, subdomain: t.subdomain || null },
      });
      setItems((arr) => arr.map((x) => (x.id === t.id ? next : x)));
    } catch (e) {
      setError(e.message || "No se pudo actualizar");
    }
  }

  // ----- Editar -----
  function openEditModal(t) {
    setEditTarget(t);
    setEditRut(t.rut || "");
    setEditName(t.name || "");
    setEditSubdomain(t.subdomain || "");
    setEditActive(t.is_active ? 1 : 0);
    setOpenEdit(true);
  }

  const canSaveEdit = !!editName.trim() && !!editRut.trim() && !editing;

  async function saveEdit(e) {
    e?.preventDefault?.();
    if (!editTarget || !canSaveEdit) return;
    setEditing(true);
    setError("");
    try {
      const body = {
        name: editName.trim(),
        rut: editRut.trim(),
        subdomain: editSubdomain.trim() || null,
        is_active: editActive ? 1 : 0,
      };
      const r = await apiJson(`/api/platform/tenants/${editTarget.id}`, { method: "PUT", body });
      const updated = r?.item || { ...editTarget, ...body };
      setItems((arr) => arr.map((x) => (x.id === editTarget.id ? updated : x)));
      setOpenEdit(false);
    } catch (e) {
      setError(e.message || "No se pudo guardar los cambios");
    } finally {
      setEditing(false);
    }
  }

  // ----- Eliminar -----
  function askDelete(t) {
    setTarget(t);
    setConfirmText("");
    setConfirmOpen(true);
  }

  async function doDelete() {
    if (!target) return;
    setDeleting(true);
    setError("");
    try {
      await apiJson(`/api/platform/tenants/${target.id}`, { method: "DELETE" });
      setItems((arr) => arr.filter((x) => x.id !== target.id));
      setConfirmOpen(false);
    } catch (e) {
      setError(e.message || "No se pudo eliminar el tenant");
    } finally {
      setDeleting(false);
    }
  }

  const right = useMemo(
    () => (
      <Button onClick={() => setOpenCreate(true)} disabled={!canEdit}>
        <Plus className="w-4 h-4" />
        Nueva empresa
      </Button>
    ),
    [canEdit]
  );

  // Gate: solo SuperAdmin ve la página completa
  if (!isSuperAdmin) {
    return (
      <div className="p-6">
        <div className="rounded-xl border p-4 bg-yellow-50 border-yellow-200 text-yellow-800">
          Solo los Super Admin pueden acceder a esta página.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Section title="Empresas" description="Administra tenants de la plataforma" right={right}>
        {error && (
          <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando...
          </div>
        ) : (
          <div className="rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left p-3 w-20">ID</th>
                  <th className="text-left p-3">Nombre</th>
                  <th className="text-left p-3 w-40">RUT</th>
                  <th className="text-left p-3 w-40">Subdominio</th>
                  <th className="text-left p-3 w-24">Activo</th>
                  <th className="text-left p-3 w-[560px]">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {items.map((t) => (
                  <tr key={t.id} className="border-t">
                    <td className="p-3">{t.id}</td>
                    <td className="p-3">{t.name}</td>
                    <td className="p-3">{t.rut}</td>
                    <td className="p-3">{t.subdomain || "—"}</td>
                    <td className="p-3">{t.is_active ? "Sí" : "No"}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="ghost"
                          onClick={() => switchTenant(t.id)}
                          title="Entrar a este tenant"
                          disabled={!canEdit}
                        >
                          Entrar
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => openEditModal(t)}
                          title="Editar tenant"
                          disabled={!canEdit}
                        >
                          <Pencil className="w-4 h-4" />
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => toggleActive(t)}
                          title={t.is_active ? "Desactivar" : "Activar"}
                          disabled={!canEdit}
                        >
                          {t.is_active ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                          {t.is_active ? "Desactivar" : "Activar"}
                        </Button>
                        <Button
                          variant="danger"
                          onClick={() => askDelete(t)}
                          title="Eliminar tenant definitivamente"
                          disabled={!canEdit}
                        >
                          <Trash2 className="w-4 h-4" />
                          Eliminar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!items.length && (
                  <tr>
                    <td className="p-6 text-slate-500" colSpan={6}>
                      No hay empresas aún.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Modal Crear */}
      <Modal
        open={openCreate}
        title="Crear nueva empresa"
        onClose={() => !creating && setOpenCreate(false)}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpenCreate(false)} disabled={creating}>
              Cancelar
            </Button>
            <Button onClick={createTenant} disabled={!canCreate}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Crear
            </Button>
          </div>
        }
      >
        <form onSubmit={createTenant} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            ref={firstFieldRef}
            label="RUT"
            required
            placeholder="12.345.678-9"
            value={rut}
            onChange={(e) => setRut(e.target.value)}
            autoComplete="off"
          />
          <Input
            label="Nombre"
            required
            placeholder="Nombre de la empresa"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="organization"
          />
          <Input
            label="Subdominio (opcional)"
            placeholder="mimarca (opcional)"
            value={subdomain}
            onChange={(e) => setSubdomain(e.target.value)}
            autoComplete="off"
          />
          <div className="md:col-span-2 border-t my-2" />
          <Input
            label="Admin email"
            required
            type="email"
            placeholder="admin@empresa.com"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            autoComplete="email"
          />
          <Input
            label="Admin nombre (opcional)"
            placeholder="Nombre del admin"
            value={adminName}
            onChange={(e) => setAdminName(e.target.value)}
            autoComplete="name"
          />
          <Input
            label="Admin password"
            required
            type="password"
            placeholder="Contraseña"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            autoComplete="new-password"
          />
        </form>
        <p className="text-xs text-slate-500 mt-3">
          Los campos marcados con <span className="text-red-500">*</span> son obligatorios.
        </p>
      </Modal>

      {/* Modal Editar */}
      <Modal
        open={openEdit}
        title={`Editar empresa${editTarget ? ` — ID ${editTarget.id}` : ""}`}
        onClose={() => !editing && setOpenEdit(false)}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpenEdit(false)} disabled={editing}>
              Cancelar
            </Button>
            <Button onClick={saveEdit} disabled={!canSaveEdit}>
              {editing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
              Guardar
            </Button>
          </div>
        }
      >
        <form onSubmit={saveEdit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="RUT"
            required
            value={editRut}
            onChange={(e) => setEditRut(e.target.value)}
            autoComplete="off"
          />
          <Input
            label="Nombre"
            required
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            autoComplete="organization"
          />
          <Input
            label="Subdominio (opcional)"
            value={editSubdomain}
            onChange={(e) => setEditSubdomain(e.target.value)}
            autoComplete="off"
          />
          <label className="flex items-center gap-2 text-sm mt-2">
            <input
              type="checkbox"
              checked={!!editActive}
              onChange={(e) => setEditActive(e.target.checked ? 1 : 0)}
            />
            Activo
          </label>
        </form>
      </Modal>

      {/* Modal Confirmar Eliminación */}
      <Modal
        open={confirmOpen}
        title="Eliminar tenant"
        onClose={() => !deleting && setConfirmOpen(false)}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={deleting}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={doDelete}
              disabled={deleting || confirmText !== "ELIMINAR"}
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Eliminar
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 text-red-700">
            <AlertTriangle className="w-5 h-5 mt-0.5" />
            <div>
              <p className="font-semibold">Esta acción es definitiva.</p>
              <p className="text-sm">
                Se eliminarán todos los datos del tenant <strong>{target?.name}</strong>:
                productos, inventario, movimientos, picking, ventas, clientes, roles, configuraciones, etc.
              </p>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-600">
              Escribe <code className="px-1 py-0.5 bg-slate-100 rounded">ELIMINAR</code> para confirmar:
            </label>
            <input
              className="mt-1 w-full h-10 px-3 rounded-xl border border-[var(--border)] outline-none"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="ELIMINAR"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
