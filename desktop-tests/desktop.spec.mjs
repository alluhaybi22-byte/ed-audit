import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { parseXlsx } from '../src/parser.mjs';
import { workbookFixture } from '../tests/xlsx-fixture.mjs';
import { launch, nav, saved, downloadTo } from './helpers.mjs';

test('offline desktop, isolated renderer, decimal autosave and restart', async ({}, info) => {
  const profile = info.outputPath('profile');
  let { app, page } = await launch(profile);
  try {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await app.context().setOffline(true);
    await page.getByRole('button', { name: 'Explore a synthetic example', exact: true }).click();
    await nav(page, 'Data & amendments');
    await page.getByRole('button', { name: 'Pain management', exact: true }).click();
    const field = page.getByRole('textbox', { name: 'Average or median waiting minutes G3', exact: true });
    await field.fill('');
    await field.pressSequentially('0.5', { delay: 20 });
    await expect(field).toHaveValue('0.5');
    await saved(page);
    expect(await page.evaluate(() => [typeof window.require, typeof window.process])).toEqual(['undefined', 'undefined']);
    expect(await page.evaluate(() => Object.keys(window.edAuditDesktop))).toEqual(['printReport']);
    expect(await page.evaluate(async () => {
      try { await window.edAuditDesktop.printReport('invalid'); return false; } catch { return true; }
    })).toBe(true);
    expect(await page.evaluate(async () => {
      try { await fetch('https://example.com/'); return false; } catch { return true; }
    })).toBe(true);
    expect(await app.evaluate(({ BrowserWindow }) => {
      const options = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
      return { node: options.nodeIntegration, isolation: options.contextIsolation, sandbox: options.sandbox };
    })).toEqual({ node: false, isolation: true, sandbox: true });
    await app.close();
    ({ app, page } = await launch(profile));
    await nav(page, 'Data & amendments');
    await page.getByRole('button', { name: 'Pain management', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Average or median waiting minutes G3', exact: true })).toHaveValue('0.5');
    await page.getByRole('button', { name: 'العربية', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    expect(errors).toEqual([]);
  } finally { await app.close(); }
});

test('partial import and backup restore retain missing-sheet evidence and reject malformed JSON', async ({}, info) => {
  const { app, page } = await launch(info.outputPath('profile'));
  try {
    const input = page.getByLabel('ED workbook file', { exact: true });
    await input.setInputFiles({ name: 'partial.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(await workbookFixture({ partial: true })) });
    await nav(page, 'Data & amendments');
    await page.getByRole('textbox', { name: 'Cluster reviewer C28', exact: true }).fill('Partial Reviewer');
    await saved(page);
    await nav(page, 'Audit report');
    const backupPath = info.outputPath('backup.json');
    await downloadTo(app, backupPath, () => page.getByRole('button', { name: /JSON audit backup/ }).click());
    const backup = JSON.parse(await readFile(backupPath, 'utf8'));
    expect(Object.keys(backup.sheets)).toHaveLength(2);
    expect(backup.edits['Summary Sheet!C28']).toBe('Partial Reviewer');
    await input.setInputFiles(backupPath);
    await page.getByRole('dialog').getByRole('button', { name: 'Replace', exact: true }).click();
    await nav(page, 'Data & amendments');
    await expect(page.getByRole('textbox', { name: 'Cluster reviewer C28', exact: true })).toHaveValue('Partial Reviewer');
    const bad = { ...backup, sheets: { ...backup.sheets, extra: { cells: null } } };
    await input.setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad)) });
    await expect(page.getByRole('alert').filter({ hasText: 'invalid or incompatible' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Cluster reviewer C28', exact: true })).toHaveValue('Partial Reviewer');
    await saved(page);
  } finally { await app.close(); }
});

test('amended XLSX, CSV and native PDF outputs contain the audited data', async ({}, info) => {
  const { app, page } = await launch(info.outputPath('profile'));
  try {
    const source = Buffer.from(await workbookFixture());
    await page.getByLabel('ED workbook file', { exact: true }).setInputFiles({ name: 'source.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: source });
    await nav(page, 'Data & amendments');
    await page.getByRole('textbox', { name: 'Cluster reviewer C28', exact: true }).fill('Desktop Reviewer');
    await page.getByRole('button', { name: 'Pain management', exact: true }).click();
    await page.getByRole('textbox', { name: 'Average or median waiting minutes G3', exact: true }).fill('0.5');
    await nav(page, 'Audit report');
    const amended = info.outputPath('amended.xlsx');
    await downloadTo(app, amended, () => page.getByLabel('Original workbook for Excel export', { exact: true }).setInputFiles({ name: 'source.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: source }));
    const parsed = await parseXlsx(await readFile(amended), 'amended.xlsx');
    expect(parsed.sheets.DtoPK.cells.G3.v).toBe(0.5);
    expect(parsed.sheets['Summary Sheet'].cells.C28.v).toBe('Desktop Reviewer');
    const csv = info.outputPath('report.csv');
    await downloadTo(app, csv, () => page.getByRole('button', { name: 'Export report CSV', exact: true }).click());
    expect(await readFile(csv, 'utf8')).toContain('ED Audit');
    const pdf = info.outputPath('report.pdf');
    await app.evaluate(({ dialog }, target) => {
      dialog.showMessageBox = async () => ({ response: 0 });
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
    }, pdf);
    expect(await page.evaluate(() => window.edAuditDesktop.printReport('en'))).toEqual({ status: 'saved' });
    expect((await readFile(pdf)).subarray(0, 5).toString()).toBe('%PDF-');
    expect((await readFile(pdf)).length).toBeGreaterThan(10000);
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 2 }); });
    expect(await page.evaluate(() => window.edAuditDesktop.printReport('en'))).toEqual({ status: 'cancelled' });
    await saved(page);
  } finally { await app.close(); }
});

test('failed autosave warns on close, keeps work and permits a recovery backup', async ({}, info) => {
  const { app, page } = await launch(info.outputPath('profile'));
  try {
    await page.getByRole('button', { name: 'Explore a synthetic example', exact: true }).click();
    await saved(page);
    await page.evaluate(() => {
      window.originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key === 'miyar-ed-workspace-v1') throw new DOMException('Full', 'QuotaExceededError');
        return window.originalSetItem.call(this, key, value);
      };
    });
    await nav(page, 'Data & amendments');
    await page.getByRole('textbox', { name: 'Cluster reviewer C28', exact: true }).fill('Recovery Reviewer');
    await expect(page.getByRole('alert').filter({ hasText: 'Autosave failed' })).toBeVisible();
    await app.evaluate(({ dialog, BrowserWindow }) => {
      globalThis.closeWarnings = 0;
      dialog.showMessageBoxSync = () => { globalThis.closeWarnings++; return 0; };
      BrowserWindow.getAllWindows()[0].close();
    });
    await expect.poll(() => app.evaluate(() => globalThis.closeWarnings)).toBe(1);
    await expect(page.getByRole('textbox', { name: 'Cluster reviewer C28', exact: true })).toHaveValue('Recovery Reviewer');
    await nav(page, 'Audit report');
    const backup = info.outputPath('recovery.json');
    await downloadTo(app, backup, () => page.getByRole('button', { name: /JSON audit backup/ }).click());
    expect(JSON.parse(await readFile(backup, 'utf8')).edits['Summary Sheet!C28']).toBe('Recovery Reviewer');
    await page.evaluate(() => { Storage.prototype.setItem = window.originalSetItem; });
    await page.getByRole('button', { name: 'Save on device', exact: true }).click();
    await saved(page);
  } finally { await app.close(); }
});
