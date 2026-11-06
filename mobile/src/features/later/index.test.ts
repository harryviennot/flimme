import { renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';

import {
  pendingSaves,
  saveSettler,
  savedSession,
  setSaved,
  toggleSaved,
  useSettleSaves,
} from './index';

jest.mock('@/api', () => ({ api: { setFilmSaved: jest.fn(async () => ({ status: 'ok' })) } }));
jest.mock('@/lib/supabase', () => ({ supabase: { auth: { refreshSession: jest.fn() } } }));
jest.mock('@/lib/storage', () => ({
  storage: {
    getItemSync: () => null,
    setItemSync: () => undefined,
    removeItemSync: () => undefined,
  },
}));
const mockOnline = { current: true };
jest.mock('@/features/network', () => ({ useOnline: () => mockOnline.current }));

beforeEach(() => {
  mockOnline.current = true;
  savedSession.getState().reset();
  pendingSaves.setState({ items: [] });
  jest.restoreAllMocks();
  jest.spyOn(saveSettler, 'run').mockResolvedValue();
  jest.spyOn(saveSettler, 'flush').mockResolvedValue();
});

describe('saving from the bookmark', () => {
  it('sets the session, queues the wish and starts a pass', () => {
    expect(toggleSaved(5)).toBe(true);
    expect(savedSession.getState().has(5)).toBe(true);
    expect(pendingSaves.getState().items).toEqual([{ title_id: 5, saved: true }]);
    expect(saveSettler.run).toHaveBeenCalledTimes(1);
  });

  it('a second tap takes it back and keeps one wish per film', () => {
    toggleSaved(5);
    expect(toggleSaved(5)).toBe(false);
    expect(savedSession.getState().has(5)).toBe(false);
    expect(pendingSaves.getState().items).toEqual([{ title_id: 5, saved: false }]);
  });

  it('setSaved sets the state it is given', () => {
    setSaved(8, true);
    expect(savedSession.getState().has(8)).toBe(true);
    expect(pendingSaves.getState().items).toEqual([{ title_id: 8, saved: true }]);
  });
});

describe('useSettleSaves', () => {
  it('flushes when online with saves waiting, and not with none', async () => {
    await renderHook(() => useSettleSaves());
    expect(saveSettler.flush).not.toHaveBeenCalled();
    pendingSaves.getState().put(1, true);
    await renderHook(() => useSettleSaves());
    expect(saveSettler.flush).toHaveBeenCalledTimes(1);
  });

  it('does not flush while offline', async () => {
    mockOnline.current = false;
    pendingSaves.getState().put(1, true);
    await renderHook(() => useSettleSaves());
    expect(saveSettler.flush).not.toHaveBeenCalled();
  });

  it('flushes when the app comes back to the foreground', async () => {
    let listener: (state: string) => void = () => undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, fn: never) => {
      listener = fn;
      return { remove: jest.fn() };
    }) as never);
    await renderHook(() => useSettleSaves());
    pendingSaves.getState().put(1, true);
    listener('background');
    expect(saveSettler.flush).not.toHaveBeenCalled();
    listener('active');
    expect(saveSettler.flush).toHaveBeenCalledTimes(1);
  });
});
