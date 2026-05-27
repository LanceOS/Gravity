import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '../../../env.js';

function getKey(secret: string) {
  return createHash('sha256').update(secret).digest();
}

function encryptWithSecret(value: string, secret: string) {
  if (!value) {
    return null;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

function decryptWithSecret(value: string | null | undefined, secret: string) {
  if (!value) {
    return '';
  }

  try {
    const [ivPart, tagPart, encryptedPart] = value.split('.');
    if (!ivPart || !tagPart || !encryptedPart) {
      return '';
    }

    const decipher = createDecipheriv('aes-256-gcm', getKey(secret), Buffer.from(ivPart, 'base64'));
    decipher.setAuthTag(Buffer.from(tagPart, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedPart, 'base64')),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch {
    return '';
  }
}

export function encryptSecret(value: string) {
  return encryptWithSecret(value, env.betterAuthSecret);
}

export function decryptSecret(value: string | null | undefined) {
  return decryptWithSecret(value, env.betterAuthSecret);
}

export function encryptNodePrivateKey(value: string) {
  return encryptWithSecret(value, env.nodeIdentityMasterKey);
}

export function decryptNodePrivateKey(value: string | null | undefined) {
  return decryptWithSecret(value, env.nodeIdentityMasterKey);
}