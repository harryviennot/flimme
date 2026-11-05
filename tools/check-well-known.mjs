#!/usr/bin/env node
// Checks that a host serves the invite page and the app-link files the way iOS and Android need
// them (roadmap M4.18): both /.well-known/ files answer 200 as JSON with no redirect, hold the
// production and preview apps and real fingerprints; /join/<code>, / and any other path answer the
// page (200 HTML with its link preview tags); the other names redirect as REDIRECTS says, with the
// same path and query.
//
//   node tools/check-well-known.mjs https://flimme.com          the deploy check (production.yml)
//   node tools/check-well-known.mjs http://localhost:8080 --allow-placeholders   (CI's web job)
//   node tools/check-well-known.mjs http://<dokploy test domain> --skip-redirects
//
// From https://flimme.com the redirects are asked of the real hosts (DNS, certificates and all);
// from any other base, of the same address with a Host header, which reaches nginx's redirect
// block directly. --skip-redirects is for a host that routes no other domain (Dokploy's test
// domain). --allow-placeholders accepts the REPLACE_WITH_ values with a warning (CI, before the
// fingerprints are in); the deploy check never passes it. Exits 1 naming every failing URL.
import http from 'node:http';
import https from 'node:https';
import { pathToFileURL } from 'node:url';

export const DOMAIN = 'flimme.com';
const INVITE = '/join/123456?r=x';
// The other names: www goes to the bare domain for good; flimme.fr will be the French site and
// flimme.com the English one, so flimme.fr sends its invite links to flimme.com for good and the
// rest only for now (a 301 sticks in browsers and would hide the French site). Q18.2, Q18.8.
export const REDIRECTS = [
  { host: 'www.flimme.com', path: INVITE, status: 301, location: `https://flimme.com${INVITE}` },
  { host: 'www.flimme.fr', path: INVITE, status: 301, location: `https://flimme.fr${INVITE}` },
  { host: 'flimme.fr', path: INVITE, status: 301, location: `https://flimme.com${INVITE}` },
  { host: 'flimme.fr', path: '/', status: 302, location: 'https://flimme.com/' },
];
// The bundle id and the Android package are the same for each app.
export const APPS = ['com.harryviennot.flimme', 'com.harryviennot.flimme.preview'];

const AASA = '/.well-known/apple-app-site-association';
const ASSETLINKS = '/.well-known/assetlinks.json';
// An invite, the root and any other path: the page draws the invite or the broken-link state.
const PAGES = ['/join/482913', '/', '/nothing'];
const FINGERPRINT = /^[0-9A-F]{2}(?::[0-9A-F]{2}){31}$/;
const APP_ID = /^[A-Z0-9]{10}\.(.+)$/;
const PLACEHOLDER = 'REPLACE_WITH';
const TIMEOUT_MS = 15_000;

const USAGE =
  'usage: node tools/check-well-known.mjs <base url> [--allow-placeholders] [--skip-redirects]';

/** The command line: a base url (http or https, no path) and the two flags. */
export function parseArgs(argv) {
  const flags = argv.filter((a) => a.startsWith('--'));
  const rest = argv.filter((a) => !a.startsWith('--'));
  for (const flag of flags) {
    if (flag !== '--allow-placeholders' && flag !== '--skip-redirects') {
      throw new Error(`unknown option ${flag}\n${USAGE}`);
    }
  }
  if (rest.length !== 1) throw new Error(USAGE);
  let url;
  try {
    url = new URL(rest[0]);
  } catch {
    url = null;
  }
  if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
    throw new Error(`the base url must start with http:// or https://, got "${rest[0]}"`);
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`the base url takes no path, got "${rest[0]}"`);
  }
  return {
    base: url.origin,
    allowPlaceholders: flags.includes('--allow-placeholders'),
    redirects: !flags.includes('--skip-redirects'),
  };
}

/** One GET, never following a redirect. A `host` replaces the Host header (fetch can't). */
export function httpGet(url, { host } = {}) {
  const target = new URL(url);
  const client = target.protocol === 'https:' ? https : http;
  const headers = { 'user-agent': 'flimme-check-well-known', ...(host ? { host } : {}) };
  return new Promise((resolve, reject) => {
    const request = client.request(target, { headers, timeout: TIMEOUT_MS }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () =>
        resolve({
          status: response.statusCode,
          headers: response.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        }),
      );
    });
    request.on('timeout', () =>
      request.destroy(new Error(`no answer after ${TIMEOUT_MS / 1000} s`)),
    );
    request.on('error', reject);
    request.end();
  });
}

/** Where to ask for each redirect: the real hosts from the production base, else the base itself
 * with a Host header. */
export function redirectRequests(base) {
  const fromDomain = new URL(base).hostname === DOMAIN;
  return REDIRECTS.map(({ host, path, ...expected }) =>
    fromDomain
      ? { label: `https://${host}${path}`, url: `https://${host}${path}`, expected }
      : { label: `${base}${path} (Host: ${host})`, url: `${base}${path}`, host, expected },
  );
}

const header = (response, name) => String(response.headers?.[name] ?? '').toLowerCase();

/** A value still holding a placeholder: a problem, or with `allowPlaceholders` only a warning. */
function placeholderCheck(value, where, allowPlaceholders, problems, warnings) {
  if (typeof value !== 'string' || !value.includes(PLACEHOLDER)) return false;
  (allowPlaceholders ? warnings : problems).push(`${where} is still a placeholder (${value})`);
  return true;
}

function aasaProblems(file, allowPlaceholders, warnings) {
  const problems = [];
  const details = file?.applinks?.details;
  if (!Array.isArray(details) || details.length === 0) return ['has no applinks.details'];
  const bundles = [];
  for (const detail of details) {
    if (!Array.isArray(detail?.appIDs) || detail.appIDs.length === 0) {
      problems.push('has a detail without appIDs');
      continue;
    }
    if (!Array.isArray(detail.components) || detail.components.length === 0) {
      problems.push('has a detail without components');
    }
    for (const id of detail.appIDs) {
      if (placeholderCheck(id, `app id`, allowPlaceholders, problems, warnings)) {
        bundles.push(String(id).slice(String(id).indexOf('.') + 1));
        continue;
      }
      const match = APP_ID.exec(String(id));
      if (match) bundles.push(match[1]);
      else problems.push(`app id "${id}" is not <team id>.<bundle id>`);
    }
  }
  for (const app of APPS) {
    if (!bundles.includes(app)) problems.push(`lists no app id for ${app}`);
  }
  return problems;
}

function assetlinksProblems(file, allowPlaceholders, warnings) {
  if (!Array.isArray(file) || file.length === 0) return ['is not a list of statements'];
  const problems = [];
  const packages = [];
  for (const statement of file) {
    const target = statement?.target;
    const name = target?.package_name;
    if (!statement?.relation?.includes?.('delegate_permission/common.handle_all_urls')) {
      problems.push(`${name ?? 'a statement'} lacks the handle_all_urls relation`);
    }
    if (target?.namespace !== 'android_app' || typeof name !== 'string') {
      problems.push('has a statement that is not an android_app with a package_name');
      continue;
    }
    packages.push(name);
    const fingerprints = target.sha256_cert_fingerprints;
    if (!Array.isArray(fingerprints) || fingerprints.length === 0) {
      problems.push(`${name} has no sha256_cert_fingerprints`);
      continue;
    }
    for (const value of fingerprints) {
      if (placeholderCheck(value, `${name}'s fingerprint`, allowPlaceholders, problems, warnings)) {
        continue;
      }
      if (!FINGERPRINT.test(String(value))) {
        problems.push(`${name}'s fingerprint "${value}" is not 32 uppercase hex pairs with colons`);
      }
    }
  }
  for (const app of APPS) {
    if (!packages.includes(app)) problems.push(`lists no statement for ${app}`);
  }
  return problems;
}

function fileProblems(path, response, allowPlaceholders, warnings) {
  if (response.status !== 200) {
    const where = response.headers?.location ? ` to ${response.headers.location}` : '';
    const redirect = response.status >= 300 && response.status < 400;
    return [
      `answers ${response.status}${where}${redirect ? " (a redirect: iOS and Android don't follow it)" : ''}`,
    ];
  }
  const type = header(response, 'content-type');
  if (!type.startsWith('application/json')) {
    return [`has content-type ${type || '(none)'}, expected application/json`];
  }
  let file;
  try {
    file = JSON.parse(response.body);
  } catch {
    return ['is not JSON'];
  }
  return path === AASA
    ? aasaProblems(file, allowPlaceholders, warnings)
    : assetlinksProblems(file, allowPlaceholders, warnings);
}

function pageProblem(response) {
  if (response.status !== 200) return `answers ${response.status}, expected 200`;
  const type = header(response, 'content-type');
  if (!type.startsWith('text/html'))
    return `has content-type ${type || '(none)'}, expected text/html`;
  // The link preview tags (decisions.md, M4.14 Q14.6): chat apps read them without running scripts.
  if (!response.body.includes('og:title')) return 'has no link preview tags (og:title)';
  return null;
}

function redirectProblem(response, expected) {
  const location = response.headers?.location;
  if (response.status === expected.status && location === expected.location) return null;
  return `answers ${response.status}${location ? ` to ${location}` : ''}, expected ${expected.status} to ${expected.location}`;
}

/**
 * Every check against `base`, in order: the two files, the pages, then the redirects. Each result
 * is `{ label, problem, warning }`, with `problem` null when the URL passed.
 */
export async function checkSite(
  base,
  { get = httpGet, allowPlaceholders = false, redirects = true } = {},
) {
  const results = [];
  const ask = async (label, url, host, judge) => {
    let response;
    try {
      response = await get(url, host ? { host } : {});
    } catch (error) {
      results.push({ label, problem: `could not be reached: ${error.message}`, warning: null });
      return;
    }
    const warnings = [];
    const problems = judge(response, warnings);
    results.push({
      label,
      problem: problems.length ? problems.join('; ') : null,
      warning: warnings.length ? warnings.join('; ') : null,
    });
  };

  for (const path of [AASA, ASSETLINKS]) {
    await ask(`${base}${path}`, `${base}${path}`, undefined, (response, warnings) =>
      fileProblems(path, response, allowPlaceholders, warnings),
    );
  }
  for (const path of PAGES) {
    await ask(`${base}${path}`, `${base}${path}`, undefined, (response) =>
      [pageProblem(response)].filter(Boolean),
    );
  }
  if (redirects) {
    for (const { label, url, host, expected } of redirectRequests(base)) {
      await ask(label, url, host, (response) =>
        [redirectProblem(response, expected)].filter(Boolean),
      );
    }
  }
  return results;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
  const results = await checkSite(options.base, options);
  for (const { label, problem, warning } of results) {
    if (problem) console.log(`FAIL ${label}: ${problem}`);
    else console.log(`ok   ${label}`);
    if (warning) console.log(`warn ${label}: ${warning}`);
  }
  const failed = results.filter((r) => r.problem).length;
  if (failed) {
    console.log(`\n${failed} of ${results.length} checks failed.`);
    process.exit(1);
  }
  console.log(`\nAll ${results.length} checks passed.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
