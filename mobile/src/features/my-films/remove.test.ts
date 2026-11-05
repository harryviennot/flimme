import { flushRemovals, startRemove, type RemoveDeps } from './remove';

function deps(answer: 'ok' | 'not_found' | 'rate_limited' | 'throws' = 'ok') {
  let onDismiss: (() => void) | undefined;
  let undo: (() => void) | undefined;
  const calls = {
    hidden: [] as number[],
    unhidden: [] as number[],
    toasts: [] as { title: string; tone?: string }[],
    removes: [] as number[],
    refreshes: 0,
  };
  const d: RemoveDeps = {
    hide: (id) => calls.hidden.push(id),
    unhide: (id) => calls.unhidden.push(id),
    refresh: async () => void calls.refreshes++,
    remove: async (id) => {
      calls.removes.push(id);
      if (answer === 'throws') throw new Error('offline');
      return answer;
    },
    toast: (toast) => {
      calls.toasts.push({ title: toast.title, tone: toast.tone });
      onDismiss = toast.onDismiss;
      undo = toast.action?.onPress;
    },
    hideToast: () => onDismiss?.(),
    copy: { removed: 'Removed', undo: 'Undo', failed: 'Failed' },
  };
  return { d, calls, close: () => onDismiss?.(), undo: () => undo?.() };
}

describe('startRemove', () => {
  it('hides the tile at once and sends nothing until the toast closes', () => {
    const { d, calls } = deps();
    startRemove(7, d);
    expect(calls.hidden).toEqual([7]);
    expect(calls.toasts[0]).toMatchObject({ title: 'Removed', tone: 'info' });
    expect(calls.removes).toEqual([]);
  });

  it('sends the call when the toast closes, then refreshes and lets the tile go', async () => {
    const { d, calls, close } = deps();
    startRemove(7, d);
    close();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(calls.removes).toEqual([7]);
    expect(calls.refreshes).toBe(1);
    expect(calls.unhidden).toEqual([7]);
  });

  it('Undo brings the tile back and sends nothing', async () => {
    const { d, calls, undo } = deps();
    startRemove(7, d);
    undo();
    await Promise.resolve();
    expect(calls.unhidden).toEqual([7]);
    expect(calls.removes).toEqual([]);
  });

  it('sends only once however often the toast closes', async () => {
    const { d, calls, close } = deps();
    startRemove(7, d);
    close();
    close();
    await flushRemovals();
    expect(calls.removes).toEqual([7]);
  });

  it('treats not_found as done', async () => {
    const { d, calls, close } = deps('not_found');
    startRemove(7, d);
    close();
    await flushRemovals();
    expect(calls.toasts).toHaveLength(1);
    expect(calls.refreshes).toBe(1);
  });

  it.each(['rate_limited', 'throws'] as const)(
    'brings the tile back and warns on %s',
    async (answer) => {
      const { d, calls, close } = deps(answer);
      startRemove(7, d);
      close();
      await flushRemovals();
      expect(calls.unhidden).toEqual([7]);
      expect(calls.toasts[1]).toMatchObject({ title: 'Failed', tone: 'warn' });
    },
  );

  it('flushRemovals sends a pending removal now', async () => {
    const { d, calls } = deps();
    startRemove(9, d);
    await flushRemovals();
    expect(calls.removes).toEqual([9]);
  });
});
