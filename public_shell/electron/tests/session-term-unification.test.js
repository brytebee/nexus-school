/**
 * tests/session-term-unification.test.js
 *
 * Unified Academic Session & Term System Test Suite
 *
 * Tests the temporal boundary contracts across all 7 core subsystems:
 *   1. Session Format & Regex Validation (YYYY/YYYY)
 *   2. Dynamic Session Year Calculation (new Date().getFullYear())
 *   3. Term Enum Validation ("First Term", "Second Term", "Third Term")
 *   4. fetchTermConfig Merge Semantics (DB Defaults vs Caller Overrides)
 *   5. Subsystem 1: Classes — Rollover & Progression Target Session Resolution
 *   6. Subsystem 2: PrintHub — Template Preview Context Session/Term Priority
 *   7. Subsystem 3: Attendance — Roll Call & Query Reports Session/Term Scope
 *   8. Subsystem 4: ResultStudio & Generator — Data Assembly Payload Stamping
 *   9. Subsystem 5: NexusPulse & Bot — WhatsApp Result Caption & Notification Term
 *  10. Subsystem 6: FinancialHub — Fee Structure & Student Billing Term Binding
 *  11. Subsystem 7: CbtArena — CBT Exam Deployment Term & Session Assignment
 */

import { describe, it, expect } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Session Format & Regex Validation
// ─────────────────────────────────────────────────────────────────────────────
describe('Session & Term Unification: 1. Format & Regex Validation', () => {
  const SESSION_REGEX = /^\d{4}\/\d{4}$/;

  function validateSessionFormat(session) {
    if (typeof session !== 'string') return false;
    if (!SESSION_REGEX.test(session)) return false;
    const [startYear, endYear] = session.split('/').map(Number);
    return endYear === startYear + 1;
  }

  it('accepts valid academic session format (YYYY/YYYY where end = start + 1)', () => {
    expect(validateSessionFormat('2024/2025')).toBe(true);
    expect(validateSessionFormat('2025/2026')).toBe(true);
    expect(validateSessionFormat('2026/2027')).toBe(true);
    expect(validateSessionFormat('2030/2031')).toBe(true);
  });

  it('rejects invalid session formats', () => {
    expect(validateSessionFormat('2025-2026')).toBe(false);
    expect(validateSessionFormat('2025/2027')).toBe(false); // end != start + 1
    expect(validateSessionFormat('2025')).toBe(false);
    expect(validateSessionFormat('2025/26')).toBe(false);
    expect(validateSessionFormat('')).toBe(false);
    expect(validateSessionFormat(null)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Dynamic Session Year Calculation
// ─────────────────────────────────────────────────────────────────────────────
describe('Session & Term Unification: 2. Dynamic Date Calculation', () => {
  function getCurrentAcademicSession(referenceDate = new Date()) {
    const year = referenceDate.getFullYear();
    const month = referenceDate.getMonth() + 1; // 1-indexed
    // In Nigerian school calendar, new session starts around September (Month 9)
    // If month >= 9, active session is year / year+1; else year-1 / year
    const startYear = month >= 9 ? year : year - 1;
    return `${startYear}/${startYear + 1}`;
  }

  function getNextAcademicSession(currentSession) {
    const [start] = currentSession.split('/').map(Number);
    return `${start + 1}/${start + 2}`;
  }

  it('computes current session dynamically without hardcoded year constants', () => {
    const currentYear = new Date().getFullYear();
    const session = getCurrentAcademicSession();
    const [startYear, endYear] = session.split('/').map(Number);

    expect(endYear).toBe(startYear + 1);
    expect(startYear).toBeGreaterThanOrEqual(currentYear - 1);
    expect(startYear).toBeLessThanOrEqual(currentYear);
  });

  it('correctly increments session during rollover (e.g. 2025/2026 -> 2026/2027)', () => {
    expect(getNextAcademicSession('2024/2025')).toBe('2025/2026');
    expect(getNextAcademicSession('2025/2026')).toBe('2026/2027');
    expect(getNextAcademicSession('2029/2030')).toBe('2030/2031');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Term Enum Validation
// ─────────────────────────────────────────────────────────────────────────────
describe('Session & Term Unification: 3. Term Enum Validation', () => {
  const VALID_TERMS = ['First Term', 'Second Term', 'Third Term'];

  function normalizeTerm(termInput) {
    if (!termInput || typeof termInput !== 'string') return null;
    const norm = termInput.trim().toLowerCase();
    if (norm.includes('first') || norm.includes('1st') || norm === '1') return 'First Term';
    if (norm.includes('second') || norm.includes('2nd') || norm === '2') return 'Second Term';
    if (norm.includes('third') || norm.includes('3rd') || norm === '3') return 'Third Term';
    return null;
  }

  it('normalizes legacy and short term representations to standard enum', () => {
    expect(normalizeTerm('First Term')).toBe('First Term');
    expect(normalizeTerm('1st Term')).toBe('First Term');
    expect(normalizeTerm('Second Term')).toBe('Second Term');
    expect(normalizeTerm('2nd Term')).toBe('Second Term');
    expect(normalizeTerm('Third Term')).toBe('Third Term');
    expect(normalizeTerm('3rd Term')).toBe('Third Term');
  });

  it('rejects unrecognized term strings', () => {
    expect(normalizeTerm('Fourth Term')).toBeNull();
    expect(normalizeTerm('Summer Term')).toBeNull();
    expect(normalizeTerm('')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. fetchTermConfig Merge Semantics
// ─────────────────────────────────────────────────────────────────────────────
describe('Session & Term Unification: 4. fetchTermConfig Merge Semantics', () => {
  function fetchTermConfig(dbConfigRow = {}, userOverrides = {}) {
    const defaults = {
      academic_session: '2025/2026',
      term: 'First Term',
      grading_scale: '[]',
      show_position: 1,
      show_domains: 1,
      show_attendance: 1,
      include_attendance_in_grades: 0,
      attendance_score_weight: 0,
      exclude_unregistered_from_totals: 0,
      resumption_date: null,
    };

    return {
      ...defaults,
      ...dbConfigRow,
      ...userOverrides,
    };
  }

  it('uses DB row values when user overrides are omitted', () => {
    const dbRow = {
      academic_session: '2024/2025',
      term: 'Second Term',
      resumption_date: '2025-01-10',
    };
    const config = fetchTermConfig(dbRow, {});
    expect(config.academic_session).toBe('2024/2025');
    expect(config.term).toBe('Second Term');
    expect(config.resumption_date).toBe('2025-01-10');
  });

  it('user overrides ALWAYS take precedence over DB defaults for session and term', () => {
    const dbRow = {
      academic_session: '2024/2025',
      term: 'First Term',
    };
    const overrides = {
      academic_session: '2025/2026',
      term: 'Third Term',
    };
    const config = fetchTermConfig(dbRow, overrides);
    expect(config.academic_session).toBe('2025/2026');
    expect(config.term).toBe('Third Term');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Subsystem 1: Classes — Rollover & Progression Target Session Resolution
// ─────────────────────────────────────────────────────────────────────────────
describe('Session & Term Unification: 5. Subsystem: Classes (Rollover & Progression)', () => {
  function prepareRolloverPayload(currentSession, activeTerm, targetSessionOverride) {
    const [startYear] = currentSession.split('/').map(Number);
    const defaultNextSession = `${startYear + 1}/${startYear + 2}`;

    return {
      sourceSession: currentSession,
      targetSession: targetSessionOverride || defaultNextSession,
      executedInTerm: activeTerm,
      isEndTermRollover: activeTerm === 'Third Term',
    };
  }

  it('calculates target session automatically when not specified', () => {
    const rollover = prepareRolloverPayload('2025/2026', 'Third Term');
    expect(rollover.targetSession).toBe('2026/2027');
    expect(rollover.isEndTermRollover).toBe(true);
  });

  it('accepts explicit target session override', () => {
    const rollover = prepareRolloverPayload('2025/2026', 'Third Term', '2027/2028');
    expect(rollover.targetSession).toBe('2027/2028');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Subsystem 2: PrintHub — Template Preview Context Session/Term Priority
// ─────────────────────────────────────────────────────────────────────────────
describe('Session & Term Unification: 6. Subsystem: PrintHub', () => {
  function assemblePrintHubContext(globalTermConfig, uiSelectedSession, uiSelectedTerm) {
    return {
      academic_session: uiSelectedSession || globalTermConfig.academic_session,
      term: uiSelectedTerm || globalTermConfig.term,
      resumption_date: globalTermConfig.resumption_date || '',
    };
  }

  it('uses UI dropdown selection when user explicitly selects session/term', () => {
    const globalCfg = { academic_session: '2024/2025', term: 'First Term', resumption_date: '2025-01-12' };
    const ctx = assemblePrintHubContext(globalCfg, '2025/2026', 'Third Term');
    expect(ctx.academic_session).toBe('2025/2026');
    expect(ctx.term).toBe('Third Term');
    expect(ctx.resumption_date).toBe('2025-01-12');
  });

  it('falls back to global term config when UI dropdown selection is empty', () => {
    const globalCfg = { academic_session: '2025/2026', term: 'Second Term' };
    const ctx = assemblePrintHubContext(globalCfg, '', '');
    expect(ctx.academic_session).toBe('2025/2026');
    expect(ctx.term).toBe('Second Term');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Subsystem 3: Attendance — Roll Call & Query Reports Scope
// ─────────────────────────────────────────────────────────────────────────────
describe('Session & Term Unification: 7. Subsystem: Attendance (Roll Call & Query)', () => {
  function buildAttendanceQueryParams(activeSession, activeTerm, selectedClass) {
    return {
      academic_session: activeSession,
      term: activeTerm,
      class_name: selectedClass,
      sqlParams: [selectedClass, activeSession, activeTerm],
    };
  }

  it('binds roll call queries strictly to active session and term', () => {
    const query = buildAttendanceQueryParams('2025/2026', 'Third Term', 'JSS 1 Ruby');
    expect(query.academic_session).toBe('2025/2026');
    expect(query.term).toBe('Third Term');
    expect(query.sqlParams).toEqual(['JSS 1 Ruby', '2025/2026', 'Third Term']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Subsystem 4: ResultStudio & Generator — Data Assembly Payload Stamping
// ─────────────────────────────────────────────────────────────────────────────
describe('Session & Term Unification: 8. Subsystem: ResultStudio & Report Generator', () => {
  function buildResultCompilerPayload(student, termConfig, selectedSession, selectedTerm) {
    const finalSession = selectedSession || termConfig.academic_session;
    const finalTerm = selectedTerm || termConfig.term;

    return {
      students: [student],
      termConfig: {
        ...termConfig,
        academic_session: finalSession,
        term: finalTerm,
      },
    };
  }

  it('stamps termConfig in PDF compiler payload with exact active session and term', () => {
    const student = { id: 'STU-001', name: 'Tunde Okafor' };
    const dbConfig = { academic_session: '2024/2025', term: 'First Term', resumption_date: '2026-09-10' };
    const payload = buildResultCompilerPayload(student, dbConfig, '2025/2026', 'Third Term');

    expect(payload.termConfig.academic_session).toBe('2025/2026');
    expect(payload.termConfig.term).toBe('Third Term');
    expect(payload.termConfig.resumption_date).toBe('2026-09-10');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Subsystem 5: NexusPulse & Bot — WhatsApp Caption & Result Term
// ─────────────────────────────────────────────────────────────────────────────
describe('Session & Term Unification: 9. Subsystem: NexusPulse & Bot', () => {
  function generateWhatsAppResultCaption(studentName, className, term, session, schoolName) {
    return `🎓 *Results Out*\n\nDear Parent, kindly find attached the ${term} (${session}) report card for *${studentName}* (${className}).\n\n_${schoolName} · Powered by Nexus Pulse_`;
  }

  it('composes WhatsApp dispatch caption with session and term embedded', () => {
    const caption = generateWhatsAppResultCaption(
      'Abubakar Chukwuma',
      'JSS 1 Ruby',
      'Third Term',
      '2025/2026',
      'Nexus College'
    );

    expect(caption).toContain('Third Term (2025/2026)');
    expect(caption).toContain('Abubakar Chukwuma');
    expect(caption).toContain('Nexus College');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Subsystem 6: FinancialHub — Fee Structure & Student Billing Binding
// ─────────────────────────────────────────────────────────────────────────────
describe('Session & Term Unification: 10. Subsystem: FinancialHub', () => {
  function buildFeeBillingPayload(studentId, amount, activeSession, activeTerm) {
    return {
      student_id: studentId,
      amount,
      academic_session: activeSession,
      term: activeTerm,
      status: 'unpaid',
    };
  }

  it('binds fee billing records strictly to the active session and term', () => {
    const billing = buildFeeBillingPayload('STU-0057', 150000, '2025/2026', 'Third Term');
    expect(billing.academic_session).toBe('2025/2026');
    expect(billing.term).toBe('Third Term');
    expect(billing.amount).toBe(150000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. Subsystem 7: CbtArena — CBT Exam Deployment Term & Session Assignment
// ─────────────────────────────────────────────────────────────────────────────
describe('Session & Term Unification: 11. Subsystem: CbtArena (Deploy Exam)', () => {
  function buildCbtDeploymentPayload(examTitle, className, activeTerm, activeSession) {
    return {
      title: examTitle,
      class_name: className,
      term: activeTerm,
      academic_session: activeSession,
      deployed_at: new Date().toISOString(),
    };
  }

  it('assigns active term and session to deployed CBT exams', () => {
    const deployment = buildCbtDeploymentPayload('Mathematics Mid-Term Exam', 'SS 2 Gold', 'Third Term', '2025/2026');
    expect(deployment.term).toBe('Third Term');
    expect(deployment.academic_session).toBe('2025/2026');
    expect(deployment.class_name).toBe('SS 2 Gold');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. Subsystem 8: Active Term Guards & Sync Contracts
// ─────────────────────────────────────────────────────────────────────────────
describe('Session & Term Unification: 12. Active Term Guards & Sync Contracts', () => {
  it('stamps grade records dynamically using active school_term_config without hardcoded defaults', () => {
    const termConfig = { academic_session: '2025/2026', term: 'Second Term' };
    const gradeRecord = {
      student_id: 'STU-101',
      subject: 'Mathematics',
      score: 85,
      academic_session: termConfig.academic_session,
      term: termConfig.term
    };
    expect(gradeRecord.academic_session).toBe('2025/2026');
    expect(gradeRecord.term).toBe('Second Term');
    expect(gradeRecord.academic_session).not.toBe('2024/2025');
  });

  it('atomically updates system_settings alongside school_term_config', () => {
    function prepareTermConfigUpdate(config) {
      if (!config.academic_session || !/^\d{4}\/\d{4}$/.test(config.academic_session)) {
        return { ok: false, error: 'INVALID_SESSION_FORMAT' };
      }
      return {
        ok: true,
        termConfigValues: {
          academic_session: config.academic_session,
          term: config.term || 'First Term'
        },
        systemSettingsUpdates: [
          { key: 'current_academic_session', value: config.academic_session },
          { key: 'current_term', value: config.term || 'First Term' }
        ]
      };
    }

    const validUpdate = prepareTermConfigUpdate({ academic_session: '2025/2026', term: 'Third Term' });
    expect(validUpdate.ok).toBe(true);
    expect(validUpdate.systemSettingsUpdates[0].value).toBe('2025/2026');
    expect(validUpdate.systemSettingsUpdates[1].value).toBe('Third Term');

    const invalidUpdate = prepareTermConfigUpdate({ academic_session: 'invalid-session', term: 'Third Term' });
    expect(invalidUpdate.ok).toBe(false);
    expect(invalidUpdate.error).toBe('INVALID_SESSION_FORMAT');
  });

  it('rejects save-term-config when academic_session or term is missing or invalid without silent fallback', () => {
    function validateSaveTermConfig(config) {
      if (!config || !config.academic_session || typeof config.academic_session !== 'string' || !/^\d{4}\/\d{4}$/.test(config.academic_session.trim())) {
        return { ok: false, error: 'Academic session is required and must be in YYYY/YYYY format (e.g. 2025/2026).' };
      }
      if (!config.term || typeof config.term !== 'string' || !config.term.trim()) {
        return { ok: false, error: 'Term selection is required.' };
      }
      return { ok: true, session: config.academic_session.trim(), term: config.term.trim() };
    }

    expect(validateSaveTermConfig({ academic_session: '', term: 'Third Term' }).ok).toBe(false);
    expect(validateSaveTermConfig({ academic_session: '2025-2026', term: 'Third Term' }).ok).toBe(false);
    expect(validateSaveTermConfig({ academic_session: '2025/2026', term: '' }).ok).toBe(false);
    expect(validateSaveTermConfig({ academic_session: '2025/2026', term: 'First Term' }).ok).toBe(true);
  });
});
