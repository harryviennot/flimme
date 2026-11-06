import { render, screen } from '@testing-library/react-native';

import { SoloTopBar } from './solo-top-bar';

jest.mock('@/features/solo/leave', () => ({ useLeaveSolo: () => jest.fn() }));

describe('the solo top bar', () => {
  it('shares the room bar frame so the badge sits on the same centre line', async () => {
    await render(<SoloTopBar roomId="r1" likes={3} />);
    // The room bar is padded 8 above and below a 44-point row; the solo bar matches it.
    const bar = screen.getByTestId('solo-top-bar');
    expect(bar.props.className).toContain('pt-2');
    expect(bar.props.className).toContain('pb-2');
    expect(bar.props.className).not.toContain('h-14');
    const row = screen.getByTestId('solo-top-bar-row');
    expect(row.props.className).toContain('h-11');
    expect(row.props.className).toContain('items-center');
    // The badge sits in a wrapper the row centres: Tag itself is `self-start` and would stick to the top.
    expect(screen.getByTestId('solo-badge')).toBeOnTheScreen();
    expect(screen.getByTestId('solo-badge').props.className).toBeUndefined();
    expect(screen.getByTestId('solo-likes')).toBeOnTheScreen();
  });
});
