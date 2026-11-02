// iOS keeps HTTP responses in a shared URL cache on disk (Library/Caches/<bundle id>/Cache.db), and
// the Supabase Auth responses carry the session in plain text. This gives the app a cache with no
// disk storage before any request is made (security.md#the-app). Android is not affected.
const { withAppDelegate } = require('expo/config-plugins');

const MARKER = 'flimme-no-disk-url-cache';
const ANCHOR = /^(\s*)let delegate = ReactNativeDelegate\(\)\s*$/m;

function addNoDiskUrlCache(contents) {
  if (contents.includes(MARKER)) return contents;
  if (!ANCHOR.test(contents)) {
    throw new Error(
      'with-no-disk-url-cache: could not find "let delegate = ReactNativeDelegate()" in AppDelegate.swift. The generated file changed; update plugins/with-no-disk-url-cache.js.',
    );
  }
  return contents.replace(ANCHOR, (line, indent) =>
    [
      `${indent}// ${MARKER}: responses are never written to disk (security.md#the-app).`,
      `${indent}URLCache.shared = URLCache(memoryCapacity: 4 * 1024 * 1024, diskCapacity: 0, directory: nil)`,
      '',
      line,
    ].join('\n'),
  );
}

const withNoDiskUrlCache = (config) =>
  withAppDelegate(config, (mod) => {
    if (mod.modResults.language !== 'swift') {
      throw new Error('with-no-disk-url-cache: expected a Swift AppDelegate.');
    }
    mod.modResults.contents = addNoDiskUrlCache(mod.modResults.contents);
    return mod;
  });

module.exports = withNoDiskUrlCache;
module.exports.addNoDiskUrlCache = addNoDiskUrlCache;
