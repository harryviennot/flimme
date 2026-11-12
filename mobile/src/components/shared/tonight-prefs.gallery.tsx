import { View } from 'react-native';

import type { GalleryEntry } from '../gallery';
import { TonightPrefs, type TonightPrefsProps } from './tonight-prefs';

const offered = [
  { id: 28, name: 'Action', count: 2 },
  { id: 16, name: 'Animation', count: 0 },
  { id: 35, name: 'Comedy', count: 3 },
  { id: 18, name: 'Drama', count: 1 },
  { id: 878, name: 'Science-Fiction', count: 1 },
];
const allGenres = [
  { id: 28, name: 'Action' },
  { id: 16, name: 'Animation' },
  { id: 35, name: 'Comedy' },
  { id: 18, name: 'Drama' },
  { id: 27, name: 'Horror' },
  { id: 878, name: 'Science-Fiction' },
  { id: 37, name: 'Western' },
];

const base: TonightPrefsProps = {
  offered,
  allGenres,
  outTonight: [],
  picks: [],
  skipGenres: [],
  skipPeople: [],
  showCounts: true,
  maxPicks: 3,
  maxSkipGenres: 3,
  maxSkipPeople: 3,
  onTogglePick: () => {},
  onToggleSkip: () => {},
  onRemovePerson: () => {},
  onAddPerson: () => {},
};

export const gallery: GalleryEntry = {
  name: 'TonightPrefs',
  tier: 'shared',
  description:
    'The genre step and the genres sheet: In the mood for (picks, with counts) and Not tonight (skips). Loading, nothing chosen, 2 picks and 1 skip with a genre out tonight, a genre out that this player did not skip, the room limit note, the cap note, no counts (a lone player), the People row with one person and at the cap of 3 (the add button disabled, its note, a long name).',
  render: () => (
    <View className="gap-8">
      <TonightPrefs {...base} loading />
      <TonightPrefs {...base} />
      <TonightPrefs
        {...base}
        picks={[28, 35]}
        skipGenres={[16]}
        outTonight={[16]}
        wantsNote="Animation is out tonight, so we took it off your picks."
      />
      <TonightPrefs {...base} outTonight={[27, 37]} picks={[35]} />
      <TonightPrefs
        {...base}
        skipGenres={[16, 27]}
        outTonight={[16, 27, 37, 18]}
        genresNote="4 genres are already out tonight."
      />
      <TonightPrefs
        {...base}
        skipGenres={[16, 27, 37]}
        outTonight={[16, 27, 37]}
        genresNote="3 genres at most. Drop one to swap."
        wantsNote="3 genres at most. Drop one to swap."
        picks={[28, 35, 18]}
      />
      <TonightPrefs {...base} showCounts={false} picks={[35]} />
      <TonightPrefs {...base} skipGenres={[16]} skipPeople={[{ id: 287, name: 'Brad Pitt' }]} />
      <TonightPrefs
        {...base}
        skipPeople={[
          { id: 287, name: 'Brad Pitt' },
          { id: 955, name: 'Pénélope Cruz' },
          { id: 1, name: 'Joaquin Rafael Phoenix-Bottom of the Long Name' },
        ]}
      />
    </View>
  ),
};
