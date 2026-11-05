// When each room starts: evenly over the ramp, with the big rooms spread through it so the
// last minutes are not all rooms of 10. Pure.

export type PlannedRoom = { size: 4 | 10; startAtMs: number };

export function planRooms(options: {
  rooms4: number;
  rooms10: number;
  rampMs: number;
}): PlannedRoom[] {
  const total = options.rooms4 + options.rooms10;
  const plan: PlannedRoom[] = [];
  let bigPlaced = 0;
  for (let i = 0; i < total; i += 1) {
    // Place the k-th big room at the middle of its share of the sequence.
    const nextBigAt = Math.floor(((bigPlaced + 0.5) * total) / Math.max(1, options.rooms10));
    const big = bigPlaced < options.rooms10 && i >= nextBigAt;
    if (big) bigPlaced += 1;
    plan.push({ size: big ? 10 : 4, startAtMs: Math.round((i * options.rampMs) / total) });
  }
  return plan;
}
