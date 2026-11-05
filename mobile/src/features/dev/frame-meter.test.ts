import { addFrame, EMPTY_STATS, FRAME_BUDGET_MS, summarize } from './frame-meter';

describe('frame meter', () => {
  it('reads nothing before any frame', () => {
    expect(summarize(EMPTY_STATS)).toEqual({ fps: 0, jankyPercent: 0 });
  });

  it('averages the frames per second over the frames measured', () => {
    let stats = EMPTY_STATS;
    for (let i = 0; i < 60; i++) stats = addFrame(stats, FRAME_BUDGET_MS);
    const { fps, jankyPercent } = summarize(stats);
    expect(fps).toBeCloseTo(60);
    expect(jankyPercent).toBe(0);
  });

  it('counts a frame over 1.5 budgets as janky', () => {
    let stats = EMPTY_STATS;
    stats = addFrame(stats, FRAME_BUDGET_MS * 1.5); // exactly 1.5: not over
    stats = addFrame(stats, FRAME_BUDGET_MS * 1.6);
    stats = addFrame(stats, FRAME_BUDGET_MS);
    stats = addFrame(stats, FRAME_BUDGET_MS);
    expect(summarize(stats).jankyPercent).toBe(25);
  });
});
