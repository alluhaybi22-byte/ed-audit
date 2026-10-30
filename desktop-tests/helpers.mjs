import { _electron as electron, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
export const root = path.resolve(import.meta.dirname, '..');
export const nav = (page, name) => page.locator('aside nav').getByRole('button', { name: new RegExp(name) }).click();
export const saved = page => expect(page.getByRole('button', { name: 'Saved on device', exact: true })).toBeVisible();

export async function launch(profile, executablePath = process.env.ED_AUDIT_EXECUTABLE) {
  const app = await electron.launch({
    executablePath: executablePath || require('electron'),
    args: [...(process.platform === 'linux' ? ['--no-sandbox', '--disable-dev-shm-usage'] : []),
      ...(executablePath ? [] : [root])],
    env: { ...process.env, ED_AUDIT_PROFILE_DIR: profile },
    timeout: 60000,
  });
  const page = await app.firstWindow();
  await expect(page.locator('main')).toBeVisible();
  const english = page.getByRole('button', { name: 'English', exact: true });
  if (await english.isVisible()) await english.click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  return { app, page };
}

export async function downloadTo(app, file, action) {
  await app.evaluate(({ session }, target) => {
    globalThis.auditDownload = new Promise(resolve => {
      session.defaultSession.once('will-download', (_event, item) => {
        item.setSavePath(target);
        item.once('done', (_event, state) => resolve(state));
      });
    });
  }, file);
  await action();
  expect(await app.evaluate(() => globalThis.auditDownload)).toBe('completed');
}
