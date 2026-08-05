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
  if (fs.existsSync(active)) {
    console.log('[sqlite-swap] ℹ️  better_sqlite3_abi125.node not present — keeping active system Node binary.');
  } else {
    console.warn('[sqlite-swap] ⚠️ better_sqlite3.node not found — skipping swap.');
  }
} else {
  fs.copyFileSync(abi125, active);
  console.log('[sqlite-swap] ✅  Activated Electron binary (ABI 125) for npm start.');
}
