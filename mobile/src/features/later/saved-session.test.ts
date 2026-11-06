import { createSavedSession } from './saved-session';

describe('the saved state of this session', () => {
  it('starts empty and follows set', () => {
    const session = createSavedSession();
    expect(session.getState().has(5)).toBe(false);
    session.getState().set(5, true);
    expect(session.getState().has(5)).toBe(true);
    session.getState().set(5, false);
    expect(session.getState().has(5)).toBe(false);
  });

  it('forgets everything on reset', () => {
    const session = createSavedSession();
    session.getState().set(1, true);
    session.getState().reset();
    expect(session.getState().has(1)).toBe(false);
  });
});
