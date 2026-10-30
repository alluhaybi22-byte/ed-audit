import { TEMPLATE } from './template.mjs';
import { canonicalFormula } from './formula.mjs';
import {
  SHEETS,
  SECTIONS,
  META,
  MONTHS,
  number,
  value,
  originalCell,
  cellKey,
  effectiveFormula,
  DERIVED_FORMULAS,
} from './model.mjs';

const bi = (ar, en) => ({ ar, en });
const clean = x =>
  String(x ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
const sum = arr =>
  arr.some(x => x === null) ? null : arr.reduce((a, b) => a + b, 0);
const close = (a, b, tol = 1e-8) => Math.abs(a - b) <= tol;
const show = v => (v === null || v === undefined || v === '' ? '—' : String(v));

export const RULES = [
  [
    'schema',
    'البنية والأعمدة والتعاريف',
    'Sheets, columns and definitions',
    'Template structure / ED KPIs Definitions',
  ],
  [
    'required',
    'اكتمال الخلايا الرقمية',
    'Required numeric cells',
    'Input validation ranges',
  ],
  [
    'numeric',
    'صحة القيم والأعداد الصحيحة',
    'Numbers, counts and native limits',
    'Input data validation: whole number 0–1,000,000',
  ],
  [
    'numeric_text',
    'الأعداد المخزنة كنص',
    'Numbers stored as text',
    'Excel numeric data validation',
  ],
  [
    'input_formula',
    'صيغة في موضع إدخال يدوي',
    'Formula in a manual input',
    'Manual input ranges',
  ],
  [
    'metadata',
    'بيانات المنشأة والفترة والاعتماد',
    'Facility, period and review fields',
    'Summary Sheet!B5:C28',
  ],
  [
    'reviewers',
    'استقلالية المراجعة',
    'Independent reviewers',
    'Summary Sheet!B21',
  ],
  [
    'period',
    'اتساق الفترة والمنشأة بين الأوراق',
    'Cross-sheet metadata consistency',
    'Summary Sheet!C11:C16 / data sheets A:F',
  ],
  [
    'ctas',
    'مستويات الفرز الفريدة ١–٥',
    'Unique CTAS levels 1–5',
    'ED_Statistics / Treating_Times column G',
  ],
  [
    'outcomes',
    'مطابقة وجهات المغادرة لكل مستوى',
    'Disposition reconciliation by CTAS',
    'ED_Statistics!H2:U6',
  ],
  [
    'treatment',
    'مطابقة فترات البقاء لكل مستوى',
    'Treatment bands by CTAS',
    'Treating_Times!H2:K6 / ED_Statistics!H2:H6',
  ],
  [
    'admission',
    'مطابقة التنويم لكل نوع',
    'Admission reconciliation by destination',
    'Admission_Statistics!H2:K5 / ED_Statistics!O2:R6',
  ],
  [
    'zero_activity',
    'قيم موجبة مع عدم وجود مرضى',
    'Activity without patients',
    'ED statistics and related populations',
  ],
  [
    'pain_zero',
    'انتظار صفري مع وجود حالات مسكن',
    'Zero pain waiting time with cases',
    'DtoPK!G3:K3',
  ],
  [
    'pain_scope',
    'حجم مجتمع تسكين الألم',
    'Pain-management population',
    'ED KPIs Definitions!B11 / DtoPK!H3:N3',
  ],
  [
    'time_bounds',
    'اتساق دقائق البقاء مع الفترات',
    'Duration totals and treatment bands',
    'ED_Statistics!I2:K6 / Treating_Times!H2:K6',
  ],
  [
    'totals',
    'إعادة حساب الإجماليات',
    'Recomputed totals versus stored results',
    'ED_Statistics / Treating_Times total row',
  ],
  [
    'formula_error',
    'أخطاء صيغ Excel',
    'Excel formula errors',
    'Imported cells, including summary',
  ],
  [
    'formula_changed',
    'تغير الصيغ عن النموذج',
    'Formula changes from reference template',
    'ED template V4.25',
  ],
  [
    'cache',
    'نتائج الملخص المخزنة',
    'Cached summary result reconciliation',
    'Summary Sheet!H16:H23',
  ],
  [
    'definition_changed',
    'تغير تعريف أو معيار',
    'Changed definitions or benchmarks',
    'ED KPIs Definitions!A2:F11',
  ],
  [
    'four_hour',
    'استبعادات وحدود مؤشر الأربع ساعات',
    'Four-hour cohort exclusions and boundary',
    'ED KPIs Definitions!B2 / B8',
  ],
  [
    'nonurgent',
    'صيغة غير العاجل مقابل التعريف',
    'Non-urgent formula versus definition',
    'Summary Sheet!H19 / ED KPIs Definitions!B7',
  ],
  [
    'mortality',
    'مقام معدل الوفيات',
    'Mortality rate denominator',
    'Summary Sheet!H22 / ED KPIs Definitions!B10',
  ],
  [
    'pain_statistic',
    'المتوسط أو الوسيط',
    'Mean versus median for pain waiting',
    'DtoPK!G2 / ED KPIs Definitions!B11',
  ],
  [
    'scope',
    'حدود التحقق من الملف المجمع',
    'Limits of aggregate-data validation',
    'Monthly aggregate workbook',
  ],
  [
    'readiness',
    'اكتمال نموذج الاعتماد',
    'Submission readiness fields',
    'Summary Sheet!F2:G2 / C8:C28',
  ],
].map(([id, ar, en, source]) => ({ id, title: bi(ar, en), source }));

export function audit(doc) {
  const issues = [],
    checks = [];
  const add = (
    rule,
    severity,
    category,
    suffix,
    title,
    details,
    refs = [],
    observed = '',
    expected = ''
  ) => {
    const id = `${rule}:${suffix}`;
    issues.push({
      id,
      reviewKey: `${id}:${JSON.stringify(observed)}`,
      rule,
      severity,
      category,
      title,
      details,
      refs,
      observed: String(observed),
      expected: String(expected),
      source: RULES.find(r => r.id === rule)?.source || '',
    });
  };
  const read = (s, c) => number(value(doc, s, c));
  const validRead = (s, c, allowFraction = false) => {
    const n = read(s, c);
    return n !== null &&
      n >= 0 &&
      n <= 1000000 &&
      (allowFraction || Number.isInteger(n))
      ? n
      : null;
  };
  const nums = (s, cells) =>
    cells.map(c => validRead(s, c, s === 'DtoPK' && c === 'G3'));
  const totalCol = (s, col, rows) =>
    sum(
      nums(
        s,
        rows.map(r => `${col}${r}`)
      )
    );
  const totalRow = (s, row, cols) =>
    sum(
      nums(
        s,
        cols.map(c => `${c}${row}`)
      )
    );
  const ss = 'Summary Sheet',
    ed = 'ED_Statistics',
    tt = 'Treating_Times',
    ad = 'Admission_Statistics',
    pk = 'DtoPK';
  const changed = (sheet, cell) => {
    const before = originalCell(doc, sheet, cell)?.v ?? null;
    const after = value(doc, sheet, cell);
    const beforeNumber = number(before), afterNumber = number(after);
    return beforeNumber !== null && afterNumber !== null
      ? beforeNumber !== afterNumber
      : before !== after;
  };
  const changedColumn = (sheet, col) =>
    [2, 3, 4, 5, 6].some(row => changed(sheet, `${col}${row}`));
  const status = clean(value(doc, ss, 'B5'));
  const inactive = ['no cases', 'not applicable'].includes(status);
  let schemaValid = true;
  for (const name of SHEETS) {
    if (!doc.sheets[name]) {
      schemaValid = false;
      add(
        'schema',
        'error',
        'structure',
        name,
        bi('ورقة مطلوبة غير موجودة', 'Required worksheet is missing'),
        bi(
          'استورد ملف الطوارئ الأصلي كاملًا.',
          'Import the complete original ED workbook.'
        ),
        [name],
        '—',
        name
      );
    }
  }
  for (const [name, headers] of Object.entries(TEMPLATE.headers)) {
    for (const [cell, expected] of Object.entries(headers)) {
      if (clean(value(doc, name, cell)) !== clean(expected)) {
        schemaValid = false;
        add(
          'schema',
          'error',
          'structure',
          `${name}:${cell}`,
          bi(
            'عنوان عمود لا يطابق النموذج',
            'Column header differs from template'
          ),
          bi(
            'توقف حساب المؤشرات إلى حين مطابقة بنية الملف؛ لا يمكن الاعتماد على موضع العمود وحده.',
            'KPI calculations are withheld until the workbook structure matches; column position alone is insufficient.'
          ),
          [cellKey(name, cell)],
          show(value(doc, name, cell)),
          expected
        );
      }
    }
  }
  for (const extra of doc.extraData || []) {
    schemaValid = false;
    add(
      'schema',
      'error',
      'structure',
      extra.ref,
      bi(
        'بيانات خارج النطاق المدعوم',
        'Data outside the supported template range'
      ),
      bi(
        'هذه الخلايا لم تدخل في الحسابات. طابق النموذج ذي خمسة مستويات CTAS ثم أعد الاستيراد.',
        'These cells are not included in calculations. Align the file to the five-level CTAS template and import again.'
      ),
      [extra.ref],
      extra.value,
      'V4.25'
    );
  }
  let definitionChanged = false;
  {
    for (const def of TEMPLATE.definitions) {
      for (const [cell, expected] of [
        [`A${def.row}`, def.title],
        [`B${def.row}`, def.text],
        ...def.benchmarks.map((v, i) => [`${'CDEF'[i]}${def.row}`, v]),
      ]) {
        if (
          clean(value(doc, 'ED KPIs Definitions', cell)) !== clean(expected)
        ) {
          definitionChanged = true;
          add(
            'definition_changed',
            'warning',
            'definition',
            cell,
            bi(
              'تعريف أو معيار مختلف عن النسخة المدعومة',
              'Definition or benchmark differs from supported version'
            ),
            bi(
              'يظهر النص المستورد في دليل التعاريف. تعرض الحسابات مرجع V4.25 فقط ولا يطبق التطبيق التغيير تلقائيًا.',
              'The imported wording is shown in Definitions. Calculations remain V4.25 references and do not automatically implement the changed rule.'
            ),
            [cellKey('ED KPIs Definitions', cell)],
            show(value(doc, 'ED KPIs Definitions', cell)),
            show(expected)
          );
        }
      }
    }
  }
  for (const sec of SECTIONS) {
    for (const row of sec.rows)
      for (const col of sec.cols) {
        const cell = `${col}${row}`,
          ref = cellKey(sec.sheet, cell),
          raw = value(doc, sec.sheet, cell),
          n = number(raw);
        const original = originalCell(doc, sec.sheet, cell);
        if (raw === null || raw === undefined || String(raw).trim() === '') {
          if (!inactive)
            add(
              'required',
              'error',
              'data',
              ref,
              bi('خلية رقمية غير مكتملة', 'Required numeric cell is empty'),
              bi(
                'أدخل العدد الصحيح، واستخدم صفرًا عند عدم وجود حالات. الخلية الفارغة لا تعني صفرًا.',
                'Enter the verified value; use zero for no cases. A blank is not treated as zero.'
              ),
              [ref],
              '—',
              '0–1,000,000'
            );
        } else if (
          n === null ||
          n < 0 ||
          n > 1000000 ||
          (!(sec.sheet === pk && col === 'G') && !Number.isInteger(n))
        ) {
          add(
            'numeric',
            'error',
            'data',
            ref,
            bi('قيمة رقمية غير مقبولة', 'Invalid numeric value'),
            bi(
              'الأعداد وإجمالي الدقائق تخضع للتحقق الأصلي: عدد صحيح من صفر إلى مليون. متوسط أو وسيط الألم يقبل الكسور.',
              'Counts and total minutes follow native validation: integer 0 to 1,000,000. Pain mean or median may contain decimals.'
            ),
            [ref],
            show(raw),
            sec.sheet === pk && col === 'G'
              ? '0–1,000,000 minutes'
              : 'Integer 0–1,000,000'
          );
        } else if (typeof raw === 'string') {
          add(
            'numeric_text',
            'warning',
            'data',
            ref,
            bi('عدد مخزن كنص', 'Number stored as text'),
            bi(
              'استخدمت القراءة الرقمية الواضحة في حساب التطبيق. صحح نوع الخلية في Excel لأن SUM قد يتجاهل النص.',
              'The unambiguous numeric text is used in app calculations. Correct the Excel cell type because SUM may ignore text.'
            ),
            [ref],
            raw,
            String(n)
          );
        }
        if (original?.f && !Object.hasOwn(doc.edits, ref))
          add(
            'input_formula',
            'warning',
            'formula',
            ref,
            bi('صيغة في خلية إدخال يدوي', 'Formula in a manual-entry cell'),
            bi(
              'التطبيق لا ينفذ صيغًا عشوائية. القيمة المستوردة نتيجة مخزنة تحتاج التحقق أو إعادة إدخال القيمة.',
              'Arbitrary formulas are not executed. This imported value is a cached result that requires verification or a verified manual amendment.'
            ),
            [ref],
            original.f,
            show(raw)
          );
      }
  }
  for (const [sheet, data] of Object.entries(doc.sheets))
    for (const [cell, c] of Object.entries(data.cells)) {
      if (c.t === 'e' && !Object.hasOwn(doc.edits, cellKey(sheet, cell)) &&
          !Object.hasOwn(doc.formulaEdits || {}, cellKey(sheet, cell)))
        add(
          'formula_error',
          'error',
          'formula',
          cellKey(sheet, cell),
          bi('خطأ Excel في الملف الأصلي', 'Excel error in original workbook'),
          bi(
            'راجع مرجع الخلية والصيغة داخل ملف Excel. لا يستبدل التطبيق الخطأ بصفر.',
            'Review the cell reference and formula in Excel. The app never substitutes zero for this error.'
          ),
          [cellKey(sheet, cell)],
          show(c.v),
          'No Excel error'
        );
    }
  {
    for (const [sheet, formulas] of Object.entries(TEMPLATE.formulas))
      for (const [cell, expected] of Object.entries(formulas)) {
        const c = originalCell(doc, sheet, cell);
        if (doc.mode !== 'import' && !c) continue;
        // Manual/demo metadata is entered directly; it has no source formula to compare.
        if (doc.mode !== 'import' && sheet === ss && !c?.f && META.some(field => field[0] === cell)) continue;
        const applied = doc.formulaEdits?.[cellKey(sheet, cell)] ===
          DERIVED_FORMULAS[cellKey(sheet, cell)] &&
          Object.hasOwn(doc.formulaEdits || {}, cellKey(sheet, cell));
        if (!applied && canonicalFormula(c?.f) !== canonicalFormula(expected)) {
          add(
            'formula_changed',
            'warning',
            'formula',
            cellKey(sheet, cell),
            bi(
              'صيغة أصلية تغيرت أو استبدلت بقيمة',
              'Template formula changed or replaced by a value'
            ),
            bi(
              'قارن الصيغة المستوردة بالصيغة المرجعية. إعادة الحساب في التطبيق مستقلة عن النتيجة المخزنة.',
              'Compare the imported and reference formulas. App calculations are independent of cached workbook results.'
            ),
            [cellKey(sheet, cell)],
            c?.f || show(c?.v),
            expected
          );
        }
      }
  }
  for (const [cell, ar, en] of META) {
    const v = value(doc, ss, cell);
    if (v === null || String(v).trim() === '') {
      add(
        'metadata',
        'error',
        'metadata',
        cell,
        bi(`حقل ناقص: ${ar}`, `Missing field: ${en}`),
        bi(
          'أكمل الحقل من المصدر قبل اعتماد التقرير.',
          'Complete this source field before submission.'
        ),
        [cellKey(ss, cell)],
        '—',
        en
      );
    }
  }
  if (!['available', 'no cases', 'not applicable'].includes(status))
    add(
      'metadata',
      'error',
      'metadata',
      'status',
      bi('حالة بيانات غير معروفة', 'Unknown data status'),
      bi(
        'اختر إحدى الحالات الموجودة في النموذج.',
        'Select a status supported by the template.'
      ),
      [cellKey(ss, 'B5')],
      show(value(doc, ss, 'B5')),
      'Available / No cases / Not Applicable'
    );
  if (!MONTHS.some(m => clean(m) === clean(value(doc, ss, 'C11'))))
    add(
      'metadata',
      'error',
      'metadata',
      'month',
      bi('شهر غير مقبول في النموذج', 'Invalid reporting month'),
      bi(
        'استخدم اختصار الشهر من القائمة الأصلية.',
        'Use the original month selection.'
      ),
      [cellKey(ss, 'C11')],
      show(value(doc, ss, 'C11')),
      MONTHS.join(', ')
    );
  const facilityTypes = ['Medical City', 'General', 'Specilaized', 'Maternity', 'Pedia', 'other'];
  const facilityType = value(doc, ss, 'C15');
  if (facilityType != null && clean(facilityType) !== '' &&
      !facilityTypes.some(type => clean(type) === clean(facilityType)))
    add(
      'metadata', 'error', 'metadata', 'facility-type',
      bi('نوع المنشأة غير مقبول', 'Invalid facility type'),
      bi('اختر نوع المنشأة من خيارات النموذج.', 'Choose a facility type supported by the template.'),
      [cellKey(ss, 'C15')], show(facilityType), facilityTypes.join(' / ')
    );
  const yr = read(ss, 'C12');
  if (yr !== null && (!Number.isInteger(yr) || yr < 2025 || yr > 2027))
    add(
      'metadata',
      'warning',
      'metadata',
      'year',
      bi(
        'السنة خارج قائمة النسخة الأصلية',
        'Year outside the original template list'
      ),
      bi(
        'قائمة هذا النموذج 2025–2027؛ تحقق من استخدام الإصدار المناسب للفترة.',
        'This template lists 2025–2027. Verify the template version for the reporting period.'
      ),
      [cellKey(ss, 'C12')],
      show(yr),
      '2025, 2026, 2027'
    );
  if (value(doc, ss, 'C12') != null && yr === null)
    add(
      'metadata',
      'error',
      'metadata',
      'year-invalid',
      bi('السنة ليست رقمًا صحيحًا', 'Reporting year is not numeric'),
      bi('أدخل سنة صحيحة.', 'Enter a numeric reporting year.'),
      [cellKey(ss, 'C12')],
      show(value(doc, ss, 'C12')),
      '2025–2027'
    );
  for (const cell of ['C17', 'C24', 'C25', 'C27']) {
    const flag = clean(value(doc, ss, cell));
    if (!['yes', 'no', ''].includes(flag))
      add(
        'metadata',
        'error',
        'metadata',
        `flag:${cell}`,
        bi('قيمة اعتماد غير مقبولة', 'Invalid review flag'),
        bi('القيم المدعومة YES أو NO.', 'Supported values are YES or NO.'),
        [cellKey(ss, cell)],
        show(value(doc, ss, cell)),
        'YES / NO'
      );
    if (flag === 'no')
      add(
        'readiness',
        'warning',
        'metadata',
        cell,
        bi('إدخال أو مراجعة غير مكتملة', 'Entry or review is incomplete'),
        bi(
          'هذا الاعتماد لم يكتمل وفق الحقل الأصلي.',
          'This submission prerequisite is incomplete in the source.'
        ),
        [cellKey(ss, cell)],
        'NO',
        'YES'
      );
  }
  const email = String(value(doc, ss, 'C10') || '');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    add(
      'metadata',
      'warning',
      'metadata',
      'email',
      bi('صيغة البريد تحتاج مراجعة', 'Check email format'),
      bi('تحقق من عنوان التواصل.', 'Verify the contact email.'),
      [cellKey(ss, 'C10')],
      email,
      'name@example.org'
    );
  const phone = String(value(doc, ss, 'C9') || '');
  if (
    phone &&
    (/^5\d{8}$/.test(phone) ||
      (number(phone) === null && !/^[+\d\s()\-٠-٩]{7,20}$/.test(phone)))
  )
    add(
      'metadata',
      'warning',
      'metadata',
      'phone',
      bi('رقم التواصل يحتاج مراجعة', 'Check contact phone'),
      bi(
        'قد يكون الصفر الأول قد فُقد بسبب تخزين الهاتف كرقم. احتفظ بأرقام التواصل كنص.',
        'A leading zero may have been lost because the phone was stored as a number. Store contact numbers as text.'
      ),
      [cellKey(ss, 'C9')],
      phone,
      'Verified phone as text'
    );
  if (
    clean(value(doc, ss, 'C8')) &&
    clean(value(doc, ss, 'C8')) === clean(value(doc, ss, 'C26'))
  )
    add(
      'reviewers',
      'error',
      'metadata',
      'same',
      bi(
        'جامع البيانات والمراجع السريري شخص واحد',
        'Collector and clinical auditor are the same'
      ),
      bi(
        'تعليمات النموذج تنص على أن جامع البيانات والمراجع السريري لا يكونان الشخص نفسه.',
        'The template explicitly requires the data collector and clinical audit staff to be different people.'
      ),
      [cellKey(ss, 'C8'), cellKey(ss, 'C26')],
      show(value(doc, ss, 'C8')),
      'Different reviewers'
    );
  const fac = String(value(doc, ss, 'C14') || ''),
    code = String(value(doc, ss, 'C16') || '').trim();
  if (code && fac && !fac.trim().toLowerCase().startsWith(code.toLowerCase()))
    add(
      'metadata',
      'warning',
      'metadata',
      'facility-code',
      bi('رمز المنشأة لا يطابق بداية الاسم', 'Facility code and name differ'),
      bi('راجع رمز المنشأة في المصدر.', 'Verify the source facility code.'),
      [cellKey(ss, 'C14'), cellKey(ss, 'C16')],
      code,
      fac
    );
  for (const sec of SECTIONS) {
    sec.rows.forEach((row, i) => {
      if (sec.sheet !== pk) {
        const actual = value(doc, sec.sheet, `G${row}`),
          expected =
            sec.sheet === ad ? ['AICU', 'PICU', 'NICU', 'Ward'][i] : i + 1;
        if (
          sec.sheet === ad
            ? ![clean(expected), ...(i === 0 ? ['aucu'] : [])].includes(
                clean(actual)
              )
            : number(actual) !== expected
        ) {
          schemaValid = false;
          add(
            'ctas',
            'error',
            'structure',
            `${sec.sheet}:${row}`,
            bi(
              'مستوى أو وجهة لا يطابق الصف المتوقع',
              'Row level or destination does not match template'
            ),
            bi(
              'راجع التكرار وترتيب الصفوف. لا تُحسب المؤشرات قبل تصحيح الربط.',
              'Check duplicate keys and row ordering. KPIs are withheld until rows are correctly mapped.'
            ),
            [cellKey(sec.sheet, `G${row}`)],
            show(actual),
            String(expected)
          );
        }
      }
      for (const [col, scell] of [
          ['A', 'C11'],
          ['B', 'C12'],
          ['C', 'C13'],
          ['D', 'C14'],
          ['E', 'C16'],
          ['F', 'C15'],
        ]) {
          const c = originalCell(doc, sec.sheet, `${col}${row}`),
            input = value(doc, sec.sheet, `${sec.cols[0]}${row}`);
          if (input == null || (doc.mode !== 'import' && !c)) continue;
          if (c?.v == null || c.v === '')
            add(
              'period',
              'warning',
              'metadata',
              `${sec.sheet}:${col}${row}`,
              bi(
                'بيانات ربط غير مخزنة أو فارغة',
                'Missing or uncached row metadata'
              ),
              bi(
                'تحقق من تحديث صيغ الشهر والمنشأة في Excel. يستخدم التطبيق بيانات الملخص.',
                'Verify row metadata formula refresh in Excel. The app uses Summary fields.'
              ),
              [cellKey(sec.sheet, `${col}${row}`)],
              '—',
              show(value(doc, ss, scell))
            );
          else if (clean(c.v) !== clean(value(doc, ss, scell))) {
            const linked = [
              `'Summary Sheet'!${scell}`, `Summary Sheet!${scell}`,
            ].some(f => canonicalFormula(c.f) === canonicalFormula(f));
            const stale = linked && changed(ss, scell) &&
              clean(c.v) === clean(originalCell(doc, ss, scell)?.v);
            add(
              'period',
              stale ? 'warning' : 'error',
              'metadata',
              `${sec.sheet}:${col}${row}`,
              stale ? bi('قيمة ربط مخزنة تحتاج تحديثًا بعد التعديل', 'Cached row metadata needs refresh after amendment') : bi(
                'اختلاف الفترة أو المنشأة بين الأوراق',
                'Cross-sheet period or facility mismatch'
              ),
              stale ? bi(
                'يربط هذا الحقل بملخص عُدّل داخل المراجعة. حدّث الصيغ في Excel قبل الاعتماد؛ القيمة المخزنة لم تتغير.',
                'This field links to an amended Summary value. Refresh formulas in Excel before submission; the stored value has not changed.'
              ) : bi(
                'لا تدمج بيانات أشهر أو منشآت مختلفة. راجع قيمة الصف وملخص الملف.',
                'Do not combine different reporting periods or facilities. Check the row and Summary values.'
              ),
              [cellKey(sec.sheet, `${col}${row}`), cellKey(ss, scell)],
              show(c.v),
              show(value(doc, ss, scell))
            );
          }
        }
    });
  }
  const totals = Object.fromEntries(
    SECTIONS[0].cols.map(c => [c, totalCol(ed, c, [2, 3, 4, 5, 6])])
  );
  const treating = Object.fromEntries(
    'HIJK'.split('').map(c => [c, totalCol(tt, c, [2, 3, 4, 5, 6])])
  );
  const patients = totals.H;
  const reconciliation = [];
  for (let row = 2; row <= 6; row++) {
    const h = validRead(ed, `H${row}`),
      outcomes = totalRow(ed, row, 'LMNOPQRSTU'.split('')),
      bands = totalRow(tt, row, 'HIJK'.split(''));
    reconciliation.push({
      level: row - 1,
      patients: h,
      outcomes,
      bands,
      difference: h !== null && outcomes !== null ? outcomes - h : null,
      bandDifference: h !== null && bands !== null ? bands - h : null,
    });
    if (h !== null && outcomes !== null) {
      checks.push({
        rule: 'outcomes',
        pass: h === outcomes,
        ref: `CTAS ${row - 1}`,
      });
      if (h !== outcomes)
        add(
          'outcomes',
          'error',
          'reconciliation',
          row,
          bi(
            `وجهات المغادرة لا تطابق المرضى: CTAS ${row - 1}`,
            `Disposition count mismatch: CTAS ${row - 1}`
          ),
          bi(
            'مجموع الوفيات والخروج والتنويم والإحالات يجب أن يطابق إجمالي المرضى في المستوى نفسه. لا يكفي تطابق الإجمالي العام.',
            'Deaths, discharges, admissions and referrals must reconcile to patients at the same CTAS level. A matching grand total alone is insufficient.'
          ),
          [cellKey(ed, `H${row}`), `${ed}!L${row}:U${row}`],
          String(outcomes),
          String(h)
        );
    }
    if (h !== null && bands !== null) {
      checks.push({
        rule: 'treatment',
        pass: h === bands,
        ref: `CTAS ${row - 1}`,
      });
      if (h !== bands)
        add(
          'treatment',
          bands > h ? 'error' : 'warning',
          'reconciliation',
          row,
          bi(
            `فترات البقاء لا تطابق عدد المرضى: CTAS ${row - 1}`,
            `Treatment-band count mismatch: CTAS ${row - 1}`
          ),
          bi(
            'راجع التغطية والاستبعادات لكل مستوى. النقص قد يرتبط بالمجتمع المستخدم؛ لا يعتبر مؤكدًا دون توضيح.',
            'Verify completeness and exclusions by level. A shortfall may reflect cohort selection and requires clarification.'
          ),
          [cellKey(ed, `H${row}`), `${tt}!H${row}:K${row}`],
          String(bands),
          String(h)
        );
    }
    if (
      h === 0 &&
      SECTIONS[0].cols.slice(1).some(c => (read(ed, `${c}${row}`) ?? 0) > 0)
    )
      add(
        'zero_activity',
        'error',
        'reconciliation',
        row,
        bi(
          `نشاط مع صفر مرضى: CTAS ${row - 1}`,
          `Activity with zero patients: CTAS ${row - 1}`
        ),
        bi(
          'توجد دقائق أو وجهات مغادرة موجبة في صف عدد مرضاه صفر.',
          'Positive time or disposition counts exist in a row with zero patients.'
        ),
        [`${ed}!H${row}:U${row}`],
        'Positive activity',
        '0'
      );
    const duration = sum(
      nums(
        ed,
        ['I', 'J', 'K'].map(c => `${c}${row}`)
      )
    );
    const bn = nums(
      tt,
      ['H', 'I', 'J', 'K'].map(c => `${c}${row}`)
    );
    if (duration !== null && bn.every(x => x !== null) && h === bands) {
      const lower = bn[1] * 240 + bn[2] * 720 + bn[3] * 1440;
      const upper = bn[0] * 240 + bn[1] * 720 + bn[2] * 1440;
      if (
        duration < lower ||
        (lower > 0 && duration === lower) ||
        (bn[3] === 0 && duration > upper)
      )
        add(
          'time_bounds',
          'warning',
          'reconciliation',
          row,
          bi(
            `إجمالي الدقائق لا يتفق مع فترات البقاء: CTAS ${row - 1}`,
            `Total minutes conflict with time bands: CTAS ${row - 1}`
          ),
          bi(
            'فحص مشروط بأن المراحل الزمنية والفترات تغطي المرضى أنفسهم. تأكد أن I وJ وK إجمالي دقائق وليست متوسطات.',
            'This check assumes the same patient cohort for stage totals and treatment bands. Verify I, J and K are summed minutes, not averages.'
          ),
          [`${ed}!I${row}:K${row}`, `${tt}!H${row}:K${row}`],
          String(duration),
          `${lower > 0 ? '>' : '≥'}${lower}${bn[3] === 0 ? `; ≤${upper}` : ''} minutes`
        );
    }
  }
  const admissions = ['O', 'P', 'Q', 'R'].map((col, i) => ({
    type: ['AICU', 'PICU', 'NICU', 'Ward'][i],
    ed: totals[col],
    bands: totalRow(ad, i + 2, 'HIJK'.split('')),
    row: i + 2,
  }));
  for (const a of admissions)
    if (a.ed !== null && a.bands !== null) {
      checks.push({ rule: 'admission', pass: a.ed === a.bands, ref: a.type });
      if (a.ed !== a.bands)
        add(
          'admission',
          'error',
          'reconciliation',
          a.type,
          bi(
            `عدم تطابق التنويم: ${a.type}`,
            `Admission count mismatch: ${a.type}`
          ),
          bi(
            'مجموع فترات التنويم لكل نوع يجب أن يطابق عدد التنويم للنوع نفسه في إحصاءات الطوارئ.',
            'Time bands for each admission destination must reconcile to that destination in ED statistics.'
          ),
          [
            `${ad}!H${a.row}:K${a.row}`,
            `${ed}!${'OPQR'[a.row - 2]}2:${'OPQR'[a.row - 2]}6`,
          ],
          String(a.bands),
          String(a.ed)
        );
    }
  if (
    inactive &&
    SECTIONS.some(sec =>
      sec.rows.some(r =>
        sec.cols.some(c => (read(sec.sheet, `${c}${r}`) ?? 0) > 0)
      )
    )
  )
    add(
      'zero_activity',
      'error',
      'metadata',
      'status',
      bi(
        'نشاط موجب مع حالة عدم وجود بيانات',
        'Positive activity conflicts with data status'
      ),
      bi(
        'الحالة No cases أو Not Applicable لا تتفق مع وجود أعداد أو دقائق موجبة.',
        'No cases / Not Applicable conflicts with positive patient counts or minutes.'
      ),
      [cellKey(ss, 'B5')],
      show(value(doc, ss, 'B5')),
      'Zero activity'
    );
  const painCount = totalRow(pk, 3, 'HIJK'.split('')),
    painTime = validRead(pk, 'G3', true);
  if (painCount !== null && painCount > 0 && painTime === 0)
    add(
      'pain_zero',
      'warning',
      'data',
      'zero',
      bi(
        'انتظار المسكن صفر مع وجود مرضى',
        'Zero pain waiting time with patients'
      ),
      bi(
        'قد يكون الصفر صحيحًا عند الإعطاء الفوري، أو قيمة افتراضية. تحقق من القياس بدل اعتباره خطأً مؤكدًا.',
        'Zero may represent immediate administration or a default value. Verify the measurement before treating it as an error.'
      ),
      [`${pk}!G3:K3`],
      `0 minutes; ${painCount} patients`,
      'Verified mean or median'
    );
  if (painCount !== null && patients !== null && painCount > patients)
    add(
      'pain_scope',
      'error',
      'reconciliation',
      'population',
      bi(
        'حالات المسكن تتجاوز إجمالي المرضى',
        'Pain patients exceed ED patients'
      ),
      bi(
        'فئات الانتظار تعد مرضى، فلا تتجاوز إجمالي مجتمع الطوارئ للفترة نفسها.',
        'Waiting-time bands count patients and cannot exceed the same-period ED population.'
      ),
      [`${pk}!H3:K3`, `${ed}!H2:H6`],
      String(painCount),
      `≤${patients}`
    );
  if (painCount === 0 && painTime !== null && painTime > 0)
    add(
      'zero_activity',
      'warning',
      'data',
      'pain-time',
      bi(
        'زمن مسكن موجب دون مرضى مسجلين',
        'Pain waiting time without recorded patients'
      ),
      bi(
        'راجع مجتمع قياس المسكن والفئات الزمنية.',
        'Verify the pain-management cohort and time bands.'
      ),
      [`${pk}!G3:K3`],
      String(painTime),
      '0 patients / unavailable mean'
    );
  for (const col of ['L', 'M', 'N'])
    if (painCount === 0 && (read(pk, `${col}3`) ?? 0) > 0)
      add(
        'pain_scope',
        'warning',
        'reconciliation',
        `prescription:${col}`,
        bi(
          'وصفات بيثيدين دون حالات في فترات المسكن',
          'Pethidine prescriptions without pain-band patients'
        ),
        bi(
          'راجع نطاق الحالتين. الوصفات قد تتكرر للمريض ولا تجمع كأعداد مرضى فريدة.',
          'Verify the scope of both populations. Prescriptions may repeat for a patient and are not summed as unique patients.'
        ),
        [`${pk}!${col}3`, `${pk}!H3:K3`],
        show(value(doc, pk, `${col}3`)),
        'Verified population'
      );
  {
    for (const [sheet, columns, t] of [
      [ed, SECTIONS[0].cols, totals],
      [tt, SECTIONS[1].cols, treating],
    ])
      for (const col of columns) {
        const c = originalCell(doc, sheet, `${col}7`),
          expected = t[col];
        if (doc.mode !== 'import' && !c) continue;
        const corrected = Object.hasOwn(doc.formulaEdits || {}, cellKey(sheet, `${col}7`));
        const stale = !corrected && changedColumn(sheet, col);
        const originalInputs = [2, 3, 4, 5, 6].map(row => number(originalCell(doc, sheet, `${col}${row}`)?.v));
        const originalTotal = originalInputs.every(n => n !== null && n >= 0 && n <= 1000000 && Number.isInteger(n))
          ? originalInputs.reduce((a, b) => a + b, 0) : null;
        const originalCached = number(c?.v);
        const originalMismatch = originalTotal !== null &&
          !(originalCached === null && originalTotal === 0 && c?.f) &&
          (originalCached === null || !close(originalCached, originalTotal));
        if (stale && originalMismatch)
          add('totals', originalCached === null ? 'warning' : 'error', 'formula', `original:${sheet}:${col}`,
            originalCached === null
              ? bi('إجمالي المصدر الأصلي غير متاح قبل التعديل', 'Original source total was unavailable before amendment')
              : bi('إجمالي المصدر الأصلي غير صحيح قبل التعديل', 'Original source total was incorrect before amendment'),
            bi('هذه مخالفة مثبتة في الملف الأصلي وتبقى منفصلة عن حاجة النسخة المعدلة لإعادة الحساب.',
              'This discrepancy existed in the source before editing and is separate from the amended result needing recalculation.'),
            [cellKey(sheet, `${col}7`), `${sheet}!${col}2:${col}6`], show(c?.v), show(originalTotal));

        if (expected === null && !stale) continue;
        const cached = number(value(doc, sheet, `${col}7`));
        if (!stale && cached === null && expected === 0 && c?.f) continue;
        if (stale || cached === null || !close(cached, expected))
          add(
            'totals',
            stale || cached === null ? 'warning' : 'error',
            'formula',
            `${sheet}:${col}`,
            stale ? bi('إجمالي مخزن يحتاج تحديثًا بعد تعديل مدخلاته', 'Stored total needs refresh after input amendment') : bi(
              'إجمالي مخزن يختلف عن إعادة الحساب',
              'Stored total differs from recomputation'
            ),
            stale ? bi(
              'تغيرت مدخلات هذا الإجمالي في نسخة المراجعة. أعد الحساب أو طبّق التصحيح المتاح؛ لا تزال القيمة الأصلية مخزنة كما هي.',
              'Inputs to this total changed in the audit copy. Recalculate or apply an available correction; the original stored value remains unchanged.'
            ) : bi(
              'الحساب المباشر من خلايا الإدخال هو المعروض هنا. افتح Excel وراجع الصيغة وحدث الحساب.',
              'The app displays an independent recomputation from input cells. Review and recalculate the source workbook in Excel.'
            ),
            [cellKey(sheet, `${col}7`), `${sheet}!${col}2:${col}6`],
            show(c?.v),
            show(expected)
          );
      }
  }
  const canCalculate = schemaValid && patients !== null && patients > 0;
  const ratio = (a, b) =>
    a !== null && b !== null && b > 0 ? (a / b) * 100 : null;
  const minutes = c =>
    canCalculate && totals[c] !== null ? totals[c] / patients : null;
  const nonurgent = sum(nums(ed, ['H5', 'H6']));
  const deducted = sum(
    nums(ed, ['O5', 'P5', 'Q5', 'R5', 'S5', 'O6', 'P6', 'Q6', 'R6', 'S6'])
  );
  const discharges = sum(['L', 'M', 'N', 'T', 'U'].map(c => totals[c]));
  const excluded = sum(['L', 'M', 'N'].map(c => totals[c]));
  if (canCalculate) {
    add(
      'four_hour',
      'warning',
      'definition',
      'cohort',
      bi(
        'مؤشر الأربع ساعات: الاستبعادات غير مفصّلة',
        'Four-hour KPI: exclusions are not detailed'
      ),
      bi(
        `التعريف B8 يستبعد DAMA وLAMA والمشرحة، بينما H20 يقسم على جميع المرضى. مجموع الوفيات وDAMA وLAMA = ${show(excluded)}. لا توجد أعداد هؤلاء داخل كل فئة زمنية، لذلك لا يمكن استخراج نسبة مصححة بدقة. كذلك التعريف <4 ساعات والعنوان within 4 hours.`,
        `B8 excludes DAMA, LAMA and morgue, while H20 divides by all patients. Deaths + DAMA + LAMA = ${show(excluded)}. Exclusions within each time band are unavailable, so an exact corrected rate cannot be derived. The definition also says <4 hours while the heading says within 4 hours.`
      ),
      [`${ss}!H20`, 'ED KPIs Definitions!B8', `${tt}!H2:K6`],
      `${show(treating.H)} / ${patients}`,
      'Confirm eligible numerator, denominator and 4-hour boundary'
    );
    add(
      'mortality',
      'warning',
      'definition',
      'denominator',
      bi(
        'مقام الوفيات في الملخص مختلف عن التعريف',
        'Mortality denominator differs from definition'
      ),
      bi(
        `H22 يستخدم كل المرضى، والتعريف B10 يستخدم كل حالات الخروج. تعرض المقارنة مقام الخروج وفق أنواع B8 (وفيات + DAMA + LAMA + منزل + نقل) = ${show(discharges)}، مع فصل UCC لعدم ذكره في ذلك التعريف. يلزم اعتماد النطاق محليًا.`,
        `H22 uses all ED patients; B10 specifies ED discharges. The comparison uses B8 discharge categories (deaths + DAMA + LAMA + home + transfer) = ${show(discharges)}, with UCC separate because B8 does not name it. Confirm the local scope.`
      ),
      [`${ss}!H22`, 'ED KPIs Definitions!B8:B10'],
      `${show(totals.L)} / ${patients}`,
      `${show(totals.L)} / ${show(discharges)}`
    );
    if (
      canonicalFormula(
        effectiveFormula(doc, ss, 'H19') || TEMPLATE.formulas[ss].H19
      ).includes('O5:S6')
    )
      add(
        'nonurgent',
        'warning',
        'definition',
        'formula',
        bi(
          'صيغة غير العاجل تخصم حالات غير مذكورة بالتعريف',
          'Non-urgent formula subtracts cases absent from definition'
        ),
        bi(
          'التعريف B7 هو جميع مرضى CTAS 4 و5 على الإجمالي. صيغة H19 تخصم O5:S6 من البسط؛ تظهر القيمتان للمقارنة.',
          'B7 defines all CTAS 4 and 5 patients divided by total patients. H19 subtracts O5:S6 from the numerator; both results are shown for comparison.'
        ),
        [`${ss}!H19`, 'ED KPIs Definitions!B7'],
        `${show(nonurgent)} − ${show(deducted)}`,
        `${show(nonurgent)} / ${patients}`
      );
  }
  if (painCount !== null && painCount > 0)
    add(
      'pain_statistic',
      'warning',
      'definition',
      'method',
      bi(
        'لم يُحدد هل زمن المسكن متوسط أم وسيط',
        'Pain waiting time is not identified as mean or median'
      ),
      bi(
        'حقل G2 يسمح بالمتوسط أو الوسيط دون تحديد المستخدم. لا يمكن إعادة حسابه من الفئات الشهرية أو التحقق من مجتمع مرضى الأنيميا المنجلية دون تفاصيل الحالات.',
        'G2 allows an average or median without identifying the statistic. Neither can be recomputed from monthly bands, and sickle-cell cohort eligibility cannot be verified without case-level details.'
      ),
      [`${pk}!G2:G3`, 'ED KPIs Definitions!B11'],
      show(painTime),
      'Verify statistic and sickle-cell inclusion'
    );
  const kpis = [
    {
      id: 1,
      row: 4,
      title: bi('الوصول إلى الطبيب', 'Door to doctor'),
      unit: 'min',
      value: minutes('I'),
      workbook: minutes('I'),
      formula: `${show(totals.I)} ÷ ${show(patients)}`,
      refs: [`${ed}!I2:I6`, `${ed}!H2:H6`],
    },
    {
      id: 2,
      row: 5,
      title: bi('الطبيب إلى القرار', 'Doctor to decision'),
      unit: 'min',
      value: minutes('J'),
      workbook: minutes('J'),
      formula: `${show(totals.J)} ÷ ${show(patients)}`,
      refs: [`${ed}!J2:J6`, `${ed}!H2:H6`],
    },
    {
      id: 3,
      row: 6,
      title: bi('القرار إلى المغادرة', 'Decision to disposition'),
      unit: 'min',
      value: minutes('K'),
      workbook: minutes('K'),
      formula: `${show(totals.K)} ÷ ${show(patients)}`,
      refs: [`${ed}!K2:K6`, `${ed}!H2:H6`],
    },
    {
      id: 4,
      row: 7,
      title: bi('المرضى غير العاجلين', 'Non-urgent patients'),
      unit: '%',
      value: canCalculate ? ratio(nonurgent, patients) : null,
      workbook:
        canCalculate && nonurgent !== null && deducted !== null
          ? ratio(nonurgent - deducted, patients)
          : null,
      formula: `${show(nonurgent)} ÷ ${show(patients)} × 100`,
      refs: [`${ed}!H5:H6`, `${ss}!H19`],
      caveat: bi(
        'حسب تعريف B7؛ صيغة الملف قد تخصم حالات.',
        'B7 definition; workbook formula may subtract cases.'
      ),
    },
    {
      id: 5,
      row: 8,
      title: bi('المغادرة خلال ٤ ساعات', 'Disposition within 4 hours'),
      unit: '%',
      value: null,
      workbook: canCalculate ? ratio(treating.H, patients) : null,
      formula: `${show(treating.H)} ÷ ${show(patients)} × 100`,
      refs: [`${tt}!H2:H6`, `${ss}!H20`],
      caveat: bi(
        'قيمة الملف قبل التحقق من الاستبعادات؛ النسبة المطابقة للتعريف غير متاحة.',
        'Workbook result before exclusion validation; definition-compliant rate unavailable.'
      ),
    },
    {
      id: 6,
      row: 9,
      title: bi('المغادرة والخروج ضد المشورة', 'LAMA or DAMA dispositions'),
      unit: '%',
      value: canCalculate ? ratio(sum([totals.M, totals.N]), patients) : null,
      workbook: canCalculate
        ? ratio(sum([totals.M, totals.N]), patients)
        : null,
      formula: `(${show(totals.M)} + ${show(totals.N)}) ÷ ${show(patients)} × 100`,
      refs: [`${ed}!M2:N6`],
    },
    {
      id: 7,
      row: 10,
      title: bi('معدل الوفيات', 'Mortality rate'),
      unit: '%',
      value: canCalculate ? ratio(totals.L, discharges) : null,
      workbook: canCalculate ? ratio(totals.L, patients) : null,
      formula: `${show(totals.L)} ÷ ${show(discharges)} × 100`,
      refs: [`${ed}!L2:L6`, `${ss}!H22`],
      caveat: bi(
        'مقام الخروج وفق B8؛ يحتاج اعتماد نطاق الخروج.',
        'Discharge denominator per B8; scope requires confirmation.'
      ),
    },
    {
      id: 8,
      row: 11,
      title: bi('الوصول إلى المسكن', 'Door to pain killer'),
      unit: 'min',
      value: schemaValid && painCount > 0 ? painTime : null,
      workbook: schemaValid && painCount > 0 ? painTime : null,
      formula: `${pk}!G3`,
      refs: [`${pk}!G3`],
      caveat: bi(
        'قيمة مدخلة، وليست متوسطًا أعيد حسابه.',
        'Entered statistic, not a recomputed mean.'
      ),
    },
  ];
  const cacheDependencies = [
    [['ED_Statistics', 'HI', [2, 3, 4, 5, 6]]],
    [['ED_Statistics', 'HJ', [2, 3, 4, 5, 6]]],
    [['ED_Statistics', 'HK', [2, 3, 4, 5, 6]]],
    [['ED_Statistics', 'H', [2, 3, 4, 5, 6]], ['ED_Statistics', 'OPQRS', [5, 6]]],
    [['ED_Statistics', 'H', [2, 3, 4, 5, 6]], ['Treating_Times', 'H', [2, 3, 4, 5, 6]]],
    [['ED_Statistics', 'HMN', [2, 3, 4, 5, 6]]],
    [['ED_Statistics', 'HL', [2, 3, 4, 5, 6]]],
    [['DtoPK', 'GHIJK', [3]]],
  ];
  if (canCalculate)
    for (const [i, cell] of [
      'H16',
      'H17',
      'H18',
      'H19',
      'H20',
      'H21',
      'H22',
      'H23',
    ].entries()) {
      if (Object.hasOwn(doc.formulaEdits || {}, cellKey(ss, cell))) continue;
      const source = originalCell(doc, ss, cell);
      if (doc.mode !== 'import' && !source) continue;
      const stale = cacheDependencies[i].some(([sheet, cols, rows]) =>
        [...cols].some(col => rows.some(row => changed(sheet, `${col}${row}`))));
      const cached = number(source?.v),
        kpi = kpis[i],
        expected = kpi.workbook;
      if (expected === null && !stale) continue;
      const converted =
        cached === null ? null : cached * (kpi.unit === 'min' ? 1440 : 100);
      if (stale || converted === null || !close(converted, expected, 0.002))
        add(
          'cache',
          'warning',
          'formula',
          cell,
          stale ? bi('نتيجة ملخص مخزنة تحتاج تحديثًا بعد تعديل مدخلاتها', 'Cached summary needs refresh after input amendment') : bi(
            'قيمة ملخص مخزنة لا تطابق إعادة الحساب',
            'Cached summary differs from recomputed value'
          ),
          stale ? bi(
            'تغيرت مدخلات هذا المؤشر في نسخة المراجعة. النتيجة المخزنة من المصدر تحتاج إعادة حساب؛ يعرض التقرير الحساب الحالي مستقلًا عنها.',
            'Inputs to this KPI changed in the audit copy. The stored source result needs recalculation; the report shows the current independent calculation.'
          ) : bi(
            'افتح المصدر في Excel وأعد الحساب. لا يعتمد التقرير على ذاكرة الصيغ المخزنة.',
            'Open the source in Excel and recalculate. This report does not rely on cached summary values.'
          ),
          [cellKey(ss, cell)],
          show(converted),
          show(expected)
        );
    }
  for (const k of kpis) {
    k.corrected = k.id === 4 && Object.hasOwn(doc.formulaEdits || {}, `${ss}!H19`);
    if (k.corrected) k.caveat = bi(
      'طُبقت صيغة B7 في نسخة المراجعة. تظهر صيغة الملف الأصلي للمقارنة.',
      'B7 formula applied to the audit copy. The original template result remains for comparison.'
    );
    k.reference = TEMPLATE.definitions.find(d => d.row === k.row);
    k.grade =
      definitionChanged || k.value === null
        ? 'unavailable'
        : benchmarkGrade(k.row, k.value);
    k.definitionChanged = definitionChanged;
  }
  const errors = issues.filter(i => i.severity === 'error').length;
  const warnings = issues.filter(i => i.severity === 'warning').length;
  return {
    issues,
    checks,
    totals,
    treating,
    patients: schemaValid ? patients : null,
    reconciliation,
    admissions,
    kpis,
    schemaValid,
    definitionChanged,
    errors,
    warnings,
    reviewed: issues.filter(
      i => doc.reviews[i.reviewKey]?.status === 'reviewed'
    ).length,
    scope: bi(
      'يمكن فحص الاتساق الحسابي والاكتمال والتعاريف من هذا الملف. لا يمكن إثبات التكرار أو تسلسل الأوقات أو أهلية المرضى أو صحة المتوسطات من البيانات الشهرية المجمعة.',
      'This workbook supports arithmetic, completeness and definition checks. Patient duplication, timestamp order, cohort eligibility and source mean accuracy cannot be proved from monthly aggregates.'
    ),
  };
}

export function benchmarkGrade(row, v) {
  if (v === null || !Number.isFinite(v)) return 'unavailable';
  const thresholds = {
    4: [10, 20, 40],
    5: [30, 60, 90],
    6: [30, 90, 130],
    7: [33, 50, 75],
    11: [60, 180, 300],
  };
  if (row === 8) {
    if (v > 95) return 'world';
    if (v === 75) return 'boundary';
    if (v >= 75) return 'acceptable';
    if (v >= 60) return 'improve';
    return 'unacceptable';
  }
  const t = thresholds[row];
  if (!t) return 'na';
  if (v < t[0]) return 'world';
  if (v === t[1]) return 'boundary';
  if (v <= t[1]) return 'acceptable';
  if (v <= t[2]) return 'improve';
  return 'unacceptable';
}

