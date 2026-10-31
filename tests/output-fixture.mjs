import JSZip from 'jszip';
import xmljs from 'xml-js';
import { workbookFixture } from './xlsx-fixture.mjs';
import { exampleDocument } from '../src/model.mjs';
import { TEMPLATE } from '../src/template.mjs';

const list = value => value == null ? [] : Array.isArray(value) ? value : [value];
const read = source => xmljs.xml2js(source, { compact: true });
const write = object => xmljs.js2xml(object, { compact: true });

// Synthetic, independently specified oracle: 1,000 patients; CTAS 4+5 = 300;
// 10 lower-acuity admissions. The original formula gives 29%, definition 30%.
// This is a software regression fixture, not a clinically approved workbook.
export async function outputWorkbook() {
  const zip = await JSZip.loadAsync(await workbookFixture());
  const book = read(await zip.file('xl/workbook.xml').async('string'));
  book.workbook.sheets.sheet = list(book.workbook.sheets.sheet).filter(s => s._attributes.name !== 'Notes');
  zip.file('xl/workbook.xml', write(book));
  const relationships = read(await zip.file('xl/_rels/workbook.xml.rels').async('string'));
  relationships.Relationships.Relationship = list(relationships.Relationships.Relationship)
    .filter(r => r._attributes.Id !== 'sheet7');
  zip.file('xl/_rels/workbook.xml.rels', write(relationships));
  const types = read(await zip.file('[Content_Types].xml').async('string'));
  types.Types.Override = list(types.Types.Override).filter(t => t._attributes.PartName !== '/xl/worksheets/sheet7.xml');
  zip.file('[Content_Types].xml', write(types));
  zip.remove('xl/worksheets/sheet7.xml');

  const source = exampleDocument();
  source.sheets.ED_Statistics.cells.O5.v = 10;
  source.sheets.ED_Statistics.cells.U5.v = 187;
  source.sheets.DtoPK.cells.G3.v = 0.5;
  source.sheets.Admission_Statistics.cells.H2.v = 13;
  const names = Object.keys(source.sheets);
  for (const [index, name] of names.entries()) {
    const file = `xl/worksheets/sheet${index + 1}.xml`;
    const tree = read(await zip.file(file).async('string'));
    const data = tree.worksheet.sheetData;
    const rows = list(data.row);
    const cell = address => {
      const rowNumber = Number(address.match(/\d+$/)[0]);
      let row = rows.find(r => Number(r._attributes.r) === rowNumber);
      if (!row) { row = { _attributes: { r: rowNumber }, c: [] }; rows.push(row); }
      row.c = list(row.c);
      let result = row.c.find(c => c._attributes.r === address);
      if (!result) { result = { _attributes: { r: address } }; row.c.push(result); }
      return result;
    };
    for (const [address, formula] of Object.entries(TEMPLATE.formulas[name] || {})) {
      const target = cell(address);
      target.f = { _text: formula };
      const linked = /'Summary Sheet'!\$?(C)\$?(\d+)/.exec(formula);
      const value = linked ? source.sheets['Summary Sheet'].cells[`${linked[1]}${linked[2]}`]?.v :
        address.match(/^[H-U]7$/) ? [2, 3, 4, 5, 6].reduce((sum, row) => sum + Number(source.sheets[name].cells[`${address[0]}${row}`]?.v || 0), 0) :
        name === 'Summary Sheet' && address === 'H19' ? 0.29 :
        name === 'Summary Sheet' && address === 'C16' ? source.sheets[name].cells.C16.v : null;
      delete target.is;
      delete target._attributes.t;
      if (typeof value === 'string') target._attributes.t = 'str';
      if (value != null) target.v = { _text: String(value) };
    }
    for (const [address, value] of name === 'ED_Statistics' ? [['O5', 10], ['U5', 187]] :
      name === 'DtoPK' ? [['G3', 0.5]] : name === 'Admission_Statistics' ? [['H2', 13]] : [])
      cell(address).v = { _text: String(value) };
    rows.sort((a, b) => Number(a._attributes.r) - Number(b._attributes.r));
    data.row = rows;
    zip.file(file, write(tree));
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
