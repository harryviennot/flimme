// Roadmap M4.18: the checks of the invite domain (the app-link files, the page, the redirects).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkSite, parseArgs, redirectRequests } from './check-well-known.mjs';

const FINGERPRINT = Array.from({ length: 32 }, (_, i) =>
  i.toString(16).padStart(2, '0').toUpperCase(),
).join(':');

const AASA = {
  applinks: {
    details: [
      {
        appIDs: [
          'QQJF5895MC.com.harryviennot.flimme',
          'QQJF5895MC.com.harryviennot.flimme.preview',
        ],
        components: [{ '/': '/join/*' }],
      },
    ],
  },
};

const statement = (pkg, fingerprint = FINGERPRINT) => ({
  relation: ['delegate_permission/common.handle_all_urls'],
  target: {
    namespace: 'android_app',
    package_name: pkg,
    sha256_cert_fingerprints: [fingerprint],
  },
});
const ASSETLINKS = [
  statement('com.harryviennot.flimme'),
  statement('com.harryviennot.flimme.preview'),
];

const HTML = '<html><head><meta property="og:title" content="Flimme" /></head></html>';
const json = (value) => ({
  status: 200,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(value),
});
const html = { status: 200, headers: { 'content-type': 'text/html' }, body: HTML };

/** A site that answers every check correctly, with `overrides` keyed by path. The other names
 * answer as nginx does: www to the bare domain (301), flimme.fr's invite links to flimme.com (301),
 * and the rest of flimme.fr to flimme.com for now (302), path and query kept. */
function site(overrides = {}) {
  const calls = [];
  const get = async (url, { host } = {}) => {
    const { hostname, pathname, search } = new URL(url);
    calls.push({ url, host });
    const name = host ?? hostname;
    const to = (status, domain) => ({
      status,
      headers: { location: `https://${domain}${pathname}${search}` },
      body: '',
    });
    if (name === 'www.flimme.com') return to(301, 'flimme.com');
    if (name === 'www.flimme.fr') return to(301, 'flimme.fr');
    if (name === 'flimme.fr') return to(pathname.startsWith('/join/') ? 301 : 302, 'flimme.com');
    if (pathname in overrides) return overrides[pathname];
    if (pathname === '/.well-known/apple-app-site-association') return json(AASA);
    if (pathname === '/.well-known/assetlinks.json') return json(ASSETLINKS);
    return html;
  };
  return { get, calls };
}

const failures = (results) => results.filter((r) => r.problem);

test('passes on 200 JSON for both files, 200 HTML for the pages and the four redirects', async () => {
  const { get } = site();
  const results = await checkSite('http://localhost:8080', { get });
  assert.deepEqual(failures(results), []);
  assert.deepEqual(
    results.map((r) => r.label),
    [
      'http://localhost:8080/.well-known/apple-app-site-association',
      'http://localhost:8080/.well-known/assetlinks.json',
      'http://localhost:8080/join/482913',
      'http://localhost:8080/',
      'http://localhost:8080/nothing',
      'http://localhost:8080/join/123456?r=x (Host: www.flimme.com)',
      'http://localhost:8080/join/123456?r=x (Host: www.flimme.fr)',
      'http://localhost:8080/join/123456?r=x (Host: flimme.fr)',
      'http://localhost:8080/ (Host: flimme.fr)',
    ],
  );
});

test('fails a verification file that redirects, naming the URL', async () => {
  for (const status of [301, 308]) {
    const { get } = site({
      '/.well-known/apple-app-site-association': {
        status,
        headers: { location: 'https://flimme.com/x' },
        body: '',
      },
    });
    const [failure, ...rest] = failures(await checkSite('https://example.org', { get }));
    assert.equal(rest.length, 0);
    assert.equal(failure.label, 'https://example.org/.well-known/apple-app-site-association');
    assert.match(failure.problem, new RegExp(`answers ${status}`));
  }
});

test('fails a verification file served as text/plain or application/octet-stream', async () => {
  for (const type of ['text/plain', 'application/octet-stream']) {
    const { get } = site({
      '/.well-known/assetlinks.json': {
        status: 200,
        headers: { 'content-type': type },
        body: JSON.stringify(ASSETLINKS),
      },
    });
    const [failure] = failures(await checkSite('https://example.org', { get }));
    assert.equal(failure.label, 'https://example.org/.well-known/assetlinks.json');
    assert.match(failure.problem, new RegExp(`content-type ${type}`));
  }
});

test('accepts application/json with a charset', async () => {
  const { get } = site({
    '/.well-known/assetlinks.json': {
      ...json(ASSETLINKS),
      headers: { 'content-type': 'application/json; charset=utf-8' },
    },
  });
  assert.deepEqual(failures(await checkSite('https://example.org', { get })), []);
});

test('fails a verification file whose body is not JSON', async () => {
  const { get } = site({
    '/.well-known/apple-app-site-association': {
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: '<html>index</html>',
    },
  });
  const [failure] = failures(await checkSite('https://example.org', { get }));
  assert.match(failure.problem, /not JSON/);
});

test('fails on a 404, for a file and for a page', async () => {
  const notFound = { status: 404, headers: { 'content-type': 'text/html' }, body: '' };
  const { get } = site({ '/.well-known/assetlinks.json': notFound, '/join/482913': notFound });
  const found = failures(await checkSite('https://example.org', { get }));
  assert.deepEqual(
    found.map((r) => r.label),
    ['https://example.org/.well-known/assetlinks.json', 'https://example.org/join/482913'],
  );
  for (const r of found) assert.match(r.problem, /answers 404/);
});

test('fails a page that is not HTML or has lost its link preview tags', async () => {
  const { get } = site({
    '/': { status: 200, headers: { 'content-type': 'application/json' }, body: '{}' },
    '/nothing': { ...html, body: '<html></html>' },
  });
  const found = failures(await checkSite('https://example.org', { get }));
  assert.match(found.find((r) => r.label.endsWith('.org/')).problem, /content-type/);
  assert.match(found.find((r) => r.label.endsWith('/nothing')).problem, /og:title/);
});

test('fails files without the production and preview apps, or with a malformed fingerprint', async () => {
  const { get } = site({
    '/.well-known/apple-app-site-association': json({
      applinks: { details: [{ appIDs: ['QQJF5895MC.com.other'], components: [] }] },
    }),
    '/.well-known/assetlinks.json': json([
      statement('com.harryviennot.flimme', FINGERPRINT.toLowerCase()),
    ]),
  });
  const [aasa, assetlinks] = failures(await checkSite('https://example.org', { get }));
  assert.match(aasa.problem, /com\.harryviennot\.flimme\b/);
  assert.match(aasa.problem, /components/);
  assert.match(assetlinks.problem, /com\.harryviennot\.flimme\.preview/);
  assert.match(assetlinks.problem, /fingerprint/);
});

test('fails placeholders, unless allowed (then a warning)', async () => {
  const withPlaceholder = {
    '/.well-known/assetlinks.json': json([
      statement('com.harryviennot.flimme', 'REPLACE_WITH_PRODUCTION_KEY_SHA256'),
      statement('com.harryviennot.flimme.preview'),
    ]),
  };
  const strict = failures(await checkSite('https://example.org', site(withPlaceholder)));
  assert.equal(strict.length, 1);
  assert.match(strict[0].problem, /placeholder/);

  const allowed = await checkSite('https://example.org', {
    ...site(withPlaceholder),
    allowPlaceholders: true,
  });
  assert.deepEqual(failures(allowed), []);
  assert.match(allowed.find((r) => r.warning).warning, /placeholder/);
});

test('fails a redirect with the wrong status or destination, naming what was expected', async () => {
  const { get: good } = site();
  const moved = (status, location) => ({ status, headers: { location }, body: '' });
  const get = async (url, options = {}) => {
    const { pathname } = new URL(url);
    // The path is lost.
    if (options.host === 'www.flimme.com') return moved(301, 'https://flimme.com/');
    // The French name skips its own bare domain.
    if (options.host === 'www.flimme.fr') return moved(301, 'https://flimme.com/join/123456?r=x');
    // An invite link sent on temporarily, and the root sent on for good: a 301 sticks in browsers
    // and would hide the French site once it exists.
    if (options.host === 'flimme.fr' && pathname.startsWith('/join/')) {
      return moved(302, 'https://flimme.com/join/123456?r=x');
    }
    if (options.host === 'flimme.fr') return moved(301, 'https://flimme.com/');
    return good(url, options);
  };
  const found = failures(await checkSite('http://localhost:8080', { get }));
  assert.deepEqual(
    found.map((r) => [r.label, r.problem.replace(/^.*, expected /, '')]),
    [
      [
        'http://localhost:8080/join/123456?r=x (Host: www.flimme.com)',
        '301 to https://flimme.com/join/123456?r=x',
      ],
      [
        'http://localhost:8080/join/123456?r=x (Host: www.flimme.fr)',
        '301 to https://flimme.fr/join/123456?r=x',
      ],
      [
        'http://localhost:8080/join/123456?r=x (Host: flimme.fr)',
        '301 to https://flimme.com/join/123456?r=x',
      ],
      ['http://localhost:8080/ (Host: flimme.fr)', '302 to https://flimme.com/'],
    ],
  );
});

test('redirects go to the real hosts from https://flimme.com, else through a Host header', () => {
  assert.deepEqual(
    redirectRequests('https://flimme.com').map(({ url, host }) => [url, host]),
    [
      ['https://www.flimme.com/join/123456?r=x', undefined],
      ['https://www.flimme.fr/join/123456?r=x', undefined],
      ['https://flimme.fr/join/123456?r=x', undefined],
      ['https://flimme.fr/', undefined],
    ],
  );
  assert.deepEqual(
    redirectRequests('http://localhost:8080').map(({ url, host }) => [url, host]),
    [
      ['http://localhost:8080/join/123456?r=x', 'www.flimme.com'],
      ['http://localhost:8080/join/123456?r=x', 'www.flimme.fr'],
      ['http://localhost:8080/join/123456?r=x', 'flimme.fr'],
      ['http://localhost:8080/', 'flimme.fr'],
    ],
  );
});

test('--skip-redirects leaves the redirects out', async () => {
  const { get, calls } = site();
  const results = await checkSite('http://example.org', { get, redirects: false });
  assert.equal(results.length, 5);
  assert.ok(calls.every((c) => c.host === undefined));
});

test('a host that cannot be reached is a failure, not a crash', async () => {
  const get = async () => {
    throw new Error('getaddrinfo ENOTFOUND');
  };
  const found = failures(await checkSite('https://example.org', { get, redirects: false }));
  assert.equal(found.length, 5);
  assert.match(found[0].problem, /could not be reached: getaddrinfo ENOTFOUND/);
});

test('reads the base url and the flags; refuses anything else', () => {
  assert.deepEqual(parseArgs(['https://flimme.com/']), {
    base: 'https://flimme.com',
    allowPlaceholders: false,
    redirects: true,
  });
  assert.deepEqual(
    parseArgs(['http://localhost:8080', '--allow-placeholders', '--skip-redirects']),
    {
      base: 'http://localhost:8080',
      allowPlaceholders: true,
      redirects: false,
    },
  );
  assert.throws(() => parseArgs([]), /usage/);
  assert.throws(() => parseArgs(['flimme.com']), /http:\/\/ or https:\/\//);
  assert.throws(() => parseArgs(['ftp://flimme.com']), /http:\/\/ or https:\/\//);
  assert.throws(() => parseArgs(['https://flimme.com/join']), /no path/);
  assert.throws(() => parseArgs(['https://flimme.com', '--strict']), /unknown option --strict/);
});
