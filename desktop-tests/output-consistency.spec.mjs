import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { outputWorkbook } from '../tests/output-fixture.mjs';
import { parseXlsx } from '../src/parser.mjs';
import { amend, DERIVED_FORMULAS } from '../src/model.mjs';
import { audit } from '../src/engine.mjs';
import { applyCorrection, undoCorrection } from '../src/corrections.mjs';
import { TEMPLATE } from '../src/template.mjs';
import { launch, nav, saved, downloadTo } from './helpers.mjs';

const normalize = text => text.replace(/\s+/g, ' ').trim();
const escaped = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const formatted = value => value == null ? '—' : new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(value);

// Parse the actual downloaded CSV, including quoted newlines and escaped quotes.
function csvRows(text) {
  const rows = [], row = [];
  let field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) { row.push(field); field = ''; }
    else if (char === '\n' && !quoted) {
      row.push(field.replace(/\r$/, '')); rows.push([...row]); row.length = 0; field = '';
    } else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  if (rows.length) rows[0][0] = rows[0][0].replace(/^\uFEFF/, '');
  return rows;
}

async function pdfText(file) {
  const loading = getDocument({
    data: new Uint8Array(await readFile(file)), isEvalSupported: false,
    disableFontFace: true, useSystemFonts: true,
  });
  const pdf = await loading.promise;
  try {
    const pages = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      pages.push(content.items.map(item => item.str || '').join(' '));
    }
    return normalize(pages.join(' '));
  } finally { await loading.destroy(); }
}

test('screen, PDF, CSV and amended Excel agree before, after and undoing a correction', async ({}, info) => {
  test.setTimeout(150000);
  const { app, page } = await launch(info.outputPath('profile'));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    const source = Buffer.from(await outputWorkbook());
    let expected = amend(await parseXlsx(source, 'output-oracle.xlsx'), 'Summary Sheet', 'C28', 'Output Reviewer <&>');
    const originalNonurgent = audit(expected).kpis[3];
    // These are independently specified fixture results, not values copied from UI.
    expect(audit(expected).patients).toBe(1000);
    expect(audit(expected).kpis[0].value).toBe(20.6);
    expect(originalNonurgent.value).toBe(30);
    expect(originalNonurgent.workbook).toBeCloseTo(29, 8);
    await page.getByLabel('ED workbook file', { exact: true }).setInputFiles({
      name: 'output-oracle.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: source,
    });
    await nav(page, 'Data & amendments');
    await page.getByRole('textbox', { name: 'Cluster reviewer C28', exact: true }).fill('Output Reviewer <&>');

    for (const phase of ['original', 'applied', 'undone']) {
      if (phase !== 'original') {
        await nav(page, 'Possible corrections');
        if (phase === 'applied') {
          await page.locator('.correction-card').filter({ hasText: 'Correct the non-urgent formula' })
            .getByRole('button', { name: 'Apply correction', exact: true }).click();
          expected = applyCorrection(expected, 'nonurgent:H19');
        } else {
          await page.locator('.applied-correction').filter({ hasText: 'Summary Sheet!H19' })
            .getByRole('button', { name: 'Undo correction', exact: true }).click();
          expected = undoCorrection(expected, 'nonurgent:H19');
        }
      }
      await nav(page, 'Audit report');
      const result = audit(expected);
      const report = page.locator('main .report-content');
      await expect(report).toContainText('Output Reviewer <&>');
      await expect(report).toContainText('DEMO-GEN-1 - Example Hospital');
      expect(normalize(await report.textContent())).toBe(normalize(await page.locator('.print-document .report-content').textContent()));
      const kpiRows = report.locator('table').first().locator('tbody tr');
      await expect(kpiRows).toHaveCount(8);
      for (const [index, kpi] of result.kpis.entries()) {
        const cells = kpiRows.nth(index).locator('td');
        await expect(cells.nth(0)).toHaveText(kpi.title.en);
        await expect(cells.nth(1)).toHaveText(`${formatted(kpi.value)} ${kpi.unit}`);
        await expect(cells.nth(2)).toHaveText(`${formatted(kpi.workbook)} ${kpi.unit}`);
      }

      const csv = info.outputPath(`${phase}.csv`);
      await downloadTo(app, csv, () => page.getByRole('button', { name: 'Export report CSV', exact: true }).click());
      const rows = csvRows(await readFile(csv, 'utf8'));
      expect(rows.find(row => row[0] === 'Reporting month')).toEqual(['Reporting month', 'Sep', 'Year', '2026', 'Facility', 'DEMO-GEN-1 - Example Hospital']);
      expect(rows.find(row => row[0] === 'Errors')).toEqual(['Errors', String(result.errors), 'Warnings', String(result.warnings), 'Original source preserved', 'YES']);
      const findingStart = rows.findIndex(row => row[0] === 'Finding ID');
      for (const [index, issue] of result.issues.entries()) {
        expect(rows[findingStart + index + 1].slice(0, 7)).toEqual([
          issue.id, issue.severity, issue.title.ar, issue.title.en,
          issue.refs.join(' | '), String(issue.observed ?? ''), String(issue.expected ?? ''),
        ]);
      }
      expect(rows[findingStart + result.issues.length + 1]).toEqual(['']);
      const kpiStart = rows.findIndex(row => row[0] === 'KPI');
      for (const [index, kpi] of result.kpis.entries()) {
        const row = rows[kpiStart + index + 1];
        expect(row[0]).toBe(String(kpi.id));
        expect(row[2]).toBe(kpi.title.en);
        expect(row[3]).toBe(kpi.value == null ? '' : String(kpi.value));
        expect(row[4]).toBe(kpi.workbook == null ? '' : String(kpi.workbook));
      }
      expect(rows.some(row => row[3] === 'Non-urgent formula subtracts cases absent from definition')).toBe(phase !== 'applied');

      const pdf = info.outputPath(`${phase}.pdf`);
      await app.evaluate(({ dialog }, target) => {
        dialog.showMessageBox = async () => ({ response: 0 });
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
      }, pdf);
      expect(await page.evaluate(() => window.edAuditDesktop.printReport('en'))).toEqual({ status: 'saved' });
      const text = await pdfText(pdf);
      expect(text).toContain('Output Reviewer <&>');
      expect(text).toContain('DEMO-GEN-1 - Example Hospital');
      expect(text).toMatch(/Sep\s*\/\s*2026/);
      expect(text).toContain(`Total patients 1,000 Errors ${result.errors} Review findings ${result.warnings} Reviewed ${result.reviewed}`);
      for (const [index, issue] of result.issues.entries()) {
        const start = text.indexOf(`${index + 1}. ${issue.title.en}`);
        expect(start).toBeGreaterThan(-1);
        const next = result.issues[index + 1];
        const end = next ? text.indexOf(`${index + 2}. ${next.title.en}`, start + 1) : text.indexOf('Performance indicators', start);
        const finding = text.slice(start, end);
        expect(finding).toContain(normalize(issue.details.en));
        expect(finding).toMatch(new RegExp(`Observed:\\s*${escaped(String(issue.observed || '—'))}\\s*·\\s*Expected:\\s*${escaped(String(issue.expected || '—'))}`));
        for (const ref of issue.refs) expect(finding).toContain(ref);
      }
      for (const kpi of result.kpis) {
        const index = text.indexOf(kpi.title.en, text.indexOf('Performance indicators'));
        expect(index).toBeGreaterThan(-1);
        const rowText = text.slice(index + kpi.title.en.length);
        expect(rowText).toMatch(new RegExp(`^\\s*${escaped(formatted(kpi.value))}\\s*${kpi.unit}\\s+${escaped(formatted(kpi.workbook))}\\s*${kpi.unit}`));
      }
      expect(text.includes('Non-urgent formula subtracts cases absent from definition')).toBe(phase !== 'applied');
      if (phase === 'applied') expect(text).toContain('The original template result remains for comparison.');
      if (phase === 'undone') expect(text).toContain('Undo');

      const excel = info.outputPath(`${phase}.xlsx`);
      await downloadTo(app, excel, () => page.getByLabel('Original workbook for Excel export', { exact: true }).setInputFiles({
        name: 'output-oracle.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: source,
      }));
      const exported = await parseXlsx(await readFile(excel), 'exported.xlsx');
      expect(exported.sheets['Summary Sheet'].cells.C28.v).toBe('Output Reviewer <&>');
      expect(exported.sheets['Summary Sheet'].cells.H19.f).toBe(phase === 'applied'
        ? DERIVED_FORMULAS['Summary Sheet!H19'] : TEMPLATE.formulas['Summary Sheet'].H19);
      expect(audit(exported).patients).toBe(1000);
      expect(audit(exported).kpis[0].value).toBe(20.6);
      expect(audit(exported).kpis[3].value).toBe(30);
    }
    expect(errors).toEqual([]);
    await saved(page);
  } finally {
    await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; }).catch(() => {});
    await app.close();
  }
});
