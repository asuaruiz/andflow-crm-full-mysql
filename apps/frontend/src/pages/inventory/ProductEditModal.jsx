// apps/frontend/src/pages/inventory/ProductEditModal.jsx
import React, { useEffect, useState } from "react";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Select from "../../components/ui/Select";

function toStr(v) { return v === null || v === undefined ? "" : String(v); }
function toBool(v) {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return ["1","si","sí","true","y","yes","s"].includes(s);
  }
  return false;
}

export default function ProductEditModal({ product, onClose, onSaved }) {
  const open = !!product;
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [form, setForm] = useState({});

  useEffect(() => {
    if (!product) return;
    // clonar producto -> formulario
    setForm({
      id: product.id,
      sku: toStr(product.sku),
      sku_proveedor: toStr(product.sku_proveedor),
      ean: toStr(product.ean),
      nombre: toStr(product.nombre),
      marca: toStr(product.marca),
      especie: toStr(product.especie),
      categoria: toStr(product.categoria),
      subcategoria: toStr(product.subcategoria),
      desc_breve: toStr(product.desc_breve),
      desc_larga: toStr(product.desc_larga),
      imagenes: Array.isArray(product.imagenes)
        ? JSON.stringify(product.imagenes)
        : toStr(product.imagenes ?? ""),
      proveedor: toStr(product.proveedor),
      disponible: toBool(product.disponible),
      uc: toStr(product.uc),
      dif: toStr(product.dif),
      costo_neto: toStr(product.costo_neto),
      costo_con_iva: toStr(product.costo_con_iva),
      psp: toStr(product.psp),
      precio_referencia: toStr(product.precio_referencia),
      pvp: toStr(product.pvp),
      pvp_sin_iva: toStr(product.pvp_sin_iva),
      margen_bruto_pct: toStr(product.margen_bruto_pct),
      margen_con_iva_pct: toStr(product.margen_con_iva_pct),
      margen_bruto_clp: toStr(product.margen_bruto_clp),
      precio_min_estr_sin_iva: toStr(product.precio_min_estr_sin_iva),
      precio_min_estr_con_iva: toStr(product.precio_min_estr_con_iva),
      tipo_venta: toStr(product.tipo_venta),
      precio_descuento: toStr(product.precio_descuento),
      margen_total: toStr(product.margen_total),
      venta_total: toStr(product.venta_total),
      margen_general: toStr(product.margen_general),
      peso_kg: toStr(product.peso_kg),
      unidad_peso: toStr(product.unidad_peso || "kg"),
      dimensiones: toStr(product.dimensiones),
      fragil: toBool(product.fragil),
      estacionalidad: toStr(product.estacionalidad),
      recurrente: toBool(product.recurrente),
      etiquetas_shopify: toStr(product.etiquetas_shopify),
      activo_en_tienda: toBool(product.activo_en_tienda),
      segmentacion_ticket: toStr(product.segmentacion_ticket),
      nivel_rotacion: toStr(product.nivel_rotacion),
      tipo_producto_consumo: toStr(product.tipo_producto_consumo),
      observacion: toStr(product.observacion),
    });
    setMsg(null); setErr(null);
  }, [product]);

  if (!open) return null;

  const set = (k) => (e) => {
    const v = e?.target?.type === "checkbox" ? e.target.checked : e?.target?.value ?? e;
    setForm((f) => ({ ...f, [k]: v }));
  };

  const save = async () => {
    setSaving(true); setErr(null); setMsg(null);
    try {
      const r = await fetch(`/api/products/master/${form.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
      setMsg("Guardado correctamente");
      onSaved?.(j.item);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100]">
      {/* fondo */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      {/* modal */}
      <div className="absolute inset-x-0 top-8 mx-auto w-[min(1100px,96%)] rounded-2xl bg-white shadow-xl">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="font-semibold">Editar producto · {form.sku}</h3>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
          </div>
        </div>

        {msg && <div className="px-6 pt-3 text-emerald-700 text-sm">{msg}</div>}
        {err && <div className="px-6 pt-3 text-red-700 text-sm">Error: {err}</div>}

        <div className="p-6 max-h-[70vh] overflow-auto space-y-6">
          {/* Identificación */}
          <Section title="Identificación">
            <Grid>
              <L label="SKU"><Input value={form.sku} onChange={set("sku")} /></L>
              <L label="SKU proveedor"><Input value={form.sku_proveedor} onChange={set("sku_proveedor")} /></L>
              <L label="GTIN / EAN"><Input value={form.ean} onChange={set("ean")} /></L>
            </Grid>
          </Section>

          {/* Básicos */}
          <Section title="Información básica">
            <Grid cols={3}>
              <L label="Nombre del producto" span><Input value={form.nombre} onChange={set("nombre")} /></L>
              <L label="Marca"><Input value={form.marca} onChange={set("marca")} /></L>
              <L label="Especie"><Input value={form.especie} onChange={set("especie")} /></L>
              <L label="Categoría"><Input value={form.categoria} onChange={set("categoria")} /></L>
              <L label="Subcategoría"><Input value={form.subcategoria} onChange={set("subcategoria")} /></L>
              <L label="Proveedor"><Input value={form.proveedor} onChange={set("proveedor")} /></L>
            </Grid>
          </Section>

          {/* Descripciones */}
          <Section title="Descripciones">
            <Grid>
              <L label="Descripción breve" span>
                <textarea className="w-full border rounded-lg p-2 text-sm" rows={2}
                  value={form.desc_breve} onChange={set("desc_breve")} />
              </L>
              <L label="Descripción larga" span>
                <textarea className="w-full border rounded-lg p-2 text-sm" rows={6}
                  value={form.desc_larga} onChange={set("desc_larga")} />
              </L>
              <L label="Imágenes (JSON o URLs separadas por coma)" span>
                <textarea className="w-full border rounded-lg p-2 text-sm" rows={3}
                  value={form.imagenes} onChange={set("imagenes")} />
              </L>
            </Grid>
          </Section>

          {/* Disponibilidad / logística */}
          <Section title="Disponibilidad / logística">
            <Grid>
              <L label="Disponible">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!form.disponible} onChange={set("disponible")} />
                  <span>Sí</span>
                </label>
              </L>
              <L label="UC"><Input value={form.uc} onChange={set("uc")} /></L>
              <L label="DIF"><Input value={form.dif} onChange={set("dif")} /></L>
              <L label="Peso (kg)"><Input value={form.peso_kg} onChange={set("peso_kg")} /></L>
              <L label="Unidad de peso">
                <Select value={form.unidad_peso} onChange={set("unidad_peso")}>
                  <option value="kg">kg</option>
                  <option value="g">g</option>
                </Select>
              </L>
              <L label="Dimensiones (L x A x H)"><Input value={form.dimensiones} onChange={set("dimensiones")} /></L>
              <L label="Producto frágil">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!form.fragil} onChange={set("fragil")} />
                  <span>Sí</span>
                </label>
              </L>
              <L label="Estacionalidad"><Input value={form.estacionalidad} onChange={set("estacionalidad")} /></L>
              <L label="Recurrente">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!form.recurrente} onChange={set("recurrente")} />
                  <span>Sí</span>
                </label>
              </L>
            </Grid>
          </Section>

          {/* Precios y márgenes */}
          <Section title="Comercial (precios y márgenes)">
            <Grid cols={4}>
              <L label="Costo unitario neto"><Input value={form.costo_neto} onChange={set("costo_neto")} /></L>
              <L label="Costo con IVA"><Input value={form.costo_con_iva} onChange={set("costo_con_iva")} /></L>
              <L label="PSP"><Input value={form.psp} onChange={set("psp")} /></L>
              <L label="Precio referencia"><Input value={form.precio_referencia} onChange={set("precio_referencia")} /></L>
              <L label="PVP"><Input value={form.pvp} onChange={set("pvp")} /></L>
              <L label="PVP s/IVA"><Input value={form.pvp_sin_iva} onChange={set("pvp_sin_iva")} /></L>
              <L label="Margen bruto %"><Input value={form.margen_bruto_pct} onChange={set("margen_bruto_pct")} /></L>
              <L label="Margen c/IVA %"><Input value={form.margen_con_iva_pct} onChange={set("margen_con_iva_pct")} /></L>
              <L label="Margen bruto (CLP)"><Input value={form.margen_bruto_clp} onChange={set("margen_bruto_clp")} /></L>
              <L label="Precio mín. s/IVA"><Input value={form.precio_min_estr_sin_iva} onChange={set("precio_min_estr_sin_iva")} /></L>
              <L label="Precio mín. c/IVA"><Input value={form.precio_min_estr_con_iva} onChange={set("precio_min_estr_con_iva")} /></L>
              <L label="Tipo de venta"><Input value={form.tipo_venta} onChange={set("tipo_venta")} /></L>
              <L label="Precio con descuento"><Input value={form.precio_descuento} onChange={set("precio_descuento")} /></L>
              <L label="Margen total %"><Input value={form.margen_total} onChange={set("margen_total")} /></L>
              <L label="Venta total"><Input value={form.venta_total} onChange={set("venta_total")} /></L>
              <L label="Margen general (CLP)"><Input value={form.margen_general} onChange={set("margen_general")} /></L>
            </Grid>
          </Section>

          {/* Otros comerciales */}
          <Section title="Otros comerciales">
            <Grid>
              <L label="Etiquetas Shopify" span><Input value={form.etiquetas_shopify} onChange={set("etiquetas_shopify")} /></L>
              <L label="Activo en tienda">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!form.activo_en_tienda} onChange={set("activo_en_tienda")} />
                  <span>Sí</span>
                </label>
              </L>
              <L label="Segmentación por ticket"><Input value={form.segmentacion_ticket} onChange={set("segmentacion_ticket")} /></L>
              <L label="Nivel de rotación esperado"><Input value={form.nivel_rotacion} onChange={set("nivel_rotacion")} /></L>
              <L label="Consumible/Durable"><Input value={form.tipo_producto_consumo} onChange={set("tipo_producto_consumo")} /></L>
              <L label="Observación" span>
                <textarea className="w-full border rounded-lg p-2 text-sm" rows={3}
                  value={form.observacion} onChange={set("observacion")} />
              </L>
            </Grid>
          </Section>
        </div>
      </div>
    </div>
  );
}

// subcomponentes de layout simples
function Section({ title, children }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-slate-600 mb-2">{title}</h4>
      {children}
    </div>
  );
}
function Grid({ children, cols = 3 }) {
  return <div className={`grid gap-3`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>{children}</div>;
}
function L({ label, children, span = false }) {
  return (
    <label className={`block ${span ? "col-span-full" : ""}`}>
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      {children}
    </label>
  );
}
