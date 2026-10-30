import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

// Code personnel : 4 chiffres. Haché avec scrypt + sel aléatoire.
export const PIN_RE = /^\d{4}$/;

export function hashPin(pin) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(pin), salt, 32);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPin(pin, stored) {
  if (!stored || typeof pin !== 'string') return false;
  const [saltHex, hashHex] = stored.split(':');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(pin, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(expected, actual);
}

export const newToken = () => randomBytes(32).toString('hex');

// Anti-devinette : 5 essais ratés → blocage 5 minutes pour ce prénom.
export function createLoginLimiter({ maxFails = 5, lockMs = 5 * 60 * 1000 } = {}) {
  const fails = new Map();
  return {
    lockedFor(id) {
      const f = fails.get(id);
      if (!f || f.count < maxFails) return 0;
      const left = f.until - Date.now();
      if (left <= 0) { fails.delete(id); return 0; }
      return left;
    },
    fail(id) {
      const f = fails.get(id) || { count: 0, until: 0 };
      f.count += 1;
      if (f.count >= maxFails) f.until = Date.now() + lockMs;
      fails.set(id, f);
    },
    success(id) { fails.delete(id); }
  };
}
