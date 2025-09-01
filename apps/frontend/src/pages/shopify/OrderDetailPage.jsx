import React, { useEffect, useMemo, useState } from "react";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import { useAuth } from "../../context/AuthContext.jsx";

function Row({ k, v }){
  return (
    <div className="flex items-center justify-between text-sm py-1">
      <div className="text-[var(--muted)]">{k}</div>
      <div className="font-medium">{v}</div>
    </div>
  );
}
function Th({ children, className="" }) { return <th className={"px-4 py-3 text-xs font-semibold text-slate-500 "+className}>{children}</th>; }
function Td({ children, className="" }) { return <td className={"px-4 py-3 "+className}>{children}</td>; }

export default function OrderDetailPage(){
  const { tenantId } = useAuth();
  const orderId = useMemo(()=>{
    const h = (window.location.hash || "#/").replace(/^#/, "");
    const parts = h.split("/");
    return parts[3];
  }, []);

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const [emitting, setEmitting] = useState(false);

  useEffect(()=>{
    if (!tenantId) { setError("Selecciona una empresa para ver la orden."); setLoading(false); return; }
    let alive = true;
    (async ()=>{
      try{
        const r = await fetch(`/api/shopify/orders/${orderId}`, {
          credentials: "include",
          headers: { "x-tenant-id": String(tenantId) },
        });
        const j = await r.json();
        if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
        if (alive) setOrder(j.order);
      }catch(e){
        if (alive) setError(e.message);
      }finally{
        if (alive) setLoading(false);
      }
    })();
    return ()=>{ alive = false; };
  }, [orderId, tenantId]);

  const back = ()=> { window.location.hash = "#/shopify/ventas"; };

  const emitBoleta = async ()=>{
    if (!order || !tenantId) return;
    setEmitting(true); setError(null); setMsg(null);
    try{
      const r = await fetch(`/api/sii/boleta/shopify/${order.id}`, {
        method:'POST',
        credentials: "include",
        headers: { "x-tenant-id": String(tenantId) },
      });
      const txt = await r.text();
      let j; try { j = JSON.parse(txt); } catch { throw new Error(txt.slice(0,160)); }
      if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
      setMsg(`Boleta enviada al SII · trackid ${j.trackid || '—'}`);
    }catch(e){
      setError(String(e.message || e));
    }finally{
      setEmitting(false);
    }
  };

  if (loading) return <div className="p-4">Cargando…</div>;
  if (error)   return <div className="p-4 text-[var(--danger)]">Error: {String(error)}</div>;
  if (!order)  return <div className="p-4">No encontrado</div>;

  // Fallbacks robustos para nombre y correo
  const sa = order.shipping_address || {};
  const ba = order.billing_address || {};
  const customerName =
    (order.customer ? `${order.customer.first_name||''} ${order.customer.last_name||''}`.trim() : "") ||
    sa.name || `${sa.first_name||''} ${sa.last_name||''}`.trim() ||
    ba.name || `${ba.first_name||''} ${ba.last_name||''}`.trim() ||
    "—";

  const email = order.email || order.contact_email || order.customer?.email || "—";

  const province = sa.province || ba.province || "—";
  const country  = sa.country  || ba.country  || "—";

  const subtotal = Number(order.subtotal_price || 0);
  const tax = Number(order.total_tax || 0);
  const total = Number(order.total_price || 0);
  const ivaRate = (order.tax_lines && order.tax_lines[0] && order.tax_lines[0].rate) ? order.tax_lines[0].rate : 0.19;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Orden {order.name || `#${order.order_number}`}</h3>
          <div className="text-sm text-[var(--muted)]">{new Date(order.created_at).toLocaleString()}</div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={back}>Volver</Button>
          <Button onClick={emitBoleta} disabled={emitting}>{emitting ? 'Emitiendo…' : 'Emitir boleta SII'}</Button>
        </div>
      </div>

      {msg && <div className="text-sm" style={{color:'#15803d'}}>{msg}</div>}
      {error && <div className="text-sm" style={{color:'#b91c1c'}}>Error: {String(error)}</div>}

      <div className="grid lg:grid-cols-3 gap-4">
        <Card>
          <h4 className="font-semibold mb-2">Resumen</h4>
          <Row k="Estado pago" v={order.financial_status || '—'} />
          <Row k="Fulfillment" v={order.fulfillment_status || '—'} />
          <Row k="Moneda" v={order.currency || order.presentment_currency || '—'} />
          <Row k="Subtotal" v={`$${subtotal.toLocaleString('es-CL')}`} />
          <Row k={`Impuestos (${Math.round(ivaRate*100)}%)`} v={`$${tax.toLocaleString('es-CL')}`} />
          <Row k="Total" v={`$${total.toLocaleString('es-CL')}`} />
        </Card>

        <Card>
          <h4 className="font-semibold mb-2">Cliente</h4>
          <Row k="Nombre" v={customerName} />
          <Row k="Correo" v={email} />
          <Row k="Provincia" v={province} />
          <Row k="País" v={country} />
        </Card>

        <Card>
          <h4 className="font-semibold mb-2">Datos</h4>
          <Row k="ID Shopify" v={order.id} />
          <Row k="Número" v={order.order_number} />
          <Row k="Creado" v={new Date(order.created_at).toLocaleString()} />
          <Row k="Actualizado" v={new Date(order.updated_at).toLocaleString()} />
        </Card>
      </div>

      <Card>
        <div className="overflow-auto rounded-2xl border" style={{ borderColor: "var(--border)" }}>
          <table className="min-w-[900px] w-full text-sm">
            <thead style={{ background: "#fafafa" }}>
              <tr className="text-left">
                <Th>SKU</Th><Th>Producto</Th><Th>Cant.</Th><Th>Precio</Th><Th>Afecto IVA</Th><Th>Total</Th>
              </tr>
            </thead>
            <tbody>
              {(order.line_items || []).map(li => (
                <tr key={li.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <Td className="font-mono">{li.sku || '—'}</Td>
                  <Td>{li.title}</Td>
                  <Td>{li.quantity}</Td>
                  <Td>${Number(li.price||0).toLocaleString('es-CL')}</Td>
                  <Td>{li.taxable !== false ? 'Sí' : 'No'}</Td>
                  <Td>${Number((li.price||0) * (li.quantity||0)).toLocaleString('es-CL')}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
