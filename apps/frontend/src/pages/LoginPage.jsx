import React, { useState } from "react";
import { useAuth } from "../../context/AuthContext.jsx";
import { useRoute } from "../../router";

export default function LoginPage() {
  const { login } = useAuth();
  const { navigate } = useRoute();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      await login(email.trim(), password);
      navigate("/dashboard"); // o tu ruta preferida post-login
    } catch (e) {
      setErr(parseError(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--color-bg)" }}>
      <div className="w-[92%] max-w-[420px] rounded-2xl border p-6" style={{ background: "var(--color-card)", borderColor: "var(--border)" }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl" style={{ background: "var(--color-primary)" }} />
          <div>
            <div className="font-semibold">andflow CRM</div>
            <div className="text-xs text-[var(--muted)]">Inicia sesión para continuar</div>
          </div>
        </div>

        {err && (
          <div className="mb-3 text-sm rounded-xl px-3 py-2 border"
               style={{ background:"#fff1f2", color:"#b91c1c", borderColor:"#fecaca" }}>
            {err}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-[var(--muted)]">Email</label>
            <input
              type="email"
              value={email}
              onChange={e=>setEmail(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border bg-white outline-none"
              style={{ borderColor:"var(--border)" }}
              placeholder="admin@andflow.local"
              required
            />
          </div>

          <div>
            <label className="text-xs text-[var(--muted)]">Password</label>
            <div className="relative">
              <input
                type={show ? "text" : "password"}
                value={password}
                onChange={e=>setPassword(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border bg-white outline-none pr-10"
                style={{ borderColor:"var(--border)" }}
                placeholder="••••••••"
                required
              />
              <button type="button" onClick={()=>setShow(s=>!s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--muted)] hover:underline">
                {show ? "Ocultar" : "Mostrar"}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 rounded-xl text-white font-medium"
            style={{ background:"var(--color-primary)" }}
          >
            {loading ? "Ingresando..." : "Ingresar"}
          </button>
        </form>

        <div className="mt-4 text-xs text-[var(--muted)]">
          ¿Olvidaste tu contraseña? (pendiente)
        </div>
      </div>
    </div>
  );
}

function parseError(e) {
  try {
    const msg = e?.message || "";
    if (!msg) return "No se pudo iniciar sesión.";
    // intenta limpiar HTML de error de Express
    if (msg.startsWith("<!DOCTYPE")) return "Credenciales inválidas o servidor no disponible.";
    return msg.replace(/["{}]/g, "");
  } catch { return "No se pudo iniciar sesión."; }
}
