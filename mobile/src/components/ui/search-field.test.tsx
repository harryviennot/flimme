import i18n from '@/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { SearchField } from './search-field';

function Harness({ busy = false }: { busy?: boolean }) {
  const [text, setText] = useState('');
  return (
    <SearchField
      accessibilityLabel="Search for a name"
      value={text}
      onChangeText={setText}
      busy={busy}
    />
  );
}

describe('SearchField', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en');
  });

  it('is a search, labelled for screen readers', async () => {
    await render(<Harness />);
    expect(JSON.stringify(screen.toJSON())).toContain('"accessibilityRole":"search"');
    expect(screen.getByLabelText('Search for a name')).toBeTruthy();
  });

  it('shows Clear only with text, and empties the field', async () => {
    await render(<Harness />);
    expect(screen.queryByLabelText('Clear')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Search for a name'), 'pitt');
    await fireEvent.press(screen.getByLabelText('Clear'));
    expect(screen.getByLabelText('Search for a name').props.value).toBe('');
    expect(screen.queryByLabelText('Clear')).toBeNull();
  });

  it('busy swaps the search icon for the spinner and says so', async () => {
    const { rerender } = await render(<Harness />);
    expect(screen.queryByTestId('search-busy')).toBeNull();
    await rerender(<Harness busy />);
    expect(screen.getByTestId('search-busy')).toBeTruthy();
    expect(screen.getByLabelText('Search for a name').props.accessibilityState).toMatchObject({
      busy: true,
    });
  });
});
