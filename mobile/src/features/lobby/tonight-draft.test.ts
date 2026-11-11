import { createTonightDraftStore, takeUnsavedTonight, tonightDraftStore } from './tonight-draft';

describe('the Not tonight draft', () => {
  it('starts untouched, and keeps one list when the other changes', () => {
    const store = createTonightDraftStore();
    expect(store.getState()).toMatchObject({ picks: null, skips: null, unsaved: false });
    store.getState().set('r1', { picks: [1] });
    store.getState().set('r1', { skips: [2] });
    expect(store.getState()).toMatchObject({ roomId: 'r1', picks: [1], skips: [2] });
  });

  it('forgets another rooms draft', () => {
    const store = createTonightDraftStore();
    store.getState().set('r1', { picks: [1], skips: [2] });
    store.getState().set('r2', { skips: [3] });
    expect(store.getState()).toMatchObject({ roomId: 'r2', picks: null, skips: [3] });
  });

  it('tracks whether it has unsaved changes, and resets', () => {
    const store = createTonightDraftStore();
    store.getState().set('r1', { picks: [1] });
    store.getState().setUnsaved('r1', true);
    expect(store.getState().unsaved).toBe(true);
    store.getState().reset();
    expect(store.getState()).toMatchObject({ roomId: null, picks: null, unsaved: false });
  });
});

describe('Start with unsaved changes', () => {
  afterEach(() => tonightDraftStore.getState().reset());

  it('reports them once, for that room, and clears the draft', () => {
    tonightDraftStore.getState().set('r1', { skips: [16] });
    tonightDraftStore.getState().setUnsaved('r1', true);
    expect(takeUnsavedTonight('r2')).toBe(false);
    expect(takeUnsavedTonight('r1')).toBe(true);
  });

  it('is quiet without changes', () => {
    tonightDraftStore.getState().set('r1', { skips: [16] });
    expect(takeUnsavedTonight('r1')).toBe(false);
  });
});
