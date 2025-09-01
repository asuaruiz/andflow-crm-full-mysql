// apps/backend/customers.routes.js
import express from 'express';
import mysql from 'mysql2/promise';
import { getSession } from './db.js';

const {
  MYSQL_HOST='127.0.0.1', MYSQL_PORT='3306', MYSQL_USER='root',
  MYSQL_PASSWORD='', MYSQL_DATABASE='andflow'
} = process.env;

const pool = mysql.createPool({
  host: MYSQL_HOST, port: Number(MYSQL_PORT),
  user: MYSQL_USER, password: MYSQL_PASSWORD, database: MYSQL_DATABASE,
  waitForConnections: true, connectionLimit: 10, decimalNumbers:true
});

async function getTenantId(req){
  let tenantId = null;
  try{
    const token = req.cookies?.session;
    if (token) {
      const sess = await getSession(token);
      tenantId = sess?.selected_tenant_id ?? null;
    }
  }catch{}
  if (!tenantId) {
    const hdr = req.headers['x-tenant-id'] || req.headers['x-tenant'];
    const q = req.query?.tenantId || req.query?.tenant;
    tenantId = Number(hdr || q) || null;
  }
  if (!tenantId) throw Object.assign(new Error('NO_TENANT'), { status:400 });
  return tenantId;
}

const nowUtc = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,19).replace('T',' ');
};

const splitName = (full)=>{
  if (!full) return { first:null, last:null };
  const parts = String(full).trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: null };
  const last = parts.pop();
  return { first: parts.join(' '), last };
};

// --- ensure tables/columns we rely on ---
async function ensureBaseTables(conn){
  await conn.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id BIGINT UNSIGNED NOT NULL,
      source VARCHAR(16) NULL,
      external_id BIGINT UNSIGNED NULL,
      email VARCHAR(191) NULL,
      first_name VARCHAR(120) NULL,
      last_name VARCHAR(120) NULL,
      phone VARCHAR(64) NULL,
      rut VARCHAR(64) NULL,
      state VARCHAR(32) NULL,
      accepts_marketing TINYINT(1) NULL,
      tags TEXT NULL,
      orders_count INT NULL,
      total_spent DECIMAL(14,2) NULL,
      created_at_shopify DATETIME NULL,
      updated_at_shopify DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY ix_customers_tenant (tenant_id),
      KEY ix_customers_email (email),
      KEY ix_customers_rut (rut),
      CONSTRAINT fk_customers_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS customer_addresses (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id BIGINT UNSIGNED NOT NULL,
      customer_id BIGINT UNSIGNED NOT NULL,
      external_id BIGINT UNSIGNED NULL,
      is_default TINYINT(1) NOT NULL DEFAULT 0,
      name VARCHAR(191) NULL,
      company VARCHAR(191) NULL,
      address1 VARCHAR(255) NULL,
      address2 VARCHAR(255) NULL,
      city VARCHAR(120) NULL,
      province VARCHAR(120) NULL,
      province_code VARCHAR(20) NULL,
      country VARCHAR(120) NULL,
      country_code VARCHAR(10) NULL,
      zip VARCHAR(40) NULL,
      phone VARCHAR(64) NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      KEY ix_addr_customer (customer_id),
      KEY ix_addr_tenant (tenant_id),
      CONSTRAINT fk_addr_tenant   FOREIGN KEY (tenant_id)   REFERENCES tenants(id)   ON DELETE CASCADE,
      CONSTRAINT fk_addr_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  // columnas por si el schema ya existía
  await conn.query(`ALTER TABLE customers ADD COLUMN rut VARCHAR(64) NULL`).catch(()=>{});
  await conn.query(`CREATE INDEX ix_customers_tenant_rut ON customers(tenant_id, rut)`).catch(()=>{});
}

/**
 * Condición de match “unificado” entre orders y customers:
 * - mismo tenant
 * - enlazadas por customer_id
 *   O bien (si no hay enlace) email/contact_email de la orden coincide con email del cliente
 * Usamos LOWER() para ser tolerantes a mayúsculas y espacios.
 */
const UNIFIED_MATCH_WHERE = `
  so.tenant_id = c.tenant_id
  AND (
    so.customer_id = c.id
    OR (
      so.customer_id IS NULL
      AND c.email IS NOT NULL
      AND (
        LOWER(COALESCE(so.email,'')) = LOWER(COALESCE(c.email,''))
        OR LOWER(COALESCE(so.contact_email,'')) = LOWER(COALESCE(c.email,''))
      )
    )
  )
`;

export function customersRouter(){
  const r = express.Router();

  // ---------- SEARCH (autocomplete) ----------
  r.get('/search', async (req,res,next)=>{
    try{
      const tenantId = await getTenantId(req);
      const q = String(req.query.q || '').trim().toLowerCase();
      const limit = Math.min(Math.max(Number(req.query.limit||10), 1), 50);

      const conn = await pool.getConnection();
      try{
        await ensureBaseTables(conn);
        const like = `%${q}%`;
        const [rows] = await conn.query(
          `
          SELECT
            c.id, c.email, c.rut, c.first_name, c.last_name,
            COALESCE(NULLIF(CONCAT_WS(' ', c.first_name, c.last_name), ''), a.name, c.email, CONCAT('Cliente #', c.id)) AS display_name,
            COALESCE(NULLIF(c.phone,''), a.phone, '') AS phone_view,
            /* Consolidados unificados (CRM + Shopify) */
            (
              SELECT COUNT(*) FROM sales_orders so
              WHERE ${UNIFIED_MATCH_WHERE}
            ) AS orders_count,
            (
              SELECT COALESCE(SUM(so.total_price),0) FROM sales_orders so
              WHERE ${UNIFIED_MATCH_WHERE}
            ) AS total_spent
          FROM customers c
          LEFT JOIN customer_addresses a
            ON a.customer_id = c.id AND a.is_default = 1
          WHERE c.tenant_id = ?
            AND (
              ? = '' OR
              LOWER(COALESCE(c.email,''))      LIKE ? OR
              LOWER(COALESCE(c.rut,''))        LIKE ? OR
              LOWER(COALESCE(c.first_name,'')) LIKE ? OR
              LOWER(COALESCE(c.last_name,''))  LIKE ? OR
              LOWER(COALESCE(c.phone,''))      LIKE ? OR
              LOWER(COALESCE(a.name,''))       LIKE ?
            )
          ORDER BY c.updated_at DESC, c.id DESC
          LIMIT ?
          `,
          [tenantId, q, like, like, like, like, like, like, limit]
        );
        res.json({ ok:true, items: rows });
      } finally { conn.release(); }
    }catch(e){ next(e); }
  });

  // ---------- CREATE (origen CRM) ----------
  r.post('/', async (req,res,next)=>{
    try{
      const tenantId = await getTenantId(req);
      const body = req.body || {};
      let { first_name, last_name, name, email=null, phone=null, rut=null, address=null } = body;

      if ((!first_name && !last_name) && name){
        const sp = splitName(name);
        first_name = sp.first; last_name = sp.last;
      }
      const now = nowUtc();

      const conn = await pool.getConnection();
      try{
        await ensureBaseTables(conn);
        const [ins] = await conn.execute(
          `INSERT INTO customers
             (tenant_id, source, external_id, email, first_name, last_name, phone, rut, state,
              accepts_marketing, tags, orders_count, total_spent, created_at_shopify, updated_at_shopify, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, ?, ?)`,
          [
            tenantId, 'crm', null, email || null, first_name || null, last_name || null,
            phone || null, rut || null, 'enabled',
            0, null, 0, 0, null, null, now, now
          ]
        );
        const customerId = ins.insertId;

        if (address && typeof address === 'object'){
          const a = address;
          await conn.execute(
            `INSERT INTO customer_addresses
               (tenant_id, customer_id, external_id, is_default, name, company, address1, address2, city, province, province_code,
                country, country_code, zip, phone, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              tenantId, customerId, null, 1,
              a.name || (name || `${first_name||''} ${last_name||''}`.trim()) || null,
              a.company || null, a.address1 || null, a.address2 || null, a.city || null,
              a.province || null, a.province_code || null, a.country || null, a.country_code || null,
              a.zip || null, a.phone || phone || null, now, now
            ]
          );
        }

        const display_name =
          (first_name || last_name) ? `${first_name||''} ${last_name||''}`.trim()
          : (address?.name || email || `Cliente #${customerId}`);

        res.status(201).json({
          ok:true,
          customer: { id: customerId, email, phone: phone || address?.phone || '', rut, display_name, first_name, last_name }
        });
      } finally { conn.release(); }
    }catch(e){ next(e); }
  });

  // ---------- LIST (consolidados CRM+Shopify) ----------
  r.get('/', async (req,res,next)=>{
    try{
      const tenantId = await getTenantId(req);
      const q = String(req.query.q || '').trim().toLowerCase();
      const limit = Math.min(Math.max(Number(req.query.limit||200), 1), 2000);

      const conn = await pool.getConnection();
      try{
        await ensureBaseTables(conn);
        const whereLike = `%${q}%`;
        const [rows] = await conn.query(
          `
          SELECT
            c.id, c.external_id, c.email, c.rut,
            c.first_name, c.last_name,
            COALESCE(NULLIF(CONCAT_WS(' ', c.first_name, c.last_name), ''),
                     a.name,
                     c.email,
                     CONCAT('Cliente #', c.id)) AS display_name,
            COALESCE(NULLIF(c.phone,''), a.phone, '') AS phone_view,

            /* Consolidados unificados (CRM + Shopify) */
            (
              SELECT COUNT(*) FROM sales_orders so
              WHERE ${UNIFIED_MATCH_WHERE}
            ) AS orders_count,
            (
              SELECT COALESCE(SUM(so.total_price),0) FROM sales_orders so
              WHERE ${UNIFIED_MATCH_WHERE}
            ) AS total_spent,

            c.state, c.accepts_marketing, c.updated_at_shopify
          FROM customers c
          LEFT JOIN customer_addresses a
            ON a.customer_id = c.id AND a.is_default = 1
          WHERE c.tenant_id = ?
            AND (
              ? = '' OR
              LOWER(COALESCE(c.email,''))      LIKE ? OR
              LOWER(COALESCE(c.rut,''))        LIKE ? OR
              LOWER(COALESCE(c.first_name,'')) LIKE ? OR
              LOWER(COALESCE(c.last_name,''))  LIKE ? OR
              LOWER(COALESCE(c.phone,''))      LIKE ? OR
              LOWER(COALESCE(a.name,''))       LIKE ?
            )
          ORDER BY c.updated_at_shopify DESC, c.id DESC
          LIMIT ?
          `,
          [tenantId, q, whereLike, whereLike, whereLike, whereLike, whereLike, whereLike, limit]
        );
        res.json({ ok:true, rows });
      } finally { conn.release(); }
    }catch(e){ next(e); }
  });

  // ---------- DETAIL (incluye consolidados) ----------
  r.get('/:id', async (req,res,next)=>{
    try{
      const tenantId = await getTenantId(req);
      const id = Number(req.params.id);
      const conn = await pool.getConnection();
      try{
        await ensureBaseTables(conn);

        const [custRows] = await conn.query(
          `
          SELECT
            c.*,
            (
              SELECT COUNT(*) FROM sales_orders so
              WHERE ${UNIFIED_MATCH_WHERE} AND c.id = ?
            ) AS orders_count,
            (
              SELECT COALESCE(SUM(so.total_price),0) FROM sales_orders so
              WHERE ${UNIFIED_MATCH_WHERE} AND c.id = ?
            ) AS total_spent
          FROM customers c
          WHERE c.id=? AND c.tenant_id=?
          LIMIT 1
          `,
          [id, id, id, tenantId]
        );
        if (!custRows.length) return res.status(404).json({ ok:false, error:'NOT_FOUND' });

        const [addrRows] = await conn.query(
          'SELECT * FROM customer_addresses WHERE customer_id=? ORDER BY is_default DESC, id ASC', [id]
        );

        res.json({ ok:true, customer: custRows[0], addresses: addrRows });
      } finally { conn.release(); }
    }catch(e){ next(e); }
  });

  return r;
}
