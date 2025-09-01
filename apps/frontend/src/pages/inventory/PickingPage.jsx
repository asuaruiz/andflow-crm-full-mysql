import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiJson } from "../../lib/api";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Select from "../../components/ui/Select";
import Card from "../../components/ui/Card";
import { Loader2, Play, StopCircle, Barcode, CheckCircle2, Trash } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";

export default function PickingPage() {
  const { hasPerm } = useAuth();
  const canView   = hasPerm?.("inventory.sessions.view");
  const canManage = hasPerm?.("inventory.sessions.manage");
  const canCommit = hasPerm?.("inventory.sessions.commit");

  const [items, setItems] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [err, setErr] = useState("");

  const [creating, setCreating] = useState(false);
  const [type, setType] = useState("count");
  const [reference, setReference] = useState("");
  const [location, setLocation] = useState("");

  const [active, setActive] = useState(null); // {session, lines:[]}
  const [busy, setBusy] = useState(false);

  // input wedge
  const inputRef = useRef(null);
  const [scanText, setScanText] = useState("");
  const [scanQty, setScanQty] = useState("1");
  const [scanCost, setScanCost] = useState("");

  const load = async () => {
    if (!canView) return;
    setLoadingList(true); setErr("");
    try {
      const r = await apiGet("/api/picking/sessions");
      setItems(r.items || []);
    } catch (e) {
      setErr(e.message || "Error listando sesiones");
    } finally {
      setLoadingList(false);
    }
  };

  const open = async (id) => {
    setBusy(true); setErr("");
    try {
      const r = await apiGet(`/api/picking/sessions/${id}`);
      setActive({ session: r.session, lines: r.lines || [] });
      // focus scanner
      setTimeout(() => inputRef.current?.focus(), 50);
    } catch (e) {
      setErr(e.message || "No se pudo abrir la sesión");
    } finally {
      setBusy(false);
    }
  };

  const createSession = async (e) => {
    e?.preventDefault?.();
    if (!canManage) return;
    setCreating(true); setErr("");
    try {
      const r = await apiJson("/api/picking/sessions", {
        method: "POST",
        body: { type, reference: reference || null, location_code: location || null },
      });
      await load();
      await open(r.item.id);
      // limpiar form
      setReference(""); setLocation("");
    } catch (e) {
      setErr(e.message || "No se pudo crear");
    } finally {
      setCreating(false);
    }
  };

  const scan = async (e) => {
    e?.preventDefault?.();
    if (!active || !canManage) return;
    const code = scanText.trim();
    const qty = Number(scanQty || "1");
    const unit_cost = scanCost.trim() ? Number(scanCost) : undefined;
    if (!code || !qty) return;
    setBusy(true); setErr("");
    try {
      const r = await apiJson(`/api/picking/sessions/${active.session.id}/scan`, {
        method: "POST",
        body: { code, qty, unit_cost },
      });
      setActive((s) => {
        const lines = [...(s?.lines || [])];
        const idx = lines.findIndex((l) => l.sku === r.line.sku);
        if (idx >= 0) lines[idx] = r.line; else lines.unshift(r.line);
        return { ...s, lines };
      });
      setScanText(""); setScanQty("1"); // mantener costo si es 'in'
      inputRef.current?.focus();
    } catch (e) {
      setErr(e.message || "No se pudo escanear");
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!active || !canCommit) return;
    if (!confirm("¿Confirmar y contabilizar esta sesión?")) return;
    setBusy(true); setErr("");
    try {
      await apiJson(`/api/picking/sessions/${active.session.id}/commit`, { method: "POST" });
      setActive(null);
      await load();
    } catch (e) {
      setErr(e.message || "No se pudo contabilizar");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!active || !canManage) return;
    if (!confirm("¿Cancelar y borrar la sesión (no genera movimientos)?")) return;
    setBusy(true); setErr("");
    try {
      await apiJson(`/api/picking/sessions/${active.session.id}`, { method: "DELETE" });
      setActive(null);
      await load();
    } catch (e) {
      setErr(e.message || "No se pudo cancelar");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="font-semibold">Picking / Toma de inventario</h3>
            <p className="text-sm text-[var(--muted)]">Escanea por SKU o EAN (Netum DS2800 en modo teclado).</p>
          </div>
          <form onSubmit={createSession} className="flex items-center gap-2 flex-wrap">
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="count">Inventario total (count)</option>
              <option value="in">Ingreso (in)</option>
              <option value="out">Salida (out)</option>
            </Select>
            <Input placeholder="Referencia" value={reference} onChange={(e) => setReference(e.target.value)} />
            <Input placeholder="Ubicación" value={location} onChange={(e) => setLocation(e.target.value)} />
            <Button type="submit" disabled={!canManage || creating}>
              {creating ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              Nueva sesión
            </Button>
          </form>
        </div>
        {err && <div className="mt-2 text-sm text-red-700">Error: {err}</div>}
      </Card>

      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-12 lg:col-span-5">
          <h4 className="font-medium mb-2">Sesiones recientes</h4>
          {loadingList ? (
            <div className="text-sm text-slate-500 flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" /> Cargando…
            </div>
          ) : (
            <div className="rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left p-3">ID</th>
                    <th className="text-left p-3">Tipo</th>
                    <th className="text-left p-3">Estado</th>
                    <th className="text-left p-3">Referencia</th>
                    <th className="text-left p-3 w-28">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="p-3">{s.id}</td>
                      <td className="p-3">{s.type}</td>
                      <td className="p-3">{s.status}</td>
                      <td className="p-3">{s.reference || "—"}</td>
                      <td className="p-3">
                        <Button variant="ghost" onClick={() => open(s.id)}>Abrir</Button>
                      </td>
                    </tr>
                  ))}
                  {!items.length && (
                    <tr><td colSpan={5} className="p-4 text-slate-500">No hay sesiones.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="col-span-12 lg:col-span-7">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Sesión activa</h4>
            {active && (
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={cancel} disabled={busy || !canManage}>
                  <Trash size={16}/> Cancelar
                </Button>
                <Button onClick={commit} disabled={busy || !canCommit}>
                  <CheckCircle2 size={16}/> Contabilizar
                </Button>
              </div>
            )}
          </div>

          {active ? (
            <>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
                <div className="text-sm">
                  <div className="text-slate-500">ID</div>
                  <div>{active.session.id}</div>
                </div>
                <div className="text-sm">
                  <div className="text-slate-500">Tipo</div>
                  <div>{active.session.type}</div>
                </div>
                <div className="text-sm">
                  <div className="text-slate-500">Referencia</div>
                  <div>{active.session.reference || "—"}</div>
                </div>
              </div>

              <form onSubmit={scan} className="mt-4 flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-sm text-slate-600"><Barcode size={14}/> Código</span>
                  <Input ref={inputRef} value={scanText} onChange={(e) => setScanText(e.target.value)} autoFocus placeholder="Escanear SKU o EAN…" style={{ width: 220 }}/>
                </div>
                <Input value={scanQty} onChange={(e)=>setScanQty(e.target.value)} placeholder="Cant." style={{ width: 90 }}/>
                {active.session.type === 'in' && (
                  <Input value={scanCost} onChange={(e)=>setScanCost(e.target.value)} placeholder="Costo unit." style={{ width: 120 }}/>
                )}
                <Button type="submit" disabled={busy || !canManage}>
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <StopCircle size={16} />}
                  Agregar
                </Button>
              </form>

              <div className="mt-4 rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left p-3">SKU</th>
                      <th className="text-left p-3">Nombre</th>
                      <th className="text-right p-3">Cant.</th>
                      <th className="text-right p-3">{active.session.type === 'in' ? 'Costo' : '—'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.lines.map((l) => (
                      <tr key={l.id} className="border-t">
                        <td className="p-3 font-mono">{l.sku}</td>
                        <td className="p-3">{l.nombre || "—"}</td>
                        <td className="p-3 text-right">{Number(l.counted_qty).toLocaleString("es-CL")}</td>
                        <td className="p-3 text-right">{active.session.type==='in' ? (l.unit_cost ?? "—") : "—"}</td>
                      </tr>
                    ))}
                    {!active.lines.length && (
                      <tr><td colSpan={4} className="p-4 text-slate-500">Escanea para agregar líneas…</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="mt-3 text-sm text-slate-500">No hay sesión abierta. Crea una o abre una existente.</div>
          )}
        </Card>
      </div>
    </div>
  );
}
