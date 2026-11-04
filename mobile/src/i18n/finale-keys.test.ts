import enCommon from './locales/en/common.json';
import enFinale from './locales/en/finale.json';
import frCommon from './locales/fr/common.json';
import frFinale from './locales/fr/finale.json';

// Every key of the Final Cut exists in French and English (the brief's test 12). The plural
// suffixes differ by language (French has no separate zero), so `_one` and `_other` are compared
// as one key.

type Tree = { [key: string]: string | Tree };

function keys(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string'
      ? [`${prefix}${key}`.replace(/_(one|other|zero|few|many)$/, '')]
      : keys(value, `${prefix}${key}.`),
  );
}

const unique = (list: string[]) => [...new Set(list)].sort();

describe('the finale translations', () => {
  it('has the same keys in French and English', () => {
    expect(unique(keys(frFinale as Tree))).toEqual(unique(keys(enFinale as Tree)));
  });

  it('has the countdown label for a screen reader in both', () => {
    expect(unique(keys((frCommon as Tree).countdown as Tree))).toEqual(
      unique(keys((enCommon as Tree).countdown as Tree)),
    );
    expect(enCommon.countdown.a11y_one).toContain('{{count}}');
  });

  it('has a plural for the count of locked-in seats and the time left', () => {
    for (const tree of [frFinale, enFinale] as Tree[]) {
      expect(Object.keys((tree.locked as Tree) ?? {})).toEqual(
        expect.arrayContaining(['count_one', 'count_other']),
      );
      expect(Object.keys((tree.a11y as Tree) ?? {})).toEqual(
        expect.arrayContaining(['timeLeft_one', 'timeLeft_other']),
      );
    }
  });
});
