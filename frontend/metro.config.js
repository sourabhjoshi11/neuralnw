const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Zustand v4 ESM build uses `import.meta.env` (Vite-ism) which Metro/web
// can't handle. Disabling package-exports resolution makes Metro fall back
// to the CJS `main` field and avoids the "Cannot use 'import.meta'" error.
config.resolver.unstable_enablePackageExports = false;

module.exports = withNativeWind(config, { input: './global.css' });
