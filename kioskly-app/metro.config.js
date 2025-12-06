const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Enable CSS hot reloading
config.resetCache = true;

module.exports = withNativeWind(config, { input: './global.css' });