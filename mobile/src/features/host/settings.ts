// Host setup's choices without JSX: the time budget and age cap options, the services to start
// on, and what "changed" means (host-setup.md#the-prefill).

export type TimeChoice = 'any' | 'under105' | 'under120';
export type AgeChoice = 'adults' | '16' | '12' | '10' | 'all';

export const TIME_CHOICES: readonly TimeChoice[] = ['any', 'under105', 'under120'];
export const AGE_CHOICES: readonly AgeChoice[] = ['adults', '16', '12', '10', 'all'];

export const DEFAULT_TIME: TimeChoice = 'any';
export const DEFAULT_AGE: AgeChoice = 'adults';

const RUNTIME_MAX: Record<TimeChoice, number | null> = { any: null, under105: 105, under120: 120 };
const MAX_AGE: Record<AgeChoice, number | null> = {
  adults: null,
  '16': 16,
  '12': 12,
  '10': 10,
  all: 0,
};

/** The room settings the two choices stand for. Both keys are always present. */
export function toRoomSettings(time: TimeChoice, age: AgeChoice) {
  return { runtime_max: RUNTIME_MAX[time], max_age: MAX_AGE[age] };
}

/**
 * The selection to start on: the saved ids the country's list contains, in the list's order.
 * Saved ids the list no longer has are ignored here and stay saved.
 */
export function initialSelection(saved: readonly number[], listed: readonly number[]): number[] {
  return listed.filter((id) => saved.includes(id));
}

/** Whether two selections differ; order doesn't count. */
export function selectionChanged(start: readonly number[], current: readonly number[]): boolean {
  if (start.length !== current.length) return true;
  return current.some((id) => !start.includes(id));
}
