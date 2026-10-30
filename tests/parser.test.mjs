import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { parseFile, parseXlsx, shiftFormula, XLSX_LIMITS } from '../src/parser.mjs';
import { SHEETS, exampleDocument } from '../src/model.mjs';

const escape = value => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function workbook(names = SHEETS, paddingBytes = 0) {
  const doc = exampleDocument();
  const zip = new JSZip();
  zip.file('xl/workbook.xml', `<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((name, i) => `<sheet name="${escape(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<Relationships>${names.map((_, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`);
  for (const [i, name] of names.entries()) {
    const rows = new Map();
    for (const [addr, cell] of Object.entries(doc.sheets[name]?.cells || {})) {
      const row = Number(addr.match(/\d+$/)[0]);
      const content = typeof cell.v === 'string'
        ? `<c r="${addr}" t="inlineStr"><is><t>${escape(cell.v)}</t></is></c>`
        : `<c r="${addr}">${cell.v == null ? '' : `<v>${cell.v}</v>`}</c>`;
      rows.set(row, (rows.get(row) || '') + content);
    }
    const padding = paddingBytes ? `<!--${'x'.repeat(paddingBytes)}-->` : '';
    zip.file(`xl/worksheets/sheet${i + 1}.xml`, `<worksheet>${padding}<sheetData>${[...rows].sort((a, b) => a[0] - b[0]).map(([row, content]) => `<row r="${row}">${content}</row>`).join('')}</sheetData></worksheet>`);
  }
  return zip;
}

const bytes = zip => zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });

test('reads the six supported sheets and preserves numeric and escaped text values', async () => {
  const parsed = await parseXlsx(await bytes(workbook()), 'synthetic.xlsx');
  assert.deepEqual(Object.keys(parsed.sheets), SHEETS);
  assert.equal(parsed.mode, 'import');
  assert.equal(parsed.sourceName, 'synthetic.xlsx');
  assert.equal(parsed.sheets.ED_Statistics.cells.H2.v, 100);
  assert.equal(parsed.sheets['Summary Sheet'].cells.C14.v, 'DEMO-GEN-1 - Example Hospital');
});

test('retains shared strings and translates shared formulas without executing them', async () => {
  const zip = workbook();
  zip.file('xl/sharedStrings.xml', '<sst><si><r><t>&lt;img src=x&gt;</t></r><r><t> literal</t></r></si></sst>');
  zip.file('xl/worksheets/sheet2.xml', '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="7"><c r="I7"><f t="shared" si="0">SUM(I2:I6)</f><v>20600</v></c><c r="J7"><f t="shared" si="0"/><v>40400</v></c></row></sheetData></worksheet>');
  const parsed = await parseXlsx(await bytes(zip), 'shared.xlsx');
  assert.equal(parsed.sheets.ED_Statistics.cells.A1.v, '<img src=x> literal');
  assert.equal(parsed.sheets.ED_Statistics.cells.I7.f, 'SUM(I2:I6)');
  assert.equal(parsed.sheets.ED_Statistics.cells.J7.f, 'SUM(J2:J6)');
  assert.equal(shiftFormula('SUM($A1:B$2)+"A1"', 'I7', 'J8'), 'SUM($A2:C$2)+"A1"');
});

test('keeps partial supported workbooks available for missing-sheet audit findings', async () => {
  const names = ['Summary Sheet', 'ED_Statistics'];
  const parsed = await parseXlsx(await bytes(workbook(names)), 'partial.xlsx');
  assert.deepEqual(Object.keys(parsed.sheets), names);
});

test('rejects duplicate worksheet names instead of silently overwriting one', async () => {
  await assert.rejects(parseXlsx(await bytes(workbook(['Summary Sheet', 'ED_Statistics', 'ED_Statistics'])), 'duplicate.xlsx'), { message: 'xlsx' });
});

test('rejects XML entities and external worksheet relationships', async () => {
  const zip = workbook();
  const original = await zip.file('xl/workbook.xml').async('string');
  zip.file('xl/workbook.xml', '<!DOCTYPE workbook [<!ENTITY value "external">]>' + original);
  await assert.rejects(parseXlsx(await bytes(zip), 'entities.xlsx'), { message: 'xml' });
  zip.file('xl/workbook.xml', original);
  zip.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="https://example.invalid/sheet.xml" TargetMode="External"/></Relationships>');
  await assert.rejects(parseXlsx(await bytes(zip), 'external.xlsx'), { message: 'xlsx' });
});

test('accepts a cumulative expanded size below the workbook budget', async () => {
  const zip = workbook(SHEETS.slice(0, 3), 8 * 1024 * 1024);
  const compressed = await bytes(zip);
  assert(compressed.byteLength < XLSX_LIMITS.fileBytes);
  const parsed = await parseXlsx(compressed, 'under-budget.xlsx');
  assert.equal(Object.keys(parsed.sheets).length, 3);
});

test('rejects cumulative expansion above the budget although every entry is below its own limit', async () => {
  const padding = 8 * 1024 * 1024;
  assert(padding + 10000 < XLSX_LIMITS.entryBytes);
  assert(padding * 4 > XLSX_LIMITS.expandedBytes);
  const compressed = await bytes(workbook(SHEETS.slice(0, 4), padding));
  assert(compressed.byteLength < XLSX_LIMITS.fileBytes);
  await assert.rejects(parseXlsx(compressed, 'over-budget.xlsx'), { message: 'size' });
});

test('retains the individual styles limit and compressed-file guard', async () => {
  const zip = workbook();
  zip.file('xl/styles.xml', `<styleSheet><!--${'x'.repeat(XLSX_LIMITS.stylesBytes)}--></styleSheet>`);
  await assert.rejects(parseXlsx(await bytes(zip), 'large-styles.xlsx'), { message: 'size' });
  await assert.rejects(parseFile({ name: 'large.xlsx', size: XLSX_LIMITS.fileBytes + 1 }), { message: 'size' });
});
