
import crypto from 'crypto';
const SECRET = process.env.SECRET_KEY || null;
const deriveKey = (s) => crypto.createHash('sha256').update(String(s)).digest();
export function encryptMaybe(plainText) {
  if (!SECRET) return { plain: plainText };
  const iv = crypto.randomBytes(12);
  const key = deriveKey(SECRET);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { enc: enc.toString('base64'), iv: iv.toString('base64'), tag: tag.toString('base64') };
}
export function decryptMaybe(obj) {
  if (!obj) return null;
  if (obj.plain) return obj.plain;
  if (!SECRET) return null;
  const key = deriveKey(SECRET);
  const iv = Buffer.from(obj.iv, 'base64');
  const tag = Buffer.from(obj.tag, 'base64');
  const enc = Buffer.from(obj.enc, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}
