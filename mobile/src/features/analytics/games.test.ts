import { createGamesStore, GAMES_KEEP, readGames } from './games';

function memoryKv() {
  const map = new Map<string, string>();
  return {
    getItemSync: (key: string) => map.get(key) ?? null,
    setItemSync: (key: string, value: string) => void map.set(key, value),
    removeItemSync: (key: string) => void map.delete(key),
  };
}

describe('games played, counted on the phone', () => {
  it('counts a room once, however often it is seen swiping', () => {
    const store = createGamesStore(memoryKv() as never);
    expect(store.getState().countGame('r1')).toBe(true);
    expect(store.getState().countGame('r1')).toBe(false);
    expect(store.getState().countGame('r2')).toBe(true);
    expect(store.getState().played).toBe(2);
  });

  it('reports the first card of a game once, and again for a new game', () => {
    const store = createGamesStore(memoryKv() as never);
    expect(store.getState().markFirstCard('r1')).toBe(true);
    expect(store.getState().markFirstCard('r1')).toBe(false);
    expect(store.getState().markFirstCard('r2')).toBe(true);
  });

  it('survives a restart', () => {
    const kv = memoryKv();
    createGamesStore(kv as never)
      .getState()
      .countGame('r1');
    expect(createGamesStore(kv as never).getState().played).toBe(1);
  });

  it('keeps only the last room ids, not the count', () => {
    const store = createGamesStore(memoryKv() as never);
    for (let i = 0; i < GAMES_KEEP + 5; i += 1) store.getState().countGame(`r${i}`);
    expect(store.getState().counted).toHaveLength(GAMES_KEEP);
    expect(store.getState().played).toBe(GAMES_KEEP + 5);
  });

  it('reads anything unreadable as nothing played', () => {
    expect(readGames({ played: 'many', counted: 'x', firstCard: [1, 'a'] })).toEqual({
      played: 0,
      counted: [],
      firstCard: ['a'],
    });
    expect(readGames(null).played).toBe(0);
  });
});
