// What Start does in Play alone setup (solo-setup.md#what-start-does), without JSX: save the
// services when they changed, then `api.start_solo`, and turn every answer into an outcome.
import type { SetMyProvidersResult, StartSoloResult } from '@flimme/contract';

export type StartOutcome =
  /** The room is open. `dealing`: the deck isn't dealt yet, the swipe screen waits for it. */
  | { kind: 'started'; roomId: string; dealing: boolean }
  | { kind: 'too_few'; eligible: number }
  /** The daily cap is reached: the cap card. */
  | { kind: 'cap' }
  | { kind: 'name_required' }
  | { kind: 'unsupported' }
  | { kind: 'rate_limited' }
  /** A bug on our side (an answer the form can't cause): generic toast and a report. */
  | { kind: 'bug'; reason: string }
  | { kind: 'network' };

export type StartSoloDeps = {
  setMyProviders: (args: { provider_ids: number[] }) => Promise<SetMyProvidersResult>;
  startSolo: (args: {
    settings: { runtime_max: number | null; max_age: number | null };
  }) => Promise<StartSoloResult>;
};

export type StartSoloInput = {
  selection: number[];
  /** Whether the selection differs from the one the screen started on. */
  changed: boolean;
  settings: { runtime_max: number | null; max_age: number | null };
};

export async function startSoloGame(
  { selection, changed, settings }: StartSoloInput,
  deps: StartSoloDeps,
): Promise<StartOutcome> {
  try {
    if (changed) {
      const saved = await deps.setMyProviders({ provider_ids: selection });
      if (saved.status !== 'ok') return { kind: 'bug', reason: `set_my_providers:${saved.status}` };
    }
    const answer = await deps.startSolo({ settings });
    switch (answer.status) {
      case 'ok':
        return { kind: 'started', roomId: answer.room_id, dealing: false };
      case 'dealing':
        return { kind: 'started', roomId: answer.room_id, dealing: true };
      case 'too_few_films':
        return { kind: 'too_few', eligible: answer.eligible };
      case 'daily_limit':
        return { kind: 'cap' };
      case 'name_required':
        return { kind: 'name_required' };
      case 'country_required':
        return { kind: 'unsupported' };
      case 'rate_limited':
        return { kind: 'rate_limited' };
      case 'invalid_settings':
        return { kind: 'bug', reason: `start_solo:${answer.status}` };
    }
  } catch {
    return { kind: 'network' };
  }
}
