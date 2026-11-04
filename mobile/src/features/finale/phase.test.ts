import { phaseOf, statusKey, takesTaps, ticks } from './phase';

const base = {
  ready: true,
  lockIn: 'idle' as const,
  meLocked: false,
  ended: false,
  everyoneLocked: false,
  noOpenRound: false,
};

describe('the footer phase', () => {
  it('loads, then votes', () => {
    expect(phaseOf({ ...base, ready: false })).toBe('loading');
    expect(phaseOf(base)).toBe('voting');
  });

  it('is sending, then locked', () => {
    expect(phaseOf({ ...base, lockIn: 'sending' })).toBe('sending');
    expect(phaseOf({ ...base, lockIn: 'locked' })).toBe('locked');
  });

  it('is locked for a restart where the server says this seat locked in', () => {
    expect(phaseOf({ ...base, meLocked: true })).toBe('locked');
  });

  it('counts at zero, whatever the phone was doing', () => {
    expect(phaseOf({ ...base, ended: true })).toBe('counting');
    expect(phaseOf({ ...base, ended: true, lockIn: 'sending' })).toBe('counting');
    expect(phaseOf({ ...base, ended: true, lockIn: 'locked' })).toBe('counting');
  });

  it('counts when everyone locked in early, a late lock-in came back closed or no round is open', () => {
    expect(phaseOf({ ...base, everyoneLocked: true })).toBe('counting');
    expect(phaseOf({ ...base, lockIn: 'closed' })).toBe('counting');
    expect(phaseOf({ ...base, noOpenRound: true })).toBe('counting');
  });

  it('takes taps and ticks only while voting (a phone that never locked in sends nothing at zero)', () => {
    expect(takesTaps('voting')).toBe(true);
    for (const phase of ['loading', 'sending', 'locked', 'counting'] as const) {
      expect(takesTaps(phase)).toBe(false);
      expect(ticks(phase)).toBe(false);
    }
    expect(ticks('voting')).toBe(true);
  });
});

describe('the status line', () => {
  const idle = {
    phase: 'voting' as const,
    online: true,
    sendFailed: false,
    liftVetoHint: false,
    countingSlow: false,
  };

  it('says Sending, or the offline line', () => {
    expect(statusKey({ ...idle, phase: 'sending' })).toBe('hint.sending');
    expect(statusKey({ ...idle, phase: 'sending', online: false })).toBe('hint.offline');
  });

  it('says the send failed, or how to lift the veto, while voting', () => {
    expect(statusKey({ ...idle, sendFailed: true })).toBe('error.send');
    expect(statusKey({ ...idle, liftVetoHint: true })).toBe('hint.liftVeto');
    expect(statusKey(idle)).toBeNull();
  });

  it('admits it is still counting after a while', () => {
    expect(statusKey({ ...idle, phase: 'counting' })).toBeNull();
    expect(statusKey({ ...idle, phase: 'counting', countingSlow: true })).toBe('counting.slow');
  });

  it('is empty once locked', () => {
    expect(statusKey({ ...idle, phase: 'locked' })).toBeNull();
  });
});
