// src/lib/api.js
export class ApiError extends Error {
  constructor(message, { status, url, payload }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.url = url;
    this.payload = payload ?? null;
  }
}

const baseURL = import.meta.env.VITE_API_BASE_URL || ''; // ej: "http://localhost:5100"

function resolveUrl(url, query) {
  // Siempre resuelve absoluto: si baseURL está definido, lo usa como origen.
  const u = new URL(url, baseURL || window.location.origin);
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
    });
  }
  return u.toString(); // ya es absoluto (incluye host correcto)
}

export async function apiJson(
  url,
  { method = 'GET', body, query, headers, timeout = 15000 } = {}
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  const finalUrl = resolveUrl(url, query);
  const res = await fetch(finalUrl, {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(headers || {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: controller.signal,
  }).catch((e) => {
    clearTimeout(timer);
    throw new ApiError(
      e.name === 'AbortError' ? 'Tiempo de espera agotado' : 'Fallo de red',
      { status: 0, url: finalUrl }
    );
  });

  clearTimeout(timer);

  // 204/205: sin cuerpo
  if (res.status === 204 || res.status === 205) {
    if (!res.ok) throw new ApiError(`HTTP ${res.status}`, { status: res.status, url: finalUrl });
    return null;
  }

  // Parseo robusto
  const ct = res.headers.get('content-type') || '';
  let payload = null;
  try {
    if (ct.includes('application/json')) {
      payload = await res.json();
    } else {
      const text = await res.text();
      try { payload = JSON.parse(text); } catch { payload = { message: text }; }
    }
  } catch {
    payload = null;
  }

  if (!res.ok || payload?.ok === false) {
    const message = (payload && (payload.error || payload.message)) || `HTTP ${res.status}`;
    throw new ApiError(message, { status: res.status, url: finalUrl, payload });
  }

  return payload;
}

// Azúcar
export const apiGet    = (url, opts)       => apiJson(url, { ...opts, method: 'GET' });
export const apiPost   = (url, body, opts) => apiJson(url, { ...opts, method: 'POST', body });
export const apiPut    = (url, body, opts) => apiJson(url, { ...opts, method: 'PUT', body });
export const apiDelete = (url, body, opts) => apiJson(url, { ...opts, method: 'DELETE', body });

/** Manejo centralizado de 401 (opcional) */
export async function apiSafe(fn, { onUnauthorized } = {}) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && typeof onUnauthorized === 'function') {
      onUnauthorized(e);
      return null;
    }
    throw e;
  }
}
