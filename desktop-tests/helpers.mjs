import { _electron as electron, expect, test } from '@playwright/test';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
export const root = path.resolve(import.meta.dirname, '..');
export async function nav(page, name) {
  const target = page.locator('aside nav').getByRole('button', { name: new RegExp(name) });
  const menu = page.getByRole('button', { name: 'Open menu', exact: true });
  if (await menu.isVisible()) await menu.click();
  try {
    await target.click();
  } catch (error) {
    const state = await page.evaluate(() => ({
      width: innerWidth, height: innerHeight, scale: devicePixelRatio,
      language: document.documentElement.lang,
      navigation: [...document.querySelectorAll('aside nav button')].map(button => button.textContent),
      sidebarDisplay: getComputedStyle(document.querySelector('aside')).display,
    }));
    console.log('Navigation failure:', JSON.stringify(state));
    await page.screenshot({ path: test.info().outputPath('navigation-failure.png') });
    throw error;
  }
}
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
  await expect(page.locator('aside nav')).toBeAttached();
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
