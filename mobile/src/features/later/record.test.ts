import { pendingSaves } from './pending';
import { recordSaved } from './record';
import { savedSession } from './saved-session';

describe('recordSaved', () => {
  afterEach(() => {
    savedSession.getState().reset();
    pendingSaves.setState({ items: [] });
  });

  it('sets the session state and drops the wish still waiting for that film', () => {
    pendingSaves.getState().put(3, true);
    pendingSaves.getState().put(4, true);
    recordSaved(3, false);
    expect(savedSession.getState().has(3)).toBe(false);
    expect(pendingSaves.getState().items).toEqual([{ title_id: 4, saved: true }]);
    recordSaved(5, true);
    expect(savedSession.getState().has(5)).toBe(true);
  });
});
