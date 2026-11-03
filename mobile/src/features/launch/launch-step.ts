import type { MyProfile } from '@flimme/contract';

import type { SessionAnswer } from '@/features/session';

export type LaunchRoute = '/welcome' | '/home';
export type LaunchView = 'loading' | 'slow' | 'offline' | 'signInFailed';
export type LaunchStep = { go: LaunchRoute } | { show: LaunchView };

/** What reading the profile has given so far; a cached copy counts as `ready`. */
export type ProfileRead =
  | { state: 'pending' }
  | { state: 'ready'; profile: MyProfile | null }
  | { state: 'failed'; network: boolean };

export type LaunchInput = {
  /** The session's answer, or `null` while it is pending. */
  session: SessionAnswer | null;
  /** Starting the session threw a real error. */
  sessionFailed: boolean;
  profile: ProfileRead;
  online: boolean;
  /** Waiting for more than the slow threshold. */
  slow: boolean;
};

function route(profile: MyProfile | null): LaunchStep {
  return { go: profile && profile.display_name !== '' ? '/home' : '/welcome' };
}

/**
 * Where the splash goes, or what it shows, first match (splash.md#what-happens-in-order and
 * #states). No name yet goes to Welcome, a named player to Home; offline, a cached profile
 * decides.
 */
export function launchStep(input: LaunchInput): LaunchStep {
  const { session, sessionFailed, profile, online, slow } = input;
  const waiting: LaunchStep = { show: slow ? 'slow' : 'loading' };

  if (sessionFailed) return { show: 'signInFailed' };
  if (!session) return waiting;
  if (session.status === 'refused') return { show: 'signInFailed' };

  if (profile.state === 'ready') return route(profile.profile);
  if (session.status === 'offline') return { show: 'offline' };
  if (profile.state === 'failed') return { show: profile.network ? 'offline' : 'signInFailed' };
  return online ? waiting : { show: 'offline' };
}
