#!/usr/bin/env node
/**
 * use-node-sqlite.js
 * Swaps the active better-sqlite3 native binding to the CLI Node build (ABI 141).
 * Run before: vitest / npm test
 *
 * Counterpart: scripts/use-electron-sqlite.js (swaps back for Electron ABI 125)
 */
const fs = require('fs');
const path = require('path');

const releaseDir = path.join(__dirname, '..', 'node_modules', 'better-sqlite3', 'build', 'Release');
const active     = path.join(releaseDir, 'better_sqlite3.node');
const abi141     = path.join(releaseDir, 'better_sqlite3_abi141.node');

if (!fs.existsSync(abi141)) {
  console.error('[sqlite-swap] ❌  better_sqlite3_abi141.node not found.');
  console.error('[sqlite-swap]    Run: npm rebuild better-sqlite3  (with system Node, not Electron)');
  console.error('[sqlite-swap]    Then copy: cp ...better_sqlite3.node ...better_sqlite3_abi141.node');
  process.exit(1);
}

fs.copyFileSync(abi141, active);
console.log('[sqlite-swap] ✅  Activated CLI-Node binary (ABI 141) for Vitest.');
