import test from 'node:test';
import assert from 'node:assert/strict';
import { outputWorkbook } from './output-fixture.mjs';
import { parseXlsx } from '../src/parser.mjs';
import { audit } from '../src/engine.mjs';
import { amend } from '../src/model.mjs';
import { applyCorrection, undoCorrection } from '../src/corrections.mjs';

// Arithmetic oracle for software regression only. The four-hour exclusion scope
// and mortality cohort still need an externally approved clinical reference.
test('synthetic output oracle preserves independent arithmetic and original comparison through correction and undo', async () => {
  let doc = amend(await parseXlsx(await outputWorkbook(), 'output-oracle.xlsx'),
    'Summary Sheet', 'C28', 'Output Reviewer <&>');
  const original = JSON.stringify(doc.sheets);
  const oracle = [
    [20600 / 1000, 20600 / 1000],
    [40400 / 1000, 40400 / 1000],
    [57600 / 1000, 57600 / 1000],
    [300 / 1000 * 100, (300 - 10) / 1000 * 100],
    [null, 945 / 1000 * 100],
    [(7 + 3) / 1000 * 100, (7 + 3) / 1000 * 100],
    [2 / 740 * 100, 2 / 1000 * 100],
    [0.5, 0.5],
  ];
  for (const phase of ['original', 'applied', 'undone']) {
    if (phase === 'applied') doc = applyCorrection(doc, 'nonurgent:H19');
    if (phase === 'undone') doc = undoCorrection(doc, 'nonurgent:H19');
    const result = audit(doc);
    assert.equal(result.schemaValid, true);
    assert.equal(result.errors, 0);
    assert.equal(result.patients, 1000);
    for (const [index, pair] of oracle.entries()) {
      for (const [offset, key] of ['value', 'workbook'].entries()) {
        const expected = pair[offset], actual = result.kpis[index][key];
        if (expected === null) assert.equal(actual, null);
        else assert.ok(Math.abs(expected - actual) < 1e-10, `KPI ${index + 1} ${key}: ${actual} != ${expected}`);
      }
    }
    assert.equal(result.kpis[3].corrected, phase === 'applied');
    assert.equal(result.issues.some(issue => issue.id === 'nonurgent:formula'), phase !== 'applied');
    assert.equal(JSON.stringify(doc.sheets), original, 'source worksheets must remain unchanged');
  }
});
