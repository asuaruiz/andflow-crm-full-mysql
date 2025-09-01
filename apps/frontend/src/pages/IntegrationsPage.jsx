import React, { useEffect, useState } from "react";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import { Store, KeyRound, Eye, EyeOff, CheckCircle2, AlertCircle, Plug, Clock } from "lucide-react";
import { apiGet, apiJson } from "../lib/api";

function StatusMsg({ status }) {
  if (!status) return null;
  return (
    <div
      className="flex items-center gap-2 mt-3 text-sm"
      style={{ color: status.ok ? "#15803d" : "#b91c1c" }}
    >
      {status.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
      <span>{status.msg}</span>
    </div>
  );
}

export default function IntegrationsPage() {
  // ---------- Shopify ----------
  const [domain, setDomain] = useState("");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);

  const isDomainValid = (d) =>
    !!d && /[.]myshopify[.]com$/.test(String(d || "").trim().toLowerCase());

  useEffect(() => {
    (async () => {
      try {
        const r = await apiGet("/api/config/shopify");
        if (r?.configured) setDomain(r.domain || "");
      } catch {}
    })();
  }, []);

  const saveCreds = async () => {
    setSaving(true);
    setStatus(null);
    try {
      await apiJson("/api/config/shopify", "POST", { domain, token });
      setToken("");
      setStatus({ ok: true, msg: "Credenciales guardadas en backend." });
    } catch {
      setStatus({ ok: false, msg: "Error al guardar credenciales." });
    } finally {
      setSaving(false);
    }
  };

  const clearCreds = async () => {
    setStatus(null);
    try {
      await apiJson("/api/config/shopify", "DELETE", {});
      setStatus({ ok: true, msg: "Credenciales borradas." });
      setToken("");
      setDomain("");
    } catch {
      setStatus({ ok: false, msg: "No se pudieron borrar las credenciales." });
    }
  };

  const testBackend = async () => {
    setStatus(null);
    try {
      const r = await apiGet("/api/shopify/test");
      const name =
        r?.shop?.name || r?.shop?.myshopify_domain || (domain || "Shopify");
      setStatus({ ok: true, msg: `Conexión Shopify OK · Tienda: ${name}` });
    } catch {
      setStatus({
        ok: false,
        msg: "Error al conectar con Shopify (revisa dominio/token).",
      });
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      {/* Header simple */}
      <Card className="lg:col-span-2">
        <div className="flex items-center gap-2">
          <Plug size={18} />
          <h3 className="font-semibold">Integraciones</h3>
        </div>
        <p className="text-sm text-[var(--muted)] mt-1">
          Conecta servicios externos. Más integraciones llegarán pronto.
        </p>
      </Card>

      {/* Shopify */}
      <Card className="lg:col-span-2">
        <div className="flex items-center gap-2 mb-3">
          <Store size={18} />
          <h3 className="font-semibold">Shopify</h3>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Dominio Shopify
            </label>
            <Input
              placeholder="midominio.myshopify.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
            />
            <p className="text-xs text-[var(--muted)] mt-1">
              Debe terminar en <code>myshopify.com</code>.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Access Token (Admin API)
            </label>
            <div className="relative">
              <Input
                type={showToken ? "text" : "password"}
                placeholder="shpat_***"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowToken((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 opacity-70 hover:opacity-100"
              >
                {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="text-xs text-[var(--muted)] mt-1">
              Se envía al backend y se guarda en MySQL (cifrado si hay
              SECRET_KEY).
            </p>
          </div>
        </div>

        <StatusMsg status={status} />

        <div className="flex flex-wrap items-center gap-2 mt-4">
          <Button
            onClick={saveCreds}
            disabled={!isDomainValid(domain) || !token || saving}
          >
            <KeyRound size={16} /> {saving ? "Guardando..." : "Guardar credenciales"}
          </Button>
          <Button variant="secondary" onClick={testBackend}>
            Probar conexión (backend)
          </Button>
          <Button variant="ghost" onClick={clearCreds}>
            Borrar
          </Button>
        </div>

        <div className="text-xs text-[var(--muted)] mt-3">
          ⚠️ En producción, usa variables de entorno y no expongas el token al
          cliente. Este flujo envía el token solo al backend y éste lo persiste
          sin devolverlo nunca.
        </div>
      </Card>

      {/* Placeholders de futuras integraciones */}
      <Card>
        <div className="flex items-center gap-2 mb-1">
          <Clock size={16} />
          <h4 className="font-medium">Slack (próximamente)</h4>
        </div>
        <p className="text-sm text-[var(--muted)]">
          Notificaciones de eventos y alertas del CRM en tus canales.
        </p>
      </Card>

      <Card>
        <div className="flex items-center gap-2 mb-1">
          <Clock size={16} />
          <h4 className="font-medium">Google Drive (próximamente)</h4>
        </div>
        <p className="text-sm text-[var(--muted)]">
          Sincronización de documentos de clientes y cotizaciones.
        </p>
      </Card>
    </div>
  );
}
