// React Native's ScrollView paints nothing inside an iOS form sheet (found on the simulator: the
// lobby's services sheet and M6.54's genres sheet were blank). A sheet that scrolls uses Gesture
// Handler's ScrollView, or `<Screen scroll sheet>`. These tests read the source, since Jest has no
// native sheet to paint.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = __dirname;
const read = (path: string) => readFileSync(join(src, path), 'utf8');

/** Every file that renders inside a form sheet: the route, or the component it hands over to. */
const SHEET_FILES = [
  'app/room/[id]/services.tsx',
  'app/room/[id]/invite.tsx',
  'app/room/[id]/seat/[memberId].tsx',
  'app/room/[id]/report/[memberId].tsx',
  'app/room/[id]/pick.tsx',
  'app/room/[id]/recap.tsx',
  'app/room/[id]/film/[title].tsx',
  'app/join/[code].tsx',
  'app/settings/delete.tsx',
  'app/(tabs)/my-films/film/[title].tsx',
  'components/screens/join-sheet/join-sheet.tsx',
  'components/screens/solo/pick-sheet.tsx',
  'components/screens/recap/recap-sheet.tsx',
  'components/screens/winner/runner-up-sheet.tsx',
  'components/screens/my-films/film-sheet.tsx',
  'components/screens/room/sheet-frame.tsx',
];

const nativeScrollView = /import\s*\{[^}]*\bScrollView\b[^}]*\}\s*from\s*'react-native';/;

describe('form sheets that scroll', () => {
  it.each(SHEET_FILES)("%s does not import ScrollView from 'react-native'", (file) => {
    let text: string;
    try {
      text = read(file);
    } catch {
      return;
    }
    expect(text).not.toMatch(nativeScrollView);
  });

  it.each(['app/room/[id]/services.tsx', 'components/screens/join-sheet/join-sheet.tsx'])(
    '%s scrolls through Screen with the sheet flag',
    (file) => {
      expect(read(file)).toMatch(/<Screen[^>]*\bscroll\b[^>]*\bsheet\b/s);
    },
  );
});
