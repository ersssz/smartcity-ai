// Reproducible private-workspace Node build; no install, download or lifecycle hook.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const tsc = path.join(root, 'apps/mobile/node_modules/typescript/bin/tsc');
const names = ['contracts', 'city-evidence', 'walk-planner'];
execFileSync(process.execPath, [tsc, '--target', 'es2022', '--module', 'nodenext', '--moduleResolution', 'nodenext',
  '--strict', '--noUncheckedIndexedAccess', '--noEmitOnError', '--declaration', '--rootDir', '.', '--outDir', '.runtime',
  ...names.map(name => `packages/${name}/src/index.ts`)], { cwd: root, stdio: 'inherit' });
for (const name of names) {
  const directory = path.join(root, 'packages', name, 'dist'); fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'index.js'), `// Generated private-workspace entry; run npm run build:node from the repository root.\nexport * from '../../../.runtime/packages/${name}/src/index.js';\n`);
}
process.stdout.write('Node workspace build passed. No mobile or hosted integration is implied.\n');
