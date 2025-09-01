// apps/backend/requirePlatformPermission.js
import { getSession, getUserWithRolesAndPerms } from './db.js';

export function requirePlatformPermission(permCode) {
  return async (req, res, next) => {
    try {
      const token = req.cookies?.session;
      const sess = await getSession(token);
      if (!sess) return res.status(401).json({ ok:false, error:'No autenticado' });

      // Plataforma: evaluamos roles/permisos con tenantId = null
      const me = await getUserWithRolesAndPerms({ userId: sess.user_id, tenantId: null });
      const has = me?.permissions?.includes(permCode) || me?.isSuperAdmin;
      if (!has) return res.status(403).json({ ok:false, error:'No autorizado' });

      req.user = me; // por si lo necesitas
      next();
    } catch (e) {
      next(e);
    }
  };
}
