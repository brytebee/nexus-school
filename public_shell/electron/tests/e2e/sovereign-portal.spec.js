/**
 * sovereign-portal.spec.js — Feature Guide: Sovereign Parent Portal
 *
 * This spec demonstrates the Sovereign Parent Portal (local offline Parents Lookup) using TWO distinct methods:
 *   - Method A: Quick Developer Bypass PIN '0000' (skips WhatsApp messaging completely)
 *   - Method B: Real SQLite Database OTP Queue Extraction (generates real PINs and extracts them programmatically)
 *
 * Videos are recorded and saved separately in tests/e2e/videos/ for the user to examine and choose the best.
 */

const { test, expect, chromium } = require('@playwright/test');
const { launchApp, closeApp } = require('./helpers/launch');
const { injectHighlighter, showCaption, hideCaption, clickWithHalo } = require('./helpers/ui-highlight');
const { execSync } = require('child_process');
const path = require('path');

// Resolve the active SQLite database path used by public_shell/electron
const getActiveDbPath = () => {
  return path.resolve(__dirname, '..', '..', '..', '..', 'private_engine', 'nexus.sqlite');
};

// Seed parent's phone using shell sqlite3 CLI (bypasses Node/Electron version conflict)
const seedParentPhone = (dbPath) => {
  try {
    const query = `sqlite3 "${dbPath}" "UPDATE students SET parent_phone = '2348033334444' WHERE id = 'STU-001';"`;
    execSync(query);
    console.log("[Sovereign Portal E2E] Successfully seeded parent phone number via shell sqlite3 CLI.");
  } catch (err) {
    console.error("[Sovereign Portal E2E] Seeding database failed:", err.message);
  }
};

test.describe('Sovereign Parent Portal Guides', () => {
  // Force sequential execution to avoid native Electron resource conflicts on single worker
  test.describe.configure({ mode: 'serial' });

  // ── Method A: DEV_MODE Hardcoded PIN '0000' Bypass ──────────────────────────────
  test('Method A — Sovereign Parent Portal: Parents Lookup via DEV_MODE Bypass', async () => {
    // Cooldown delay to allow previous Electron processes to free ports
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 1. Launch the Electron app
    const { app, window: electronWindow } = await launchApp('Diamond', { DEV_PORTAL_BYPASS: 'true' });
    await injectHighlighter(electronWindow);
    
    // Seed DB after launch (once Electron has initialized/created the tables)
    const dbPath = getActiveDbPath();
    seedParentPhone(dbPath);
    
    // 2. Open Sovereign Portal view inside Electron app to initialize local broadcaster server
    await clickWithHalo(electronWindow, '.nav-item[data-view="portal"]');
    await electronWindow.waitForTimeout(2000);
    
    // 3. Launch parent phone simulation browser to hit local port 3002
    const browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      recordVideo: {
        dir: path.resolve(__dirname, 'videos', 'sovereign-portal-method-a'),
        size: { width: 1920, height: 1080 }
      }
    });
    const page = await context.newPage();
    page.on('pageerror', (err) => console.log('SIMULATED PAGE EXCEPTION:', err.message || err));
    page.on('console', (msg) => console.log('SIMULATED PAGE CONSOLE:', msg.text()));
    
    // ── Step 1: Open the Sovereign Parent Portal ──────────────────────────────────
    await page.goto('http://127.0.0.1:3002/portal');
    await page.waitForSelector('#view-login', { timeout: 15000 });
    
    // Inject highlighter AFTER page loads / navigation
    await injectHighlighter(page);
    await showCaption(page, '🌐 [Method A] Opening the School Sovereign Parent Portal over local Wi-Fi…');
    await page.waitForTimeout(1500);
    
    // ── Step 2: Input parent phone number ──────────────────────────────────────────
    await showCaption(page, '📱 Inputting parent\'s registered phone number to authenticate identity…');
    const parentPhone = '2348033334444';
    await page.fill('#input-phone', parentPhone);
    await page.waitForTimeout(1000);
    
    // Request OTP Access PIN
    await clickWithHalo(page, '#btn-request-otp', '🔑 Requesting dynamic WhatsApp security access PIN…');
    await page.waitForSelector('#view-pin', { timeout: 15000 });
    await page.waitForTimeout(1500);
    
    // ── Step 3: Enter the Hardcoded DEV Bypass PIN ───────────────────────────────
    const pin = '0000';
    await showCaption(page, `✏️ Entering the Developer hardcoded OTP access PIN: ${pin}…`);
    await page.fill('#input-pin', pin);
    await page.waitForTimeout(1500);
    
    // Click Verify PIN
    await clickWithHalo(page, '#btn-verify-pin', '🔓 Unlocking secure student records…');
    
    // DEV_MODE/DEV_PORTAL_BYPASS returns multiple matching demo students, so select the first child
    await page.waitForSelector('.child-btn', { timeout: 15000 });
    await clickWithHalo(page, '.child-btn >> text=Chidi Abiola', '🎓 Selecting student Chidi Abiola…');
    
    await page.waitForSelector('#view-dashboard', { timeout: 15000 });
    await page.waitForTimeout(2000);
    
    // ── Step 4: Explore parent dashboard results ───────────────────────────────────
    await showCaption(page, '🎓 Parent Dashboard Unlocked! Reviewing child\'s terminal academic results…');
    await page.waitForTimeout(3000);
    
    // Switch to Fees section
    await page.click('.hamburger');
    await page.waitForTimeout(800);
    await clickWithHalo(page, '#ni-fees', '💰 Swapping view to inspect outstanding fee details…');
    await page.waitForSelector('#fees-content', { timeout: 10000 });
    await page.waitForTimeout(3000);
    
    // Switch to Attendance section
    await page.click('.hamburger');
    await page.waitForTimeout(800);
    await clickWithHalo(page, '#ni-attend', '📅 Checking student school attendance records…');
    await page.waitForSelector('#attendance-content', { timeout: 10000 });
    await page.waitForTimeout(3000);
    
    await showCaption(page, '✅ Sovereign Portal [Method A] verified successfully! Closing session.');
    await page.waitForTimeout(2000);
    await hideCaption(page);
    
    // Cleanup
    try {
      await Promise.race([
        Promise.all([context.close(), browser.close()]),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Browser cleanup timed out')), 5000))
      ]);
    } catch (err) {
      console.log('⚠️ Browser cleanup warning:', err.message);
    }
    await closeApp(app);
  });

  // ── Method B: Real SQLite Database OTP Queue Extraction ────────────────────────
  test('Method B — Sovereign Parent Portal: Parents Lookup via Local DB OTP Extraction', async () => {
    // Cooldown delay to allow previous Electron processes to free ports
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 1. Launch the Electron app with DEV_PORTAL_BYPASS=false
    const { app, window: electronWindow } = await launchApp('Diamond', { DEV_PORTAL_BYPASS: 'false' });
    await injectHighlighter(electronWindow);
    
    // Seed DB after launch (once Electron has initialized/created the tables)
    const dbPath = getActiveDbPath();
    seedParentPhone(dbPath);
    
    // 2. Open Sovereign Portal view inside Electron app to initialize local broadcaster server
    await clickWithHalo(electronWindow, '.nav-item[data-view="portal"]');
    await electronWindow.waitForTimeout(2000);
    
    // 3. Launch parent phone simulation browser to hit local port 3002
    const browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      recordVideo: {
        dir: path.resolve(__dirname, 'videos', 'sovereign-portal-method-b'),
        size: { width: 1920, height: 1080 }
      }
    });
    const page = await context.newPage();
    page.on('pageerror', (err) => console.log('SIMULATED PAGE EXCEPTION:', err.message || err));
    page.on('console', (msg) => console.log('SIMULATED PAGE CONSOLE:', msg.text()));
    
    // ── Step 1: Open the Sovereign Parent Portal ──────────────────────────────────
    await page.goto('http://127.0.0.1:3002/portal');
    await page.waitForSelector('#view-login', { timeout: 15000 });
    
    // Inject highlighter AFTER page loads / navigation
    await injectHighlighter(page);
    await showCaption(page, '🌐 [Method B] Opening the School Sovereign Parent Portal over local Wi-Fi…');
    await page.waitForTimeout(1500);
    
    // ── Step 2: Input parent phone number ──────────────────────────────────────────
    await showCaption(page, '📱 Inputting parent\'s registered phone number to authenticate identity…');
    const parentPhone = '2348033334444';
    await page.fill('#input-phone', parentPhone);
    await page.waitForTimeout(1000);
    
    // Request OTP Access PIN
    await clickWithHalo(page, '#btn-request-otp', '🔑 Requesting dynamic WhatsApp security access PIN…');
    await page.waitForSelector('#view-pin', { timeout: 15000 });
    await page.waitForTimeout(1500);
    
    // ── Step 3: Fetch PIN from SQLite Database ─────────────────────────────────────
    await showCaption(page, '🔒 Programmatically extracting the real WhatsApp OTP PIN from the secure offline SQLite DB…');
    await page.waitForTimeout(1500);

    let pin = '1234'; // Default fallback if query fails
    try {
      const query = `sqlite3 "${dbPath}" "SELECT message FROM pending_pulse_messages WHERE phone LIKE '%${parentPhone.slice(-10)}' ORDER BY id DESC LIMIT 1;"`;
      const message = execSync(query).toString().trim();
      if (message) {
        const pinMatch = message.match(/\d{4}/);
        if (pinMatch) {
          pin = pinMatch[0];
        }
      }
    } catch (err) {
      console.error("[Sovereign Portal E2E] sqlite3 exec failed:", err.message);
    }
    
    await showCaption(page, `✏️ Entering the auto-retrieved WhatsApp OTP access PIN: ${pin}…`);
    await page.fill('#input-pin', pin);
    await page.waitForTimeout(1500);
    
    // Click Verify PIN
    await clickWithHalo(page, '#btn-verify-pin', '🔓 Unlocking secure student records…');
    
    // Check if the "Select Child" screen is displayed (multiple children scenario)
    try {
      const childBtn = page.locator('.child-btn >> text=Chidi Abiola');
      await childBtn.waitFor({ state: 'visible', timeout: 5000 });
      await clickWithHalo(page, childBtn, '🎓 Selecting student Chidi Abiola…');
    } catch (e) {
      console.log("[Sovereign Portal E2E] No child selection screen displayed. Proceeding directly to dashboard.");
    }
    
    await page.waitForSelector('#view-dashboard', { timeout: 15000 });
    await page.waitForTimeout(2000);
    
    // ── Step 4: Explore parent dashboard results ───────────────────────────────────
    await showCaption(page, '🎓 Parent Dashboard Unlocked! Reviewing child\'s terminal academic results…');
    await page.waitForTimeout(3000);
    
    // Switch to Fees section
    await page.click('.hamburger');
    await page.waitForTimeout(800);
    await clickWithHalo(page, '#ni-fees', '💰 Swapping view to inspect outstanding fee details…');
    await page.waitForSelector('#fees-content', { timeout: 10000 });
    await page.waitForTimeout(3000);
    
    // Switch to Attendance section
    await page.click('.hamburger');
    await page.waitForTimeout(800);
    await clickWithHalo(page, '#ni-attend', '📅 Checking student school attendance records…');
    await page.waitForSelector('#attendance-content', { timeout: 10000 });
    await page.waitForTimeout(3000);
    
    await showCaption(page, '✅ Sovereign Portal [Method B] verified successfully! Closing session.');
    await page.waitForTimeout(2000);
    await hideCaption(page);
    
    // Cleanup
    try {
      await Promise.race([
        Promise.all([context.close(), browser.close()]),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Browser cleanup timed out')), 5000))
      ]);
    } catch (err) {
      console.log('⚠️ Browser cleanup warning:', err.message);
    }
    await closeApp(app);
  });

});
