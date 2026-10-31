import { useEffect, useState } from 'react';

export default function ReviewLibraryPanel({ library, epoch, currentId, busy, lang, onOpen, onRestore, onDelete, onCheckpoint, onError }) {
  const t = (ar, en) => lang === 'ar' ? ar : en;
  const [reviews, setReviews] = useState([]);
  const [selected, setSelected] = useState(null);
  const [versions, setVersions] = useState([]);
  const [label, setLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [nearCapacity, setNearCapacity] = useState(false);
  const date = value => new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA' : 'en-GB', {
    dateStyle: 'medium', timeStyle: 'short', calendar: 'gregory',
  }).format(new Date(value));
  useEffect(() => {
    let active = true;
    setLoading(true);
    navigator.storage?.estimate?.().then(({ usage, quota }) => {
      if (active && quota > 0) setNearCapacity(usage / quota >= 0.8);
    }).catch(() => {});
    if (!library) { setLoading(false); return; }
    library.list().then(items => { if (active) setReviews(items); })
      .catch(() => { if (active) onError(); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [library, epoch]);
  useEffect(() => {
    let active = true;
    setVersions([]);
    if (library && selected) library.snapshots(selected).then(items => { if (active) setVersions(items); })
      .catch(() => { if (active) onError(); });
    return () => { active = false; };
  }, [library, selected, epoch]);
  return <section className="review-library">
    <div className="card">
      <h2>{t('أرشيف المراجعات على هذا الجهاز', 'Review library on this device')}</h2>
      <p>{t('كل مراجعة مستقلة حسب المنشأة والفترة. النسخ المحلية لا تتزامن مع أجهزة أخرى؛ نزّل JSON للاحتفاظ بنسخة خارج الجهاز.', 'Each review is independent by facility and period. Local copies do not sync to other devices; download JSON to keep an external backup.')}</p>
      <p className="muted">{t('التخزين والنسخ المصدّرة غير مشفّرة. استخدم جهازًا محميًا واحفظ النسخ الحساسة في مكان آمن.', 'Storage and exported backups are not encrypted. Use a protected device and keep sensitive backups in a secure location.')}</p>
      {nearCapacity && <p role="alert">{t('تشير تقديرات الجهاز إلى اقتراب مساحة التخزين المحلية من الامتلاء. نزّل نسخ JSON قبل حذف المراجعات التي لم تعد تحتاجها.', 'Device estimates indicate local storage is nearly full. Download JSON backups before deleting reviews you no longer need.')}</p>}
      <div className="library-checkpoint">
        <label>{t('اسم نقطة الاستعادة (اختياري)', 'Restore point name (optional)')}
          <input value={label} maxLength={120} onChange={event => setLabel(event.target.value)} />
        </label>
        <button className="button primary" disabled={!library || !currentId || busy} onClick={() => onCheckpoint(label)}>
          {t('حفظ نقطة استعادة', 'Save restore point')}
        </button>
      </div>
      {!library && <p role="alert">{t('الأرشيف غير متاح؛ احتفظ بنسخة JSON قبل إغلاق المراجعة.', 'The library is unavailable; keep a JSON backup before closing the review.')}</p>}
    </div>
    {loading ? <p role="status">{t('جارٍ قراءة المراجعات…', 'Loading reviews…')}</p> : reviews.length === 0 ?
      <p>{t('لا توجد مراجعات محفوظة بعد. ابدأ مراجعة أو استورد ملفًا من نظرة عامة.', 'No saved reviews yet. Start a review or import a file from Overview.')}</p> :
      <div className="library-grid">{reviews.map(review => <article className="card library-review" key={review.id} aria-label={review.title}>
        <h3>{review.title}</h3>
        {currentId === review.id && <strong>{t('المراجعة المفتوحة', 'Current review')}</strong>}
        <p>{review.facility || t('منشأة غير محددة', 'Facility not specified')} · {review.month} {review.year}</p>
        <p className="muted">{t('آخر حفظ: ', 'Last saved: ')}{date(review.updatedAt)}</p>
        <div className="library-actions">
          <button className="button primary" disabled={busy} onClick={() => onOpen(review.id)}>{t('فتح المراجعة', 'Open review')}</button>
          <button className="button secondary" disabled={busy} onClick={() => setSelected(selected === review.id ? null : review.id)}>{t('النسخ المؤرخة', 'Saved versions')}</button>
          <button className="button secondary" disabled={busy} onClick={() => onDelete(review.id)}>{t('حذف المراجعة', 'Delete review')}</button>
        </div>
        {selected === review.id && <div className="library-versions">
          <p>{t('تُحتفظ بآخر خمس نسخ تلقائية، وبجميع نقاط الاستعادة المحفوظة يدويًا.', 'The last five automatic copies and all manual restore points are retained.')}</p>
          {versions.length === 0 ? <p>{t('لا توجد نسخ سابقة.', 'No saved versions.')}</p> : versions.map(version => <div className="library-version" key={version.id}>
            <span>{version.kind === 'manual' ? version.label : version.kind === 'recovery' ? t('الحالة قبل الاستعادة', 'Before restoration') : version.kind === 'legacy' ? t('الحفظ القديم المرحّل', 'Migrated legacy save') : t('نسخة تلقائية', 'Automatic copy')} · {date(version.createdAt)}</span>
            <button className="button secondary" disabled={busy} onClick={() => onRestore(review.id, version.id)}>{t('استعادة هذه النسخة', 'Restore this version')}</button>
          </div>)}
        </div>}
      </article>)}</div>}
  </section>;
}
