import type { MyProfile } from '@flimme/contract';

import { launchStep, type LaunchInput } from './launch-step';

const named: MyProfile = {
  id: 'u1',
  display_name: 'Léa',
  avatar_key: 'blue',
  country: 'FR',
  language: 'fr',
  created_at: '2026-11-03T00:00:00Z',
};
const unnamed: MyProfile = { ...named, display_name: '' };

const base: LaunchInput = {
  session: { status: 'ok', userId: 'u1', isNew: false },
  sessionFailed: false,
  profile: { state: 'pending' },
  online: true,
  slow: false,
};

const step = (changes: Partial<LaunchInput>) => launchStep({ ...base, ...changes });

describe('launchStep', () => {
  it('goes to Welcome when the profile has no name', () => {
    expect(step({ profile: { state: 'ready', profile: unnamed } })).toEqual({ go: '/welcome' });
  });

  it('goes to Welcome when there is no profile row yet', () => {
    expect(step({ profile: { state: 'ready', profile: null } })).toEqual({ go: '/welcome' });
  });

  it('goes to Home when the profile has a name', () => {
    expect(step({ profile: { state: 'ready', profile: named } })).toEqual({ go: '/play' });
  });

  it('loads while the session or the profile is pending, and says so when slow', () => {
    expect(step({ session: null })).toEqual({ show: 'loading' });
    expect(step({})).toEqual({ show: 'loading' });
    expect(step({ session: null, slow: true })).toEqual({ show: 'slow' });
    expect(step({ slow: true })).toEqual({ show: 'slow' });
  });

  it('shows the offline state when the session is offline and nothing is cached', () => {
    expect(step({ session: { status: 'offline' } })).toEqual({ show: 'offline' });
  });

  it('shows the offline state when the profile could not be read for lack of a network', () => {
    expect(step({ profile: { state: 'failed', network: true } })).toEqual({ show: 'offline' });
    expect(step({ online: false })).toEqual({ show: 'offline' });
  });

  it('goes to Home offline when a named profile is cached', () => {
    expect(
      step({ session: { status: 'offline' }, profile: { state: 'ready', profile: named } }),
    ).toEqual({ go: '/play' });
    expect(step({ online: false, profile: { state: 'ready', profile: named } })).toEqual({
      go: '/play',
    });
  });

  it('shows signInFailed when the session is refused', () => {
    expect(step({ session: { status: 'refused' } })).toEqual({ show: 'signInFailed' });
  });

  it('shows signInFailed when starting the session threw', () => {
    expect(step({ session: null, sessionFailed: true })).toEqual({ show: 'signInFailed' });
  });

  it('shows signInFailed when the profile failed for another reason', () => {
    expect(step({ profile: { state: 'failed', network: false } })).toEqual({
      show: 'signInFailed',
    });
  });
});

describe('launchStep with a kept room', () => {
  const kept = { id: 'room-1', code: '482913' };
  const ready = { state: 'ready', profile: named } as const;

  it('rejoins it for a named profile, and says when slow', () => {
    expect(step({ profile: ready, kept })).toEqual({ rejoin: kept, show: 'loading' });
    expect(step({ profile: ready, kept, slow: true })).toEqual({ rejoin: kept, show: 'slow' });
  });

  it('goes to the route of an ok rejoin, and Home after any other answer', () => {
    expect(
      step({ profile: ready, kept, rejoin: { state: 'route', route: '/room/room-1/swipe' } }),
    ).toEqual({ go: '/room/room-1/swipe' });
    expect(step({ profile: ready, kept, rejoin: { state: 'home' } })).toEqual({ go: '/play' });
  });

  it('goes Home offline, without a rejoin', () => {
    expect(step({ profile: ready, kept, online: false })).toEqual({ go: '/play' });
    expect(step({ profile: ready, kept, session: { status: 'offline' } })).toEqual({
      go: '/play',
    });
  });

  it('ignores the kept room without a name', () => {
    expect(step({ profile: { state: 'ready', profile: unnamed }, kept })).toEqual({
      go: '/welcome',
    });
  });
});
