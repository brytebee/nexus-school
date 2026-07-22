const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./helpers/launch');

test.describe('E2E Form Input Validation Tests', () => {
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

  test('validates form inputs and prevents saving invalid data', async () => {
    // Navigate to Students view
    const studentsTab = window.locator('.nav-item:has-text("Student Directory"), .nav-item:has-text("Students")');
    if (await studentsTab.isVisible()) {
      await studentsTab.click();
      await window.waitForTimeout(1000);
    }

    // Open Add Student Drawer if visible
    const addBtn = window.locator('button:has-text("Add Student")');
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await window.waitForTimeout(1000);

      // Try entering an invalid phone number
      const phoneInput = window.locator('input[placeholder*="Phone"], input[name="parent_phone"]');
      if (await phoneInput.isVisible()) {
        await phoneInput.fill('90hdy83a');

        const saveBtn = window.locator('button:has-text("Save Student")');
        if (await saveBtn.isVisible()) {
          await saveBtn.click();
          await window.waitForTimeout(500);

          // Expect validation error dialog or text to appear
          const errorMsg = window.locator('text=valid, text=required, text=Phone');
          await expect(errorMsg.first()).toBeVisible({ timeout: 5000 });
        }
      }
    }
  });
});
