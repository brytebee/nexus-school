/**
 * tests/globalSetup.js
 *
 * Vitest global setup — runs once before any test file is loaded,
 * regardless of whether tests are invoked via `npm test` or directly
 * via `./node_modules/.bin/vitest run`.
 *
 * PURPOSE: Swap the active better-sqlite3 native binary to the CLI-Node
 * build (ABI 141) so that in-memory SQLite works under system Node.js.
 *
 * After the full test run, teardown restores the Electron binary (ABI 125)
 * so `npm start` continues to work without any manual step.
 *
 * See: private_engine/docs/guides/sqlite-dual-abi-management.md
 */

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const releaseDir = path.join(__dirname, '..', 'node_modules', 'better-sqlite3', 'build', 'Release');
const active  = path.join(releaseDir, 'better_sqlite3.node');
const abi141  = path.join(releaseDir, 'better_sqlite3_abi141.node');
const abi125  = path.join(releaseDir, 'better_sqlite3_abi125.node');

export function setup() {
  if (!fs.existsSync(abi141)) {
    console.error('\n[globalSetup] ❌  better_sqlite3_abi141.node not found.');
    console.error('[globalSetup]    Run the one-time stash command:');
    console.error('[globalSetup]    PATH="/Users/MAC/.asdf/shims:$PATH" npm rebuild better-sqlite3');
    console.error('[globalSetup]    cp node_modules/better-sqlite3/build/Release/better_sqlite3.node \\');
    console.error('[globalSetup]       node_modules/better-sqlite3/build/Release/better_sqlite3_abi141.node');
    console.error('[globalSetup]    See: private_engine/docs/guides/sqlite-dual-abi-management.md\n');
    process.exit(1);
  }
  fs.copyFileSync(abi141, active);
  console.log('[globalSetup] ✅  Activated CLI-Node binary (ABI 141) — SQLite tests ready.');
}

export function teardown() {
  if (fs.existsSync(abi125)) {
    fs.copyFileSync(abi125, active);
    console.log('[globalSetup] ✅  Restored Electron binary (ABI 125) — npm start ready.');
  } else {
    console.warn('[globalSetup] ⚠️  better_sqlite3_abi125.node not found — run electron-rebuild to restore.');
  }
}
