import { Component, type ReactNode } from 'react';
import Workspace from './ui.jsx';

const STORAGE = 'miyar-ed-workspace-v1';

class AuditErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean; storageError: boolean }> {
  state = { failed: false, storageError: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const ar = document.documentElement.lang !== 'en';
    const t = (arabic: string, english: string) => ar ? arabic : english;
    return (
      <main className="card" role="alert" style={{ maxWidth: 640, margin: '10vh auto', padding: 32 }}>
        <h1>{t('تعذر عرض المراجعة', 'The audit could not be displayed')}</h1>
        <p>{t(
          'حدث خطأ غير متوقع. يمكنك إعادة المحاولة لاستعادة آخر حفظ، أو تنزيل الحفظ المحلي للاحتفاظ به قبل بدء مراجعة جديدة.',
          'An unexpected error occurred. Retry to restore the last saved audit, or download the saved copy before starting a new audit.'
        )}</p>
        <div className="confirm-actions">
          <button className="button primary" onClick={() => this.setState({ failed: false, storageError: false })}>
            {t('إعادة المحاولة', 'Retry')}
          </button>
          <button className="button secondary" onClick={() => window.location.reload()}>
            {t('إعادة تحميل الصفحة', 'Reload page')}
          </button>
          <button className="button secondary" onClick={() => {
            try {
              const raw = localStorage.getItem(STORAGE);
              if (raw) {
                const href = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
                const link = document.createElement('a');
                link.href = href;
                link.download = 'ED-Audit-Recovery.json';
                link.click();
                setTimeout(() => URL.revokeObjectURL(href), 1000);
              }
            } catch { this.setState({ storageError: true }); }
          }}>
            {t('تنزيل الحفظ المحلي', 'Download saved copy')}
          </button>
          <button className="button danger" onClick={() => {
            if (!window.confirm(t(
              'هل تريد حذف الحفظ المحلي وبدء مراجعة جديدة؟ نزّل نسخة منه أولًا إذا أردت الاحتفاظ به.',
              'Delete the saved audit and start again? Download a copy first if you want to keep it.'
            ))) return;
            try {
              localStorage.removeItem(STORAGE);
              this.setState({ failed: false, storageError: false });
            } catch { this.setState({ storageError: true }); }
          }}>
            {t('حذف الحفظ وبدء مراجعة جديدة', 'Delete saved audit and start again')}
          </button>
        </div>
        {this.state.storageError && <p>{t('تعذر الوصول إلى الحفظ المحلي. راجع أذونات المتصفح.', 'Could not access browser storage. Check browser permissions.')}</p>}
      </main>
    );
  }
}

export default function App() {
  return <AuditErrorBoundary><Workspace /></AuditErrorBoundary>;
}
