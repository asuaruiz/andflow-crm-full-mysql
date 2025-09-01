// apps/backend/shopifyService.js (o el archivo donde defines shopifyFetch)
import { getSession, readShopifyByTenant } from "./db.js";
import { decryptMaybe } from "./cryptoUtil.js";

function httpError(status, message, body = null) {
  const e = new Error(message);
  e.status = status;
  if (body) e.body = body;
  return e;
}

function resolveToken(raw) {
  if (!raw) return null;
  if (typeof raw === "object" && raw.token) return raw.token;
  try { const dec = decryptMaybe(raw); if (dec) return dec; } catch {}
  // Tokens de Admin API (custom app) normalmente empiezan con shpat_
  if (typeof raw === "string" && /^shp[a-z]_/.test(raw)) return raw;
  return null;
}

export async function shopifyFetch(req, apiPath, opts = {}) {
  // 1) Resuelve tenant desde cookie de sesión
  let tenantId = null;
  try {
    const token = req?.cookies?.session;
    if (token) {
      const sess = await getSession(token);
      tenantId = sess?.selected_tenant_id ?? null;
    }
  } catch {}

  // 2) Fallback por header / query
  if (!tenantId) {
    const hdr = req?.headers?.["x-tenant-id"] || req?.headers?.["x-tenant"];
    const q = req?.query?.tenantId || req?.query?.tenant;
    tenantId = Number(hdr || q) || null;
  }
  if (!tenantId) throw httpError(400, "NO_TENANT: Selecciona una empresa antes de probar la conexión.");

  const cfg = await readShopifyByTenant(tenantId);
  if (!cfg?.domain) throw httpError(400, "MISSING_CREDENTIALS: Falta el dominio guardado.");

  const tokenResolved = resolveToken(cfg.token ?? cfg.tokenJson ?? cfg.token_json);
  if (!tokenResolved) throw httpError(400, "MISSING_CREDENTIALS: Falta el token de Admin API.");

  // --- Construcción de URL ---
  const domain = String(cfg.domain).replace(/^https?:\/\//, "").trim().toLowerCase();
  const version = process.env.SHOPIFY_API_VERSION || "2024-07";
  const path = apiPath.startsWith("/") ? apiPath : `/${apiPath}`;

  // /oauth/* NO va con /admin/api/<version>, sino /admin/oauth/*
  const urlPath = path.startsWith("/oauth/")
    ? `/admin${path}`
    : `/admin/api/${version}${path}`;

  const url = `https://${domain}${urlPath}`;

  // --- Request ---
  const init = {
    method: opts.method || "GET",
    headers: {
      "X-Shopify-Access-Token": tokenResolved,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  };
  if (opts.body != null) {
    init.body = typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
  }

  const resp = await fetch(url, init);

  // Si falla, devolvemos el body crudo para debug
  if (!resp.ok) {
    let body = null; try { body = await resp.text(); } catch {}
    throw httpError(resp.status, `SHOPIFY_HTTP_${resp.status}`, body);
  }

  // Parseo JSON + exponemos headers útiles (paginación, rate limit, versión)
  let data = {};
  try { data = await resp.json(); } catch { data = {}; }

  const wantedHeaders = ["link", "x-shopify-shop-api-call-limit", "x-shopify-api-version"];
  const hdrs = {};
  for (const h of wantedHeaders) {
    const v = resp.headers.get(h);
    if (v != null) hdrs[h] = v;
  }
  data.__headers = hdrs;

  return data;
}
