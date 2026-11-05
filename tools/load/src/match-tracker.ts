// A match reaching the other phones: from the matching vote's answer to each other bot's
// Realtime `match` event. An event that arrives before the answer counts as 0 ms (the phone
// would not have waited). Times come from one clock on one machine. A seat counts once per
// film: the Final Cut's result later repeats the film's `match` event and is not a reception.

export function createMatchTracker() {
  type Entry = {
    voter?: string;
    answeredAt?: number;
    seen: Map<string, number>;
    counted: Set<string>;
  };
  const entries = new Map<string, Entry>();
  const out: number[] = [];
  const key = (room: string, title: number) => `${room}:${title}`;
  const entryFor = (room: string, title: number) => {
    const k = key(room, title);
    let entry = entries.get(k);
    if (!entry) {
      entry = { seen: new Map(), counted: new Set() };
      entries.set(k, entry);
    }
    return entry;
  };
  const count = (entry: Entry, seat: string, at: number) => {
    if (seat === entry.voter || entry.counted.has(seat)) return;
    entry.counted.add(seat);
    out.push(Math.max(0, at - entry.answeredAt!));
  };

  return {
    voteAnswered(room: string, title: number, voter: string, at: number) {
      const entry = entryFor(room, title);
      if (entry.answeredAt !== undefined) return;
      entry.voter = voter;
      entry.answeredAt = at;
      for (const [seat, seenAt] of entry.seen) count(entry, seat, seenAt);
      entry.seen.clear();
    },
    eventSeen(room: string, title: number, seat: string, at: number) {
      const entry = entryFor(room, title);
      if (entry.answeredAt === undefined) {
        if (!entry.seen.has(seat)) entry.seen.set(seat, at);
        return;
      }
      count(entry, seat, at);
    },
    forgetRoom(room: string) {
      for (const k of [...entries.keys()]) if (k.startsWith(`${room}:`)) entries.delete(k);
    },
    samples(): number[] {
      return [...out];
    },
  };
}
