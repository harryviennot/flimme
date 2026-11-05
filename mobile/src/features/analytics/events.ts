import { track, trackWhenRoomKnown, type EventProps } from '@/lib/analytics';

import { selectionChanged } from '@/features/host/settings';

import { joinStatus } from './journey';

// Small helpers so a screen fires its event with one line. Every event still goes through the
// wrapper (`@/lib/analytics`), which applies the modes, the opt-out and the kids' rule.

/**
 * `api.join_room` answered. A seat taken is about a room the phone is entering, so it waits for
 * the room's cap; a refusal is about no room at all and goes at once.
 */
export function trackJoinAttempt(via: EventProps<'join:attempt_finish'>['via'], status: string) {
  const answer = joinStatus(status);
  if (answer === 'ok') trackWhenRoomKnown('join:attempt_finish', { via, status: answer });
  else track('join:attempt_finish', { via, status: answer });
}

/** The name screen or the join sheet's first-time form was submitted. Editing a profile is not onboarding. */
export function trackNameSubmit(input: {
  editing?: boolean;
  source: EventProps<'onboarding:name_submit'>['source'];
  hasAvatar: boolean;
}) {
  if (input.editing) return;
  track('onboarding:name_submit', { has_avatar: input.hasAvatar, source: input.source });
}

/** An invite link opened the app. Only whether it carried a room reference, never the link. */
export function trackLinkOpen(hasRoomRef: boolean) {
  track('join:link_open', { has_room_ref: hasRoomRef });
}

/**
 * The host opened a room. The first release has no moods, and the seen rule and quality are the
 * mode's defaults. Waits for the room's cap (kids' rule).
 */
export function trackRoomCreated(input: { serviceCount: number; runtimeMax: number | null }) {
  trackWhenRoomKnown('room:create_finish', {
    mode: 'quick_match',
    mood_count: 0,
    has_time_budget: input.runtimeMax !== null,
    seen_rule: 'hide_seen',
    quality: 'standard',
    service_count: input.serviceCount,
  });
  trackWhenRoomKnown('lobby:services_submit', {
    service_count: input.serviceCount,
    step: 'room_setup',
  });
}

/** Done on the services sheet: only a changed selection counts as setting services. */
export function trackServicesSaved(start: readonly number[], selection: readonly number[]) {
  if (!selectionChanged(start, selection)) return;
  track('lobby:services_submit', { service_count: selection.length, step: 'lobby' });
}
