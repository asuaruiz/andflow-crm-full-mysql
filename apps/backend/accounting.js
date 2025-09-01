// apps/backend/accounting.js
import { getSession } from './db.js';

/** Crea SOLO las tablas puente (no altera tus tablas contables actuales) */
async function ensureBridgeTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS accounts_tenants (
      account_id INT NOT NULL,
      tenant_id  BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY (account_id, tenant_id),
      KEY ix_at_tenant (tenant_id),
      CONSTRAINT fk_at_acc FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
      CONSTRAINT fk_at_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS journal_entries_tenants (
      entry_id  BIGINT NOT NULL,
      tenant_id BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY (entry_id, tenant_id),
      KEY ix_jet_tenant (tenant_id),
      CONSTRAINT fk_jet_entry FOREIGN KEY (entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE,
      CONSTRAINT fk_jet_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);
}

async function requireTenant(req, res) {
  try {
    const token = req.cookies?.session;
    const sess = await getSession(token);
    const tenantId = sess?.selected_tenant_id || null;
    if (!sess || !tenantId) {
      res.status(401).json({ ok:false, error:'Selecciona una empresa (tenant) para continuar.' });
      return null;
    }
    return { tenantId, sess };
  } catch {
    res.status(401).json({ ok:false, error:'Sesión inválida.' });
    return null;
  }
}

const TYPES = ['asset','liability','equity','income','expense'];

export function initAccountingRoutes(app, pool) {
  // Garantiza tablas puente al arrancar
  ensureBridgeTables(pool).catch(err => {
    console.error('[accounting] init error:', err);
    process.exit(1);
  });

  // ===================== CUENTAS =====================
  app.get('/api/accounting/accounts', async (req,res)=>{
    const ctx = await requireTenant(req,res); if (!ctx) return;
    const [rows] = await pool.query(
      `SELECT a.id, a.code, a.name, a.type, a.active
       FROM accounts a
       JOIN accounts_tenants at ON at.account_id = a.id
       WHERE at.tenant_id = ?
       ORDER BY a.code ASC`,
      [ctx.tenantId]
    );
    res.json({ ok:true, items: rows });
  });

  app.post('/api/accounting/accounts', async (req,res)=>{
    const ctx = await requireTenant(req,res); if (!ctx) return;
    const { code, name, type } = req.body || {};
    if (!code || !name || !TYPES.includes(type)) {
      return res.status(400).json({ ok:false, error:'Datos inválidos' });
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [r] = await conn.execute(
        `INSERT INTO accounts (code, name, type, active) VALUES (?,?,?,1)`,
        [String(code).trim(), String(name).trim(), type]
      );
      const accountId = r.insertId;
      await conn.execute(
        `INSERT IGNORE INTO accounts_tenants (account_id, tenant_id) VALUES (?,?)`,
        [accountId, ctx.tenantId]
      );
      await conn.commit();
      res.json({ ok:true, id: accountId });
    } catch (e) {
      await conn.rollback();
      res.status(400).json({ ok:false, error: e.message });
    } finally {
      conn.release();
    }
  });

  // ===================== LIBRO DIARIO =====================
  app.get('/api/accounting/journal', async (req,res)=>{
    const ctx = await requireTenant(req,res); if (!ctx) return;
    const { from, to, q, format } = req.query || {};
    let where = `jet.tenant_id = ?`;
    const params = [ctx.tenantId];

    if (from) { where += ` AND je.entry_date >= ?`; params.push(from); }
    if (to)   { where += ` AND je.entry_date <= ?`; params.push(to); }
    if (q)    { where += ` AND (je.memo LIKE ? OR a.name LIKE ? OR a.code LIKE ?)`; params.push(`%${q}%`,`%${q}%`,`%${q}%`); }

    const [rows] = await pool.query(`
      SELECT
        je.id AS entry_id, je.entry_date, je.memo, je.locked,
        jl.id AS line_id, jl.debit, jl.credit, jl.description AS line_desc,
        a.id AS account_id, a.code AS account_code, a.name AS account_name, a.type AS account_type
      FROM journal_entries je
      JOIN journal_entries_tenants jet ON jet.entry_id = je.id
      JOIN journal_lines jl ON jl.entry_id = je.id
      JOIN accounts a ON a.id = jl.account_id
      JOIN accounts_tenants at ON at.account_id = a.id AND at.tenant_id = jet.tenant_id
      WHERE ${where}
      ORDER BY je.entry_date ASC, je.id ASC, jl.id ASC
    `, params);

    if (format === 'csv') {
      const header = ['entry_id','entry_date','memo','locked','account_code','account_name','account_type','debit','credit','line_desc'];
      const csv = [header.join(',')].concat(rows.map(r => [
        r.entry_id,
        r.entry_date,
        JSON.stringify(r.memo || ''),
        r.locked ? 1 : 0,
        r.account_code,
        JSON.stringify(r.account_name || ''),
        r.account_type,
        r.debit,
        r.credit,
        JSON.stringify(r.line_desc || '')
      ].join(','))).join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="libro_diario.csv"');
      return res.send(csv);
    }

    res.json({ ok:true, items: rows });
  });

  app.post('/api/accounting/journal', async (req,res)=>{
    const ctx = await requireTenant(req,res); if (!ctx) return;
    const { entry_date, memo, lines } = req.body || {};
    if (!entry_date || !Array.isArray(lines) || lines.length < 2) {
      return res.status(400).json({ ok:false, error:'entry_date y al menos 2 líneas son requeridos' });
    }

    // Normaliza y valida totales
    const clean = lines.map(l => ({
      account_id: Number(l.account_id),
      debit: Number(l.debit || 0),
      credit: Number(l.credit || 0),
      description: (l.description || '').slice(0,255)
    }));
    let sumD=0, sumC=0;
    for (const l of clean) {
      if (!l.account_id) return res.status(400).json({ ok:false, error:'account_id inválido' });
      if (l.debit < 0 || l.credit < 0) return res.status(400).json({ ok:false, error:'debit/credit no pueden ser negativos' });
      sumD += l.debit; sumC += l.credit;
    }
    if (Math.round((sumD - sumC)*100) !== 0) {
      return res.status(400).json({ ok:false, error:`descuadre: débito=${sumD.toFixed(2)} vs crédito=${sumC.toFixed(2)}` });
    }

    // Verifica que TODAS las cuentas sean del tenant
    const accountIds = [...new Set(clean.map(l => l.account_id))];
    if (accountIds.length) {
      const [chk] = await pool.query(
        `SELECT COUNT(*) AS n FROM accounts_tenants
         WHERE tenant_id=? AND account_id IN (${accountIds.map(()=>'?').join(',')})`,
        [ctx.tenantId, ...accountIds]
      );
      if (Number(chk[0].n) !== accountIds.length) {
        return res.status(400).json({ ok:false, error:'Hay cuentas fuera del tenant' });
      }
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Inserta JE (tu tabla original no tiene tenant_id)
      const [r] = await conn.execute(
        `INSERT INTO journal_entries (entry_date, memo) VALUES (?, ?)`,
        [entry_date, memo || null]
      );
      const entryId = r.insertId;

      // Mapeo a tenant
      await conn.execute(
        `INSERT IGNORE INTO journal_entries_tenants (entry_id, tenant_id) VALUES (?,?)`,
        [entryId, ctx.tenantId]
      );

      // Líneas
      const values = [];
      for (const l of clean) values.push(entryId, l.account_id, l.debit, l.credit, l.description || null);
      await conn.query(
        `INSERT INTO journal_lines (entry_id, account_id, debit, credit, description) VALUES ` +
        clean.map(()=>`(?, ?, ?, ?, ?)`).join(', '),
        values
      );

      await conn.commit();
      res.json({ ok:true, id: entryId });
    } catch (e) {
      await conn.rollback();
      res.status(400).json({ ok:false, error:e.message });
    } finally {
      conn.release();
    }
  });

  app.delete('/api/accounting/journal/:id', async (req,res)=>{
    const ctx = await requireTenant(req,res); if (!ctx) return;
    const id = Number(req.params.id);
    const [[own]] = await pool.query(
      `SELECT 1 AS ok FROM journal_entries_tenants WHERE entry_id=? AND tenant_id=? LIMIT 1`,
      [id, ctx.tenantId]
    );
    if (!own) return res.status(404).json({ ok:false, error:'No existe en este tenant' });
    await pool.query(`DELETE FROM journal_entries WHERE id=?`, [id]); // asume FK CASCADE a lines
    res.json({ ok:true });
  });

  app.post('/api/accounting/journal/:id/lock', async (req,res)=>{
    const ctx = await requireTenant(req,res); if (!ctx) return;
    const id = Number(req.params.id);
    const [[own]] = await pool.query(
      `SELECT 1 AS ok FROM journal_entries_tenants WHERE entry_id=? AND tenant_id=? LIMIT 1`,
      [id, ctx.tenantId]
    );
    if (!own) return res.status(404).json({ ok:false, error:'No existe en este tenant' });
    await pool.query(`UPDATE journal_entries SET locked=1 WHERE id=?`, [id]);
    res.json({ ok:true });
  });

  // ===================== BALANCE DE COMPROBACIÓN =====================
  app.get('/api/accounting/trial-balance', async (req,res)=>{
    const ctx = await requireTenant(req,res); if (!ctx) return;
    const { from, to } = req.query || {};
    let where = `jet.tenant_id = ?`; const params=[ctx.tenantId];
    if (from){ where += ` AND je.entry_date >= ?`; params.push(from); }
    if (to){   where += ` AND je.entry_date <= ?`; params.push(to); }

    const [rows] = await pool.query(`
      SELECT a.code, a.name, a.type,
             SUM(jl.debit) AS debit, SUM(jl.credit) AS credit,
             SUM(jl.debit - jl.credit) AS balance
      FROM journal_entries je
      JOIN journal_entries_tenants jet ON jet.entry_id = je.id
      JOIN journal_lines jl ON jl.entry_id = je.id
      JOIN accounts a ON a.id = jl.account_id
      JOIN accounts_tenants at ON at.account_id = a.id AND at.tenant_id = jet.tenant_id
      WHERE ${where}
      GROUP BY a.id
      ORDER BY a.code ASC
    `, params);

    res.json({ ok:true, items: rows });
  });
}
