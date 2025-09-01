// apps/backend/server.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import mysql from 'mysql2/promise';

import {
  waitForMySQL,
  ensureDatabaseAndTables,
  getSession,
  readShopifyByTenant,
  upsertShopify,
  clearShopifyByTenant,
} from './db.js';

import { encryptMaybe } from './cryptoUtil.js';
import { shopifyFetch } from './shopifyService.js';
import { shopifyOrdersRouter } from './shopifyOrdersRoutes.js';
import { siiRouter } from './sii/routes.js';
import { dteRouter } from './dteRoutes.js';
import { initAccountingRoutes } from './accounting.js';

import { platformTenantsRouter } from './platform.tenants.routes.js';
import { authTenantRouter } from './auth.tenant.routes.js';
import { tenantSettingsRouter } from './tenant.settings.routes.js';
import { productsRouter } from "./products.routes.js";
import { productsMasterRouter } from './products.master.routes.js';
import { tenantUsersRouter } from './tenant.users.routes.js';
import { inventoryRouter } from './inventory.routes.js';
import { inventoryPickingRouter } from './inventory.picking.routes.js';


// ===== NUEVO: Clientes =====
import { shopifyCustomersRouter } from './shopifyCustomersRoutes.js';
import { customersRouter } from './customers.routes.js';
// ===========================
import { salesRouter } from './sales.routes.js';

const app = express();
const PORT = process.env.PORT || 5100;

app.use(cors({
  origin: ['http://localhost:5173'],
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));

// Bootstrap DB
await waitForMySQL().catch((e) => {
  console.error('[mysql] no responde:', e.message);
  process.exit(1);
});
await ensureDatabaseAndTables();

/* ---------------------------------- AUTH ---------------------------------- */
app.post('/auth/login', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password) return res.status(400).json({ ok:false, error:'email y password son requeridos' });

    const conn = await mysql.createConnection({
      host: process.env.MYSQL_HOST,
      port: Number(process.env.MYSQL_PORT),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
    });
    const [[u]] = await conn.query(
      `SELECT id, email, password_hash, is_active FROM users WHERE email=? LIMIT 1`,
      [email]
    );
    if (!u) { await conn.end(); return res.status(401).json({ ok:false, error:'Credenciales inválidas' }); }
    if (!u.is_active) { await conn.end(); return res.status(403).json({ ok:false, error:'Usuario inactivo' }); }

    const ok = await bcrypt.compare(password, u.password_hash || '');
    if (!ok) { await conn.end(); return res.status(401).json({ ok:false, error:'Credenciales inválidas' }); }

    const token = crypto.randomBytes(32).toString('hex');
    const now = new Date();
    const expires = new Date(now.getTime() + 1000*60*60*24*7); // 7 días

    await conn.query(
      `INSERT INTO sessions (token, user_id, selected_tenant_id, created_at, expires_at)
       VALUES (?, ?, NULL, ?, ?)`,
      [token, u.id, now, expires]
    );
    await conn.query(`UPDATE users SET last_login_at=? WHERE id=?`, [now, u.id]);
    await conn.end();

    res.cookie('session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false, // en prod con https => true
      path: '/',
      expires,
    });
    res.json({ ok:true });
  } catch (e) {
    console.error('[auth/login]', e);
    res.status(500).json({ ok:false, error:'Login failed' });
  }
});

app.post('/auth/logout', async (req, res) => {
  try {
    const token = req.cookies?.session;
    if (token) {
      const conn = await mysql.createConnection({
        host: process.env.MYSQL_HOST,
        port: Number(process.env.MYSQL_PORT),
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE,
      });
      await conn.query(`DELETE FROM sessions WHERE token=?`, [token]);
      await conn.end();
    }
    res.clearCookie('session', { path:'/' });
    res.json({ ok:true });
  } catch (e) {
    res.status(500).json({ ok:false, error:'Logout failed' });
  }
});

/* -------------------------- Routers de plataforma -------------------------- */
app.use('/api/platform/tenants', platformTenantsRouter()); // CRUD Tenants (superadmin)
app.use('/auth/tenant', authTenantRouter());                // /current y /switch

/* ------------------------------- Healthcheck ------------------------------- */
app.get('/api/health', async (req, res) => {
  try {
    let tenantSelected = false;
    let shopifyConfigured = false;
    let tenantId = null;

    try {
      const token = req.cookies?.session;
      if (token) {
        const sess = await getSession(token);
        if (sess?.selected_tenant_id) {
          tenantSelected = true;
          tenantId = sess.selected_tenant_id;
          const cfg = await readShopifyByTenant(tenantId);
          shopifyConfigured = Boolean(cfg);
        }
      }
    } catch {}

    res.json({
      status: 'ok',
      service: 'andflow-backend-mysql',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      tenantSelected,
      tenantId,
      shopifyConfigured,
    });
  } catch (e) {
    res.json({
      status: 'degraded',
      error: e?.message || 'unknown',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  }
});

/* ---------------------------- Settings por tenant -------------------------- */
app.use('/api/tenant-settings', tenantSettingsRouter()); // GET/PUT settings del tenant

/* ------------------------- Config Shopify por tenant ----------------------- */
async function getActiveTenantId(req) {
  const token = req.cookies?.session;
  const sess = await getSession(token);
  return { sess, tenantId: sess?.selected_tenant_id ?? null };
}

app.post('/api/config/shopify', async (req, res) => {
  const { sess, tenantId } = await getActiveTenantId(req);
  if (!sess || !tenantId) {
    return res.status(400).json({ ok: false, error: 'Selecciona una empresa (tenant) antes de configurar Shopify' });
  }
  const { domain, token } = req.body || {};
  if (!domain || !token) return res.status(400).json({ ok: false, error: 'domain y token son requeridos' });

  const d = String(domain).trim().toLowerCase();
  if (!/[.]myshopify[.]com$/.test(d)) return res.status(400).json({ ok: false, error: 'dominio inválido: debe terminar en myshopify.com' });

  const tokenJson = encryptMaybe(String(token));
  await upsertShopify({ tenantId, domain: d, tokenJson });
  res.json({ ok: true });
});

app.get('/api/config/shopify', async (req, res) => {
  const { sess, tenantId } = await getActiveTenantId(req);
  if (!sess || !tenantId) return res.json({ ok: true, configured: false, tenantSelected: false });
  const cfg = await readShopifyByTenant(tenantId);
  if (!cfg) return res.json({ ok: true, configured: false, tenantSelected: true });
  res.json({ ok: true, configured: true, tenantSelected: true, domain: cfg.domain, hasToken: true, savedAt: cfg.savedAt });
});

app.delete('/api/config/shopify', async (req, res) => {
  const { sess, tenantId } = await getActiveTenantId(req);
  if (!sess || !tenantId) {
    return res.status(400).json({ ok: false, error: 'Selecciona una empresa (tenant) para borrar credenciales' });
  }
  await clearShopifyByTenant(tenantId);
  res.json({ ok: true });
});

app.get('/api/shopify/test', async (req, res) => {
  try {
    const data = await shopifyFetch(req, '/shop.json', { method: 'GET' });
    const shop = data.shop || {};
    res.json({
      ok: true,
      shop: {
        name: shop.name,
        email: shop.email,
        myshopify_domain: shop.myshopify_domain,
        plan_display_name: shop.plan_display_name,
        primary_locale: shop.primary_locale,
        country_code: shop.country_code,
      }
    });
  } catch (e) {
    res.status(400).json({
      ok: false,
      error: e.message,
      status: e.status || 400,
      body: e.body || null
    });
  }
});

/* --------------------------- Accounting / Otros ---------------------------- */
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});
initAccountingRoutes(app, pool);

// Shopify Orders
app.use('/api/shopify/orders', shopifyOrdersRouter());

// ===== NUEVO: Shopify Customers (sync/webhook simple)
app.use('/api/shopify/customers', shopifyCustomersRouter());

// Maestra de productos
app.use('/api/products/master', productsMasterRouter());

// SII & DTE
app.use('/api/sii', siiRouter());
app.use('/api/dte', dteRouter());

// Inventario / Productos / Users por tenant
app.use('/api/products', productsRouter());
app.use('/api/tenant/users', tenantUsersRouter());
app.use('/api/inventory', inventoryRouter());

// ===== NUEVO: Customers API (listado/detalle para el frontend)
app.use('/api/customers', customersRouter());

app.use('/api/sales', salesRouter());

app.use('/api/picking', inventoryPickingRouter());

/* --------------------------------- Errores -------------------------------- */
app.use((err, req, res, next) => {
  console.error('[API ERROR]', err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ ok:false, error: err?.message || 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`[andflow-backend-mysql] listening on http://localhost:${PORT}`);
});
