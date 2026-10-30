import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { exportAmendedXlsx } from '../src/export-xlsx.mjs';
import { parseXlsx, XLSX_LIMITS } from '../src/parser.mjs';
import { amend } from '../src/model.mjs';
import { applyCorrection } from '../src/corrections.mjs';
import { workbookFixture } from './xlsx-fixture.mjs';

for (const prefixed of [false, true]) test(`exports amendments, safe text and shared formulas (prefix=${prefixed})`, async () => {
  const bytes = await workbookFixture({ prefixed });
  const original = await parseXlsx(bytes, 'source.xlsx');
  let doc = amend(original, 'DtoPK', 'G3', 0.5);
  doc = amend(doc, 'Summary Sheet', 'C28', '=HYPERLINK("https://example.invalid") <&>');
  doc = amend(doc, 'Summary Sheet', 'C8', null);
  doc = applyCorrection(doc, 'total:ED_Statistics!I7');
  const output = await exportAmendedXlsx(bytes, doc);
  const parsed = await parseXlsx(output, 'amended.xlsx');
  assert.equal(parsed.sheets.DtoPK.cells.G3.v, 0.5);
  assert.equal(parsed.sheets.DtoPK.cells.G3.z, 'builtin:2');
  assert.equal(parsed.sheets['Summary Sheet'].cells.C28.v, doc.edits['Summary Sheet!C28']);
  assert.equal(parsed.sheets['Summary Sheet'].cells.C28.f, undefined);
  assert.equal(parsed.sheets['Summary Sheet'].cells.C8, undefined);
  assert.equal(parsed.sheets.ED_Statistics.cells.I7.f, 'SUM(I2:I6)');
  assert.equal(parsed.sheets.ED_Statistics.cells.J7.f, 'SUM(J2:J6)');
  assert.equal(parsed.sheets.ED_Statistics.cells.I7.v, null);
  assert.equal(parsed.sheets.ED_Statistics.cells.J7.v, null);
  const zip = await JSZip.loadAsync(output);
  assert.equal(zip.file('xl/calcChain.xml'), null);
  assert.match(await zip.file('xl/styles.xml').async('string'), /FFFFE699/);
  assert.match(await zip.file('xl/workbook.xml').async('string'), /fullCalcOnLoad="1"/);
  const sourceZip = await JSZip.loadAsync(bytes);
  assert.equal(await zip.file('docProps/retained.xml').async('string'), await sourceZip.file('docProps/retained.xml').async('string'));
  assert.match(await zip.file('xl/worksheets/sheet7.xml').async('string'), /Retained extra sheet/);
  assert.match(await zip.file('xl/worksheets/sheet5.xml').async('string'), /rightToLeft="1"/);
  assert.equal(original.sheets.DtoPK.cells.G3.v, 0);
});

test('partial workbooks and packages without styles support amendments', async () => {
  const bytes = await workbookFixture({ partial: true, noStyles: true });
  const doc = amend(await parseXlsx(bytes, 'partial.xlsx'), 'Summary Sheet', 'C28', 'Partial Reviewer');
  const output = await exportAmendedXlsx(bytes, doc);
  const parsed = await parseXlsx(output, 'amended.xlsx');
  assert.equal(Object.keys(parsed.sheets).length, 2);
  assert.equal(parsed.sheets['Summary Sheet'].cells.C28.v, 'Partial Reviewer');
  const missing = amend(doc, 'DtoPK', 'G3', 1);
  await assert.rejects(exportAmendedXlsx(bytes, missing), { message: 'missing_sheet' });
});

test('rejects mismatching original, empty changes and array-formula overlap', async () => {
  const bytes = await workbookFixture();
  const doc = await parseXlsx(bytes, 'source.xlsx');
  await assert.rejects(exportAmendedXlsx(bytes, doc), { message: 'no_changes' });
  const edited = amend(doc, 'DtoPK', 'G3', 1);
  edited.sheets.ED_Statistics.cells.H2.v++;
  await assert.rejects(exportAmendedXlsx(bytes, edited), { message: 'source_mismatch' });
  const grouped = await workbookFixture({ group: true });
  const groupDoc = amend(await parseXlsx(grouped, 'array.xlsx'), 'ED_Statistics', 'J7', 100);
  await assert.rejects(exportAmendedXlsx(grouped, groupDoc), { message: 'group_formula' });
});

test('export package metadata uses the same XML and expanded-size guards as import', async () => {
  const bytes = await workbookFixture();
  const doc = amend(await parseXlsx(bytes, 'source.xlsx'), 'DtoPK', 'G3', 1);
  const zip = await JSZip.loadAsync(bytes);
  zip.file('[Content_Types].xml', '<!DOCTYPE Types><Types/>');
  await assert.rejects(exportAmendedXlsx(await zip.generateAsync({ type: 'uint8array' }), doc), { message: 'xml' });
  zip.file('[Content_Types].xml', ' '.repeat(XLSX_LIMITS.entryBytes + 1));
  await assert.rejects(exportAmendedXlsx(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }), doc), { message: 'size' });
});
