const { addNoDiskUrlCache } = require('./with-no-disk-url-cache');

const sample = `@main
class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {
  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
`;

describe('with-no-disk-url-cache', () => {
  it('sets a cache with no disk storage inside didFinishLaunchingWithOptions, before React Native starts', () => {
    const out = addNoDiskUrlCache(sample);
    const launch = out.indexOf('didFinishLaunchingWithOptions launchOptions');
    const line = out.indexOf('diskCapacity: 0');
    expect(out.match(/URLCache\.shared = /g)).toHaveLength(1);
    expect(line).toBeGreaterThan(launch);
    expect(line).toBeLessThan(out.indexOf('let delegate = ReactNativeDelegate()'));
  });

  it('changes nothing the second time', () => {
    const once = addNoDiskUrlCache(sample);
    expect(addNoDiskUrlCache(once)).toBe(once);
  });

  it('fails loudly when the generated file has no anchor', () => {
    expect(() => addNoDiskUrlCache('class AppDelegate {}')).toThrow(/with-no-disk-url-cache/);
  });
});
