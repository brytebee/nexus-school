/**
 * web-onboarding.spec.js — Feature Guides:
 *   - 01-web-register-verify.md
 *   - 02-web-payment-silver.md
 *   - 03-web-payment-gold.md
 *
 * Simulates:
 *   1. School registration & Admin Email verification
 *   2. Plan selection (Silver & Gold)
 *   3. Online payment checkout & License key generation
 */

const { test, expect } = require('@playwright/test');
const path = require('path');
const { injectHighlighter, showCaption, hideCaption, clickWithHalo } = require('./helpers/ui-highlight');

test('Feature Guide — Web Onboarding: Register, Checkout, and License Key', async ({ page }) => {
  // Cooldown delay
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Handle alert dialogs gracefully
  page.on('dialog', async dialog => {
    console.log('[E2E Onboarding] Dialog showing:', dialog.message());
    await dialog.accept();
  });

  const simulatorPath = 'file://' + path.resolve(__dirname, 'helpers', 'onboarding-simulator.html');
  await page.goto(simulatorPath);
  await page.waitForSelector('.card', { timeout: 15000 });
  await injectHighlighter(page);

  // ── Step 1: Web Registration ──────────────────────────────────────────
  await showCaption(page, '🌐 Welcome to the Nexus Partner Hub. Let\'s register a new school…');
  await page.waitForTimeout(1500);

  await showCaption(page, '✏️ Entering School Name, Email, and Phone Number…');
  await page.fill('#reg-school-name', 'St. Jude\'s Private Academy');
  await page.waitForTimeout(600);
  await page.fill('#reg-admin-email', 'principal@stjudes.edu.ng');
  await page.waitForTimeout(600);
  await page.fill('#reg-phone', '+234 803 333 4444');
  await page.waitForTimeout(800);

  await clickWithHalo(page, '#btn-register', '📨 Submitting registration details…');
  await page.waitForSelector('#tab-2', { timeout: 10000 });
  await page.waitForTimeout(1000);

  // ── Step 2: Email Verification ─────────────────────────────────────────
  await showCaption(page, '📧 Simulating email inbox verification…');
  await page.waitForTimeout(1500);
  await clickWithHalo(page, '#btn-verify', '✅ Verifying school admin email address…');
  await page.waitForSelector('#tab-3', { timeout: 10000 });
  await page.waitForTimeout(1000);

  // ── Step 3: Subscription Plans ──────────────────────────────────────────
  await showCaption(page, '🥈 Silver Plan: Base result compiling and templates…');
  await clickWithHalo(page, '#tier-silver');
  await page.waitForTimeout(1500);

  await showCaption(page, '🥇 Gold Plan: Adds Sovereign Parent Portal & WhatsApp Pulse bot notifications…');
  await clickWithHalo(page, '#tier-gold');
  await page.waitForTimeout(1500);

  await clickWithHalo(page, '#btn-checkout', '💳 Proceeding to secure checkout portal…');
  await page.waitForSelector('#tab-4', { timeout: 10000 });
  await page.waitForTimeout(1000);

  // ── Step 4: License Key Generation ──────────────────────────────────────
  await showCaption(page, '🔑 License Key generated! Click to copy…');
  const tokenBox = page.locator('#license-token');
  await expect(tokenBox).toBeVisible({ timeout: 10000 });
  await clickWithHalo(page, tokenBox);
  await page.waitForTimeout(1500);

  await showCaption(page, '✅ Onboarding complete! Ready to input license into the Desktop App.');
  await page.waitForTimeout(2000);
  await hideCaption(page);
});
