import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('metro config', () => {
  const source = readFileSync(join(__dirname, 'metro.config.js'), 'utf8');

  it('exports the Uniwind wrapper as the outermost one', () => {
    expect(source).toMatch(/module\.exports\s*=\s*withUniwindConfig\(config,/);
  });

  it('builds on Sentry, which gives every bundle a Debug ID', () => {
    expect(source).toMatch(/getSentryExpoConfig\(__dirname\)/);
  });
});
