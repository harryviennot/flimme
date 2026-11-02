import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { scrubBreadcrumb, scrubEvent } from './sentry-scrub';

describe('scrubBreadcrumb', () => {
  it('turns a join code in a navigation breadcrumb into a placeholder', () => {
    const crumb = scrubBreadcrumb({
      category: 'navigation',
      data: { from: '/welcome', to: '/join/482913' },
    });
    expect(crumb?.data).toEqual({ from: '/welcome', to: '/join/[code]' });
  });

  it('turns a room id into a placeholder, also inside a link, and drops query and fragment', () => {
    const crumb = scrubBreadcrumb({
      category: 'navigation',
      message: 'open flimme://room/3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e/swipe?from=invite#top',
    });
    expect(crumb?.message).toBe('open flimme://room/[id]/swipe');
  });

  it('strips query strings from request urls', () => {
    const crumb = scrubBreadcrumb({
      category: 'fetch',
      data: { url: 'https://x.supabase.co/rest/v1/my_profile?select=*&name=eq.Lea', method: 'GET' },
    });
    expect(crumb?.data).toEqual({ url: 'https://x.supabase.co/rest/v1/my_profile', method: 'GET' });
  });

  it('drops console breadcrumbs', () => {
    expect(scrubBreadcrumb({ category: 'console', message: 'hello Lea' })).toBeNull();
  });

  it('removes request bodies', () => {
    const crumb = scrubBreadcrumb({
      category: 'xhr',
      data: { url: 'https://x.test/rpc/join_room', body: '{"p_code":"1"}', request_body: 'x' },
    });
    expect(crumb?.data).not.toHaveProperty('body');
    expect(crumb?.data).not.toHaveProperty('request_body');
  });
});

describe('scrubEvent', () => {
  it('removes the user, the ip, the request and the device name', () => {
    const event = scrubEvent({
      user: { id: 'u1', username: 'Lea', ip_address: '1.2.3.4', email: 'a@b.fr' },
      request: { url: 'flimme://join/482913', headers: { cookie: 'x' } },
      server_name: 'Lea iPhone',
      message: 'boom',
    });
    expect(event).not.toHaveProperty('user');
    expect(event).not.toHaveProperty('request');
    expect(event).not.toHaveProperty('server_name');
    expect(event.message).toBe('boom');
  });

  it('blanks codes, ids and emails in messages and in the cause chain', () => {
    const event = scrubEvent({
      message: 'room 482913 for a@b.fr',
      exception: {
        values: [
          { value: 'Key (code)=(482913) exists' },
          { value: 'seat 3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e' },
        ],
      },
    });
    expect(event.message).toBe('room [code] for [email]');
    expect(event.exception?.values?.map((v) => v.value)).toEqual([
      'Key (code)=([code]) exists',
      'seat [id]',
    ]);
  });

  it('scrubs the breadcrumbs it carries', () => {
    const event = scrubEvent({
      breadcrumbs: [
        { category: 'navigation', data: { to: '/join/482913' } },
        { category: 'console', message: 'x' },
      ],
    });
    expect(event.breadcrumbs).toEqual([{ category: 'navigation', data: { to: '/join/[code]' } }]);
  });
});

describe('the source', () => {
  it('never calls setUser', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(name) && !name.includes('.test.')) files.push(path);
      }
    };
    walk(join(__dirname, '..'));
    const offenders = files.filter((file) => /\bsetUser\b/.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
