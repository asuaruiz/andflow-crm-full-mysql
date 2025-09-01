// apps/backend/sales.shopify.js
import { shopifyFetch } from './shopifyService.js';
import mysql from 'mysql2/promise';
import { getSession } from './db.js';

const {
  MYSQL_HOST='127.0.0.1', MYSQL_PORT='3306', MYSQL_USER='root',
  MYSQL_PASSWORD='', MYSQL_DATABASE='andflow'
} = process.env;

function now(){ return new Date(); }

async function resolveTenantId(req){
  let tenantId=null;
  try{ const t=req.cookies?.session; if(t){ const s=await getSession(t); tenantId=s?.selected_tenant_id??null; } }catch{}
  if(!tenantId){ const h=req.headers['x-tenant-id']||req.headers['x-tenant']; const q=req.query?.tenantId||req.query?.tenant;
    tenantId = Number(h||q)||null;
  }
  if(!tenantId){ const e=new Error('NO_TENANT'); e.status=400; throw e; }
  return tenantId;
}

export async function listShopifyOrders(req, { updated_at_min=null, limit=250, page_info=null } = {}) {
  const qs = new URLSearchParams();
  if (page_info) {
    qs.set('page_info', page_info);
  } else {
    qs.set('limit', String(Math.min(Math.max(limit,1),250)));
    if (updated_at_min) qs.set('updated_at_min', new Date(updated_at_min).toISOString());
    qs.set('order', 'updated_at desc');
    qs.set('status', 'any');
  }
  const data = await shopifyFetch(req, `/orders.json?${qs.toString()}`, { method: 'GET' });
  const link = data.__headers?.link || '';
  const m = /<[^>]+[?&]page_info=([^&>]+)[^>]*>\s*;\s*rel="next"/i.exec(link);
  const nextPageInfo = m ? decodeURIComponent(m[1]) : null;
  return { orders: data.orders || [], nextPageInfo };
}

export async function upsertSalesFromShopify(req, { since=null, maxPages=20 } = {}){
  const pool = mysql.createPool({
    host:MYSQL_HOST, port:Number(MYSQL_PORT), user:MYSQL_USER, password:MYSQL_PASSWORD, database:MYSQL_DATABASE,
    waitForConnections:true, connectionLimit:10
  });
  const tenantId = await resolveTenantId(req);
  let pageInfo=null, count=0;

  const conn = await pool.getConnection();
  try{
    for(let i=0;i<maxPages;i++){
      const { orders, nextPageInfo } = await listShopifyOrders(req, { updated_at_min: since, page_info: pageInfo });
      if (!orders.length) break;

      for (const o of orders){
        await conn.beginTransaction();

        // nombre/email (con PII ya habilitado)
        const cf = o.customer?.first_name || o.shipping_address?.first_name || o.billing_address?.first_name || null;
        const cl = o.customer?.last_name  || o.shipping_address?.last_name  || o.billing_address?.last_name  || null;
        const email = o.email || o.contact_email || o.customer?.email || null;

        const nowTs = now();
        // UPSERT cabecera
        await conn.execute(
          `INSERT INTO sales_orders
           (tenant_id, origin, external_id, number, currency, financial_status, fulfillment_status,
            subtotal_price, total_tax, total_price, email, contact_email,
            customer_id, customer_first_name, customer_last_name,
            created_at_shop, updated_at_shop, raw_json, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE
             number=VALUES(number),
             currency=VALUES(currency),
             financial_status=VALUES(financial_status),
             fulfillment_status=VALUES(fulfillment_status),
             subtotal_price=VALUES(subtotal_price),
             total_tax=VALUES(total_tax),
             total_price=VALUES(total_price),
             email=VALUES(email), contact_email=VALUES(contact_email),
             customer_first_name=VALUES(customer_first_name),
             customer_last_name=VALUES(customer_last_name),
             created_at_shop=VALUES(created_at_shop),
             updated_at_shop=VALUES(updated_at_shop),
             raw_json=VALUES(raw_json),
             updated_at=VALUES(updated_at)`,
          [
            tenantId, 'shopify', o.id,
            o.name || `#${o.order_number}`, o.currency || o.presentment_currency || 'CLP',
            o.financial_status || null, o.fulfillment_status || null,
            o.subtotal_price ?? null, o.total_tax ?? null, o.total_price ?? null,
            email, o.contact_email || null,
            null, cf, cl,
            o.created_at ? new Date(o.created_at) : null,
            o.updated_at ? new Date(o.updated_at) : null,
            JSON.stringify(o), nowTs, nowTs
          ]
        );

        // id interno
        const [[row]] = await conn.query(
          `SELECT id FROM sales_orders WHERE tenant_id=? AND origin='shopify' AND external_id=? LIMIT 1`,
          [tenantId, o.id]
        );
        const orderId = row.id;

        // líneas: borrado e inserción (simple y seguro)
        await conn.execute(`DELETE FROM sales_order_lines WHERE tenant_id=? AND order_id=?`, [tenantId, orderId]);

        for (const li of (o.line_items||[])) {
          const rate = (li.tax_lines && li.tax_lines[0]?.rate) ?? null;
          const qty = Number(li.quantity||0);
          const price = Number(li.price||0);
          await conn.execute(
            `INSERT INTO sales_order_lines
             (tenant_id, order_id, origin, external_id, product_id, sku, title, quantity, price, taxable, tax_rate, line_total, raw_json, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              tenantId, orderId, 'shopify', li.id || null, null,
              li.sku || null, li.title || 'Producto', qty, price,
              li.taxable !== false ? 1 : 0, rate, qty*price,
              JSON.stringify(li), nowTs, nowTs
            ]
          );
        }

        await conn.commit();
        count++;
      }

      if (!nextPageInfo) break;
      pageInfo = nextPageInfo;
    }
  } catch (e) {
    try{ await conn.rollback(); }catch{}
    throw e;
  } finally {
    conn.release();
    await pool.end();
  }
  return { ok:true, count };
}
