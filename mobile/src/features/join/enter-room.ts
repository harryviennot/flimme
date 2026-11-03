/** A route of the navigation state, with the state of the navigator nested in it. */
export type RootRoute = {
  name: string;
  params?: object;
  state?: { routes?: readonly RootRoute[] };
};

/**
 * How the join sheet enters the room it joined, so a link never stacks room screens
 * (join-sheet.md#a-link-to-a-room-you-are-in):
 * - `replace`: no room screen is open, the sheet gives way to the room.
 * - `dismissTo`: this room's screen is already open under the sheet, go back to it.
 * - `reset`: another room's screens are open, drop them all, then replace with this room.
 */
export type RoomEntry = 'replace' | 'dismissTo' | 'reset';

/** Every `room/[id]` route in the tree (the router wraps the root stack in a `__root` route). */
function roomRoutes(routes: readonly RootRoute[]): RootRoute[] {
  return routes.flatMap((route) =>
    route.name === 'room/[id]' ? [route] : roomRoutes(route.state?.routes ?? []),
  );
}

export function roomEntry(routes: readonly RootRoute[], roomId: string): RoomEntry {
  const rooms = roomRoutes(routes);
  if (rooms.length === 0) return 'replace';
  const same = rooms.some((route) => (route.params as { id?: unknown } | undefined)?.id === roomId);
  return same ? 'dismissTo' : 'reset';
}
