import { parseAppConfig } from './parse';

describe('parseAppConfig', () => {
  it('keeps the keys the app reads and ignores the rest', () => {
    const report = jest.fn();
    expect(
      parseAppConfig(
        {
          min_app_version: { ios: '1.2.0', android: '1.3.0', extra: 'x' },
          tmdb_image_base: 'https://images.example.test/',
          deck_engine: 'sql',
          something_new: { a: 1 },
        },
        report,
      ),
    ).toEqual({
      min_app_version: { ios: '1.2.0', android: '1.3.0' },
      tmdb_image_base: 'https://images.example.test/',
    });
    expect(report).not.toHaveBeenCalled();
  });

  it('leaves missing keys undefined without reporting', () => {
    const report = jest.fn();
    expect(parseAppConfig({}, report)).toEqual({});
    expect(report).not.toHaveBeenCalled();
  });

  it('treats a malformed minimum as missing and reports it', () => {
    for (const bad of [
      'soon',
      null,
      [],
      { ios: '1.0.0' },
      { ios: 1, android: '1.0.0' },
      { ios: '1.0', android: '1.0.0' },
    ]) {
      const report = jest.fn();
      expect(parseAppConfig({ min_app_version: bad }, report)).toEqual({});
      expect(report).toHaveBeenCalledTimes(1);
    }
  });

  it('treats a malformed image base as missing and reports it', () => {
    const report = jest.fn();
    expect(parseAppConfig({ tmdb_image_base: 3 }, report)).toEqual({});
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('keeps an https invite base and reports anything else', () => {
    const report = jest.fn();
    expect(parseAppConfig({ invite_base_url: 'https://flimme.com' }, report)).toEqual({
      invite_base_url: 'https://flimme.com',
    });
    expect(report).not.toHaveBeenCalled();
    for (const bad of ['http://flimme.com', 'flimme://x', 3, null, {}]) {
      const r = jest.fn();
      expect(parseAppConfig({ invite_base_url: bad }, r)).toEqual({});
      expect(r).toHaveBeenCalledTimes(1);
    }
  });

  it('answers an empty config for something that is not an object', () => {
    expect(parseAppConfig(null)).toEqual({});
    expect(parseAppConfig('x')).toEqual({});
  });
});
