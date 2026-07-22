'use strict';

/**
 * rolloverEngine.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared helper functions for the Phase 3B Dynamic Term-Aware Rollover Engine.
 * Extracted from main.js so they can be required and unit-tested independently
 * of the Electron process.
 *
 * All three functions are pure with respect to their inputs:
 *   - getRolloverConfig  → reads DB, returns config (no writes)
 *   - resolveStudentAction → pure computation (no DB access at all)
 *   - applyStudentRollover → single atomic DB UPDATE
 */

const FALLBACK_TERMS     = ['First Term', 'Second Term', 'Third Term'];
const FALLBACK_HIERARCHY = ['JSS 1', 'JSS 2', 'JSS 3', 'SS 1', 'SS 2', 'SS 3'];

/**
 * Validate a raw term_structure object.
 * Returns { valid: true } or { valid: false, reason: string }.
 *
 * Rules:
 *  - Must be an object
 *  - .terms must be a non-empty array
 *  - Each entry must be a non-empty string
 *  - .period_label must be a non-empty string (defaults to 'term' if missing)
 */
function validateTermStructure(ts) {
  if (!ts || typeof ts !== 'object') return { valid: false, reason: 'term_structure must be an object.' };
  if (!Array.isArray(ts.terms) || ts.terms.length === 0)
    return { valid: false, reason: 'term_structure.terms must be a non-empty array.' };
  for (const t of ts.terms) {
    if (typeof t !== 'string' || !t.trim())
      return { valid: false, reason: `term_structure.terms contains an invalid entry: ${JSON.stringify(t)}` };
  }
  return { valid: true };
}

/**
 * Reads term_structure + class_hierarchy from system_settings.
 * Falls back gracefully to the 3-term Nigerian default if:
 *  - the row is missing, OR
 *  - the JSON is malformed, OR
 *  - the stored value fails validateTermStructure (e.g. empty terms array).
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {{ termStructure: { terms: string[], period_label: string }, hierarchy: string[] }}
 */
function getRolloverConfig(db) {
  let termStructure = { terms: FALLBACK_TERMS, period_label: 'term' };
  try {
    const tsRow = db.prepare("SELECT value FROM system_settings WHERE key='term_structure'").get();
    if (tsRow) {
      const parsed = JSON.parse(tsRow.value);
      const check  = validateTermStructure(parsed);
      if (check.valid) {
        // Ensure period_label has a value even if omitted when saved
        termStructure = { period_label: 'term', ...parsed };
      } else {
        console.warn(`[RolloverEngine] term_structure invalid (${check.reason}), using fallback.`);
      }
    }
  } catch (_) {
    console.warn('[RolloverEngine] Failed to parse term_structure, using fallback.');
  }

  let hierarchy = FALLBACK_HIERARCHY;
  try {
    const hierRow = db.prepare("SELECT value FROM system_settings WHERE key='class_hierarchy'").get();
    if (hierRow) {
      const parsed = JSON.parse(hierRow.value);
      if (Array.isArray(parsed) && parsed.length > 0) hierarchy = parsed;
    }
  } catch (_) {}

  return { termStructure, hierarchy };
}

/**
 * Computes the outcome of a rollover action for a single student.
 * Pure function — no DB reads or writes.
 *
 * @param {{ class: string, class_arm: string, enrollment_status: string }} student
 * @param {'promote'|'graduate'|'repeat'|'demote'|'move'|'switch_arm'} action
 * @param {string[]} hierarchy  Ordered class array from system_settings
 * @param {string}  [targetClass]  Required for 'move'
 * @param {string}  [targetArm]   Required for 'move' and 'switch_arm'
 * @returns {{ newClass: string, newArm: string, newStatus: string }}
 */
function resolveStudentAction(student, action, hierarchy, targetClass, targetArm) {
  const currentClass = student.class_name || student.class || '';
  const currentArm = student.class_arm || '';
  const idx = hierarchy.indexOf(currentClass);

  switch (action) {
    case 'promote': {
      // Unknown class OR already at top → graduate
      if (idx < 0 || idx >= hierarchy.length - 1) {
        return { newClass: currentClass, newArm: currentArm, newStatus: 'graduated' };
      }
      // Arm is preserved (carry-forward policy)
      return { newClass: hierarchy[idx + 1], newArm: currentArm, newStatus: 'active' };
    }
    case 'graduate':
      return { newClass: currentClass, newArm: currentArm, newStatus: 'graduated' };

    case 'repeat':
      return { newClass: currentClass, newArm: currentArm, newStatus: 'active' };

    case 'demote': {
      // Already at bottom → stay, no change
      if (idx <= 0) return { newClass: currentClass, newArm: currentArm, newStatus: 'active' };
      // Arm preserved on demotion
      return { newClass: hierarchy[idx - 1], newArm: currentArm, newStatus: 'active' };
    }
    case 'move':
      return {
        newClass:  targetClass || currentClass,
        newArm:    targetArm   || currentArm,
        newStatus: 'active',
      };
    case 'switch_arm':
      // Class unchanged; only arm updated
      return { newClass: currentClass, newArm: targetArm || currentArm, newStatus: 'active' };

    default:
      // No-op: return current state unchanged
      return { newClass: currentClass, newArm: currentArm, newStatus: student.enrollment_status || 'active' };
  }
}

/**
 * Writes a resolved rollover action for one student.
 * Appends an audit entry to session_history (append-only) and applies
 * the new class/arm/enrollment_status via a single UPDATE.
 *
 * MUST be called inside a db.transaction() for atomicity guarantees.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {{ id: number|string, class_name?: string, class?: string, class_arm?: string, session_history?: string }} student
 * @param {{ newClass: string, newArm: string, newStatus: string }} resolved
 * @param {string} action  Original action label
 * @param {string} currentSession  e.g. '2024/2025'
 * @param {string|null} note  Optional admin note
 */
function applyStudentRollover(db, student, resolved, action, currentSession, note) {
  // Parse existing history (graceful fallback to empty array)
  let history = [];
  try { history = JSON.parse(student.session_history || '[]'); } catch (_) {}

  const currentClass = student.class_name || student.class || '';
  const currentArm = student.class_arm || '';

  history.push({
    session: currentSession,
    class:   currentClass,
    arm:     currentArm,
    // If the outcome is graduation, always label the action 'graduated'
    action:  resolved.newStatus === 'graduated' ? 'graduated' : action,
    ...(note ? { note } : {}),
  });

  db.prepare(
    'UPDATE students SET class_name = ?, class_arm = ?, enrollment_status = ?, session_history = ? WHERE id = ?'
  ).run(resolved.newClass, resolved.newArm, resolved.newStatus, JSON.stringify(history), student.id);
}

module.exports = { getRolloverConfig, resolveStudentAction, applyStudentRollover, validateTermStructure };
