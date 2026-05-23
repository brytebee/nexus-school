/**
 * teachers.spec.js — Feature Guide: Teacher Registry
 *
 * Flow recorded:
 *   1. Navigate to Teachers view
 *   2. Open "Add Teacher" drawer
 *   3. Fill in teacher profile (name, phone, email)
 *   4. Set class allocation + add a subject
 *   5. Append allocation & save
 *   6. Assert the new teacher appears in the registry table
 *
 * Video is auto-saved to tests/e2e/videos/ by playwright.config.js
 */

const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./helpers/launch');
const { injectHighlighter, showCaption, hideCaption, clickWithHalo } = require('./helpers/ui-highlight');

test('Feature Guide — Teacher Registry: Add a Teacher', async () => {
  const { app, window } = await launchApp('Diamond');
  await injectHighlighter(window);

  // ── Step 1: Navigate to Teachers view ─────────────────────────────────────
  await showCaption(window, '👩‍🏫 Opening the Teacher Registry…');
  await clickWithHalo(window, '.nav-item[data-view="teachers"]');
  await window.waitForSelector('#view-teachers', { timeout: 20_000 });
  await window.waitForTimeout(800);

  // ── Step 2: Open the Add Teacher drawer ───────────────────────────────────
  await clickWithHalo(window, 'button:has-text("Add Teacher")', '➕ Click "Add Teacher" to open the profile drawer');
  await window.waitForSelector('#add-teacher-drawer', { timeout: 15_000 });
  await window.waitForTimeout(600);

  // ── Step 3: Fill in profile details ───────────────────────────────────────
  await showCaption(window, '✏️ Filling in teacher profile details…');
  await window.fill('#wiz-tch-name', 'Jane Doe');
  await window.waitForTimeout(400);
  await window.fill('#wiz-tch-phone', '2348011112222');
  await window.waitForTimeout(400);
  await window.fill('#wiz-tch-email', 'jane@example.com');
  await window.waitForTimeout(600);

  // ── Step 4: Set class allocation ──────────────────────────────────────────
  await showCaption(window, '🏷️ Setting class allocation for the teacher…');
  await window.fill('#wiz-alloc-class', 'JSS1');
  await window.waitForTimeout(500);

  // Add a subject
  await window.fill('#tch-custom-subj', 'Mathematics');
  await window.waitForTimeout(400);
  await clickWithHalo(
    window,
    '#add-teacher-drawer button:has-text("Add +")',
    '📚 Adding subject to the allocation…'
  );
  await window.waitForTimeout(600);

  // ── Step 5: Append allocation ─────────────────────────────────────────────
  await clickWithHalo(
    window,
    '#add-teacher-drawer button:has-text("Append Allocation")',
    '📎 Appending the class allocation…'
  );
  await window.waitForTimeout(700);

  // ── Step 6: Save teacher ──────────────────────────────────────────────────
  await clickWithHalo(window, 'button:has-text("Save Teacher")', '💾 Saving teacher profile…');
  await window.waitForTimeout(1200);

  // ── Assertion: new teacher appears in the registry table ──────────────────
  await showCaption(window, '✅ Verifying Jane Doe appears in the Teacher Registry…');
  const teacherCell = window.locator('table >> text=Jane Doe').first();
  await expect(teacherCell).toBeVisible({ timeout: 15_000 });

  await window.waitForTimeout(1500);
  await hideCaption(window);

  await closeApp(app);
});
