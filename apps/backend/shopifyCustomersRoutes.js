// apps/backend/shopifyCustomersRoutes.js
import express from 'express';
import mysql from 'mysql2/promise';
import { syncCustomers, ensureCustomerTables, saveCustomer } from './shopifyCustomers.js';
import { shopifyFetch } from './shopifyService.js'; // 👈 FALTA ESTE IMPORT


const {
  MYSQL_HOST='127.0.0.1', MYSQL_PORT='3306', MYSQL_USER='root',
  MYSQL_PASSWORD='', MYSQL_DATABASE='andflow'
} = process.env;

export function shopifyCustomersRouter(){
  const r = express.Router();

  const pool = mysql.createPool({
    host: MYSQL_HOST, port: Number(MYSQL_PORT),
    user: MYSQL_USER, password: MYSQL_PASSWORD, database: MYSQL_DATABASE,
    waitForConnections: true, connectionLimit: 10
  });

  // crea tablas si no existen
  r.get('/ensure', async (req,res,next)=>{
    try{ await ensureCustomerTables(pool); res.json({ ok:true }); }
    catch(e){ next(e); }
  });

  // pull desde Shopify -> DB local (por tenant actual)
  r.post('/sync', async (req,res,next)=>{
    try{
      const since = req.query.since || req.body?.since || null;
      const out = await syncCustomers(req, { pool, since });
      res.json(out);
    }catch(e){ next(e); }
  });

  // (Opcional) webhook simple customers/create|update (sin HMAC)
  r.post('/webhook', async (req,res,next)=>{
    try{
      const tenantId = Number(req.query.tenantId || req.headers['x-tenant-id'] || req.headers['x-tenant']) || null;
      if (!tenantId) return res.status(400).json({ ok:false, error:'NO_TENANT' });
      const body = req.body;
      if (!body || !body.id) return res.status(400).json({ ok:false, error:'NO_BODY' });
      await ensureCustomerTables(pool);
      await saveCustomer(pool, tenantId, body);
      res.json({ ok:true });
    }catch(e){ next(e); }
  });
  r.get('/debug-one', async (req, res, next) => {
  try {
    const qs = new URLSearchParams();
    qs.set('limit', '1'); // sin "fields": queremos ver default_address completo
    const data = await shopifyFetch(req, `/customers.json?${qs.toString()}`, { method: 'GET' });
    res.json({ ok: true, sample: (data.customers || [])[0] || null });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, error: e.message, body: e.body || null });
  }
});
r.get('/debug-scopes', async (req,res,next)=>{
  try{
    // 👇 ruta correcta (OAuth, NO versionada)
    const data = await shopifyFetch(req, '/oauth/access_scopes.json', { method:'GET' });
    res.json({ ok:true, scopes: data.access_scopes || [] });
  }catch(e){
    res.status(e.status||500).json({ ok:false, error:e.message, body:e.body||null });
  }
});

  return r;
}
