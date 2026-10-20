const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const config = getDefaultConfig(__dirname);
// Keep debug and embedded-release bundling within this laptop's RAM budget.
config.maxWorkers = 2;
// Shared private packages and their compiled .runtime entries live at repo root.
config.watchFolders = [...new Set([...(config.watchFolders || []), path.resolve(__dirname, '../..')])];
module.exports = config;
