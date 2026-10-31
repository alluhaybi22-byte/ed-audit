import { readFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const tag = `v${version}`;
const names = [
  `ED-Audit-${version}-win-x64-Setup.exe`,
  `ED-Audit-${version}-win-x64-Portable.exe`,
  `ED-Audit-${version}-win-x64-Setup.zip`,
  `ED-Audit-${version}-win-x64-Portable.zip`,
  'SHA256SUMS.txt', 'ZIP-SHA256SUMS.txt', 'WINDOWS-AR.md',
];
const files = names.map(name => path.join('artifacts', name === 'WINDOWS-AR.md' ? 'docs' : 'release', name));
for (const file of files) await access(file);
const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const view = () => JSON.parse(gh('release', 'view', tag, '--json', 'isDraft,assets'));
let release;
try { release = view(); }
catch {
  gh('release', 'create', tag, '--draft', '--target', process.env.GITHUB_SHA,
    '--title', `ED Audit ${tag} — Windows x64`, '--notes-file', `docs/RELEASE-${version}.md`);
  release = view();
}
const missing = names.filter(name => !release.assets.some(asset => asset.name === name));
if (!release.isDraft) {
  if (missing.length) throw new Error(`Published release is missing assets: ${missing.join(', ')}`);
  console.log(`Release ${tag} already contains all seven expected assets; preserving it.`);
} else {
  for (const name of missing) gh('release', 'upload', tag, files[names.indexOf(name)]);
  release = view();
  const incomplete = names.filter(name => !release.assets.some(asset => asset.name === name));
  if (incomplete.length) throw new Error(`Draft release is incomplete: ${incomplete.join(', ')}`);
  gh('release', 'edit', tag, '--draft=false');
  console.log(`Published ${tag} with all seven verified assets.`);
}
