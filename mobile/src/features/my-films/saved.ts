import type { MyFilmEditResult } from '@flimme/contract';

export type SavedOutcome = 'ok' | 'not_found' | 'failed';

/**
 * Saves a film for Later or takes it out, from the film sheet (which needs the network, like its
 * other edits). `not_found` is its own outcome; a rate limit or a failed call is `failed`.
 */
export async function changeSaved(
  titleId: number,
  saved: boolean,
  set: (args: { title_id: number; saved: boolean }) => Promise<MyFilmEditResult>,
): Promise<SavedOutcome> {
  try {
    const answer = await set({ title_id: titleId, saved });
    if (answer.status === 'ok') return 'ok';
    return answer.status === 'not_found' ? 'not_found' : 'failed';
  } catch {
    return 'failed';
  }
}
