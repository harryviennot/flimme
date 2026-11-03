import { roomEntry } from './enter-room';

const sheet = { name: 'join/[code]' };

describe('roomEntry', () => {
  it('replaces the sheet when no room screen is open', () => {
    expect(roomEntry([{ name: 'index' }, sheet], 'a')).toBe('replace');
  });

  it("goes back to the room's screen when it is already open", () => {
    const routes = [{ name: 'index' }, { name: 'room/[id]', params: { id: 'a' } }, sheet];
    expect(roomEntry(routes, 'a')).toBe('dismissTo');
  });

  it('finds the room routes under the __root route the router wraps the stack in', () => {
    const tree = [
      {
        name: '__root',
        state: { routes: [{ name: 'index' }, { name: 'room/[id]', params: { id: 'a' } }, sheet] },
      },
    ];
    expect(roomEntry(tree, 'a')).toBe('dismissTo');
    expect(roomEntry(tree, 'b')).toBe('reset');
  });

  it("drops another room's screens before entering", () => {
    const routes = [{ name: 'index' }, { name: 'room/[id]', params: { id: 'b' } }, sheet];
    expect(roomEntry(routes, 'a')).toBe('reset');
  });
});
