// apps/frontend/src/pages/ClienteDetallePage.jsx
import React from "react";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { useRoute } from "../router";

function fmtMoney(v){ if(v==null) return ""; const n=Number(v)||0; return n.toLocaleString('es-CL', { style:'currency', currency:'CLP' }); }

export default function ClienteDetallePage(){
  const { path, navigate } = useRoute();

  // /clientes/:id  -> saca el id de la ruta actual
  const id = React.useMemo(() => {
    const m = (path || "").match(/^\/clientes\/(\d+)/);
    return m ? m[1] : null;
  }, [path]);

  const [data, setData] = React.useState(null);
  const [err, setErr]   = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(()=>{
    let mounted = true;
    if (!id) { setErr("Ruta inválida"); setLoading(false); return; }
    (async ()=>{
      try{
        const r = await fetch(`/api/customers/${id}`);
        const j = await r.json();
        if (!j.ok) throw new Error(j.error||'Error');
        if (mounted) setData(j);
      }catch(e){ if (mounted) setErr(e.message); }
      finally{ if (mounted) setLoading(false); }
    })();
    return ()=>{ mounted=false; };
  },[id]);

  if (loading) return <div className="p-4 text-sm" style={{color:"var(--muted)"}}>Cargando…</div>;
  if (err) return <div className="p-4 text-sm" style={{color:"var(--danger)"}}>Error: {err}</div>;
  if (!data?.customer) return null;

  const c = data.customer;
  const name = [c.first_name||"", c.last_name||""].join(" ").trim() || "(sin nombre)";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg">Cliente</h2>
        <Button variant="secondary" onClick={()=>navigate("/clientes")}>Volver</Button>
      </div>

      <Card>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="text-xs" style={{color:"var(--muted)"}}>Nombre</div>
            <div className="font-medium">{name}</div>
          </div>
          <div>
            <div className="text-xs" style={{color:"var(--muted)"}}>Email</div>
            <div>{c.email || "—"}</div>
          </div>
          <div>
            <div className="text-xs" style={{color:"var(--muted)"}}>Teléfono</div>
            <div>{c.phone || "—"}</div>
          </div>

          <div>
            <div className="text-xs" style={{color:"var(--muted)"}}>Órdenes</div>
            <div className="font-medium">{c.orders_count ?? 0}</div>
          </div>
          <div>
            <div className="text-xs" style={{color:"var(--muted)"}}>Total gastado</div>
            <div className="font-medium">{fmtMoney(c.total_spent)}</div>
          </div>
          <div>
            <div className="text-xs" style={{color:"var(--muted)"}}>Estado</div>
            <div>{c.state || "—"}</div>
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="font-semibold mb-2">Direcciones</h3>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left" style={{borderBottom:"1px solid var(--border)"}}>
                <th className="py-2 pr-3">Predet.</th>
                <th className="py-2 pr-3">Nombre</th>
                <th className="py-2 pr-3">Dirección</th>
                <th className="py-2 pr-3">Ciudad</th>
                <th className="py-2 pr-3">Provincia</th>
                <th className="py-2 pr-3">País</th>
                <th className="py-2 pr-3">ZIP</th>
                <th className="py-2 pr-3">Teléfono</th>
              </tr>
            </thead>
            <tbody>
              {(data.addresses||[]).map(a=>(
                <tr key={a.id} style={{borderBottom:"1px solid var(--border)"}}>
                  <td className="py-2 pr-3">{a.is_default ? "Sí" : ""}</td>
                  <td className="py-2 pr-3">{a.name || "—"}</td>
                  <td className="py-2 pr-3">{[a.address1,a.address2].filter(Boolean).join(", ")}</td>
                  <td className="py-2 pr-3">{a.city || "—"}</td>
                  <td className="py-2 pr-3">{a.province || "—"}</td>
                  <td className="py-2 pr-3">{a.country || "—"}</td>
                  <td className="py-2 pr-3">{a.zip || "—"}</td>
                  <td className="py-2 pr-3">{a.phone || "—"}</td>
                </tr>
              ))}
              {!data.addresses?.length && (
                <tr><td className="py-4 text-sm" colSpan={8} style={{color:"var(--muted)"}}>Sin direcciones.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
