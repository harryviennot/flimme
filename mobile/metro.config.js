const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const { withUniwindConfig } = require('uniwind/metro');

// Sentry's wrapper gives every bundle a Debug ID, so source maps match crashes. It replaces
// getDefaultConfig.
const config = getSentryExpoConfig(__dirname);

// Uniwind must be the outermost wrapper.
module.exports = withUniwindConfig(config, {
  cssEntryFile: './src/global.css',
  dtsFile: './src/uniwind-types.d.ts',
});
