// apps/backend/shopifyOrdersRoutes.js
import express from 'express';
import mysql from 'mysql2/promise';
import {
  listShopifyOrders,
  getShopifyOrder,
  syncOrders,
  ensureShopifyOrderTables
} from './shopifyOrders.js';
import { getSession } from './db.js'; // 👈 para resolver tenant desde la cookie

export function shopifyOrdersRouter(){
  const r = express.Router();

  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  ensureShopifyOrderTables(pool).catch(()=>{});

  // --------------------------------- helpers ---------------------------------
  async function resolveTenantId(req){
    // cookie de sesión -> selected_tenant_id; fallback a headers/query
    try {
      const token = req.cookies?.session;
      if (token) {
        const sess = await getSession(token);
        if (sess?.selected_tenant_id) return Number(sess.selected_tenant_id);
      }
    } catch {}
    const hdr = req.headers['x-tenant-id'] || req.headers['x-tenant'];
    const q   = req.query?.tenantId || req.query?.tenant;
    const t = Number(hdr || q) || null;
    if (!t) {
      const e = new Error('NO_TENANT');
      e.status = 400;
      throw e;
    }
    return t;
  }

  // Acepta:
  // - Shopify numeric id: "8059793014870"
  // - GID: "gid://shopify/Order/8059793014870"
  // - Número: "#1008" o "1008"
  // - Id interno de sales_orders: "42"
  async function mapToShopifyId(req, raw) {
    const s = String(raw || '').trim();

    // 1) GID
    const mg = s.match(/Order\/(\d+)/i);
    if (mg) return mg[1];

    // 2) Solo números => ya es id de Shopify
    if (/^\d+$/.test(s)) return s;

    // 3) Buscar en sales_orders por tenant
    const tenantId = await resolveTenantId(req);
    const conn = await pool.getConnection();
    try {
      // a) por id interno (solo si s es número)
      if (/^\d+$/.test(s)) {
        const [[byInternal]] = await conn.query(
          `SELECT external_id FROM sales_orders
           WHERE id=? AND tenant_id=? AND origin='shopify' LIMIT 1`,
          [Number(s), tenantId]
        );
        if (byInternal?.external_id) return String(byInternal.external_id);
      }

      // b) por number "#1008" / "1008"
      const plainNumber = s.replace(/^#/, '');
      const [[byNumber]] = await conn.query(
        `SELECT external_id FROM sales_orders
         WHERE tenant_id=? AND origin='shopify'
           AND (number=? OR REPLACE(number,'#','')=?)
         LIMIT 1`,
        [tenantId, `#${plainNumber}`, plainNumber]
      );
      if (byNumber?.external_id) return String(byNumber.external_id);

      // c) por id interno no-numérico tipo "C-23" => extraer número y reintentar
      const mi = s.match(/(\d+)/);
      if (mi) {
        const [[byInternal2]] = await conn.query(
          `SELECT external_id FROM sales_orders
           WHERE id=? AND tenant_id=? AND origin='shopify' LIMIT 1`,
          [Number(mi[1]), tenantId]
        );
        if (byInternal2?.external_id) return String(byInternal2.external_id);
      }
    } finally {
      conn.release();
    }
    return null;
  }

  // --------------------------------- rutas -----------------------------------
  r.get('/', async (req, res) => {
    try {
      const orders = await listShopifyOrders(req, {
        status: req.query.status || 'any',
        created_at_min: req.query.since || null,
        limit: Number(req.query.limit || 20),
      });
      res.json({ ok: true, items: orders });
    } catch (e) {
      console.error('[shopify list] error:', e);
      res.status(e.status || 500).json({ ok: false, error: e.message });
    }
  });

  r.post('/sync', async (req, res) => {
    try {
      const out = await syncOrders(req, {
        pool,
        since: req.body?.since || null,
        limit: Number(req.body?.limit || 50),
      });
      res.json(out);
    } catch (e) {
      console.error('[shopify sync] error:', e);
      res.status(e.status || 500).json({ ok: false, error: e.message });
    }
  });

  r.get('/:orderId', async (req, res) => {
    try {
      // 🔑 ahora soporta ids internos, números de orden y GID
      const shopifyId = await mapToShopifyId(req, req.params.orderId);
      if (!shopifyId) {
        return res.status(404).json({ ok:false, error: 'NOT_FOUND_OR_NOT_SHOPIFY' });
      }
      const order = await getShopifyOrder(req, shopifyId);
      if (!order) return res.status(404).json({ ok:false, error: 'shopify 404' });
      res.json({ ok:true, order });
    } catch (e) {
      const status = e?.status || 500;
      const detail = e?.body || e?.message;
      console.error('[shopify get order] error:', status, detail);
      res.status(status).json({ ok:false, error: `shopify ${status}`, detail });
    }
  });

  return r;
}
