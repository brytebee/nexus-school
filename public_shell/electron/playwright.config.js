const { defineConfig } = require('@playwright/test');
const path = require('path');

/**
 * Playwright config for Nexus School OS — Desktop E2E + Video Guide Automation.
 *
 * - Targets the Electron app directly via @playwright/test _electron helper.
 * - slowMo: 700ms makes each action human-readable in exported video guides.
 * - Video is always recorded and saved to tests/e2e/videos/<spec-name>/.
 * - Screenshots are taken on every test step failure for quick debugging.
 * - HTML reporter generates a browsable report in test-results/html-report/.
 */

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 180_000,         // 3 min per test: Electron boot (~20s) + slowMo actions
  expect: {
    timeout: 20_000,        // 20 s for each assertion
  },

  // Run one test at a time — Electron can only have one live instance.
  workers: 1,
  fullyParallel: false,

  reporter: [
    ['list'],
    ['html', {
      outputFolder: path.join(__dirname, 'test-results', 'html-report'),
      open: 'never',
    }],
  ],

  use: {
    // slowMo makes video guides readable without extra sleep() calls.
    launchOptions: {
      slowMo: 700,
    },
    // Video is saved for every test regardless of outcome.
    video: {
      mode: 'on',
      size: { width: 1920, height: 1080 },
    },
    // Trace configuration for debugging multi-window specs
    trace: 'on-first-retry',
    // Screenshot on failure for debugging.
    screenshot: 'only-on-failure',
    // Default video output directory (Playwright appends test name automatically).
    // Individual specs may override this path via test.use({ ... }).
  },

  // Playwright stores videos, traces, and screenshots here.
  outputDir: path.join(__dirname, 'tests', 'e2e', 'videos'),
});
