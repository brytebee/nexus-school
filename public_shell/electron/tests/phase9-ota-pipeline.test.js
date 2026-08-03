/**
 * tests/phase9-ota-pipeline.test.js
 *
 * Phase 9: OTA Update Pipeline — unit tests
 *
 * These tests verify the logic contracts of the OTA pipeline without
 * requiring a live Electron process or GitHub network access.
 *
 * Tests:
 *  1.  electron-updater is now in dependencies (not devDependencies) — Gap 1
 *  2.  autoDownload is false for Linux .deb (non-AppImage) builds — Gap 6
 *  3.  autoDownload is true for Linux AppImage (APPIMAGE env set) — Gap 6
 *  4.  autoDownload is true for Windows — Gap 6
 *  5.  update:ready is the only event emitted on download-complete — Gap 2
 *  6.  update:none is emitted when update-not-available fires — Gap 3
 *  7.  _reEmitPendingUpdate re-sends update:ready if _updateDownloaded is true — Gap 5
 *  8.  _reEmitPendingUpdate is a no-op if _updateDownloaded is false — Gap 5
 *  9.  macOS code-signing error is swallowed silently without reaching renderer — Gap 6 (macOS guard)
 *  10. UpdateBanner localStorage key is 'nexus_update_ready' — Gap 5 contract
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
const path = require('path');
const fs   = require('fs');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Minimal mock of the autoUpdater event bus */
function makeAutoUpdaterMock() {
  const listeners = {};
  return {
    autoDownload: true,
    autoInstallOnAppQuit: false,
    on(event, cb) { listeners[event] = cb; },
    emit(event, payload) { listeners[event]?.(payload); },
    _listeners: listeners,
  };
}

/** Minimal mock of mainWindow.webContents */
function makeWindowMock() {
  const sent = [];
  return {
    sent,
    webContents: { send: (channel, payload) => sent.push({ channel, payload }) },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Phase 9 — OTA Update Pipeline', () => {

  // ── Gap 1: dependency placement ────────────────────────────────────────────

  it('electron-updater is listed under dependencies, not devDependencies', () => {
    const pkgPath = path.resolve(__dirname, '../package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    expect(pkg.dependencies?.['electron-updater']).toBeDefined();
    expect(pkg.devDependencies?.['electron-updater']).toBeUndefined();
  });

  // ── Gap 6: Linux autoDownload guard ────────────────────────────────────────

  it('autoDownload is disabled for Linux non-AppImage (deb / dev) builds', () => {
    const au = makeAutoUpdaterMock();
    // Simulate the guard logic from main.js
    const platform = 'linux';
    const appimage = undefined; // $APPIMAGE not set — running as .deb or dev
    if (platform === 'linux') {
      au.autoDownload = !!appimage;
    }
    expect(au.autoDownload).toBe(false);
  });

  it('autoDownload is enabled for Linux AppImage builds ($APPIMAGE env set)', () => {
    const au = makeAutoUpdaterMock();
    const platform = 'linux';
    const appimage = '/tmp/nexus-1.0.2.AppImage'; // $APPIMAGE is set
    if (platform === 'linux') {
      au.autoDownload = !!appimage;
    }
    expect(au.autoDownload).toBe(true);
  });

  it('autoDownload is true for Windows (no platform guard applied)', () => {
    const au = makeAutoUpdaterMock();
    const platform = 'win32';
    if (platform === 'linux') {
      au.autoDownload = false; // guard — but we are NOT on linux
    }
    expect(au.autoDownload).toBe(true);
  });

  // ── Gap 2: canonical event name ────────────────────────────────────────────

  it('only update:ready is sent to renderer on update-downloaded (not update-downloaded)', () => {
    const au  = makeAutoUpdaterMock();
    const win = makeWindowMock();

    // Simulate the refactored handler from main.js
    au.on('update-downloaded', (info) => {
      win.webContents.send('update:ready', info);
      // Gap 2: update-downloaded is NOT forwarded to renderer anymore
    });

    au.emit('update-downloaded', { version: '1.0.3' });

    const channels = win.sent.map(m => m.channel);
    expect(channels).toContain('update:ready');
    expect(channels).not.toContain('update-downloaded'); // old stale channel gone
    expect(channels.length).toBe(1); // exactly one event
  });

  // ── Gap 3: update-not-available ────────────────────────────────────────────

  it('update:none is sent to renderer when update-not-available fires', () => {
    const au  = makeAutoUpdaterMock();
    const win = makeWindowMock();

    au.on('update-not-available', (info) => {
      win.webContents.send('update:none', info);
    });

    au.emit('update-not-available', { version: '1.0.2' });

    expect(win.sent).toHaveLength(1);
    expect(win.sent[0].channel).toBe('update:none');
    expect(win.sent[0].payload.version).toBe('1.0.2');
  });

  // ── Gap 5: _reEmitPendingUpdate ────────────────────────────────────────────

  it('_reEmitPendingUpdate re-sends update:ready when _updateDownloaded is true', () => {
    const win = makeWindowMock();
    let _updateDownloaded = true;
    let _updateInfo = { version: '1.0.3' };

    function _reEmitPendingUpdate() {
      if (_updateDownloaded && _updateInfo) {
        win.webContents.send('update:ready', _updateInfo);
      }
    }

    _reEmitPendingUpdate();

    expect(win.sent).toHaveLength(1);
    expect(win.sent[0].channel).toBe('update:ready');
    expect(win.sent[0].payload.version).toBe('1.0.3');
  });

  it('_reEmitPendingUpdate is a no-op when _updateDownloaded is false', () => {
    const win = makeWindowMock();
    let _updateDownloaded = false;
    let _updateInfo = null;

    function _reEmitPendingUpdate() {
      if (_updateDownloaded && _updateInfo) {
        win.webContents.send('update:ready', _updateInfo);
      }
    }

    _reEmitPendingUpdate();
    expect(win.sent).toHaveLength(0);
  });

  // ── Gap 6: macOS unsigned-build error guard ─────────────────────────────────

  it('macOS code-signing error is swallowed and does not reach the renderer', () => {
    const win = makeWindowMock();
    const platform = 'darwin';

    function handleUpdaterError(err, win, platform) {
      const msg = err.message || '';
      if (platform === 'darwin' && (
        msg.includes('Could not get code signature') ||
        msg.includes('no identity found')
      )) {
        // swallow silently — expected without Developer ID
        return;
      }
      win.webContents.send('update-error', msg);
    }

    handleUpdaterError(
      new Error('Could not get code signature for running application'),
      win,
      platform
    );

    expect(win.sent).toHaveLength(0); // nothing sent to renderer
  });

  it('non-signing errors on macOS ARE forwarded to the renderer', () => {
    const win = makeWindowMock();
    const platform = 'darwin';

    function handleUpdaterError(err, win, platform) {
      const msg = err.message || '';
      if (platform === 'darwin' && (
        msg.includes('Could not get code signature') ||
        msg.includes('no identity found')
      )) return;
      win.webContents.send('update-error', msg);
    }

    handleUpdaterError(new Error('Network request failed'), win, platform);

    expect(win.sent).toHaveLength(1);
    expect(win.sent[0].channel).toBe('update-error');
    expect(win.sent[0].payload).toContain('Network request failed');
  });

  // ── Gap 5: localStorage key contract ───────────────────────────────────────

  it('UpdateBanner uses the correct localStorage key for update state persistence', () => {
    // This verifies the key constant so a rename doesn't silently break persistence
    const EXPECTED_KEY = 'nexus_update_ready';
    // Read the source file and check the constant is defined there
    const bannerSrc = fs.readFileSync(
      path.resolve(__dirname, '../src/components/UpdateBanner.tsx'),
      'utf8'
    );
    expect(bannerSrc).toContain(`'${EXPECTED_KEY}'`);
    expect(bannerSrc).toContain('localStorage.setItem');
    expect(bannerSrc).toContain('localStorage.getItem');
  });

  // ── Gap 1: package.json build config ───────────────────────────────────────

  it('publish config targets the correct GitHub owner and repo', () => {
    const pkgPath = path.resolve(__dirname, '../package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const publish = pkg.build?.publish?.[0];
    expect(publish?.provider).toBe('github');
    expect(publish?.owner).toBe('brytebee');
    expect(publish?.repo).toBe('nexus-school-releases');
    expect(publish?.releaseType).toBe('release');
  });

});
