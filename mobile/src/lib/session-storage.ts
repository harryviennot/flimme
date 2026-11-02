// Where Supabase keeps the auth session: encrypted with AES-256-GCM, the ciphertext in the
// key-value store, the key in SecureStore (Keychain / Keystore) readable only while this
// phone is unlocked and never copied to another phone by a backup. The expo-secure-store
// plugin keeps `configureAndroidBackup: true`, so Android Auto Backup skips the key too.
// A restored backup therefore has ciphertext and no key: it reads as "no session".
// security.md#the-app, decision 104. Never log what goes through here.
import { AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { storage } from './storage';

const KEY_NAME = 'flimme.session-key';
const VALUE_PREFIX = 'flimme.session.';

const secureOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

let keyPromise: Promise<AESEncryptionKey | null> | undefined;

async function loadKey(create: boolean): Promise<AESEncryptionKey | null> {
  const stored = await SecureStore.getItemAsync(KEY_NAME, secureOptions);
  if (stored) return AESEncryptionKey.import(stored, 'base64');
  if (!create) return null;
  const key = await AESEncryptionKey.generate();
  await SecureStore.setItemAsync(KEY_NAME, await key.encoded('base64'), secureOptions);
  return key;
}

function getKey(create: boolean): Promise<AESEncryptionKey | null> {
  // One lookup at a time, so two first writes never create two keys.
  keyPromise ??= loadKey(create).finally(() => {
    keyPromise = undefined;
  });
  return keyPromise;
}

async function getOrCreateKey(): Promise<AESEncryptionKey> {
  const key = await getKey(true);
  if (key) return key;
  // A concurrent read without `create` answered first: ask again, this time to create.
  return (await getKey(true)) as AESEncryptionKey;
}

export const sessionStorage = {
  async getItem(name: string): Promise<string | null> {
    const stored = await storage.getItem(VALUE_PREFIX + name);
    if (stored === null) return null;
    try {
      const key = await getKey(false);
      if (!key) throw new Error('no key');
      const sealed = AESSealedData.fromCombined(stored);
      return decoder.decode(await aesDecryptAsync(sealed, key));
    } catch {
      // No key (a restored backup), the wrong key, or damaged data: the session is gone.
      await storage.removeItem(VALUE_PREFIX + name);
      return null;
    }
  },

  async setItem(name: string, value: string): Promise<void> {
    const key = await getOrCreateKey();
    // A fresh random nonce on every write (the default).
    const sealed = await aesEncryptAsync(encoder.encode(value), key);
    await storage.setItem(VALUE_PREFIX + name, await sealed.combined('base64'));
  },

  async removeItem(name: string): Promise<void> {
    await storage.removeItem(VALUE_PREFIX + name);
  },
};
