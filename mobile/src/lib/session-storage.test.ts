/// <reference types="node" />
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories need require */
import { sessionStorage } from './session-storage';

const mockKv = new Map<string, string>();
const mockSecure = new Map<string, string>();
let mockSecureFails = false;
const mockSecureCalls: { op: string; key: string; options?: unknown }[] = [];

jest.mock('./storage', () => ({
  storage: {
    getItem: async (k: string) => mockKv.get(k) ?? null,
    setItem: async (k: string, v: string) => void mockKv.set(k, v),
    removeItem: async (k: string) => void mockKv.delete(k),
  },
}));

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
  getItemAsync: async (key: string, options?: unknown) => {
    if (mockSecureFails) throw new Error('keychain locked');
    mockSecureCalls.push({ op: 'get', key, options });
    return mockSecure.get(key) ?? null;
  },
  setItemAsync: async (key: string, value: string, options?: unknown) => {
    mockSecureCalls.push({ op: 'set', key, options });
    mockSecure.set(key, value);
  },
}));

// A faithful stand-in for expo-crypto's AES-GCM, built on Node's crypto.
jest.mock('expo-crypto', () => {
  const nodeCrypto = require('node:crypto') as typeof import('node:crypto');
  class Key {
    raw: Buffer;
    constructor(raw: Buffer) {
      this.raw = raw;
    }
    static async generate() {
      return new Key(nodeCrypto.randomBytes(32));
    }
    static async import(value: string) {
      return new Key(Buffer.from(value, 'base64'));
    }
    async encoded() {
      return this.raw.toString('base64');
    }
  }
  class Sealed {
    buf: Buffer;
    constructor(buf: Buffer) {
      this.buf = buf;
    }
    static fromCombined(value: string) {
      return new Sealed(Buffer.from(value, 'base64'));
    }
    async combined() {
      return this.buf.toString('base64');
    }
  }
  return {
    AESEncryptionKey: Key,
    AESSealedData: Sealed,
    aesEncryptAsync: async (plain: Uint8Array, key: Key) => {
      const iv = nodeCrypto.randomBytes(12);
      const cipher = nodeCrypto.createCipheriv('aes-256-gcm', key.raw, iv);
      const body = Buffer.concat([cipher.update(plain), cipher.final()]);
      return new Sealed(Buffer.concat([iv, body, cipher.getAuthTag()]));
    },
    aesDecryptAsync: async (sealed: Sealed, key: Key) => {
      const iv = sealed.buf.subarray(0, 12);
      const tag = sealed.buf.subarray(sealed.buf.length - 16);
      const body = sealed.buf.subarray(12, sealed.buf.length - 16);
      const decipher = nodeCrypto.createDecipheriv('aes-256-gcm', key.raw, iv);
      decipher.setAuthTag(tag);
      return new Uint8Array(Buffer.concat([decipher.update(body), decipher.final()]));
    },
  };
});

const session = JSON.stringify({ refresh_token: 'refresh-me-not', user: { id: 'u1' } });

beforeEach(() => {
  mockKv.clear();
  mockSecure.clear();
  mockSecureCalls.length = 0;
  mockSecureFails = false;
});

describe('encrypted session storage', () => {
  it('reads back what it wrote', async () => {
    await sessionStorage.setItem('auth', session);
    expect(await sessionStorage.getItem('auth')).toBe(session);
  });

  it('keeps the refresh token out of the key-value store in plain text', async () => {
    await sessionStorage.setItem('auth', session);
    const stored = [...mockKv.values()].join('');
    expect(stored).not.toContain('refresh-me-not');
    expect(Buffer.from(stored, 'base64').toString('latin1')).not.toContain('refresh-me-not');
  });

  it('keeps the key in SecureStore, readable only while unlocked on this phone', async () => {
    await sessionStorage.setItem('auth', session);
    expect(mockSecure.size).toBe(1);
    const writes = mockSecureCalls.filter((c) => c.op === 'set');
    expect(writes).toHaveLength(1);
    expect(writes[0]?.options).toEqual({ keychainAccessible: 6 });
    // The key itself never lands in the key-value store.
    expect([...mockKv.values()]).not.toContain([...mockSecure.values()][0]);
  });

  it('uses a fresh nonce on every write and one key throughout', async () => {
    await sessionStorage.setItem('auth', session);
    const first = [...mockKv.values()][0];
    await sessionStorage.setItem('auth', session);
    expect([...mockKv.values()][0]).not.toBe(first);
    expect(mockSecureCalls.filter((c) => c.op === 'set')).toHaveLength(1);
  });

  it('creates one key when two writes start together', async () => {
    await Promise.all([sessionStorage.setItem('a', session), sessionStorage.setItem('b', session)]);
    expect(mockSecureCalls.filter((c) => c.op === 'set')).toHaveLength(1);
    expect(await sessionStorage.getItem('a')).toBe(session);
    expect(await sessionStorage.getItem('b')).toBe(session);
  });

  it('reads nothing when nothing was stored, without creating a key', async () => {
    expect(await sessionStorage.getItem('auth')).toBeNull();
    expect(mockSecure.size).toBe(0);
  });

  it('drops ciphertext whose key is gone (a restored backup)', async () => {
    await sessionStorage.setItem('auth', session);
    mockSecure.clear();
    expect(await sessionStorage.getItem('auth')).toBeNull();
    expect(mockKv.size).toBe(0);
    expect(mockSecure.size).toBe(0);
  });

  it('drops ciphertext that the key cannot open', async () => {
    await sessionStorage.setItem('auth', session);
    const key = [...mockSecure.keys()][0] as string;
    mockSecure.set(key, Buffer.alloc(32, 7).toString('base64'));
    expect(await sessionStorage.getItem('auth')).toBeNull();
    expect(mockKv.size).toBe(0);
  });

  it('drops damaged data', async () => {
    await sessionStorage.setItem('auth', session);
    const name = [...mockKv.keys()][0] as string;
    mockKv.set(name, 'not-base64-ciphertext');
    expect(await sessionStorage.getItem('auth')).toBeNull();
    expect(mockKv.size).toBe(0);
  });

  it('removes a session', async () => {
    await sessionStorage.setItem('auth', session);
    await sessionStorage.removeItem('auth');
    expect(await sessionStorage.getItem('auth')).toBeNull();
  });
});

describe('encrypted session storage, edge cases', () => {
  it('keeps the session when the keychain cannot be read', async () => {
    await sessionStorage.setItem('auth', session);
    mockSecureFails = true;
    expect(await sessionStorage.getItem('auth')).toBeNull();
    mockSecureFails = false;
    expect(await sessionStorage.getItem('auth')).toBe(session);
  });
});
