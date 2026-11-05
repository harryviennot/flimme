import { capIsToday, createSoloCapStore, parisDay, readSavedCap } from './cap';

jest.mock('@/lib/storage', () => ({
  storage: { getItemSync: () => null, setItemSync: jest.fn(), removeItemSync: jest.fn() },
}));

describe('the solo cap day', () => {
  it('reads the day in Paris, not in UTC', () => {
    expect(parisDay(new Date('2026-11-05T23:30:00Z'))).toBe('2026-11-06');
    expect(parisDay(new Date('2026-11-05T10:00:00Z'))).toBe('2026-11-05');
  });

  it('is the cap today only on the day of the last daily_limit', () => {
    expect(capIsToday('2026-11-05', new Date('2026-11-05T12:00:00Z'))).toBe(true);
    expect(capIsToday('2026-11-05', new Date('2026-11-05T23:30:00Z'))).toBe(false);
    expect(capIsToday(null)).toBe(false);
  });

  it('keeps the day and reads nonsense as none', () => {
    const store = createSoloCapStore();
    store.getState().reached(new Date('2026-11-05T12:00:00Z'));
    expect(store.getState().day).toBe('2026-11-05');
    expect(readSavedCap({ day: 5 })).toEqual({ day: null });
    expect(readSavedCap(null)).toEqual({ day: null });
  });

  it('forgets the day, so Play alone asks the server again (Dev menu)', () => {
    const store = createSoloCapStore();
    store.getState().reached(new Date('2026-11-05T12:00:00Z'));
    store.getState().forget();
    expect(store.getState().day).toBeNull();
  });
});
