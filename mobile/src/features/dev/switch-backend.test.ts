import { createDevStore } from './store';
import { switchBackend } from './switch-backend';

const available = {
  available: true,
  config: {
    supabaseUrl: 'https://x.supabase.co',
    supabasePublishableKey: 'k',
    serverUrl: 'https://api.x.test',
  },
} as const;
const missing = {
  available: false,
  reason: 'Set EXPO_PUBLIC_STAGING_SUPABASE_URL in .env.local.',
} as const;

describe('switching backend', () => {
  it('saves the choice and reloads when staging is available', () => {
    const store = createDevStore(undefined);
    const reload = jest.fn();
    expect(switchBackend('staging', { status: available, store, reload })).toBe('switched');
    expect(store.getState().backend).toBe('staging');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('refuses staging, keeps the choice and does not reload when its values are missing', () => {
    const store = createDevStore(undefined);
    const reload = jest.fn();
    expect(switchBackend('staging', { status: missing, store, reload })).toBe('unavailable');
    expect(store.getState().backend).toBe('local');
    expect(reload).not.toHaveBeenCalled();
  });

  it('does nothing when the backend is already the chosen one', () => {
    const store = createDevStore(undefined);
    const reload = jest.fn();
    expect(switchBackend('local', { status: missing, store, reload })).toBe('same');
    expect(reload).not.toHaveBeenCalled();
  });

  it('always lets you go back to local', () => {
    const store = createDevStore(undefined);
    store.getState().setBackend('staging');
    const reload = jest.fn();
    expect(switchBackend('local', { status: missing, store, reload })).toBe('switched');
    expect(store.getState().backend).toBe('local');
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
