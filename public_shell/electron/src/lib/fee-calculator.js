// Fee Calculator logic - extracted from main.js and fees-ui.js

function computeFeeStatus(billed, paid) {
  const b = Number(billed) || 0;
  const p = Number(paid) || 0;
  if (b <= 0) return "cleared";           // no billing → always cleared
  if (p >= b) return "cleared";
  if (p > 0) return "partial";
  return "unpaid";
}

function computeBalance(billed, paid) {
  return (Number(billed) || 0) - (Number(paid) || 0);
}

function evaluateFeeGate({ enabled, mode, threshold, balance, totalBilled }) {
  if (!enabled) return { gated: false, balance };
  if (balance <= 0) return { gated: false, balance: 0 };

  if (mode === 'percent') {
    if (totalBilled <= 0) return { gated: false, balance };
    return { gated: (balance / totalBilled * 100) >= threshold, balance };
  }
  return { gated: threshold === 0 ? balance > 0 : balance >= threshold, balance };
}

/**
 * Build ordered class-lookup candidates from className and optional classArm.
 * Arm-qualified names take precedence over the bare class name so arm-specific
 * fee schedules override rather than stack onto bare-class schedules.
 */
function buildClassCandidates(className, classArm) {
  const rawClass = className ? String(className).trim() : '';
  const rawArm = classArm ? String(classArm).trim() : '';
  if (!rawClass) return [];

  const candidates = rawArm
    ? [`${rawClass} ${rawArm}`, `${rawClass}-${rawArm}`, rawClass]
    : [rawClass];

  const seen = new Set();
  return candidates.filter((cand) => {
    const key = cand.replace(/\s+/g, '').toUpperCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Execute queryFn against each class candidate in priority order, returning
 * the first non-empty match so bare + arm fee_structures rows are never summed.
 */
function resolveFirstClassMatch(className, classArm, queryFn, isMatch) {
  for (const candidate of buildClassCandidates(className, classArm)) {
    const result = queryFn(candidate);
    if (isMatch(result)) return result;
  }
  return null;
}

/**
 * Resolve total mandatory base fee for a student's class/arm/term from fee_structures.
 */
function resolveBaseFeeTotal(db, className, classArm, term) {
  const cleanTerm = term ? String(term).trim() : '';
  const stmt = db.prepare(`
    SELECT COUNT(*) AS cnt, COALESCE(SUM(amount), 0) AS total
    FROM fee_structures
    WHERE UPPER(replace(class_name, ' ', '')) = UPPER(replace(?, ' ', ''))
      AND (
        LOWER(TRIM(term)) IN ('all terms', 'all term')
        OR LOWER(TRIM(term)) = LOWER(TRIM(?))
      )
  `);
  const match = resolveFirstClassMatch(
    className,
    classArm,
    (candidate) => stmt.get(candidate, cleanTerm),
    (row) => row && Number(row.cnt) > 0
  );
  return Number(match?.total || 0);
}

/**
 * Resolve itemized fee_structures rows (with optional bank account metadata)
 * for receipts and dossiers, stopping at the most specific matching class level.
 */
function resolveBaseFeeStructureItems(db, className, classArm, term) {
  const cleanTerm = term ? String(term).trim() : '';
  const stmt = db.prepare(`
    SELECT fs.item_name, fs.amount, fs.bank_account_id,
           ba.account_name AS account_name, ba.bank_name AS bank_name
    FROM fee_structures fs
    LEFT JOIN bank_accounts ba ON ba.id = fs.bank_account_id
    WHERE UPPER(replace(fs.class_name, ' ', '')) = UPPER(replace(?, ' ', ''))
      AND (
        LOWER(TRIM(fs.term)) IN ('all terms', 'all term')
        OR LOWER(TRIM(fs.term)) = LOWER(TRIM(?))
      )
    ORDER BY fs.item_name ASC
  `);
  return (
    resolveFirstClassMatch(
      className,
      classArm,
      (candidate) => stmt.all(candidate, cleanTerm),
      (rows) => Array.isArray(rows) && rows.length > 0
    ) || []
  );
}

/**
 * Recalculate student_fees.total_billed from base fee_structures + active extras - adjustments.
 * Must be called inside an active transaction when paired with sibling fee mutations.
 */
function recalculateStudentTotalBilled(db, studentId, academicSession, term) {
  if (!studentId || !academicSession || !term) return null;

  const student = db.prepare('SELECT class_name, class_arm FROM students WHERE id = ?').get(studentId);
  const baseFee = resolveBaseFeeTotal(db, student?.class_name, student?.class_arm, term);

  const extrasRow = db.prepare(`
    SELECT COALESCE(SUM(fe.amount), 0) as total
    FROM student_extra_selections ses
    JOIN fee_extras fe ON fe.id = ses.extra_id
    WHERE ses.student_id = ?
      AND TRIM(ses.academic_session) = TRIM(?)
      AND LOWER(TRIM(ses.term)) = LOWER(TRIM(?))
      AND fe.is_active = 1
  `).get(studentId, academicSession, term);
  const extrasFee = Number(extrasRow?.total || 0);

  let adjFee = 0;
  try {
    const adjRow = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM fee_adjustments
      WHERE student_id = ?
        AND TRIM(academic_session) = TRIM(?)
        AND LOWER(TRIM(term)) = LOWER(TRIM(?))
    `).get(studentId, academicSession, term);
    adjFee = Number(adjRow?.total || 0);
  } catch (_) {}

  const newTotalBilled = Math.max(0, baseFee + extrasFee - adjFee);

  const existing = db.prepare(`
    SELECT total_paid FROM student_fees
    WHERE student_id = ?
      AND TRIM(academic_session) = TRIM(?)
      AND LOWER(TRIM(term)) = LOWER(TRIM(?))
  `).get(studentId, academicSession, term);

  const totalPaid = Number(existing?.total_paid || 0);
  const status = computeFeeStatus(newTotalBilled, totalPaid);

  if (existing) {
    db.prepare(`
      UPDATE student_fees
      SET total_billed = ?, status = ?, updated_at = datetime('now')
      WHERE student_id = ?
        AND TRIM(academic_session) = TRIM(?)
        AND LOWER(TRIM(term)) = LOWER(TRIM(?))
    `).run(newTotalBilled, status, studentId, academicSession, term);
  } else {
    db.prepare(`
      INSERT INTO student_fees (student_id, academic_session, term, total_billed, total_paid, status, updated_at)
      VALUES (?, ?, ?, ?, 0, ?, datetime('now'))
    `).run(studentId, academicSession, term, newTotalBilled, status);
  }

  return { baseFee, extrasFee, adjFee, totalBilled: newTotalBilled, totalPaid, status };
}

module.exports = {
  computeFeeStatus,
  computeBalance,
  evaluateFeeGate,
  buildClassCandidates,
  resolveBaseFeeTotal,
  resolveBaseFeeStructureItems,
  recalculateStudentTotalBilled,
};
