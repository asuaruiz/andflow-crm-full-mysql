// apps/backend/db.js
// Multi-tenant SaaS DB helpers (MySQL8 + mysql2/promise)
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const {
  MYSQL_HOST = '127.0.0.1',
  MYSQL_PORT = '3306',
  MYSQL_USER = 'root',
  MYSQL_PASSWORD = '',
  MYSQL_DATABASE = 'andflow',
  SESSION_TTL_HOURS = '168', // 7 días
  BCRYPT_COST = '10',
} = process.env;

// -------------------- utils --------------------
function nowUtc() { return new Date(); }
function hex(bytes = 32) { return crypto.randomBytes(bytes).toString('hex'); }
function addHours(d, h) { const x = new Date(d); x.setHours(x.getHours() + h); return x; }

// -------------------- bootstrap --------------------
export async function waitForMySQL({ retries = 30, delayMs = 2000 } = {}) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const c = await mysql.createConnection({
        host: MYSQL_HOST, port: +MYSQL_PORT, user: MYSQL_USER, password: MYSQL_PASSWORD
      });
      await c.end();
      return true;
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

export async function ensureDatabaseAndTables() {
  // Crea DB
  const admin = await mysql.createConnection({
    host: MYSQL_HOST, port: +MYSQL_PORT, user: MYSQL_USER, password: MYSQL_PASSWORD, multipleStatements: true
  });
  await admin.query(
    `CREATE DATABASE IF NOT EXISTS \`${MYSQL_DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
  );
  await admin.end();

  const conn = await mysql.createConnection({
    host: MYSQL_HOST, port: +MYSQL_PORT, user: MYSQL_USER, password: MYSQL_PASSWORD,
    database: MYSQL_DATABASE, multipleStatements: true
  });

  // ---------- Tenants ----------
  await conn.query(`
    CREATE TABLE IF NOT EXISTS tenants (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      rut VARCHAR(32) NOT NULL,
      name VARCHAR(191) NOT NULL,
      subdomain VARCHAR(191) NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      UNIQUE KEY ux_tenants_rut (rut),
      UNIQUE KEY ux_tenants_name (name)
    ) ENGINE=InnoDB;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS tenant_settings (
      tenant_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
      settings_json JSON NOT NULL,
      updated_at DATETIME NOT NULL,
      CONSTRAINT fk_tenant_settings_t FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  // ---------- Users / Sessions ----------
  await conn.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(191) NOT NULL UNIQUE,
      password_hash VARCHAR(191) NOT NULL,
      name VARCHAR(191) NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      is_super_admin TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      last_login_at DATETIME NULL
    ) ENGINE=InnoDB;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      token CHAR(64) NOT NULL UNIQUE,
      selected_tenant_id BIGINT UNSIGNED NULL,
      created_at DATETIME NOT NULL,
      expires_at DATETIME NOT NULL,
      last_seen_at DATETIME NOT NULL,
      user_agent VARCHAR(255) NULL,
      ip VARCHAR(64) NULL,
      CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_sessions_tenant FOREIGN KEY (selected_tenant_id) REFERENCES tenants(id) ON DELETE SET NULL
    ) ENGINE=InnoDB;
  `);
  await conn.query(`CREATE INDEX IF NOT EXISTS ix_sessions_user ON sessions (user_id);`).catch(() => {});
  await conn.query(`CREATE INDEX IF NOT EXISTS ix_sessions_expires ON sessions (expires_at);`).catch(() => {});

  // ---------- RBAC ----------
  await conn.query(`
    CREATE TABLE IF NOT EXISTS permissions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(150) NOT NULL UNIQUE,
      description VARCHAR(255) NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    ) ENGINE=InnoDB;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS roles (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(64) NOT NULL,
      tenant_id BIGINT UNSIGNED NULL,
      name VARCHAR(100) NOT NULL,
      scope ENUM('platform','tenant') NOT NULL DEFAULT 'tenant',
      description VARCHAR(255) NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      UNIQUE KEY ux_roles_tenant_name (tenant_id, name),
      CONSTRAINT fk_roles_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  await conn.query(`
    CREATE UNIQUE INDEX ux_roles_code_scope_tnorm
    ON roles (code, scope, (IFNULL(tenant_id, 0)));
  `).catch(() => {});

  await conn.query(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id BIGINT UNSIGNED NOT NULL,
      permission_id BIGINT UNSIGNED NOT NULL,
      granted_at DATETIME NOT NULL,
      PRIMARY KEY (role_id, permission_id),
      KEY fk_rp_perm (permission_id),
      CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
      CONSTRAINT fk_rp_perm FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS user_roles (
      user_id BIGINT UNSIGNED NOT NULL,
      role_id BIGINT UNSIGNED NOT NULL,
      tenant_id BIGINT UNSIGNED NULL,
      assigned_at DATETIME NOT NULL,
      PRIMARY KEY (user_id, role_id),
      KEY ix_user_roles_tenant (tenant_id),
      CONSTRAINT fk_ur_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_ur_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
      CONSTRAINT fk_ur_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  // ---------- Modules ----------
  await conn.query(`
    CREATE TABLE IF NOT EXISTS modules (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`key\` VARCHAR(100) NOT NULL UNIQUE,
      label VARCHAR(150) NOT NULL,
      path VARCHAR(191) NOT NULL,
      icon VARCHAR(80) NULL,
      sort_order INT NOT NULL DEFAULT 100,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    ) ENGINE=InnoDB;
  `);

  // ---------- Shopify por tenant ----------
  await conn.query(`
    CREATE TABLE IF NOT EXISTS shopify_config (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id BIGINT UNSIGNED NOT NULL,
      domain VARCHAR(191) NOT NULL,
      token_json JSON NOT NULL,
      saved_at DATETIME NOT NULL,
      UNIQUE KEY ux_shopify_tenant (tenant_id),
      CONSTRAINT fk_shopify_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  // ---------- Maestra de Productos por tenant ----------
  await conn.query(`
    CREATE TABLE IF NOT EXISTS products_master (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id BIGINT UNSIGNED NOT NULL,

      sku          VARCHAR(80)  NOT NULL,
      sku_proveedor      VARCHAR(120) NULL,
      ean                VARCHAR(64)  NULL,

      nombre             VARCHAR(255) NOT NULL,
      marca              VARCHAR(120) NULL,
      especie            VARCHAR(120) NULL,
      categoria          VARCHAR(120) NULL,
      subcategoria       VARCHAR(120) NULL,

      desc_breve         VARCHAR(512) NULL,
      desc_larga         TEXT         NULL,
      imagenes           JSON         NULL,
      proveedor          VARCHAR(150) NULL,

      disponible         TINYINT(1)   NOT NULL DEFAULT 1,
      uc                 VARCHAR(32)  NULL,
      dif                VARCHAR(32)  NULL,

      costo_neto               DECIMAL(14,2) NULL,
      costo_con_iva            DECIMAL(14,2) NULL,
      psp                      DECIMAL(14,2) NULL,
      precio_referencia        DECIMAL(14,2) NULL,
      pvp                      DECIMAL(14,2) NULL,
      pvp_sin_iva              DECIMAL(14,2) NULL,
      margen_bruto_pct         DECIMAL(7,3)  NULL,
      margen_con_iva_pct       DECIMAL(7,3)  NULL,
      margen_bruto_clp         DECIMAL(14,2) NULL,
      precio_min_estr_sin_iva  DECIMAL(14,2) NULL,
      precio_min_estr_con_iva  DECIMAL(14,2) NULL,
      tipo_venta               VARCHAR(64)   NULL,
      precio_descuento         DECIMAL(14,2) NULL,
      margen_total             DECIMAL(7,3)  NULL,
      venta_total              DECIMAL(14,2) NULL,
      margen_general           DECIMAL(14,2) NULL,

      peso_kg             DECIMAL(10,3) NULL,
      unidad_peso         VARCHAR(16)   NULL,
      dimensiones         VARCHAR(64)   NULL,
      fragil              TINYINT(1)    NOT NULL DEFAULT 0,
      estacionalidad      VARCHAR(64)   NULL,
      recurrente          TINYINT(1)    NOT NULL DEFAULT 0,

      etiquetas_shopify   TEXT          NULL,
      activo_en_tienda    TINYINT(1)    NOT NULL DEFAULT 1,
      segmentacion_ticket VARCHAR(64)   NULL,
      nivel_rotacion      VARCHAR(64)   NULL,
      tipo_producto_consumo VARCHAR(64) NULL,
      observacion         TEXT          NULL,

      created_at          DATETIME NOT NULL,
      updated_at          DATETIME NOT NULL,

      UNIQUE KEY ux_tenant_sku (tenant_id, sku),
      KEY ix_tenant (tenant_id),
      KEY ix_ean (ean),
      CONSTRAINT fk_products_master_t FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  // ---------- Contabilidad (tablas puente multi-tenant, sin alterar esquema existente) ----------
  await conn.query(`
    CREATE TABLE IF NOT EXISTS accounts_tenants (
      account_id INT NOT NULL,
      tenant_id  BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY (account_id, tenant_id),
      KEY ix_at_tenant (tenant_id),
      CONSTRAINT fk_at_acc FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
      CONSTRAINT fk_at_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS journal_entries_tenants (
      entry_id  BIGINT NOT NULL,
      tenant_id BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY (entry_id, tenant_id),
      KEY ix_jet_tenant (tenant_id),
      CONSTRAINT fk_jet_entry FOREIGN KEY (entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE,
      CONSTRAINT fk_jet_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  // ---------- Seeds mínimos ----------
  const now = nowUtc();

  // Permisos base
  const basePerms = [
    { code: 'platform.tenants.view',   desc: 'Ver tenants' },
    { code: 'platform.tenants.manage', desc: 'Crear/editar tenants' },
    { code: 'platform.users.manage',   desc: 'Gestionar usuarios plataforma' },
    { code: 'platform.modules.manage', desc: 'Gestionar módulos globales' },

    { code: 'tenant.settings.manage',  desc: 'Configurar ajustes del tenant' },
    { code: 'tenant.users.manage',     desc: 'Gestionar usuarios del tenant' },

    { code: 'module.kpis.view',        desc: 'Ver KPIs' },
    { code: 'module.inventario.view',  desc: 'Ver inventario' },
    { code: 'module.inventario.edit',  desc: 'Editar inventario' },
    { code: 'module.ventas.view',      desc: 'Ver ventas' },
    { code: 'module.ventas.create',    desc: 'Crear ventas' },
    { code: 'module.clientes.view',    desc: 'Ver clientes' },
    { code: 'module.clientes.edit',    desc: 'Editar clientes' },
    { code: 'module.config.view',      desc: 'Ver configuración' },
  ];
  for (const p of basePerms) {
    await conn.execute(
      `INSERT INTO permissions (code, description, created_at, updated_at)
       VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE description=VALUES(description), updated_at=VALUES(updated_at)`,
      [p.code, p.desc, now, now]
    );
  }

  // Módulos base
  const baseModules = [
    { key: 'kpis',       label: 'KPIs',            path: '/kpis',               icon: 'BarChart3',  sort: 10 },
    { key: 'inventario', label: 'Inventario',      path: '/inventario/maestra', icon: 'Boxes',      sort: 20 },
    { key: 'ventas',     label: 'Ventas (CRM)',    path: '/ventas',             icon: 'ShoppingCart', sort: 30 },
    { key: 'clientes',   label: 'Clientes',        path: '/clientes',           icon: 'Users',      sort: 40 },
    { key: 'config',     label: 'Configuración',   path: '/config',             icon: 'Settings',   sort: 90 },
  ];
  for (const m of baseModules) {
    await conn.execute(
      `INSERT INTO modules (\`key\`, label, path, icon, sort_order, is_active, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE label=VALUES(label), path=VALUES(path), icon=VALUES(icon),
         sort_order=VALUES(sort_order), is_active=VALUES(is_active), updated_at=VALUES(updated_at)`,
      [m.key, m.label, m.path, m.icon, m.sort, 1, now, now]
    );
  }

  // Roles base plantilla (tenant_id NULL)
  const rolesBase = [
    { code: 'PLATFORM_SUPERADMIN', name: 'Platform SuperAdmin', scope: 'platform', desc: 'Acceso total plataforma' },
    { code: 'PLATFORM_SUPPORT',    name: 'Platform Support',    scope: 'platform', desc: 'Soporte solo lectura' },
    { code: 'PLATFORM_BILLING',    name: 'Platform Billing',    scope: 'platform', desc: 'Facturación del SaaS' },

    { code: 'TENANT_OWNER',        name: 'Owner',               scope: 'tenant',   desc: 'Dueño del tenant' },
    { code: 'TENANT_ADMIN',        name: 'Admin',               scope: 'tenant',   desc: 'Admin del tenant' },
    { code: 'TENANT_MANAGER',      name: 'Manager',             scope: 'tenant',   desc: 'Operaciones' },
    { code: 'TENANT_SALES',        name: 'Sales Rep',           scope: 'tenant',   desc: 'Ventas' },
    { code: 'TENANT_INVENTORY',    name: 'Inventory Clerk',     scope: 'tenant',   desc: 'Inventario' },
    { code: 'TENANT_ACCOUNTANT',   name: 'Accountant',          scope: 'tenant',   desc: 'Contabilidad' },
    { code: 'TENANT_VIEWER',       name: 'Viewer',              scope: 'tenant',   desc: 'Solo lectura' },
  ];
  for (const r of rolesBase) {
    await conn.execute(
      `INSERT INTO roles (code, name, scope, tenant_id, description, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), updated_at=VALUES(updated_at)`,
      [r.code, r.name, r.scope, null, r.desc, now, now]
    );
  }

  // Otorga TODOS los permisos al Platform SuperAdmin
  await conn.execute(
    `INSERT IGNORE INTO role_permissions (role_id, permission_id, granted_at)
     SELECT r.id, p.id, ?
     FROM roles r CROSS JOIN permissions p
     WHERE r.code='PLATFORM_SUPERADMIN' AND r.scope='platform' AND r.tenant_id IS NULL`,
    [now]
  );

  await conn.end();
}


// -------------------- Shopify por TENANT --------------------
export async function upsertShopify({ tenantId, domain, tokenJson }) {
  const conn = await mysql.createConnection({
    host: MYSQL_HOST, port: +MYSQL_PORT, user: MYSQL_USER, password: MYSQL_PASSWORD, database: MYSQL_DATABASE
  });
  const now = nowUtc();
  await conn.execute(
    `INSERT INTO shopify_config (tenant_id, domain, token_json, saved_at)
     VALUES (?,?,?,?)
     ON DUPLICATE KEY UPDATE domain=VALUES(domain), token_json=VALUES(token_json), saved_at=VALUES(saved_at)`,
    [tenantId, domain, JSON.stringify(tokenJson), now]
  );
  await conn.end();
  return { ok: true };
}

export async function readShopifyByTenant(tenantId) {
  const conn = await mysql.createConnection({
    host: MYSQL_HOST, port: +MYSQL_PORT, user: MYSQL_USER, password: MYSQL_PASSWORD, database: MYSQL_DATABASE
  });
  const [rows] = await conn.execute(
    `SELECT domain, token_json, saved_at FROM shopify_config WHERE tenant_id=?`, [tenantId]
  );
  await conn.end();
  if (!rows.length) return null;
  const r = rows[0];
  return { domain: r.domain, tokenJson: r.token_json, savedAt: r.saved_at };
}

export async function clearShopifyByTenant(tenantId) {
  const conn = await mysql.createConnection({
    host: MYSQL_HOST, port: +MYSQL_PORT, user: MYSQL_USER, password: MYSQL_PASSWORD, database: MYSQL_DATABASE
  });
  await conn.execute(`DELETE FROM shopify_config WHERE tenant_id=?`, [tenantId]);
  await conn.end();
  return { ok: true };
}

// -------------------- Tenants (empresas) --------------------
export async function createTenant({ rut, name, subdomain = null }) {
  const conn = await mysql.createConnection({
    host: MYSQL_HOST, port: +MYSQL_PORT, user: MYSQL_USER, password: MYSQL_PASSWORD, database: MYSQL_DATABASE
  });
  const now = nowUtc();
  await conn.execute(
    `INSERT INTO tenants (rut, name, subdomain, is_active, created_at, updated_at)
     VALUES (?,?,?,?,?,?)`,
    [rut, name, subdomain, 1, now, now]
  );
  const [[row]] = await conn.query(`SELECT LAST_INSERT_ID() as id`);
  // settings por defecto
  const defaults = { theme: { primary: '#263e8b', secondary: '#22c55e', card: '#ffffff', bg: '#f7f7fb' } };
  await conn.execute(
    `INSERT INTO tenant_settings (tenant_id, settings_json, updated_at) VALUES (?,?,?)`,
    [row.id, JSON.stringify(defaults), now]
  );
  await conn.end();
  return { id: row.id };
}

export async function listTenants() {
  const conn = await mysql.createConnection({
    host: MYSQL_HOST, port: +MYSQL_PORT, user: MYSQL_USER, password: MYSQL_PASSWORD, database: MYSQL_DATABASE
  });
  const [rows] = await conn.query(
    `SELECT id, rut, name, subdomain, is_active, created_at, updated_at
     FROM tenants ORDER BY created_at DESC`
  );
  await conn.end();
  return rows;
}

export async function setTenantActive(tenantId, isActive) {
  const conn = await mysql.createConnection({
    host: MYSQL_HOST, port: +MYSQL_PORT, user: MYSQL_USER, password: MYSQL_PASSWORD, database: MYSQL_DATABASE
  });
  await conn.execute(
    `UPDATE tenants SET is_active=?, updated_at=? WHERE id=?`,
    [isActive ? 1 : 0, nowUtc(), tenantId]
  );
  await conn.end();
  return { ok: true };
}

export async function getTenantSettings(tenantId) {
  const conn = await mysql.createConnection({
    host: MYSQL_HOST, port: +MYSQL_PORT, user: MYSQL_USER, password: MYSQL_PASSWORD, database: MYSQL_DATABASE
  });
  const [rows] = await conn.execute(
    `SELECT settings_json, updated_at FROM tenant_settings WHERE tenant_id=?`, [tenantId]
  );
  await conn.end();
  if (!rows.length) return { settings: {}, updatedAt: null };
  return { settings: rows[0].settings_json, updatedAt: rows[0].updated_at };
}

export async function updateTenantSettings(tenantId, settingsJson) {
  const conn = await mysql.createConnection({
    host: MYSQL_HOST, port: +MYSQL_PORT, user: MYSQL_USER, password: MYSQL_PASSWORD, database: MYSQL_DATABASE
  });
  await conn.execute(
    `INSERT INTO tenant_settings (tenant_id, settings_json, updated_at)
     VALUES (?,?,?)
     ON DUPLICATE KEY UPDATE settings_json=VALUES(settings_json), updated_at=VALUES(updated_at)`,
    [tenantId, JSON.stringify(settingsJson), nowUtc()]
  );
  await conn.end();
  return { ok: true };
}

// -------------------- Users / Auth / Session --------------------
export async function createUser({ email, name = null, password, isActive = true, isSuperAdmin = false }) {
  const conn = await mysql.createConnection({
    host: MYSQL_HOST, port: +MYSQL_PORT, user: MYSQL_USER, password: MYSQL_PASSWORD, database: MYSQL_DATABASE
  });
  const now = nowUtc();
  const cost = Number(BCRYPT_COST) || 10;
  const hash = await bcrypt.hash(password, cost);
  await conn.execute(
    `INSERT INTO users (email, password_hash, name, is_active, is_super_admin, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?)`,
    [email.trim().toLowerCase(), hash, name, isActive ? 1 : 0, isSuperAdmin ? 1 : 0, now, now]
  );
  const [[row]] = await conn.query(`SELECT LAST_INSERT_ID() as id`);
  await conn.end();
  return { id: row.id };
}

export async function findUserByEmail(email) {
  const conn = await mysql.createConnection({
    host: MYSQL_HOST, port: +MYSQL_PORT, user: MYSQL_USER, password: MYSQL_PASSWORD, database: MYSQL_DATABASE
  });
  const [rows] = await conn.execute(
    `SELECT * FROM users WHERE email=? LIMIT 1`, [email.trim().toLowerCase()]
  );
  await conn.end();
  return rows[0] || null;
}

export async function setUserActive(userId, isActive) {
  const conn = await mysql.createConnection({
    host: MYSQL_HOST, port: +MYSQL_PORT, user: MYSQL_USER, password: MYSQL_PASSWORD, database: MYSQL_DATABASE
  });
  await conn.execute(
    `UPDATE users SET is_active=?, updated_at=? WHERE id=?`,
    [isActive ? 1 : 0, nowUtc(), userId]
  );
  await conn.end();
  return { ok: true };
}

export async function loginUser({ email, password, userAgent = null, ip = null, preferTenantId = null }) {
  const user = await findUserByEmail(email);
  if (!user || !user.is_active) return null;
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return null;

  let selectedTenantId = preferTenantId || null;
  if (!user.is_super_admin) {
    const conn0 = await mysql.createConnection({
      host: MYSQL_HOST, port: +MYSQL_PORT, user: MYSQL_USER, password: MYSQL_PASSWORD, database: MYSQL_DATABASE
    });
    const [rs] = await conn0.query(
      `SELECT DISTINCT ur.tenant_id FROM user_roles ur WHERE ur.user_id=? AND ur.tenant_id IS NOT NULL LIMIT 1`,
      [user.id]
    );
    await conn0.end();
    selectedTenantId = rs.length ? rs[0].tenant_id : null;
    if (!selectedTenantId) return null; // usuario sin tenant asignado
  }

  const conn = await mysql.createConnection({
    host: MYSQL_HOST, port: +MYSQL_PORT, user: MYSQL_USER, password: MYSQL_PASSWORD, database: MYSQL_DATABASE
  });
  const token = hex(32);
  const now = nowUtc();
  const expires = addHours(now, Number(SESSION_TTL_HOURS) || 168);
  await conn.execute(
    `INSERT INTO sessions (user_id, token, selected_tenant_id, created_at, expires_at, last_seen_at, user_agent, ip)
     VALUES (?,?,?,?,?,?,?,?)`,
    [user.id, token, selectedTenantId, now, expires, now, userAgent, ip]
  );
  await conn.execute(`UPDATE users SET last_login_at=?, updated_at=? WHERE id=?`, [now, now, user.id]);
  await conn.end();
  return { token, userId: user.id, tenantId: selectedTenantId, expiresAt: expires };
}

export async function getSession(token) {
  if (!token) return null;
  const conn = await mysql.createConnection({
    host: MYSQL_HOST, port: +MYSQL_PORT, user: MYSQL_USER, password: MYSQL_PASSWORD, database: MYSQL_DATABASE
  });
  const [rows] = await conn.execute(
    `SELECT s.*, u.email, u.name, u.is_active, u.is_super_admin
     FROM sessions s JOIN users u ON u.id=s.user_id
     WHERE s.token=? AND s.expires_at > NOW() LIMIT 1`,
    [token]
  );
  if (!rows.length) { await conn.end(); return null; }
  const sess = rows[0];
  await conn.execute(`UPDATE sessions SET last_seen_at=? WHERE id=?`, [nowUtc(), sess.id]);
  await conn.end();
  return sess;
}

export async function setSessionTenant(token, tenantId) {
  const conn = await mysql.createConnection({
    host: MYSQL_HOST, port: +MYSQL_PORT, user: MYSQL_USER, password: MYSQL_PASSWORD, database: MYSQL_DATABASE
  });
  await conn.execute(`UPDATE sessions SET selected_tenant_id=? WHERE token=?`, [tenantId, token]);
  await conn.end();
  return { ok: true };
}

export async function logoutSession(token) {
  const conn = await mysql.createConnection({
    host: MYSQL_HOST, port: +MYSQL_PORT, user: MYSQL_USER, password: MYSQL_PASSWORD, database: MYSQL_DATABASE
  });
  await conn.execute(`DELETE FROM sessions WHERE token=?`, [token]);
  await conn.end();
  return { ok: true };
}

// -------------------- RBAC helpers --------------------
export async function ensureRole({ code, name, scope = 'tenant', tenantId = null, description = null }) {
  const conn = await mysql.createConnection({
    host: MYSQL_HOST, port: +MYSQL_PORT, user: MYSQL_USER, password: MYSQL_PASSWORD, database: MYSQL_DATABASE
  });
  const now = nowUtc();
  await conn.execute(
    `INSERT INTO roles (code, name, scope, tenant_id, description, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), updated_at=VALUES(updated_at)`,
    [code, name, scope, tenantId, description, now, now]
  );
  await conn.end();
  return { ok: true };
}

export async function ensurePermission(code, description = null) {
  const conn = await mysql.createConnection({
    host: MYSQL_HOST, port: +MYSQL_PORT, user: MYSQL_USER, password: MYSQL_PASSWORD, database: MYSQL_DATABASE
  });
  const now = nowUtc();
  await conn.execute(
    `INSERT INTO permissions (code, description, created_at, updated_at)
     VALUES (?,?,?,?)
     ON DUPLICATE KEY UPDATE description=VALUES(description), updated_at=VALUES(updated_at)`,
    [code, description, now, now]
  );
  await conn.end();
  return { ok: true };
}

export async function grantPermissionToRole({ roleId, permissionCode }) {
  const conn = await mysql.createConnection({
    host: MYSQL_HOST, port: +MYSQL_PORT, user: MYSQL_USER, password: MYSQL_PASSWORD, database: MYSQL_DATABASE
  });
  const now = nowUtc();
  const [[perm]] = await conn.query(`SELECT id FROM permissions WHERE code=?`, [permissionCode]);
  if (!perm) { await conn.end(); throw new Error('Permiso inexistente'); }
  await conn.execute(
    `INSERT IGNORE INTO role_permissions (role_id, permission_id, granted_at) VALUES (?,?,?)`,
    [roleId, perm.id, now]
  );
  await conn.end();
  return { ok: true };
}

export async function assignRoleToUser({ userId, roleName, tenantId = null }) {
  const conn = await mysql.createConnection({
    host: MYSQL_HOST, port: +MYSQL_PORT, user: MYSQL_USER, password: MYSQL_PASSWORD, database: MYSQL_DATABASE
  });
  const args = tenantId === null ? [roleName] : [roleName, tenantId];
  const where = tenantId === null ? `tenant_id IS NULL` : `tenant_id=?`;
  const [[role]] = await conn.query(`SELECT id FROM roles WHERE name=? AND ${where} LIMIT 1`, args);
  if (!role) { await conn.end(); throw new Error('Rol no existe en ese scope'); }
  const now = nowUtc();
  await conn.execute(
    `INSERT IGNORE INTO user_roles (user_id, role_id, tenant_id, assigned_at)
     VALUES (?,?,?,?)`,
    [userId, role.id, tenantId, now]
  );
  await conn.end();
  return { ok: true };
}

export async function setUserRolesForTenant({ userId, tenantId, roleNames = [] }) {
  const conn = await mysql.createConnection({
    host: MYSQL_HOST, port: +MYSQL_PORT, user: MYSQL_USER, password: MYSQL_PASSWORD, database: MYSQL_DATABASE
  });
  await conn.execute(
    `DELETE ur FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=? AND ur.tenant_id=?`,
    [userId, tenantId]
  );
  if (roleNames.length) {
    const [roles] = await conn.query(
      `SELECT id FROM roles WHERE tenant_id=? AND name IN (${roleNames.map(() => '?').join(',')})`,
      [tenantId, ...roleNames]
    );
    const now = nowUtc();
    for (const r of roles) {
      await conn.execute(
        `INSERT IGNORE INTO user_roles (user_id, role_id, tenant_id, assigned_at) VALUES (?,?,?,?)`,
        [userId, r.id, tenantId, now]
      );
    }
  }
  await conn.end();
  return { ok: true };
}

export async function getUserWithRolesAndPerms({ userId, tenantId = null }) {
  const conn = await mysql.createConnection({
    host: MYSQL_HOST, port: +MYSQL_PORT, user: MYSQL_USER, password: MYSQL_PASSWORD, database: MYSQL_DATABASE
  });

  const [[u]] = await conn.query(
    `SELECT id,email,name,is_active,is_super_admin,created_at,updated_at,last_login_at FROM users WHERE id=?`,
    [userId]
  );
  if (!u) { await conn.end(); return null; }

  const [roles] = await conn.query(
    `SELECT r.name, r.tenant_id FROM user_roles ur
     JOIN roles r ON r.id=ur.role_id
     WHERE ur.user_id=? AND (r.tenant_id IS NULL OR r.tenant_id<=>?)`,
    [userId, tenantId]
  );

  const [perms] = await conn.query(
    `SELECT DISTINCT p.code FROM permissions p
     JOIN role_permissions rp ON rp.permission_id=p.id
     JOIN roles r ON r.id=rp.role_id
     JOIN user_roles ur ON ur.role_id=r.id AND ur.user_id=?
     WHERE (r.tenant_id IS NULL OR r.tenant_id<=>?)`,
    [userId, tenantId]
  );

  await conn.end();
  return {
    id: u.id, email: u.email, name: u.name,
    isActive: !!u.is_active, isSuperAdmin: !!u.is_super_admin,
    roles: roles.map(r => ({ name: r.name, tenantId: r.tenant_id })),
    permissions: perms.map(p => p.code),
  };
}

// -------------------- Modules helpers --------------------
export async function listModules({ onlyActive = true } = {}) {
  const conn = await mysql.createConnection({
    host: MYSQL_HOST, port: +MYSQL_PORT, user: MYSQL_USER, password: MYSQL_PASSWORD, database: MYSQL_DATABASE
  });
  const [rows] = await conn.execute(
    `SELECT id,\`key\`,label,path,icon,sort_order,is_active,created_at,updated_at
     FROM modules ${onlyActive ? 'WHERE is_active=1' : ''} ORDER BY sort_order ASC, label ASC`
  );
  await conn.end();
  return rows;
}

export async function upsertModule({ id = null, key, label, path, icon = null, sort_order = 100, is_active = 1 }) {
  const conn = await mysql.createConnection({
    host: MYSQL_HOST, port: +MYSQL_PORT, user: MYSQL_USER, password: MYSQL_PASSWORD, database: MYSQL_DATABASE
  });
  const now = nowUtc();
  if (!id) {
    await conn.execute(
      `INSERT INTO modules (\`key\`,label,path,icon,sort_order,is_active,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [key, label, path, icon, sort_order, is_active ? 1 : 0, now, now]
    );
    await conn.execute(
      `INSERT INTO permissions (code, description, created_at, updated_at)
       VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE description=VALUES(description), updated_at=VALUES(updated_at)`,
      [`module.${key}.view`, `Ver módulo ${label}`, now, now]
    );
    await conn.execute(
      `INSERT INTO permissions (code, description, created_at, updated_at)
       VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE description=VALUES(description), updated_at=VALUES(updated_at)`,
      [`module.${key}.edit`, `Editar módulo ${label}`, now, now]
    );
  } else {
    await conn.execute(
      `UPDATE modules SET label=?,path=?,icon=?,sort_order=?,is_active=?,updated_at=? WHERE id=?`,
      [label, path, icon, sort_order, is_active ? 1 : 0, now, id]
    );
  }
  await conn.end();
  return { ok: true };
}

export async function deleteModule(id) {
  const conn = await mysql.createConnection({
    host: MYSQL_HOST, port: +MYSQL_PORT, user: MYSQL_USER, password: MYSQL_PASSWORD, database: MYSQL_DATABASE
  });
  await conn.execute(`DELETE FROM modules WHERE id=?`, [id]);
  await conn.end();
  return { ok: true };
}

// -------------------- Admin listings --------------------
export async function listUsers() {
  const conn = await mysql.createConnection({
    host: MYSQL_HOST, port: +MYSQL_PORT, user: MYSQL_USER, password: MYSQL_PASSWORD, database: MYSQL_DATABASE
  });
  const [rows] = await conn.query(`
    SELECT u.id,u.email,u.name,u.is_active,u.is_super_admin,u.created_at,u.updated_at,
           GROUP_CONCAT(CONCAT(r.name, IF(r.tenant_id IS NULL,' (platform)','')) ORDER BY r.tenant_id IS NULL DESC, r.name SEPARATOR ', ') as roles
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id=u.id
    LEFT JOIN roles r ON r.id=ur.role_id
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `);
  await conn.end();
  return rows;
}

export async function listRoles({ tenantId = null } = {}) {
  const conn = await mysql.createConnection({
    host: MYSQL_HOST, port: +MYSQL_PORT, user: MYSQL_USER, password: MYSQL_PASSWORD, database: MYSQL_DATABASE
  });
  const where = tenantId === null ? `tenant_id IS NULL` : `tenant_id=?`;
  const params = tenantId === null ? [] : [tenantId];
  const [rows] = await conn.query(
    `SELECT id, code, scope, tenant_id, name, description, created_at, updated_at
     FROM roles WHERE ${where}
     ORDER BY name ASC`,
    params
  );
  await conn.end();
  return rows;
}

export async function listPermissions() {
  const conn = await mysql.createConnection({
    host: MYSQL_HOST, port: +MYSQL_PORT, user: MYSQL_USER, password: MYSQL_PASSWORD, database: MYSQL_DATABASE
  });
  const [rows] = await conn.query(
    `SELECT id,code,description,created_at,updated_at FROM permissions ORDER BY code ASC`
  );
  await conn.end();
  return rows;
}

export async function setRolePermissions({ roleId, permissionCodes = [] }) {
  const conn = await mysql.createConnection({
    host: MYSQL_HOST, port: +MYSQL_PORT, user: MYSQL_USER, password: MYSQL_PASSWORD, database: MYSQL_DATABASE
  });
  const now = nowUtc();
  await conn.execute(`DELETE FROM role_permissions WHERE role_id=?`, [roleId]);
  if (permissionCodes.length) {
    const [perms] = await conn.query(
      `SELECT id FROM permissions WHERE code IN (${permissionCodes.map(() => '?').join(',')})`,
      permissionCodes
    );
    for (const p of perms) {
      await conn.execute(
        `INSERT INTO role_permissions (role_id, permission_id, granted_at) VALUES (?,?,?)`,
        [roleId, p.id, now]
      );
    }
  }
  await conn.end();
  return { ok: true };
}
