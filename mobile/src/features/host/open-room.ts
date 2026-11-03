// What Open the room does (host-setup.md#what-open-the-room-does), without JSX: save the services
// when they changed, then create the room, and turn every answer into an outcome the screen shows.
import type { CreateRoomResult, SetMyProvidersResult } from '@flimme/contract';

export type OpenOutcome =
  | { kind: 'opened'; roomId: string }
  | { kind: 'name_required' }
  | { kind: 'unsupported' }
  /** A bug on our side (an answer the picker can't cause): generic toast and a report. */
  | { kind: 'bug'; reason: string }
  | { kind: 'network' };

export type OpenRoomDeps = {
  setMyProviders: (args: { provider_ids: number[] }) => Promise<SetMyProvidersResult>;
  createRoom: (args: {
    mode: 'quick_match';
    settings: { runtime_max: number | null; max_age: number | null };
  }) => Promise<CreateRoomResult>;
};

export type OpenRoomInput = {
  selection: number[];
  /** Whether the selection differs from the one the screen started on. */
  changed: boolean;
  settings: { runtime_max: number | null; max_age: number | null };
};

/**
 * Saves the services first and only when they changed (the host's seat copies the profile's
 * services at creation, so the order matters), then creates the room. Any failure of the first
 * call stops here and no room is made. Every answer, and every thrown call, becomes an outcome.
 */
export async function openRoom(
  { selection, changed, settings }: OpenRoomInput,
  deps: OpenRoomDeps,
): Promise<OpenOutcome> {
  try {
    if (changed) {
      const saved = await deps.setMyProviders({ provider_ids: selection });
      if (saved.status !== 'ok') return { kind: 'bug', reason: `set_my_providers:${saved.status}` };
    }
    const answer = await deps.createRoom({ mode: 'quick_match', settings });
    switch (answer.status) {
      case 'ok':
        return { kind: 'opened', roomId: answer.room_id };
      case 'name_required':
        return { kind: 'name_required' };
      case 'country_required':
        return { kind: 'unsupported' };
      case 'unknown_mode':
      case 'invalid_settings':
        return { kind: 'bug', reason: `create_room:${answer.status}` };
    }
  } catch {
    return { kind: 'network' };
  }
}
