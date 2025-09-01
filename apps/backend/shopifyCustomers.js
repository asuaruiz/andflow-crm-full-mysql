// apps/backend/shopifyCustomers.js
import mysql from 'mysql2/promise';
import { shopifyFetch } from './shopifyService.js';

/** Shopify REST: lista clientes con paginación por page_info */
export async function listShopifyCustomers(req, { updated_at_min=null, limit=250, page_info=null } = {}) {
  const qs = new URLSearchParams();
  if (page_info) {
    qs.set('page_info', page_info);
  } else {
    qs.set('limit', String(Math.min(Math.max(limit,1),250)));
    if (updated_at_min) qs.set('updated_at_min', new Date(updated_at_min).toISOString());
    qs.set('order', 'updated_at desc');
  }

  // 👇 Importante: NO usar `fields` para no recortar nested fields de addresses
  const data = await shopifyFetch(req, `/customers.json?${qs.toString()}`, { method: 'GET' });

  const linkHeader = (data.__headers && data.__headers.link) ? data.__headers.link : null;
  let nextPageInfo = null;
  if (linkHeader) {
    const m = /<[^>]+[?&]page_info=([^&>]+)[^>]*>\s*;\s*rel="next"/i.exec(linkHeader);
    if (m) nextPageInfo = decodeURIComponent(m[1]);
  }
  return { customers: data.customers || [], nextPageInfo };
}


export async function ensureCustomerTables(pool){
  const conn = await pool.getConnection();
  try{
    await conn.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        tenant_id BIGINT UNSIGNED NOT NULL,
        source VARCHAR(32) NOT NULL DEFAULT 'shopify',
        external_id BIGINT UNSIGNED NULL,
        email VARCHAR(191) NULL,
        first_name VARCHAR(120) NULL,
        last_name VARCHAR(120) NULL,
        phone VARCHAR(64) NULL,
        state VARCHAR(50) NULL,
        accepts_marketing TINYINT(1) NOT NULL DEFAULT 0,
        tags TEXT NULL,
        orders_count INT NULL,
        total_spent DECIMAL(14,2) NULL,
        created_at_shopify DATETIME NULL,
        updated_at_shopify DATETIME NULL,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        UNIQUE KEY ux_tenant_ext (tenant_id, external_id),
        KEY ix_tenant_email (tenant_id, email),
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
        address1 VARCHAR(191) NULL,
        address2 VARCHAR(191) NULL,
        city VARCHAR(120) NULL,
        province VARCHAR(120) NULL,
        province_code VARCHAR(10) NULL,
        country VARCHAR(120) NULL,
        country_code VARCHAR(10) NULL,
        zip VARCHAR(20) NULL,
        phone VARCHAR(64) NULL,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        KEY ix_customer (customer_id),
        CONSTRAINT fk_addr_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
        CONSTRAINT fk_addr_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
  } finally { conn.release(); }
}

function nowUtc(){
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,19).replace('T',' ');
}

function splitName(full){
  if (!full) return { first:null, last:null };
  const parts = String(full).trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: null };
  const last = parts.pop();
  return { first: parts.join(' '), last };
}

export async function saveCustomer(pool, tenantId, c){
  const conn = await pool.getConnection();
  try{
    const now = nowUtc();

    // -------- Derivar nombre y teléfono ----------
    let first = (c.first_name || '').trim() || null;
    let last  = (c.last_name  || '').trim() || null;
    let phone = (c.phone      || '').trim() || null;

    const da =
      c.default_address ||
      (Array.isArray(c.addresses) ? (c.addresses.find(a => a?.default) || c.addresses[0]) : null);

    if ((!first && !last) && da?.name) {
      const n = splitName(da.name);
      first = n.first || first;
      last  = n.last  || last;
    }
    if (!phone && da?.phone) phone = String(da.phone).trim() || null;

    const [r] = await conn.execute(
      `INSERT INTO customers
        (tenant_id, source, external_id, email, first_name, last_name, phone, state, accepts_marketing, tags,
         orders_count, total_spent, created_at_shopify, updated_at_shopify, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         email=VALUES(email), first_name=VALUES(first_name), last_name=VALUES(last_name),
         phone=VALUES(phone), state=VALUES(state), accepts_marketing=VALUES(accepts_marketing),
         tags=VALUES(tags), orders_count=VALUES(orders_count), total_spent=VALUES(total_spent),
         updated_at_shopify=VALUES(updated_at_shopify), updated_at=VALUES(updated_at)`,
      [
        tenantId, 'shopify', c.id,
        c.email || null, first, last, phone, c.state || null,
        c.accepts_marketing ? 1 : 0, (c.tags || '') || null,
        c.orders_count ?? null, c.total_spent != null ? Number(c.total_spent) : null,
        c.created_at ? new Date(c.created_at) : null,
        c.updated_at ? new Date(c.updated_at) : null,
        now, now
      ]
    );

    const customerId =
      r.insertId ||
      (await conn.query('SELECT id FROM customers WHERE tenant_id=? AND external_id=? LIMIT 1', [tenantId, c.id]))[0][0]?.id;

    // Direcciones (reset simple)
    await conn.execute('DELETE FROM customer_addresses WHERE tenant_id=? AND customer_id=?', [tenantId, customerId]);

    const addrList = Array.isArray(c.addresses) ? c.addresses : (c.default_address ? [c.default_address] : []);
    for (const a of addrList){
      await conn.execute(
        `INSERT INTO customer_addresses
         (tenant_id, customer_id, external_id, is_default, name, company, address1, address2, city, province, province_code,
          country, country_code, zip, phone, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          tenantId, customerId, a.id || null,
          (c.default_address && a.id && c.default_address.id === a.id) ? 1 : 0,
          a.name || null, a.company || null, a.address1 || null, a.address2 || null,
          a.city || null, a.province || null, a.province_code || null,
          a.country || null, a.country_code || null, a.zip || null, a.phone || null,
          now, now
        ]
      );
    }
    return { ok:true, customerId };
  } finally { conn.release(); }
}

export async function syncCustomers(req, { pool, since=null, maxPages=20 } = {}){
  await ensureCustomerTables(pool);
  let pageInfo = null, count = 0;
  for (let i=0; i<maxPages; i++){
    const { customers, nextPageInfo } = await listShopifyCustomers(req, { updated_at_min: since, page_info: pageInfo });
    if (!customers.length) break;
    const tenantId = await resolveTenantIdFromReq(req, pool);
    for (const c of customers){ await saveCustomer(pool, tenantId, c); count++; }
    if (!nextPageInfo) break;
    pageInfo = nextPageInfo;
  }
  return { ok:true, count };
}

// Resolver tenant desde cookie de sesión o headers/query
async function resolveTenantIdFromReq(req, pool){
  const token = req.cookies?.session;
  if (!token) {
    const h = req.headers['x-tenant-id'] || req.headers['x-tenant'];
    const q = req.query?.tenantId || req.query?.tenant;
    const t = Number(h || q) || null;
    if (!t) throw Object.assign(new Error('NO_TENANT'), { status:400 });
    return t;
  }
  const conn = await pool.getConnection();
  try{
    const [rows] = await conn.execute('SELECT selected_tenant_id FROM sessions WHERE token=? LIMIT 1', [token]);
    const tenantId = rows?.[0]?.selected_tenant_id || null;
    if (!tenantId) throw Object.assign(new Error('NO_TENANT'), { status:400 });
    return tenantId;
  } finally { conn.release(); }
}
