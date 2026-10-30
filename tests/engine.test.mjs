import test from 'node:test';
import assert from 'node:assert/strict';
import { audit } from '../src/engine.mjs';
import { exampleDocument, blankDocument, amend, value } from '../src/model.mjs';
import { TEMPLATE } from '../src/template.mjs';
import { canonicalFormula } from '../src/formula.mjs';
import { possibleCorrections, applyCorrection, undoCorrection } from '../src/corrections.mjs';

function importedExample() {
  const doc = exampleDocument();
  doc.mode = 'import';
  for (const [sheet, formulas] of Object.entries(TEMPLATE.formulas))
    for (const [cell, f] of Object.entries(formulas))
      doc.sheets[sheet].cells[cell] = { ...doc.sheets[sheet].cells[cell], f };
  const result = audit(doc);
  for (const [sheet, totals] of [['ED_Statistics', result.totals], ['Treating_Times', result.treating]])
    for (const [col, v] of Object.entries(totals)) doc.sheets[sheet].cells[`${col}7`].v = v;
  for (const [index, cell] of ['H16', 'H17', 'H18', 'H19', 'H20', 'H21', 'H22', 'H23'].entries()) {
    const kpi = result.kpis[index];
    doc.sheets['Summary Sheet'].cells[cell].v = kpi.workbook === null ? null :
      kpi.workbook / (kpi.unit === 'min' ? 1440 : 100);
  }
  return doc;
}
const finding = (doc, id) => audit(doc).issues.find(issue => issue.id === id);

test('source total error remains distinct from stale cache after a dependent edit', () => {
  const doc = importedExample();
  doc.sheets.ED_Statistics.cells.I7.v = 123;
  const changed = amend(doc, 'ED_Statistics', 'I2', 601);
  assert.equal(finding(changed, 'totals:original:ED_Statistics:I')?.severity, 'error');
  assert.equal(finding(changed, 'totals:ED_Statistics:I')?.severity, 'warning');
  assert.equal(doc.sheets.ED_Statistics.cells.I7.v, 123);
  const reverted = amend(changed, 'ED_Statistics', 'I2', 600);
  assert.equal(finding(reverted, 'totals:ED_Statistics:I')?.severity, 'error');
  assert.equal(finding(reverted, 'totals:original:ED_Statistics:I'), undefined);
  for (const missingOrInvalid of [null, 'invalid total']) {
    doc.sheets.ED_Statistics.cells.I7.v = missingOrInvalid;
    assert.equal(finding(doc, 'totals:ED_Statistics:I')?.severity, 'warning');
    const amended = amend(doc, 'ED_Statistics', 'I2', 601);
    assert.equal(finding(amended, 'totals:original:ED_Statistics:I')?.severity, 'warning');
  }
});

test('unrelated pain amendment preserves existing total and summary discrepancies', () => {
  const doc = importedExample();
  doc.sheets.ED_Statistics.cells.I7.v = 123;
  doc.sheets['Summary Sheet'].cells.H16.v = 999;
  const after = amend(doc, 'DtoPK', 'G3', 1);
  for (const id of ['totals:ED_Statistics:I', 'cache:H16']) {
    assert(finding(doc, id));
    assert.deepEqual(finding(after, id), finding(doc, id));
  }
});

test('only dependent totals and caches become stale after an amendment', () => {
  const doc = importedExample();
  assert.equal(finding(doc, 'totals:ED_Statistics:I'), undefined);
  assert.equal(finding(doc, 'cache:H16'), undefined);
  const after = amend(doc, 'ED_Statistics', 'I2', 601);
  for (const id of ['totals:ED_Statistics:I', 'cache:H16']) {
    assert.equal(finding(after, id)?.severity, 'warning');
    assert.match(finding(after, id)?.title.en, /needs refresh/);
  }
  assert.equal(finding(after, 'totals:ED_Statistics:J'), undefined);
  assert.equal(finding(after, 'cache:H17'), undefined);
  const reverted = amend(after, 'ED_Statistics', 'I2', 600);
  assert.equal(finding(reverted, 'totals:ED_Statistics:I'), undefined);
  assert.equal(finding(reverted, 'cache:H16'), undefined);
});

test('numeric text conversion does not make an unchanged total stale', () => {
  const doc = importedExample();
  doc.sheets.ED_Statistics.cells.I2.v = '600';
  assert.equal(finding(amend(doc, 'ED_Statistics', 'I2', 600), 'totals:ED_Statistics:I'), undefined);
});

test('literal row month mismatch survives Summary edit and round-trip', () => {
  let doc = importedExample();
  doc.sheets.ED_Statistics.cells.A2 = { v: 'Aug', t: 's' };
  assert.equal(finding(doc, 'period:ED_Statistics:A2')?.severity, 'error');
  doc = amend(doc, 'Summary Sheet', 'C11', 'Oct');
  assert.equal(finding(doc, 'period:ED_Statistics:A2')?.severity, 'error');
  doc = amend(doc, 'Summary Sheet', 'C11', 'Sep');
  assert.equal(finding(doc, 'period:ED_Statistics:A2')?.severity, 'error');
});

test('known Summary-linked row metadata becomes stale without hiding preexisting errors', () => {
  const doc = importedExample();
  doc.sheets.ED_Statistics.cells.A2 = { v: 'Sep', t: 's', f: "'Summary Sheet'!$C$11" };
  assert.equal(finding(doc, 'period:ED_Statistics:A2'), undefined);
  const changed = amend(doc, 'Summary Sheet', 'C11', 'Oct');
  assert.match(finding(changed, 'period:ED_Statistics:A2')?.title.en, /needs refresh/);
  assert.equal(finding(amend(changed, 'Summary Sheet', 'C11', 'Sep'), 'period:ED_Statistics:A2'), undefined);
  doc.sheets.ED_Statistics.cells.A2.v = 'Aug';
  assert.equal(finding(amend(doc, 'Summary Sheet', 'C11', 'Oct'), 'period:ED_Statistics:A2')?.severity, 'error');
});

test('formula comparison preserves operators, literals and quoted sheet names', () => {
  assert.notEqual(canonicalFormula('IF(A1>=13,1,0)'), canonicalFormula('IF(A1>13,1,0)'));
  assert.notEqual(canonicalFormula('IF(A1="A = B",1,0)'), canonicalFormula('IF(A1="A B",1,0)'));
  assert.notEqual(canonicalFormula("'Sheet A'!A1"), canonicalFormula("'SheetA'!A1"));
  assert.notEqual(canonicalFormula('SUM(A1 B1)'), canonicalFormula('SUM(A1B1)'));
  assert.equal(canonicalFormula('=sum( $a$1 : $B$2 )'), canonicalFormula('SUM(A1:B2)'));
  const doc = importedExample();
  doc.sheets['Summary Sheet'].cells.F2.f = TEMPLATE.formulas['Summary Sheet'].F2.replace('>=13', '>13');
  assert(finding(doc, 'formula_changed:Summary Sheet!F2'));
});

test('manual mode cannot hide physically present changed formulas or definitions', () => {
  const doc = importedExample();
  doc.sheets['Summary Sheet'].cells.F2.f = 'IF(SUM(D8:D28)>13,1,0)';
  doc.sheets['ED KPIs Definitions'].cells.B4.v = 'Changed definition';
  doc.sheets['Summary Sheet'].cells.H16.v = 999;
  doc.sheets.ED_Statistics.cells.I7.v = 123;
  for (const mode of ['import', 'manual', 'demo']) {
    doc.mode = mode;
    for (const id of ['formula_changed:Summary Sheet!F2', 'definition_changed:B4', 'totals:ED_Statistics:I', 'cache:H16'])
      assert(finding(doc, id), `${id} must be checked in ${mode}`);
    assert.equal(audit(doc).definitionChanged, true);
  }
});

test('ordinary manual/demo documents do not require nonexistent workbook caches or formulas', () => {
  for (const doc of [blankDocument(), exampleDocument()]) {
    const result = audit(doc);
    assert.equal(result.definitionChanged, false);
    assert.equal(result.issues.some(issue => ['formula_changed', 'cache', 'totals', 'period'].includes(issue.rule)), false);
  }
});

test('facility type validates template options including legacy spelling', () => {
  const doc = exampleDocument();
  doc.sheets['Summary Sheet'].cells.C15.v = 'Banana';
  assert(finding(doc, 'metadata:facility-type'));
  for (const type of ['Medical City', 'General', 'Specilaized', 'Maternity', 'Pedia', 'other']) {
    doc.sheets['Summary Sheet'].cells.C15.v = type;
    assert.equal(finding(doc, 'metadata:facility-type'), undefined);
  }
});

test('formula total correction remains reversible and clears its own finding', () => {
  const doc = importedExample();
  doc.sheets.ED_Statistics.cells.I7.v = 123;
  const id = 'total:ED_Statistics!I7';
  assert(possibleCorrections(doc).some(item => item.id === id));
  const corrected = applyCorrection(doc, id);
  assert.equal(value(corrected, 'ED_Statistics', 'I7'), audit(doc).totals.I);
  assert.equal(finding(corrected, 'totals:ED_Statistics:I'), undefined);
  assert(finding(undoCorrection(corrected, id), 'totals:ED_Statistics:I'));
});

test('demo nonurgent correction applies and undoes without trusting modified source formula', () => {
  const doc = exampleDocument();
  const id = 'nonurgent:H19';
  assert(possibleCorrections(doc).some(item => item.id === id));
  const corrected = applyCorrection(doc, id);
  assert.equal(audit(corrected).kpis[3].corrected, true);
  assert.equal(audit(undoCorrection(corrected, id)).kpis[3].corrected, false);
  doc.sheets['Summary Sheet'].cells.H19 = { f: 'SUM(A1:A3)', v: 1 };
  assert.equal(possibleCorrections(doc).some(item => item.id === id), false);
});
