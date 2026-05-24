/**
 * helpers/launch.js
 *
 * Shared Electron launcher for all Nexus School OS E2E specs.
 *
 * Usage:
 *   const { launchApp, closeApp } = require('./helpers/launch');
 *   const { app, window } = await launchApp();
 *   // ... test actions ...
 *   await closeApp(app);
 */

const { _electron: electron, test } = require('@playwright/test');
const path = require('path');

// Root of the Electron project
const APP_ROOT = path.resolve(__dirname, '..', '..', '..');

/**
 * Launches the Nexus School OS Electron app in Developer mode.
 *
 * DEV_MODE=true        → bypasses hardware license checks
 * DEV_AUTO_LOGIN=true  → skips the lock screen, lands straight on index.html
 * DEV_MOCK_TIER=Diamond → gives the session full Diamond-tier access
 *
 * @returns {{ app: ElectronApplication, window: Page }}
 */
async function launchApp(tier = 'Diamond', extraEnv = {}) {
  let recordVideo;
  try {
    const info = test.info();
    if (info) {
      recordVideo = {
        dir: info.outputDir,
        size: { width: 1920, height: 1080 }
      };
    }
  } catch (e) {
    // Fallback if called outside a test context
    recordVideo = {
      dir: path.resolve(__dirname, '..', 'videos'),
      size: { width: 1920, height: 1080 }
    };
  }

  const app = await electron.launch({
    args: [APP_ROOT],
    recordVideo,
    env: {
      ...process.env,
      DEV_MODE: 'true',
      DEV_AUTO_LOGIN: 'true',
      DEV_MOCK_TIER: tier,
      ...extraEnv,
    },
  });

  // firstWindow() waits until the BrowserWindow has finished loading.
  // 60 s budget: Electron has heavy native deps (better-sqlite3, bonjour, pulse-bot)
  // that can take 20-40 s on a cold start.
  const window = await app.firstWindow({ timeout: 60_000 });

  // Log renderer process exceptions to the terminal
  window.on('pageerror', (err) => console.log('RENDERER EXCEPTION:', err.message || err));

  // Wait for the sidebar nav to be ready — it's the earliest reliable signal
  // that the main index.html has fully booted and the IPC bridge is live.
  await window.waitForSelector('.nav-item', { timeout: 45_000 });

  return { app, window };
}

/**
 * Gracefully closes the Electron app and waits for the process to exit.
 * @param {ElectronApplication} app
 */
async function closeApp(app) {
  await app.close();
}

module.exports = { launchApp, closeApp };
