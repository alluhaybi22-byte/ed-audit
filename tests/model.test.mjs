import test from 'node:test';
import assert from 'node:assert/strict';
import {
  blankDocument, exampleDocument, validateBackup, amend, value,
} from '../src/model.mjs';
import { audit } from '../src/engine.mjs';
import { applyCorrection, undoCorrection, activeCorrections } from '../src/corrections.mjs';
import { parseFile } from '../src/parser.mjs';

const roundtrip = doc => validateBackup(JSON.parse(JSON.stringify(doc)));
const invalid = doc => assert.throws(() => validateBackup(doc), { message: 'backup' });

test('partial imports survive backup restore without fabricating missing sheets', async () => {
  const doc = blankDocument('import');
  for (const name of Object.keys(doc.sheets))
    if (!['Summary Sheet', 'ED_Statistics'].includes(name)) delete doc.sheets[name];
  const amended = amend(doc, 'Summary Sheet', 'C28', 'Partial Reviewer');
  const json = JSON.stringify(amended);
  const restored = await parseFile({ name: 'partial.json', size: json.length, text: async () => json });
  assert.deepEqual(Object.keys(restored.sheets), Object.keys(doc.sheets));
  assert.equal(value(restored, 'Summary Sheet', 'C28'), 'Partial Reviewer');
  assert.deepEqual(audit(restored).issues, audit(amended).issues);
  assert.equal(audit(restored).schemaValid, false);
  for (const name of ['Summary Sheet', 'ED_Statistics']) {
    const broken = structuredClone(doc);
    delete broken.sheets[name];
    invalid(broken);
  }
  doc.sheets.DtoPK = { cells: null };
  invalid(doc);
});

test('rejects extra worksheets through both backup and JSON file boundaries', async () => {
  for (const extra of [null, {}, { cells: null }, [], { cells: { A1: null } }]) {
    const doc = exampleDocument();
    doc.sheets.extra = extra;
    invalid(doc);
    const json = JSON.stringify(doc);
    await assert.rejects(parseFile({
      name: 'backup.json', size: Buffer.byteLength(json), text: async () => json,
    }), { message: 'backup' });
  }
});

test('rejects malformed cell maps, cell metadata and nonfinite values', () => {
  for (const replacement of [[], null, { cells: [] }, { cells: { A1: [] } }]) {
    const doc = exampleDocument();
    doc.sheets.ED_Statistics = replacement;
    invalid(doc);
  }
  for (const cell of [
    { v: {} }, { v: Infinity }, { v: 1, f: [] },
    { v: 1, t: {} }, { v: 1, z: {} },
  ]) {
    const doc = exampleDocument();
    doc.sheets.ED_Statistics.cells.H2 = cell;
    invalid(doc);
  }
  const doc = JSON.parse(JSON.stringify(exampleDocument()).replace('"v":100,', '"v":1e400,'));
  invalid(doc);
});

test('rejects unsafe log metadata rather than retaining or dropping it', () => {
  for (const field of [
    { source: {} }, { reason: { ar: {}, en: 'text' } },
    { reason: [] }, { correctionId: {} }, { beforeValue: {} },
    { afterValue: Infinity }, { kind: [] }, { operation: {} },
  ]) {
    const doc = amend(exampleDocument(), 'Summary Sheet', 'C28', 'Reviewer');
    Object.assign(doc.log[0], field);
    invalid(doc);
  }
});

test('rejects malformed edits, reviews and additional-data metadata', () => {
  for (const changes of [
    { edits: [] }, { edits: { 'ED_Statistics!H2': Infinity } },
    { edits: { 'unknown!H2': 1 } }, { formulaEdits: [] },
    { formulaEdits: { 'Summary Sheet!H19': 'arbitrary()' } },
    { log: {} }, { reviews: [] }, { reviews: { x: { note: {}, status: 'open' } } },
    { extraData: [{}] }, { extraData: {} }, { mode: {} },
    { sourceName: {} }, { importedAt: 'not-a-date' },
  ]) invalid({ ...exampleDocument(), ...changes });
});

test('restores native manual, demo and imported backups and optional legacy fields', () => {
  for (const doc of [blankDocument(), exampleDocument(), blankDocument('import')]) {
    delete doc.formulaEdits;
    const clean = roundtrip(doc);
    assert.equal(clean.mode, doc.mode);
    assert.deepEqual({ ...clean.formulaEdits }, {});
    assert.doesNotThrow(() => audit(clean));
  }
});

test('retains safe cell formats, booleans, dates and arbitrary supported addresses', () => {
  const doc = exampleDocument();
  const cell = { v: true, t: 'b', f: 'TRUE()', z: 'builtin:0' };
  doc.sheets.ED_Statistics.cells.ZZZ999999 = cell;
  const clean = roundtrip(doc);
  assert.deepEqual(clean.sheets.ED_Statistics.cells.ZZZ999999, cell);
  assert.equal(clean.importedAt, doc.importedAt);
});

test('preserves manual history, review evidence keys and extra-data findings', () => {
  let doc = exampleDocument();
  doc.sheets['Summary Sheet'].cells.C17 = { v: true, t: 'b' };
  doc = amend(doc, 'Summary Sheet', 'C17', 'YES');
  doc.reviews = JSON.parse('{"__proto__":{"note":"Safe note","status":"reviewed"}}');
  doc.extraData = [{ ref: 'Other sheet', value: 'Non-empty additional worksheet' }];
  const clean = roundtrip(doc);
  assert.equal(clean.log[0].before, true);
  assert.equal(clean.log[0].after, 'YES');
  assert.equal(clean.reviews.__proto__.note, 'Safe note');
  assert.equal(Object.getPrototypeOf(clean.reviews), null);
  assert.equal(audit(clean).schemaValid, false);
});

test('rebuilds nested records and discards unconsumed extensions', () => {
  const doc = exampleDocument();
  doc.unknown = { source: {} };
  doc.sheets.ED_Statistics.cells.H2.unknown = {};
  const clean = validateBackup(doc);
  assert.equal(Object.hasOwn(clean, 'unknown'), false);
  assert.equal(Object.hasOwn(clean.sheets.ED_Statistics.cells.H2, 'unknown'), false);
  doc.sheets.ED_Statistics.cells.H2.v = 999;
  assert.equal(clean.sheets.ED_Statistics.cells.H2.v, 100);
});

test('numeric correction survives backup roundtrip and undoes to source text', () => {
  const doc = exampleDocument();
  doc.sheets.ED_Statistics.cells.H2 = { v: '100', t: 's' };
  const id = 'number:ED_Statistics!H2';
  const applied = roundtrip(applyCorrection(doc, id));
  assert.equal(value(applied, 'ED_Statistics', 'H2'), 100);
  assert(activeCorrections(applied).some(entry => entry.correctionId === id));
  const undone = roundtrip(undoCorrection(applied, id));
  assert.equal(value(undone, 'ED_Statistics', 'H2'), '100');
  assert.equal(activeCorrections(undone).length, 0);
});

test('rejects correction history that could write a boolean into the edits map on undo', () => {
  const doc = exampleDocument();
  doc.log = [{
    sheet: 'ED_Statistics', cell: 'H2', at: '2026-10-30T00:00:00.000Z',
    before: true, after: 100, correctionId: 'number:ED_Statistics!H2',
    kind: 'number', operation: 'apply',
  }];
  invalid(doc);
  delete doc.log[0].kind;
  invalid(doc);
});

test('formula correction survives backup roundtrip with reason and remains reversible', () => {
  const applied = roundtrip(applyCorrection(exampleDocument(), 'nonurgent:H19'));
  assert(applied.formulaEdits['Summary Sheet!H19']);
  assert.equal(activeCorrections(applied).length, 1);
  assert.equal(typeof applied.log[0].reason.ar, 'string');
  assert.equal(typeof applied.log[0].source, 'string');
  const undone = roundtrip(undoCorrection(applied, 'nonurgent:H19'));
  assert.equal(Object.hasOwn(undone.formulaEdits, 'Summary Sheet!H19'), false);
  assert.equal(activeCorrections(undone).length, 0);
});
