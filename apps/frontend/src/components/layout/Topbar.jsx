import React, { useEffect, useMemo, useState } from "react";
import { Menu, Search as SearchIcon, Activity, Box, Receipt, Loader2 } from "lucide-react";
import Input from "../ui/Input";
import TenantSwitcher from "../platform/TenantSwitcher.jsx";
import { useAuth } from "../../context/AuthContext.jsx";

export default function Topbar() {
  const { tenantId, tenantName, isSuperAdmin } = useAuth();

  // solo super admin puede cambiar de empresa
  const showTenantSwitcher = !!isSuperAdmin;

  // ---- API health ----
  const [health, setHealth] = useState({ status: "checking" });
  useEffect(() => {
    let mounted = true;
    const ping = async () => {
      try {
        const r = await fetch("/api/health", { credentials: "include" });
        const j = await r.json();
        if (mounted) setHealth({ status: "ok", ts: j.timestamp });
      } catch {
        if (mounted) setHealth({ status: "down" });
      }
    };
    ping();
    const iv = setInterval(ping, 30000);
    return () => { mounted = false; clearInterval(iv); };
  }, []);

  // ---- Buscador (productos + ventas) ----
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [active, setActive] = useState(0);

  const hdrs = useMemo(
    () => ({ credentials: "include", headers: tenantId ? { "x-tenant-id": String(tenantId) } : {} }),
    [tenantId]
  );

  useEffect(() => {
    if (!q || q.trim().length < 2) { setResults([]); setOpen(false); setLoading(false); return; }
    setLoading(true);
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      const items = await doSearch(q.trim(), ctl.signal);
      setResults(items); setActive(0); setOpen(true); setLoading(false);
    }, 240);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  const money = (n, c="es-CL") => `$${Number(n||0).toLocaleString(c)}`;

  async function doSearch(query, signal) {
    const out = []; const seen = new Set();

    // Productos
    try {
      const r = await fetch(`/api/products?q=${encodeURIComponent(query)}&limit=12`, { ...hdrs, signal });
      const j = await r.json();
      const items = Array.isArray(j) ? j : j?.items || [];
      items.slice(0,8).forEach(p => {
        const key = `p-${p.sku || p.sku || ""}`;
        if (seen.has(key)) return; seen.add(key);
        out.push({
          type:"product",
          key,
          title: p.sku || p.sku || "(sin SKU)",
          subtitle: p.nombre || p.name || "",
          href: `#/inventario/movimientos?sku=${encodeURIComponent(p.sku || p.sku || "")}`,
        });
      });
    } catch {}

    // Ventas (resolver id/#)
    const looksLikeId = /^#?\d+$/.test(query) || /Order\/\d+/i.test(query);
    if (looksLikeId) {
      try {
        const r = await fetch(`/api/sales/resolve/${encodeURIComponent(query)}`, { ...hdrs, signal });
        const j = await r.json();
        if (r.ok && j?.ok && j.id) {
          const key = `o-${j.id}`;
          if (!seen.has(key)) {
            seen.add(key);
            out.push({ type:"order", key, title: j.number || `Orden ${j.id}`, subtitle: j.origin ? `Origen: ${j.origin}` : "Orden", href: `#/ventas/orden/${j.id}` });
          }
        }
      } catch {}
    }

    // Ventas (búsqueda abierta)
    try {
      const r = await fetch(`/api/sales?limit=50&q=${encodeURIComponent(query)}`, { ...hdrs, signal });
      const j = await r.json();
      (j?.items || []).slice(0,10).forEach(o => {
        const key = `o-${o.id}`; if (seen.has(key)) return; seen.add(key);
        const title = `${o.name || `Orden ${o.id}`} · ${o.origin}`;
        const subLeft = (o.email || "") + (o.financial_status ? ` · ${o.financial_status}` : "") + (o.fulfillment_status ? ` · ${o.fulfillment_status}` : "");
        const subRight = `${money(o.total_price)} ${o.currency || ""}`.trim();
        out.push({ type:"order", key, title, subtitle: `${subLeft}${subLeft && subRight ? " · " : ""}${subRight}`, href: `#/ventas/orden/${o.id}` });
      });
    } catch {}

    return out.length ? out : [{ type:"other", key:"none", title:`Buscar “${query}” en productos`, subtitle:"Abrir maestra de productos", href:"#/inventario/maestra" }];
  }

  const onKeyDown = (e) => {
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(i=>Math.min(i+1, Math.max(results.length-1,0))); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(i=>Math.max(i-1,0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (results[active]) window.location.hash = results[active].href; }
    else if (e.key === "Escape") { setOpen(false); setResults([]); setQ(""); (document.getElementById("topbar-search-input")||{}).blur?.(); }
  };

  return (
    <header className="h-14 w-full flex items-center justify-between px-4"
            style={{ borderBottom:"1px solid var(--border)", background:"var(--color-card)" }}>
      <div className="flex items-center gap-2">
        <Menu size={20} className="opacity-50" />
        <div className="text-sm text-[var(--muted)]">
          {showTenantSwitcher ? (
            <TenantSwitcher className="tenant-switcher" />
          ) : (
            <span className="truncate max-w-[180px]" title={tenantName || ""}>
              {tenantName || "—"}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 w-[520px] max-w-[60vw]">
        <div id="topbar-search-wrap" className="relative w-full">
          <SearchIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-60" />
          <Input id="topbar-search-input" value={q} onChange={(e)=>setQ(e.target.value)}
                 onFocus={()=> q.trim().length>=2 && setOpen(true)} onKeyDown={onKeyDown}
                 placeholder="Buscar (SKU, nombre producto, #orden, email)" className="pl-9" autoComplete="off" />
          {open && (loading || results.length>0) && (
            <div className="absolute z-50 mt-1 w-full rounded-lg shadow-lg"
                 style={{ background:"var(--color-card)", border:"1px solid var(--border)" }}>
              {loading && <div className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--muted)]">
                <Loader2 size={16} className="animate-spin" /> Buscando…
              </div>}
              {!loading && results.map((r,i)=>(
                <button key={r.key} onMouseEnter={()=>setActive(i)} onClick={()=> (window.location.hash = r.href)}
                        className={`w-full text-left px-3 py-2 flex items-center gap-2 ${i===active?"bg-[var(--background)]":""}`}
                        style={{ borderBottom:"1px solid var(--border)" }}>
                  {r.type==="product" ? <Box size={16} className="opacity-80" /> :
                   r.type==="order" ? <Receipt size={16} className="opacity-80" /> :
                   <SearchIcon size={16} className="opacity-80" />}
                  <div className="flex flex-col leading-tight">
                    <span className="text-sm">{r.title}</span>
                    {r.subtitle ? <span className="text-xs text-[var(--muted)]">{r.subtitle}</span> : null}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="text-xs flex items-center gap-1 text-[var(--muted)]">
          <Activity size={14} className={health.status==='ok' ? 'text-emerald-500' : health.status==='down' ? 'text-rose-500' : 'text-amber-500'} />
          {health.status==='ok' ? 'API OK' : health.status==='down' ? 'API down' : 'API...'}
        </div>
      </div>
    </header>
  );
}
