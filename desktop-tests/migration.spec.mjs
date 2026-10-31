import { test, expect } from '@playwright/test';
import { launch, nav, saved } from './helpers.mjs';
import { launchPortable } from './portable.mjs';

test('installed and portable editions share saved work across restart and upgrade', async ({}, info) => {
  test.skip(!process.env.ED_AUDIT_MIGRATION_EXECUTABLES, 'Executed by the Windows installation smoke test');
  const executables = JSON.parse(process.env.ED_AUDIT_MIGRATION_EXECUTABLES);
  const profile = process.env.ED_AUDIT_MIGRATION_PROFILE || info.outputPath('shared-profile');
  for (const [index, executable] of executables.entries()) {
    const portable = /-Portable\.exe$/i.test(executable);
    const { app, page } = await (portable ? launchPortable(profile, executable) : launch(profile, executable));
    try {
      if (index === 0 && executables.length > 1) {
        await expect(page.getByRole('button', { name: 'Explore a synthetic example', exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Explore a synthetic example', exact: true }).click();
        await nav(page, 'Data & amendments');
        await page.getByRole('textbox', { name: 'Cluster reviewer C28', exact: true }).fill('Migration Reviewer');
        await saved(page);
        await nav(page, 'Saved reviews');
        await page.getByRole('textbox', { name: 'Restore point name (optional)', exact: true }).fill('Migration checkpoint');
        await page.getByRole('button', { name: 'Save restore point', exact: true }).click();
        await expect(page.getByText('Dated restore point saved.', { exact: true })).toBeVisible();
      } else {
        await nav(page, 'Data & amendments');
        await expect(page.getByRole('textbox', { name: 'Cluster reviewer C28', exact: true })).toHaveValue('Migration Reviewer');
      }
      await nav(page, 'Saved reviews');
      await expect(page.locator('article.library-review')).toHaveCount(1);
      await page.getByRole('button', { name: 'Saved versions', exact: true }).click();
      await expect(page.locator('.library-version').filter({ hasText: 'Migration checkpoint' })).toHaveCount(1);
    } finally { await app.close(); }
  }
});
