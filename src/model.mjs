import { TEMPLATE } from './template.mjs';

export const SHEETS = [
  'Summary Sheet',
  'ED_Statistics',
  'Treating_Times',
  'Admission_Statistics',
  'DtoPK',
  'ED KPIs Definitions',
];
export const SECTIONS = [
  {
    sheet: 'ED_Statistics',
    ar: 'إحصاءات الطوارئ',
    en: 'ED statistics',
    rows: [2, 3, 4, 5, 6],
    cols: 'HIJKLMNOPQRSTU'.split(''),
    header: 1,
  },
  {
    sheet: 'Treating_Times',
    ar: 'فترات بقاء المرضى',
    en: 'Treatment time bands',
    rows: [2, 3, 4, 5, 6],
    cols: 'HIJK'.split(''),
    header: 1,
  },
  {
    sheet: 'Admission_Statistics',
    ar: 'فترات التنويم',
    en: 'Admission time bands',
    rows: [2, 3, 4, 5],
    cols: 'HIJK'.split(''),
    header: 1,
  },
  {
    sheet: 'DtoPK',
    ar: 'تسكين الألم',
    en: 'Pain management',
    rows: [3],
    cols: 'GHIJKLMN'.split(''),
    header: 2,
  },
];

export const ED_FIELDS = {
  H: ['إجمالي المرضى', 'Total patients'],
  I: ['إجمالي دقائق الوصول إلى الطبيب', 'Total door-to-doctor minutes'],
  J: ['إجمالي دقائق الطبيب إلى القرار', 'Total doctor-to-decision minutes'],
  K: [
    'إجمالي دقائق القرار إلى المغادرة',
    'Total decision-to-disposition minutes',
  ],
  L: ['المتوفون في الطوارئ', 'Deaths in ED'],
  M: ['الخروج ضد المشورة DAMA', 'Discharged against advice (DAMA)'],
  N: ['المغادرة ضد المشورة LAMA', 'Left against advice (LAMA)'],
  O: ['تنويم عناية البالغين AICU', 'Adult ICU admissions (AICU)'],
  P: ['تنويم عناية الأطفال PICU', 'PICU admissions'],
  Q: ['تنويم عناية حديثي الولادة NICU', 'NICU admissions'],
  R: ['تنويم الأقسام', 'Ward admissions'],
  S: ['إحالة للرعاية العاجلة UCC', 'Referred to UCC'],
  T: ['إحالة لمنشأة أخرى', 'Transferred to another facility'],
  U: ['الخروج إلى المنزل', 'Discharged home'],
};
export const TREAT_FIELDS = {
  H: ['خلال ٤ ساعات', 'Within 4 hours'],
  I: ['أكثر من ٤ إلى ١٢ ساعة', '>4 to 12 hours'],
  J: ['أكثر من ١٢ إلى ٢٤ ساعة', '>12 to 24 hours'],
  K: ['أكثر من ٢٤ ساعة', '>24 hours'],
};
export const ADMIT_FIELDS = {
  H: ['خلال ٣٠ دقيقة', 'Within 30 minutes'],
  I: ['٣٠ دقيقة إلى ساعة', '30 minutes to 1 hour'],
  J: ['ساعة إلى ٤ ساعات', '1 to 4 hours'],
  K: ['أكثر من ٤ ساعات', '>4 hours'],
};
export const PAIN_FIELDS = {
  G: ['متوسط أو وسيط الانتظار بالدقائق', 'Average or median waiting minutes'],
  H: ['خلال ٣٠ دقيقة', 'Within 30 minutes'],
  I: ['أكثر من ٣٠ إلى ٦٠ دقيقة', '>30 to 60 minutes'],
  J: ['أكثر من ٦٠ إلى ١٨٠ دقيقة', '>60 to 180 minutes'],
  K: ['أكثر من ١٨٠ دقيقة', '>180 minutes'],
  L: ['وصفات بيثيدين 50 mg', 'Pethidine prescriptions 50 mg'],
  M: ['وصفات بيثيدين 100 mg', 'Pethidine prescriptions 100 mg'],
  N: ['وصفات بيثيدين 150 mg', 'Pethidine prescriptions 150 mg'],
};
export const META = [
  ['B5', 'حالة البيانات', 'Data status', 'status'],
  ['C8', 'اسم جامع البيانات', 'Data collector', 'text'],
  ['C9', 'رقم التواصل', 'Contact phone', 'tel'],
  ['C10', 'البريد الإلكتروني', 'Email', 'email'],
  ['C11', 'الشهر', 'Month', 'month'],
  ['C12', 'السنة', 'Year', 'year'],
  ['C13', 'التجمع الصحي', 'Health cluster', 'text'],
  ['C14', 'اسم المنشأة', 'Facility name', 'text'],
  ['C15', 'نوع المنشأة', 'Facility type', 'facility'],
  ['C16', 'رمز المنشأة', 'Facility code', 'text'],
  ['C17', 'اكتمل إدخال البيانات؟', 'All data entered?', 'yesno'],
  ['C24', 'مراجعة جامع البيانات؟', 'Reviewed by collector?', 'yesno'],
  ['C25', 'مراجعة التدقيق السريري؟', 'Reviewed by clinical audit?', 'yesno'],
  ['C26', 'اسم المراجع السريري', 'Clinical auditor', 'text'],
  ['C27', 'مراجعة مسؤول التجمع؟', 'Reviewed by cluster?', 'yesno'],
  ['C28', 'اسم مسؤول التجمع', 'Cluster reviewer', 'text'],
];
export const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
export const MONTHS_AR = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];
export const FIELD_MAP = {
  ED_Statistics: ED_FIELDS,
  Treating_Times: TREAT_FIELDS,
  Admission_Statistics: ADMIT_FIELDS,
  DtoPK: PAIN_FIELDS,
};
export const cellKey = (sheet, cell) => `${sheet}!${cell}`;
export const originalCell = (doc, sheet, cell) =>
  doc.sheets[sheet]?.cells[cell];
export const DERIVED_FORMULAS = {
  'Summary Sheet!H19': 'SUM(ED_Statistics!H5:H6)/SUM(ED_Statistics!H2:H6)',
  ...Object.fromEntries(
    SECTIONS.slice(0, 2).flatMap(sec =>
      sec.cols.map(col => [cellKey(sec.sheet, `${col}7`), `SUM(${col}2:${col}6)`])
    )
  ),
};
export function formulaValue(doc, sheet, cell) {
  const key = cellKey(sheet, cell);
  if (!Object.hasOwn(DERIVED_FORMULAS, key)) return null;
  const col = cell[0];
  const inputSheet = sheet === 'Summary Sheet' ? 'ED_Statistics' : sheet;
  const inputs = [2, 3, 4, 5, 6].map(row =>
    number(value(doc, inputSheet, `${sheet === 'Summary Sheet' ? 'H' : col}${row}`))
  );
  if (inputs.some(n => n === null || n < 0 || n > 1000000 || !Number.isInteger(n)))
    return null;
  const total = inputs.reduce((a, b) => a + b, 0);
  return sheet === 'Summary Sheet'
    ? total > 0 ? (inputs[3] + inputs[4]) / total : null
    : total;
}
export function effectiveFormula(doc, sheet, cell) {
  return doc.formulaEdits?.[cellKey(sheet, cell)] ??
    originalCell(doc, sheet, cell)?.f ??
    (doc.mode !== 'import' ? TEMPLATE.formulas[sheet]?.[cell] : undefined);
}
export function value(doc, sheet, cell) {
  const key = cellKey(sheet, cell);
  if (Object.hasOwn(doc.formulaEdits || {}, key)) return formulaValue(doc, sheet, cell);
  return Object.hasOwn(doc.edits || {}, key)
    ? doc.edits[key]
    : (originalCell(doc, sheet, cell)?.v ?? null);
}
export function normalizeDigits(v) {
  return String(v ?? '')
    .replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776))
    .replace(/٫/g, '.')
    .trim();
}
export function number(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = normalizeDigits(v);
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
export function fieldLabel(sheet, col, lang) {
  return FIELD_MAP[sheet]?.[col]?.[lang === 'ar' ? 0 : 1] || col;
}
export function blankDocument(mode = 'manual') {
  const sheets = Object.fromEntries(
    SHEETS.map(sheet => [sheet, { cells: {} }])
  );
  for (const [sheet, headers] of Object.entries(TEMPLATE.headers)) {
    for (const [cell, v] of Object.entries(headers))
      sheets[sheet].cells[cell] = { v, t: 's' };
  }
  for (const def of TEMPLATE.definitions) {
    sheets['ED KPIs Definitions'].cells[`A${def.row}`] = {
      v: def.title,
      t: 's',
    };
    sheets['ED KPIs Definitions'].cells[`B${def.row}`] = {
      v: def.text,
      t: 's',
    };
    def.benchmarks.forEach((v, i) => {
      sheets['ED KPIs Definitions'].cells[`${'CDEF'[i]}${def.row}`] = {
        v,
        t: 's',
      };
    });
  }
  for (const sec of SECTIONS) {
    sec.rows.forEach((row, i) => {
      if (sec.sheet !== 'DtoPK')
        sheets[sec.sheet].cells[`G${row}`] = {
          v:
            sec.sheet === 'Admission_Statistics'
              ? ['AICU', 'PICU', 'NICU', 'Ward'][i]
              : i + 1,
          t: sec.sheet === 'Admission_Statistics' ? 's' : 'n',
        };
      sec.cols.forEach(col => {
        sheets[sec.sheet].cells[`${col}${row}`] = { v: null, t: 'n' };
      });
    });
  }
  sheets['Summary Sheet'].cells.B5 = { v: 'Available', t: 's' };
  return {
    format: 'miyar-ed-audit',
    version: 1,
    mode,
    sourceName: '',
    importedAt: new Date().toISOString(),
    sheets,
    edits: {},
    log: [],
    reviews: {},
  };
}

export function exampleDocument() {
  const doc = blankDocument('demo');
  doc.sourceName = 'ED-DEMO — Synthetic example';
  const summary = {
    C8: 'Demo Collector',
    C9: '0500000000',
    C10: 'demo@example.org',
    C11: 'Sep',
    C12: 2026,
    C13: 'Demo_Health_Cluster',
    C14: 'DEMO-GEN-1 - Example Hospital',
    C15: 'General',
    C16: 'DEMO-GEN-1',
    C17: 'YES',
    C24: 'YES',
    C25: 'YES',
    C26: 'Demo Auditor',
    C27: 'YES',
    C28: '',
  };
  for (const [c, v] of Object.entries(summary))
    doc.sheets['Summary Sheet'].cells[c] = {
      v,
      t: typeof v === 'number' ? 'n' : 's',
    };
  const counts = [100, 200, 400, 200, 100];
  const ed = [
    [100, 600, 2400, 3600, 1, 0, 0, 20, 0, 0, 60, 0, 5, 14],
    [200, 3000, 6000, 9000, 1, 2, 0, 20, 0, 0, 100, 0, 2, 75],
    [400, 10000, 20000, 30000, 0, 3, 2, 0, 0, 0, 50, 0, 5, 340],
    [200, 6000, 10000, 12000, 0, 2, 1, 0, 0, 0, 0, 0, 0, 197],
    [100, 1000, 2000, 3000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100],
  ];
  for (let i = 0; i < 5; i++) {
    SECTIONS[0].cols.forEach((col, j) => {
      doc.sheets.ED_Statistics.cells[`${col}${i + 2}`] = {
        v: ed[i][j],
        t: 'n',
      };
    });
    const bands = [counts[i] - 10, 8, 2, 0];
    if (i === 2) bands[0] -= 5;
    SECTIONS[1].cols.forEach((col, j) => {
      doc.sheets.Treating_Times.cells[`${col}${i + 2}`] = {
        v: bands[j],
        t: 'n',
      };
    });
  }
  [
    [3, 7, 25, 5],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [10, 20, 180, 0],
  ].forEach((vals, i) => {
    SECTIONS[2].cols.forEach((col, j) => {
      doc.sheets.Admission_Statistics.cells[`${col}${i + 2}`] = {
        v: vals[j],
        t: 'n',
      };
    });
  });
  [0, 10, 0, 0, 0, 0, 0, 0].forEach((v, i) => {
    doc.sheets.DtoPK.cells[`${SECTIONS[3].cols[i]}3`] = { v, t: 'n' };
  });
  return doc;
}

export function amend(doc, sheet, cell, newValue, context = {}) {
  const key = cellKey(sheet, cell);
  const before = value(doc, sheet, cell);
  if (before === newValue) return doc;
  const last = doc.log.at(-1);
  const now = new Date();
  const sameEntry = !context.correctionId && !last?.correctionId &&
    last?.sheet === sheet && last?.cell === cell &&
    now.getTime() - Date.parse(last.at) < 60000;
  const entry = {
    sheet,
    cell,
    before: sameEntry ? last.before : before,
    after: newValue,
    at: now.toISOString(),
    ...context,
  };
  return {
    ...doc,
    edits: { ...doc.edits, [key]: newValue },
    log: [...(sameEntry ? doc.log.slice(0, -1) : doc.log), entry],
  };
}

// Backups cross a file/storage trust boundary. Return only checked data;
// never retain nested caller-owned records consumed by the auditor or React.
const record = x => x !== null && typeof x === 'object' &&
  !Array.isArray(x) && [Object.prototype, null].includes(Object.getPrototypeOf(x));
const scalar = x => x == null || typeof x === 'string' ||
  typeof x === 'boolean' || (typeof x === 'number' && Number.isFinite(x));
const address = x => typeof x === 'string' && /^[A-Z]{1,3}[1-9]\d{0,5}$/.test(x);
const backupError = () => { throw new Error('backup'); };
const validKey = key => {
  const sep = key.lastIndexOf('!');
  return sep > 0 && SHEETS.includes(key.slice(0, sep)) && address(key.slice(sep + 1));
};

export function validateBackup(input) {
  if (!record(input) || input.format !== 'miyar-ed-audit' || input.version !== 1 ||
      !record(input.sheets) || typeof input.sourceName !== 'string' ||
      input.sourceName.length > 1000) backupError();
  if (Object.keys(input.sheets).some(name => !SHEETS.includes(name))) backupError();
  const mode = input.mode ?? 'import';
  if (!['import', 'manual', 'demo'].includes(mode)) backupError();
  if (input.importedAt != null && (typeof input.importedAt !== 'string' ||
      !Number.isFinite(Date.parse(input.importedAt)))) backupError();
  if (!Object.hasOwn(input.sheets, 'Summary Sheet') ||
      !Object.hasOwn(input.sheets, 'ED_Statistics')) backupError();
  const sheets = Object.create(null);
  for (const name of SHEETS) {
    if (!Object.hasOwn(input.sheets, name)) continue;
    const sheet = input.sheets[name];
    if (!Object.hasOwn(input.sheets, name) || !record(sheet) || !record(sheet.cells)) backupError();
    const cells = Object.create(null);
    for (const [addr, cell] of Object.entries(sheet.cells)) {
      if (!address(addr) || !record(cell) || !scalar(cell.v)) backupError();
      if (cell.f != null && typeof cell.f !== 'string') backupError();
      if (cell.t != null && !['n', 's', 'str', 'b', 'e', 'd'].includes(cell.t)) backupError();
      if (cell.z != null && typeof cell.z !== 'string') backupError();
      cells[addr] = {
        v: cell.v ?? null,
        ...(cell.t != null ? { t: cell.t } : {}),
        ...(cell.f != null ? { f: cell.f } : {}),
        ...(cell.z != null ? { z: cell.z } : {}),
      };
    }
    sheets[name] = { cells };
  }
  const edits = Object.create(null);
  if (!record(input.edits ?? {})) backupError();
  for (const [key, v] of Object.entries(input.edits ?? {})) {
    if (!validKey(key) || !scalar(v) || typeof v === 'boolean') backupError();
    edits[key] = v ?? null;
  }
  const formulaEdits = Object.create(null);
  if (!record(input.formulaEdits ?? {})) backupError();
  for (const [key, formula] of Object.entries(input.formulaEdits ?? {})) {
    if (!Object.hasOwn(DERIVED_FORMULAS, key) || DERIVED_FORMULAS[key] !== formula) backupError();
    formulaEdits[key] = formula;
  }
  if (!Array.isArray(input.log ?? [])) backupError();
  const log = (input.log ?? []).map(entry => {
    if (!record(entry) || !SHEETS.includes(entry.sheet) || !address(entry.cell) ||
        typeof entry.at !== 'string' || !Number.isFinite(Date.parse(entry.at)) ||
        !scalar(entry.before) || !scalar(entry.after)) backupError();
    const clean = {
      sheet: entry.sheet, cell: entry.cell, at: entry.at,
      before: entry.before ?? null, after: entry.after ?? null,
    };
    for (const field of ['correctionId', 'source']) {
      if (entry[field] != null) {
        if (typeof entry[field] !== 'string') backupError();
        clean[field] = entry[field];
      }
    }
    for (const [field, options] of [
      ['kind', ['number', 'formula']],
      ['operation', ['apply', 'undo', 'manual']],
    ]) {
      if (entry[field] != null) {
        if (!options.includes(entry[field])) backupError();
        clean[field] = entry[field];
      }
    }
    // Undoing a numeric correction writes its saved value back to edits.
    // Keep that history inside the same scalar contract as the edits map.
    if (clean.correctionId != null && (
      !['number', 'formula'].includes(clean.kind) ||
      !['apply', 'undo'].includes(clean.operation) ||
      (clean.kind === 'number' &&
        (typeof clean.before === 'boolean' || typeof clean.after === 'boolean'))
    )) backupError();
    for (const field of ['beforeValue', 'afterValue']) {
      if (Object.hasOwn(entry, field)) {
        if (entry[field] !== null &&
            (typeof entry[field] !== 'number' || !Number.isFinite(entry[field]))) backupError();
        clean[field] = entry[field];
      }
    }
    if (entry.reason != null) {
      if (!record(entry.reason)) backupError();
      clean.reason = {};
      for (const lang of ['ar', 'en']) {
        if (Object.hasOwn(entry.reason, lang)) {
          if (typeof entry.reason[lang] !== 'string') backupError();
          clean.reason[lang] = entry.reason[lang];
        }
      }
    }
    return clean;
  });
  const reviews = Object.create(null);
  if (!record(input.reviews ?? {})) backupError();
  for (const [key, review] of Object.entries(input.reviews ?? {})) {
    if (!record(review) || typeof review.note !== 'string' ||
        !['open', 'reviewed'].includes(review.status)) backupError();
    reviews[key] = { status: review.status, note: review.note };
  }
  if (!Array.isArray(input.extraData ?? [])) backupError();
  const extraData = (input.extraData ?? []).map(extra => {
    if (!record(extra) || typeof extra.ref !== 'string' || typeof extra.value !== 'string') backupError();
    return { ref: extra.ref, value: extra.value };
  });
  return {
    format: 'miyar-ed-audit', version: 1, mode, sourceName: input.sourceName,
    ...(input.importedAt != null ? { importedAt: input.importedAt } : {}),
    sheets, edits, formulaEdits, log, reviews, extraData,
  };
}
