// Reproducible packaging of the verified delivered corpus, never models or APIs.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const delivery = path.resolve(root, '../AstanaAI-Prepared-Narration');
const manifestBytes = fs.readFileSync(path.join(delivery, 'prepared-narration-manifest.json'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
if (sha(manifestBytes) !== 'f4f0e5c4d5ec40316c01fcad554942f561c563c133ad1d72d1ca053e15ba58c6') throw new Error('DELIVERED_MANIFEST_CHANGED');
const manifest = JSON.parse(manifestBytes);
if (manifest.entries.length !== 54 || new Set(manifest.entries.map(e => e.id)).size !== 54) throw new Error('INVALID_COVERAGE');
const target = path.join(root, 'apps/mobile/android/app/src/main/assets/astana-audio');
const registryFile = path.join(root, 'apps/mobile/src/canonical/preparedAudioRegistry.generated.json');
const check = process.argv.includes('--check');
function writeOwned(file, bytes) {
  if (fs.existsSync(file)) {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('UNSAFE_OUTPUT_FILE');
    const before = fs.readFileSync(file);
    if (before.equals(Buffer.from(bytes))) return;
    if (check) throw new Error('OUTPUT_STALE');
  } else if (check) throw new Error('OUTPUT_MISSING');
  // Replacing an owned directory entry never follows a substituted file link.
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${crypto.randomUUID()}.tmp`);
  const handle = fs.openSync(temporary, 'wx');
  try { fs.writeFileSync(handle, bytes); fs.fsyncSync(handle); }
  finally { fs.closeSync(handle); }
  fs.renameSync(temporary, file);
}
function safeDirectory(directory) {
  const relative = path.relative(root, directory);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('OUTPUT_OUTSIDE_REPO');
  let current = root;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    if (fs.existsSync(current) && (!fs.lstatSync(current).isDirectory() || fs.lstatSync(current).isSymbolicLink())) throw new Error('LINKED_OUTPUT');
  }
  if (!check) fs.mkdirSync(directory, { recursive: true });
}
safeDirectory(target); safeDirectory(path.dirname(registryFile));
const entries = manifest.entries.map(e => {
  if (!/^[a-f0-9]{64}$/.test(e.sha256) || e.path !== `audio/${e.sha256}.mp3` || e.assetId !== `audio-${e.sha256}`) throw new Error('UNSAFE_MEDIA_PATH');
  const bytes = fs.readFileSync(path.join(delivery, e.path));
  if (bytes.length !== e.bytes || sha(bytes) !== e.sha256 || !e.decodingVerified || !(e.durationSeconds > 0)) throw new Error('CORRUPT_DELIVERED_MEDIA');
  const destination = path.join(target, `${e.sha256}.mp3`);
  if (fs.existsSync(destination)) {
    if (fs.lstatSync(destination).isSymbolicLink() || sha(fs.readFileSync(destination)) !== e.sha256) throw new Error('EXISTING_MEDIA_CHANGED');
  } else if (check) throw new Error('BUNDLED_MEDIA_MISSING');
  else fs.writeFileSync(destination, bytes, { flag: 'wx' });
  return { id: e.id, locale: e.locale, assetId: e.assetId, path: e.path, sha256: e.sha256,
    bytes: e.bytes, textSha256: e.textSha256, durationSeconds: e.durationSeconds,
    license: e.provenance.license, attribution: e.provenance.attribution };
});
const registry = { version: 1, contentRevision: manifest.contentRevision, manifestSha256: sha(manifestBytes), entries };
const json = JSON.stringify(registry, null, 2) + '\n';
writeOwned(registryFile, json);
const notices = [...new Map(entries.map(e => [e.locale, { locale: e.locale, license: e.license, attribution: e.attribution }])).values()];
const noticeFile = path.join(target, 'credits.json');
const noticeJson = JSON.stringify(notices, null, 2) + '\n';
writeOwned(noticeFile, noticeJson);
const gpl = fs.readFileSync(path.join(__dirname, 'COPYING-GPL-3.0.txt'));
const gplTarget = path.join(target, 'COPYING-GPL-3.0.txt');
writeOwned(gplTarget, gpl);
process.stdout.write(JSON.stringify({ entries: entries.length, bytes: entries.reduce((n, e) => n + e.bytes, 0), registrySha256: sha(Buffer.from(json)), checked: check }) + '\n');
