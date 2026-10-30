import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

// NSIS forwards Chromium flags, but does not forward the child Electron
// inspector's stderr pipe required by _electron.launch. Test the real portable
// launcher through a loopback CDP port instead; production enables no such port.
export async function launchPortable(profile, executable) {
  const port = await availablePort();
  const child = spawn(executable, [
    ...(process.platform === 'linux' ? ['--no-sandbox', '--disable-dev-shm-usage'] : []),
    `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1',
  ], { env: { ...process.env, ED_AUDIT_PROFILE_DIR: profile }, stdio: 'ignore' });
  let spawnError;
  child.on('error', error => { spawnError = error; });
  let browser;
  const deadline = Date.now() + 60000;
  try {
    while (!browser && Date.now() < deadline) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null && child.exitCode !== 0)
        throw new Error(`Portable launcher exited with code ${child.exitCode}`);
      try {
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 });
      } catch {
        await new Promise(resolve => setTimeout(resolve, 250));
      }
    }
    if (!browser) throw new Error('Portable application did not expose its test CDP endpoint');
    const context = browser.contexts()[0];
    const page = context.pages()[0] || await context.waitForEvent('page');
    await page.waitForURL(/^audit:\/\/app\//);
    await page.locator('main').waitFor();
    const english = page.getByRole('button', { name: 'English', exact: true });
    if (await english.isVisible()) await english.click();
    await page.locator('html[lang="en"]').waitFor();
    return {
      page,
      app: {
        async close() {
          const closed = page.waitForEvent('close', { timeout: 15000 });
          await page.evaluate(() => window.close()).catch(error => {
            if (!page.isClosed()) throw error;
          });
          await closed;
          await browser.close();
          if (child.exitCode === null) await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Portable launcher did not exit')), 15000);
            child.once('exit', () => { clearTimeout(timer); resolve(); });
          });
        },
      },
    };
  } catch (error) {
    await browser?.close().catch(() => {});
    child.kill();
    throw error;
  }
}
