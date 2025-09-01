// apps/backend/auth.routes.js
import express from 'express';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const r = express.Router();

const getConn = () =>
  mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  });

/**
 * POST /auth/login
 * Body: { email, password }
 * - Normaliza email
 * - Valida con bcrypt contra users.password_hash
 * - Crea registro en sessions (token, user_id, created_at)
 * - Setea cookie 'session'
 */
r.post('/auth/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!email || !password) {
    return res.status(400).json({ ok: false, error: 'MISSING_FIELDS' });
  }

  const conn = await getConn();
  try {
    const [[user]] = await conn.query(
      `SELECT id, email, password_hash, is_active FROM users WHERE email = ? LIMIT 1`,
      [email]
    );

    if (!user || !user.is_active) {
      await conn.end();
      return res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS' });
    }

    // Validación principal: bcrypt sobre password_hash
    const ok = await bcrypt.compare(password, user.password_hash || '');
    if (!ok) {
      await conn.end();
      return res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    await conn.query(
      `INSERT INTO sessions (user_id, token, created_at) VALUES (?, ?, NOW())`,
      [user.id, token]
    );
    await conn.end();

    // Cookie de sesión (dev-friendly)
    res.cookie('session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false, // en prod => true si usas HTTPS
      path: '/',
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 días
    });

    return res.json({ ok: true });
  } catch (e) {
    await conn.end();
    console.error('[AUTH] login error', e);
    return res.status(500).json({ ok: false, error: 'LOGIN_ERROR' });
  }
});

/**
 * POST /auth/logout
 * - Borra la sesión actual (si existe)
 * - Limpia cookie
 */
r.post('/auth/logout', async (req, res) => {
  const token = req.cookies?.session;
  if (!token) {
    res.clearCookie('session', { path: '/' });
    return res.json({ ok: true });
  }

  const conn = await getConn();
  try {
    await conn.query(`DELETE FROM sessions WHERE token = ?`, [token]);
    await conn.end();
  } catch (e) {
    await conn.end();
    console.error('[AUTH] logout error', e);
  }

  res.clearCookie('session', { path: '/' });
  return res.json({ ok: true });
});

export default r;
