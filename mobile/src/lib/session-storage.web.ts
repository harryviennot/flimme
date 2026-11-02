// Web build (the invite page): no SecureStore or native AES here, so the session goes to the
// browser's own storage, as Supabase does by default on the web.
import { storage } from './storage.web';

export const sessionStorage = storage;
