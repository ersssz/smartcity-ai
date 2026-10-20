const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// Keep debug and embedded-release bundling within this laptop's RAM budget.
config.maxWorkers = 2;
module.exports = config;
