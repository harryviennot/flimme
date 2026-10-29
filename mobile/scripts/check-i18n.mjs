// Fails when a translation key exists in one language and not the other.
// Plural forms (_one, _other, ...) count as one key: French and English plurals differ.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../src/i18n/locales/', import.meta.url).pathname;
const languages = readdirSync(root);
const pluralSuffix = /_(zero|one|two|few|many|other)$/;

function keys(value, prefix = '') {
  if (typeof value !== 'object' || value === null) return [prefix.replace(pluralSuffix, '')];
  return Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

const byLanguage = Object.fromEntries(
  languages.map((lang) => {
    const dir = join(root, lang);
    const files = Object.fromEntries(
      readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => [f, new Set(keys(JSON.parse(readFileSync(join(dir, f), 'utf8'))))]),
    );
    return [lang, files];
  }),
);

const problems = [];
const allFiles = new Set(Object.values(byLanguage).flatMap((files) => Object.keys(files)));
for (const file of allFiles) {
  for (const lang of languages) {
    if (!byLanguage[lang][file]) problems.push(`${lang}/${file} is missing`);
  }
  for (const lang of languages) {
    const mine = byLanguage[lang][file];
    if (!mine) continue;
    for (const other of languages) {
      if (other === lang || !byLanguage[other][file]) continue;
      for (const key of mine) {
        if (!byLanguage[other][file].has(key)) problems.push(`${other}/${file}: missing "${key}"`);
      }
    }
  }
}

const unique = [...new Set(problems)];
if (unique.length) {
  console.error(`Translations out of step:\n  ${unique.join('\n  ')}`);
  process.exit(1);
}
console.log(`Translations: ${allFiles.size} file(s), ${languages.join(' and ')} in step.`);
