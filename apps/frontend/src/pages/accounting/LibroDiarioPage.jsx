// apps/frontend/src/pages/accounting/LibroDiarioPage.jsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";

function Th({ children, className="" }) {
  return <th className={"px-4 py-3 text-xs font-semibold text-slate-500 "+className}>{children}</th>;
}
function Td({ children, className="" }) {
  return <td className={"px-4 py-3 "+className}>{children}</td>;
}

const nfCLP = new Intl.NumberFormat("es-CL");

function Table({ rows }) {
  if (!rows.length) {
    return (
      <div className="p-8 text-sm text-[var(--muted)]">
        No hay asientos en el rango o criterio de búsqueda.
        <div className="mt-2">Tip: ajusta las fechas o crea un nuevo asiento más abajo.</div>
      </div>
    );
  }
  return (
    <div className="overflow-auto rounded-2xl border" style={{ borderColor: "var(--border)" }}>
      <table className="min-w-[1000px] w-full text-sm">
        <thead className="sticky top-0 z-10" style={{ background: "#fafafa" }}>
          <tr className="text-left">
            <Th>Fecha</Th>
            <Th>#</Th>
            <Th>Cuenta</Th>
            <Th>Tipo</Th>
            <Th className="text-right">Debe</Th>
            <Th className="text-right">Haber</Th>
            <Th>Glosa</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i)=>(
            <tr key={i} className="border-t odd:bg-white even:bg-[#fbfbfb]" style={{ borderColor: "var(--border)" }}>
              <Td>{r.entry_date}</Td>
              <Td className="font-mono">{r.entry_id}</Td>
              <Td className="font-mono">{r.account_code} · {r.account_name}</Td>
              <Td>{r.account_type}</Td>
              <Td className="text-right">{nfCLP.format(Number(r.debit||0))}</Td>
              <Td className="text-right">{nfCLP.format(Number(r.credit||0))}</Td>
              <Td className="max-w-[360px] truncate" title={r.line_desc || r.memo}>{r.line_desc || r.memo || "—"}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function LibroDiarioPage(){
  const [rows, setRows] = useState([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  // paginación local
  const [perPage, setPerPage] = useState(100);
  const [page, setPage] = useState(1);

  const load = useCallback(async ()=>{
    setLoading(true);
    try{
      const url = `/api/accounting/journal?from=${encodeURIComponent(from||"")}&to=${encodeURIComponent(to||"")}&q=${encodeURIComponent(q||"")}`;
      const r = await fetch(url);
      const j = await r.json();
      setRows(j.items || []);
      setPage(1);
    } finally {
      setLoading(false);
    }
  }, [from,to,q]);

  useEffect(()=>{ load(); },[]);

  const exportCsv = ()=>{
    const url = `/api/accounting/journal?from=${encodeURIComponent(from||"")}&to=${encodeURIComponent(to||"")}&q=${encodeURIComponent(q||"")}&format=csv`;
    window.location.href = url;
  };

  const paginated = useMemo(()=>{
    const start = (page-1)*perPage;
    const end = start + perPage;
    return rows.slice(start, end);
  }, [rows, page, perPage]);

  const totals = useMemo(()=>{
    const d = rows.reduce((a,b)=> a + Number(b.debit||0), 0);
    const c = rows.reduce((a,b)=> a + Number(b.credit||0), 0);
    return { d, c, diff: d - c };
  }, [rows]);

  const setRange = (key)=>{
    const today = new Date();
    const toISO = (d)=> d.toISOString().slice(0,10);
    if(key==="today"){
      const d = toISO(today);
      setFrom(d); setTo(d);
    }else if(key==="7d"){
      const d1 = new Date(today); d1.setDate(d1.getDate()-6);
      setFrom(toISO(d1)); setTo(toISO(today));
    }else if(key==="month"){
      const d1 = new Date(today.getFullYear(), today.getMonth(), 1);
      const d2 = new Date(today.getFullYear(), today.getMonth()+1, 0);
      setFrom(toISO(d1)); setTo(toISO(d2));
    }else if(key==="year"){
      const d1 = new Date(today.getFullYear(), 0, 1);
      const d2 = new Date(today.getFullYear(), 11, 31);
      setFrom(toISO(d1)); setTo(toISO(d2));
    }
  };

  return (
    <div className="space-y-4">
      {/* TÍTULO DE PÁGINA */}
      <header className="mb-1">
        <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Contabilidad</div>
        <h1 className="text-2xl font-bold mt-1">Libro diario</h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Registra y consulta asientos en partida doble. Para guardar, los totales Debe y Haber deben cuadrar.
        </p>
      </header>

      {/* FILTROS */}
      <Card>
        <div className="grid lg:grid-cols-[1fr_auto] gap-3">
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <div className="text-xs text-[var(--muted)] mb-1">Desde</div>
              <Input type="date" value={from} onChange={e=>setFrom(e.target.value)} aria-label="Desde" />
            </div>
            <div>
              <div className="text-xs text-[var(--muted)] mb-1">Hasta</div>
              <Input type="date" value={to} onChange={e=>setTo(e.target.value)} aria-label="Hasta" />
            </div>
            <div>
              <div className="text-xs text-[var(--muted)] mb-1">Buscar glosa/cuenta</div>
              <Input placeholder="Ej: venta / 1101 / banco" value={q} onChange={e=>setQ(e.target.value)} aria-label="Buscar glosa o cuenta" />
            </div>
          </div>
          <div className="flex items-end gap-2">
            <div className="hidden sm:flex gap-1 mr-auto">
              <Button variant="ghost" onClick={()=>setRange("today")}>Hoy</Button>
              <Button variant="ghost" onClick={()=>setRange("7d")}>7 días</Button>
              <Button variant="ghost" onClick={()=>setRange("month")}>Mes</Button>
              <Button variant="ghost" onClick={()=>setRange("year")}>Año</Button>
            </div>
            <Button variant="secondary" onClick={load} disabled={loading}>{loading ? "Cargando..." : "Filtrar"}</Button>
            <Button onClick={exportCsv}>Exportar CSV</Button>
          </div>
        </div>

        {/* Resumen (solo si hay filas) */}
        {rows.length > 0 && (
          <div className="mt-3 grid sm:grid-cols-4 gap-2 text-sm">
            <div className="rounded-xl p-3 border" style={{borderColor:"var(--border)"}}>
              <div className="text-[var(--muted)] text-xs">Total Debe</div>
              <div className="font-semibold">${nfCLP.format(totals.d)}</div>
            </div>
            <div className="rounded-xl p-3 border" style={{borderColor:"var(--border)"}}>
              <div className="text-[var(--muted)] text-xs">Total Haber</div>
              <div className="font-semibold">${nfCLP.format(totals.c)}</div>
            </div>
            <div className="rounded-xl p-3 border" style={{borderColor:"var(--border)"}}>
              <div className="text-[var(--muted)] text-xs">Diferencia</div>
              <div className="font-semibold" style={{color: totals.diff===0 ? "#15803d" : "#b91c1c"}}>
                ${nfCLP.format(totals.diff)}
              </div>
            </div>
            <div className="rounded-xl p-3 border flex items-center justify-between" style={{borderColor:"var(--border)"}}>
              <span className="text-xs text-[var(--muted)]">Asientos visibles</span>
              <div className="flex items-center gap-2">
                <select
                  value={perPage}
                  onChange={(e)=>{ setPerPage(Number(e.target.value)); setPage(1); }}
                  className="h-9 px-2 rounded-lg border bg-white"
                  style={{borderColor:"var(--border)"}}
                >
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                </select>
                <div className="text-sm">{(rows.length ? ( (page-1)*perPage+1 ) : 0)}–{Math.min(page*perPage, rows.length)} / {rows.length}</div>
                <div className="flex gap-1">
                  <Button variant="ghost" onClick={()=>setPage(p=>Math.max(1, p-1))} disabled={page===1}>‹</Button>
                  <Button variant="ghost" onClick={()=>setPage(p=> (p*perPage<rows.length? p+1 : p))} disabled={page*perPage>=rows.length}>›</Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* FORMULARIO NUEVO ASIENTO */}
      <NewEntry onCreated={load} />

      {/* TABLA */}
      <Card>{loading ? <div className="p-8 text-sm text-[var(--muted)]">Cargando asientos…</div> : <Table rows={paginated} />}</Card>
    </div>
  );
}

function NewEntry({ onCreated }){
  const [accounts, setAccounts] = useState([]);
  const [accountsFilter, setAccountsFilter] = useState("");
  const [entryDate, setEntryDate] = useState(()=> new Date().toISOString().slice(0,10));
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState([
    {account_id:"", debit:"", credit:"", desc:""},
    {account_id:"", debit:"", credit:"", desc:""}
  ]);
  const [status, setStatus] = useState(null);
  const tableRef = useRef(null);

  useEffect(()=>{ (async ()=>{
    const r=await fetch('/api/accounting/accounts');
    const j=await r.json();
    setAccounts(j.items || []);
  })(); },[]);

  const accountsFiltered = useMemo(()=>{
    if(!accountsFilter) return accounts;
    const f = accountsFilter.toLowerCase();
    return accounts.filter(a =>
      String(a.code).toLowerCase().includes(f) ||
      String(a.name).toLowerCase().includes(f)
    );
  }, [accounts, accountsFilter]);

  const addLine = useCallback(()=> setLines(s=>[...s,{account_id:"",debit:"",credit:"", desc:""}]), []);
  const removeLine = (i)=> setLines(s=> s.length>2 ? s.filter((_,idx)=>idx!==i) : s);
  const up = (i, k, v)=> setLines(s=> s.map((ln,idx)=> idx===i? {...ln,[k]:v} : ln));

  const sumD = useMemo(()=> lines.reduce((a,b)=> a + (Number(b.debit||0)), 0), [lines]);
  const sumC = useMemo(()=> lines.reduce((a,b)=> a + (Number(b.credit||0)), 0), [lines]);
  const diff = sumD - sumC;

  const lineErrors = useMemo(()=>{
    return lines.map(ln=>{
      const hasAmt = Number(ln.debit||0) > 0 || Number(ln.credit||0) > 0;
      const both = Number(ln.debit||0) > 0 && Number(ln.credit||0) > 0;
      return {
        noAccount: !ln.account_id,
        noAmount: !hasAmt,
        bothSides: both,
      };
    });
  }, [lines]);

  const formValid = useMemo(()=>{
    if (lines.length < 2) return false;
    if (diff !== 0) return false;
    if (sumD === 0 || sumC === 0) return false;
    if (lineErrors.some(e=> e.noAccount || e.noAmount || e.bothSides)) return false;
    return true;
  }, [lines, diff, sumD, sumC, lineErrors]);

  const clearForm = ()=>{
    setMemo("");
    setLines([
      {account_id:"", debit:"", credit:"", desc:""},
      {account_id:"", debit:"", credit:"", desc:""}
    ]);
    setAccountsFilter("");
    setStatus(null);
  };

  const save = async ()=>{
    setStatus(null);
    const payload = {
      entry_date: entryDate,
      memo,
      lines: lines.map(l => ({
        account_id: Number(l.account_id) || null,
        debit: Number(l.debit || 0),
        credit: Number(l.credit || 0),
        description: l.desc || memo
      }))
    };
    const r = await fetch('/api/accounting/journal', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    const j = await r.json();
    if (j.ok) {
      setStatus({ok:true,msg:'Asiento creado'});
      clearForm();
      onCreated?.();
    } else {
      setStatus({ok:false,msg:j.error||'Error al crear el asiento'});
    }
  };

  // Atajos: Ctrl/Cmd+S guardar
  useEffect(()=>{
    const handler = (e)=>{
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase()==="s") {
        e.preventDefault();
        if (formValid) save();
      }
    };
    window.addEventListener("keydown", handler);
    return ()=> window.removeEventListener("keydown", handler);
  }, [formValid, save]);

  return (
    <Card>
      <h3 className="font-semibold mb-2">Nuevo asiento</h3>

      <div className="grid sm:grid-cols-4 gap-3 mb-3">
        <div>
          <div className="text-xs text-[var(--muted)] mb-1">Fecha</div>
          <Input type="date" value={entryDate} onChange={e=>setEntryDate(e.target.value)} aria-label="Fecha del asiento" />
        </div>
        <div className="sm:col-span-3">
          <div className="text-xs text-[var(--muted)] mb-1">Glosa</div>
          <Input value={memo} onChange={e=>setMemo(e.target.value)} placeholder="Venta del día / Pago proveedor / Ajuste inventario" aria-label="Glosa del asiento" />
        </div>
      </div>

      <div className="mb-2">
        <div className="text-xs text-[var(--muted)] mb-1">Filtrar cuentas</div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Ej: 1101 / Caja / Banco / Ventas"
            value={accountsFilter}
            onChange={e=>setAccountsFilter(e.target.value)}
            className="max-w-[360px]"
            aria-label="Filtro de cuentas"
          />
          {!!accountsFilter && <Button variant="ghost" onClick={()=>setAccountsFilter("")}>Limpiar</Button>}
        </div>
      </div>

      <div className="overflow-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
        <table className="min-w-[980px] w-full text-sm">
          <thead className="sticky top-0 z-10" style={{ background: "#fafafa" }}>
            <tr>
              <Th>Cuenta</Th>
              <Th>Descripción</Th>
              <Th className="text-right">Debe</Th>
              <Th className="text-right">Haber</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {lines.map((ln,i)=>{
              const err = lineErrors[i];
              const borderErr = (err.noAccount || err.noAmount || err.bothSides) ? "#b91c1c" : "var(--border)";
              return (
                <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <Td>
                    <select
                      value={ln.account_id}
                      onChange={e=>up(i,'account_id', e.target.value)}
                      className="h-10 px-2 rounded-xl border w-full bg-white"
                      style={{borderColor:borderErr}}
                      aria-label={`Cuenta línea ${i+1}`}
                    >
                      <option value="">— Selecciona cuenta —</option>
                      {accountsFiltered.map(a=>(
                        <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                      ))}
                    </select>
                    {err?.noAccount && <div className="text-[10px] text-rose-600 mt-1">Selecciona una cuenta</div>}
                  </Td>
                  <Td>
                    <Input
                      value={ln.desc}
                      onChange={e=>up(i,'desc', e.target.value)}
                      placeholder="(opcional) detalle de la línea"
                      aria-label={`Descripción línea ${i+1}`}
                    />
                  </Td>
                  <Td>
                    <Input
                      type="number" min="0" step="0.01" inputMode="decimal"
                      className="text-right"
                      value={ln.debit}
                      onChange={e=>{
                        const v = e.target.value;
                        up(i,'debit', v);
                        if (Number(v||0) > 0 && Number(ln.credit||0) > 0) up(i,'credit', "");
                      }}
                      aria-label={`Debe línea ${i+1}`}
                    />
                    {lineErrors[i]?.bothSides && <div className="text-[10px] text-rose-600 mt-1">Usa solo un lado</div>}
                  </Td>
                  <Td>
                    <Input
                      type="number" min="0" step="0.01" inputMode="decimal"
                      className="text-right"
                      value={ln.credit}
                      onChange={e=>{
                        const v = e.target.value;
                        up(i,'credit', v);
                        if (Number(v||0) > 0 && Number(ln.debit||0) > 0) up(i,'debit', "");
                      }}
                      aria-label={`Haber línea ${i+1}`}
                    />
                  </Td>
                  <Td>
                    <button onClick={()=>removeLine(i)} className="text-xs text-rose-600" disabled={lines.length<=2}>
                      Eliminar
                    </button>
                  </Td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t" style={{ borderColor: "var(--border)" }}>
              <Td className="text-right font-semibold" colSpan={2}>Totales</Td>
              <Td className="text-right font-semibold">${nfCLP.format(sumD)}</Td>
              <Td className="text-right font-semibold">${nfCLP.format(sumC)}</Td>
              <Td />
            </tr>
            <tr>
              <Td className="text-right text-xs" colSpan={2}>Diferencia</Td>
              <Td colSpan={2} className="text-right text-xs" style={{color: diff===0 ? "#15803d" : "#b91c1c"}}>
                ${nfCLP.format(diff)}
              </Td>
              <Td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex items-center justify-between mt-3">
        <div className="text-sm">
          <span className="mr-4">Debe: <b>${nfCLP.format(sumD)}</b></span>
          <span>Haber: <b>${nfCLP.format(sumC)}</b></span>
          {diff!==0 && <span className="ml-4 text-rose-700">No cuadra (${nfCLP.format(diff)})</span>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={addLine}>Agregar línea</Button>
          <Button variant="ghost" onClick={clearForm}>Limpiar</Button>
          <Button onClick={save} disabled={!formValid} title={formValid ? "Guardar asiento" : "Debe cuadrar y no tener errores"}>
            Guardar asiento
          </Button>
        </div>
      </div>

      {status && (
        <div className="text-sm mt-2" style={{color: status.ok? '#15803d' : '#b91c1c'}}>{status.msg}</div>
      )}

      <div className="mt-2 text-[11px] text-[var(--muted)]">
        Atajos: <b>Ctrl/Cmd+S</b> guardar
      </div>
    </Card>
  );
}
