import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '..');
const allowed = new Set(['/src/review-library.mjs', '/src/model.mjs', '/src/template.mjs']);
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end('<!doctype html><html><body>Storage integration checks</body></html>');
  } else if (allowed.has(pathname)) {
    response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
    response.end(await readFile(path.join(root, pathname.slice(1))));
  } else { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const candidates = [
  process.env.AUDIT_BROWSER,
  '/usr/bin/chromium', '/usr/bin/google-chrome',
  process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'),
  process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google/Chrome/Application/chrome.exe'),
].filter(Boolean);
const executablePath = candidates.find(candidate => existsSync(candidate));
const browser = await chromium.launch({ executablePath, headless: true,
  args: process.platform === 'linux' ? ['--no-sandbox', '--disable-dev-shm-usage'] : [] });
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const results = await page.evaluate(async () => {
    const { openReviewLibrary } = await import('/src/review-library.mjs');
    const { exampleDocument, amend, value } = await import('/src/model.mjs');
    const passed = [];
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    const equal = (a, b, message) => assert(JSON.stringify(a) === JSON.stringify(b), message);
    const rejection = async (action, code) => {
      try { await action(); } catch (error) { assert(error.code === code, `${error.code} !== ${code}`); return error; }
      throw new Error(`Expected rejection ${code}`);
    };
    const dbName = `library-test-${crypto.randomUUID()}`;
    let milliseconds = Date.parse('2026-10-31T00:00:00.000Z');
    const now = () => new Date(milliseconds).toISOString();
    const legacy = exampleDocument();
    delete legacy.sheets.DtoPK;
    const legacyRaw = JSON.stringify(legacy);
    localStorage.setItem('legacy-copy', legacyRaw);
    let library = await openReviewLibrary({ dbName, legacyRaw, now });
    const migrated = await library.getCurrent();
    assert(migrated.id === library.legacyProjectId, 'Migration id is persistent');
    assert(!Object.hasOwn(migrated.doc.sheets, 'DtoPK'), 'Migration must preserve partial sheets');
    assert(localStorage.getItem('legacy-copy') === legacyRaw, 'Migration cannot overwrite legacy bytes');
    assert((await library.snapshots(migrated.id))[0].kind === 'legacy', 'Migration retains original backup');
    library.close();
    library = await openReviewLibrary({ dbName, legacyRaw, now });
    assert((await library.list()).length === 1, 'Legacy imported exactly once');
    assert(library.legacyProjectId === migrated.id, 'Legacy project id survives reopening');
    passed.push('Partial legacy migration is atomic, one-time and retains original bytes');

    let firstDoc = amend(migrated.doc, 'Summary Sheet', 'C28', 'First Reviewer');
    await library.save(firstDoc, { id: migrated.id, title: 'أرشيف المنشأة الأولى' });
    const checkpoint = await library.checkpoint(migrated.id, 'نسخة يدوية — قبل التعديل');
    let secondDoc = amend(exampleDocument(), 'Summary Sheet', 'C14', 'Second Facility');
    secondDoc = amend(secondDoc, 'Summary Sheet', 'C11', 'Oct');
    const second = await library.save(secondDoc);
    assert(second.title.includes('Second Facility') && second.title.includes('Oct'), 'Derived project title');
    assert((await library.list()).length === 2, 'Independent reviews retained');
    milliseconds += 1000;
    firstDoc = amend(firstDoc, 'Summary Sheet', 'C28', 'Later Reviewer');
    await library.save(firstDoc, { id: migrated.id, activate: false });
    assert((await library.getCurrent()).id === second.id, 'Late background save cannot switch active review');
    assert((await library.load(migrated.id)).title === 'أرشيف المنشأة الأولى', 'Existing title preserved');
    equal(value((await library.getCurrent()).doc, 'Summary Sheet', 'C28'), 'Later Reviewer', 'Project modifications saved');
    passed.push('Independent facility/month reviews, explicit activation and project title retention');

    let lastAutomaticCount;
    for (let i = 0; i < 8; i++) {
      milliseconds += 5 * 60 * 1000;
      firstDoc = amend(firstDoc, 'Summary Sheet', 'C28', `Reviewer ${i}`);
      await library.save(firstDoc, { id: migrated.id });
      const snapshots = await library.snapshots(migrated.id);
      assert(snapshots.filter(s => s.kind === 'automatic').length <= 5, 'Automatic snapshots bounded');
      assert(snapshots.some(s => s.id === checkpoint.id), 'Manual checkpoint retained');
      lastAutomaticCount = snapshots.filter(s => s.kind === 'automatic').length;
    }
    const idsBeforeQuickEdit = (await library.snapshots(migrated.id)).filter(s => s.kind === 'automatic').map(s => s.id);
    milliseconds += 500;
    firstDoc = amend(firstDoc, 'Summary Sheet', 'C28', 'Final Reviewer');
    await library.save(firstDoc, { id: migrated.id });
    equal((await library.snapshots(migrated.id)).filter(s => s.kind === 'automatic').map(s => s.id), idsBeforeQuickEdit,
      'Frequent saves coalesce automatic restore points');
    assert(lastAutomaticCount === 5, 'Five latest automatic backups retained');
    const restored = await library.restore(migrated.id, checkpoint.id);
    assert(value(restored.doc, 'Summary Sheet', 'C28') === 'First Reviewer', 'Manual restore returns saved review');
    const recovery = (await library.snapshots(migrated.id)).find(s => s.kind === 'recovery');
    assert(recovery, 'Pre-restore state protected');
    const undoneRestore = await library.restore(migrated.id, recovery.id);
    assert(value(undoneRestore.doc, 'Summary Sheet', 'C28') === 'Final Reviewer', 'Restore itself is recoverable');
    assert((await library.snapshots(migrated.id)).some(s => s.id === checkpoint.id), 'Manual point survives restoration');
    milliseconds -= 2 * 24 * 60 * 60 * 1000;
    const beforeClockCorrection = value((await library.getCurrent()).doc, 'Summary Sheet', 'C28');
    firstDoc = amend(firstDoc, 'Summary Sheet', 'C28', 'After clock correction');
    await library.save(firstDoc, { id: migrated.id });
    const newest = (await library.snapshots(migrated.id)).find(s => s.kind === 'automatic');
    assert(newest && newest.createdAt === now(), 'Clock rollback must retain and order the newest automatic backup');
    const clockRecovery = await library.restore(migrated.id, newest.id);
    assert(value(clockRecovery.doc, 'Summary Sheet', 'C28') === beforeClockCorrection, 'Backup before clock correction remains restorable');
    passed.push('Five-minute auto checkpoints, five-version retention, protected manual backups and reversible restoration');

    await library.load(second.id);
    const before = await library.list();
    const pointsBefore = await library.snapshots(migrated.id);
    const put = IDBObjectStore.prototype.put;
    for (const failurePoint of ['projects', 'active']) {
      IDBObjectStore.prototype.put = function(record, ...args) {
        if (this.name === failurePoint || (failurePoint === 'active' && this.name === 'meta' && record.key === 'active'))
          throw new DOMException('Simulated disk quota', 'QuotaExceededError');
        return put.call(this, record, ...args);
      };
      milliseconds += 5 * 60 * 1000;
      try {
        const error = await rejection(() => library.save(amend(firstDoc, 'Summary Sheet', 'C28', 'Uncommitted'), { id: migrated.id }), 'storage-write');
        assert(error.quota, 'Quota classification retained');
      } finally { IDBObjectStore.prototype.put = put; }
      equal(await library.list(), before, 'Failed transaction preserves all project records');
      equal(await library.snapshots(migrated.id), pointsBefore, 'Failed transaction rolls back added/pruned snapshots');
      assert((await library.getCurrent()).id === second.id, 'Failed transaction preserves active review');
    }
    IDBObjectStore.prototype.put = function(record, ...args) {
      if (this.name === 'projects') throw new DOMException('Read only', 'ReadOnlyError');
      return put.call(this, record, ...args);
    };
    try { await rejection(() => library.restore(migrated.id, checkpoint.id), 'storage-write'); }
    finally { IDBObjectStore.prototype.put = put; }
    equal(await library.snapshots(migrated.id), pointsBefore, 'Failed restore rolls back protected recovery point');
    assert((await library.getCurrent()).id === second.id, 'Failed restore cannot switch active project');
    passed.push('Quota/read-only failures at early and late writes roll back documents, versions and active selection');

    await rejection(() => library.save({ malformed: true }), 'backup');
    assert((await library.list()).length === 2, 'Malformed input cannot create a review');
    await library.remove(migrated.id);
    assert((await library.getCurrent()).id === second.id, 'Deleting another review preserves active review');
    await library.clearCurrent();
    library.close();
    library = await openReviewLibrary({ dbName, legacyRaw, now });
    assert(await library.getCurrent() === null, 'Intentional close survives reload');
    assert((await library.list()).length === 1, 'Deleted migrated review never resurrects');
    assert(library.legacyProjectId === migrated.id, 'Migration provenance remains available for explicit legacy cleanup');
    await library.remove(second.id);
    assert((await library.list()).length === 0, 'Explicit deletion removes selected review');
    const damaged = await library.save(exampleDocument());
    const healthy = await library.save(exampleDocument());
    const raw = await new Promise((resolve, reject) => {
      const operation = indexedDB.open(dbName, 1);
      operation.onsuccess = () => resolve(operation.result);
      operation.onerror = () => reject(operation.error);
    });
    await new Promise((resolve, reject) => {
      const tx = raw.transaction('projects', 'readwrite');
      const store = tx.objectStore('projects');
      const operation = store.get(damaged.id);
      operation.onsuccess = () => store.put({ ...operation.result, doc: { sheets: { extra: { cells: null } } } });
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
    });
    raw.close();
    await rejection(() => library.load(damaged.id), 'storage-corrupt');
    assert((await library.getCurrent()).id === healthy.id, 'Corrupt stored documents cannot replace healthy active review');
    assert((await library.list()).length === 2, 'Corrupt-document metadata remains available for explicit recovery/deletion');
    await library.remove(damaged.id);
    await library.remove(healthy.id);
    assert(await library.getCurrent() === null, 'Explicit deletion of active review clears active pointer');
    library.close();
    passed.push('Malformed input rejected; close/delete persist across restart without resurrecting legacy state');
    passed.push('Corrupt stored documents cannot activate or crash consumers; explicit deletion remains available');

    const corruptRaw = '{invalid';
    const invalidLibrary = await openReviewLibrary({ dbName: dbName + '-invalid', legacyRaw: corruptRaw });
    assert(invalidLibrary.legacyInvalid, 'Invalid legacy copy reported');
    assert(await invalidLibrary.getCurrent() === null, 'Invalid legacy copy never enters workspace');
    assert((await invalidLibrary.list()).length === 0, 'Invalid legacy migration is non-destructive');
    const fresh = await invalidLibrary.save(exampleDocument());
    assert(fresh.id, 'A fresh review can be saved after invalid legacy data');
    invalidLibrary.close();
    passed.push('Corrupt legacy copy remains recoverable while new valid reviews can be created');
    return passed;
  });
  assert.equal(results.length, 7);
  console.log(JSON.stringify({ passed: results }, null, 2));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
