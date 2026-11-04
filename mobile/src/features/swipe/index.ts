import { api } from '@/api';
import { keptRoomStore } from '@/features/room/kept-room';
import { ROOM_KEY } from '@/features/room/queries';
import { queryClient } from '@/lib/query-client';
import { reportError } from '@/lib/sentry';
import { supabase } from '@/lib/supabase';

import { createVoteQueue } from './vote-queue';

export type { QueuedVote, VoteQueue, VoteQueueEvent } from './vote-queue';

/**
 * The app's one vote queue, saved on the device. Call `voteQueue.flush()` when the room opens
 * (a restart sends what was waiting before anything else), on reconnect and on foreground.
 */
export const voteQueue = createVoteQueue({
  castVote: (args) => api.castVote(args),
  undoLastVote: (args) => api.undoLastVote(args),
  refreshSession: async () => {
    const { error } = await supabase.auth.refreshSession();
    if (error) throw error;
  },
  invalidateRoom: (roomId) => void queryClient.invalidateQueries({ queryKey: ROOM_KEY(roomId) }),
  report: (error) => reportError(error),
  keptRoomId: () => keptRoomStore.getState().room?.id ?? null,
});
