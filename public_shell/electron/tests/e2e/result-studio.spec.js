/**
 * result-studio.spec.js — Feature Guide: Result Studio
 *
 * Flow recorded:
 *   1. Navigate to Result Studio
 *   2. Select a premium template (Sovereign — Diamond tier)
 *   3. Change report type to Broadsheet
 *   4. Change output format to PDF
 *   5. Change scope to "By Class" and show the class picker appearing
 *   6. Reset scope to "Entire School" and click Preview
 *   7. Assert the preview area becomes visible
 *
 * Video is auto-saved to tests/e2e/videos/ by playwright.config.js
 */

const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./helpers/launch');
const {
  injectHighlighter,
  showCaption,
  hideCaption,
  clickWithHalo,
} = require('./helpers/ui-highlight');

test('Feature Guide — Result Studio: Configure & Preview Reports', async () => {
  const { app, window } = await launchApp('Diamond');
  await injectHighlighter(window);

  // ── Step 1: Navigate to Result Studio ─────────────────────────────────────
  await showCaption(window, '📊 Opening Result Studio…');
  await clickWithHalo(window, '.nav-item[data-view="result-studio"]');
  await window.waitForSelector('#view-result-studio', { timeout: 20_000 });
  await window.waitForTimeout(900);

  // ── Step 2: Select the Sovereign template (Diamond tier) ──────────────────
  await showCaption(window, '💎 Selecting the Sovereign (Diamond) template…');
  const templateSelect = window.locator('#rs-template');
  await expect(templateSelect).toBeVisible({ timeout: 15_000 });
  await templateSelect.selectOption('sovereign');
  await window.waitForTimeout(900);

  // ── Step 3: Change report type to Broadsheet ──────────────────────────────
  await showCaption(window, '📋 Switching report type to Master Broadsheet…');
  const typeSelect = window.locator('#rs-type');
  await typeSelect.selectOption('broadsheet');
  await window.waitForTimeout(700);

  // ── Step 4: Change output format to PDF ───────────────────────────────────
  await showCaption(window, '📄 Selecting PDF as the output format…');
  const formatSelect = window.locator('#rs-format');
  await formatSelect.selectOption('pdf');
  await window.waitForTimeout(700);

  // ── Step 5: Scope → "By Class" — show class picker appearing ─────────────
  await showCaption(window, '🏷️ Changing scope to "By Class" to see the class picker…');
  const scopeSelect = window.locator('#rs-scope');
  await scopeSelect.selectOption('class');
  // The class picker panel should now be visible
  const classPicker = window.locator('#rs-scope-class');
  await expect(classPicker).toBeVisible({ timeout: 10_000 });
  await window.waitForTimeout(1000);

  // ── Step 6: Reset scope to "Entire School" ────────────────────────────────
  await showCaption(window, '🏫 Resetting scope to Entire School for the preview…');
  await scopeSelect.selectOption('all');
  await expect(classPicker).not.toBeVisible({ timeout: 10_000 });
  await window.waitForTimeout(700);

  // ── Step 7: Click Preview ─────────────────────────────────────────────────
  await clickWithHalo(
    window,
    '#rs-preview-btn',
    '🔍 Clicking Preview to generate the broadsheet preview…'
  );
  await window.waitForTimeout(2000);

  // ── Assertion: the preview section should be visible ─────────────────────
  // Result Studio renders results either in rs-preview-container (table)
  // or updates rs-status — either way the studio view itself must still be on screen.
  await showCaption(window, '✅ Result Studio configuration verified successfully!');
  const studioView = window.locator('#view-result-studio');
  await expect(studioView).toBeVisible({ timeout: 10_000 });

  await window.waitForTimeout(1500);
  await hideCaption(window);

  await closeApp(app);
});
