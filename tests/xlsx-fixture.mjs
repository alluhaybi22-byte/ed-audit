import JSZip from 'jszip';
import { exampleDocument } from '../src/model.mjs';

const esc = x => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const packageRel = 'http://schemas.openxmlformats.org/package/2006/relationships';

export async function workbookFixture({ partial = false, prefixed = false, group = false, noStyles = false } = {}) {
  const doc = exampleDocument();
  doc.sheets.ED_Statistics.cells.I7 = { v: 123, f: 'SUM(I2:I6)' };
  doc.sheets.ED_Statistics.cells.J7 = { v: 40400, f: 'SUM(J2:J6)' };
  const sheets = Object.entries(doc.sheets).filter(([name]) => !partial ||
    ['Summary Sheet', 'ED_Statistics'].includes(name));
  sheets.push(['Notes', { cells: { A1: { v: 'Retained extra sheet' } } }]);
  const zip = new JSZip();
  zip.file('_rels/.rels', `<Relationships xmlns="${packageRel}"><Relationship Id="book" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file('xl/workbook.xml', `<workbook xmlns="${main}" xmlns:r="${rel}"><sheets>${sheets.map(([name], i) =>
    `<sheet name="${esc(name)}" sheetId="${i + 1}" r:id="sheet${i + 1}"/>`).join('')}</sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<Relationships xmlns="${packageRel}">${sheets.map((_, i) =>
    `<Relationship Id="sheet${i + 1}" Type="${rel}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}${noStyles ? '' :
    `<Relationship Id="styles" Type="${rel}/styles" Target="styles.xml"/>`}<Relationship Id="chain" Type="${rel}/calcChain" Target="calcChain.xml"/></Relationships>`);
  zip.file('[Content_Types].xml', `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) =>
    `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}${noStyles ? '' :
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'}<Override PartName="/xl/calcChain.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.calcChain+xml"/></Types>`);
  if (!noStyles) zip.file('xl/styles.xml', `<styleSheet xmlns="${main}"><fonts count="1"><font><b/><sz val="12"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
  zip.file('xl/calcChain.xml', `<calcChain xmlns="${main}"><c r="I7" i="2"/></calcChain>`);
  zip.file('docProps/retained.xml', '<retained>Untouched package metadata</retained>');
  for (const [i, [name, sheet]] of sheets.entries()) {
    const rows = new Map();
    for (const [addr, cell] of Object.entries(sheet.cells)) {
      const row = Number(addr.match(/\d+$/)[0]);
      let formula = cell.f ? `<f>${esc(cell.f)}</f>` : '';
      if (name === 'ED_Statistics' && addr === 'I7') formula = `<f t="${group ? 'array' : 'shared'}" ref="I7:J7" si="0">SUM(I2:I6)</f>`;
      if (name === 'ED_Statistics' && addr === 'J7') formula = group ? '' : '<f t="shared" si="0"/>';
      const style = !noStyles && name === 'DtoPK' && addr === 'G3' ? ' s="1"' : '';
      const xml = typeof cell.v === 'string'
        ? `<c r="${addr}" t="inlineStr"${style}><is><t>${esc(cell.v)}</t></is></c>`
        : `<c r="${addr}"${style}>${formula}${cell.v == null ? '' : `<v>${cell.v}</v>`}</c>`;
      rows.set(row, (rows.get(row) || '') + xml);
    }
    zip.file(`xl/worksheets/sheet${i + 1}.xml`, `<worksheet xmlns="${main}"><dimension ref="A1:A1"/><sheetViews><sheetView workbookViewId="0" rightToLeft="1"/></sheetViews><sheetData>${[...rows].sort(([a], [b]) => a - b).map(([r, cells]) => `<row r="${r}">${cells}</row>`).join('')}</sheetData><pageMargins left="0.5" right="0.5" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>`);
  }
  if (prefixed) {
    for (const path of Object.keys(zip.files).filter(p => p.endsWith('.xml') && p.startsWith('xl/') && !p.includes('calcChain'))) {
      const text = await zip.file(path).async('string');
      zip.file(path, text.replace(`xmlns="${main}"`, `xmlns:x="${main}"`).replace(/<(\/?)([A-Za-z][\w]*)/g, '<$1x:$2'));
    }
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
