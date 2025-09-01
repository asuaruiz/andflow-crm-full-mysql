import React, { useEffect, useState } from "react";
import { apiGet } from "../../lib/api";
import { useAuth } from "../../context/AuthContext.jsx";

export default function TenantSwitcher() {
  const { tenantId, switchTenant, isSuperAdmin } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const r = await apiGet("/api/platform/tenants");
        setItems(r.items || r.tenants || []); // soporta ambos
      } catch (e) {
        setErr(e.message || "No se pudo listar empresas");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const onChange = async (e) => {
    const v = e.target.value;
    const tid = v === "" ? null : Number(v);
    try {
      await switchTenant(tid);
    } catch (e2) {
      // opcional: manejar error
    }
  };

  return (
    <div className="flex items-center gap-2">
      <select
        className="h-9 px-3 rounded-lg border bg-white"
        value={tenantId ?? ""}
        onChange={onChange}
        disabled={loading || !!err}
        title={err || "Cambiar empresa"}
      >
        {isSuperAdmin && <option value="">— plataforma —</option>}
        {items.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </div>
  );
}
