// apps/backend/inventory.picking.routes.js
import express from 'express';
import mysql from 'mysql2/promise';
import { getSession, getUserWithRolesAndPerms } from './db.js';

export function inventoryPickingRouter() {
  const r = express.Router();

  const getConn = () =>
    mysql.createConnection({
      host: process.env.MYSQL_HOST,
      port: Number(process.env.MYSQL_PORT),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      // decimalNumbers ayuda a no recibir strings en DECIMAL
      decimalNumbers: true,
    });

  async function withTenant(req) {
    const token = req.cookies?.session;
    const sess = await getSession(token);
    const tenantId = sess?.selected_tenant_id ?? null;
    return { sess, tenantId };
  }

  async function requirePerm(req, res, next, needed) {
    try {
      const { sess, tenantId } = await withTenant(req);
      if (!sess || !tenantId) return res.status(401).json({ ok:false, error:'TENANT_REQUIRED' });
      const me = await getUserWithRolesAndPerms({ userId: sess.user_id, tenantId });
      const allowed = me?.isSuperAdmin || needed.some(p => me?.permissions?.includes(p));
      if (!allowed) return res.status(403).json({ ok:false, error:'FORBIDDEN' });
      req.tenantId = tenantId;
      req.me = me;
      next();
    } catch (e) { next(e); }
  }

  const canView   = (req, res, next) => requirePerm(req, res, next, ['inventory.sessions.view','inventory.sessions.manage','inventory.sessions.commit']);
  const canManage = (req, res, next) => requirePerm(req, res, next, ['inventory.sessions.manage','inventory.sessions.commit']);
  const canCommit = (req, res, next) => requirePerm(req, res, next, ['inventory.sessions.commit']);

  // Helpers
  const isLikelyEAN = (code) => /^\d{8,14}$/.test(String(code || '').trim());

  // LISTAR sesiones del tenant (últimas 60d)
  r.get('/sessions', canView, async (req, res, next) => {
    try {
      const conn = await getConn();
      const [rows] = await conn.query(
        `SELECT id, type, status, reference, location_code, created_by, started_at, closed_at
         FROM inventory_sessions
         WHERE tenant_id=? AND started_at >= (NOW() - INTERVAL 60 DAY)
         ORDER BY id DESC`,
        [req.tenantId]
      );
      await conn.end();
      res.json({ ok:true, items: rows });
    } catch (e) { next(e); }
  });

  // CREAR sesión
  r.post('/sessions', canManage, async (req, res, next) => {
    try {
      const { type, reference, location_code } = req.body || {};
      if (!['count','in','out'].includes(type || '')) return res.status(400).json({ ok:false, error:'TYPE_INVALID' });

      const conn = await getConn();
      const [ins] = await conn.query(
        `INSERT INTO inventory_sessions
           (tenant_id, type, status, reference, location_code, created_by, started_at)
         VALUES (?,?,?,?,?,?,NOW())`,
        [req.tenantId, type, 'open', reference?.trim() || null, (location_code||'')?.trim() || null, req.me.id]
      );
      const [[row]] = await conn.query(
        `SELECT id, type, status, reference, location_code, created_by, started_at, closed_at
           FROM inventory_sessions WHERE id=?`, [ins.insertId]
      );
      await conn.end();
      res.json({ ok:true, item: row });
    } catch (e) { next(e); }
  });

  // GET sesión + líneas
  r.get('/sessions/:id', canView, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const conn = await getConn();
      const [[s]] = await conn.query(
        `SELECT id, tenant_id, type, status, reference, location_code, created_by, started_at, closed_at
           FROM inventory_sessions WHERE id=?`, [id]
      );
      if (!s || s.tenant_id !== req.tenantId) { await conn.end(); return res.status(404).json({ ok:false, error:'NOT_FOUND' }); }

      const [lines] = await conn.query(
        `SELECT l.id, l.sku, l.ean, l.counted_qty, l.unit_cost,
                pm.nombre
         FROM inventory_session_lines l
         LEFT JOIN products_master pm ON pm.tenant_id=? AND pm.sku=l.sku
         WHERE l.session_id=?
         ORDER BY l.id ASC`,
        [req.tenantId, id]
      );
      await conn.end();
      res.json({ ok:true, session: s, lines });
    } catch (e) { next(e); }
  });

  // SCAN (por SKU o EAN) -> upsert línea (crea placeholder si no existe)
  r.post('/sessions/:id/scan', canManage, async (req, res, next) => {
    let conn;
    try {
      const id = Number(req.params.id);
      let { code, qty, unit_cost } = req.body || {};
      code = String(code || '').trim();
      qty = Number(qty ?? 1);
      if (!code || !qty || qty <= 0) return res.status(400).json({ ok:false, error:'CODE_OR_QTY_INVALID' });

      conn = await getConn();

      const [[s]] = await conn.query(`SELECT * FROM inventory_sessions WHERE id=?`, [id]);
      if (!s || s.tenant_id !== req.tenantId) { await conn.end(); return res.status(404).json({ ok:false, error:'NOT_FOUND' }); }
      if (s.status !== 'open') { await conn.end(); return res.status(400).json({ ok:false, error:'SESSION_CLOSED' }); }

      // 1) Buscar en maestra por SKU o EAN
      let [[p]] = await conn.query(
        `SELECT tenant_id, sku, ean, nombre, costo_neto
           FROM products_master
          WHERE tenant_id=? AND (sku=? OR ean=?)
          LIMIT 1`,
        [req.tenantId, code, code]
      );

      // 2) Si no existe, crear placeholder
      if (!p) {
        const placeholderSku = code; // usamos el código tal cual como SKU
        const placeholderEan = isLikelyEAN(code) ? code : null;
        await conn.query(
          `INSERT INTO products_master
             (tenant_id, sku, ean, nombre, costo_neto, created_at, updated_at)
           VALUES (?,?,?,?,NULL,NOW(),NOW())
           ON DUPLICATE KEY UPDATE
             ean=COALESCE(VALUES(ean), ean),
             updated_at=VALUES(updated_at)`,
          [req.tenantId, placeholderSku, placeholderEan, 'Nuevo sin catalogar']
        );
        const [[p2]] = await conn.query(
          `SELECT tenant_id, sku, ean, nombre, costo_neto
             FROM products_master
            WHERE tenant_id=? AND sku=?
            LIMIT 1`,
          [req.tenantId, placeholderSku]
        );
        p = p2;
      }

      const baseCost =
        unit_cost != null && unit_cost !== ''
          ? Number(unit_cost)
          : (p.costo_neto != null ? Number(p.costo_neto) : null);

      // 3) Upsert de la línea
      // Requiere índice único: UNIQUE KEY ux_session_sku (session_id, sku)
      // Si no lo tienes, dejamos además el fallback select+update.
      try {
        await conn.query(
          `INSERT INTO inventory_session_lines (session_id, sku, ean, counted_qty, unit_cost)
           VALUES (?,?,?,?,?)
           ON DUPLICATE KEY UPDATE
             counted_qty = inventory_session_lines.counted_qty + VALUES(counted_qty),
             unit_cost = COALESCE(VALUES(unit_cost), inventory_session_lines.unit_cost)`,
          [id, p.sku, p.ean ?? null, qty, baseCost]
        );
      } catch {
        // Fallback (por si no existe el índice único)
        const [[existing]] = await conn.query(
          `SELECT id, counted_qty FROM inventory_session_lines WHERE session_id=? AND sku=?`,
          [id, p.sku]
        );
        if (existing) {
          await conn.query(
            `UPDATE inventory_session_lines
                SET counted_qty = counted_qty + ?, unit_cost = COALESCE(?, unit_cost)
              WHERE id=?`,
            [qty, baseCost, existing.id]
          );
        } else {
          await conn.query(
            `INSERT INTO inventory_session_lines (session_id, sku, ean, counted_qty, unit_cost)
             VALUES (?,?,?,?,?)`,
            [id, p.sku, p.ean ?? null, qty, baseCost]
          );
        }
      }

      const [[line]] = await conn.query(
        `SELECT l.id, l.sku, l.ean, l.counted_qty, l.unit_cost, pm.nombre
           FROM inventory_session_lines l
           LEFT JOIN products_master pm ON pm.tenant_id=? AND pm.sku=l.sku
          WHERE l.session_id=? AND l.sku=?`,
        [req.tenantId, id, p.sku]
      );
      await conn.end();
      res.json({ ok:true, line });
    } catch (e) {
      try { await conn?.end(); } catch {}
      next(e);
    }
  });

  // COMMIT
  r.post('/sessions/:id/commit', canCommit, async (req, res, next) => {
    const id = Number(req.params.id);
    const now = new Date();
    let conn;
    try {
      conn = await getConn();
      await conn.beginTransaction();

      const [[s]] = await conn.query(`SELECT * FROM inventory_sessions WHERE id=? FOR UPDATE`, [id]);
      if (!s || s.tenant_id !== req.tenantId) { throw new Error('NOT_FOUND'); }
      if (s.status !== 'open') { throw new Error('SESSION_CLOSED'); }

      const [lines] = await conn.query(
        `SELECT l.*, pm.costo_neto
           FROM inventory_session_lines l
           LEFT JOIN products_master pm ON pm.tenant_id=? AND pm.sku=l.sku
          WHERE l.session_id=?`,
        [req.tenantId, id]
      );

      const upsertStock = async (sku, newQty, newAvg, lastIn) => {
        await conn.query(
          `INSERT INTO inventory_stock (tenant_id, sku, onhand_qty, avg_cost, last_in_cost, updated_at)
           VALUES (?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE
             onhand_qty=VALUES(onhand_qty),
             avg_cost=VALUES(avg_cost),
             last_in_cost=VALUES(last_in_cost),
             updated_at=VALUES(updated_at)`,
          [req.tenantId, sku, newQty, newAvg ?? 0, lastIn ?? null, now]
        );
      };

      const getStockForUpdate = async (sku) => {
        const [[st]] = await conn.query(
          `SELECT onhand_qty, avg_cost, last_in_cost
             FROM inventory_stock WHERE tenant_id=? AND sku=? FOR UPDATE`,
          [req.tenantId, sku]
        );
        return st || { onhand_qty: 0, avg_cost: 0, last_in_cost: null };
      };

      for (const l of lines) {
        const sku = l.sku;
        const qty = Number(l.counted_qty || 0);

        if (s.type === 'in') {
          const st = await getStockForUpdate(sku);
          const unitCost = l.unit_cost ?? l.costo_neto ?? st.avg_cost ?? 0;
          const newOnhand = Number(st.onhand_qty) + qty;
          const totalVal = Number(st.onhand_qty) * Number(st.avg_cost) + qty * unitCost;
          const newAvg = newOnhand > 0 ? totalVal / newOnhand : unitCost;
          await upsertStock(sku, newOnhand, newAvg, unitCost);
          await conn.query(
            `INSERT INTO inventory_moves
              (tenant_id, sku, move_date, type, qty, unit_cost, value, note, ref_type, ref_id, created_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [req.tenantId, sku, now, 'IN', qty, unitCost, qty * unitCost, s.reference ?? null, 'picking', s.id, now]
          );
        }

        if (s.type === 'out') {
          const st = await getStockForUpdate(sku);
          const unitCost = st.avg_cost ?? l.unit_cost ?? l.costo_neto ?? 0;
          const newOnhand = Number(st.onhand_qty) - qty;
          await upsertStock(sku, newOnhand, st.avg_cost, st.last_in_cost);
          await conn.query(
            `INSERT INTO inventory_moves
              (tenant_id, sku, move_date, type, qty, unit_cost, value, note, ref_type, ref_id, created_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [req.tenantId, sku, now, 'OUT', qty, unitCost, qty * unitCost, s.reference ?? null, 'picking', s.id, now]
          );
        }

        if (s.type === 'count') {
          const st = await getStockForUpdate(sku);
          const delta = qty - Number(st.onhand_qty);
          if (delta === 0) continue;

          if (delta > 0) {
            const unitCost = l.unit_cost ?? l.costo_neto ?? st.avg_cost ?? 0;
            const newOnhand = Number(st.onhand_qty) + delta;
            const totalVal = Number(st.onhand_qty) * Number(st.avg_cost) + delta * unitCost;
            const newAvg = newOnhand > 0 ? totalVal / newOnhand : unitCost;
            await upsertStock(sku, newOnhand, newAvg, unitCost);
            await conn.query(
              `INSERT INTO inventory_moves
                (tenant_id, sku, move_date, type, qty, unit_cost, value, note, ref_type, ref_id, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
              [req.tenantId, sku, now, 'IN', delta, unitCost, delta * unitCost, `[count] ${s.reference || ''}`.trim(), 'picking', s.id, now]
            );
          } else {
            const outQty = Math.abs(delta);
            const unitCost = st.avg_cost ?? l.unit_cost ?? l.costo_neto ?? 0;
            const newOnhand = Number(st.onhand_qty) - outQty;
            await upsertStock(sku, newOnhand, st.avg_cost, st.last_in_cost);
            await conn.query(
              `INSERT INTO inventory_moves
                (tenant_id, sku, move_date, type, qty, unit_cost, value, note, ref_type, ref_id, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
              [req.tenantId, sku, now, 'OUT', outQty, unitCost, outQty * unitCost, `[count] ${s.reference || ''}`.trim(), 'picking', s.id, now]
            );
          }
        }
      }

      await conn.query(`UPDATE inventory_sessions SET status='closed', closed_at=? WHERE id=?`, [now, id]);
      await conn.commit();
      await conn.end();
      res.json({ ok:true, closedAt: now });
    } catch (e) {
      try { await conn?.rollback(); } catch {}
      next(e);
    }
  });

  // CANCELAR
  r.delete('/sessions/:id', canManage, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const conn = await getConn();
      const [[s]] = await conn.query(`SELECT * FROM inventory_sessions WHERE id=?`, [id]);
      if (!s || s.tenant_id !== req.tenantId) { await conn.end(); return res.status(404).json({ ok:false, error:'NOT_FOUND' }); }
      if (s.status !== 'open') { await conn.end(); return res.status(400).json({ ok:false, error:'SESSION_CLOSED' }); }
      await conn.query(`DELETE FROM inventory_sessions WHERE id=?`, [id]);
      await conn.end();
      res.json({ ok:true });
    } catch (e) { next(e); }
  });

  return r;
}
