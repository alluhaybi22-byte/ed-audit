import JSZip from 'jszip';
import xmljs from 'xml-js';
import { SHEETS, SECTIONS, blankDocument, validateBackup } from './model.mjs';

export const XLSX_LIMITS = Object.freeze({
  fileBytes: 15 * 1024 * 1024,
  expandedBytes: 30 * 1024 * 1024,
  entryBytes: 12000000,
  stylesBytes: 3000000,
});

const arr = x => (x == null ? [] : Array.isArray(x) ? x : [x]);
const child = (obj, key) =>
  obj?.[key] ??
  Object.entries(obj || {}).find(([k]) => k.split(':').at(-1) === key)?.[1];
const text = x =>
  typeof x === 'string' ? x : arr(x?._text).join('') + arr(x?._cdata).join('');
const colNumber = col =>
  [...col].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
function colName(n) {
  let result = '';
  while (n > 0) {
    n--;
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}
export function shiftFormula(formula, from, to) {
  const a = /^([A-Z]+)(\d+)$/.exec(from),
    b = /^([A-Z]+)(\d+)$/.exec(to);
  const dx = colNumber(b[1]) - colNumber(a[1]),
    dy = Number(b[2]) - Number(a[2]);
  return formula
    .split(/("(?:[^"]|"")*")/g)
    .map((part, i) =>
      i % 2
        ? part
        : part.replace(
            /(?<![A-Z0-9_.])(?<ac>\$?)(?<col>[A-Z]{1,3})(?<ar>\$?)(?<row>[1-9]\d*)/gi,
            (all, ac, col, ar, row) => {
              const c = colNumber(col.toUpperCase()) + (ac ? 0 : dx),
                r = Number(row) + (ar ? 0 : dy);
              return c < 1 || r < 1 ? '#REF!' : `${ac}${colName(c)}${ar}${r}`;
            }
          )
    )
    .join('');
}
function richText(obj) {
  return (
    arr(child(obj, 't')).map(text).join('') +
    arr(child(obj, 'r'))
      .map(r => text(child(r, 't')))
      .join('')
  );
}
const xml = source => {
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('xml');
  return xmljs.xml2js(source, {
    compact: true,
    ignoreDeclaration: true,
    ignoreInstruction: true,
    ignoreComment: true,
  });
};

export async function readEntry(zip, name, budget, max = XLSX_LIMITS.entryBytes) {
  const file = zip.file(name);
  if (!file) return null;
  return new Promise((resolve, reject) => {
    let size = 0;
    let stopped = false;
    const chunks = [];
    const stream = file.internalStream('uint8array');
    const fail = error => {
      if (stopped) return;
      stopped = true;
      stream.pause();
      chunks.length = 0;
      reject(error);
    };
    stream.on('data', chunk => {
      if (stopped) return;
      // Apply both limits before retaining any bytes from this chunk.
      if (size + chunk.length > max || chunk.length > budget.remaining)
        return fail(new Error('size'));
      size += chunk.length;
      budget.remaining -= chunk.length;
      chunks.push(chunk);
    });
    stream.on('error', fail);
    stream.on('end', () => {
      if (stopped) return;
      stopped = true;
      const output = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        output.set(chunk, offset);
        offset += chunk.length;
      }
      resolve(new TextDecoder().decode(output));
    });
    stream.resume();
  });
}

export async function parseXlsx(input, sourceName) {
  if (input.byteLength > XLSX_LIMITS.fileBytes) throw new Error('size');
  let zip;
  try {
    zip = await JSZip.loadAsync(input);
  } catch {
    throw new Error('xlsx');
  }
  const budget = { remaining: XLSX_LIMITS.expandedBytes };
  const read = (name, max) => readEntry(zip, name, budget, max);
  const bookSource = await read('xl/workbook.xml');
  const relSource = await read('xl/_rels/workbook.xml.rels');
  if (!bookSource || !relSource) throw new Error('xlsx');
  const wb = child(xml(bookSource), 'workbook');
  const rels = arr(
    child(child(xml(relSource), 'Relationships'), 'Relationship')
  );
  const paths = Object.fromEntries(
    rels
      .filter(r => r._attributes?.TargetMode !== 'External')
      .map(r => {
        const a = r._attributes,
          target = a.Target.replace(/^\//, '');
        const parts = (
          target.startsWith('xl/') ? target : `xl/${target}`
        ).split('/');
        const normalized = [];
        for (const part of parts)
          if (part === '..') normalized.pop();
          else if (part && part !== '.') normalized.push(part);
        return [a.Id, normalized.join('/')];
      })
  );
  const sheetList = arr(child(child(wb, 'sheets'), 'sheet'));
  if (sheetList.length > 30) throw new Error('size');
  const availableNames = sheetList.map(s => s._attributes.name);
  if (new Set(availableNames).size !== availableNames.length)
    throw new Error('xlsx');
  if (
    !availableNames.includes('ED_Statistics') ||
    !availableNames.includes('Summary Sheet')
  )
    throw new Error('template');
  const sharedSource = await read('xl/sharedStrings.xml');
  const strings = sharedSource
    ? arr(child(child(xml(sharedSource), 'sst'), 'si')).map(richText)
    : [];
  const stylesSource = await read('xl/styles.xml', XLSX_LIMITS.stylesBytes);
  const styles = stylesSource ? child(xml(stylesSource), 'styleSheet') : {};
  const formats = Object.fromEntries(
    arr(child(child(styles, 'numFmts'), 'numFmt')).map(x => [
      x._attributes.numFmtId,
      x._attributes.formatCode,
    ])
  );
  const cellXfs = arr(child(child(styles, 'cellXfs'), 'xf')).map(
    x => formats[x._attributes.numFmtId] || `builtin:${x._attributes.numFmtId}`
  );
  const doc = {
    ...blankDocument('import'),
    sourceName,
    sheets: {},
    extraData: [],
  };
  for (const entry of sheetList) {
    const attr = entry._attributes,
      path = paths[attr['r:id'] || attr.id];
    if (!path || !path.startsWith('xl/') || path.includes('..'))
      throw new Error('xlsx');
    const source = await read(path);
    if (!source) throw new Error('xlsx');
    const worksheet = child(xml(source), 'worksheet');
    const cells = {};
    const sharedFormulas = {},
      sharedPending = [];
    const rows = arr(child(child(worksheet, 'sheetData'), 'row'));
    if (rows.length > 10000) throw new Error('size');
    let count = 0;
    for (const row of rows)
      for (const c of arr(child(row, 'c'))) {
        const a = c._attributes || {},
          addr = a.r;
        if (!/^[A-Z]{1,3}[1-9]\d{0,5}$/.test(addr || ''))
          throw new Error('xlsx');
        if (++count > 100000) throw new Error('size');
        const fNode = child(c, 'f'),
          f = text(fNode),
          raw = text(child(c, 'v'));
        if (fNode?._attributes?.t === 'shared') {
          const si = fNode._attributes.si;
          if (f) sharedFormulas[si] = { formula: f, addr };
          else sharedPending.push({ si, addr });
        }
        let v = null,
          t = a.t || 'n';
        if (t === 's') {
          if (raw !== '' && !Object.hasOwn(strings, Number(raw)))
            throw new Error('xlsx');
          v = strings[Number(raw)] ?? null;
        } else if (t === 'inlineStr') {
          v = richText(child(c, 'is'));
          t = 's';
        } else if (['str', 'e', 'd'].includes(t)) v = raw;
        else if (t === 'b') v = raw === '1';
        else if (raw !== '') {
          v = Number(raw);
          if (!Number.isFinite(v)) {
            v = raw;
            t = 'e';
          }
        }
        if (v !== null || fNode)
          cells[addr] = {
            v,
            t,
            ...(fNode ? { f: f || '[shared formula]' } : {}),
            ...(a.s ? { z: cellXfs[Number(a.s)] } : {}),
          };
      }
    for (const p of sharedPending) {
      const master = sharedFormulas[p.si];
      if (master)
        cells[p.addr].f = shiftFormula(master.formula, master.addr, p.addr);
    }
    if (SHEETS.includes(attr.name)) doc.sheets[attr.name] = { cells };
    else if (
      Object.values(cells).some(c => c.v != null && String(c.v).trim() !== '')
    )
      doc.extraData.push({
        ref: attr.name,
        value: 'Non-empty additional worksheet',
      });
    const sec = SECTIONS.find(s => s.sheet === attr.name);
    if (sec)
      for (const [addr, c] of Object.entries(cells)) {
        const row = Number(addr.replace(/^[A-Z]+/, '')),
          col = addr.replace(/\d+$/, '');
        const maximum =
          sec.sheet === 'DtoPK'
            ? 3
            : sec.sheet === 'Admission_Statistics'
              ? 5
              : 7;
        const maxCol =
          sec.sheet === 'ED_Statistics'
            ? 'U'
            : sec.sheet === 'DtoPK'
              ? 'N'
              : 'K';
        if (
          (row > maximum || col.length > 1 || col > maxCol) &&
          c.v != null &&
          String(c.v).trim() !== ''
        )
          doc.extraData.push({
            ref: `${attr.name}!${addr}`,
            value: String(c.v),
          });
      }
  }
  return doc;
}

export async function parseFile(file) {
  if (file.size > XLSX_LIMITS.fileBytes) throw new Error('size');
  if (/\.json$/i.test(file.name)) {
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      throw new Error('backup');
    }
    return validateBackup(data);
  }
  if (!/\.xlsx$/i.test(file.name)) throw new Error('extension');
  return parseXlsx(await file.arrayBuffer(), file.name);
}

