// apps/frontend/src/pages/VentaDetallePage.jsx
import React, { useEffect, useMemo, useState } from "react";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import { useAuth } from "../../context/AuthContext.jsx";

function Th({ children, className="" }) { return <th className={"px-4 py-3 text-xs font-semibold text-slate-500 "+className}>{children}</th>; }
function Td({ children, className="" }) { return <td className={"px-4 py-3 "+className}>{children}</td>; }

export default function VentaDetallePage(){
  const { tenantId } = useAuth();

  const orderId = useMemo(()=>{
    const h = (window.location.hash || "#/").replace(/^#/, "");
    const parts = h.split("/");
    // ruta esperada: /ventas/orden/:id
    return parts[3];
  }, []);

  const [order, setOrder]   = useState(null);
  const [lines, setLines]   = useState([]);
  const [loading, setLoad]  = useState(true);
  const [error, setError]   = useState(null);
  const [msg, setMsg]       = useState(null);
  const [emitting, setEmitting] = useState(false);
  const [shopDomain, setShopDomain] = useState(null);

  // cargar detalle de venta unificada
  useEffect(()=>{
    if (!tenantId) { setError("Selecciona una empresa"); setLoad(false); return; }
    let alive = true;
    (async ()=>{
      try{
        const r = await fetch(`/api/sales/${orderId}`, {
          credentials: "include",
          headers: { "x-tenant-id": String(tenantId) },
        });
        const j = await r.json();
        if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
        if (alive) { setOrder(j.order); setLines(j.lines || []); }
      }catch(e){ if (alive) setError(String(e.message||e)); }
      finally{ if (alive) setLoad(false); }
    })();
    return ()=>{ alive = false; };
  }, [orderId, tenantId]);

  // si es de Shopify, obtenemos el dominio para link "Ver en Shopify"
  useEffect(()=>{
    if (!tenantId || !order || order.origin !== 'shopify') return;
    let alive = true;
    (async ()=>{
      try{
        const r = await fetch(`/api/config/shopify`, {
          credentials: "include",
          headers: { "x-tenant-id": String(tenantId) },
        });
        const j = await r.json();
        if (alive && j?.ok && j.configured && j.domain) setShopDomain(j.domain);
      }catch{}
    })();
    return ()=>{ alive = false; };
  }, [tenantId, order]);

  const back = ()=> { window.location.hash = "#/ventas"; };

  const emitBoletaMock = async ()=>{
    if (!order || !tenantId) return;
    setEmitting(true); setError(null); setMsg(null);
    try{
      const r = await fetch(`/api/sales/${order.id}/boleta/mock`, {
        method:'POST',
        credentials:'include',
        headers: { "x-tenant-id": String(tenantId) }
      });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
      setMsg(`Boleta mock enviada · trackid ${j.trackid || '—'}`);
      // refrescar cabecera para ver sii_status/trackid actualizados
      const r2 = await fetch(`/api/sales/${orderId}`, {
        credentials:'include',
        headers:{ "x-tenant-id": String(tenantId) }
      });
      const j2 = await r2.json();
      if (r2.ok && j2.ok) { setOrder(j2.order); setLines(j2.lines||[]); }
    }catch(e){ setError(String(e.message||e)); }
    finally{ setEmitting(false); }
  };

  if (loading) return <div className="p-4">Cargando…</div>;
  if (error)   return <div className="p-4 text-[var(--danger)]">Error: {error}</div>;
  if (!order)  return <div className="p-4">No encontrado</div>;

  const customerName = [order.customer_first_name, order.customer_last_name].filter(Boolean).join(" ") || "—";
  const fmt = (n)=> `$${Number(n||0).toLocaleString('es-CL')}`;
  const created = order.created_at_shop ? new Date(order.created_at_shop).toLocaleString() : "—";
  const updated = order.updated_at_shop ? new Date(order.updated_at_shop).toLocaleString() : "—";
  const shopUrl = (order.origin === 'shopify' && shopDomain && order.external_id)
    ? `https://${shopDomain}/admin/orders/${order.external_id}`
    : null;

  // snapshot de envío presente en la orden
  const hasShipping = !!(
    order.ship_to_name || order.ship_to_company || order.ship_to_address1 || order.ship_to_address2 ||
    order.ship_to_city || order.ship_to_province || order.ship_to_zip || order.ship_to_country || order.ship_to_phone
  );
  const join = (...parts)=> parts.map(p=>String(p||'').trim()).filter(Boolean).join(", ");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="font-semibold">Orden {order.number}</h3>
          <div className="text-sm text-[var(--muted)]">{created}</div>
        </div>
        <div className="flex items-center gap-2">
          {shopUrl && (
            <a className="inline-block" href={shopUrl} target="_blank" rel="noreferrer">
              <Button variant="ghost">Ver en Shopify</Button>
            </a>
          )}
          <Button onClick={emitBoletaMock} disabled={emitting}>
            {emitting ? 'Emitiendo…' : 'Emitir boleta (mock)'}
          </Button>
          <Button variant="secondary" onClick={back}>Volver</Button>
        </div>
      </div>

      {msg && <div className="text-sm" style={{color:'#15803d'}}>{msg}</div>}
      {error && <div className="text-sm" style={{color:'#b91c1c'}}>Error: {String(error)}</div>}

      {/* Hacemos 4 columnas en desktop si existe envío */}
      <div className={`grid gap-4 ${hasShipping ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        <Card>
          <div className="text-sm">Origen: <b>{order.origin}</b></div>
          <div className="text-sm">Pago: <b>{order.financial_status || "—"}</b></div>
          <div className="text-sm">Fulfillment: <b>{order.fulfillment_status || "—"}</b></div>
          <div className="text-sm">Moneda: <b>{order.currency || "CLP"}</b></div>
          <div className="text-sm mt-2">Subtotal: <b>{fmt(order.subtotal_price)}</b></div>
          <div className="text-sm">Impuestos: <b>{fmt(order.total_tax)}</b></div>
          <div className="text-sm">Total: <b>{fmt(order.total_price)}</b></div>
        </Card>

        <Card>
          <div className="text-sm">Cliente: <b>{customerName}</b></div>
          <div className="text-sm">Correo: <b>{order.email || order.contact_email || "—"}</b></div>
          <div className="text-sm mt-2">ID externo: <b>{order.external_id || "—"}</b></div>
          <div className="text-sm">Actualizado: <b>{updated}</b></div>
        </Card>

        <Card>
          <div className="text-sm">SII estado: <b>{order.sii_status || '—'}</b></div>
          <div className="text-sm">SII trackid: <b>{order.sii_trackid || '—'}</b></div>
        </Card>

        {hasShipping && (
          <Card>
            <div className="text-sm font-semibold mb-1">Envío</div>
            <div className="text-sm">Receptor: <b>{order.ship_to_name || customerName}</b></div>
            {order.ship_to_company && <div className="text-sm">Compañía: <b>{order.ship_to_company}</b></div>}
            <div className="text-sm">Dirección: <b>{join(order.ship_to_address1, order.ship_to_address2)}</b></div>
            <div className="text-sm">Ciudad/Provincia: <b>{join(order.ship_to_city, order.ship_to_province)}</b></div>
            <div className="text-sm">País/ZIP: <b>{join(order.ship_to_country, order.ship_to_zip)}</b></div>
            <div className="text-sm">Teléfono: <b>{order.ship_to_phone || '—'}</b></div>
          </Card>
        )}
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
              {lines.map(li=>(
                <tr key={li.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <Td className="font-mono">{li.sku || '—'}</Td>
                  <Td>{li.title}</Td>
                  <Td>{li.quantity}</Td>
                  <Td>{fmt(li.price)}</Td>
                  <Td>{li.taxable ? 'Sí' : 'No'}</Td>
                  <Td>{fmt(li.line_total)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
