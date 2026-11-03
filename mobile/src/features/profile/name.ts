// The name screen's rules, without JSX: what makes a name sendable, the color to start on, and
// what each answer of `update_profile` means for the screen (name.md#states-and-answers).
import { ApiError, AVATAR_KEYS, type MyProfile, type UpdateProfileResult } from '@flimme/contract';
import type { QueryClient } from '@tanstack/react-query';

import type { AvatarColor } from '@/components/ui/avatar';
import { storage, type KeyValueStore } from '@/lib/storage';

import { saveCachedProfile } from './cache';
import { toAvatarColor } from './device';
import { MY_PROFILE_KEY } from './use-my-profile';

export { initialOf, isNameValid, NAME_MAX } from '@/lib/player-name';

/**
 * The color to start on: the current one when editing (blue when the key isn't one of the six,
 * as everywhere), and a random one of the six the first time, so friends rarely start alike.
 */
export function initialColor(editing: boolean, key: string, random: () => number): AvatarColor {
  if (editing) return toAvatarColor(key);
  return (
    AVATAR_KEYS[Math.min(AVATAR_KEYS.length - 1, Math.floor(random() * AVATAR_KEYS.length))] ??
    'blue'
  );
}

export type SubmitOutcome =
  | { kind: 'saved'; display_name: string; avatar_key: string }
  | { kind: 'invalid' }
  | { kind: 'notAllowed' }
  | { kind: 'offline' }
  | { kind: 'failed' };

export type SubmitDeps = {
  online: boolean;
  updateProfile: (args: {
    display_name: string;
    avatar_key: string;
  }) => Promise<UpdateProfileResult>;
};

/** Saves the name and color. Every answer, and every failure, becomes an outcome. */
export async function submitName(
  name: string,
  color: AvatarColor,
  { online, updateProfile }: SubmitDeps,
): Promise<SubmitOutcome> {
  if (!online) return { kind: 'offline' };
  try {
    const answer = await updateProfile({ display_name: name.trim(), avatar_key: color });
    switch (answer.status) {
      case 'ok':
        return { kind: 'saved', display_name: answer.display_name, avatar_key: answer.avatar_key };
      case 'invalid_name':
        return { kind: 'invalid' };
      case 'name_not_allowed':
        return { kind: 'notAllowed' };
      case 'unknown_avatar':
        // The picker can't send an unknown key: this is a bug, shown as a failed request.
        return { kind: 'failed' };
    }
  } catch (error) {
    return error instanceof ApiError && error.kind === 'network'
      ? { kind: 'offline' }
      : { kind: 'failed' };
  }
}

/** Puts the saved name and avatar in the profile query and the copy kept on the device. */
export function applySavedProfile(
  client: QueryClient,
  saved: { display_name: string; avatar_key: string },
  kv: KeyValueStore = storage,
): void {
  const current = client.getQueryData<MyProfile | null>(MY_PROFILE_KEY);
  if (!current) return;
  const next = { ...current, ...saved };
  client.setQueryData(MY_PROFILE_KEY, next);
  saveCachedProfile(next, kv);
}
