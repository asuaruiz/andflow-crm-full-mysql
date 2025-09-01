// apps/frontend/src/pages/inventory/MovimientosPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import { apiGet } from "../../lib/api";

// ---------- utils ----------
const money = (v) => {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
};
const qty = (v) => {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("es-CL", { maximumFractionDigits: 3 });
};
function Th({ children, className = "" }) {
  return <th className={`px-4 py-3 text-xs font-semibold text-slate-500 ${className}`}>{children}</th>;
}
function Td({ children, className = "", ...rest }) {
  return <td className={`px-4 py-3 ${className}`} {...rest}>{children}</td>;
}

// --- helpers de hash-router ---
const getHashSearch = () => {
  const h = window.location.hash || "";
  const i = h.indexOf("?");
  return i >= 0 ? h.slice(i + 1) : "";
};
const getSkuFromHash = () => {
  try {
    const search = getHashSearch();
    return new URLSearchParams(search).get("sku") || "";
  } catch {
    return "";
  }
};

export default function MovimientosPage() {
  const [skuInput, setSkuInput] = useState(getSkuFromHash());
  const [sku, setSku] = useState(getSkuFromHash());
  const [moves, setMoves] = useState([]);
  const [summary, setSummary] = useState({ onhand_qty: 0, avg_cost: 0, last_in_cost: null });
  const [loading, setLoading] = useState(false);

  // Escucha cambios en el hash (?sku=...) para cuando vienes desde el Topbar
  useEffect(() => {
    const syncFromHash = () => {
      const s = getSkuFromHash();
      setSkuInput(s);
      setSku(s);
    };
    syncFromHash(); // por si entra directo
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  // Carga datos cuando cambia el SKU activo
  useEffect(() => {
    const loadData = async (theSku) => {
      if (!theSku) {
        setMoves([]);
        setSummary({ onhand_qty: 0, avg_cost: 0, last_in_cost: null });
        return;
      }
      setLoading(true);
      try {
        const m = await apiGet(`/api/inventory/moves?sku=${encodeURIComponent(theSku)}&limit=500`);
        const s = await apiGet(`/api/inventory/stock?sku=${encodeURIComponent(theSku)}`);
        setMoves(m?.items || []);
        const curr = (s?.items || [])[0];
        setSummary({
          onhand_qty: curr?.onhand_qty ?? 0,
          avg_cost: curr?.avg_cost ?? 0,
          last_in_cost: curr?.last_in_cost ?? null,
        });
      } catch (e) {
        console.error("[MovimientosPage] load error", e);
      } finally {
        setLoading(false);
      }
    };
    loadData(sku);
  }, [sku]);

  const totals = useMemo(() => {
    let inQty = 0,
      outQty = 0;
    (moves || []).forEach((m) => {
      if (["IN", "ADJ_IN", "OPENING", "RETURN_IN"].includes(m.type)) inQty += Number(m.qty || 0);
      else outQty += Number(m.qty || 0);
    });
    return { inQty, outQty };
  }, [moves]);

  function buscar() {
    const clean = (skuInput || "").trim();
    const base = (window.location.hash || "#/inventario/movimientos").split("?")[0];
    const newHash = clean ? `${base}?sku=${encodeURIComponent(clean)}` : base;

    if (window.location.hash !== newHash) {
      window.location.hash = newHash; // disparará hashchange -> setSku(...)
    } else {
      setSku(clean); // si ya está igual, fuerza búsqueda
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => window.history.back()}>
            Volver
          </Button>
          <h1 className="text-lg font-semibold">Kardex — {sku || "Selecciona un SKU"}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="SKU…"
            value={skuInput}
            onChange={(e) => setSkuInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && buscar()}
            style={{ minWidth: 200 }}
          />
          <Button onClick={buscar}>Buscar</Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-xs text-slate-500">Stock actual</div>
          <div className="text-xl font-semibold">{qty(summary.onhand_qty)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-slate-500">Costo promedio</div>
          <div className="text-xl font-semibold">{money(summary.avg_cost)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-slate-500">Último costo de entrada</div>
          <div className="text-xl font-semibold">
            {summary.last_in_cost == null ? "—" : money(summary.last_in_cost)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-slate-500">Entradas / Salidas (unid.)</div>
          <div className="text-xl font-semibold">
            {qty(totals.inQty)} / {qty(totals.outQty)}
          </div>
        </Card>
      </div>

      <Card className="p-0">
        <div className="overflow-auto rounded-2xl border" style={{ borderColor: "var(--border)" }}>
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <Th className="w-40">Fecha</Th>
                <Th className="w-28">Tipo</Th>
                <Th className="w-24 text-right">Cantidad</Th>
                <Th className="w-32 text-right">Costo unit.</Th>
                <Th className="w-32 text-right">Valor</Th>
                <Th>Referencia</Th>
                <Th>Nota</Th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <Td colSpan={7} className="text-center text-slate-500">
                    Cargando…
                  </Td>
                </tr>
              )}
              {!loading && moves.length === 0 && (
                <tr>
                  <Td colSpan={7} className="text-center text-slate-500">
                    Sin movimientos
                  </Td>
                </tr>
              )}
              {!loading &&
                moves.map((m) => (
                  <tr key={m.id} className="border-t">
                    <Td>{new Date(m.move_date).toLocaleString()}</Td>
                    <Td>{m.type}</Td>
                    <Td className="text-right">{qty(m.qty)}</Td>
                    <Td className="text-right">{m.unit_cost == null ? "—" : money(m.unit_cost)}</Td>
                    <Td className="text-right">{m.value == null ? "—" : money(m.value)}</Td>
                    <Td>{[m.ref_type, m.ref_id].filter(Boolean).join(" #") || "—"}</Td>
                    <Td>{m.note || "—"}</Td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
