/**
 * students.spec.js — Feature Guide: Student Registry
 *
 * Flow recorded:
 *   1. Navigate to Students view
 *   2. Open "Add Student" drawer
 *   3. Fill in student + parent profile fields
 *   4. Add a custom subject
 *   5. Save the student
 *   6. Assert the new student appears in the registry table
 *
 * Video is auto-saved to tests/e2e/videos/ by playwright.config.js
 */

const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./helpers/launch');
const { injectHighlighter, showCaption, hideCaption, clickWithHalo } = require('./helpers/ui-highlight');

test('Feature Guide — Student Registry: Enrol a Student', async () => {
  const { app, window } = await launchApp('Diamond');
  await injectHighlighter(window);

  // ── Step 1: Navigate to Students view ─────────────────────────────────────
  await showCaption(window, '🎓 Opening the Student Registry…');
  await clickWithHalo(window, '.nav-item[data-view="students"]');
  await window.waitForSelector('#view-students', { timeout: 20_000 });
  await window.waitForTimeout(800);

  // ── Step 2: Open the Add Student drawer ───────────────────────────────────
  await clickWithHalo(window, 'button:has-text("Add Student")', '➕ Click "Add Student" to open the enrolment drawer');
  await window.waitForSelector('#add-student-drawer', { timeout: 15_000 });
  await window.waitForTimeout(600);

  // ── Step 3: Fill in student profile details ───────────────────────────────
  await showCaption(window, '✏️ Filling in student profile…');
  await window.fill('#stu-add-name', 'Obi Emeka');
  await window.waitForTimeout(400);
  await window.fill('#stu-add-class', 'SS1 Gold');
  await window.waitForTimeout(400);
  await window.fill('#stu-add-regno', 'REG-100452');
  await window.waitForTimeout(400);

  await showCaption(window, '⚧ Selecting student gender…');
  await window.selectOption('#stu-add-gender', 'M');
  await window.waitForTimeout(500);

  // ── Step 4: Fill parent / guardian details ────────────────────────────────
  await showCaption(window, '👨‍👩‍👦 Filling in parent / guardian details…');
  await window.fill('#stu-add-pname', 'Emeka Senior');
  await window.waitForTimeout(400);
  await window.fill('#stu-add-pphone', '2348033334444');
  await window.waitForTimeout(600);

  // ── Step 5: Add a custom subject ──────────────────────────────────────────
  await showCaption(window, '📚 Adding a custom subject to the student…');
  await window.fill('#stu-custom-subj', 'Civic Education');
  await window.waitForTimeout(400);
  await clickWithHalo(
    window,
    '#add-student-drawer button:has-text("Add +")',
    '📚 Appending subject to student profile…'
  );
  await window.waitForTimeout(600);

  // ── Step 6: Save student ──────────────────────────────────────────────────
  await clickWithHalo(window, 'button:has-text("Save Student")', '💾 Saving student profile to database…');
  await window.waitForTimeout(1200);

  // ── Assertion: new student appears in the registry table ──────────────────
  await showCaption(window, '✅ Verifying Obi Emeka appears in the Student Registry…');
  const studentCell = window.locator('table >> text=Obi Emeka').first();
  await expect(studentCell).toBeVisible({ timeout: 15_000 });

  await window.waitForTimeout(1500);
  await hideCaption(window);

  await closeApp(app);
});
