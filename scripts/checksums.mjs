import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const folder = path.resolve('release');
const files = (await readdir(folder)).filter(name => name.endsWith('.exe')).sort();
if (files.length !== 2) throw new Error('Expected both Windows installer and portable executable');
const lines = [];
for (const name of files) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path.join(folder, name))) hash.update(chunk);
  lines.push(`${hash.digest('hex')}  ${name}`);
}
await writeFile(path.join(folder, 'SHA256SUMS.txt'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
