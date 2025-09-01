// apps/frontend/src/pages/ventas/VentaNuevaPage.jsx
import React, { useEffect, useState } from "react";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import { useAuth } from "../../context/AuthContext.jsx";

function useDebounced(value, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function ProductRow({ value, onChange, onRemove, tenantId }) {
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query);
  const [options, setOptions] = useState([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!debounced || !tenantId) { setOptions([]); return; }
      const r = await fetch(`/api/products/master/search?q=${encodeURIComponent(debounced)}`, {
        credentials: "include",
        headers: { "x-tenant-id": String(tenantId) },
      });
      const j = await r.json();
      if (alive) setOptions(Array.isArray(j.items) ? j.items.slice(0, 8) : []);
    })().catch(() => {});
    return () => { alive = false; };
  }, [debounced, tenantId]);

  const pick = (p) => {
    onChange({
      ...value,
      product_id: p.id,
      sku: p.sku,
      title: p.nombre || p.name || value.title,
      price: Number(p.price || 0),
    });
    setQuery("");
    setOptions([]);
  };

  return (
    <div className="grid grid-cols-12 gap-2 items-center">
      <Input className="col-span-2" placeholder="SKU"
        value={value.sku}
        onChange={(e) => { onChange({ ...value, sku: e.target.value }); setQuery(e.target.value); }} />
      <div className="col-span-5 relative">
        <Input placeholder="Nombre producto" value={value.title}
          onChange={(e) => { onChange({ ...value, title: e.target.value }); setQuery(e.target.value); }} />
        {options.length > 0 && (
          <div className="absolute z-10 bg-white border rounded mt-1 max-h-48 overflow-auto w-full shadow">
            {options.map((o) => (
              <div key={o.id} className="px-3 py-2 hover:bg-slate-50 cursor-pointer" onClick={() => pick(o)}>
                <div className="text-sm font-medium">{o.nombre}</div>
                <div className="text-xs text-slate-500">{o.sku} · ${Number(o.price || 0).toLocaleString("es-CL")}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Input className="col-span-1" type="number" min="1"
        value={value.qty} onChange={(e) => onChange({ ...value, qty: Number(e.target.value || 1) })} />
      <Input className="col-span-2" type="number" step="0.01"
        value={value.price} onChange={(e) => onChange({ ...value, price: Number(e.target.value || 0) })} />
      <label className="col-span-1 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={value.taxable} onChange={(e) => onChange({ ...value, taxable: e.target.checked })} /> IVA
      </label>
      <Button className="col-span-1" variant="ghost" onClick={onRemove}>Quitar</Button>
    </div>
  );
}

function CustomerPicker({ tenantId, value, onSelect, onPrefillShipping }) {
  const [q, setQ] = useState("");
  const debounced = useDebounced(q);
  const [opts, setOpts] = useState([]);
  const [creating, setCreating] = useState(false);
  const [newC, setNewC] = useState({ first_name:"", last_name:"", email:"", phone:"", rut:"" });
  const [errCreate, setErrCreate] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!debounced) { setOpts([]); return; }
      const r = await fetch(`/api/customers?q=${encodeURIComponent(debounced)}&limit=10`, {
        credentials: "include",
        headers: { "x-tenant-id": String(tenantId) },
      });
      const j = await r.json();
      if (alive) setOpts(Array.isArray(j.rows) ? j.rows : []);
    })().catch(() => {});
    return () => { alive = false; };
  }, [debounced, tenantId]);

  const pick = (c) => {
    const picked = {
      id: c.id,
      first_name: c.first_name || null,
      last_name:  c.last_name  || null,
      email:      c.email      || null,
      phone:      c.phone_view || c.phone || "",
      rut:        c.rut || null,
    };
    onSelect(picked);
    onPrefillShipping?.({
      name: [picked.first_name, picked.last_name].filter(Boolean).join(" "),
      phone: picked.phone || ""
    });
    setQ(""); setOpts([]);
  };

  const canSaveNew = (newC.email?.trim() || newC.rut?.trim());

  const create = async () => {
    setErrCreate(null);
    if (!canSaveNew) { setErrCreate("Ingresa email o RUT (al menos uno)."); return; }
    const r = await fetch("/api/customers", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json", "x-tenant-id": String(tenantId) },
      body: JSON.stringify(newC),
    });
    const j = await r.json();
    if (!r.ok || j.ok === false) { setErrCreate(j.error || `HTTP ${r.status}`); return; }
    const created = j.customer || j;
    const picked = {
      id: created.id,
      first_name: newC.first_name || null,
      last_name:  newC.last_name  || null,
      email:      created.email ?? newC.email ?? null,
      phone:      created.phone ?? newC.phone ?? "",
      rut:        created.rut   ?? newC.rut   ?? null,
    };
    onSelect(picked);
    onPrefillShipping?.({
      name: [picked.first_name, picked.last_name].filter(Boolean).join(" "),
      phone: picked.phone || ""
    });
    setCreating(false);
    setNewC({ first_name:"", last_name:"", email:"", phone:"", rut:"" });
  };

  const SelectedLine = () => {
    const name = [value?.first_name, value?.last_name].filter(Boolean).join(" ") || "(sin nombre)";
    const email = value?.email || "—";
    const rut = value?.rut ? ` · RUT ${value.rut}` : "";
    return <div className="font-medium">{name} · {email}<span className="text-slate-500">{rut}</span></div>;
  };

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-[var(--muted)]">Cliente</div>
          {value?.id ? <SelectedLine/> : <div className="text-sm text-slate-600">Selecciona o crea un cliente.</div>}
        </div>
        <div className="flex items-center gap-2">
          <Input placeholder="Buscar por nombre, email o RUT" value={q} onChange={(e)=>setQ(e.target.value)} style={{ width: 340 }}/>
          <Button variant="secondary" onClick={()=>setCreating(v=>!v)}>{creating ? "Cancelar" : "Crear cliente"}</Button>
        </div>
      </div>

      {opts.length>0 && !creating && (
        <div className="mt-2 border rounded overflow-hidden">
          {opts.map((c)=>(
            <div key={c.id} className="px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer flex justify-between items-center"
                 onClick={()=>pick(c)}>
              <div className="flex flex-col">
                <div>{c.display_name || [c.first_name,c.last_name].filter(Boolean).join(" ") || "(sin nombre)"}</div>
                <div className="text-xs text-slate-500">{c.email || "—"} {c.rut ? ` · RUT ${c.rut}` : ""}</div>
              </div>
              <div className="text-slate-500">{c.phone_view || c.phone || "—"}</div>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <div className="grid grid-cols-5 gap-2 mt-3">
          <Input placeholder="Nombre"   value={newC.first_name} onChange={(e)=>setNewC({...newC, first_name:e.target.value})}/>
          <Input placeholder="Apellido" value={newC.last_name}  onChange={(e)=>setNewC({...newC, last_name:e.target.value})}/>
          <Input placeholder="Email"    value={newC.email}      onChange={(e)=>setNewC({...newC, email:e.target.value})}/>
          <Input placeholder="Teléfono" value={newC.phone}      onChange={(e)=>setNewC({...newC, phone:e.target.value})}/>
          <Input placeholder="RUT (requerido si no hay email)" value={newC.rut} onChange={(e)=>setNewC({...newC, rut:e.target.value})}/>
          {errCreate && <div className="col-span-5 text-sm" style={{color:"#b91c1c"}}>{errCreate}</div>}
          <div className="col-span-5"><Button onClick={create} disabled={!canSaveNew}>Guardar cliente</Button></div>
        </div>
      )}
    </Card>
  );
}

export default function VentaNuevaPage() {
  const { tenantId } = useAuth();
  const [items, setItems] = useState([{ product_id:null, sku:"", title:"", qty:1, price:0, taxable:true }]);
  const [customer, setCustomer] = useState(null);
  const [shipping, setShipping] = useState({
    name:"", company:"", address1:"", address2:"", city:"", province:"", zip:"", country:"Chile", phone:""
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const add = ()=> setItems([...items, { product_id:null, sku:"", title:"", qty:1, price:0, taxable:true }]);
  const del = (i)=> setItems(items.filter((_,idx)=> idx!==i));
  const upd = (i, next)=> setItems(items.map((row,idx)=> idx===i? next : row));

  const save = async () => {
    if (!tenantId) { setError("Selecciona una empresa"); return; }
    setSaving(true); setError(null);
    try{
      const body = {
        currency: "CLP",
        customer_id: customer?.id || null,
        customer: customer?.id ? null : customer ? {
          first_name: customer.first_name || null,
          last_name:  customer.last_name  || null,
          email:      customer.email      || null,
          phone:      customer.phone      || null,
          rut:        customer.rut        || null,
        } : null,
        shipping_address: shipping,
        items: items.map(x=>({
          product_id: x.product_id || null,
          sku: x.sku || null,
          title: x.title || "Producto",
          qty: Number(x.qty || 0),
          price: Number(x.price || 0),
          taxable: !!x.taxable
        })),
      };
      const r = await fetch("/api/sales", {
        method: "POST", credentials: "include",
        headers: { "Content-Type":"application/json", "x-tenant-id": String(tenantId) },
        body: JSON.stringify(body)
      });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
      window.location.hash = `#/ventas/orden/${j.id}`;
    }catch(e){ setError(String(e.message||e)); }
    finally{ setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Nueva venta (CRM)</h3>
        <Button variant="secondary" onClick={()=> (window.location.hash = "#/ventas")}>Volver</Button>
      </div>

      {error && <div className="text-sm" style={{color:"#b91c1c"}}>Error: {error}</div>}

      <CustomerPicker
        tenantId={tenantId}
        value={customer}
        onSelect={setCustomer}
        onPrefillShipping={(s)=>setShipping(prev=>({ ...prev, ...s }))}
      />

      {/* Dirección de envío */}
      <Card>
        <div className="text-sm text-[var(--muted)] mb-2">Dirección de envío</div>
        <div className="grid grid-cols-6 gap-2">
          <Input className="col-span-3" placeholder="Nombre de receptor" value={shipping.name} onChange={(e)=>setShipping({...shipping, name:e.target.value})}/>
          <Input className="col-span-3" placeholder="Compañía (opcional)" value={shipping.company} onChange={(e)=>setShipping({...shipping, company:e.target.value})}/>
          <Input className="col-span-4" placeholder="Dirección" value={shipping.address1} onChange={(e)=>setShipping({...shipping, address1:e.target.value})}/>
          <Input className="col-span-2" placeholder="Depto / complemento" value={shipping.address2} onChange={(e)=>setShipping({...shipping, address2:e.target.value})}/>
          <Input className="col-span-2" placeholder="Ciudad" value={shipping.city} onChange={(e)=>setShipping({...shipping, city:e.target.value})}/>
          <Input className="col-span-2" placeholder="Provincia/Región" value={shipping.province} onChange={(e)=>setShipping({...shipping, province:e.target.value})}/>
          <Input className="col-span-1" placeholder="ZIP" value={shipping.zip} onChange={(e)=>setShipping({...shipping, zip:e.target.value})}/>
          <Input className="col-span-1" placeholder="País" value={shipping.country} onChange={(e)=>setShipping({...shipping, country:e.target.value})}/>
          <Input className="col-span-2" placeholder="Teléfono de contacto" value={shipping.phone} onChange={(e)=>setShipping({...shipping, phone:e.target.value})}/>
        </div>
      </Card>

      <Card>
        <div className="space-y-3">
          {items.map((it, i)=>(
            <ProductRow key={i} tenantId={tenantId} value={it} onChange={(next)=>upd(i,next)} onRemove={()=>del(i)} />
          ))}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={add}>Agregar ítem</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar venta"}</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
