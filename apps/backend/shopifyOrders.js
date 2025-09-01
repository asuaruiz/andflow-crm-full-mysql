import mysql from 'mysql2/promise';
import { shopifyFetch } from './shopifyService.js';

export async function listShopifyOrders(req, { status='any', created_at_min=null, limit=20 } = {}) {
  const qs = new URLSearchParams();
  qs.set('status', status);
  qs.set('order', 'created_at desc');
  qs.set('limit', String(Math.min(Math.max(limit,1),250)));
  if (created_at_min) qs.set('created_at_min', new Date(created_at_min).toISOString());
  qs.set('fields', [
    'id','name','order_number','created_at','total_price','currency',
    'financial_status','fulfillment_status',
    'email','contact_email','customer','shipping_address','billing_address'
  ].join(','));
  const data = await shopifyFetch(req, `/orders.json?${qs.toString()}`, { method:'GET' });
  return data.orders || [];
}


export async function getShopifyOrder(req, id){
  const data = await shopifyFetch(req, `/orders/${id}.json`, { method:'GET' });
  return data.order;
}

export async function ensureShopifyOrderTables(pool){
  const conn = await pool.getConnection();
  try{
    await conn.query(`
      CREATE TABLE IF NOT EXISTS shopify_orders (
        id BIGINT PRIMARY KEY,
        name VARCHAR(32),
        email VARCHAR(120),
        created_at DATETIME,
        currency VARCHAR(8),
        total_price DECIMAL(14,2),
        financial_status VARCHAR(32),
        fulfillment_status VARCHAR(32),
        raw_json LONGTEXT,
        imported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS shopify_order_lines (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        order_id BIGINT NOT NULL,
        line_id BIGINT,
        sku VARCHAR(64),
        title VARCHAR(255),
        quantity INT,
        price DECIMAL(14,2),
        FOREIGN KEY (order_id) REFERENCES shopify_orders(id) ON DELETE CASCADE,
        INDEX ix_order (order_id),
        INDEX ix_sku (sku)
      ) ENGINE=InnoDB;
    `);
  } finally {
    conn.release();
  }
}

export async function saveOrder(pool, order){
  const conn = await pool.getConnection();
  try{
    await conn.beginTransaction();
    await conn.query(
      `REPLACE INTO shopify_orders (id, name, email, created_at, currency, total_price, financial_status, fulfillment_status, raw_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        order.id, order.name, order.email || null,
        order.created_at ? new Date(order.created_at).toISOString().slice(0,19).replace('T',' ') : null,
        order.currency || 'CLP',
        Number(order.total_price || 0),
        order.financial_status || null,
        order.fulfillment_status || null,
        JSON.stringify(order),
      ]
    );
    await conn.query(`DELETE FROM shopify_order_lines WHERE order_id=?`, [order.id]);
    if (Array.isArray(order.line_items) && order.line_items.length) {
      const values = [];
      for (const li of order.line_items) {
        values.push(order.id, li.id || null, li.sku || null, li.title || null, Number(li.quantity||0), Number(li.price||0));
      }
      await conn.query(
        `INSERT INTO shopify_order_lines (order_id, line_id, sku, title, quantity, price) VALUES ` +
        order.line_items.map(()=>`(?, ?, ?, ?, ?, ?)`).join(', '),
        values
      );
    }
    await conn.commit();
  } catch(e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function syncOrders(req, { pool, since=null, limit=50 } = {}){
  await ensureShopifyOrderTables(pool);
  const orders = await listShopifyOrders(req, { created_at_min: since, limit });
  for (const o of orders) {
    await saveOrder(pool, o);
  }
  return { ok:true, count: orders.length };
}
