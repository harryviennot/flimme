import type { ToastProps } from '@/components/ui/toast';

// Remove has no confirmation (film-sheet.md): the tile leaves at once and a toast offers Undo.
// The call waits until the toast closes (Q41.6), or goes now if the app leaves the foreground.
// Undo cancels it. This lives outside the sheet, which has closed by then.

export type RemoveAnswer = 'ok' | 'not_found' | 'rate_limited';

export type RemoveDeps = {
  hide: (titleId: number) => void;
  unhide: (titleId: number) => void;
  /** Reads My films again; resolves when the new pages are in. */
  refresh: () => Promise<unknown>;
  remove: (titleId: number) => Promise<RemoveAnswer>;
  toast: (toast: ToastProps & { duration?: number; onDismiss?: () => void }) => void;
  hideToast: () => void;
  copy: { removed: string; undo: string; failed: string };
};

/** How long the Undo toast stays. */
export const UNDO_MS = 5000;

const pending = new Map<number, () => Promise<void>>();

export function startRemove(titleId: number, deps: RemoveDeps): void {
  deps.hide(titleId);
  let sent = false;
  const send = async () => {
    if (sent) return;
    sent = true;
    pending.delete(titleId);
    let answer: RemoveAnswer | 'failed';
    try {
      answer = await deps.remove(titleId);
    } catch {
      answer = 'failed';
    }
    if (answer === 'ok' || answer === 'not_found') {
      // The tile stays hidden until the list without it is in, so it never flickers back.
      await deps.refresh().catch(() => {});
      deps.unhide(titleId);
      return;
    }
    deps.unhide(titleId);
    deps.toast({ tone: 'warn', title: deps.copy.failed });
  };
  pending.set(titleId, send);
  deps.toast({
    tone: 'info',
    title: deps.copy.removed,
    duration: UNDO_MS,
    action: {
      label: deps.copy.undo,
      onPress: () => {
        sent = true;
        pending.delete(titleId);
        deps.unhide(titleId);
      },
    },
    onDismiss: () => void send(),
  });
}

/** Sends every removal still waiting on its toast (the app is leaving the foreground). */
export async function flushRemovals(): Promise<void> {
  await Promise.all([...pending.values()].map((send) => send()));
}
