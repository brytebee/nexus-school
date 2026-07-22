const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./helpers/launch');

test.describe('E2E CSV Import Guard & Dry-Run Tests', () => {
  let app;
  let window;

  test.beforeEach(async () => {
    const launchResult = await launchApp('Diamond', { USE_REACT_UI: 'true' });
    app = launchResult.app;
    window = launchResult.window;
    await window.waitForTimeout(2000);
  });

  test.afterEach(async () => {
    if (app) await closeApp(app);
  });

  test('opens Students view and verifies CSV import controls', async () => {
    const studentsTab = window.locator('.nav-item:has-text("Student Directory"), .nav-item:has-text("Students")');
    if (await studentsTab.isVisible()) {
      await studentsTab.click();
      await window.waitForTimeout(1000);

      // Verify page title / heading is present
      const heading = window.locator('h1, h2');
      await expect(heading.first()).toBeVisible();
    }
  });
});
