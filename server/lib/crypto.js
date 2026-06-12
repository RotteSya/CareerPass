import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

/**
 * Sealed box for secrets at rest (IMAP passwords).
 * AES-256-GCM, key derived from APP_SECRET via scrypt.
 * Format: base64(iv).base64(tag).base64(ciphertext)
 */
export function createBox(secret) {
  const key = scryptSync(String(secret), 'goojob.box.v1', 32);
  return {
    seal(plain) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return [iv, tag, ct].map((b) => b.toString('base64')).join('.');
    },
    open(sealed) {
      const [iv, tag, ct] = String(sealed).split('.').map((s) => Buffer.from(s, 'base64'));
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
    },
  };
}
