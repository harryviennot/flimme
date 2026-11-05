import type { MyProfile } from '@flimme/contract';

import type { KeptRoom } from '@/features/room/kept-room';
import type { SessionAnswer } from '@/features/session';

/** `/welcome`, `/home`, or the kept room's route once the rejoin answered `ok`. */
export type LaunchRoute = string;
export type LaunchView = 'loading' | 'slow' | 'offline' | 'signInFailed';
export type LaunchStep =
  | { go: LaunchRoute }
  | { show: LaunchView }
  /** Rejoin the kept room (M4.22) while the loading view shows. */
  | { rejoin: KeptRoom; show: 'loading' | 'slow' };

/** What the rejoin call has given: nothing yet, a route (`ok`), or "go Home" (anything else). */
export type RejoinRead = { state: 'none' } | { state: 'route'; route: string } | { state: 'home' };

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
  /** The room the phone keeps, if any; read only for a named profile. */
  kept?: KeptRoom | null;
  rejoin?: RejoinRead;
};

function route(input: LaunchInput, profile: MyProfile | null): LaunchStep {
  if (!profile || profile.display_name === '') return { go: '/welcome' };
  const { kept, rejoin, session, online, slow } = input;
  // Offline, or no session to call with: Home, and the kept room stays for the next launch.
  if (!kept || !online || session?.status !== 'ok') return { go: '/play' };
  if (rejoin?.state === 'route') return { go: rejoin.route };
  if (rejoin?.state === 'home') return { go: '/play' };
  return { rejoin: kept, show: slow ? 'slow' : 'loading' };
}

/**
 * Where the splash goes, or what it shows, first match (splash.md#what-happens-in-order and
 * #states). No name yet goes to Welcome, a named player with a kept room rejoins it, any other
 * named player goes Home; offline, a cached profile decides.
 */
export function launchStep(input: LaunchInput): LaunchStep {
  const { session, sessionFailed, profile, online, slow } = input;
  const waiting: LaunchStep = { show: slow ? 'slow' : 'loading' };

  if (sessionFailed) return { show: 'signInFailed' };
  if (!session) return waiting;
  if (session.status === 'refused') return { show: 'signInFailed' };

  if (profile.state === 'ready') return route(input, profile.profile);
  if (session.status === 'offline') return { show: 'offline' };
  if (profile.state === 'failed') return { show: profile.network ? 'offline' : 'signInFailed' };
  return online ? waiting : { show: 'offline' };
}
