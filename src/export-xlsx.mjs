import JSZip from 'jszip';
import xmljs from 'xml-js';
import { parseXlsx, readEntry, XLSX_LIMITS } from './parser.mjs';
import { validateBackup } from './model.mjs';

const list = x => x == null ? [] : Array.isArray(x) ? x : [x];
const key = (obj, name) => Object.keys(obj || {}).find(k => k.split(':').at(-1) === name) || name;
const get = (obj, name) => obj?.[key(obj, name)];
const read = text => {
  if (!text || /<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('xml');
  return xmljs.xml2js(text, { compact: true });
};
const write = object => xmljs.js2xml(object, { compact: true });
const prefix = (tree, name) => key(tree, name).replace(new RegExp(`${name}$`), '');
const qualify = (object, ns) => Array.isArray(object) ? object.map(x => qualify(x, ns)) :
  object && typeof object === 'object' ? Object.fromEntries(Object.entries(object).map(([k, v]) =>
    k.startsWith('_') ? [k, v] : [ns + k, qualify(v, ns)])) : object;
const col = address => [...address.match(/^[A-Z]+/)[0]]
  .reduce((v, c) => v * 26 + c.charCodeAt(0) - 64, 0);
const inside = (address, range) => {
  const [start, end = start] = range.replace(/\$/g, '').split(':');
  if (![start, end].every(a => /^[A-Z]+[1-9]\d*$/.test(a))) return true;
  const row = a => Number(a.match(/\d+$/)[0]);
  return col(address) >= col(start) && col(address) <= col(end) &&
    row(address) >= row(start) && row(address) <= row(end);
};
const stable = x => JSON.stringify(x, (_, value) => value && typeof value === 'object' && !Array.isArray(value)
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value);
const normalizePath = target => {
  const parts = (target.startsWith('/') ? target.slice(1) : `xl/${target}`).split('/');
  const output = [];
  for (const part of parts) if (part === '..') output.pop(); else if (part && part !== '.') output.push(part);
  return output.join('/');
};

// Patch a fresh copy of a workbook matching the audited source cells. The user retains the original
// file, including sheets, formatting and package parts the auditor does not edit.
export async function exportAmendedXlsx(bytes, input) {
  const doc = validateBackup(input);
  const source = await parseXlsx(bytes, doc.sourceName);
  if (stable(source.sheets) !== stable(doc.sheets) ||
      stable(source.extraData || []) !== stable(doc.extraData || []))
    throw new Error('source_mismatch');
  const zip = await JSZip.loadAsync(bytes);
  const budget = { remaining: XLSX_LIMITS.expandedBytes };
  const readXml = async (path, max) => read(await readEntry(zip, path, budget, max));
  const book = await readXml('xl/workbook.xml');
  const workbook = get(book, 'workbook');
  const relTree = await readXml('xl/_rels/workbook.xml.rels');
  const relationships = get(relTree, 'Relationships');
  const rels = list(get(relationships, 'Relationship'));
  const paths = Object.fromEntries(rels.filter(r => r._attributes.TargetMode !== 'External')
    .map(r => [r._attributes.Id, normalizePath(r._attributes.Target)]));
  const sheetPaths = Object.fromEntries(list(get(get(workbook, 'sheets'), 'sheet'))
    .map(s => [s._attributes.name, paths[s._attributes['r:id'] || s._attributes.id]]));
  const changes = new Map();
  for (const [ref, v] of Object.entries(doc.edits)) changes.set(ref, { v });
  for (const [ref, f] of Object.entries(doc.formulaEdits)) changes.set(ref, { f });
  if (!changes.size) throw new Error('no_changes');
  for (const ref of changes.keys()) {
    if (!sheetPaths[ref.slice(0, ref.lastIndexOf('!'))]) throw new Error('missing_sheet');
  }

  const styleRel = rels.find(r => r._attributes.Type?.endsWith('/styles'));
  const stylesPath = styleRel ? paths[styleRel._attributes.Id] : 'xl/styles.xml';
  const stylesFile = zip.file(stylesPath);
  const stylesTree = stylesFile ? await readXml(stylesPath, XLSX_LIMITS.stylesBytes) : read(
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font/></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>');
  const styles = get(stylesTree, 'styleSheet');
  const styleNs = prefix(stylesTree, 'styleSheet');
  const fills = get(styles, 'fills') || (styles[`${styleNs}fills`] = {});
  const fillList = list(get(fills, 'fill'));
  const fillId = fillList.length;
  fillList.push(qualify({ patternFill: { _attributes: { patternType: 'solid' }, fgColor: { _attributes: { rgb: 'FFFFE699' } }, bgColor: { _attributes: { indexed: '64' } } } }, styleNs));
  fills[`${styleNs}fill`] = fillList;
  fills._attributes = { ...fills._attributes, count: fillList.length };
  const xfs = get(styles, 'cellXfs') || (styles[`${styleNs}cellXfs`] = {});
  const xfList = list(get(xfs, 'xf'));
  if (!xfList.length) xfList.push({ _attributes: { numFmtId: '0', fontId: '0', fillId: '0', borderId: '0' } });
  const highlights = new Map();
  const highlight = index => {
    if (!highlights.has(index)) {
      const xf = structuredClone(xfList[index] || xfList[0]);
      xf._attributes = { ...xf._attributes, fillId, applyFill: '1' };
      highlights.set(index, xfList.length);
      xfList.push(xf);
    }
    return highlights.get(index);
  };
  for (const [name, path] of Object.entries(sheetPaths)) {
    if (!path || !zip.file(path)) continue;
    const tree = await readXml(path);
    const sheet = get(tree, 'worksheet');
    const ns = prefix(tree, 'worksheet');
    const data = get(sheet, 'sheetData') || (sheet[`${ns}sheetData`] = {});
    const rows = list(get(data, 'row'));
    for (const row of rows) for (const cell of list(get(row, 'c'))) {
      const formula = get(cell, 'f');
      if (['array', 'dataTable'].includes(formula?._attributes?.t)) {
        const range = formula._attributes.ref || cell._attributes.r;
        for (const ref of changes.keys()) {
          const sep = ref.lastIndexOf('!');
          if (ref.slice(0, sep) === name && inside(ref.slice(sep + 1), range))
            throw new Error('group_formula');
        }
      }
      if (formula?._attributes?.t === 'shared' && source.sheets[name]?.cells[cell._attributes.r]?.f)
        cell[key(cell, 'f')] = { _text: source.sheets[name].cells[cell._attributes.r].f };
      if (get(cell, 'f')) delete cell[key(cell, 'v')];
    }
    for (const [ref, change] of changes) {
      const sep = ref.lastIndexOf('!');
      if (ref.slice(0, sep) !== name) continue;
      const addr = ref.slice(sep + 1), rowNumber = Number(addr.match(/\d+$/)[0]);
      let row = rows.find(r => Number(r._attributes?.r) === rowNumber);
      if (!row) { row = { _attributes: { r: rowNumber } }; rows.push(row); }
      const cells = list(get(row, 'c'));
      let cell = cells.find(c => c._attributes?.r === addr);
      if (!cell) { cell = { _attributes: { r: addr } }; cells.push(cell); }
      cell._attributes = { ...cell._attributes, s: highlight(Number(cell._attributes.s || 0)) };
      delete cell._attributes.t;
      for (const field of ['f', 'v', 'is']) delete cell[key(cell, field)];
      if (change.f) cell[`${ns}f`] = { _text: change.f };
      else if (typeof change.v === 'number') cell[`${ns}v`] = { _text: String(change.v) };
      else if (change.v != null) {
        cell._attributes.t = 'inlineStr';
        cell[`${ns}is`] = qualify({ t: { _attributes: { 'xml:space': 'preserve' }, _text: String(change.v) } }, ns);
      }
      cells.sort((a, b) => col(a._attributes.r) - col(b._attributes.r));
      row[`${ns}c`] = cells;
      delete row._attributes.spans;
    }
    rows.sort((a, b) => Number(a._attributes.r) - Number(b._attributes.r));
    data[`${ns}row`] = rows;
    // An omitted dimension is valid and lets readers derive the used range,
    // including a newly inserted amendment outside the original range.
    delete sheet[key(sheet, 'dimension')];
    zip.file(path, write(tree));
  }
  xfs[`${styleNs}xf`] = xfList;
  xfs._attributes = { ...xfs._attributes, count: xfList.length };
  zip.file(stylesPath, write(stylesTree));
  if (!styleRel) {
    let id = 1;
    while (rels.some(r => r._attributes.Id === `auditStyles${id}`)) id++;
    rels.push({ _attributes: { Id: `auditStyles${id}`, Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles', Target: 'styles.xml' } });
  }
  // Discard the obsolete calculation chain; Excel will rebuild all caches.
  const chainPaths = rels.filter(r => r._attributes.Type?.endsWith('/calcChain'))
    .map(r => paths[r._attributes.Id]);
  for (const path of chainPaths) if (path) zip.remove(path);
  relationships[key(relationships, 'Relationship')] = rels.filter(r => !r._attributes.Type?.endsWith('/calcChain'));
  zip.file('xl/_rels/workbook.xml.rels', write(relTree));
  const typesFile = zip.file('[Content_Types].xml');
  if (!typesFile) throw new Error('xlsx');
  const typesTree = await readXml('[Content_Types].xml'), types = get(typesTree, 'Types');
  const overrides = list(get(types, 'Override')).filter(o => !chainPaths.includes(o._attributes.PartName.slice(1)));
  if (!overrides.some(o => o._attributes.PartName === `/${stylesPath}`)) overrides.push({ _attributes: { PartName: `/${stylesPath}`, ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml' } });
  types[`${prefix(typesTree, 'Types')}Override`] = overrides;
  zip.file('[Content_Types].xml', write(typesTree));
  workbook[`${prefix(book, 'workbook')}calcPr`] = { _attributes: { calcId: '0', fullCalcOnLoad: '1', forceFullCalc: '1', calcMode: 'auto' } };
  zip.file('xl/workbook.xml', write(book));
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
