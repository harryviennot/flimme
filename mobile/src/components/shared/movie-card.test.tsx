import i18n from '@/i18n';

import { StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import { MovieCard, stampOpacity, type MovieCardProps } from './movie-card';

describe('stampOpacity', () => {
  it('grows with the drag normally', () => {
    expect(stampOpacity(0.4, false)).toBe(0.4);
  });

  it('with Reduce Motion shows the whole stamp, label included, as soon as the ring shows', () => {
    expect(stampOpacity(0, true)).toBe(0);
    expect(stampOpacity(0.05, true)).toBe(1);
    expect(stampOpacity(1, true)).toBe(1);
  });
});

let mockReduced = false;
let mockFontScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 375, height: 812, scale: 3, fontScale: mockFontScale }),
}));

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return {
    ...actual,
    __esModule: true,
    default: actual.default,
    useReducedMotion: () => mockReduced,
  };
});

const film: MovieCardProps = {
  title: 'Paddington 2',
  meta: '2017 · 1 h 43 · ★ 7.4',
  poster: null,
  services: ['Netflix'],
  back: {
    meta: '2017 · 1 h 43',
    tmdbRating: '7.4',
    synopsis: 'A bear in prison.',
    director: 'Paul King',
    cast: 'Ben Whishaw, Hugh Grant',
    services: [{ name: 'Netflix', logo: 'https://img.test/t/p/w92/n.png' }, { name: 'Arte' }],
    onTrailer: jest.fn(),
  },
};

const LAYOUT = { width: 300, x: 0, y: 0 };

describe('the back of the card', () => {
  beforeEach(() => {
    mockReduced = false;
  });

  const measureLogos = async (width: number) => {
    await act(async () => {
      screen.getByTestId('service-logos').props.onLayout({ nativeEvent: { layout: { width } } });
    });
  };

  it('gives a service logo a size of its own, so the image has pixels', async () => {
    await render(<MovieCard {...film} flipped />);
    await measureLogos(200);
    const logos = screen.getAllByTestId('service-logo');
    expect(logos).toHaveLength(1);
    const logo = logos[0]!;
    const style = StyleSheet.flatten(logo.props.style);
    expect(style).toMatchObject({ width: expect.any(Number), height: expect.any(Number) });
    expect(style.width).toBeGreaterThan(0);
    expect(style.height).toBeGreaterThan(0);
  });

  it('shows the score inside the meta line, the story, the credits, the logos and the trailer', async () => {
    await render(<MovieCard {...film} flipped />);
    await measureLogos(200);
    const back = within(screen.getByTestId('movie-card-back'));
    expect(back.getByText(/2017 · 1 h 43/)).toBeOnTheScreen();
    expect(back.getByText('★ 7.4')).toBeOnTheScreen();
    expect(back.getByText(' TMDB')).toBeOnTheScreen();
    expect(screen.queryByText('TMDB rating')).toBeNull();
    expect(screen.getByText('A bear in prison.')).toBeOnTheScreen();
    expect(screen.getByText('Director  Paul King')).toBeOnTheScreen();
    expect(screen.getByText('Cast  Ben Whishaw, Hugh Grant')).toBeOnTheScreen();
    // Two squares: the logo, and the initials of the service without one.
    expect(screen.getAllByTestId('service-square')).toHaveLength(2);
    expect(screen.getByText('A')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Trailer' }));
    expect(film.back.onTrailer).toHaveBeenCalledTimes(1);
  });

  it('has no "tap to flip back" line', async () => {
    await render(<MovieCard {...film} flipped />);
    expect(screen.queryByText('Tap the card to flip back')).toBeNull();
  });

  it('ends the meta line after the runtime without a score', async () => {
    await render(<MovieCard {...film} flipped back={{ ...film.back, tmdbRating: undefined }} />);
    expect(screen.queryByText(/TMDB/)).toBeNull();
    expect(screen.getByText('2017 · 1 h 43')).toBeOnTheScreen();
  });

  it('credits JustWatch under the services', async () => {
    await render(<MovieCard {...film} flipped />);
    expect(screen.getByText('Streaming availability by JustWatch.')).toBeOnTheScreen();
  });

  it('keeps the bookmark slot free in the last row', async () => {
    await render(<MovieCard {...film} flipped />);
    expect(screen.getByTestId('movie-card-bookmark-slot')).toBeOnTheScreen();
  });

  describe('the services row', () => {
    const six = ['A', 'B', 'C', 'D', 'E', 'F'].map((name) => ({ name }));

    it('shows every logo when they fit', async () => {
      await render(<MovieCard {...film} flipped back={{ ...film.back, services: six }} />);
      await measureLogos(300);
      expect(screen.getAllByTestId('service-square')).toHaveLength(6);
      expect(screen.queryByTestId('service-more')).toBeNull();
    });

    it('gives the last square to +n, counting the services it hides', async () => {
      await render(<MovieCard {...film} flipped back={{ ...film.back, services: six }} />);
      // Four squares fit in 158 points: three logos and "+3".
      await measureLogos(158);
      expect(screen.getAllByTestId('service-square')).toHaveLength(3);
      expect(screen.getByText('+3')).toBeOnTheScreen();
    });

    it('shows no row, no credit and the Trailer alone when there are no services', async () => {
      await render(
        <MovieCard {...film} services={[]} flipped back={{ ...film.back, services: [] }} />,
      );
      expect(screen.queryByTestId('service-logos')).toBeNull();
      expect(screen.queryByText('Streaming availability by JustWatch.')).toBeNull();
      expect(screen.getByRole('button', { name: 'Trailer' })).toBeOnTheScreen();
    });

    it('shows the initials when a logo fails to load', async () => {
      await render(
        <MovieCard
          {...film}
          flipped
          back={{ ...film.back, services: [{ name: 'Canal+', logo: 'https://img.test/x.png' }] }}
        />,
      );
      await measureLogos(200);
      await act(async () =>
        screen.getByTestId('service-logo').props.onError({ nativeEvent: { error: 'x' } }),
      );
      expect(screen.queryByTestId('service-logo')).toBeNull();
      expect(screen.getByText('C')).toBeOnTheScreen();
    });
  });

  it('has no JustWatch credit when no service shows', async () => {
    await render(
      <MovieCard {...film} services={[]} flipped back={{ ...film.back, services: [] }} />,
    );
    expect(screen.queryByText('Streaming availability by JustWatch.')).toBeNull();
  });

  it('has no Trailer button without a trailer', async () => {
    await render(<MovieCard {...film} flipped back={{ ...film.back, onTrailer: undefined }} />);
    expect(screen.queryByText('Trailer')).toBeNull();
  });

  it('cuts the synopsis to the room it has, with no scrolling', async () => {
    await render(<MovieCard {...film} flipped />);
    const synopsis = screen.getByText('A bear in prison.');
    expect(synopsis.props.numberOfLines).toBeUndefined();
    // Six lines of room at 20 points a line.
    await act(async () => {
      synopsis.parent!.props.onLayout({ nativeEvent: { layout: { ...LAYOUT, height: 120 } } });
      synopsis.props.onTextLayout({ nativeEvent: { lines: [{ height: 20 }] } });
    });
    expect(screen.getByText('A bear in prison.').props.numberOfLines).toBe(6);
    // The text size grew: a line is 40 points, so three fit.
    await act(async () => {
      screen.getByText('A bear in prison.').props.onTextLayout({
        nativeEvent: { lines: [{ height: 40 }] },
      });
    });
    expect(screen.getByText('A bear in prison.').props.numberOfLines).toBe(3);
    expect(JSON.stringify(screen.toJSON())).not.toContain('ScrollView');
  });

  describe('Read more', () => {
    const lay = async (room: number, full: number) => {
      const synopsis = screen.getByText('A bear in prison.');
      await act(async () => {
        synopsis.parent!.props.onLayout({ nativeEvent: { layout: { ...LAYOUT, height: room } } });
        synopsis.props.onTextLayout({ nativeEvent: { lines: [{ height: 20 }] } });
        screen.getByTestId('synopsis-measure', { includeHiddenElements: true }).props.onTextLayout({
          nativeEvent: { lines: new Array(full).fill({ height: 20 }) },
        });
      });
    };

    it('shows when the text is cut and opens the sheet without flipping', async () => {
      const onReadMore = jest.fn();
      const onControlTouch = jest.fn();
      const onFlip = jest.fn();
      await render(
        <MovieCard
          {...film}
          flipped
          onFlip={onFlip}
          back={{ ...film.back, onReadMore, onControlTouch }}
        />,
      );
      await lay(160, 12);
      expect(screen.getByText('A bear in prison.').props.numberOfLines).toBe(8);
      const link = screen.getByRole('button', { name: 'Read more' });
      await fireEvent(link.parent!, 'touchStart');
      expect(onControlTouch).toHaveBeenCalledTimes(1);
      await fireEvent.press(link);
      expect(onReadMore).toHaveBeenCalledTimes(1);
      expect(onFlip).not.toHaveBeenCalled();
    });

    it('is absent when the whole text fits', async () => {
      await render(<MovieCard {...film} flipped back={{ ...film.back, onReadMore: jest.fn() }} />);
      await lay(160, 5);
      expect(screen.queryByText('Read more')).toBeNull();
    });

    it('is absent without a handler, even when the text is cut', async () => {
      await render(<MovieCard {...film} flipped />);
      await lay(160, 12);
      expect(screen.queryByText('Read more')).toBeNull();
      expect(screen.getByText('A bear in prison.').props.numberOfLines).toBe(8);
    });

    it('speaks French', async () => {
      await i18n.changeLanguage('fr');
      await render(<MovieCard {...film} flipped back={{ ...film.back, onReadMore: jest.fn() }} />);
      await lay(160, 12);
      expect(screen.getByText('Lire la suite')).toBeOnTheScreen();
      await i18n.changeLanguage('en');
    });
  });

  it('moves the title into the body at the largest text size', async () => {
    mockFontScale = 2;
    await render(<MovieCard {...film} flipped />);
    expect(screen.getByTestId('movie-card-back-title')).toBeOnTheScreen();
    mockFontScale = 1;
  });

  it('keeps the title in the header at the default text size', async () => {
    await render(<MovieCard {...film} flipped />);
    expect(screen.queryByTestId('movie-card-back-title')).toBeNull();
  });

  it('keeps one line of synopsis in a tiny room', async () => {
    await render(<MovieCard {...film} flipped />);
    const synopsis = screen.getByText('A bear in prison.');
    await act(async () => {
      synopsis.parent!.props.onLayout({ nativeEvent: { layout: { ...LAYOUT, height: 5 } } });
      synopsis.props.onTextLayout({ nativeEvent: { lines: [{ height: 20 }] } });
    });
    expect(screen.getByText('A bear in prison.').props.numberOfLines).toBe(1);
  });

  it('asks to turn over on a tap', async () => {
    const onFlip = jest.fn();
    await render(<MovieCard {...film} onFlip={onFlip} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Paddington 2' }));
    expect(onFlip).toHaveBeenCalledTimes(1);
  });

  it('crossfades instead of turning with Reduce Motion', async () => {
    mockReduced = true;
    await render(<MovieCard {...film} flipped />);
    for (const id of ['movie-card-front', 'movie-card-back']) {
      expect(JSON.stringify(screen.getByTestId(id).props.style)).not.toContain('rotateY');
    }
  });
});

describe('the bookmark (a solo like)', () => {
  it('shows on the front and the back, empty, and saves on a press', async () => {
    const onToggle = jest.fn();
    await render(<MovieCard {...film} bookmark={{ saved: false, onToggle }} />);
    const buttons = screen.getAllByRole('button', {
      name: 'Add to My films',
      includeHiddenElements: true,
    });
    expect(buttons).toHaveLength(2);
    await fireEvent.press(buttons[0]!);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('says Remove from My films once saved, with the selected state', async () => {
    await render(<MovieCard {...film} bookmark={{ saved: true, onToggle: jest.fn() }} />);
    const button = screen.getAllByRole('button', {
      name: 'Remove from My films',
      includeHiddenElements: true,
    })[0]!;
    expect(button.props.accessibilityState).toMatchObject({ selected: true });
    expect(
      screen.queryByRole('button', { name: 'Add to My films', includeHiddenElements: true }),
    ).toBeNull();
  });

  it('tells the card a touch started on it, so the tap does not flip', async () => {
    const onTouch = jest.fn();
    await render(<MovieCard {...film} bookmark={{ saved: false, onToggle: jest.fn(), onTouch }} />);
    await fireEvent(screen.getAllByTestId('movie-card-bookmark-wrap')[0]!, 'touchStart');
    expect(onTouch).toHaveBeenCalledTimes(1);
  });

  it('is a 44-point round button low on the right of both faces, never at the top left', async () => {
    await render(<MovieCard {...film} bookmark={{ saved: false, onToggle: jest.fn() }} />);
    const wraps = screen.getAllByTestId('movie-card-bookmark-wrap');
    expect(wraps).toHaveLength(2);
    for (const wrap of wraps) {
      expect(wrap.props.className).toContain('right-5');
      expect(wrap.props.className).toContain('bottom-3.5');
      expect(wrap.props.className).not.toContain('left-');
      expect(wrap.props.className).not.toContain('top-');
    }
  });

  it('is absent without the prop (the film sheet)', async () => {
    await render(<MovieCard {...film} flipped />);
    expect(screen.queryByTestId('movie-card-bookmark')).toBeNull();
  });

  it('speaks French', async () => {
    await i18n.changeLanguage('fr');
    await render(<MovieCard {...film} bookmark={{ saved: false, onToggle: jest.fn() }} />);
    expect(
      screen.getAllByRole('button', { name: 'Ajouter à Mes films', includeHiddenElements: true }),
    ).toHaveLength(2);
    await i18n.changeLanguage('en');
  });
});

describe('a still back', () => {
  const longText = 'A bear in prison. '.repeat(60).trim();

  it('shows the synopsis whole: no cut, no Read more, no flip badge', async () => {
    await render(
      <MovieCard
        {...film}
        still
        flipped
        back={{ ...film.back, synopsis: longText, onReadMore: jest.fn() }}
      />,
    );
    const text = screen.getByTestId('synopsis-whole');
    expect(text.props.numberOfLines).toBeUndefined();
    expect(screen.queryByTestId('movie-card-read-more')).toBeNull();
    expect(screen.queryByText('Tap the card to flip back')).toBeNull();
    expect(screen.queryByTestId('movie-card-front')).toBeNull();
  });

  it('is at least the card shape, and grows past it with its content', async () => {
    await render(<MovieCard {...film} still flipped />);
    await act(async () => {
      screen
        .getByTestId('movie-card-back')
        .props.onLayout({ nativeEvent: { layout: { width: 300, height: 0, x: 0, y: 0 } } });
    });
    const style = StyleSheet.flatten(screen.getByTestId('movie-card-back').props.style);
    expect(style.minHeight).toBeCloseTo((300 * 518) / 345);
    expect(style.height).toBeUndefined();
    expect(style.aspectRatio).toBeUndefined();
  });
});
