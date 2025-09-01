// apps/backend/auth.tenant.routes.js
import express from 'express';
import mysql from 'mysql2/promise';
import { getSession, setSessionTenant, getUserWithRolesAndPerms } from './db.js';

export function authTenantRouter() {
  const r = express.Router();

  const getConn = () =>
    mysql.createConnection({
      host: process.env.MYSQL_HOST,
      port: Number(process.env.MYSQL_PORT),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
    });

  // Auto-selecciona tenant si el usuario no es SA y no tiene uno elegido
  r.get('/current', async (req, res, next) => {
    try {
      const token = req.cookies?.session;
      const sess = await getSession(token);
      if (!sess) return res.status(401).json({ ok:false, error:'No autenticado' });

      let tenantId = sess.selected_tenant_id ?? null;

      const mePlatform = await getUserWithRolesAndPerms({ userId: sess.user_id, tenantId: null });
      const isSuperAdmin = !!mePlatform?.isSuperAdmin;

      if (!isSuperAdmin && (tenantId === null || tenantId === undefined)) {
        const conn = await getConn();
        const [[row]] = await conn.query(
          `
          SELECT ur.tenant_id
          FROM user_roles ur
          JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_id = ? AND r.scope = 'tenant'
          ORDER BY ur.assigned_at DESC
          LIMIT 1
          `,
          [sess.user_id]
        );
        await conn.end();

        if (row?.tenant_id) {
          await setSessionTenant(token, row.tenant_id);
          tenantId = row.tenant_id;
        }
      }

      const me = await getUserWithRolesAndPerms({ userId: sess.user_id, tenantId });
      return res.json({ ok:true, tenantId, user: me });
    } catch (e) { next(e); }
  });

  // Cambia tenant (SA cualquiera; usuario normal solo donde tenga rol de scope 'tenant')
  r.post('/switch', async (req, res, next) => {
    try {
      const token = req.cookies?.session;
      const sess = await getSession(token);
      if (!sess) return res.status(401).json({ ok:false, error:'No autenticado' });

      const raw = req.body?.tenantId;
      const tenantId = (raw === null || raw === 'null' || raw === undefined) ? null : Number(raw);

      const mePlatform = await getUserWithRolesAndPerms({ userId: sess.user_id, tenantId: null });
      const isSuperAdmin = !!mePlatform?.isSuperAdmin;

      const conn = await getConn();

      if (tenantId === null) {
        if (!isSuperAdmin) { await conn.end(); return res.status(403).json({ ok:false, error:'Solo superadmin puede tener tenant nulo' }); }
        await setSessionTenant(token, null);
        const me = await getUserWithRolesAndPerms({ userId: sess.user_id, tenantId: null });
        await conn.end();
        return res.json({ ok:true, tenantId: null, user: me });
      }

      if (!Number.isFinite(tenantId) || tenantId <= 0) {
        await conn.end(); return res.status(400).json({ ok:false, error:'tenantId inválido' });
      }

      const [[t]] = await conn.query(`SELECT id, is_active FROM tenants WHERE id=?`, [tenantId]);
      if (!t || !t.is_active) { await conn.end(); return res.status(404).json({ ok:false, error:'Tenant no existe o está inactivo' }); }

      if (!isSuperAdmin) {
        // ⚠️ OJO: NO filtramos por r.tenant_id; basta con r.scope='tenant'
        const [[has]] = await conn.query(
          `
          SELECT 1 AS present
          FROM user_roles ur
          JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_id = ? AND ur.tenant_id = ? AND r.scope = 'tenant'
          LIMIT 1
          `,
          [sess.user_id, tenantId]
        );
        if (!has?.present) { await conn.end(); return res.status(403).json({ ok:false, error:'Sin acceso a ese tenant' }); }
      }

      await setSessionTenant(token, tenantId);
      const me = await getUserWithRolesAndPerms({ userId: sess.user_id, tenantId });
      await conn.end();
      return res.json({ ok:true, tenantId, user: me });
    } catch (e) { next(e); }
  });

  return r;
}
