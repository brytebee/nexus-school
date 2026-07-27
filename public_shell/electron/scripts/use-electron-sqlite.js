#!/usr/bin/env node
/**
 * use-electron-sqlite.js
 * Swaps the active better-sqlite3 native binding to the Electron build (ABI 125).
 * Run before: npm start / electron .
 *
 * Counterpart: scripts/use-node-sqlite.js (swaps to CLI Node ABI 141 for Vitest)
 */
const fs = require('fs');
const path = require('path');

const releaseDir = path.join(__dirname, '..', 'node_modules', 'better-sqlite3', 'build', 'Release');
const active     = path.join(releaseDir, 'better_sqlite3.node');
const abi125     = path.join(releaseDir, 'better_sqlite3_abi125.node');

if (!fs.existsSync(abi125)) {
  console.error('[sqlite-swap] ❌  better_sqlite3_abi125.node not found.');
  console.error('[sqlite-swap]    Run: npx electron-rebuild -f -w better-sqlite3');
  console.error('[sqlite-swap]    Then copy: cp ...better_sqlite3.node ...better_sqlite3_abi125.node');
  process.exit(1);
}

fs.copyFileSync(abi125, active);
console.log('[sqlite-swap] ✅  Activated Electron binary (ABI 125) for npm start.');
