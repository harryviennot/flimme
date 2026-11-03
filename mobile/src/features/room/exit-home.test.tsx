import { router, Stack } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Pressable } from '@/components/ui/pressable';
import { Text } from '@/components/ui/text';

import { useExitRoomToHome } from './exit-home';

function Room() {
  const exit = useExitRoomToHome();
  return (
    <Pressable
      accessibilityLabel="Leave"
      onPress={() => {
        // Two callers at once, like Leave and the room layout.
        exit();
        exit();
      }}
    >
      <Text variant="body-m">Leave</Text>
    </Pressable>
  );
}

const routes = {
  _layout: () => <Stack screenOptions={{ headerShown: false }} />,
  index: () => <Text variant="body-m">Index</Text>,
  home: () => <Text variant="body-m">Home</Text>,
  room: Room,
};

function names(app: { getRouterState: () => unknown }): string[] {
  type S = { routes?: { name: string; state?: S }[] };
  let state = app.getRouterState() as S;
  while (state.routes?.length === 1 && state.routes[0]?.state) state = state.routes[0].state;
  return (state.routes ?? []).map((route) => route.name);
}

describe('useExitRoomToHome asked twice', () => {
  it('goes back to the Home under the room once', async () => {
    const app = await renderRouter(routes, { initialUrl: '/home' });
    await act(async () => {
      router.push('/room');
    });
    await fireEvent.press(screen.getByLabelText('Leave'));
    await waitFor(() => expect(screen).toHavePathname('/home'));
    expect(names(app).filter((name) => name === 'home')).toHaveLength(1);
    expect(names(app).at(-1)).toBe('home');
  });

  it('replaces the room with one Home when none is open', async () => {
    const app = await renderRouter(routes, { initialUrl: '/room' });
    await fireEvent.press(screen.getByLabelText('Leave'));
    await waitFor(() => expect(screen).toHavePathname('/home'));
    expect(names(app).filter((name) => name === 'home')).toHaveLength(1);
    expect(
      names(app)
        .slice(0, -1)
        .filter((n) => n !== 'index'),
    ).toEqual([]);
  });
});
