import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { APP_URL, assetPath, isAppUrl, isLocalRequest, downloadName } = require('../desktop/policy.cjs');

test('desktop serves only bundled files from its fixed app origin', () => {
  const root = path.resolve('dist');
  assert.equal(assetPath(root, APP_URL), path.join(root, 'index.html'));
  assert.equal(assetPath(root, 'audit://app/assets/main.js'), path.join(root, 'assets/main.js'));
  for (const url of [
    'audit://app/%2e%2e%2fsecret', 'audit://app/%00file', 'audit://app/%5c..%5csecret',
    'audit://app/%zz', 'file:///etc/passwd', 'https://example.com/',
    'audit://app.evil/index.html', 'audit://user@app/index.html', 'audit://app:80/index.html',
  ]) assert.equal(assetPath(root, url), null, url);
});

test('desktop network policy blocks remote requests and permits local downloads', () => {
  assert(isAppUrl(APP_URL));
  assert(isLocalRequest('blob:audit://app/1234'));
  assert(isLocalRequest('data:image/png;base64,AA'));
  for (const url of ['https://example.com', 'http://localhost:1234/', 'ws://example.com', 'file:///etc/passwd'])
    assert.equal(isLocalRequest(url), false, url);
  assert.equal(downloadName('..\\data\\report.xlsx'), 'report.xlsx');
});
