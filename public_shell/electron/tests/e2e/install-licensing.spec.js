/**
 * install-licensing.spec.js — Feature Guides:
 *   - 04-install-licensing.md
 *   - 05-settings-identity-stamp.md
 *   - 06-settings-download-templates.md
 *   - 07-settings-add-device.md
 *
 * Simulates:
 *   1. Identity branding (crest logo upload, colors, metadata)
 *   2. Stamp Studio style selection (Classic Seal, Rect, etc.)
 *   3. Spreadsheet template downloads
 *   4. About screen plan and license status checking
 */

const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./helpers/launch');
const { injectHighlighter, showCaption, hideCaption, clickWithHalo } = require('./helpers/ui-highlight');

test('Feature Guide — School Identity, Stamps, and Templates', async () => {
  // Cooldown delay
  await new Promise(resolve => setTimeout(resolve, 3000));

  const { app, window } = await launchApp('Diamond');
  await injectHighlighter(window);

  // ── Step 1: Navigate to Settings view ─────────────────────────────────────
  await showCaption(window, '⚙️ Opening the School Identity Forge…');
  await clickWithHalo(window, '.nav-item[data-view="settings"]');
  await window.waitForSelector('#view-settings', { timeout: 20_000 });
  await window.waitForTimeout(800);

  // ── Step 2: Fill branding metadata ────────────────────────────────────────
  await showCaption(window, '✏️ Customising school identity details (Name, Address, Motto)…');
  await window.fill('#school-name-input', "St. Jude's Private Academy");
  await window.waitForTimeout(400);
  await window.fill('#school-address-input', "12, Commercial Road, Yaba, Lagos");
  await window.waitForTimeout(400);
  await window.fill('#school-motto-input', "Knowledge and Integrity");
  await window.waitForTimeout(400);
  await window.fill('#school-signature-input', "Mrs. Adaeze Okonkwo");
  await window.waitForTimeout(600);

  // ── Step 3: Configure brand theme colors ───────────────────────────────────
  await showCaption(window, '🎨 Choosing primary and accent colors to style the system and report cards…');
  await window.fill('#theme-primary', '#1A237E');
  await window.dispatchEvent('#theme-primary', 'input');
  await window.waitForTimeout(500);
  await window.fill('#theme-secondary', '#00E5FF');
  await window.dispatchEvent('#theme-secondary', 'input');
  await window.waitForTimeout(800);

  // ── Step 4: Configure the Official Seal / Stamp style ───────────────────────
  await showCaption(window, '🖋️ Stamp Studio: Selecting Classic Round school seal style…');
  const classicSealOption = window.locator('.stamp-option >> text=Classic Seal');
  await expect(classicSealOption).toBeVisible({ timeout: 10000 });
  await clickWithHalo(window, classicSealOption);
  await window.waitForTimeout(1500);

  await showCaption(window, '🖋️ Stamp Studio: Previewing Modern Rect badge seal style…');
  const modernRectOption = window.locator('.stamp-option >> text=Modern Rect');
  await clickWithHalo(window, modernRectOption);
  await window.waitForTimeout(1500);

  // ── Step 5: Save Settings ─────────────────────────────────────────────────
  await clickWithHalo(window, '#save-identity-btn', '💾 Saving school branding and identity shard to secure disk…');
  await window.waitForTimeout(1500);

  // ── Step 6: Download CSV templates ────────────────────────────────────────
  await showCaption(window, '📥 Downloading pre-formatted CSV template for Teachers roster…');
  const dlTeachers = window.locator('a:has-text("Download Teachers.csv")');
  await expect(dlTeachers).toBeVisible({ timeout: 10000 });
  await clickWithHalo(window, dlTeachers);
  await window.waitForTimeout(1000);

  await showCaption(window, '📥 Downloading pre-formatted CSV template for Students roster…');
  const dlStudents = window.locator('a:has-text("Download Students.csv")');
  await expect(dlStudents).toBeVisible({ timeout: 10000 });
  await clickWithHalo(window, dlStudents);
  await window.waitForTimeout(1000);

  // ── Step 7: Inspect Plan & License details ──────────────────────────────────
  await showCaption(window, 'ℹ️ Opening About screen to check plan and license fingerprint…');
  await clickWithHalo(window, '.nav-item[data-view="about"]');
  await window.waitForSelector('#view-about', { timeout: 15_000 });
  await window.waitForTimeout(1200);

  await showCaption(window, '✅ Verification complete! Brand settings, seals, and templates initialized.');
  await window.waitForTimeout(1500);
  await hideCaption(window);

  await closeApp(app);
});
