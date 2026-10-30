const { app, BrowserWindow, dialog, ipcMain, protocol, session, Menu } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const {
  APP_URL, CONTENT_SECURITY_POLICY, isAppUrl, assetPath, isLocalRequest, downloadName,
} = require('./policy.cjs');

protocol.registerSchemesAsPrivileged([{
  scheme: 'audit',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
}]);

// A fixed profile and origin retain localStorage across upgrades and portable runs.
const profile = process.env.ED_AUDIT_PROFILE_DIR || path.join(app.getPath('appData'), 'ED Audit');
app.setPath('userData', path.resolve(profile));
app.setPath('sessionData', path.resolve(profile));
app.setPath('crashDumps', path.join(path.resolve(profile), 'CrashDumps'));
app.setAppUserModelId('ai.edaudit.desktop');

let window;
const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();
else {
  app.on('second-instance', () => {
    if (window?.isMinimized()) window.restore();
    window?.show();
    window?.focus();
  });
  app.on('window-all-closed', () => app.quit());
  app.whenReady().then(start).catch(() => {
    dialog.showErrorBox('ED Audit', 'تعذر تشغيل التطبيق. أعد المحاولة.\nUnable to start the app. Please try again.');
    app.quit();
  });
}

async function start() {
  const assets = path.join(__dirname, '..', 'dist');
  const localSession = session.defaultSession;
  localSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  localSession.setPermissionCheckHandler(() => false);
  localSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !isLocalRequest(details.url) });
  });
  protocol.handle('audit', async request => {
    const filename = assetPath(assets, request.url);
    if (!filename) return new Response('Not found', { status: 404 });
    try {
      const mime = {
        '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
        '.ico': 'image/x-icon', '.woff2': 'font/woff2',
      }[path.extname(filename)];
      if (!mime) return new Response('Not found', { status: 404 });
      return new Response(await fs.readFile(filename), {
        headers: {
          'Content-Type': mime,
          'Content-Security-Policy': CONTENT_SECURITY_POLICY,
          'X-Content-Type-Options': 'nosniff',
        },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
  window = new BrowserWindow({
    title: 'ED Audit | تدقيق بيانات الطوارئ',
    width: 1280,
    height: 850,
    minWidth: 850,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f5f7f7',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged,
      spellcheck: false,
    },
  });
  Menu.setApplicationMenu(null);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault();
  });
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.webContents.on('will-prevent-unload', event => {
    const choice = dialog.showMessageBoxSync(window, {
      type: 'warning',
      title: 'ED Audit',
      message: 'توجد تغييرات غير محفوظة. هل تريد المغادرة؟\nThere are unsaved changes. Close the app?',
      buttons: ['البقاء / Stay', 'المغادرة / Close'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (choice === 1) event.preventDefault();
  });
  localSession.on('will-download', (_event, item) => {
    const filename = downloadName(item.getFilename());
    item.setSaveDialogOptions({
      title: 'حفظ نسخة / Save a copy',
      defaultPath: path.join(app.getPath('downloads'), filename),
    });
    item.once('done', (_event, state) => {
      if (state !== 'completed' && state !== 'cancelled' && window && !window.isDestroyed())
        dialog.showErrorBox('ED Audit', 'تعذر حفظ الملف. أعد المحاولة واختر مجلدًا قابلًا للكتابة.\nCould not save the file. Choose a writable folder and retry.');
    });
  });
  ipcMain.handle('audit:print-report', async (event, language) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame ||
        !isAppUrl(event.senderFrame.url) || !['ar', 'en'].includes(language))
      throw new Error('Unsupported request');
    const ar = language === 'ar';
    try {
      const choice = await dialog.showMessageBox(window, {
        title: 'ED Audit',
        message: ar ? 'اختر طريقة إخراج التقرير' : 'Choose report output',
        buttons: ar ? ['حفظ PDF', 'طباعة', 'إلغاء'] : ['Save PDF', 'Print', 'Cancel'],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
      });
      if (choice.response === 2) return { status: 'cancelled' };
      if (choice.response === 1) {
        const result = await new Promise(resolve => window.webContents.print(
          { silent: false, printBackground: true },
          (success, reason) => resolve({ success, reason })
        ));
        if (!result.success && !/cancel/i.test(result.reason || '')) throw new Error('print');
        return { status: result.success ? 'printed' : 'cancelled' };
      }
      const target = await dialog.showSaveDialog(window, {
        title: ar ? 'حفظ التقرير PDF' : 'Save report PDF',
        defaultPath: path.join(app.getPath('downloads'), 'ED-Audit-Report.pdf'),
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (target.canceled || !target.filePath) return { status: 'cancelled' };
      const pdf = await window.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true });
      await fs.writeFile(target.filePath, pdf);
      return { status: 'saved' };
    } catch {
      dialog.showErrorBox('ED Audit', ar ? 'تعذر إخراج التقرير. اختر مجلدًا قابلًا للكتابة أو تحقق من الطابعة.' :
        'Could not export the report. Choose a writable folder or check the printer.');
      return { status: 'error' };
    }
  });
  window.once('ready-to-show', () => window.show());
  window.on('closed', () => { window = null; });
  await window.loadURL(APP_URL);
}
