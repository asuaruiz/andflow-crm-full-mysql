import React, { useEffect, useMemo, useState } from "react";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import { useRoute } from "../../router";
import { useAuth } from "../../context/AuthContext.jsx";

function Th({ children, className="" }) { return <th className={"px-4 py-3 text-xs font-semibold text-slate-500 "+className}>{children}</th>; }
function Td({ children, className="" }) { return <td className={"px-4 py-3 "+className}>{children}</td>; }

export default function OrdersPage(){
  const { navigate, setPath } = useRoute();
  const { tenantId } = useAuth();

  const [rows, setRows] = useState([]);
  const [since, setSince] = useState("");
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);

  const buildUrl = () =>
    `/api/shopify/orders?limit=${encodeURIComponent(limit)}&since=${encodeURIComponent(since || "")}&status=any`;

  const commonOpts = {
    credentials: "include",
    headers: tenantId ? { "x-tenant-id": String(tenantId) } : {},
  };

  const load = async ()=>{
    if (!tenantId) { setError("Selecciona una empresa para listar órdenes."); return; }
    setLoading(true); setError(null);
    try{
      const r = await fetch(buildUrl(), commonOpts);
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
      setRows(j.items || []);
    }catch(e){
      setError(e.message);
    }finally{
      setLoading(false);
    }
  };

  useEffect(()=>{ if (tenantId) load(); /* eslint-disable-next-line */ },[tenantId]);

  const sync = async ()=>{
    if (!tenantId) { setError("Selecciona una empresa para sincronizar."); return; }
    setMsg(null); setError(null); setLoading(true);
    try{
      const r = await fetch('/api/shopify/orders/sync', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', ...(commonOpts.headers||{}) },
        credentials: "include",
        body: JSON.stringify({ since, limit })
      });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
      setMsg(`Sincronizados: ${j.count}`);
      await load();
    }catch(e){
      setError(e.message);
    }finally{
      setLoading(false);
    }
  };

  // -------- helpers para datos de cliente/email --------
  const getName = (o)=>{
    const fromCustomer = o.customer ? `${o.customer.first_name||''} ${o.customer.last_name||''}`.trim() : "";
    if (fromCustomer) return fromCustomer;
    const sa = o.shipping_address || {};
    const ba = o.billing_address || {};
    return (sa.name || `${sa.first_name||''} ${sa.last_name||''}`.trim()
         || ba.name || `${ba.first_name||''} ${ba.last_name||''}`.trim()
         || "—");
  };
  const getEmail = (o)=> (o.email || o.contact_email || o.customer?.email || "—");

  const total = useMemo(()=> rows.reduce((acc,o)=> acc + Number(o.total_price||0), 0), [rows]);

  const goDetail = (id)=>{
    if (typeof navigate === 'function') return navigate(`/shopify/orden/${id}`);
    if (typeof setPath === 'function')   return setPath(`/shopify/orden/${id}`);
    window.location.hash = `#/shopify/orden/${id}`;
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div>
            <h3 className="font-semibold">Shopify · Órdenes</h3>
            <p className="text-sm text-[var(--muted)]">Listar y sincronizar ventas desde Shopify.</p>
          </div>
          <div className="flex items-center gap-2">
            <Input type="date" value={since} onChange={e=>setSince(e.target.value)} />
            <Input type="number" min="1" max="250" value={limit} onChange={e=>setLimit(Number(e.target.value||20))} style={{width:110}} />
            <Button variant="secondary" onClick={load} disabled={loading || !tenantId}>{loading?'Cargando…':'Listar'}</Button>
            <Button onClick={sync} disabled={loading || !tenantId}>{loading?'Sincronizando…':'Sincronizar'}</Button>
          </div>
        </div>
        {msg && <div className="mt-2 text-sm" style={{color:'#15803d'}}>{msg}</div>}
        {error && <div className="mt-2 text-sm" style={{color:'#b91c1c'}}>Error: {String(error)}</div>}
        {!tenantId && <div className="mt-2 text-sm text-[var(--muted)]">Selecciona una empresa en la barra superior.</div>}
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm text-[var(--muted)]">Resultados: {rows.length} · Total: ${Number(total).toLocaleString('es-CL')}</div>
        </div>
        <div className="overflow-auto rounded-2xl border" style={{ borderColor: "var(--border)" }}>
          <table className="min-w-[1200px] w-full text-sm">
            <thead style={{ background: "#fafafa" }}>
              <tr className="text-left">
                <Th>Fecha (creado)</Th>
                <Th>#</Th>
                <Th>Cliente</Th>
                <Th>Correo</Th>
                <Th>Pago</Th>
                <Th>Fulfillment</Th>
                <Th>Total</Th>
                <Th className="text-right pr-4">Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(o=>(
                <tr key={o.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <Td>{o.created_at ? new Date(o.created_at).toLocaleString() : '—'}</Td>
                  <Td className="font-mono">{o.name || `#${o.order_number}`}</Td>
                  <Td>{getName(o)}</Td>
                  <Td>{getEmail(o)}</Td>
                  <Td>{o.financial_status || '—'}</Td>
                  <Td>{o.fulfillment_status || '—'}</Td>
                  <Td>${Number(o.total_price||0).toLocaleString('es-CL')} {o.currency}</Td>
                  <Td className="text-right pr-4"><Button variant="ghost" onClick={()=>goDetail(o.id)}>Ver</Button></Td>
                </tr>
              ))}
              {!rows.length && (
                <tr><Td className="text-[var(--muted)]" colSpan={8}>Sin resultados</Td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
