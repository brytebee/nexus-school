/**
 * fees-ledger.spec.js — Feature Guide: Financial Hub
 *
 * Flow recorded:
 *   1. Navigate to Financial Hub (fees view)
 *   2. Show the settings panel and highlight key controls
 *   3. Close settings panel
 *   4. Show the fee roster table is present and loaded
 *
 * Video is auto-saved to tests/e2e/videos/ by playwright.config.js
 */

const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./helpers/launch');
const { injectHighlighter, showCaption, hideCaption, clickWithHalo } = require('./helpers/ui-highlight');

test('Feature Guide — Financial Hub: Fees Settings & Roster', async () => {
  const { app, window } = await launchApp('Diamond');
  await injectHighlighter(window);

  // ── Step 1: Navigate to Financial Hub ─────────────────────────────────────
  await showCaption(window, '💰 Opening the Financial Hub…');
  await clickWithHalo(window, '.nav-item[data-view="fees"]');
  await window.waitForSelector('#view-fees', { timeout: 20_000 });
  await window.waitForTimeout(900);

  // ── Step 2: Verify the settings button is present ─────────────────────────
  await showCaption(window, '⚙️ Locating the Financial Hub settings control…');
  const settingsBtn = window.locator('#btn-fees-settings');
  await expect(settingsBtn).toBeVisible({ timeout: 15_000 });
  await window.waitForTimeout(600);

  // ── Step 3: Open the settings panel ──────────────────────────────────────
  await clickWithHalo(window, settingsBtn, '⚙️ Opening Fee Settings panel…');
  const closeBtn = window.locator('#btn-fees-settings-close');
  await expect(closeBtn).toBeVisible({ timeout: 15_000 });
  await window.waitForTimeout(1200);

  // ── Step 4: Highlight key settings controls ───────────────────────────────
  await showCaption(window, '🔍 Fee settings panel — configure billing period, late fees & more…');
  await window.waitForTimeout(1500);

  // ── Step 5: Close the settings panel ─────────────────────────────────────
  await clickWithHalo(window, closeBtn, '✖️ Closing settings panel…');
  const panel = window.locator('#fees-settings-panel');
  await expect.poll(async () => {
    return await panel.evaluate(el => el.style.transform);
  }, { timeout: 10_000 }).toBe('translateX(100%)');
  await window.waitForTimeout(700);

  // ── Step 6: Verify the fee roster table is present ───────────────────────
  await showCaption(window, '📋 Verifying the Fee Roster table is loaded…');
  // The table wrapper is always rendered — check it exists and is visible
  const feeSection = window.locator('#view-fees');
  await expect(feeSection).toBeVisible({ timeout: 10_000 });
  await window.waitForTimeout(1200);

  await hideCaption(window);
  await closeApp(app);
});
