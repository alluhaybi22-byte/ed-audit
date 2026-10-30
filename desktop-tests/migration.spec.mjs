import { test, expect } from '@playwright/test';
import { launch, nav, saved } from './helpers.mjs';

test('installed and portable editions share saved work across restart and upgrade', async ({}, info) => {
  test.skip(!process.env.ED_AUDIT_MIGRATION_EXECUTABLES, 'Executed by the Windows installation smoke test');
  const executables = JSON.parse(process.env.ED_AUDIT_MIGRATION_EXECUTABLES);
  const profile = process.env.ED_AUDIT_MIGRATION_PROFILE || info.outputPath('shared-profile');
  for (const executable of executables) {
    const { app, page } = await launch(profile, executable);
    try {
      if (await page.getByRole('button', { name: 'Explore a synthetic example', exact: true }).isVisible()) {
        await page.getByRole('button', { name: 'Explore a synthetic example', exact: true }).click();
        await nav(page, 'Data & amendments');
        await page.getByRole('textbox', { name: 'Cluster reviewer C28', exact: true }).fill('Migration Reviewer');
        await saved(page);
      } else {
        await nav(page, 'Data & amendments');
        await expect(page.getByRole('textbox', { name: 'Cluster reviewer C28', exact: true })).toHaveValue('Migration Reviewer');
      }
    } finally { await app.close(); }
  }
});
