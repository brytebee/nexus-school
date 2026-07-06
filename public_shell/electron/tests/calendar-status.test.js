/**
 * public_shell/electron/tests/calendar-status.test.js
 *
 * Unit tests for checkCalendarStatus (desktop) and toDisplayTier.
 * Mirrors nexus-api/src/__tests__/calendar.test.ts — both must stay in sync.
 */
import { describe, test, expect } from 'vitest';

// ── Inline the functions under test so no Electron environment is needed ──────
// These must exactly mirror what is in main.js.

const NIGERIAN_CALENDAR = {
  '2024/2025': { T1:{ start:'2024-09-09', end:'2024-12-14' }, T2:{ start:'2025-01-06', end:'2025-04-05' }, T3:{ start:'2025-04-28', end:'2025-07-19' } },
  '2025/2026': { T1:{ start:'2025-09-08', end:'2025-12-13' }, T2:{ start:'2026-01-05', end:'2026-04-04' }, T3:{ start:'2026-04-27', end:'2026-07-18' } },
  '2026/2027': { T1:{ start:'2026-09-07', end:'2026-12-12' }, T2:{ start:'2027-01-04', end:'2027-04-03' }, T3:{ start:'2027-04-26', end:'2027-07-17' } },
};
const GRACE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function getTermWindow(key) {
  const [session, term] = key.split('-');
  return NIGERIAN_CALENDAR[session]?.[term] ?? null;
}

function isCalendarTermInGap(afterEndDate, beforeStartDate) {
  const gapStart = new Date(afterEndDate    + 'T23:59:59Z').getTime();
  const gapEnd   = new Date(beforeStartDate + 'T00:00:00Z').getTime();
  for (const session of Object.values(NIGERIAN_CALENDAR)) {
    for (const term of Object.values(session)) {
      const tStart = new Date(term.start + 'T00:00:00Z').getTime();
      const tEnd   = new Date(term.end   + 'T23:59:59Z').getTime();
      if (tStart >= gapStart && tEnd <= gapEnd) return true;
    }
  }
  return false;
}

function findNextT1Start(t3Key) {
  const session   = t3Key.split('-')[0];
  const startYear = parseInt(session.split('/')[0], 10);
  const nextSession = `${startYear + 1}/${startYear + 2}`;
  const nextT1 = NIGERIAN_CALENDAR[nextSession]?.T1;
  return nextT1 ? new Date(nextT1.start + 'T00:00:00Z').getTime() : null;
}

function checkCalendarStatus(licensedTerms, nowMs = Date.now()) {
  let latestEnd    = 0;
  let latestTermKey = null;

  const keyedWindows = licensedTerms
    .map(k => ({ key: k, w: getTermWindow(k) }))
    .filter(x => x.w);

  for (const { key, w } of keyedWindows) {
    const s = new Date(w.start + 'T00:00:00Z').getTime();
    const e = new Date(w.end   + 'T23:59:59Z').getTime();
    if (nowMs >= s && nowMs <= e) return 'active';
    // Only track as a candidate if this term has already ended
    if (e < nowMs && e > latestEnd) { latestEnd = e; latestTermKey = key; }
  }

  const sorted = keyedWindows
    .map(x => x.w)
    .sort((a,b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  for (let i = 0; i < sorted.length - 1; i++) {
    const hStart = new Date(sorted[i].end   + 'T23:59:59Z').getTime();
    const hEnd   = new Date(sorted[i+1].start + 'T00:00:00Z').getTime();
    if (!isCalendarTermInGap(sorted[i].end, sorted[i+1].start) && nowMs > hStart && nowMs < hEnd) return 'active';
  }

  if (latestEnd === 0) return 'expired';

  // Asymmetric summer grace: last licensed term was T3 → full summer access,
  // 30-day grace anchors to NEXT T1 start, not T3 end.
  if (latestTermKey && latestTermKey.endsWith('-T3')) {
    const nextT1Ms = findNextT1Start(latestTermKey);
    if (nextT1Ms !== null) {
      if (nowMs < nextT1Ms)             return 'active';
      if (nowMs <= nextT1Ms + GRACE_MS) return 'grace';
      return 'expired';
    }
  }

  // Standard grace for T1→T2 and T2→T3 (term-end anchored)
  if (nowMs <= latestEnd + GRACE_MS) return 'grace';
  return 'expired';
}

const TIER_DISPLAY = {
  standalone: 'Standalone',
  silver:     'Silver',
  gold:       'Gold',
  diamond:    'Diamond',
};
function toDisplayTier(tier) {
  return TIER_DISPLAY[(tier || '').toLowerCase()] ?? tier;
}

// ── Helper ─────────────────────────────────────────────────────────────────────

function d(dateStr) {
  return new Date(dateStr + 'T12:00:00Z').getTime();
}

// ── Calendar tests (mirrors calendar.test.ts) ──────────────────────────────────

describe('checkCalendarStatus — asymmetric grace (30-day term-end for T1/T2; T1-start for summer)', () => {

  test('1. Within licensed T1 → active', () => {
    expect(checkCalendarStatus(['2025/2026-T1'], d('2025-11-01'))).toBe('active');
  });

  test('2. Within licensed T2 → active', () => {
    expect(checkCalendarStatus(['2025/2026-T2'], d('2026-02-15'))).toBe('active');
  });

  test('3. Holiday T1→T2, both licensed → active', () => {
    expect(checkCalendarStatus(['2025/2026-T1', '2025/2026-T2'], d('2025-12-25'))).toBe('active');
  });

  test('4. Day 1 post T1-end, T2 unlicensed → grace', () => {
    expect(checkCalendarStatus(['2025/2026-T1'], d('2025-12-14'))).toBe('grace');
  });

  test('5. Day 29 post T1-end → grace', () => {
    expect(checkCalendarStatus(['2025/2026-T1'], d('2026-01-11'))).toBe('grace');
  });

  test('6. Day 30 post T1-end (noon Jan 12) → still grace', () => {
    expect(checkCalendarStatus(['2025/2026-T1'], d('2026-01-12'))).toBe('grace');
  });

  test('7. Day 31 post T1-end → expired', () => {
    expect(checkCalendarStatus(['2025/2026-T1'], d('2026-01-13'))).toBe('expired');
  });

  test('8. Day 1 post T2-end → grace', () => {
    expect(checkCalendarStatus(['2025/2026-T2'], d('2026-04-05'))).toBe('grace');
  });

  test('9. Day 31 post T2-end → expired', () => {
    expect(checkCalendarStatus(['2025/2026-T2'], d('2026-05-05'))).toBe('expired');
  });

  // ── Summer gap: T3 end → next T1 start (asymmetric grace) ———————————
  // 2025/2026-T3 ends Jul 18 2026. 2026/2027-T1 starts Sep 7 2026.
  // The old lock date was Aug 17 (30 days from T3 end).
  // With asymmetric rule: app is active all summer; grace begins Sep 7.

  test('10. Day 1 post T3-end (summer) → NOW active (not grace)', () => {
    expect(checkCalendarStatus(['2025/2026-T3'], d('2026-07-19'))).toBe('active');
  });

  test('11. Mid-summer Aug 16 → still active (was grace before v4)', () => {
    expect(checkCalendarStatus(['2025/2026-T3'], d('2026-08-16'))).toBe('active');
  });

  test('12. Aug 18 (former lock date +1) → still active (was expired before v4)', () => {
    expect(checkCalendarStatus(['2025/2026-T3'], d('2026-08-18'))).toBe('active');
  });

  test('10a. T1 start (Sep 7) → grace begins', () => {
    // Grace countdown starts the moment T1 opens
    expect(checkCalendarStatus(['2025/2026-T3'], d('2026-09-07'))).toBe('grace');
  });

  test('10b. T1 + 15 days (Sep 22) → grace', () => {
    expect(checkCalendarStatus(['2025/2026-T3'], d('2026-09-22'))).toBe('grace');
  });

  test('10c. T1 + 29 days (Oct 6) → grace', () => {
    expect(checkCalendarStatus(['2025/2026-T3'], d('2026-10-06'))).toBe('grace');
  });

  test('10d. T1 + 31 days (Oct 8) → expired — hard lock fires', () => {
    expect(checkCalendarStatus(['2025/2026-T3'], d('2026-10-08'))).toBe('expired');
  });

  test('13. T1+T3 licensed, clock on day 1 of T2 → grace', () => {
    expect(checkCalendarStatus(['2025/2026-T1', '2025/2026-T3'], d('2026-01-06'))).toBe('grace');
  });

  test('14. Empty terms (Standalone path) → expired (bypassed in engine, but tested for correctness)', () => {
    // Standalone bypasses this function entirely in main.js
    expect(checkCalendarStatus([], d('2026-01-01'))).toBe('expired');
  });

  test('GRACE_MS equals 30 days', () => {
    expect(GRACE_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

// ── toDisplayTier tests ────────────────────────────────────────────────────────

describe('toDisplayTier', () => {

  test('15. Lowercase "gold" → "Gold"', () => {
    expect(toDisplayTier('gold')).toBe('Gold');
  });

  test('15b. "DIAMOND" → "Diamond"', () => {
    expect(toDisplayTier('DIAMOND')).toBe('Diamond');
  });

  test('15c. "Silver" (mixed) → "Silver"', () => {
    expect(toDisplayTier('Silver')).toBe('Silver');
  });

  test('15d. Empty string → empty string (passthrough)', () => {
    expect(toDisplayTier('')).toBe('');
  });

  test('16. Unknown tier "platinum" → passthrough', () => {
    expect(toDisplayTier('platinum')).toBe('platinum');
  });
});
