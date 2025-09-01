// apps/frontend/src/pages/ventas/VentasPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import { useAuth } from "../../context/AuthContext.jsx";

function Th({ children, className = "" }) {
  return <th className={"px-4 py-3 text-xs font-semibold text-slate-500 " + className}>{children}</th>;
}
function Td({ children, className = "" }) {
  return <td className={"px-4 py-3 " + className}>{children}</td>;
}

export default function VentasPage() {
  const { tenantId } = useAuth();

  const [rows, setRows] = useState([]);
  const [since, setSince] = useState("");
  const [limit, setLimit] = useState(50);
  const [origin, setOrigin] = useState(""); // '', 'crm', 'shopify'
  const [q, setQ] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);

  const hdrs = useMemo(
    () => ({
      credentials: "include",
      headers: tenantId ? { "x-tenant-id": String(tenantId), "Content-Type": "application/json" } : { "Content-Type": "application/json" },
    }),
    [tenantId]
  );

  const buildUrl = () => {
    const usp = new URLSearchParams();
    usp.set("limit", String(limit));
    if (since) usp.set("since", since);
    if (origin) usp.set("origin", origin);
    if (q.trim()) usp.set("q", q.trim());
    return `/api/sales?${usp.toString()}`;
  };

  const load = async () => {
    if (!tenantId) {
      setError("Selecciona una empresa para listar ventas.");
      return;
    }
    setLoading(true);
    setError(null);
    setMsg(null);
    try {
      const r = await fetch(buildUrl(), hdrs);
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
      setRows(j.items || []);
    } catch (e) {
      setError(String(e.message || e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tenantId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const syncShopify = async () => {
    if (!tenantId) {
      setError("Selecciona una empresa para sincronizar.");
      return;
    }
    setLoading(true);
    setError(null);
    setMsg(null);
    try {
      const body = since ? { since } : {};
      const r = await fetch("/api/sales/sync/shopify", { method: "POST", body: JSON.stringify(body), ...hdrs });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
      setMsg(`Shopify sincronizado: ${j.count ?? j.synced ?? "OK"}`);
      await load();
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  const goDetail = (id) => (window.location.hash = `#/ventas/orden/${id}`);
  const goNew = () => (window.location.hash = "#/ventas/nueva");

  const total = useMemo(() => rows.reduce((acc, o) => acc + Number(o.total_price || 0), 0), [rows]);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div>
            <h3 className="font-semibold">Ventas (unificadas)</h3>
            <p className="text-sm text-[var(--muted)]">Incluye ventas del CRM y ventas importadas de Shopify.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Buscar (#orden, email, cliente, RUT)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ width: 260 }}
            />
            <Input type="date" value={since} onChange={(e) => setSince(e.target.value)} />
            <select
              className="h-9 rounded-lg border px-2 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--color-card)" }}
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
            >
              <option value="">Origen: todos</option>
              <option value="crm">CRM</option>
              <option value="shopify">Shopify</option>
            </select>
            <Input
              type="number"
              min="1"
              max="250"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value || 50))}
              style={{ width: 90 }}
            />
            <Button variant="secondary" onClick={load} disabled={loading || !tenantId}>
              {loading ? "Cargando…" : "Listar"}
            </Button>
            <Button onClick={syncShopify} disabled={loading || !tenantId}>
              {loading ? "Sincronizando…" : "Sync Shopify"}
            </Button>
            <Button onClick={goNew}>Nueva venta</Button>
          </div>
        </div>
        {msg && <div className="mt-2 text-sm" style={{ color: "#15803d" }}>{msg}</div>}
        {error && <div className="mt-2 text-sm" style={{ color: "#b91c1c" }}>Error: {error}</div>}
        {!tenantId && <div className="mt-2 text-sm text-[var(--muted)]">Selecciona una empresa en la barra superior.</div>}
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm text-[var(--muted)]">
            Resultados: {rows.length} · Total: ${Number(total).toLocaleString("es-CL")}
          </div>
        </div>
        <div className="overflow-auto rounded-2xl border" style={{ borderColor: "var(--border)" }}>
          <table className="min-w-[1250px] w-full text-sm">
            <thead style={{ background: "#fafafa" }}>
              <tr className="text-left">
                <Th>Fecha</Th>
                <Th>#</Th>
                <Th>Origen</Th>
                <Th>Cliente</Th>
                <Th>RUT</Th>
                <Th>Correo</Th>
                <Th>Pago</Th>
                <Th>Fulfillment</Th>
                <Th>Total</Th>
                <Th>SII</Th>
                <Th className="text-right pr-4">Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <Td>{o.created_at ? new Date(o.created_at).toLocaleString() : "—"}</Td>
                  <Td className="font-mono">{o.name || `#${o.id}`}</Td>
                  <Td>{o.origin || "—"}</Td>
                  <Td>{o.customer_name || "—"}</Td>
                  <Td>{o.customer_rut || "—"}</Td>
                  <Td>{o.email || "—"}</Td>
                  <Td>{o.financial_status || "—"}</Td>
                  <Td>{o.fulfillment_status || "—"}</Td>
                  <Td>${Number(o.total_price || 0).toLocaleString("es-CL")} {o.currency || ""}</Td>
                  <Td>{o.sii_status ? <span title={o.sii_trackid || ""}>{o.sii_status}</span> : "—"}</Td>
                  <Td className="text-right pr-4"><Button variant="ghost" onClick={() => goDetail(o.id)}>Ver</Button></Td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <Td className="text-[var(--muted)]" colSpan={11}>Sin resultados</Td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
