import { render } from '@testing-library/react-native';

import { analytics } from '@/lib/analytics';

import { useRoomCap } from './use-room-cap';

jest.mock('@/lib/analytics', () => ({
  analytics: { setRoomCap: jest.fn(), clearRoomCap: jest.fn() },
}));

function Probe({ room }: { room: { max_age: number | null } | null | undefined }) {
  useRoomCap(room);
  return null;
}

describe('useRoomCap', () => {
  beforeEach(() => jest.clearAllMocks());

  it('says unknown until the room is read, then its cap', async () => {
    const view = await render(<Probe room={undefined} />);
    expect(analytics.setRoomCap).toHaveBeenLastCalledWith('unknown');
    await view.rerender(<Probe room={{ max_age: 12 }} />);
    expect(analytics.setRoomCap).toHaveBeenLastCalledWith(12);
    await view.rerender(<Probe room={{ max_age: null }} />);
    expect(analytics.setRoomCap).toHaveBeenLastCalledWith(null);
  });

  it('keeps a removed room unknown, and clears the cap when the layout goes', async () => {
    const view = await render(<Probe room={null} />);
    expect(analytics.setRoomCap).toHaveBeenLastCalledWith('unknown');
    await view.unmount();
    expect(analytics.clearRoomCap).toHaveBeenCalled();
  });
});
