// The vote ledger: every vote the server answered `ok` (minus the ones undone), per seat. After
// the run, the rows of `votes` counted per seat are compared with it: fewer rows than answers is
// a lost vote, more is a duplicated one. Seat ids stay in the ledger file only, never in the report.

export type Comparison = { lost: number; duplicated: number; seats: number };

export function createLedger() {
  const titles = new Map<string, Set<number>>();
  let answeredTwice = new Map<string, number>();

  return {
    voteAnswered(seat: string, titleId: number, status: string) {
      if (status !== 'ok') return;
      const set = titles.get(seat) ?? new Set<number>();
      titles.set(seat, set);
      if (set.has(titleId)) answeredTwice.set(seat, (answeredTwice.get(seat) ?? 0) + 1);
      else set.add(titleId);
    },
    /** `undo_last_vote` answered ok: the row is gone, and the film may be voted again. */
    undone(seat: string, titleId: number) {
      titles.get(seat)?.delete(titleId);
    },
    /** Films answered ok twice for one seat: saved in the ledger file, counted by `check`. */
    answeredTwiceTotal(): number {
      let total = 0;
      for (const n of answeredTwice.values()) total += n;
      return total;
    },
    /** Rows `votes` should hold for each seat. */
    expected(): Record<string, number> {
      const out: Record<string, number> = {};
      for (const [seat, set] of titles) out[seat] = set.size;
      return out;
    },
    /** `counts`: rows found in `votes` per seat. A seat missing from it has none. */
    compare(counts: Record<string, number>): Comparison {
      let lost = 0;
      let duplicated = 0;
      for (const [seat, set] of titles) {
        const found = counts[seat] ?? 0;
        if (found < set.size) lost += set.size - found;
        if (found > set.size) duplicated += found - set.size;
      }
      for (const n of answeredTwice.values()) duplicated += n;
      return { lost, duplicated, seats: titles.size };
    },
    reset() {
      titles.clear();
      answeredTwice = new Map();
    },
  };
}

export type Ledger = ReturnType<typeof createLedger>;

/** Compares two counts-per-seat objects (the ledger file against the database counts). */
export function compareCounts(
  expected: Record<string, number>,
  counts: Record<string, number>,
): Comparison {
  let lost = 0;
  let duplicated = 0;
  for (const [seat, want] of Object.entries(expected)) {
    const found = counts[seat] ?? 0;
    if (found < want) lost += want - found;
    if (found > want) duplicated += found - want;
  }
  return { lost, duplicated, seats: Object.keys(expected).length };
}
