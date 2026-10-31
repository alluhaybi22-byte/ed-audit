import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { exampleDocument, amend, validateBackup, value } from '../src/model.mjs';
import { launch, nav, saved, downloadTo } from './helpers.mjs';

const reviewer = page => page.getByRole('textbox', { name: 'Cluster reviewer C28', exact: true });
const card = (page, facility) => page.getByRole('article', { name: new RegExp(facility) });
function review(facility, month, name) {
  const doc = exampleDocument();
  doc.sheets['Summary Sheet'].cells.C14.v = facility;
  doc.sheets['Summary Sheet'].cells.C11.v = month;
  return amend(doc, 'Summary Sheet', 'C28', name);
}
async function importReview(page, doc, replace = false) {
  await page.getByLabel('ED workbook file', { exact: true }).setInputFiles({
    name: 'review.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)),
  });
  if (replace) await page.getByRole('dialog').getByRole('button', { name: 'Replace', exact: true }).click();
  await nav(page, 'Data & amendments');
  await expect(reviewer(page)).toHaveValue(String(value(doc, 'Summary Sheet', 'C28')));
  await saved(page);
}
async function restoreVersion(page, version) {
  await version.getByRole('button', { name: 'Restore this version', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Restore version', exact: true }).click();
}

test('independent reviews retain latest edits, restore protected versions and delete only the selected review', async ({}, info) => {
  const profile = info.outputPath('profile');
  let { app, page } = await launch(profile);
  try {
    const alpha = review('Alpha Hospital', 'Jan', 'Alpha baseline');
    const beta = review('Beta Hospital', 'Feb', 'Beta reviewer');
    await importReview(page, alpha);
    await nav(page, 'Saved reviews');
    await page.getByRole('textbox', { name: 'Restore point name (optional)', exact: true }).fill('Verified baseline');
    await page.getByRole('button', { name: 'Save restore point', exact: true }).click();
    await expect(page.getByText('Dated restore point saved.', { exact: true })).toBeVisible();
    await card(page, 'Alpha Hospital').getByRole('button', { name: 'Open review', exact: true }).click();
    await reviewer(page).fill('Alpha amended');

    // Switch immediately rather than waiting for debounce: the old work must be
    // committed before the new project becomes active.
    await importReview(page, beta, true);
    await nav(page, 'Saved reviews');
    await expect(page.locator('article.library-review')).toHaveCount(2);
    await card(page, 'Alpha Hospital').getByRole('button', { name: 'Open review', exact: true }).click();
    await expect(reviewer(page)).toHaveValue('Alpha amended');
    await nav(page, 'Saved reviews');
    await card(page, 'Alpha Hospital').getByRole('button', { name: 'Saved versions', exact: true }).click();
    await restoreVersion(page, card(page, 'Alpha Hospital').locator('.library-version').filter({ hasText: 'Verified baseline' }));
    await expect(reviewer(page)).toHaveValue('Alpha baseline');
    await saved(page);

    await nav(page, 'Saved reviews');
    await card(page, 'Alpha Hospital').getByRole('button', { name: 'Saved versions', exact: true }).click();
    const recovery = card(page, 'Alpha Hospital').locator('.library-version').filter({ hasText: 'Before restoration' });
    await expect(recovery).toHaveCount(1);
    await restoreVersion(page, recovery);
    await expect(reviewer(page)).toHaveValue('Alpha amended');

    await nav(page, 'Saved reviews');
    await card(page, 'Beta Hospital').getByRole('button', { name: 'Delete review', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(card(page, 'Beta Hospital')).toHaveCount(1);
    await card(page, 'Beta Hospital').getByRole('button', { name: 'Delete review', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete review', exact: true }).click();
    await expect(card(page, 'Beta Hospital')).toHaveCount(0);
    await expect(card(page, 'Alpha Hospital')).toHaveCount(1);
    await card(page, 'Alpha Hospital').getByRole('button', { name: 'Open review', exact: true }).click();
    await expect(reviewer(page)).toHaveValue('Alpha amended');
    await saved(page);
    await app.close();
    ({ app, page } = await launch(profile));
    await nav(page, 'Data & amendments');
    await expect(reviewer(page)).toHaveValue('Alpha amended');
    await nav(page, 'Audit report');
    await app.evaluate(({ session }) => {
      session.defaultSession.once('will-download', (_event, item) => { globalThis.actualBackupName = item.getFilename(); });
    });
    const backup = info.outputPath('dated-review.json');
    await downloadTo(app, backup, () => page.getByRole('button', { name: /JSON audit backup/ }).click());
    expect(await app.evaluate(() => globalThis.actualBackupName)).toMatch(/^ED-Audit-Workspace-\d{4}-.*\.json$/);
    const restored = validateBackup(JSON.parse(await readFile(backup, 'utf8')));
    expect(restored.version).toBe(1);
    expect(value(restored, 'Summary Sheet', 'C28')).toBe('Alpha amended');
  } finally { await app.close(); }
});

test('legacy localStorage migrates once and intentionally closing a review does not resurrect the legacy copy', async ({}, info) => {
  const { app, page } = await launch(info.outputPath('profile'));
  try {
    const original = JSON.stringify(review('Legacy Hospital', 'Sep', 'Legacy Reviewer'));
    await page.evaluate(async raw => {
      localStorage.setItem('miyar-ed-workspace-v1', raw);
      await new Promise((resolve, reject) => {
        const deletion = indexedDB.deleteDatabase('miyar-ed-reviews-v1');
        deletion.onsuccess = resolve;
        deletion.onerror = () => reject(deletion.error);
        deletion.onblocked = () => reject(new Error('Legacy migration setup was blocked'));
      });
    }, original);
    await page.reload();
    await page.locator('aside nav').waitFor({ state: 'attached' });
    await nav(page, 'Data & amendments');
    await expect(reviewer(page)).toHaveValue('Legacy Reviewer');
    await reviewer(page).fill('Legacy Edited');
    await saved(page);
    expect(await page.evaluate(() => localStorage.getItem('miyar-ed-workspace-v1'))).toBe(original);
    await page.reload();
    await nav(page, 'Data & amendments');
    await expect(reviewer(page)).toHaveValue('Legacy Edited');
    await nav(page, 'Saved reviews');
    await expect(page.locator('article.library-review')).toHaveCount(1);
    await card(page, 'Legacy Hospital').getByRole('button', { name: 'Saved versions', exact: true }).click();
    await expect(card(page, 'Legacy Hospital').locator('.library-version').filter({ hasText: 'Migrated legacy save' })).toHaveCount(1);
    await page.getByRole('button', { name: 'Close review', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Explore a synthetic example', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Explore a synthetic example', exact: true })).toBeVisible();
    await nav(page, 'Saved reviews');
    await expect(page.locator('article.library-review')).toHaveCount(1);
    await card(page, 'Legacy Hospital').getByRole('button', { name: 'Open review', exact: true }).click();
    await expect(reviewer(page)).toHaveValue('Legacy Edited');
  } finally { await app.close(); }
});
