import i18n from '@/i18n';

import { StyleSheet } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

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

  it('gives a service logo a size of its own, so the image has pixels', async () => {
    await render(<MovieCard {...film} flipped />);
    const logos = screen.getAllByTestId('service-logo');
    expect(logos).toHaveLength(1);
    const logo = logos[0]!;
    const style = StyleSheet.flatten(logo.props.style);
    expect(style).toMatchObject({ width: expect.any(Number), height: expect.any(Number) });
    expect(style.width).toBeGreaterThan(0);
    expect(style.height).toBeGreaterThan(0);
  });

  it('shows the score, the story, the credits, the services and the trailer', async () => {
    await render(<MovieCard {...film} flipped />);
    expect(screen.getByText('7.4')).toBeOnTheScreen();
    expect(screen.getByText('TMDB rating')).toBeOnTheScreen();
    expect(screen.getByText('A bear in prison.')).toBeOnTheScreen();
    expect(screen.getByText('Director  Paul King')).toBeOnTheScreen();
    expect(screen.getByText('Cast  Ben Whishaw, Hugh Grant')).toBeOnTheScreen();
    expect(screen.getAllByText('Netflix').length).toBeGreaterThan(0);
    expect(screen.getByText('Arte')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Trailer' }));
    expect(film.back.onTrailer).toHaveBeenCalledTimes(1);
  });

  it('credits JustWatch under the services', async () => {
    await render(<MovieCard {...film} flipped />);
    expect(screen.getByText('Streaming availability by JustWatch.')).toBeOnTheScreen();
  });

  it('has no JustWatch credit when no service shows', async () => {
    await render(
      <MovieCard {...film} services={[]} flipped back={{ ...film.back, services: [] }} />,
    );
    expect(screen.queryByText('Streaming availability by JustWatch.')).toBeNull();
  });

  it('has no Trailer button without a trailer, and no score box without a score', async () => {
    await render(
      <MovieCard
        {...film}
        flipped
        back={{ ...film.back, onTrailer: undefined, tmdbRating: undefined }}
      />,
    );
    expect(screen.queryByText('Trailer')).toBeNull();
    expect(screen.queryByText('TMDB rating')).toBeNull();
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
      name: 'Add to your likes',
      includeHiddenElements: true,
    });
    expect(buttons).toHaveLength(2);
    await fireEvent.press(buttons[0]!);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('says Remove from your likes once saved, with the selected state', async () => {
    await render(<MovieCard {...film} bookmark={{ saved: true, onToggle: jest.fn() }} />);
    const button = screen.getAllByRole('button', {
      name: 'Remove from your likes',
      includeHiddenElements: true,
    })[0]!;
    expect(button.props.accessibilityState).toMatchObject({ selected: true });
    expect(
      screen.queryByRole('button', { name: 'Add to your likes', includeHiddenElements: true }),
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
      screen.getAllByRole('button', { name: 'Ajouter à tes envies', includeHiddenElements: true }),
    ).toHaveLength(2);
    await i18n.changeLanguage('en');
  });
});
