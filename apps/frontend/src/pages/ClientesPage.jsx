import React, { useEffect, useState } from "react";
import Card from "../components/ui/Card";
import Input from "../components/ui/Input";
import Button from "../components/ui/Button";

function fmtMoney(v){ if(v==null) return ""; const n=Number(v)||0; return n.toLocaleString('es-CL', { style:'currency', currency:'CLP' }); }

export default function ClientesPage(){
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [err, setErr] = useState(null);

  async function load(){
    setLoading(true); setErr(null);
    try{
      const r = await fetch(`/api/customers?q=${encodeURIComponent(q)}&limit=200`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error||'Error');
      setRows(j.rows||[]);
    }catch(e){ setErr(e.message); }
    finally{ setLoading(false); }
  }

  useEffect(()=>{ load(); },[]);

  async function doSync(){
    setSyncing(true); setErr(null);
    try{
      const r = await fetch('/api/shopify/customers/sync?since=2000-01-01', { method:'POST' });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error||'Error');
      await load();
    }catch(e){ setErr(e.message); }
    finally{ setSyncing(false); }
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-lg">Clientes</h3>
            <p className="text-sm" style={{color:"var(--muted)"}}>Importados desde Shopify por tenant.</p>
          </div>
          <div className="flex items-center gap-2">
            <Input placeholder="Buscar por nombre, email o teléfono…" value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') load(); }} style={{minWidth:280}}/>
            <Button onClick={load} disabled={loading}>{loading? "Buscando…" : "Buscar"}</Button>
            <Button variant="secondary" onClick={doSync} disabled={syncing}>{syncing? "Sincronizando…" : "Sincronizar Shopify"}</Button>
          </div>
        </div>
      </Card>

      <Card>
        {err && <div className="mb-2 text-sm" style={{color:"var(--danger)"}}>Error: {err}</div>}
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left" style={{borderBottom:"1px solid var(--border)"}}>
                <th className="py-2 pr-3">Nombre</th>
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3">Teléfono</th>
                <th className="py-2 pr-3">Órdenes</th>
                <th className="py-2 pr-3">Total gastado</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2 pr-3">Actualizado</th>
                <th className="py-2 pr-0 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r=>{
                const name = [r.first_name||"", r.last_name||""].join(" ").trim() || "(sin nombre)";
                const updated = r.updated_at_shopify ? new Date(r.updated_at_shopify).toLocaleString() : "";
                return (
                  <tr key={r.id} style={{borderBottom:"1px solid var(--border)"}}>
                    <td className="py-2 pr-3">
                      <a href={`#/clientes/${r.id}`} className="hover:underline">{name}</a>
                    </td>
                    <td className="py-2 pr-3">{r.email||""}</td>
                    <td className="py-2 pr-3">{r.phone||""}</td>
                    <td className="py-2 pr-3">{r.orders_count ?? ""}</td>
                    <td className="py-2 pr-3">{fmtMoney(r.total_spent)}</td>
                    <td className="py-2 pr-3">{r.state||""}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{updated}</td>
                    <td className="py-2 pr-0 text-right">
                      <Button size="sm" onClick={()=>{ window.location.hash = `#/clientes/${r.id}`; }}>Ver</Button>
                    </td>
                  </tr>
                );
              })}
              {!rows.length && !loading && <tr><td className="py-6 text-center text-sm" colSpan={8} style={{color:"var(--muted)"}}>Sin datos. Prueba sincronizando con Shopify.</td></tr>}
              {loading && <tr><td className="py-6 text-center text-sm" colSpan={8} style={{color:"var(--muted)"}}>Cargando…</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
