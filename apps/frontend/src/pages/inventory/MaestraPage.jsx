// apps/frontend/src/pages/inventory/MaestraPage.jsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Select from "../../components/ui/Select";
import MaestraTable from "./MaestraTable";
import ProductEditModal from "./ProductEditModal";
import ProductCreateModal from "./ProductCreateModal"; // <-- NUEVO
import { FileDown, Upload, Plus, ChevronLeft, ChevronRight } from "lucide-react";

export default function MaestraPage() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);

  const [editing, setEditing] = useState(null);       // edición existente
  const [openCreate, setOpenCreate] = useState(false); // <-- estado modal creación

  const fileRef = useRef(null);
  const abortRef = useRef(null);
  const pages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    return () => abortRef.current?.abort(); // cleanup al desmontar
  }, []);

  const buildUrl = useCallback(
    (usePaging = true) => {
      const usp = new URLSearchParams();
      if (q) usp.set("q", q);
      if (usePaging) {
        usp.set("page", String(page));
        usp.set("pageSize", String(pageSize));
      } else {
        usp.set("limit", String(pageSize));
      }
      return `/api/products/master?${usp.toString()}`;
    },
    [q, page, pageSize]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;

    try {
      // 1) Maestra (con paginación)
      let r = await fetch(buildUrl(true), { signal: ctl.signal });
      if (!r.ok && r.status >= 400) {
        r = await fetch(buildUrl(false), { signal: ctl.signal }); // fallback a ?limit=
      }
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
      const masterItems = Array.isArray(j) ? j : j.items || [];
      const masterTotal = Array.isArray(j) ? masterItems.length : j.total ?? masterItems.length;

      // 2) Stock + costos
      const r2 = await fetch("/api/inventory/stock", { signal: ctl.signal });
      const j2 = await r2.json();
      if (!r2.ok || j2.ok === false) throw new Error(j2.error || `HTTP ${r2.status}`);
      const stockItems = Array.isArray(j2) ? j2 : j2.items || [];
      const stockMap = new Map(stockItems.map((s) => [s.sku, s]));

      // 3) Merge por SKU
      const merged = masterItems.map((p) => {
        const s = stockMap.get(p.sku) || {};
        return {
          ...p,
          onhand_qty: s.onhand_qty ?? 0,
          avg_cost: s.avg_cost ?? 0,
          last_in_cost: s.last_in_cost ?? null,
          inventory_value: s.inventory_value ?? 0,
        };
      });

      setRows(merged);
      setTotal(masterTotal);
    } catch (e) {
      if (e.name !== "AbortError") setError(String(e.message || e));
    } finally {
      if (!ctl.signal.aborted) setLoading(false);
    }
  }, [buildUrl]);

  // carga por cambios de página/tamaño
  useEffect(() => {
    load();
  }, [load]);

  // debounce búsqueda
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      load();
    }, 300);
    return () => clearTimeout(t);
  }, [q, load]);

  const onImportClick = () => fileRef.current?.click();

  const onFileChange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setLoading(true);
    setMsg(null);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await fetch("/api/products/master/import", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
      setMsg(`Importación OK · nuevos: ${j.imported}, actualizados: ${j.updated}, omitidos: ${j.skipped}`);
      setPage(1);
      await load();
    } catch (e2) {
      setError(String(e2.message || e2));
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  const downloadTemplate = () => {
    window.location.href = "/api/products/master/template";
  };
  const downloadExport = () => {
    window.location.href = "/api/products/master/export";
  };

  const canPrev = page > 1;
  const canNext = page < pages;

  // Navegar al kardex con HashRouter
  const openMovimientos = (sku) => {
    if (!sku) return;
    window.location.hash = `#/inventario/movimientos?sku=${encodeURIComponent(sku)}`;
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div>
            <h3 className="font-semibold">Maestra de productos</h3>
            <p className="text-sm text-[var(--muted)]">
              Render con columnas comerciales/operativas para Pelitos y Patas.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={downloadTemplate}>
              <FileDown size={16} /> Descargar plantilla
            </Button>
            <Button variant="ghost" onClick={downloadExport}>
              <FileDown size={16} /> Descargar maestra
            </Button>
            <Button onClick={onImportClick}>
              <Upload size={16} /> Importar maestra
            </Button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onFileChange} hidden />
            {/* Abre modal de creación */}
            <Button variant="secondary" onClick={() => setOpenCreate(true)}>
              <Plus size={16} /> Agregar producto
            </Button>
          </div>
        </div>
        {loading && <div className="mt-2 text-sm">Cargando…</div>}
        {msg && (
          <div className="mt-2 text-sm" style={{ color: "#15803d" }}>
            {msg}
          </div>
        )}
        {error && (
          <div className="mt-2 text-sm" style={{ color: "#b91c1c" }}>
            Error: {error}
          </div>
        )}
      </Card>

      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Input
            placeholder="Buscar por SKU, nombre o marca"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-sm"
          />
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-[var(--muted)]">
              {total ? `${(page - 1) * pageSize + 1}-${Math.min(total, page * pageSize)} de ${total}` : "0"}
            </span>
            <Select
              value={String(pageSize)}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="150">150</option>
              <option value="200">200</option>
            </Select>
            <Button variant="ghost" disabled={!canPrev} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              <ChevronLeft size={16} />
            </Button>
            <Button variant="ghost" disabled={!canNext} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>

        <MaestraTable
          rows={rows}
          onEdit={(row) => setEditing(row)}
          onOpenMovimientos={openMovimientos}
        />
      </Card>

      {/* Modal de edición existente */}
      <ProductEditModal
        product={editing}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          setMsg("Producto guardado");
          await load();
        }}
      />

      {/* Modal de creación NUEVO */}
      <ProductCreateModal
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        onCreated={async (created) => {
          setOpenCreate(false);
          setMsg("Producto creado");
          // recarga para asegurar merge con stock y orden/paginación correctos
          setPage(1);
          await load();
        }}
      />
    </div>
  );
}
