import type { MyFilmEditResult } from '@flimme/contract';

export type SeenOutcome = 'ok' | 'not_found' | 'failed';

/**
 * Marks a film seen or not seen. `not_found` (the film left the list elsewhere) is its own
 * outcome; a rate limit or a failed call is `failed`, and the sheet turns the button back.
 */
export async function changeSeen(
  titleId: number,
  seen: boolean,
  set: (args: { title_id: number; seen: boolean }) => Promise<MyFilmEditResult>,
): Promise<SeenOutcome> {
  try {
    const answer = await set({ title_id: titleId, seen });
    if (answer.status === 'ok') return 'ok';
    return answer.status === 'not_found' ? 'not_found' : 'failed';
  } catch {
    return 'failed';
  }
}
