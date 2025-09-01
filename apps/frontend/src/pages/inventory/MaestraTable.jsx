// apps/frontend/src/pages/inventory/MaestraTable.jsx
import React from "react";
import Button from "../../components/ui/Button";
import { cn } from "../../lib/cn";

// ---------- helpers robustos ----------
const toNum = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const s = v.trim().replace(/\s+/g, "").replace(/\$/g, "").replace(/%/g, "")
      .replace(/\./g, "").replace(/,/g, ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const asBool = (v) => {
  if (typeof v === "boolean") return v;
  if (v === null || v === undefined) return false;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return ["1", "si", "sí", "true", "y", "yes", "s"].includes(s);
  }
  return false;
};

const imgCount = (val) => {
  if (!val) return 0;
  if (Array.isArray(val)) return val.length;
  if (typeof val === "string") {
    const s = val.trim();
    if (!s) return 0;
    try {
      const j = JSON.parse(s);
      return Array.isArray(j) ? j.length : 0;
    } catch {
      return s.split(",").map(x => x.trim()).filter(Boolean).length;
    }
  }
  return 0;
};

const fmtCLP = (v) => {
  const n = toNum(v);
  return n == null ? "—" : `$${Math.round(n).toLocaleString("es-CL", { maximumFractionDigits: 0 })}`;
};

const fmtPct = (v) => {
  const base = toNum(v);
  if (base == null) return "—";
  const pct = base > 1.5 ? base : base * 100;
  return `${pct.toFixed(1)}%`;
};

const fmtBoolPill = (v) => {
  const ok = asBool(v);
  return (
    <span className={cn(
      "px-2 py-1 rounded-full text-xs",
      ok ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"
    )}>
      {ok ? "Sí" : "No"}
    </span>
  );
};

const fmtQty = (v) => {
  const n = toNum(v);
  return n == null ? "—" : n.toLocaleString("es-CL", { maximumFractionDigits: 3 });
};
// ---------- /helpers ----------

export default function MaestraTable({ rows, onEdit = () => {}, onOpenMovimientos = () => {} }) {
  return (
    <div className="overflow-auto rounded-2xl border" style={{ borderColor: "var(--border)" }}>
      <table className="min-w-[2400px] w-full text-sm">
        <thead style={{ background: "#fafafa" }}>
          <tr className="text-left">
            <Th>SKU</Th><Th>SKU proveedor</Th><Th>GTIN / EAN</Th><Th>Nombre del producto</Th>
            <Th>Marca</Th><Th>Especie</Th><Th>Categoría</Th><Th>Subcategoría</Th>
            <Th>Descripción breve</Th><Th>Descripción larga</Th><Th>Imágenes disp.</Th><Th>Proveedor</Th>
            <Th>Disponible</Th><Th>UC</Th><Th>DIF</Th><Th>Costo unitario neto</Th><Th>Costo c/IVA</Th>
            <Th>PSP</Th><Th>Precio ref.</Th><Th>PVP</Th><Th>PVP s/IVA</Th><Th>Margen bruto %</Th>
            <Th>Margen c/IVA %</Th><Th>Margen bruto (CLP)</Th><Th>Precio mín. s/IVA</Th><Th>Precio mín. c/IVA</Th>
            <Th>Tipo de venta</Th><Th>Precio con desc.</Th><Th>Margen Total</Th><Th>Venta total</Th><Th>Margen General</Th>
            <Th>Peso (kg)</Th><Th>Unidad de peso</Th><Th>Dimensiones (L x A x H)</Th><Th>Producto frágil</Th>
            <Th>Estacionalidad</Th><Th>Recurrente</Th><Th>Etiquetas Shopify</Th><Th>Activo en tienda</Th>
            <Th>Segmentación por ticket</Th><Th>Nivel de rotación esperado</Th><Th>Consumible/Durable</Th>
            <Th className="min-w-[220px]">Observación</Th>

            {/* --- NUEVAS columnas de inventario --- */}
            <Th className="text-right">Stock</Th>
            <Th className="text-right">Costo prom.</Th>
            <Th className="text-right">Últ. costo</Th>
            <Th className="text-right">Valor inventario</Th>

            <Th className="text-right pr-4">Acciones</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.sku || r.id} className="border-t" style={{ borderColor: "var(--border)" }}>
              <Td className="font-mono">{r.sku}</Td>
              <Td className="font-mono">{r.sku_proveedor}</Td>
              <Td className="font-mono">{r.ean}</Td>
              <Td className="min-w-[220px]">{r.nombre}</Td>
              <Td>{r.marca}</Td>
              <Td>{r.especie}</Td>
              <Td>{r.categoria}</Td>
              <Td>{r.subcategoria}</Td>
              <Td className="max-w-[260px] truncate" title={r.desc_breve}>{r.desc_breve}</Td>
              <Td className="max-w-[320px] truncate" title={r.desc_larga}>{r.desc_larga}</Td>
              <Td>{imgCount(r.imagenes)}</Td>
              <Td>{r.proveedor}</Td>
              <Td>{fmtBoolPill(r.disponible)}</Td>
              <Td>{toNum(r.uc) ?? "—"}</Td>
              <Td>{toNum(r.dif) ?? "—"}</Td>
              <Td>{fmtCLP(r.costo_neto)}</Td>
              <Td>{fmtCLP(r.costo_con_iva)}</Td>
              <Td>{fmtCLP(r.psp)}</Td>
              <Td>{fmtCLP(r.precio_referencia)}</Td>
              <Td>{fmtCLP(r.pvp)}</Td>
              <Td>{fmtCLP(r.pvp_sin_iva)}</Td>
              <Td>{fmtPct(r.margen_bruto_pct)}</Td>
              <Td>{fmtPct(r.margen_con_iva_pct)}</Td>
              <Td>{fmtCLP(r.margen_bruto_clp)}</Td>
              <Td>{fmtCLP(r.precio_min_estr_sin_iva)}</Td>
              <Td>{fmtCLP(r.precio_min_estr_con_iva)}</Td>
              <Td>{r.tipo_venta}</Td>
              <Td>{r.precio_descuento != null ? fmtCLP(r.precio_descuento) : "—"}</Td>
              <Td>{fmtPct(r.margen_total)}</Td>
              <Td>{fmtCLP(r.venta_total)}</Td>
              <Td>{fmtCLP(r.margen_general)}</Td>
              <Td>{toNum(r.peso_kg) ?? "—"}</Td>
              <Td>{r.unidad_peso || "kg"}</Td>
              <Td>{r.dimensiones || "—"}</Td>
              <Td>{fmtBoolPill(r.fragil)}</Td>
              <Td>{r.estacionalidad || "—"}</Td>
              <Td>{fmtBoolPill(r.recurrente)}</Td>
              <Td className="max-w-[220px] truncate" title={r.etiquetas_shopify}>{r.etiquetas_shopify}</Td>
              <Td>{fmtBoolPill(r.activo_en_tienda)}</Td>
              <Td>{r.segmentacion_ticket || "—"}</Td>
              <Td>{r.nivel_rotacion || "—"}</Td>
              <Td>{r.tipo_producto_consumo || "—"}</Td>
              <Td className="max-w-[280px] truncate" title={r.observacion}>{r.observacion || "—"}</Td>

              {/* --- celdas inventario --- */}
              <Td className="text-right">{fmtQty(r.onhand_qty)}</Td>
              <Td className="text-right">{fmtCLP(r.avg_cost)}</Td>
              <Td className="text-right">{r.last_in_cost == null ? "—" : fmtCLP(r.last_in_cost)}</Td>
              <Td className="text-right">{fmtCLP(r.inventory_value)}</Td>

              <Td className="text-right pr-4 space-x-2">
                <Button variant="ghost" onClick={() => onEdit(r)}>Editar</Button>
                <Button variant="ghost" onClick={() => onOpenMovimientos?.(r.sku)}>Movimientos</Button>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, className = "" }) {
  return <th className={cn("px-4 py-3 text-xs font-semibold text-slate-500", className)}>{children}</th>;
}
function Td({ children, className = "" }) {
  return <td className={cn("px-4 py-3", className)}>{children}</td>;
}
