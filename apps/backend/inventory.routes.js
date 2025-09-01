// apps/backend/inventory.routes.js
import express from "express";
import mysql from "mysql2/promise";
import { getSession } from "./db.js";

const {
  MYSQL_HOST='127.0.0.1', MYSQL_PORT='3306', MYSQL_USER='root',
  MYSQL_PASSWORD='', MYSQL_DATABASE='andflow'
} = process.env;

export function inventoryRouter(){
  const r = express.Router();
  const pool = mysql.createPool({
    host: MYSQL_HOST, port: Number(MYSQL_PORT),
    user: MYSQL_USER, password: MYSQL_PASSWORD, database: MYSQL_DATABASE,
    waitForConnections: true, connectionLimit: 10, decimalNumbers: true,
  });

  // ------------ helpers ------------
  async function getTenantId(req){
    let tenantId = null;
    try{
      const token = req.cookies?.session;
      if (token) {
        const sess = await getSession(token);
        tenantId = sess?.selected_tenant_id ?? null;
      }
    }catch{}
    const hdr = req.headers["x-tenant-id"] || req.headers["x-tenant"];
    const q = req.query?.tenantId || req.query?.tenant;
    tenantId = tenantId || Number(hdr || q) || null;
    if (!tenantId) throw Object.assign(new Error("NO_TENANT"), { status:400 });
    return tenantId;
  }

  async function ensureInventoryTables(){
    const conn = await pool.getConnection();
    try{
      // Stock actual por SKU
      await conn.query(`
        CREATE TABLE IF NOT EXISTS inventory_stock (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          tenant_id BIGINT UNSIGNED NOT NULL,
          sku VARCHAR(80) NOT NULL,
          onhand_qty DECIMAL(14,3) NOT NULL DEFAULT 0,
          avg_cost DECIMAL(14,4) NOT NULL DEFAULT 0,
          last_in_cost DECIMAL(14,4) NULL,
          updated_at DATETIME NOT NULL,
          UNIQUE KEY ux_tenant_sku (tenant_id, sku),
          CONSTRAINT fk_invstock_product
            FOREIGN KEY (tenant_id, sku)
            REFERENCES products_master(tenant_id, sku)
            ON DELETE CASCADE
        ) ENGINE=InnoDB;
      `);

      // Kardex (movimientos)
      await conn.query(`
        CREATE TABLE IF NOT EXISTS inventory_moves (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          tenant_id BIGINT UNSIGNED NOT NULL,
          sku VARCHAR(80) NOT NULL,
          move_date DATETIME NOT NULL,
          type ENUM('IN','OUT','ADJ_IN','ADJ_OUT','OPENING','RETURN_IN','RETURN_OUT') NOT NULL,
          qty DECIMAL(14,3) NOT NULL,
          unit_cost DECIMAL(14,4) NULL,
          value DECIMAL(14,2) NULL,
          warehouse_id BIGINT NULL,
          ref_type VARCHAR(32) NULL,
          ref_id VARCHAR(64) NULL,
          note VARCHAR(255) NULL,
          created_by BIGINT NULL,
          created_at DATETIME NOT NULL,
          INDEX ix_tenant_date (tenant_id, move_date),
          INDEX ix_tenant_sku (tenant_id, sku),
          CONSTRAINT fk_invmoves_product
            FOREIGN KEY (tenant_id, sku)
            REFERENCES products_master(tenant_id, sku)
            ON DELETE CASCADE
        ) ENGINE=InnoDB;
      `);
    } finally { conn.release(); }
  }

  // asegurar tablas
  r.use(async (_req,_res,next)=>{ try{ await ensureInventoryTables(); next(); }catch(e){ next(e); } });

  // Sembrar costos iniciales desde products_master.costo_neto
r.post("/seed-costs", async (req, res) => {
  try {
    const tenantId = await getTenantId(req);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Inserta si no existe y/o actualiza solo si no hay stock (no pisar inventario ya cargado)
      const [result] = await conn.query(`
        INSERT INTO inventory_stock (tenant_id, sku, onhand_qty, avg_cost, last_in_cost, updated_at)
        SELECT p.tenant_id, p.sku, 0,
               COALESCE(p.costo_neto, 0) AS avg_cost,
               CASE WHEN p.costo_neto IS NULL OR p.costo_neto=0 THEN NULL ELSE p.costo_neto END AS last_in_cost,
               NOW()
        FROM products_master p
        WHERE p.tenant_id = ? AND p.sku IS NOT NULL
        ON DUPLICATE KEY UPDATE
          avg_cost    = IF(inventory_stock.onhand_qty=0, VALUES(avg_cost), inventory_stock.avg_cost),
          last_in_cost= IF(inventory_stock.onhand_qty=0, VALUES(last_in_cost), inventory_stock.last_in_cost),
          updated_at  = VALUES(updated_at);
      `, [tenantId]);

      await conn.commit();
      res.json({ ok: true, affected: result.affectedRows });
    } catch (e) {
      try { await conn.rollback(); } catch {}
      throw e;
    } finally {
      conn.release();
    }
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message || String(e) });
  }
});
// Importar stock inicial desde products_master (columnas: dif o uc)
// Crea movimientos OPENING (y ajustes hacia abajo si se usa override=true)
r.post("/opening/import-from-master", async (req, res) => {
  try {
    const tenantId = await getTenantId(req);
    const { source = "dif", override = false, dry_run = false, note } = req.body || {};
    if (!["dif", "uc"].includes(String(source))) {
      return res.status(400).json({ ok: false, error: "source inválido (usa 'dif' o 'uc')" });
    }

    const conn = await pool.getConnection();
    try {
      const now = new Date();
      await conn.beginTransaction();

      // Traemos lo necesario de la maestra (dif/uc y costo_neto)
      const [rows] = await conn.query(`
        SELECT p.sku, p.costo_neto, p.dif, p.uc
        FROM products_master p
        WHERE p.tenant_id=? AND p.sku IS NOT NULL
      `, [tenantId]);

      let created = 0, adjustedDown = 0, skipped = 0, totalTargets = 0;

      for (const p of rows) {
        const sku = p.sku;
        const targetQtyRaw = source === "uc" ? p.uc : p.dif;
        const targetQty = Number(targetQtyRaw ?? 0);
        if (!Number.isFinite(targetQty) || targetQty <= 0) { skipped++; continue; }
        totalTargets++;

        // Lock de stock
        const [srows] = await conn.query(
          `SELECT onhand_qty, avg_cost, last_in_cost FROM inventory_stock WHERE tenant_id=? AND sku=? FOR UPDATE`,
          [tenantId, sku]
        );
        let onhand = 0, avg = 0, lastIn = null;
        if (srows.length === 0) {
          await conn.query(`
            INSERT INTO inventory_stock (tenant_id, sku, onhand_qty, avg_cost, last_in_cost, updated_at)
            VALUES (?,?,?,?,?,?)
            ON DUPLICATE KEY UPDATE updated_at=VALUES(updated_at)
          `, [tenantId, sku, 0, 0, null, now]);
        } else {
          onhand = Number(srows[0].onhand_qty || 0);
          avg = Number(srows[0].avg_cost || 0);
          lastIn = srows[0].last_in_cost == null ? null : Number(srows[0].last_in_cost);
        }

        // ¿Cuánto debemos mover?
        let delta;
        if (override) {
          delta = targetQty - onhand; // dejamos EXACTO igual a la maestra
        } else {
          delta = targetQty - onhand;
          if (delta < 0) { skipped++; continue; } // modo "solo sumar": no descontamos
        }
        if (delta === 0) { skipped++; continue; }

        if (dry_run) continue;

        // Costo a usar para OPENING/ADJ_OUT
        const unitCost = Number(p.costo_neto ?? 0) || avg || lastIn || 0;

        if (delta > 0) {
          // OPENING (entrada)
          const newOnhand = onhand + delta;
          const newAvg = newOnhand > 0 ? ((onhand * avg) + (delta * unitCost)) / newOnhand : 0;

          await conn.query(
            `UPDATE inventory_stock SET onhand_qty=?, avg_cost=?, last_in_cost=?, updated_at=? WHERE tenant_id=? AND sku=?`,
            [newOnhand, newAvg, unitCost || null, now, tenantId, sku]
          );
          await conn.query(`
            INSERT INTO inventory_moves
              (tenant_id, sku, move_date, type, qty, unit_cost, value, note, ref_type, ref_id, created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)
          `, [tenantId, sku, now, 'OPENING', delta, unitCost, delta * unitCost, note || `Import stock (source=${source})`, 'IMPORT', 'OPENING', now]);

          created++;
        } else {
          // delta < 0 → ajuste hacia abajo si override=true
          const outQty = Math.abs(delta);
          const newOnhand = Math.max(0, onhand - outQty);

          await conn.query(
            `UPDATE inventory_stock SET onhand_qty=?, updated_at=? WHERE tenant_id=? AND sku=?`,
            [newOnhand, now, tenantId, sku]
          );
          await conn.query(`
            INSERT INTO inventory_moves
              (tenant_id, sku, move_date, type, qty, unit_cost, value, note, ref_type, ref_id, created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)
          `, [tenantId, sku, now, 'ADJ_OUT', outQty, avg || unitCost, -(outQty * (avg || unitCost)), note || `Adjust down to target (source=${source})`, 'IMPORT', 'ADJ', now]);

          adjustedDown++;
        }
      }

      if (!dry_run) await conn.commit();
      res.json({ ok: true, total_considered: rows.length, total_with_target: totalTargets, created_opening: created, adjusted_down: adjustedDown, skipped, override, source, dry_run });
    } catch (e) {
      try { await conn.rollback(); } catch {}
      throw e;
    } finally {
      conn.release();
    }
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message || String(e) });
  }
});


  // ----------- endpoints -----------
  // Stock actual
  r.get("/stock", async (req,res)=>{
    try{
      const tenantId = await getTenantId(req);
      const { sku } = req.query || {};
      const conn = await pool.getConnection();
      try{
        const [rows] = await conn.query(`
          SELECT s.tenant_id, s.sku, s.onhand_qty, s.avg_cost, s.last_in_cost, s.updated_at,
                 (s.onhand_qty * s.avg_cost) AS inventory_value
          FROM inventory_stock s
          WHERE s.tenant_id=? ${sku ? 'AND s.sku=?' : ''}
          ORDER BY s.sku ASC
        `, sku ? [tenantId, sku] : [tenantId]);
        res.json({ ok:true, items: rows });
      } finally { conn.release(); }
    }catch(e){ res.status(e.status||500).json({ ok:false, error:e.message }); }
  });

  // Listar movimientos
  r.get("/moves", async (req,res)=>{
    try{
      const tenantId = await getTenantId(req);
      const { sku, from, to, limit='200' } = req.query || {};
      const conn = await pool.getConnection();
      try{
        const [rows] = await conn.query(`
          SELECT * FROM inventory_moves
          WHERE tenant_id=? ${sku? 'AND sku=?' : ''} ${from? 'AND move_date>=?' : ''} ${to? 'AND move_date<=?' : ''}
          ORDER BY move_date DESC, id DESC
          LIMIT ?
        `, [tenantId, ...(sku?[sku]:[]), ...(from?[from]:[]), ...(to?[to]:[]), Number(limit)]);
        res.json({ ok:true, items: rows });
      } finally { conn.release(); }
    }catch(e){ res.status(e.status||500).json({ ok:false, error:e.message }); }
  });

  // Crear movimiento + calcular PMP
  r.post("/moves", async (req,res)=>{
    try{
      const tenantId = await getTenantId(req);
      const { sku, type, qty, unit_cost, move_date, note, ref_type, ref_id } = req.body || {};
      if (!sku || !type || !qty) return res.status(400).json({ ok:false, error:"sku, type y qty son requeridos" });
      const t = String(type).toUpperCase();
      if (!['IN','OUT','ADJ_IN','ADJ_OUT','OPENING','RETURN_IN','RETURN_OUT'].includes(t)) {
        return res.status(400).json({ ok:false, error:"type inválido" });
      }
      const Q = Number(qty);
      const C = unit_cost == null ? null : Number(unit_cost);
      if (!Number.isFinite(Q) || Q <= 0) return res.status(400).json({ ok:false, error:"qty debe ser > 0" });
      if (['IN','ADJ_IN','OPENING','RETURN_IN'].includes(t) && !Number.isFinite(C))
        return res.status(400).json({ ok:false, error:"unit_cost requerido para entradas" });

      const conn = await pool.getConnection();
      try{
        await conn.beginTransaction();

        // lock de stock
        const [rows] = await conn.query(
          `SELECT * FROM inventory_stock WHERE tenant_id=? AND sku=? FOR UPDATE`,
          [tenantId, sku]
        );
        let onhand = 0, avgCost = 0, lastIn = null;
        if (rows.length === 0) {
          const now = new Date();
          await conn.query(`
            INSERT INTO inventory_stock (tenant_id, sku, onhand_qty, avg_cost, last_in_cost, updated_at)
            VALUES (?,?,?,?,?,?)
            ON DUPLICATE KEY UPDATE updated_at=VALUES(updated_at)
          `, [tenantId, sku, 0, 0, null, now]);
        } else {
          onhand = Number(rows[0].onhand_qty || 0);
          avgCost = Number(rows[0].avg_cost || 0);
          lastIn = rows[0].last_in_cost == null ? null : Number(rows[0].last_in_cost);
        }

        const now = new Date();
        const when = move_date ? new Date(move_date) : now;

        let newOnhand = onhand;
        let newAvg = avgCost;
        let value = null;

        if (['IN','ADJ_IN','OPENING','RETURN_IN'].includes(t)) {
          const totalValueBefore = onhand * avgCost;
          const totalInValue = Q * C;
          newOnhand = onhand + Q;
          newAvg = newOnhand > 0 ? (totalValueBefore + totalInValue) / newOnhand : 0;
          value = totalInValue;
          await conn.query(
            `UPDATE inventory_stock SET onhand_qty=?, avg_cost=?, last_in_cost=?, updated_at=? WHERE tenant_id=? AND sku=?`,
            [newOnhand, newAvg, C, now, tenantId, sku]
          );
        } else {
          // salidas valorizadas al promedio actual
          value = Q * avgCost * -1;
          newOnhand = onhand - Q;
          if (newOnhand < 0) newOnhand = 0;
          await conn.query(
            `UPDATE inventory_stock SET onhand_qty=?, updated_at=? WHERE tenant_id=? AND sku=?`,
            [newOnhand, now, tenantId, sku]
          );
        }

        await conn.query(`
          INSERT INTO inventory_moves
            (tenant_id, sku, move_date, type, qty, unit_cost, value, note, ref_type, ref_id, created_at)
          VALUES
            (?,?,?,?,?,?,?,?,?,?,?)
        `, [tenantId, sku, when, t, Q, C, value, note ?? null, ref_type ?? null, ref_id ?? null, now]);

        await conn.commit();
        res.json({ ok:true, onhand:newOnhand, avg_cost:newAvg });
      } catch(e){
        try{ await conn.rollback(); }catch{}
        throw e;
      } finally { conn.release(); }
    }catch(e){ res.status(e.status||500).json({ ok:false, error:e.message }); }
  });

  // Recalcular PMP desde el kardex (útil para auditoría)
  r.post("/recalc/:sku", async (req,res)=>{
    try{
      const tenantId = await getTenantId(req);
      const sku = req.params.sku;
      const conn = await pool.getConnection();
      try{
        await conn.beginTransaction();
        const [moves] = await conn.query(
          `SELECT * FROM inventory_moves WHERE tenant_id=? AND sku=? ORDER BY move_date ASC, id ASC`,
          [tenantId, sku]
        );
        let onhand = 0, avg = 0;
        for (const m of moves){
          const Q = Number(m.qty);
          const C = m.unit_cost == null ? null : Number(m.unit_cost);
          if (['IN','ADJ_IN','OPENING','RETURN_IN'].includes(m.type)) {
            const totalBefore = onhand * avg;
            onhand += Q;
            const inValue = Q * (C ?? 0);
            avg = onhand > 0 ? (totalBefore + inValue) / onhand : 0;
          } else {
            onhand -= Q;
            if (onhand < 0) onhand = 0;
          }
        }
        const now = new Date();
        await conn.query(
          `UPDATE inventory_stock SET onhand_qty=?, avg_cost=?, updated_at=? WHERE tenant_id=? AND sku=?`,
          [onhand, avg, now, tenantId, sku]
        );
        await conn.commit();
        res.json({ ok:true, onhand, avg_cost:avg });
      } catch(e){ try{ await conn.rollback(); }catch{}; throw e; }
      finally{ conn.release(); }
    }catch(e){ res.status(e.status||500).json({ ok:false, error:e.message }); }
  });

  return r;
}
