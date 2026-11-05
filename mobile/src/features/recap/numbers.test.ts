import { recapNumbers } from './numbers';

const seat = (swipe_count: number) => ({ swipe_count });

describe('the recap numbers (recap.md#the-numbers)', () => {
  it('takes the time from the start to the pick, rounded to the second', () => {
    expect(
      recapNumbers({ started_at: '2026-11-05T20:00:00Z', decided_at: '2026-11-05T20:03:42Z' }, [])
        .seconds,
    ).toBe(222);
    expect(
      recapNumbers(
        { started_at: '2026-11-05T20:00:00.000Z', decided_at: '2026-11-05T20:00:47.600Z' },
        [],
      ).seconds,
    ).toBe(48);
  });

  it('counts people with swipes and sums every seat', () => {
    const numbers = recapNumbers({ started_at: null, decided_at: null }, [
      seat(14),
      seat(0),
      seat(13),
      seat(14),
    ]);
    expect(numbers.people).toBe(3);
    expect(numbers.swipes).toBe(41);
  });

  it('has no time when a date is missing, or the order is wrong', () => {
    expect(
      recapNumbers({ started_at: null, decided_at: '2026-11-05T20:00:00Z' }, []).seconds,
    ).toBeNull();
    expect(
      recapNumbers({ started_at: '2026-11-05T20:00:00Z', decided_at: null }, []).seconds,
    ).toBeNull();
    expect(
      recapNumbers({ started_at: '2026-11-05T20:05:00Z', decided_at: '2026-11-05T20:00:00Z' }, [])
        .seconds,
    ).toBeNull();
  });
});
