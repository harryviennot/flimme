import { msUntil, recordServerTime, resetServerTime, serverNow } from './server-time';

describe('server time', () => {
  afterEach(() => resetServerTime());

  it('uses the phone clock until the server has answered', () => {
    expect(serverNow(1_000)).toBe(1_000);
  });

  it('corrects a phone that runs ahead of the server', () => {
    // The phone thinks it's 10 s later than the server does.
    recordServerTime(new Date(100_000).toISOString(), 109_000, 111_000);
    expect(serverNow(110_000)).toBe(100_000);
  });

  it('counts down to a deadline on the server clock and never below zero', () => {
    recordServerTime(new Date(100_000).toISOString(), 109_000, 111_000);
    expect(msUntil(new Date(145_000).toISOString(), 110_000)).toBe(45_000);
    expect(msUntil(new Date(90_000).toISOString(), 110_000)).toBe(0);
  });

  it('ignores answers it cannot read', () => {
    recordServerTime('not a date', 0, 10);
    recordServerTime(new Date(0).toISOString(), 10, 5);
    expect(serverNow(500)).toBe(500);
    expect(msUntil('not a date')).toBe(0);
  });
});
