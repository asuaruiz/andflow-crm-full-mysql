// apps/backend/platform.tenants.routes.js
import express from 'express';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { getSession, getUserWithRolesAndPerms } from './db.js';

export function platformTenantsRouter() {
  const r = express.Router();

  // Helper para abrir conexión
  function getConn() {
    return mysql.createConnection({
      host: process.env.MYSQL_HOST,
      port: Number(process.env.MYSQL_PORT),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
    });
  }

  // --- Listar tenants (requiere superadmin o permiso platform.tenants.view)
  r.get('/', async (req, res, next) => {
    try {
      const sess = await getSession(req.cookies?.session);
      if (!sess) return res.status(401).json({ ok: false, error: 'No autenticado' });

      const me = await getUserWithRolesAndPerms({ userId: sess.user_id, tenantId: null });
      if (!me?.isSuperAdmin && !me?.permissions?.includes('platform.tenants.view')) {
        return res.status(403).json({ ok: false, error: 'No autorizado' });
      }

      const conn = await getConn();
      const [rows] = await conn.query(
        `SELECT id, rut, name, subdomain, is_active, created_at
           FROM tenants
           ORDER BY id DESC`
      );
      await conn.end();
      res.json({ ok: true, items: rows });
    } catch (e) { next(e); }
  });

  // --- Crear tenant (+ opcional crear/ligar usuario Owner del tenant)
  r.post('/', async (req, res, next) => {
    try {
      const sess = await getSession(req.cookies?.session);
      if (!sess) return res.status(401).json({ ok: false, error: 'No autenticado' });

      const me = await getUserWithRolesAndPerms({ userId: sess.user_id, tenantId: null });
      if (!me?.isSuperAdmin && !me?.permissions?.includes('platform.tenants.manage')) {
        return res.status(403).json({ ok: false, error: 'No autorizado' });
      }

      const { rut, name, subdomain, adminEmail, adminName, adminPassword } = req.body || {};
      if (!rut || !name) return res.status(400).json({ ok: false, error: 'rut y name son requeridos' });

      const now = new Date();
      const conn = await getConn();

      // Crear tenant
      const [ins] = await conn.execute(
        `INSERT INTO tenants (rut, name, subdomain, is_active, created_at, updated_at)
         VALUES (?, ?, ?, 1, ?, ?)`,
        [String(rut).trim(), String(name).trim(), subdomain?.trim() || null, now, now]
      );
      const tenantId = ins.insertId;

      let ownerUserId = null;

      // Si se incluyen datos del admin del tenant, crear (o reutilizar) usuario y asignar el rol TENANT_OWNER
      if (adminEmail && adminPassword) {
        const email = String(adminEmail).trim().toLowerCase();

        // Upsert usuario
        const [urows] = await conn.execute(`SELECT id FROM users WHERE email=? LIMIT 1`, [email]);
        if (!urows.length) {
          const hash = await bcrypt.hash(String(adminPassword), 10);
          const [ui] = await conn.execute(
            `INSERT INTO users (email, password_hash, name, is_active, is_super_admin, created_at, updated_at)
             VALUES (?, ?, ?, 1, 0, ?, ?)`,
            [email, hash, adminName?.trim() || email, now, now]
          );
          ownerUserId = ui.insertId;
        } else {
          ownerUserId = urows[0].id;
        }

        // Rol plantilla TENANT_OWNER (scope tenant, tenant_id NULL)
        const [[roleRow]] = await conn.execute(
          `SELECT id FROM roles
            WHERE code='TENANT_OWNER' AND scope='tenant' AND tenant_id IS NULL
            LIMIT 1`
        );
        if (!roleRow) throw new Error('Rol TENANT_OWNER plantilla no encontrado');

        // Asignar rol al usuario para este tenant (¡OJO: columna es assigned_at!)
        await conn.execute(
          `INSERT IGNORE INTO user_roles (user_id, role_id, tenant_id, assigned_at)
           VALUES (?, ?, ?, ?)`,
          [ownerUserId, roleRow.id, tenantId, now]
        );
      }

      const [[item]] = await conn.execute(
        `SELECT id, rut, name, subdomain, is_active, created_at
           FROM tenants WHERE id=?`,
        [tenantId]
      );
      await conn.end();

      res.json({ ok: true, item, ownerUserId });
    } catch (e) { next(e); }
  });

  // --- Actualizar tenant (nombre, rut, subdominio, activo)
  r.put('/:id', async (req, res, next) => {
    try {
      const sess = await getSession(req.cookies?.session);
      if (!sess) return res.status(401).json({ ok: false, error: 'No autenticado' });

      const me = await getUserWithRolesAndPerms({ userId: sess.user_id, tenantId: null });
      if (!me?.isSuperAdmin && !me?.permissions?.includes('platform.tenants.manage')) {
        return res.status(403).json({ ok: false, error: 'No autorizado' });
      }

      const id = Number(req.params.id);
      const { name, rut, subdomain, is_active } = req.body || {};
      const now = new Date();

      const conn = await getConn();
      await conn.execute(
        `UPDATE tenants
            SET name=?, rut=?, subdomain=?, is_active=?, updated_at=?
          WHERE id=?`,
        [name, rut, subdomain || null, is_active ? 1 : 0, now, id]
      );
      const [[row]] = await conn.execute(
        `SELECT id, rut, name, subdomain, is_active, created_at
           FROM tenants WHERE id=?`,
        [id]
      );
      await conn.end();
      res.json({ ok: true, item: row });
    } catch (e) { next(e); }
  });
  // apps/backend/routes/tenant-settings.routes.js
r.put('/settings', async (req, res, next) => {
  try {
    const { tenantId, settings } = req.body; // settings contendrá la configuración actualizada (colores)
    const token = req.cookies?.session;
    const sess = await getSession(token);
    if (!sess) return res.status(401).json({ ok: false, error: 'No autenticado' });
    
    const me = await getUserWithRolesAndPerms({ userId: sess.user_id, tenantId });
    if (!me?.permissions?.includes('tenant.settings.manage')) {
      return res.status(403).json({ ok: false, error: 'No autorizado' });
    }

    const now = new Date();
    const conn = await mysql.createConnection({
      host: process.env.MYSQL_HOST, 
      port: +process.env.MYSQL_PORT, 
      user: process.env.MYSQL_USER, 
      password: process.env.MYSQL_PASSWORD, 
      database: process.env.MYSQL_DATABASE
    });

    // Actualizar configuración del tenant
    await conn.execute(
      `UPDATE tenant_settings 
       SET settings_json = ?, updated_at = ? 
       WHERE tenant_id = ?`,
      [JSON.stringify(settings), now, tenantId]
    );

    await conn.end();
    res.json({ ok: true });
  } catch (e) { next(e); }
});
// --- Eliminar tenant (solo SuperAdmin)
r.delete('/:id', async (req, res, next) => {
  let conn;
  try {
    const sess = await getSession(req.cookies?.session);
    if (!sess) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const me = await getUserWithRolesAndPerms({ userId: sess.user_id, tenantId: null });
    // Esta operación es destructiva: limítala a SuperAdmins
    if (!me?.isSuperAdmin) {
      return res.status(403).json({ ok: false, error: 'No autorizado' });
    }

    const tenantId = Number(req.params.id);
    if (!tenantId) return res.status(400).json({ ok: false, error: 'ID inválido' });

    conn = await getConn();
    const [[exists]] = await conn.execute(`SELECT id FROM tenants WHERE id=? LIMIT 1`, [tenantId]);
    if (!exists) { await conn.end(); return res.status(404).json({ ok: false, error: 'Tenant no existe' }); }

    await conn.beginTransaction();

    // --- Picking
    await conn.execute(
      `DELETE l FROM inventory_session_lines l
       JOIN inventory_sessions s ON s.id=l.session_id
       WHERE s.tenant_id=?`,
      [tenantId]
    );
    await conn.execute(`DELETE FROM inventory_sessions WHERE tenant_id=?`, [tenantId]);

    // --- Inventario / Kardex (¡moves primero por FK RESTRICT!)
    await conn.execute(`DELETE FROM inventory_moves  WHERE tenant_id=?`, [tenantId]);
    await conn.execute(`DELETE FROM inventory_stock  WHERE tenant_id=?`, [tenantId]);

    // --- Ventas
    await conn.execute(`DELETE FROM sales_order_lines WHERE tenant_id=?`, [tenantId]);
    await conn.execute(`DELETE FROM sales_orders      WHERE tenant_id=?`, [tenantId]);

    // --- Clientes
    await conn.execute(
      `DELETE a FROM customer_addresses a
       JOIN customers c ON c.id=a.customer_id
       WHERE c.tenant_id=?`,
      [tenantId]
    );
    await conn.execute(`DELETE FROM customers WHERE tenant_id=?`, [tenantId]);

    // --- Contabilidad (puentes)
    await conn.execute(`DELETE FROM journal_entries_tenants WHERE tenant_id=?`, [tenantId]);
    await conn.execute(`DELETE FROM accounts_tenants        WHERE tenant_id=?`, [tenantId]);

    // --- Roles y grants del tenant
    await conn.execute(`DELETE FROM user_roles WHERE tenant_id=?`, [tenantId]);
    // role_permissions tiene FK a roles, así que al borrar roles se van en cascada
    await conn.execute(`DELETE FROM roles WHERE tenant_id=?`, [tenantId]);

    // --- Config del tenant
    await conn.execute(`DELETE FROM shopify_config   WHERE tenant_id=?`, [tenantId]);
    await conn.execute(`DELETE FROM tenant_settings  WHERE tenant_id=?`, [tenantId]);

    // --- Productos (al final: ya no hay moves/stock que bloqueen)
    await conn.execute(`DELETE FROM products_master WHERE tenant_id=?`, [tenantId]);

    // --- Finalmente, el tenant
    await conn.execute(`DELETE FROM tenants WHERE id=?`, [tenantId]);

    await conn.commit();
    await conn.end();
    res.json({ ok: true, deletedId: tenantId });
  } catch (e) {
    try { await conn?.rollback(); } catch {}
    next(e);
  }
});


  return r;
}
