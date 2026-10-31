import fs from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import JSZip from 'jszip';

const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const checksums = [];
for (const edition of ['Setup', 'Portable']) {
  const name = `ED-Audit-${version}-win-x64-${edition}.exe`;
  const source = await readFile(path.join('release', name));
  const zip = new JSZip();
  zip.file(name, source);
  zip.file('WINDOWS-AR.md', await readFile('docs/WINDOWS-AR.md'));
  zip.file('SHA256SUMS.txt', `${createHash('sha256').update(source).digest('hex')}  ${name}\n`);
  const filename = name.replace('.exe', '.zip');
  await pipeline(zip.generateNodeStream({ streamFiles: true, compression: 'DEFLATE', compressionOptions: { level: 6 } }), fs.createWriteStream(path.join('release', filename)));
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(path.join('release', filename))) hash.update(chunk);
  checksums.push(`${hash.digest('hex')}  ${filename}\n`);
}
await writeFile('release/ZIP-SHA256SUMS.txt', checksums.join(''));
