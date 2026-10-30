import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Download,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Filter,
  Globe2,
  History,
  LayoutDashboard,
  ListChecks,
  LoaderCircle,
  LockKeyhole,
  PanelLeftClose,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
  AlertTriangle,
  CircleAlert,
  PencilLine,
} from 'lucide-react';
import { audit, RULES } from './engine.mjs';
import { TEMPLATE } from './template.mjs';
import {
  SECTIONS,
  META,
  MONTHS,
  MONTHS_AR,
  value,
  number,
  fieldLabel,
  blankDocument,
  exampleDocument,
  amend,
  validateBackup,
  cellKey,
} from './model.mjs';
import { parseFile } from './parser.mjs';
import { exportAmendedXlsx } from './export-xlsx.mjs';
import { possibleCorrections, activeCorrections, applyCorrection, undoCorrection } from './corrections.mjs';
import { formulaValue } from './model.mjs';
import './corrections.css';

const STORAGE = 'miyar-ed-workspace-v1';

// Keep incomplete numeric text (for example 0.) visible while typing. The
// parent still receives each edit so validation and indicators stay live.
function NumericInput({ value, onChange, ...props }) {
  const [draft, setDraft] = useState(String(value ?? ''));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(String(value ?? ''));
  }, [value]);
  return <input {...props} value={draft}
    onFocus={() => { focused.current = true; }}
    onChange={event => {
      setDraft(event.target.value);
      onChange(event);
    }}
    onBlur={() => {
      focused.current = false;
      const parsed = number(draft);
      setDraft(draft === '' ? '' : parsed === null ? draft : String(parsed));
    }}
  />;
}

function inspectDocument(candidate) {
  const result = audit(candidate);
  possibleCorrections(candidate, result);
  activeCorrections(candidate);
  return candidate;
}

function restoreWorkspace() {
  try {
    const raw = localStorage.getItem(STORAGE);
    return { doc: raw ? inspectDocument(validateBackup(JSON.parse(raw))) : null, invalid: false };
  } catch {
    // Retain the original saved bytes for recovery; only an explicit user
    // action may replace or remove a saved workspace.
    return { doc: null, invalid: true };
  }
}
const gradeNames = {
  world: ['عالمي', 'World class'],
  acceptable: ['مقبول', 'Acceptable'],
  improve: ['يحتاج تحسينًا', 'Needs improvement'],
  unacceptable: ['غير مقبول', 'Unacceptable'],
  boundary: ['حد متداخل في التعريف', 'Overlapping boundary'],
  na: ['لا يوجد معيار', 'No benchmark'],
  unavailable: ['غير متاح', 'Unavailable'],
};
const categories = {
  data: ['قيم الإدخال', 'Input values'],
  reconciliation: ['المطابقات', 'Reconciliation'],
  metadata: ['البيانات والاعتماد', 'Metadata & sign-off'],
  formula: ['صيغ الملف', 'Workbook formulas'],
  definition: ['التعاريف', 'Definitions'],
  structure: ['بنية الملف', 'Workbook structure'],
};
const nav = [
  ['overview', LayoutDashboard, 'نظرة عامة', 'Overview'],
  ['findings', ListChecks, 'الأخطاء والملاحظات', 'Findings'],
  ['corrections', ClipboardCheck, 'التصحيحات الممكنة', 'Possible corrections'],
  ['data', FileSpreadsheet, 'البيانات والتعديلات', 'Data & amendments'],
  ['indicators', BarChart3, 'مؤشرات الأداء', 'Performance indicators'],
  [
    'definitions',
    BookOpen,
    'التعاريف وقواعد التحقق',
    'Definitions & audit rules',
  ],
  ['report', FileText, 'تقرير المراجعة', 'Audit report'],
];
function download(content, filename, type) {
  const blob = new Blob([content], { type });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
const csvCell = v => {
  const s = String(v ?? '');
  return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};
function exportCsv(doc, result, lang) {
  const rows = [
    [
      'Report',
      'ED Audit',
      'Language',
      lang,
      'Source',
      doc.sourceName || doc.mode,
    ],
    [
      'Reporting month',
      value(doc, 'Summary Sheet', 'C11'),
      'Year',
      value(doc, 'Summary Sheet', 'C12'),
      'Facility',
      value(doc, 'Summary Sheet', 'C14'),
    ],
    [
      'Errors',
      result.errors,
      'Warnings',
      result.warnings,
      'Original source preserved',
      'YES',
    ],
    [
      'Finding ID',
      'Severity',
      'Title (AR)',
      'Title (EN)',
      'Cells',
      'Observed',
      'Expected',
      'Details (AR)',
      'Details (EN)',
      'Rule source',
      'Review status',
      'Review note',
    ],
    ...result.issues.map(i => [
      i.id,
      i.severity,
      i.title.ar,
      i.title.en,
      i.refs.join(' | '),
      i.observed,
      i.expected,
      i.details.ar,
      i.details.en,
      i.source,
      doc.reviews[i.reviewKey]?.status || 'open',
      doc.reviews[i.reviewKey]?.note || '',
    ]),
    [],
    [
      'KPI',
      'Name (AR)',
      'Name (EN)',
      'Definition/reference value',
      'Template formula value',
      'Unit',
      'Formula',
      'Caveat (AR)',
      'Caveat (EN)',
    ],
    ...result.kpis.map(k => [
      k.id,
      k.title.ar,
      k.title.en,
      k.value,
      k.workbook,
      k.unit,
      k.formula,
      k.caveat?.ar,
      k.caveat?.en,
    ]),
    [],
    ['Scope (AR)', result.scope.ar],
    ['Scope (EN)', result.scope.en],
    [],
    ['Amendment time', 'Sheet', 'Cell', 'Before', 'After', 'Operation', 'Explanation (AR)', 'Explanation (EN)', 'Source'],
    ...doc.log.map(x => [x.at, x.sheet, x.cell, x.before, x.after,
      x.operation || 'manual', x.reason?.ar || '', x.reason?.en || '', x.source || '']),
  ];
  download(
    '\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\r\n'),
    'ED-Audit-Report.csv',
    'text/csv;charset=utf-8'
  );
}
function useLanguage() {
  const [lang, setLang] = useState(() => {
    try {
      return localStorage.getItem('miyar-ed-language') === 'en' ? 'en' : 'ar';
    } catch {
      return 'ar';
    }
  });
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    try {
      localStorage.setItem('miyar-ed-language', lang);
    } catch {
      /* Language remains usable without storage. */
    }
  }, [lang]);
  return [lang, setLang];
}

export default function Workspace() {
  const [lang, setLang] = useLanguage();
  const t = (ar, en) => (lang === 'ar' ? ar : en);
  const label = pair => pair[lang === 'ar' ? 0 : 1];
  const [restored] = useState(restoreWorkspace);
  const [doc, setDoc] = useState(restored.doc);
  const [saved, setSaved] = useState(!!doc);
  const [view, setView] = useState('overview');
  const [autoSave, setAutoSave] = useState(false);
  const exportRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(restored.invalid ? t(
    'تعذر استعادة المراجعة المحفوظة. لم تُحذف النسخة المحفوظة؛ يمكنك استيراد نسخة سليمة أو بدء مراجعة جديدة.',
    'The saved audit could not be restored. The saved copy has not been deleted; import a valid backup or start a new audit.'
  ) : '');
  const [notice, setNotice] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [detail, setDetail] = useState(null);
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState('all');
  const [category, setCategory] = useState('all');
  const [reviewFilter, setReviewFilter] = useState('all');
  const [section, setSection] = useState('Summary Sheet');
  const [highlight, setHighlight] = useState('');
  const [definitionQuery, setDefinitionQuery] = useState('');
  const fileRef = useRef(null);
  const contentRef = useRef(null);
  const result = useMemo(() => (doc ? audit(doc) : null), [doc]);
  const corrections = useMemo(() => doc ? possibleCorrections(doc, result) : [], [doc, result]);
  const appliedCorrections = useMemo(() => doc ? activeCorrections(doc) : [], [doc]);
  const fmt = (v, digits = 0) =>
    v == null
      ? '—'
      : new Intl.NumberFormat(lang === 'ar' ? 'ar-SA' : 'en-US', {
          maximumFractionDigits: digits,
          minimumFractionDigits: digits,
        }).format(v);
  const localDate = date =>
    new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Riyadh',
      calendar: 'gregory',
    }).format(new Date(date));
  const sourceName = doc
    ? doc.mode === 'manual'
      ? t('إدخال يدوي', 'Manual entry')
      : doc.sourceName
    : '';
  const changeDoc = updater => {
    setDoc(prev => (typeof updater === 'function' ? updater(prev) : updater));
    setSaved(false);
    setAutoSave(true);
  };
  const switchView = key => {
    setView(key);
    setMenuOpen(false);
    contentRef.current?.scrollTo({ top: 0 });
  };
  useEffect(() => {
    if (!highlight || view !== 'data') return;
    const id = setTimeout(
      () =>
        document
          .querySelector('[data-highlight="true"]')
          ?.scrollIntoView({ block: 'center', behavior: 'smooth' }),
      100
    );
    return () => clearTimeout(id);
  }, [highlight, view, section]);
  useEffect(() => {
    if (!detail && !confirm) return;
    const handler = e => {
      if (e.key === 'Escape') {
        setDetail(null);
        setConfirm(null);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [detail, confirm]);
  function requestReplace(action) {
    if (doc && (doc.log.length > 0 || Object.keys(doc.reviews).length > 0))
      setConfirm({ kind: 'replace', action });
    else action();
  }
  async function importFile(file) {
    if (!file || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const next = inspectDocument(await parseFile(file));
      requestReplace(() => {
        changeDoc(next);
        setDetail(null);
        switchView('overview');
        setNotice(
          t('تم استيراد الملف وفحص بياناته.', 'Workbook imported and audited.')
        );
      });
    } catch (e) {
      const errors = {
        extension: [
          'اختر ملف Excel بصيغة .xlsx أو نسخة مراجعة .json.',
          'Choose an .xlsx workbook or .json audit backup.',
        ],
        size: [
          'حجم الملف أو محتواه أكبر من النطاق المدعوم (15 MB).',
          'File or expanded contents exceed the supported limits (15 MB file size).',
        ],
        template: [
          'هذا ليس نموذج قسم الطوارئ المدعوم. يلزم وجود Summary Sheet وED_Statistics.',
          'This is not the supported ED template. Summary Sheet and ED_Statistics are required.',
        ],
        backup: [
          'نسخة المراجعة غير صالحة أو غير متوافقة.',
          'The audit backup is invalid or incompatible.',
        ],
        xml: [
          'ملف XML داخل المصنف غير مدعوم. صدّره بصيغة Excel عادية.',
          'Unsupported workbook XML. Export a standard Excel workbook.',
        ],
        xlsx: [
          'تعذر قراءة الملف. تأكد أنه .xlsx حقيقي وغير مشفر، ثم أعد المحاولة.',
          'Unable to read the file. Use a genuine, unencrypted .xlsx workbook and try again.',
        ],
      };
      setError(label(errors[e.message] || (/\.json$/i.test(file.name) ? errors.backup : errors.xlsx)));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }
  useEffect(() => {
    if (!doc || saved || !autoSave) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE, JSON.stringify(doc));
        setSaved(true);
      } catch {
        setAutoSave(false);
        setError(t('تعذر الحفظ التلقائي. نزّل نسخة JSON للاحتفاظ بعملك.', 'Autosave failed. Download a JSON backup to keep your work.'));
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [doc, saved, autoSave, lang]);
  useEffect(() => {
    if (!doc || saved) return;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [doc, saved]);
  async function exportExcel(file) {
    if (!file || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (file.size > 15 * 1024 * 1024) throw new Error('size');
      const bytes = await exportAmendedXlsx(await file.arrayBuffer(), doc);
      download(bytes, 'ED-Audit-Amended.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      setNotice(t('نُزّلت نسخة Excel معدلة؛ الخلايا المعدلة مظللة بالأصفر. افتحها في Excel لإعادة حساب الصيغ قبل اعتمادها.',
        'Amended Excel downloaded; changed cells are yellow. Open it in Excel to recalculate formulas before submission.'));
    } catch (failure) {
      setError(failure.message === 'group_formula'
        ? t('يتداخل تعديل مع صيغة مصفوفة أو جدول بيانات. نفّذ هذا التعديل داخل Excel، واحتفظ بنسخة JSON للمراجعة.', 'An amendment overlaps an array or data-table formula. Make this change in Excel and retain a JSON audit backup.')
        : failure.message === 'source_mismatch'
        ? t('الملف المحدد لا يطابق مصدر هذه المراجعة. اختر ملف Excel الأصلي نفسه.', 'The selected workbook does not match this audit. Select the same original Excel file.')
        : t('تعذر تصدير Excel. اختر المصنف الأصلي الصحيح، وتأكد أن التعديلات تخص أوراقًا موجودة. يمكنك الاحتفاظ بنسخة JSON.', 'Could not export Excel. Select the original workbook and ensure amended sheets exist. You can retain a JSON backup.'));
    } finally {
      setBusy(false);
      if (exportRef.current) exportRef.current.value = '';
    }
  }
  function saveLocal() {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(doc));
      setSaved(true);
      setNotice(
        t(
          'حُفظت المراجعة على هذا المتصفح. يمكنك المتابعة بعد إغلاق الصفحة.',
          'Audit saved in this browser. You can resume after closing the page.'
        )
      );
    } catch {
      setError(
        t(
          'تعذر الحفظ على الجهاز. نزّل نسخة JSON للاحتفاظ بعملك.',
          'Could not save on this device. Download a JSON backup to retain your work.'
        )
      );
    }
  }
  const newDoc = demo =>
    requestReplace(() => {
      changeDoc(demo ? exampleDocument() : blankDocument());
      setDetail(null);
      setSection('Summary Sheet');
      switchView(demo ? 'overview' : 'data');
    });
  const goToCell = ref => {
    const sep = ref.lastIndexOf('!');
    const sheet = ref.slice(0, sep),
      addr = ref.slice(sep + 1).split(':')[0];
    if (sheet === 'ED KPIs Definitions') {
      switchView('definitions');
      setDetail(null);
      return;
    }
    if (sheet === 'Summary Sheet' && !META.some(m => m[0] === addr)) {
      switchView('indicators');
      setDetail(null);
      return;
    }
    if (sheet !== 'Summary Sheet' && !SECTIONS.some(s => s.sheet === sheet))
      return;
    setSection(sheet);
    setHighlight(addr);
    switchView('data');
    setDetail(null);
  };
  const edit = (sheet, cell, raw, numeric = false) => {
    const next =
      raw === '' ? null : numeric && number(raw) !== null ? number(raw) : raw;
    changeDoc(prev => amend(prev, sheet, cell, next));
  };
  const filtered =
    result?.issues.filter(
      i =>
        (severity === 'all' || i.severity === severity) &&
        (category === 'all' || i.category === category) &&
        (reviewFilter === 'all' ||
          (doc.reviews[i.reviewKey]?.status === 'reviewed'
            ? 'reviewed'
            : 'open') === reviewFilter) &&
        `${i.title.ar} ${i.title.en} ${i.details.ar} ${i.details.en} ${i.refs.join(' ')} ${i.observed}`
          .toLowerCase()
          .includes(search.toLowerCase())
    ) || [];
  const currentDetail = detail
    ? result?.issues.find(i => i.id === detail)
    : null;
  const FindingBadge = ({ issue }) => (
    <span className={`badge ${issue.severity}`}>
      {issue.severity === 'error' ? (
        <CircleAlert size={13} />
      ) : (
        <AlertTriangle size={13} />
      )}
      {issue.severity === 'error' ? t('خطأ', 'Error') : t('مراجعة', 'Review')}
    </span>
  );
  const Empty = ({ text }) => (
    <div className="empty">
      <FileSpreadsheet size={32} />
      <h3>{text || t('ابدأ بملف قسم الطوارئ', 'Start with an ED workbook')}</h3>
      <p>
        {t(
          'استورد ملف Excel أو أدخل البيانات يدويًا لعرض نتائج المراجعة.',
          'Import Excel or enter data manually to see audit results.'
        )}
      </p>
      <button
        className="button primary"
        onClick={() => fileRef.current?.click()}
      >
        <Upload size={16} />
        {t('استيراد الملف', 'Import workbook')}
      </button>
    </div>
  );
  function IssueRows({ items }) {
    return (
      <div className="finding-list">
        {items.map(i => (
          <button
            className="finding-row"
            key={i.id}
            onClick={() => setDetail(i.id)}
          >
            <span className={`finding-icon ${i.severity}`}>
              {i.severity === 'error' ? (
                <CircleAlert size={19} />
              ) : (
                <AlertTriangle size={19} />
              )}
            </span>
            <span className="finding-text">
              <span className="finding-title">{i.title[lang]}</span>
              <span className="finding-meta">
                <bdi>{i.refs.slice(0, 2).join(' · ')}</bdi>
              </span>
            </span>
            <span className="finding-end">
              <FindingBadge issue={i} />
              {doc.reviews[i.reviewKey]?.status === 'reviewed' && (
                <span className="reviewed-mark">
                  <Check size={13} />
                  {t('رُوجعت', 'Reviewed')}
                </span>
              )}
            </span>
            {lang === 'ar' ? (
              <ChevronLeft size={17} />
            ) : (
              <ChevronRight size={17} />
            )}
          </button>
        ))}
      </div>
    );
  }
  const UploadCard = ({ compact = false }) => (
    <section
      className={`upload-card ${dragging ? 'dragging' : ''} ${compact ? 'compact' : ''}`}
      onDragOver={e => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => {
        e.preventDefault();
        setDragging(false);
        importFile(e.dataTransfer.files[0]);
      }}
    >
      <div className="upload-icon">
        {busy ? (
          <LoaderCircle className="spin" size={28} />
        ) : (
          <Upload size={28} />
        )}
      </div>
      <div>
        <h3>
          {doc
            ? t('مراجعة ملف آخر', 'Audit another workbook')
            : t('ارفع ملف الطوارئ لبدء المراجعة', 'Import your ED workbook')}
        </h3>
        <p>
          {t(
            'اسحب الملف هنا أو اختره من جهازك',
            'Drag a file here or choose it from your device'
          )}
        </p>
        <span className="file-spec" dir="ltr">
          XLSX · ED V4.25 · 15 MB
        </span>
      </div>
      <button
        className="button primary"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
      >
        <FileSpreadsheet size={16} />
        {busy ? t('جارٍ الفحص…', 'Auditing…') : t('اختيار ملف', 'Choose file')}
      </button>
    </section>
  );
  function Reconciliation() {
    return (
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>CTAS</th>
              <th>{t('المرضى', 'Patients')}</th>
              <th>{t('المغادرة', 'Dispositions')}</th>
              <th>{t('فترات البقاء', 'Time bands')}</th>
              <th>{t('الحالة', 'Status')}</th>
            </tr>
          </thead>
          <tbody>
            {result.reconciliation.map(r => (
              <tr key={r.level}>
                <td>
                  <span className={`ctas ctas-${r.level}`}>{r.level}</span>
                </td>
                <td>{fmt(r.patients)}</td>
                <td>{fmt(r.outcomes)}</td>
                <td>{fmt(r.bands)}</td>
                <td>
                  {r.difference === 0 && r.bandDifference === 0 ? (
                    <span className="match">
                      <CheckCircle2 size={14} />
                      {t('متطابق', 'Matched')}
                    </span>
                  ) : (
                    <span className="mismatch">
                      {r.difference === null || r.bandDifference === null
                        ? t('ناقص', 'Incomplete')
                        : t('اختلاف', 'Mismatch')}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  function KpiCard({ k }) {
    const display = k.value ?? k.workbook;
    return (
      <article className="kpi-card">
        <div className="kpi-head">
          <span className="kpi-number">{String(k.id).padStart(2, '0')}</span>
          <span className={`badge grade-${k.grade}`}>
            {label(gradeNames[k.grade])}
          </span>
        </div>
        <h3>{k.title[lang]}</h3>
        <div className="kpi-value">
          {fmt(display, k.unit === '%' ? 2 : 1)}
          <span>{k.unit === 'min' ? t('دقيقة', 'min') : '%'}</span>
        </div>
        {k.id === 5 && (
          <span className="small-warning">
            {t('نسبة الملف قبل الاستبعادات', 'Workbook rate before exclusions')}
          </span>
        )}
        <p className="kpi-caveat">
          {k.caveat?.[lang] ||
            t(
              'حُسب من خلايا الإدخال، وفق تعريف المؤشر.',
              'Recomputed from inputs using the KPI definition.'
            )}
        </p>
        <details>
          <summary>
            {t('الحساب والمرجع', 'Calculation & source')}
            <ChevronDown size={14} />
          </summary>
          <code dir="ltr">{k.formula}</code>
          <p>
            {t('حساب صيغة النموذج', 'Template-formula calculation')}:{' '}
            <strong>
              {fmt(k.workbook, 2)} {k.unit}
            </strong>
          </p>
          {k.definitionChanged && (
            <p className="small-warning">
              {t(
                'تعاريف الملف مختلفة؛ المرجع الحسابي V4.25.',
                'Imported definitions differ; calculation reference is V4.25.'
              )}
            </p>
          )}
          <p className="source-ref" dir="ltr">
            ED KPIs Definitions!B{k.row}
          </p>
          <p>{k.reference.benchmarks.filter(Boolean).join(' · ')}</p>
        </details>
      </article>
    );
  }

  function DataEditor() {
    const sec = SECTIONS.find(s => s.sheet === section);
    return (
      <>
        <div className="section-heading">
          <div>
            <h2>
              {t('راجع القيم قبل اعتمادها', 'Review values before submission')}
            </h2>
            <p>
              {t(
                'التعديل ينشئ قيمة مراجَعة ويحتفظ بالأصل في سجل التغييرات. المؤشرات تتحدث مباشرة.',
                'Amendments retain the original in the change log. Indicators update immediately.'
              )}
            </p>
          </div>
          <span className="badge neutral">
            <History size={14} />
            {fmt(doc.log.length)} {t('تعديل', 'amendments')}
          </span>
        </div>
        <div className="section-tabs">
          <button
            className={section === 'Summary Sheet' ? 'active' : ''}
            onClick={() => {
              setSection('Summary Sheet');
              setHighlight('');
            }}
          >
            {t('بيانات الملف', 'File details')}
          </button>
          {SECTIONS.map(s => (
            <button
              key={s.sheet}
              className={section === s.sheet ? 'active' : ''}
              onClick={() => {
                setSection(s.sheet);
                setHighlight('');
              }}
            >
              {s[lang]}
            </button>
          ))}
        </div>
        {section === 'Summary Sheet' ? (
          <div className="card">
            <div className="card-heading">
              <h3>
                {t(
                  'المنشأة والفترة وبيانات الاعتماد',
                  'Facility, period and sign-off'
                )}
              </h3>
              <code dir="ltr">Summary Sheet</code>
            </div>
            <div className="metadata-grid">
              {META.map(([cell, ar, en, type]) => {
                const v = value(doc, 'Summary Sheet', cell) ?? '';
                const fieldError = result.issues.some(
                  i =>
                    i.severity === 'error' &&
                    i.refs.includes(`Summary Sheet!${cell}`)
                );
                const options =
                  type === 'yesno'
                    ? [
                        ['YES', t('نعم', 'Yes')],
                        ['NO', t('لا', 'No')],
                      ]
                    : type === 'status'
                      ? [
                          ['Available', t('متاحة', 'Available')],
                          ['No cases', t('لا توجد حالات', 'No cases')],
                          ['Not Applicable', t('غير منطبق', 'Not applicable')],
                        ]
                      : type === 'month'
                        ? MONTHS.map((m, i) => [
                            m,
                            lang === 'ar' ? MONTHS_AR[i] : m,
                          ])
                        : type === 'facility'
                          ? [
                              'Medical City',
                              'General',
                              'Specilaized',
                              'Maternity',
                              'Pedia',
                              'other',
                            ].map((x, i) => [
                              x,
                              [
                                t('مدينة طبية', 'Medical city'),
                                t('عام', 'General'),
                                t('تخصصي', 'Specialized'),
                                t('ولادة', 'Maternity'),
                                t('أطفال', 'Pediatric'),
                                t('أخرى', 'Other'),
                              ][i],
                            ])
                          : null;
                return (
                  <label
                    key={cell}
                    className={`field ${fieldError ? 'field-error' : ''}`}
                    data-highlight={highlight === cell}
                  >
                    <span>
                      {t(ar, en)}
                      <code>{cell}</code>
                    </span>
                    {options ? (
                      <select
                        aria-label={`${t(ar, en)} ${cell}`}
                        value={String(v)}
                        onChange={e =>
                          edit('Summary Sheet', cell, e.target.value)
                        }
                      >
                        <option value="">{t('اختر…', 'Select…')}</option>
                        {options.map(([val, title]) => (
                          <option key={val} value={val}>
                            {title}
                          </option>
                        ))}
                      </select>
                    ) : type === 'year' ? (
                      <NumericInput
                        type="text"
                        inputMode="numeric"
                        aria-label={`${t(ar, en)} ${cell}`}
                        value={v}
                        onChange={e => edit('Summary Sheet', cell, e.target.value, true)}
                      />
                    ) : (
                      <input
                        type="text"
                        inputMode={
                          type === 'year'
                            ? 'numeric'
                            : type === 'tel'
                              ? 'tel'
                              : type === 'email'
                                ? 'email'
                                : 'text'
                        }
                        aria-label={`${t(ar, en)} ${cell}`}
                        value={v}
                        onChange={e =>
                          edit(
                            'Summary Sheet',
                            cell,
                            e.target.value,
                            type === 'year'
                          )
                        }
                      />
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="card-heading">
              <div>
                <h3>{sec[lang]}</h3>
                <p className="source-ref" dir="ltr">
                  {sec.sheet}
                </p>
              </div>
              <span className="badge neutral">
                {t('قيم الإدخال', 'Input values')}
              </span>
            </div>
            {section === 'ED_Statistics' && (
              <div className="inline-tip">
                <CircleHelp size={17} />
                <span>
                  {t(
                    'الأعمدة I وJ وK هي إجمالي الدقائق لكل مستوى CTAS، وليست متوسطات. بقية الأعمدة أعداد مرضى.',
                    'Columns I, J and K contain total minutes per CTAS level, not averages. Other columns contain patient counts.'
                  )}
                </span>
              </div>
            )}
            {section === 'DtoPK' && (
              <div className="inline-tip">
                <CircleHelp size={17} />
                <span>
                  {t(
                    'G3 متوسط أو وسيط مدخل بالدقائق. H–K أعداد مرضى، وL–N وصفات دوائية قد تتكرر للمريض.',
                    'G3 is an entered average or median in minutes. H–K count patients; L–N count prescriptions that may repeat per patient.'
                  )}
                </span>
              </div>
            )}
            <div className="entry-rows">
              {sec.rows.map((row, i) => (
                <section className="entry-block" key={row}>
                  <h4>
                    {section === 'Admission_Statistics'
                      ? ['AICU', 'PICU', 'NICU', t('الأقسام', 'Ward')][i]
                      : section === 'DtoPK'
                        ? t(
                            'حالات الأنيميا المنجلية المحتاجة لمسكن',
                            'Sickle-cell patients requiring pain relief'
                          )
                        : `CTAS ${i + 1}`}
                  </h4>
                  <div className="numeric-grid">
                    {sec.cols.map(col => {
                      const addr = `${col}${row}`,
                        key = cellKey(section, addr),
                        v = value(doc, section, addr) ?? '';
                      const invalid = result.issues.some(
                        issue =>
                          issue.severity === 'error' && issue.refs.includes(key)
                      );
                      const changed = Object.hasOwn(doc.edits, key);
                      return (
                        <label
                          key={addr}
                          className={`field ${invalid ? 'field-error' : ''} ${changed ? 'amended' : ''}`}
                          data-highlight={highlight === addr}
                        >
                          <span>
                            {fieldLabel(section, col, lang)}
                            <code>{addr}</code>
                          </span>
                          <NumericInput
                            type="text"
                            inputMode="decimal"
                            dir="ltr"
                            value={v}
                            aria-label={`${fieldLabel(section, col, lang)} ${addr}`}
                            onChange={e =>
                              edit(section, addr, e.target.value, true)
                            }
                          />
                          {changed && (
                            <small>
                              {t('الأصل', 'Original')}:{' '}
                              <bdi>
                                {String(
                                  doc.sheets[section]?.cells[addr]?.v ?? '—'
                                )}
                              </bdi>
                            </small>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        )}
        <div className="card change-card">
          <div className="card-heading">
            <h3>
              <History size={18} />
              {t('سجل التعديلات', 'Amendment history')}
            </h3>
            {doc.log.length > 0 && (
              <button
                className="button subtle"
                onClick={() => setConfirm({ kind: 'revert' })}
              >
                <RotateCcw size={14} />
                {t('استعادة الأصل', 'Revert amendments')}
              </button>
            )}
          </div>
          {doc.log.length === 0 ? (
            <p className="muted">
              {t(
                'لم تُعدّل أي قيمة. يحتفظ التطبيق بالبيانات الأصلية المستوردة.',
                'No values have been amended. The imported source is preserved.'
              )}
            </p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t('الموقع', 'Cell')}</th>
                    <th>{t('قبل', 'Before')}</th>
                    <th>{t('بعد', 'After')}</th>
                    <th>{t('التاريخ', 'Time')}</th>
                  </tr>
                </thead>
                <tbody>
                  {doc.log
                    .slice()
                    .reverse()
                    .map((x, i) => (
                      <tr key={i}>
                        <td>
                          <code dir="ltr">
                            {x.sheet}!{x.cell}
                          </code>
                        </td>
                        <td>
                          <bdi>{String(x.before ?? '—')}</bdi>
                        </td>
                        <td>
                          <bdi>{String(x.after ?? '—')}</bdi>
                        </td>
                        <td className="nowrap">{localDate(x.at)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>
    );
  }

  function Corrections() {
    const needsSource = result.issues.filter(i =>
      ['metadata', 'reviewers', 'time_bounds', 'four_hour', 'mortality',
        'pain_statistic', 'outcomes', 'treatment', 'admission', 'required',
        'numeric', 'definition_changed', 'schema', 'formula_changed'].includes(i.rule)
    );
    const showChange = (item, applied = false) => {
      const numeric = item.kind === 'number';
      const current = numeric ? value(doc, item.sheet, item.cell) :
        formulaValue(doc, item.sheet, item.cell);
      const afterValue = applied && !numeric
        ? current === null ? null : current * (item.cell === 'H19' ? 100 : 1)
        : item.afterValue;
      const unit = item.cell === 'H19' ? '%' : '';
      return (
        <div className="evidence-grid correction-evidence">
          <div>
            <span>{t('قبل التصحيح', 'Before correction')}</span>
            <bdi>{String(item.before ?? '—')}</bdi>
            {!numeric && <strong>{fmt(item.beforeValue, 2)}{unit}</strong>}
            {numeric && <small>{t('مخزن كنص', 'Stored as text')}</small>}
          </div>
          <div>
            <span>{t('بعد التصحيح', 'After correction')}</span>
            <bdi>{String(item.after ?? '—')}</bdi>
            {!numeric && <strong>{fmt(afterValue, 2)}{unit}</strong>}
            {numeric && <small>{t('قيمة عددية بالكمية نفسها', 'Numeric value, same amount')}</small>}
          </div>
        </div>
      );
    };
    return (
      <>
        <section className="card correction-intro">
          <h2>{t('صحّح ما يمكن إثباته من التعريف', 'Correct what the definition can establish')}</h2>
          <ol>
            <li>{t('اقرأ السبب وقارن القيمة قبل التصحيح وبعده.', 'Read the explanation and compare before and after.')}</li>
            <li>{t('اضغط «تطبيق التصحيح»؛ تُحدّث نسخة المراجعة ويُسجل السبب.', 'Choose Apply correction to update the audit copy and record the reason.')}</li>
            <li>{t('راجع الملاحظات الباقية، ثم احفظ على الجهاز أو نزّل نسخة JSON والتقرير.', 'Review remaining findings, then save on device or download the JSON backup and report.')}</li>
          </ol>
          <p>{t(
            'كل تصحيح قابل للتراجع. للملفات المستوردة من Excel، يمكنك من التقرير تنزيل نسخة معدلة بعد اختيار ملف الأصل نفسه؛ تُظلل التعديلات بالأصفر ويُحفظ الأصل دون تغيير.',
            'Every correction can be undone. For imported Excel workbooks, select the same original file from the report to download an amended copy with changed cells highlighted yellow. The original is preserved.'
          )}</p>
        </section>
        <div className="section-heading">
          <h2>{t('تصحيحات جاهزة للتطبيق', 'Corrections ready to apply')}</h2>
          <span className="badge neutral">{fmt(corrections.length)}</span>
        </div>
        {!corrections.length && <p className="card correction-intro">{t(
          'لا توجد تصحيحات محددة يمكن تطبيقها حاليًا. وجود ملاحظات أخرى يستلزم مراجعة المصدر، ولا يعني أن الملف خالٍ من الأخطاء.',
          'No deterministic corrections are currently available. Other findings still require source review; this does not mean the file is error-free.'
        )}</p>}
        {corrections.map(item => (
          <section className="card correction-card" key={item.id}>
            <div className="card-heading">
              <h3>{item.title[lang]}</h3>
              <code dir="ltr">{item.sheet}!{item.cell}</code>
            </div>
            {showChange(item)}
            <p>{item.reason[lang]}</p>
            <p className="source-ref" dir="ltr">{item.source}</p>
            <button className="button primary" onClick={() => {
              changeDoc(prev => applyCorrection(prev, item.id));
              setNotice(t('طُبق التصحيح وسُجل سببه. احفظ المراجعة للاحتفاظ به.', 'Correction applied and explained in the history. Save the audit to retain it.'));
            }}>
              <Check size={16} />{t('تطبيق التصحيح', 'Apply correction')}
            </button>
          </section>
        ))}
        {appliedCorrections.length > 0 && (
          <section className="card correction-intro">
            <h2>{t('التصحيحات المطبقة', 'Applied corrections')}</h2>
            {appliedCorrections.map(item => (
              <div className="applied-correction" key={item.correctionId}>
                <code dir="ltr">{item.sheet}!{item.cell}</code>
                {showChange(item, true)}
                <p>{item.reason?.[lang] || ''}</p>
                <button className="button secondary" onClick={() => {
                  changeDoc(prev => undoCorrection(prev, item.correctionId));
                  setNotice(t('تم التراجع عن التصحيح وإعادة الفحص.', 'Correction undone and audit rerun.'));
                }}><RotateCcw size={16} />{t('التراجع عن التصحيح', 'Undo correction')}</button>
              </div>
            ))}
          </section>
        )}
        <section className="card correction-intro">
          <h2>{t('تحتاج الرجوع إلى المصدر', 'Requires source review')}</h2>
          <p>{t(
            'لا نختار رقمًا بديلًا لأعداد مرضى متعارضة، ولا نملأ أسماء المعتمدين. مؤشر الأربع ساعات ونطاق الخروج في الوفيات وتوقيت المسكن تحتاج معلومات غير متاحة في الإجماليات.',
            'Conflicting patient counts and missing reviewer names need their source records. Four-hour exclusions, the mortality discharge scope and pain timing need information absent from the aggregates.'
          )}</p>
          {needsSource.length > 0 && <IssueRows items={needsSource} />}
        </section>
      </>
    );
  }

  function Definitions() {
    const arabicTitles = {
      4: 'الوصول إلى الطبيب',
      5: 'الطبيب إلى القرار',
      6: 'القرار إلى المغادرة',
      7: 'المرضى غير العاجلين',
      8: 'المغادرة خلال ٤ ساعات',
      9: 'المغادرة والخروج ضد المشورة',
      10: 'معدل الوفيات',
      11: 'الوصول إلى المسكن',
    };
    const arabicDefinitions = {
      2: 'تشمل البيانات حالات الخروج والتنويم والنقل والوفاة (بما فيها الوفاة عند الوصول) وLAMA وDAMA. تستبعد من غادر قبل أن يفحصه الطبيب. زمن المغادرة هو المغادرة الجسدية، وللوفيات وقت إخراج الجثمان من الغرفة.',
      3: 'حجم العينة: جميع المرضى في الفترة المحددة.',
      4: 'من وقت التسجيل أو الفرز، أيهما أسبق، حتى مشاهدة الطبيب للمريض. يحسب الفرق بالدقائق. متوسط الملف = إجمالي دقائق المرحلة ÷ عدد المرضى.',
      5: 'من مشاهدة الطبيب حتى اتخاذ قرار التنويم أو الخروج. يحسب الفرق بالدقائق.',
      6: 'من اتخاذ القرار حتى المغادرة الجسدية الفعلية من قسم الطوارئ. يحسب الفرق بالدقائق.',
      7: 'عدد المرضى المصنفين CTAS 4 أو CTAS 5 ÷ إجمالي المرضى × 100. التعريف لا يذكر خصم حالات التنويم أو الإحالة.',
      8: 'نسبة من كانت مدة الوصول حتى المغادرة أقل من أربع ساعات. يذكر التعريف استبعاد DAMA وLAMA والمشرحة. التنويم = العناية أو الأقسام. الخروج = DAMA أو LAMA أو المنزل أو النقل لمستشفى أو الوفاة. يحتاج البسط والمقام إلى مجتمع متسق، وحد الأربع ساعات إلى توضيح.',
      9: 'عدد حالات LAMA وDAMA ÷ إجمالي المرضى × 100. لا يوجد معيار أداء محدد في الملف.',
      10: 'عدد وفيات الطوارئ في الشهر ÷ إجمالي حالات الخروج من الطوارئ في الشهر × 100. الملخص يستخدم إجمالي المرضى بدل حالات الخروج.',
      11: 'من التسجيل أو الفرز، أيهما أسبق، حتى إعطاء المسكن. يشمل مرضى الأنيميا المنجلية المحتاجين لمسكن بأي طريقة إعطاء. الملف يتيح المتوسط أو الوسيط دون تحديد النوع.',
    };
    const q = definitionQuery.toLowerCase();
    return (
      <>
        <div className="section-heading">
          <div>
            <h2>{t('كل ملاحظة مرتبطة بمرجع', 'Every finding has a source')}</h2>
            <p>
              {t(
                'تعاريف الملف هي المرجع. تظهر الاختلافات بين النص والصيغ كنقاط تحتاج مراجعة.',
                'Workbook definitions are the reference. Differences between wording and formulas are surfaced for review.'
              )}
            </p>
          </div>
          <span className="badge neutral">ED V4.25</span>
        </div>
        <div className="search-box definitions-search">
          <Search size={17} />
          <input
            value={definitionQuery}
            onChange={e => setDefinitionQuery(e.target.value)}
            placeholder={t(
              'ابحث في التعاريف والقواعد…',
              'Search definitions and rules…'
            )}
            aria-label={t('البحث في التعاريف', 'Search definitions')}
          />
        </div>
        <div className="definitions-list">
          {TEMPLATE.definitions
            .filter(d =>
              `${d.title} ${d.text} ${arabicDefinitions[d.row]}`
                .toLowerCase()
                .includes(q)
            )
            .map(d => {
              const imported = doc
                ? value(doc, 'ED KPIs Definitions', `B${d.row}`)
                : null;
              const changed =
                imported != null &&
                String(imported).replace(/\s+/g, ' ').trim().toLowerCase() !==
                  d.text.replace(/\s+/g, ' ').trim().toLowerCase();
              return (
                <details
                  className="card definition"
                  key={d.row}
                  open={d.row === 8 || changed}
                >
                  <summary>
                    <span className="definition-index">
                      {d.row < 4 ? (
                        <ClipboardCheck size={18} />
                      ) : (
                        String(d.row - 3).padStart(2, '0')
                      )}
                    </span>
                    <span>
                      {d.row === 2
                        ? t(
                            'نطاق الاشتمال والاستبعاد',
                            'General inclusions & exclusions'
                          )
                        : d.row === 3
                          ? t('حجم العينة', 'Sample size')
                          : t(arabicTitles[d.row], d.title)}
                    </span>
                    {changed && (
                      <span className="badge warning">
                        {t('نص مختلف', 'Changed text')}
                      </span>
                    )}
                    <ChevronDown size={18} />
                  </summary>
                  <div className="definition-body">
                    <p>{lang === 'ar' ? arabicDefinitions[d.row] : d.text}</p>
                    <details className="original-text">
                      <summary>
                        {t(
                          'النص الأصلي المستورد بالإنجليزية',
                          'Original imported wording'
                        )}
                      </summary>
                      <p dir="ltr">{imported ?? d.text}</p>
                    </details>
                    {d.row >= 4 && (
                      <div className="benchmark-grid">
                        {['world', 'acceptable', 'improve', 'unacceptable'].map(
                          (g, i) => (
                            <div key={g}>
                              <span className={`dot ${g}`} />
                              <span>{label(gradeNames[g])}</span>
                              <bdi>
                                {doc
                                  ? (value(
                                      doc,
                                      'ED KPIs Definitions',
                                      `${'CDEF'[i]}${d.row}`
                                    ) ?? d.benchmarks[i])
                                  : d.benchmarks[i]}
                              </bdi>
                            </div>
                          )
                        )}
                      </div>
                    )}
                    {[4, 5, 6, 7, 8, 11].includes(d.row) && (
                      <p className="definition-note">
                        {t(
                          'عند تداخل حدود الفئات حرفيًا، تظهر الحالة «حد متداخل» بدل فرض حد غير موجود في المصدر.',
                          'An exact overlapping boundary is labeled as ambiguous rather than assigning a cutoff absent from the source.'
                        )}
                      </p>
                    )}
                    <code className="source-ref" dir="ltr">
                      ED KPIs Definitions!B{d.row}:F{d.row}
                    </code>
                  </div>
                </details>
              );
            })}
        </div>
        <div className="card">
          <div className="card-heading">
            <h3>{t('قواعد التحقق المطبقة', 'Implemented audit rules')}</h3>
            <span className="count">{RULES.length}</span>
          </div>
          <div className="rule-grid">
            {RULES.filter(r =>
              `${r.title.ar} ${r.title.en} ${r.source}`
                .toLowerCase()
                .includes(q)
            ).map((r, i) => (
              <div className="rule" key={r.id}>
                <span>{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <h4>{r.title[lang]}</h4>
                  <p dir="ltr">{r.source}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="inline-tip">
            <CircleHelp size={17} />
            <span>
              {result?.scope[lang] ||
                t(
                  'الملف مجمع شهريًا. التحقق من تكرار المرضى أو الأوقات الفردية يحتاج ملف الحالات التفصيلي.',
                  'The workbook contains monthly aggregates. Patient duplication and individual timestamp checks require case-level data.'
                )}
            </span>
          </div>
        </div>
      </>
    );
  }

  function Report({ printing = false }) {
    if (!doc) return <Empty />;
    return (
      <div className={printing ? 'report-content' : 'card report-content'}>
        <div className="report-title">
          <div>
            <p className="eyebrow">ED AUDIT / DATA QUALITY</p>
            <h2>
              {t(
                'تقرير مراجعة بيانات الطوارئ',
                'Emergency department data audit'
              )}
            </h2>
            <p>{String(value(doc, 'Summary Sheet', 'C14') || '—')}</p>
            <p>
              <bdi>
                {String(value(doc, 'Summary Sheet', 'C11') || '—')} /{' '}
                {String(value(doc, 'Summary Sheet', 'C12') || '—')}
              </bdi>
            </p>
          </div>
          <ShieldCheck size={42} />
        </div>
        <div className="report-summary">
          <div>
            {t('إجمالي المرضى', 'Total patients')}
            <strong>{fmt(result.patients)}</strong>
          </div>
          <div>
            {t('أخطاء مؤكدة', 'Errors')}
            <strong>{fmt(result.errors)}</strong>
          </div>
          <div>
            {t('تحتاج مراجعة', 'Review findings')}
            <strong>{fmt(result.warnings)}</strong>
          </div>
          <div>
            {t('تمت مراجعتها', 'Reviewed')}
            <strong>{fmt(result.reviewed)}</strong>
          </div>
        </div>
        <p className="scope-note">{result.scope[lang]}</p>
        <h3>{t('نتائج التحقق بالتفصيل', 'Detailed findings')}</h3>
        {result.issues.length === 0 ? (
          <p>
            {t(
              'لم تظهر ملاحظات ضمن الفحوص المنفذة.',
              'No findings from the implemented checks.'
            )}
          </p>
        ) : (
          result.issues.map((i, idx) => (
            <section className="report-finding" key={i.id}>
              <div>
                <strong>
                  {idx + 1}. {i.title[lang]}
                </strong>
                <FindingBadge issue={i} />
              </div>
              <p>{i.details[lang]}</p>
              <p>
                <b>{t('المدخل / الملحوظ', 'Observed')}: </b>
                <bdi>{i.observed || '—'}</bdi>
                <b> · {t('المتوقع / المطلوب', 'Expected')}: </b>
                <bdi>{i.expected || '—'}</bdi>
              </p>
              <code dir="ltr">{i.refs.join(' · ')}</code>
              {doc.reviews[i.reviewKey] && (
                <p>
                  {t('حالة المراجعة', 'Review status')}:{' '}
                  {doc.reviews[i.reviewKey].status === 'reviewed'
                    ? t('رُوجعت', 'Reviewed')
                    : t('مفتوحة', 'Open')}{' '}
                  · {doc.reviews[i.reviewKey].note}
                </p>
              )}
            </section>
          ))
        )}
        <h3>{t('مؤشرات الأداء', 'Performance indicators')}</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t('المؤشر', 'KPI')}</th>
                <th>{t('حسب التعريف / المرجع', 'Definition / reference')}</th>
                <th>{t('صيغة النموذج', 'Template formula')}</th>
                <th>{t('ملاحظة', 'Note')}</th>
              </tr>
            </thead>
            <tbody>
              {result.kpis.map(k => (
                <tr key={k.id}>
                  <td>{k.title[lang]}</td>
                  <td>
                    {fmt(k.value, 2)} {k.unit}
                  </td>
                  <td>
                    {fmt(k.workbook, 2)} {k.unit}
                  </td>
                  <td>{k.caveat?.[lang] || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3>{t('مطابقة الأعداد حسب الفرز', 'Reconciliation by CTAS')}</h3>
        <Reconciliation />
        {doc.log.length > 0 && <>
          <h3>{t('التعديلات وأسباب التصحيح', 'Amendments and correction explanations')}</h3>
          {doc.log.map((entry, i) => (
            <section className="report-finding" key={i}>
              <code dir="ltr">{entry.sheet}!{entry.cell}</code>
              <p>{entry.operation === 'undo' ? t('تراجع', 'Undo') :
                entry.correctionId ? t('تصحيح وفق القاعدة', 'Rule-based correction') : t('تعديل يدوي', 'Manual amendment')}</p>
              <p><bdi>{String(entry.before ?? '—')}</bdi> → <bdi>{String(entry.after ?? '—')}</bdi></p>
              {entry.reason?.[lang] && <p>{entry.reason[lang]}</p>}
              {entry.source && <p dir="ltr">{entry.source}</p>}
              <small>{localDate(entry.at)}</small>
            </section>
          ))}
        </>}
        <p className="report-footer">
          {t('الملف', 'Source')}: <bdi>{sourceName}</bdi> ·{' '}
          {t('مرجع التعاريف', 'Definition reference')}: V4.25 ·{' '}
          {t('التعديلات', 'Amendments')}: {fmt(doc.log.length)}
        </p>
        <p className="muted">
          {t(
            'تعني «رُوجعت» أن الملاحظة قُرئت ووُثقت؛ لا تلغي الخطأ ولا تصحح البيانات تلقائيًا.',
            'Reviewed means a finding has been read and documented; it does not remove an error or automatically correct data.'
          )}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="app-shell">
        <aside className={`sidebar ${menuOpen ? 'mobile-open' : ''}`}>
          <div className="brand">
            <div className="brand-mark">
              <Activity size={24} />
            </div>
            <div>
              <strong dir="ltr">ED Audit</strong>
              <span>{t('تدقيق بيانات الطوارئ', 'EMERGENCY DATA AUDIT')}</span>
            </div>
            <button
              className="icon-button mobile-close"
              onClick={() => setMenuOpen(false)}
              aria-label={t('إغلاق القائمة', 'Close menu')}
            >
              <X size={20} />
            </button>
          </div>
          <p className="sidebar-label">
            {t('مساحة المراجعة', 'AUDIT WORKSPACE')}
          </p>
          <nav>
            {nav.map(([key, Icon, ar, en]) => (
              <button
                key={key}
                className={`nav-item ${view === key ? 'active' : ''}`}
                onClick={() => switchView(key)}
              >
                <Icon size={18} />
                <span>{t(ar, en)}</span>
                {key === 'findings' && result && result.issues.length > 0 && (
                  <span className="nav-count">{fmt(result.issues.length)}</span>
                )}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="local-box">
              <LockKeyhole size={19} />
              <div>
                <strong>
                  {t('بياناتك على جهازك', 'Your data stays local')}
                </strong>
                <p>
                  {t(
                    'الفحص والحفظ التلقائي داخل هذا المتصفح. احتفظ أيضًا بنسخة JSON.',
                    'Processing and autosave happen in this browser. Keep a JSON backup too.'
                  )}
                </p>
              </div>
            </div>
            <div className="sidebar-version">
              <span>ED TEMPLATE</span>
              <b>V4.25</b>
            </div>
          </div>
        </aside>
        {menuOpen && (
          <button
            className="sidebar-overlay"
            onClick={() => setMenuOpen(false)}
            aria-label={t('إغلاق القائمة', 'Close menu')}
          />
        )}
        <div className="workspace">
          <header className="topbar">
            <div className="breadcrumb">
              <button
                className="icon-button mobile-menu"
                onClick={() => setMenuOpen(true)}
                aria-label={t('فتح القائمة', 'Open menu')}
              >
                <SlidersHorizontal size={21} />
              </button>
              <span>{t('قسم الطوارئ', 'Emergency department')}</span>
              <span className="slash">/</span>
              <strong>
                {nav.find(n => n[0] === view)?.[lang === 'ar' ? 2 : 3]}
              </strong>
            </div>
            <div className="header-actions">
              <span className="status-light">
                <i />
                {t('معالجة محلية', 'Local processing')}
              </span>
              <button
                className="language-button"
                onClick={() => {
                  setLang(lang === 'ar' ? 'en' : 'ar');
                  setNotice('');
                  setError('');
                }}
              >
                <Globe2 size={16} />
                {lang === 'ar' ? 'English' : 'العربية'}
              </button>
            </div>
          </header>
          <main ref={contentRef}>
            <input
              ref={exportRef}
              type="file"
              accept=".xlsx"
              hidden
              aria-label={t('المصنف الأصلي لتصدير Excel', 'Original workbook for Excel export')}
              onChange={event => exportExcel(event.target.files[0])}
            />
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.json"
              hidden
              onChange={e => importFile(e.target.files[0])}
              aria-label={t('ملف قسم الطوارئ', 'ED workbook file')}
            />
            <div className="page-heading">
              <div>
                <p className="eyebrow">
                  {t('تدقيق بيانات الطوارئ', 'ED AUDIT')}
                </p>
                <h1>{nav.find(n => n[0] === view)?.[lang === 'ar' ? 2 : 3]}</h1>
              </div>
              <div className="page-actions">
                {doc && (
                  <>
                    <button
                      className={`button ${saved ? 'saved' : 'secondary'}`}
                      onClick={saveLocal}
                    >
                      <Save size={16} />
                      {saved
                        ? t('محفوظ على الجهاز', 'Saved on device')
                        : t('حفظ على الجهاز', 'Save on device')}
                    </button>
                    <button
                      className="button primary"
                      onClick={() => {
                        switchView('report');
                      }}
                    >
                      <ClipboardCheck size={16} />
                      {t('عرض التقرير', 'View report')}
                    </button>
                  </>
                )}
              </div>
            </div>
            {error && (
              <div className="alert error" role="alert">
                <CircleAlert size={20} />
                <span>{error}</span>
                <button
                  className="icon-button"
                  onClick={() => setError('')}
                  aria-label={t('إغلاق', 'Dismiss')}
                >
                  <X size={17} />
                </button>
              </div>
            )}
            {notice && (
              <div className="alert success" role="status">
                <CheckCircle2 size={19} />
                <span>{notice}</span>
                <button
                  className="icon-button"
                  onClick={() => setNotice('')}
                  aria-label={t('إغلاق', 'Dismiss')}
                >
                  <X size={17} />
                </button>
              </div>
            )}
            {doc && (
              <div className="file-strip">
                <span className="file-circle">
                  <FileSpreadsheet size={20} />
                </span>
                <div>
                  <strong>
                    <bdi>{sourceName}</bdi>
                  </strong>
                  <span>
                    {doc.mode === 'demo'
                      ? t(
                          'بيانات تجريبية مصطنعة، ليست بيانات الملف المرفق',
                          'Synthetic demo data, not the attached workbook'
                        )
                      : t(
                          'الأصل محفوظ · الحسابات مستقلة عن ملخص Excel',
                          'Original preserved · calculations independent of Excel summary'
                        )}
                  </span>
                </div>
                <span className="file-mode">
                  {doc.mode === 'demo'
                    ? t('مثال تجريبي', 'DEMO')
                    : doc.mode === 'manual'
                      ? t('يدوي', 'MANUAL')
                      : 'XLSX'}
                </span>
                <button
                  className="button subtle"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                >
                  <Upload size={14} />
                  {t('تغيير الملف', 'Replace file')}
                </button>
              </div>
            )}
            {view === 'overview' && (
              <>
                {!doc ? (
                  <>
                    <section className="hero">
                      <div className="hero-copy">
                        <span className="hero-tag">
                          <ShieldCheck size={15} />
                          {t(
                            'مراجعة مبنية على تعاريف ملفك',
                            'BUILT AROUND YOUR WORKBOOK DEFINITIONS'
                          )}
                        </span>
                        <h2>
                          {t(
                            'بيانات واضحة.\nمراجعة أدق.',
                            'Clear data.\nA closer review.'
                          )}
                        </h2>
                        <p>
                          {t(
                            'اكتشف التناقضات والأخطاء في بيانات الطوارئ، واعرف موقع كل ملاحظة وسببها قبل الاعتماد.',
                            'Find inconsistencies in your emergency department data, trace each finding to its source, and review before submission.'
                          )}
                        </p>
                        <div className="hero-features">
                          <span>
                            <Check size={15} />
                            {t('مطابقة بين الأوراق', 'Cross-sheet checks')}
                          </span>
                          <span>
                            <Check size={15} />
                            {t('٨ مؤشرات أداء', '8 performance indicators')}
                          </span>
                          <span>
                            <Check size={15} />
                            {t('العربية والإنجليزية', 'Arabic & English')}
                          </span>
                        </div>
                      </div>
                      <div className="hero-art" aria-hidden="true">
                        <div className="orbit orbit-one" />
                        <div className="orbit orbit-two" />
                        <div className="audit-visual">
                          <div className="mini-sheet">
                            <span />
                            <span />
                            <span />
                          </div>
                          <div className="visual-row">
                            <div />
                            <div />
                            <CheckCircle2 size={18} />
                          </div>
                          <div className="visual-row">
                            <div />
                            <div />
                            <CheckCircle2 size={18} />
                          </div>
                          <div className="visual-row warn">
                            <div />
                            <div />
                            <AlertTriangle size={18} />
                          </div>
                          <div className="visual-pulse">
                            <Activity size={45} />
                          </div>
                        </div>
                        <span className="art-label">
                          DATA → VALIDATION → INSIGHT
                        </span>
                      </div>
                    </section>
                    <UploadCard />
                    <div className="start-options">
                      <button onClick={() => newDoc(true)}>
                        <BarChart3 size={17} />
                        {t(
                          'استكشاف مثال تجريبي',
                          'Explore a synthetic example'
                        )}
                        {lang === 'ar' ? (
                          <ArrowLeft size={15} />
                        ) : (
                          <ArrowRight size={15} />
                        )}
                      </button>
                      <button onClick={() => newDoc(false)}>
                        <Plus size={17} />
                        {t(
                          'أو إدخال البيانات يدويًا',
                          'Or enter data manually'
                        )}
                      </button>
                    </div>
                    <div className="workflow-grid">
                      {[
                        [
                          FileSpreadsheet,
                          '01',
                          'استيراد البيانات',
                          'Import data',
                          'الملف كاملًا، بأوراقه وتعاريفه.',
                          'The full workbook, including its definitions.',
                        ],
                        [
                          ShieldCheck,
                          '02',
                          'فحص ومطابقة',
                          'Validate & reconcile',
                          'القيم والإجماليات والتناقضات.',
                          'Values, totals and inconsistencies.',
                        ],
                        [
                          ClipboardCheck,
                          '03',
                          'مراجعة وتوثيق',
                          'Review & document',
                          'دليل لكل ملاحظة وتقرير قابل للتصدير.',
                          'Traceable findings and an exportable report.',
                        ],
                      ].map(([Icon, n, ar, en, da, de]) => (
                        <article key={n}>
                          <span className="step-number">{n}</span>
                          <Icon size={23} />
                          <h3>{t(ar, en)}</h3>
                          <p>{t(da, de)}</p>
                        </article>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="metrics-grid">
                      <article className="metric">
                        <div>
                          <span>{t('إجمالي المرضى', 'Total patients')}</span>
                          <Activity size={19} />
                        </div>
                        <strong>{fmt(result.patients)}</strong>
                        <small>
                          {t('جميع مستويات CTAS', 'All CTAS levels')}
                        </small>
                      </article>
                      <article className="metric metric-error">
                        <div>
                          <span>{t('أخطاء مؤكدة', 'Errors')}</span>
                          <CircleAlert size={19} />
                        </div>
                        <strong>{fmt(result.errors)}</strong>
                        <button
                          onClick={() => {
                            setSeverity('error');
                            switchView('findings');
                          }}
                        >
                          {t('تحتاج تصحيحًا', 'Require correction')}
                          <ArrowUpRight size={13} />
                        </button>
                      </article>
                      <article className="metric metric-warning">
                        <div>
                          <span>
                            {t('نقاط تحتاج مراجعة', 'Review findings')}
                          </span>
                          <AlertTriangle size={19} />
                        </div>
                        <strong>{fmt(result.warnings)}</strong>
                        <button
                          onClick={() => {
                            setSeverity('warning');
                            switchView('findings');
                          }}
                        >
                          {t(
                            'تحقق من المصدر والتعريف',
                            'Verify source & definition'
                          )}
                          <ArrowUpRight size={13} />
                        </button>
                      </article>
                      <article className="metric">
                        <div>
                          <span>
                            {t('المطابقات العددية', 'Count reconciliations')}
                          </span>
                          <ClipboardCheck size={19} />
                        </div>
                        <strong>
                          {fmt(result.checks.filter(c => c.pass).length)}
                          <em> / {fmt(result.checks.length)}</em>
                        </strong>
                        <small>
                          {t(
                            'مطابقات الفرز والتنويم',
                            'CTAS & admission checks'
                          )}
                        </small>
                      </article>
                    </div>
                    <div
                      className={`review-banner ${result.errors ? 'needs-review' : ''}`}
                    >
                      <ShieldCheck size={24} />
                      <div>
                        <h3>
                          {result.errors
                            ? t(
                                'البيانات تحتاج استكمالًا أو تصحيحًا',
                                'Data requires completion or correction'
                              )
                            : result.warnings
                              ? t(
                                  'المطابقات لا تغني عن مراجعة التعاريف',
                                  'Reconciliations still require definition review'
                                )
                              : t(
                                  'اكتملت الفحوص دون ملاحظات ظاهرة',
                                  'Implemented checks found no issues'
                                )}
                        </h3>
                        <p>
                          {t(
                            'تطابق الإجماليات لا يثبت صحة كل قيمة. افتح الملاحظات للاطلاع على الدليل.',
                            'Matching totals do not establish every value is correct. Open findings to review the evidence.'
                          )}
                        </p>
                      </div>
                      <button
                        className="button secondary"
                        onClick={() => {
                          setSeverity('all');
                          switchView('findings');
                        }}
                      >
                        {t('بدء المراجعة', 'Review findings')}
                        {lang === 'ar' ? (
                          <ArrowLeft size={15} />
                        ) : (
                          <ArrowRight size={15} />
                        )}
                      </button>
                    </div>
                    <div className="overview-grid">
                      <section className="card">
                        <div className="card-heading">
                          <h3>
                            {t('الأخطاء والملاحظات', 'Findings to review')}
                            <span className="count">
                              {fmt(result.issues.length)}
                            </span>
                          </h3>
                          <button
                            className="text-button"
                            onClick={() => {
                              setSeverity('all');
                              switchView('findings');
                            }}
                          >
                            {t('عرض الكل', 'View all')}
                          </button>
                        </div>
                        {result.issues.length ? (
                          <IssueRows
                            items={[
                              ...result.issues.filter(
                                i => i.severity === 'error'
                              ),
                              ...result.issues.filter(
                                i => i.severity !== 'error'
                              ),
                            ].slice(0, 5)}
                          />
                        ) : (
                          <p className="muted">
                            {t(
                              'لا توجد ملاحظات ضمن الفحوص المنفذة.',
                              'No findings from implemented checks.'
                            )}
                          </p>
                        )}
                      </section>
                      <section className="card">
                        <div className="card-heading">
                          <div>
                            <h3>
                              {t(
                                'المطابقة حسب مستوى الفرز',
                                'Reconciliation by triage level'
                              )}
                            </h3>
                            <p>
                              {t(
                                'مطابقة المرضى مع وجهات المغادرة وفترات البقاء',
                                'Patients versus dispositions and time bands'
                              )}
                            </p>
                          </div>
                          <BarChart3 size={19} />
                        </div>
                        <Reconciliation />
                        <div className="chart-legend">
                          <i />
                          {t(
                            'التطابق هنا عددي فقط',
                            'Matching here refers to counts only'
                          )}
                        </div>
                      </section>
                    </div>
                    <div className="section-heading">
                      <div>
                        <h2>{t('المؤشرات الرئيسية', 'Key indicators')}</h2>
                        <p>
                          {t(
                            'قيم أعيد حسابها من المدخلات، مع توضيح حدود التعاريف.',
                            'Recomputed values with definition limitations made explicit.'
                          )}
                        </p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => switchView('indicators')}
                      >
                        {t('جميع المؤشرات', 'All indicators')}
                        <ArrowUpRight size={16} />
                      </button>
                    </div>
                    <div className="kpi-grid overview-kpis">
                      {result.kpis.slice(0, 4).map(k => (
                        <KpiCard key={k.id} k={k} />
                      ))}
                    </div>
                    <div className="scope-note">
                      <CircleHelp size={18} />
                      <p>{result.scope[lang]}</p>
                    </div>
                  </>
                )}
              </>
            )}
            {view === 'findings' &&
              (doc ? (
                <>
                  <div className="section-heading">
                    <div>
                      <h2>
                        {t(
                          'راجع الملاحظة من موقعها الأصلي',
                          'Review each finding at its source'
                        )}
                      </h2>
                      <p>
                        {t(
                          'افتح أي ملاحظة لعرض السبب والقيمة المتوقعة وكتابة نتيجة المراجعة.',
                          'Open a finding for evidence, expected values and your review note.'
                        )}
                      </p>
                    </div>
                    <span className="badge neutral">
                      {fmt(result.reviewed)} / {fmt(result.issues.length)}{' '}
                      {t('رُوجعت', 'reviewed')}
                    </span>
                  </div>
                  <div className="filter-bar">
                    <div className="search-box">
                      <Search size={17} />
                      <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder={t(
                          'بحث في الملاحظات والخلايا…',
                          'Search findings and cells…'
                        )}
                        aria-label={t('البحث في الملاحظات', 'Search findings')}
                      />
                    </div>
                    <select
                      aria-label={t('درجة الملاحظة', 'Finding severity')}
                      value={severity}
                      onChange={e => setSeverity(e.target.value)}
                    >
                      <option value="all">
                        {t('كل الدرجات', 'All severities')}
                      </option>
                      <option value="error">
                        {t('أخطاء مؤكدة', 'Errors')}
                      </option>
                      <option value="warning">
                        {t('تحتاج مراجعة', 'Needs review')}
                      </option>
                    </select>
                    <select
                      aria-label={t('نوع الملاحظة', 'Finding category')}
                      value={category}
                      onChange={e => setCategory(e.target.value)}
                    >
                      <option value="all">
                        {t('كل الأنواع', 'All categories')}
                      </option>
                      {Object.entries(categories).map(([key, pair]) => (
                        <option key={key} value={key}>
                          {label(pair)}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={t('حالة المراجعة', 'Review status')}
                      value={reviewFilter}
                      onChange={e => setReviewFilter(e.target.value)}
                    >
                      <option value="all">
                        {t('كل الحالات', 'All statuses')}
                      </option>
                      <option value="open">{t('لم تراجع', 'Open')}</option>
                      <option value="reviewed">
                        {t('رُوجعت', 'Reviewed')}
                      </option>
                    </select>
                  </div>
                  <div className="card">
                    <div className="card-heading">
                      <h3>
                        {t('نتائج التحقق', 'Audit findings')}
                        <span className="count">{fmt(filtered.length)}</span>
                      </h3>
                      <button
                        className="text-button"
                        onClick={() => {                          setSearch('');
                          setSeverity('all');
                          setCategory('all');
                          setReviewFilter('all');
                        }}
                      >
                        <Filter size={14} />
                        {t('إعادة الفلاتر', 'Reset filters')}
                      </button>
                    </div>
                    {filtered.length ? (
                      <IssueRows items={filtered} />
                    ) : (
                      <div className="empty small">
                        <CheckCircle2 size={30} />
                        <h3>
                          {t(
                            'لا توجد ملاحظات تطابق البحث',
                            'No matching findings'
                          )}
                        </h3>
                        <p>
                          {t(
                            'جرّب تغيير الفلاتر أو عبارة البحث.',
                            'Try changing the filters or search.'
                          )}
                        </p>
                      </div>
                    )}
                  </div>
                  <p className="muted">
                    {t(
                      'توثيق المراجعة لا يحذف الخطأ؛ تزول الملاحظة الحسابية عندما تصحح القيمة المرتبطة بها.',
                      'Marking reviewed does not remove an error; arithmetic findings clear when the relevant values are corrected.'
                    )}
                  </p>
                </>
              ) : (
                <Empty />
              ))}
            {view === 'corrections' && (doc ? <>{Corrections()}</> : <Empty />)}
            {view === 'data' &&
              (doc ? (
                <>{DataEditor()}</>
              ) : (
                <>
                  <Empty />
                  <div className="center">
                    <button
                      className="button secondary"
                      onClick={() => newDoc(false)}
                    >
                      <Plus size={16} />
                      {t('إدخال يدوي جديد', 'New manual entry')}
                    </button>
                  </div>
                </>
              ))}
            {view === 'indicators' &&
              (doc ? (
                <>
                  <div className="section-heading">
                    <div>
                      <h2>
                        {t(
                          'المؤشرات الثمانية وفق مرجع الملف',
                          'Eight indicators from the workbook reference'
                        )}
                      </h2>
                      <p>
                        {t(
                          'معايير الأداء تصف المؤشر ولا تُعد دليلًا على خطأ البيانات. الوفيات والأربع ساعات تحتاجان مراجعة النطاق.',
                          'Performance benchmarks describe KPIs, not data errors. Mortality and four-hour results require cohort review.'
                        )}
                      </p>
                    </div>
                  </div>
                  {result.definitionChanged && (
                    <div className="alert warning">
                      <AlertTriangle size={20} />
                      <span>
                        {t(
                          'تعاريف الملف المستورد مختلفة عن V4.25. النتائج مرجعية والتصنيف متوقف حتى مراجعة التعاريف.',
                          'Imported definitions differ from V4.25. Results are references and grading is withheld pending definition review.'
                        )}
                      </span>
                    </div>
                  )}
                  <div className="kpi-grid">
                    {result.kpis.map(k => (
                      <KpiCard key={k.id} k={k} />
                    ))}
                  </div>
                  <section className="card">
                    <div className="card-heading">
                      <h3>
                        {t(
                          'مطابقة التنويم حسب النوع',
                          'Admissions by destination'
                        )}
                      </h3>
                    </div>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>{t('الوجهة', 'Destination')}</th>
                            <th>{t('إحصاءات الطوارئ', 'ED statistics')}</th>
                            <th>{t('إجمالي الفترات', 'Time-band total')}</th>
                            <th>{t('الفرق', 'Difference')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.admissions.map(a => (
                            <tr key={a.type}>
                              <td>{a.type}</td>
                              <td>{fmt(a.ed)}</td>
                              <td>{fmt(a.bands)}</td>
                              <td>
                                {fmt(
                                  a.ed == null || a.bands == null
                                    ? null
                                    : a.bands - a.ed
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </>
              ) : (
                <Empty />
              ))}
            {view === 'definitions' && <>{Definitions()}</>}
            {view === 'report' && (
              <>
                {doc && (
                  <div className="report-actions">
                    {doc.mode === 'import' && <button className="button secondary" disabled={busy || (!Object.keys(doc.edits).length && !Object.keys(doc.formulaEdits || {}).length)} onClick={() => exportRef.current?.click()}>
                      <Download size={16} />{t('تصدير Excel معدل — اختر الأصل', 'Export amended Excel — select original')}
                    </button>}
                    <button
                      className="button primary"
                      onClick={() => exportCsv(doc, result, lang)}
                    >
                      <Download size={16} />
                      {t('تصدير التقرير CSV', 'Export report CSV')}
                    </button>
                    <button
                      className="button secondary"
                      onClick={() => window.edAuditDesktop
                        ? window.edAuditDesktop.printReport(lang)
                        : window.print()}
                    >
                      <Printer size={16} />
                      {t('طباعة / حفظ PDF', 'Print / Save PDF')}
                    </button>
                    <button
                      className="button secondary"
                      onClick={() =>
                        download(
                          JSON.stringify(doc, null, 2),
                          'ED-Audit-Workspace.json',
                          'application/json'
                        )
                      }
                    >
                      <Download size={16} />
                      {t('نسخة مراجعة JSON', 'JSON audit backup')}
                    </button>
                  </div>
                )}
                <Report />
              </>
            )}
            <footer className="page-footer">
              <span>
                ED Audit
              </span>
              <span>
                {t(
                  'تعاريف واضحة. مراجعة موثقة.',
                  'Clear definitions. Documented review.'
                )}
              </span>
              {doc && (
                <button
                  className="text-button"
                  onClick={() => setConfirm({ kind: 'clear' })}
                >
                  <Trash2 size={13} />
                  {t('مسح مساحة العمل', 'Clear workspace')}
                </button>
              )}
            </footer>
          </main>
        </div>
      </div>
      {currentDetail && (
        <div className="modal-backdrop" onClick={() => setDetail(null)}>
          <section
            className="detail-panel"
            role="dialog"
            aria-modal="true"
            aria-label={currentDetail.title[lang]}
            onClick={e => e.stopPropagation()}
          >
            <div className="panel-header">
              <FindingBadge issue={currentDetail} />
              <button
                className="icon-button"
                autoFocus
                onClick={() => setDetail(null)}
                aria-label={t('إغلاق', 'Close')}
              >
                <X size={22} />
              </button>
            </div>
            <h2>{currentDetail.title[lang]}</h2>
            <p className="detail-description">{currentDetail.details[lang]}</p>
            <div className="evidence-grid">
              <div>
                <span>{t('المدخل / الملحوظ', 'Observed')}</span>
                <bdi>{currentDetail.observed || '—'}</bdi>
              </div>
              <div>
                <span>{t('المتوقع / المطلوب', 'Expected')}</span>
                <bdi>{currentDetail.expected || '—'}</bdi>
              </div>
            </div>
            <h3>{t('الموقع في الملف', 'Workbook location')}</h3>
            <div className="ref-list">
              {currentDetail.refs.map(ref => (
                <button key={ref} onClick={() => goToCell(ref)}>
                  <code dir="ltr">{ref}</code>
                  <ArrowUpRight size={15} />
                </button>
              ))}
            </div>
            <p className="detail-source">
              {t('مرجع القاعدة', 'Rule source')}
              <bdi>{currentDetail.source}</bdi>
            </p>
            <button className="button secondary" onClick={() => {
              setDetail(null);
              switchView('corrections');
            }}><ClipboardCheck size={16} />{t('عرض التصحيحات الممكنة', 'View possible corrections')}</button>
            <div className="review-form">
              <label className="field">
                <span>{t('ملاحظة المراجع', 'Reviewer note')}</span>
                <textarea
                  rows={4}
                  maxLength={4000}
                  placeholder={t(
                    'وثّق سبب الاختلاف أو التصحيح المطلوب…',
                    'Document the explanation or required correction…'
                  )}
                  value={doc.reviews[currentDetail.reviewKey]?.note || ''}
                  onChange={e => {
                    const note = e.target.value;
                    changeDoc(prev => ({
                      ...prev,
                      reviews: {
                        ...prev.reviews,
                        [currentDetail.reviewKey]: {
                          status:
                            prev.reviews[currentDetail.reviewKey]?.status ||
                            'open',
                          note,
                        },
                      },
                    }));
                  }}
                />
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={
                    doc.reviews[currentDetail.reviewKey]?.status === 'reviewed'
                  }
                  onChange={e => {
                    const status = e.target.checked ? 'reviewed' : 'open';
                    changeDoc(prev => ({
                      ...prev,
                      reviews: {
                        ...prev.reviews,
                        [currentDetail.reviewKey]: {
                          status,
                          note:
                            prev.reviews[currentDetail.reviewKey]?.note || '',
                        },
                      },
                    }));
                  }}
                />
                {t(
                  'اطلعت على الملاحظة ووثّقت المراجعة',
                  'I have reviewed and documented this finding'
                )}
              </label>
              <p className="muted">
                {t(
                  'لا يلغي هذا الخيار الخطأ ولا يغير البيانات.',
                  'This does not dismiss the error or change the data.'
                )}
              </p>
            </div>
            <button
              className="button primary full"
              onClick={() => setDetail(null)}
            >
              <Check size={16} />
              {t('تم', 'Done')}
            </button>
          </section>
        </div>
      )}
      {confirm && (
        <div className="modal-backdrop" onClick={() => setConfirm(null)}>
          <section
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={t('تأكيد الإجراء', 'Confirm action')}
            onClick={e => e.stopPropagation()}
          >
            <div className="confirm-icon">
              <AlertTriangle size={25} />
            </div>
            <h2>
              {confirm.kind === 'clear'
                ? t('مسح مساحة العمل؟', 'Clear this workspace?')
                : confirm.kind === 'revert'
                  ? t('استعادة القيم الأصلية؟', 'Revert all amendments?')
                  : t(
                      'استبدال المراجعة الحالية؟',
                      'Replace the current audit?'
                    )}
            </h2>
            <p>
              {confirm.kind === 'clear'
                ? t(
                    'ستُمسح بيانات المراجعة من هذا المتصفح. يمكنك تنزيل نسخة JSON قبل المسح.',
                    'Audit data will be removed from this browser. You can download a JSON backup first.'
                  )
                : confirm.kind === 'revert'
                  ? t(
                      'ستزال جميع التعديلات وسجلها وتعود القيم المستوردة. التعليقات القديمة تبقى مرتبطة بدليلها الأصلي.',
                      'All amendments and their history will be removed and imported values restored. Existing review notes remain tied to their original evidence.'
                    )
                  : t(
                      'توجد تعديلات أو ملاحظات مراجعة. احفظ نسخة JSON إذا أردت الاحتفاظ بها قبل استبدال الملف.',
                      'There are amendments or review notes. Save a JSON backup if you want to retain them before replacing this audit.'
                    )}
            </p>
            <div className="confirm-actions">
              <button
                className="button secondary"
                autoFocus
                onClick={() => setConfirm(null)}
              >
                {t('إلغاء', 'Cancel')}
              </button>
              {doc && (
                <button
                  className="button secondary"
                  onClick={() =>
                    download(
                      JSON.stringify(doc, null, 2),
                      'ED-Audit-Workspace.json',
                      'application/json'
                    )
                  }
                >
                  <Download size={15} />
                  JSON
                </button>
              )}
              <button
                className="button danger"
                onClick={() => {
                  const action = confirm;
                  setConfirm(null);
                  if (action.kind === 'replace') action.action();
                  else if (action.kind === 'revert')
                    changeDoc(prev => ({ ...prev, edits: {}, formulaEdits: {}, log: [] }));
                  else {
                    try {
                      localStorage.removeItem(STORAGE);
                    } catch {
                      setError(
                        t(
                          'تعذر حذف الحفظ المحلي. راجع أذونات المتصفح.',
                          'Could not remove local saved data. Check browser permissions.'
                        )
                      );
                      return;
                    }
                    setDoc(null);
                    setSaved(false);
                    setDetail(null);
                    switchView('overview');
                    setNotice('');
                  }
                }}
              >
                {confirm.kind === 'clear'
                  ? t('مسح', 'Clear')
                  : confirm.kind === 'revert'
                    ? t('استعادة', 'Revert')
                    : t('استبدال', 'Replace')}
              </button>
            </div>
          </section>
        </div>
      )}
      {doc && (
        <div className="print-document">
          <Report printing />
        </div>
      )}
    </>
  );
}

