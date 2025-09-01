import express from 'express';
import mysql from 'mysql2/promise';
import { getSession, getUserWithRolesAndPerms } from './db.js';

export function tenantSettingsRouter() {
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

  // --- Lee settings del tenant activo
  r.get('/', async (req, res, next) => {
    try {
      const token = req.cookies?.session;
      const sess = await getSession(token);
      const tenantId = sess?.selected_tenant_id;  // Asegurándonos de que usamos el tenant correcto de la sesión.
      
      // Verificar que el tenant está asociado a la sesión
      if (!tenantId) return res.status(400).json({ ok: false, error: 'Selecciona una empresa' });

      const me = await getUserWithRolesAndPerms({ userId: sess.user_id, tenantId });
      
      // Verificar permisos de usuario
      if (!me?.isSuperAdmin && !me?.permissions?.includes('tenant.settings.manage')) {
        return res.status(403).json({ ok: false, error: 'No autorizado' });
      }

      const conn = await getConn();
      // Usamos el tenant_id para filtrar la configuración
      const [[row]] = await conn.query(
        'SELECT settings_json, updated_at FROM tenant_settings WHERE tenant_id=? LIMIT 1',
        [tenantId]
      );
      await conn.end();

      const settings = row?.settings_json || {};
      res.json({ ok: true, settings, updatedAt: row?.updated_at || null });
    } catch (e) { next(e); }
  });

  // --- Guarda settings del tenant activo
  r.put('/', async (req, res, next) => {
    try {
      const token = req.cookies?.session;
      const sess = await getSession(token);
      const tenantId = sess?.selected_tenant_id;
      if (!tenantId) return res.status(400).json({ ok: false, error: 'Selecciona una empresa' });

      const me = await getUserWithRolesAndPerms({ userId: sess.user_id, tenantId });
      if (!me?.isSuperAdmin && !me?.permissions?.includes('tenant.settings.manage')) {
        return res.status(403).json({ ok: false, error: 'No autorizado' });
      }

      const settings = req.body?.settings || {};
      const now = new Date();

      const conn = await getConn();
      // Usamos el tenant_id para asegurar que solo actualizamos el tenant correcto
      await conn.execute(
        `INSERT INTO tenant_settings (tenant_id, settings_json, updated_at)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE settings_json=VALUES(settings_json), updated_at=VALUES(updated_at)`,
        [tenantId, JSON.stringify(settings), now]
      );
      await conn.end();

      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  return r;
}
