import { render, screen } from '@testing-library/react-native';

import { Avatar } from './avatar';

describe('Avatar', () => {
  it('shows the first letter of the name', async () => {
    await render(<Avatar name="  léa" color="blue" />);
    expect(screen.getByText('l')).toBeTruthy();
  });

  it('shows a whole emoji as the initial, not half of it', async () => {
    await render(<Avatar name="🎬 Film" color="red" />);
    expect(screen.getByText('🎬')).toBeTruthy();
  });

  it('draws blue for a color it does not know', async () => {
    await render(<Avatar name="Sam" color={'default' as never} />);
    expect(screen.getByLabelText('Sam').props.className).toContain('bg-avatar-blue');
  });
});
