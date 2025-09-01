// apps/backend/sales.routes.js
import express from 'express';
import mysql from 'mysql2/promise';
import { getSession } from './db.js';
import { upsertSalesFromShopify } from './sales.shopify.js';

const {
  MYSQL_HOST='127.0.0.1', MYSQL_PORT='3306', MYSQL_USER='root',
  MYSQL_PASSWORD='', MYSQL_DATABASE='andflow'
} = process.env;

const nowUtc = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset()*60000)
    .toISOString().slice(0,19).replace('T',' ');
};

async function tenantIdFromReq(req){
  let t=null;
  try{
    const s=req.cookies?.session;
    if(s){ const sess=await getSession(s); t=sess?.selected_tenant_id??null; }
  }catch{}
  if(!t){
    const h=req.headers['x-tenant-id']||req.headers['x-tenant'];
    const q=req.query?.tenantId||req.query?.tenant;
    t=Number(h||q)||null;
  }
  if(!t){ const e=new Error('NO_TENANT'); e.status=400; throw e; }
  return t;
}

// ---------- bootstrap de tablas unificadas (incluye envío) ----------
async function ensureSalesTables(pool){
  const conn = await pool.getConnection();
  try{
    await conn.query(`
      CREATE TABLE IF NOT EXISTS sales_orders (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        tenant_id BIGINT UNSIGNED NOT NULL,

        origin VARCHAR(16) NOT NULL,
        external_id BIGINT UNSIGNED NULL,
        number VARCHAR(64) NULL,
        customer_id BIGINT UNSIGNED NULL,
        customer_first_name VARCHAR(120) NULL,
        customer_last_name  VARCHAR(120) NULL,
        email VARCHAR(191) NULL,
        contact_email VARCHAR(191) NULL,

        -- envío (snapshots)
        ship_to_name      VARCHAR(160) NULL,
        ship_to_company   VARCHAR(160) NULL,
        ship_to_address1  VARCHAR(255) NULL,
        ship_to_address2  VARCHAR(255) NULL,
        ship_to_city      VARCHAR(120) NULL,
        ship_to_province  VARCHAR(120) NULL,
        ship_to_zip       VARCHAR(40)  NULL,
        ship_to_country   VARCHAR(80)  NULL,
        ship_to_phone     VARCHAR(64)  NULL,

        financial_status   VARCHAR(40) NULL,
        fulfillment_status VARCHAR(40) NULL,

        currency VARCHAR(8) NULL,
        subtotal_price DECIMAL(14,2) NULL,
        total_tax      DECIMAL(14,2) NULL,
        total_price    DECIMAL(14,2) NULL,

        created_at_shop DATETIME NULL,
        updated_at_shop DATETIME NULL,
        created_at      DATETIME NOT NULL,
        updated_at      DATETIME NOT NULL,

        sii_status  VARCHAR(40) NULL,
        sii_trackid VARCHAR(64) NULL,

        UNIQUE KEY ux_sales_origin_ext (tenant_id, origin, external_id),
        KEY ix_sales_tenant (tenant_id),
        CONSTRAINT fk_sales_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        CONSTRAINT fk_sales_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);

    // migraciones tolerantes (para MySQL sin IF NOT EXISTS)
    const add = async (sql)=>{ try{ await conn.query(sql); }catch(_){} };

    await add(`ALTER TABLE sales_orders ADD COLUMN created_at_shop DATETIME NULL`);
    await add(`ALTER TABLE sales_orders ADD COLUMN updated_at_shop DATETIME NULL`);
    await add(`ALTER TABLE sales_orders ADD COLUMN sii_status VARCHAR(40) NULL`);
    await add(`ALTER TABLE sales_orders ADD COLUMN sii_trackid VARCHAR(64) NULL`);

    // columnas de envío
    await add(`ALTER TABLE sales_orders ADD COLUMN ship_to_name VARCHAR(160) NULL`);
    await add(`ALTER TABLE sales_orders ADD COLUMN ship_to_company VARCHAR(160) NULL`);
    await add(`ALTER TABLE sales_orders ADD COLUMN ship_to_address1 VARCHAR(255) NULL`);
    await add(`ALTER TABLE sales_orders ADD COLUMN ship_to_address2 VARCHAR(255) NULL`);
    await add(`ALTER TABLE sales_orders ADD COLUMN ship_to_city VARCHAR(120) NULL`);
    await add(`ALTER TABLE sales_orders ADD COLUMN ship_to_province VARCHAR(120) NULL`);
    await add(`ALTER TABLE sales_orders ADD COLUMN ship_to_zip VARCHAR(40) NULL`);
    await add(`ALTER TABLE sales_orders ADD COLUMN ship_to_country VARCHAR(80) NULL`);
    await add(`ALTER TABLE sales_orders ADD COLUMN ship_to_phone VARCHAR(64) NULL`);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS sales_order_lines (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        tenant_id BIGINT UNSIGNED NOT NULL,
        order_id  BIGINT UNSIGNED NOT NULL,

        origin VARCHAR(16) NOT NULL,
        external_id BIGINT UNSIGNED NULL,

        product_id BIGINT UNSIGNED NULL,
        sku VARCHAR(120) NULL,
        title VARCHAR(255) NOT NULL,

        quantity INT NOT NULL,
        price DECIMAL(14,2) NOT NULL,
        taxable TINYINT(1) NOT NULL DEFAULT 1,
        tax_rate DECIMAL(7,4) NULL,
        line_total DECIMAL(14,2) NOT NULL,

        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,

        KEY ix_sol_order (order_id),
        KEY ix_sol_tenant (tenant_id),
        CONSTRAINT fk_sol_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        CONSTRAINT fk_sol_order  FOREIGN KEY (order_id)  REFERENCES sales_orders(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
  } finally {
    conn.release();
  }
}

// ---------- asegura tabla de direcciones de cliente ----------
async function ensureCustomerAddressTable(conn){
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
}

export function salesRouter(){
  const r = express.Router();

  const pool = mysql.createPool({
    host:MYSQL_HOST, port:Number(MYSQL_PORT), user:MYSQL_USER, password:MYSQL_PASSWORD, database:MYSQL_DATABASE,
    waitForConnections:true, connectionLimit:10, decimalNumbers:true
  });

  ensureSalesTables(pool).catch(err=>console.error('[ensureSalesTables]', err));

  // ---------- Sugerencias de productos ----------
  r.get('/suggest/products', async (req,res,next)=>{
    const conn = await pool.getConnection();
    try{
      const tenantId = await tenantIdFromReq(req);
      const q = String(req.query.q||'').trim();
      const limit = Math.min(Math.max(Number(req.query.limit||10),1),25);

      const like = `%${q}%`;
      const [rows] = await conn.query(
        `
        SELECT pm.id as product_id, pm.sku as sku, pm.nombre as title,
               COALESCE(pm.pvp, pm.pvp_sin_iva, pm.precio_referencia, 0) as price,
               COALESCE(st.stock, 0) as stock
        FROM products_master pm
        LEFT JOIN (
          SELECT product_sku, SUM(qty) AS stock
          FROM inventory_stock WHERE tenant_id=? GROUP BY product_sku
        ) st ON st.product_sku = pm.sku
        WHERE pm.tenant_id=? AND (?='' OR pm.sku LIKE ? OR pm.nombre LIKE ?)
        ORDER BY pm.nombre ASC
        LIMIT ?
        `,
        [tenantId, tenantId, q, like, like, limit]
      );
      res.json({ ok:true, items: rows });
    }catch(e){ next(e); }
    finally{ conn.release(); }
  });

  // ---------- LISTA unificada ----------
  r.get('/', async (req,res,next)=>{
    const conn = await pool.getConnection();
    try{
      const tenantId = await tenantIdFromReq(req);
      const origin = String(req.query.origin||'').toLowerCase();
      const since  = req.query.since ? new Date(req.query.since) : null;
      const q      = String(req.query.q||'').trim().toLowerCase();
      const limit  = Math.min(Math.max(Number(req.query.limit||50),1),250);

      const wh = [`o.tenant_id=?`]; const params = [tenantId];
      if (origin) { wh.push(`o.origin=?`); params.push(origin); }
      if (since)  { wh.push(`o.created_at_shop >= ?`); params.push(since); }
      if (q) {
        wh.push(`(
          LOWER(COALESCE(o.number,'')) LIKE ? OR
          LOWER(COALESCE(o.email,'')) LIKE ? OR
          LOWER(COALESCE(o.contact_email,'')) LIKE ? OR
          LOWER(TRIM(CONCAT(IFNULL(o.customer_first_name,''),' ',IFNULL(o.customer_last_name,'')))) LIKE ? OR
          LOWER(COALESCE(c.email,'')) LIKE ? OR
          LOWER(TRIM(CONCAT(IFNULL(c.first_name,''),' ',IFNULL(c.last_name,'')))) LIKE ?
        )`);
        const like = `%${q}%`;
        params.push(like, like, like, like, like, like);
      }

      const [rows] = await conn.query(
        `
        SELECT
          o.id, o.origin, o.external_id, o.number AS name,
          o.created_at_shop AS created_at, o.updated_at_shop AS updated_at,
          COALESCE(
            NULLIF(TRIM(CONCAT(IFNULL(o.customer_first_name,''),' ',IFNULL(o.customer_last_name,''))), ''),
            NULLIF(TRIM(CONCAT(IFNULL(c.first_name,''),' ',IFNULL(c.last_name,''))), '')
          ) AS customer_name,
          COALESCE(c.email, o.email, o.contact_email) AS email,
          o.financial_status, o.fulfillment_status,
          o.total_price, o.currency,
          o.sii_status, o.sii_trackid
        FROM sales_orders o
        LEFT JOIN customers c ON c.id = o.customer_id
        WHERE ${wh.join(' AND ')}
        ORDER BY o.created_at_shop DESC, o.id DESC
        LIMIT ?
        `,
        [...params, limit]
      );
      res.json({ ok:true, items: rows });
    }catch(e){ next(e); }
    finally{ conn.release(); }
  });

  // ---------- DETALLE ----------
  r.get('/:id', async (req,res,next)=>{
    const conn = await pool.getConnection();
    try{
      const tenantId = await tenantIdFromReq(req);
      const id = Number(req.params.id);

      const [[o]] = await conn.query(
        `SELECT * FROM sales_orders WHERE id=? AND tenant_id=? LIMIT 1`, [id, tenantId]
      );
      if (!o) { const err=new Error('NOT_FOUND'); err.status=404; throw err; }

      const [lines] = await conn.query(
        `SELECT * FROM sales_order_lines WHERE order_id=? ORDER BY id ASC`, [id]
      );
      res.json({ ok:true, order:o, lines });
    }catch(e){ next(e); }
    finally{ conn.release(); }
  });

  // ---- helpers cliente (rut/email) ----
  async function ensureCustomersRutColumn(conn){
    await conn.query(`ALTER TABLE customers ADD COLUMN rut VARCHAR(64) NULL`).catch(()=>{});
    await conn.query(`CREATE INDEX ix_customers_tenant_rut ON customers(tenant_id, rut)`).catch(()=>{});
  }
  async function getCustomerSnapshot(conn, tenantId, customerId){
    const [[c]] = await conn.query(
      `SELECT first_name, last_name, email FROM customers WHERE id=? AND tenant_id=? LIMIT 1`,
      [customerId, tenantId]
    );
    if (!c) return { first:null, last:null, email:null };
    return { first: c.first_name || null, last: c.last_name || null, email: c.email || null };
  }
  async function findOrCreateCustomer(conn, tenantId, customer){
    if (customer?.id) return Number(customer.id);
    await ensureCustomersRutColumn(conn);
    if (customer?.rut) {
      const [[byRut]] = await conn.query(
        `SELECT id FROM customers WHERE tenant_id=? AND rut=? LIMIT 1`,
        [tenantId, String(customer.rut).trim()]
      );
      if (byRut) return byRut.id;
    }
    if (customer?.email) {
      const [[byEmail]] = await conn.query(
        `SELECT id FROM customers WHERE tenant_id=? AND email=? LIMIT 1`,
        [tenantId, String(customer.email).trim().toLowerCase()]
      );
      if (byEmail) return byEmail.id;
    }
    const first = customer?.first_name ?? null;
    const last  = customer?.last_name ?? null;
    const email = customer?.email ? String(customer.email).trim().toLowerCase() : null;
    const phone = customer?.phone ?? null;
    const rut   = customer?.rut ? String(customer.rut).trim() : null;

    try{
      const [r] = await conn.execute(
        `INSERT INTO customers (tenant_id, first_name, last_name, email, phone, rut)
         VALUES (?,?,?,?,?,?)`,
        [tenantId, first, last, email, phone, rut]
      );
      return r.insertId;
    }catch{
      const [r] = await conn.execute(
        `INSERT INTO customers (tenant_id, first_name, last_name, email, phone)
         VALUES (?,?,?,?,?)`,
        [tenantId, first, last, email, phone]
      );
      return r.insertId;
    }
  }

  // ---------- CREAR (CRM) con dirección de envío ----------
  // body: { customer_id?, customer?{first_name,last_name,email,phone,rut},
  //         shipping_address?{name,company,address1,address2,city,province,zip,country,phone},
  //         items:[{product_id?,sku?,title,qty,price,taxable}], currency?, tax_rate? }
  r.post('/', async (req,res,next)=>{
    const conn = await pool.getConnection();
    await conn.beginTransaction();
    try{
      const tenantId = await tenantIdFromReq(req);
      const { customer_id=null, customer=null, shipping_address=null, items=[], currency='CLP', tax_rate=0.19 } = req.body||{};
      if (!Array.isArray(items) || !items.length) { const err=new Error('Sin ítems'); err.status=400; throw err; }

      let customerId = Number(customer_id)||null;
      if (!customerId && customer && typeof customer === 'object'){
        customerId = await findOrCreateCustomer(conn, tenantId, customer);
      }

      let cFirst=null, cLast=null, cEmail=null;
      if (customer && typeof customer === 'object'){
        cFirst = customer.first_name ?? null;
        cLast  = customer.last_name  ?? null;
        cEmail = customer.email ? String(customer.email).trim().toLowerCase() : null;
      }
      if ((!cFirst && !cLast && !cEmail) && customerId){
        const snap = await getCustomerSnapshot(conn, tenantId, customerId);
        cFirst = snap.first; cLast = snap.last; cEmail = snap.email;
      }

      const ship = shipping_address || {};
      const ship_name = ship.name || [cFirst,cLast].filter(Boolean).join(' ') || null;

      const ts = nowUtc();

      // Aseguramos tabla de direcciones y guardamos default si aplica
      await ensureCustomerAddressTable(conn);
      if (customerId && (ship.address1 || ship.city || ship.phone)) {
        const [[defAddr]] = await conn.query(
          `SELECT id FROM customer_addresses WHERE customer_id=? AND is_default=1 LIMIT 1`,
          [customerId]
        );
        if (!defAddr) {
          await conn.execute(
            `INSERT INTO customer_addresses
              (tenant_id, customer_id, external_id, is_default, name, company,
               address1, address2, city, province, province_code, country, country_code, zip, phone,
               created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              tenantId, customerId, null, 1,
              ship_name || null, ship.company || null,
              ship.address1 || null, ship.address2 || null,
              ship.city || null, ship.province || null, null,
              ship.country || null, null,
              ship.zip || null, ship.phone || null,
              ts, ts
            ]
          );
        }
      }

      const [r1] = await conn.execute(
        `INSERT INTO sales_orders
         (tenant_id, origin, external_id, number, customer_id, customer_first_name, customer_last_name, email, contact_email,
          ship_to_name, ship_to_company, ship_to_address1, ship_to_address2, ship_to_city, ship_to_province, ship_to_zip, ship_to_country, ship_to_phone,
          currency, financial_status, fulfillment_status,
          subtotal_price, total_tax, total_price,
          created_at_shop, updated_at_shop, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          tenantId,'crm',null,'PENDIENTE',customerId,cFirst,cLast,cEmail,null,
          ship_name, ship.company||null, ship.address1||null, ship.address2||null, ship.city||null, ship.province||null, ship.zip||null, ship.country||null, ship.phone||null,
          currency,'pending','unfulfilled',
          0,0,0,
          ts, ts, ts, ts
        ]
      );
      const orderId = r1.insertId;

      let subtotal=0, tax=0;
      for (const it of items){
        const qty = Math.max(1, Number(it.qty||0));
        const price = Number(it.price||0);
        const lineTotal = qty*price;
        subtotal += lineTotal;
        const isTaxable = it.taxable !== false;
        if (isTaxable) tax += lineTotal*Number(tax_rate||0);

        await conn.execute(
          `INSERT INTO sales_order_lines
           (tenant_id, order_id, origin, external_id, product_id, sku, title, quantity, price, taxable, tax_rate, line_total, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [tenantId, orderId, 'crm', null, it.product_id||null, it.sku||null, it.title||'Producto',
           qty, price, isTaxable?1:0, isTaxable?tax_rate:null, lineTotal, ts, ts]
        );
      }
      const total = subtotal + tax;

      await conn.execute(
        `UPDATE sales_orders
         SET number=?, subtotal_price=?, total_tax=?, total_price=?, updated_at_shop=?, updated_at=?
         WHERE id=?`,
        [`C-${orderId}`, subtotal, tax, total, ts, ts, orderId]
      );

      await conn.commit();
      res.json({ ok:true, id:orderId, number:`C-${orderId}` });
    }catch(e){
      try{ await conn.rollback(); }catch{}
      next(e);
    } finally { conn.release(); }
  });

  // ---------- Mock boleta ----------
  r.post('/:id/boleta/mock', async (req,res,next)=>{
    const conn = await pool.getConnection();
    try{
      const tenantId = await tenantIdFromReq(req);
      const id = Number(req.params.id);

      const [[o]] = await conn.query(`SELECT id FROM sales_orders WHERE id=? AND tenant_id=? LIMIT 1`, [id, tenantId]);
      if (!o) { const err=new Error('NOT_FOUND'); err.status=404; throw err; }

      const ts = nowUtc();
      const trackid = 'MOCK-' + Math.random().toString(36).slice(2,10).toUpperCase();

      await conn.execute(
        `UPDATE sales_orders SET sii_status=?, sii_trackid=?, updated_at=? WHERE id=?`,
        ['enviado', trackid, ts, id]
      );

      res.json({ ok:true, trackid });
    }catch(e){ next(e); }
    finally{ conn.release(); }
  });

  // ---------- SYNC Shopify ----------
  r.post('/sync/shopify', async (req,res,next)=>{
    try{
      const since = req.query.since || req.body?.since || null;
      const out = await upsertSalesFromShopify(req, { since });
      res.json(out);
    }catch(e){ next(e); }
  });

  // ---------- Resolver id/number/external/gid → id interno ----------
  r.get('/resolve/:any', async (req,res,next)=>{
    const conn = await pool.getConnection();
    try{
      const tenantId = await tenantIdFromReq(req);
      const any = String(req.params.any || '').trim();
      const plainDigits = any.replace(/\D+/g, '');
      if (/^\d+$/.test(plainDigits)) {
        const [[byId]] = await conn.query(
          `SELECT id, origin FROM sales_orders WHERE id=? AND tenant_id=? LIMIT 1`,
          [Number(plainDigits), tenantId]
        );
        if (byId) return res.json({ ok:true, id:byId.id, origin:byId.origin });
      }
      const [[byNumber]] = await conn.query(
        `SELECT id, origin FROM sales_orders
         WHERE tenant_id=? AND (
           number=? OR
           REPLACE(number,'#','')=? OR
           REPLACE(number,'C-','')=? )
         LIMIT 1`,
        [tenantId, any, plainDigits, plainDigits]
      );
      if (byNumber) return res.json({ ok:true, id:byNumber.id, origin:byNumber.origin });

      if (plainDigits) {
        const [[byExternal]] = await conn.query(
          `SELECT id, origin FROM sales_orders
           WHERE tenant_id=? AND origin='shopify' AND external_id=? LIMIT 1`,
          [tenantId, Number(plainDigits)]
        );
        if (byExternal) return res.json({ ok:true, id:byExternal.id, origin:byExternal.origin });
      }
      const mg = any.match(/Order\/(\d+)/i);
      if (mg) {
        const [[byGid]] = await conn.query(
          `SELECT id, origin FROM sales_orders
           WHERE tenant_id=? AND origin='shopify' AND external_id=? LIMIT 1`,
          [tenantId, Number(mg[1])]
        );
        if (byGid) return res.json({ ok:true, id:byGid.id, origin:byGid.origin });
      }

      res.status(404).json({ ok:false, error:'NOT_FOUND' });
    }catch(e){ next(e); }
    finally{ conn.release(); }
  });

  return r;
}
