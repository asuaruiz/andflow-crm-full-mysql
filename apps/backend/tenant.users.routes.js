// apps/backend/tenant.users.routes.js
import express from 'express';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { getSession, getUserWithRolesAndPerms } from './db.js';

export function tenantUsersRouter() {
  const r = express.Router();

  const getConn = () =>
    mysql.createConnection({
      host: process.env.MYSQL_HOST,
      port: Number(process.env.MYSQL_PORT),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
    });

  function makeTempPassword() {
    const base = Math.random().toString(36).slice(-8);
    return `A1!${base}`;
  }

  async function requireManage(req, res, next) {
    try {
      const token = req.cookies?.session;
      const sess = await getSession(token);
      if (!sess) return res.status(401).json({ ok: false, error: 'UNAUTH' });

      const tenantId = sess.selected_tenant_id ?? null;
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_CONTEXT_REQUIRED' });

      const me = await getUserWithRolesAndPerms({ userId: sess.user_id, tenantId });
      const allowed = me?.isSuperAdmin || me?.permissions?.includes('tenant.users.manage');
      if (!allowed) return res.status(403).json({ ok: false, error: 'FORBIDDEN' });

      req.tenantId = tenantId;
      req.me = me;
      next();
    } catch (e) {
      next(e);
    }
  }

  // === LISTADO usuarios + asignaciones en este tenant
  r.get('/', requireManage, async (req, res, next) => {
    try {
      const conn = await getConn();
      const tenantId = req.tenantId;

      const [users] = await conn.query(
        `
        SELECT DISTINCT u.id, u.email, u.name, u.is_active, u.created_at
        FROM users u
        JOIN user_roles ur ON ur.user_id = u.id
        WHERE ur.tenant_id = ?
        ORDER BY COALESCE(u.name, u.email) ASC
        `,
        [tenantId]
      );

      const [assignments] = await conn.query(
        `
        SELECT ur.user_id, r.id AS role_id, r.code AS role_code, r.name AS role_name
        FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
        WHERE ur.tenant_id = ?
        `,
        [tenantId]
      );

      await conn.end();
      res.json({ ok: true, users, assignments });
    } catch (e) {
      next(e);
    }
  });

  // === ROLES de alcance tenant disponibles para este tenant
  r.get('/roles', requireManage, async (req, res, next) => {
    try {
      const conn = await getConn();
      const tenantId = req.tenantId;
      const [roles] = await conn.query(
        `
        SELECT id, code, name, scope, tenant_id
        FROM roles
        WHERE scope = 'tenant' AND (tenant_id IS NULL OR tenant_id = ?)
        ORDER BY tenant_id IS NULL DESC, name ASC
        `,
        [tenantId]
      );
      await conn.end();
      res.json({ ok: true, roles });
    } catch (e) {
      next(e);
    }
  });

  // === CREAR / ADJUNTAR usuario al tenant con rol inicial
  r.post('/', requireManage, async (req, res, next) => {
    try {
      const conn = await getConn();
      const tenantId = req.tenantId;
      let { name, email, password, initialRoleCode } = req.body || {};

      if (!email) {
        await conn.end();
        return res.status(400).json({ ok: false, error: 'EMAIL_REQUIRED' });
      }
      email = String(email).trim().toLowerCase();
      name = (name || '').trim();
      initialRoleCode = initialRoleCode || 'TENANT_VIEWER';

      // validar rol inicial (scope tenant, accesible en este tenant)
      const [[role]] = await conn.query(
        `
        SELECT id, code FROM roles
        WHERE code = ? AND scope = 'tenant' AND (tenant_id IS NULL OR tenant_id = ?)
        `,
        [initialRoleCode, tenantId]
      );
      if (!role) {
        await conn.end();
        return res.status(400).json({ ok: false, error: 'ROLE_INVALID' });
      }

      // ¿Existe usuario por email?
      const [[existing]] = await conn.query(`SELECT * FROM users WHERE email = ?`, [email]);

      let userId;
      let tempPassword = null;
      let action = null;

      if (existing) {
        if (existing.is_super_admin && !req.me?.isSuperAdmin) {
          await conn.end();
          return res.status(403).json({ ok: false, error: 'FORBIDDEN_TARGET' });
        }
        userId = existing.id;
        action = 'attached';
      } else {
        // Crear usuario nuevo (seteando updated_at para esquemas estrictos)
        if (!password) password = makeTempPassword();
        tempPassword = password;
        const password_hash = await bcrypt.hash(password, 10);

        const [ins] = await conn.query(
          `
          INSERT INTO users
            (name, email, password_hash, is_active, is_super_admin, created_at, updated_at)
          VALUES
            (?, ?, ?, 1, 0, NOW(), NOW())
          `,
          [name || null, email, password_hash]
        );
        userId = ins.insertId;
        action = 'created';
      }

      // Adjuntar al tenant con el rol inicial (si no está ya) — sin usar ur.id
      const [[already]] = await conn.query(
        `
        SELECT 1 AS present
        FROM user_roles ur
        WHERE ur.user_id = ? AND ur.role_id = ? AND ur.tenant_id = ?
        LIMIT 1
        `,
        [userId, role.id, tenantId]
      );
      if (!already?.present) {
        await conn.query(
          `INSERT INTO user_roles (user_id, role_id, tenant_id, assigned_at)
           VALUES (?, ?, ?, NOW())`,
          [userId, role.id, tenantId]
        );
      }

      const [[userRow]] = await conn.query(
        `SELECT id, name, email, is_active, created_at FROM users WHERE id = ?`,
        [userId]
      );

      await conn.end();
      res.json({
        ok: true,
        action, // 'created' | 'attached'
        user: userRow,
        initialRole: { id: role.id, code: role.code },
        tempPassword,
      });
    } catch (e) {
      next(e);
    }
  });

  // === TOGGLE de rol dentro del tenant (sin depender de ur.id)
  r.post('/:userId/roles/:roleCode/toggle', requireManage, async (req, res, next) => {
    try {
      const conn = await getConn();
      const tenantId = req.tenantId;
      const { userId, roleCode } = req.params;

      const [[role]] = await conn.query(
        `
        SELECT id, code, scope, tenant_id
        FROM roles
        WHERE code = ? AND scope = 'tenant' AND (tenant_id IS NULL OR tenant_id = ?)
        `,
        [roleCode, tenantId]
      );
      if (!role) {
        await conn.end();
        return res.status(404).json({ ok: false, error: 'ROLE_NOT_FOUND' });
      }

      const [[target]] = await conn.query(
        `SELECT id, is_super_admin FROM users WHERE id = ?`,
        [userId]
      );
      if (!target) {
        await conn.end();
        return res.status(404).json({ ok: false, error: 'USER_NOT_FOUND' });
      }
      if (target.is_super_admin && !req.me?.isSuperAdmin) {
        await conn.end();
        return res.status(403).json({ ok: false, error: 'FORBIDDEN_TARGET' });
      }

      const [[exists]] = await conn.query(
        `
        SELECT 1 AS present
        FROM user_roles
        WHERE user_id = ? AND role_id = ? AND tenant_id = ?
        LIMIT 1
        `,
        [userId, role.id, tenantId]
      );

      if (exists?.present) {
        await conn.query(
          `DELETE FROM user_roles
           WHERE user_id = ? AND role_id = ? AND tenant_id = ?`,
          [userId, role.id, tenantId]
        );
        await conn.end();
        return res.json({ ok: true, action: 'revoked' });
      } else {
        await conn.query(
          `INSERT INTO user_roles (user_id, role_id, tenant_id, assigned_at)
           VALUES (?, ?, ?, NOW())`,
          [userId, role.id, tenantId]
        );
        await conn.end();
        return res.json({ ok: true, action: 'granted' });
      }
    } catch (e) {
      next(e);
    }
  });

  return r;
}
