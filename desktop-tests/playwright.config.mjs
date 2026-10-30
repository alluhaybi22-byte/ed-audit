import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.mjs',
  workers: 1,
  fullyParallel: false,
  timeout: 90000,
  expect: { timeout: 15000 },
  outputDir: '../test-results/desktop',
  reporter: [['list'], ['json', { outputFile: '../test-results/desktop-results.json' }]],
});
