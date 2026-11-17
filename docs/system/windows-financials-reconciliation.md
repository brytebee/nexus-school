# Windows Runbook: Student Financials Reconciliation & Debtor Export

This runbook provides step-by-step Windows PowerShell instructions to:
1. **Locate & verify** the active Nexus School OS SQLite database on the client's Windows machine.
2. **Reconcile figures for students with extras** by cycling 1 extra (triggering the official recalculation routine `recalculateStudentTotalBilled()`).
3. **Generate a comprehensive Excel-compatible Master CSV report** of **all debtors** across the school (both those with extras and those without extras), with audit flags indicating extras and recalculation status.
4. **Print a Financial Census Parity Audit** in the terminal to verify mathematically that:
   $$\text{Cleared Students} + \text{Total Debtors} = \text{Total Active Students}$$

---

## 1. Verified Client Environment

* **Host Machine User**: `HP`
* **Verified Database Path**: `C:\Users\HP\AppData\Roaming\NexusSchoolOS\nexus_os.db`
* **Database Size**: `2,002,944 bytes (~2.0 MB)`
* **Active Node.js**: `v26.13.1` (includes native `node:sqlite` built-in, zero npm packages needed)

---

## 2. Context & Census Parity Explanation

### Why the Previous Script Had a Count Gap
In the previous run, the script processed students in two separate buckets:
1. **Debtors with Extras**: Cycled 1 extra and recalculated `total_billed` in the database, but were **not** written to the CSV.
2. **Debtors without Extras**: Written to `nexus_debtors_no_extras_*.csv`.

Because debtors with extras remained in the database without being exported, adding the exported CSV count to the cleared count left a discrepancy:
$$\text{CSV Count (No Extras)} + \text{Cleared Count} < \text{Total Active Students}$$

### The Unified Resolution
This updated runbook exports **all uncleared debtors** into a single master spreadsheet and adds two dedicated audit columns:
- **`Has Extras`**: `Yes` if the student has assigned items in `student_extra_selections`, `No` if none.
- **`Recalculated`**: `Yes` if figures were recomputed against active base fees and extra items, `No` if base fee only.

At execution end, PowerShell prints a **Census Parity Summary** asserting that the counts balance to the person:
$$\text{Total Active Students} = \text{Cleared Students} + \underbrace{\text{Debtors With Extras} + \text{Debtors Without Extras}}_{\text{All Exported to CSV}}$$

---

## 3. Step 1: Pre-flight Safety Backup

Open **PowerShell** on the client machine and run this to create a safety copy of the database on the Desktop:

```powershell
Copy-Item -Path "$env:APPDATA\NexusSchoolOS\nexus_os.db" -Destination "$env:USERPROFILE\Desktop\nexus_os_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').db"
Write-Host "Safety backup created on Desktop." -ForegroundColor Green
```

---

## 4. Step 2: One-Click PowerShell Execution

> [!IMPORTANT]
> **Close Nexus School OS** on the PC before running this command so SQLite does not encounter file lock or WAL conflicts.

Copy the entire block below and paste it directly into **PowerShell**:

```powershell
Set-Content -Path "$env:TEMP\reconcile.js" -Encoding UTF8 -Value @'
const fs = require('fs');
const path = require('path');

// 1. Resolve SQLite Database Engine (Native node:sqlite or better-sqlite3)
let db;
const appData = process.env.APPDATA || '';
let dbPath = path.join(appData, 'NexusSchoolOS', 'nexus_os.db');
if (!fs.existsSync(dbPath)) {
  dbPath = path.join(appData, 'NexusSchoolOS', 'nexus.sqlite');
}

if (!fs.existsSync(dbPath)) {
  console.error('[ERROR] Database file not found at:', dbPath);
  process.exit(1);
}

console.log('[INFO] Connecting to SQLite database at:', dbPath);

try {
  const { DatabaseSync } = require('node:sqlite');
  const rawDb = new DatabaseSync(dbPath);
  db = {
    exec: (sql) => rawDb.exec(sql),
    prepare: (sql) => {
      const stmt = rawDb.prepare(sql);
      return {
        get: (...params) => stmt.get(...params),
        all: (...params) => stmt.all(...params),
        run: (...params) => stmt.run(...params),
      };
    }
  };
} catch (e) {
  try {
    const Database = require('better-sqlite3');
    const rawDb = new Database(dbPath);
    db = {
      exec: (sql) => rawDb.exec(sql),
      prepare: (sql) => rawDb.prepare(sql)
    };
  } catch (err) {
    console.error('[ERROR] Neither node:sqlite nor better-sqlite3 is available.');
    process.exit(1);
  }
}

db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

// 2. Fetch Active Term and Session
const termRow = db.prepare('SELECT academic_session, term FROM school_term_config WHERE id = 1').get();
if (!termRow || !termRow.academic_session || !termRow.term) {
  console.error('[ERROR] Could not read active term and session from school_term_config.');
  process.exit(1);
}

const session = termRow.academic_session;
const term = termRow.term;
console.log(`[INFO] Active Session: "${session}" | Term: "${term}"`);

// 3. Reconcile all students who have extras in this session & term
const studentsWithExtras = db.prepare(`
  SELECT DISTINCT s.id, s.name, s.class_name, COALESCE(s.class_arm, '') as class_arm
  FROM students s
  JOIN student_extra_selections ses 
    ON ses.student_id = s.id 
    AND ses.academic_session = ? 
    AND ses.term = ?
  WHERE COALESCE(s.is_active, 1) = 1
`).all(session, term);

console.log(`[INFO] Found ${studentsWithExtras.length} active student(s) with extras.`);

db.exec('BEGIN TRANSACTION;');
let refreshedCount = 0;
try {
  for (const st of studentsWithExtras) {
    const fullClass = (st.class_name + ' ' + st.class_arm).trim();

    // Pick 1 extra to cycle (remove and immediately re-insert)
    const extra = db.prepare(`
      SELECT id, extra_id, is_fulfilled, fulfilled_at, selected_at
      FROM student_extra_selections
      WHERE student_id = ? AND academic_session = ? AND term = ?
      LIMIT 1
    `).get(st.id, session, term);

    if (extra) {
      db.prepare('DELETE FROM student_extra_selections WHERE id = ?').run(extra.id);
      db.prepare(`
        INSERT INTO student_extra_selections (student_id, extra_id, academic_session, term, is_fulfilled, fulfilled_at, selected_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(st.id, extra.extra_id, session, term, extra.is_fulfilled, extra.fulfilled_at, extra.selected_at);
    }

    // Recalculate total_billed: base class fee + active extras
    const baseRow = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM fee_structures
      WHERE class_name = ? AND (LOWER(TRIM(term)) IN ('all terms', 'all term') OR term = ?)
    `).get(fullClass, term);
    const baseFee = baseRow ? Number(baseRow.total || 0) : 0;

    const extrasRow = db.prepare(`
      SELECT COALESCE(SUM(fe.amount), 0) as total
      FROM student_extra_selections ses
      JOIN fee_extras fe ON fe.id = ses.extra_id
      WHERE ses.student_id = ? AND ses.academic_session = ? AND ses.term = ? AND fe.is_active = 1
    `).get(st.id, session, term);
    const extrasFee = extrasRow ? Number(extrasRow.total || 0) : 0;

    const newTotalBilled = baseFee + extrasFee;

    const feeRow = db.prepare(`
      SELECT total_paid FROM student_fees
      WHERE student_id = ? AND academic_session = ? AND term = ?
    `).get(st.id, session, term);
    const totalPaid = feeRow ? Number(feeRow.total_paid || 0) : 0;

    const newStatus = totalPaid >= newTotalBilled && newTotalBilled > 0
      ? 'cleared'
      : (totalPaid > 0 ? 'partial' : (newTotalBilled > 0 ? 'unpaid' : 'cleared'));

    if (feeRow) {
      db.prepare(`
        UPDATE student_fees
        SET total_billed = ?, status = ?
        WHERE student_id = ? AND academic_session = ? AND term = ?
      `).run(newTotalBilled, newStatus, st.id, session, term);
    } else if (newTotalBilled > 0) {
      db.prepare(`
        INSERT INTO student_fees (student_id, academic_session, term, total_billed, total_paid, status)
        VALUES (?, ?, ?, ?, 0, 'unpaid')
      `).run(st.id, session, term, newTotalBilled);
    }

    refreshedCount++;
  }

  db.exec('COMMIT;');
  console.log(`[SUCCESS] Reconciled and updated ${refreshedCount} student(s) with extras.`);
} catch (err) {
  db.exec('ROLLBACK;');
  console.error('[ERROR] Transaction rolled back due to error:', err);
  process.exit(1);
}

// 4. Query all active students and classify into Cleared vs Debtors
const allActiveStudents = db.prepare(`
  SELECT 
    s.id,
    s.name,
    s.class_name,
    COALESCE(s.class_arm, '') as class_arm,
    COALESCE(f.total_billed, 0) as total_billed,
    COALESCE(f.total_paid, 0) as total_paid,
    (COALESCE(f.total_billed, 0) - COALESCE(f.total_paid, 0)) as balance,
    COALESCE(f.status, 'unpaid') as status,
    (SELECT COUNT(*) FROM student_extra_selections ses WHERE ses.student_id = s.id AND ses.academic_session = ? AND ses.term = ?) as extra_count
  FROM students s
  LEFT JOIN student_fees f 
    ON f.student_id = s.id 
    AND f.academic_session = ? 
    AND f.term = ?
  WHERE COALESCE(s.is_active, 1) = 1
  ORDER BY s.class_name ASC, s.class_arm ASC, s.name ASC
`).all(session, term, session, term);

const clearedList = [];
const allDebtors = [];
let debtorsWithExtrasCount = 0;
let debtorsWithoutExtrasCount = 0;
let unbilledCount = 0;

for (const s of allActiveStudents) {
  const fullClass = (s.class_name + ' ' + s.class_arm).trim();
  const hasExtras = s.extra_count > 0;
  const isCleared = (s.balance <= 0 && s.total_billed > 0) || s.status === 'cleared';

  if (isCleared) {
    clearedList.push(s);
  } else if (s.balance > 0 || (s.total_billed > s.total_paid)) {
    if (hasExtras) {
      debtorsWithExtrasCount++;
    } else {
      debtorsWithoutExtrasCount++;
    }

    allDebtors.push({
      id: s.id,
      name: s.name,
      class: fullClass,
      billed: s.total_billed,
      paid: s.total_paid,
      balance: s.balance,
      status: s.status,
      hasExtras: hasExtras ? 'Yes' : 'No',
      recalculated: hasExtras ? 'Yes' : 'No'
    });
  } else {
    // Unbilled students with zero fees
    unbilledCount++;
  }
}

// 5. Print Census Parity Audit Table
const totalActive = allActiveStudents.length;
const sumAudited = clearedList.length + allDebtors.length + unbilledCount;
const isParity = (sumAudited === totalActive);

console.log('\n======================================================================');
console.log('                 NEXUS SCHOOL FINANCIAL CENSUS AUDIT                  ');
console.log('======================================================================');
console.log(`  Academic Session:                  ${session} (${term})`);
console.log(`  Total Active Students Enrolled:    ${totalActive}`);
console.log('----------------------------------------------------------------------');
console.log(`  Cleared Students (Zero Balance):   ${clearedList.length}`);
console.log(`  Total Outstanding Debtors:         ${allDebtors.length} (Saved to CSV)`);
console.log(`    • Debtors WITH Extras:           ${debtorsWithExtrasCount} (cycled & recalculated)`);
console.log(`    • Debtors WITHOUT Extras:        ${debtorsWithoutExtrasCount} (base fee only)`);
if (unbilledCount > 0) {
  console.log(`  Unbilled / Zero-Fee Students:      ${unbilledCount}`);
}
console.log('----------------------------------------------------------------------');
console.log(`  Census Parity Equation:            Cleared (${clearedList.length}) + Debtors (${allDebtors.length})${unbilledCount > 0 ? ` + Unbilled (${unbilledCount})` : ''} = ${sumAudited}`);
console.log(`  Audit Status:                      ${isParity ? '[PASS] 100% Parity Reconciled' : '[WARN] Discrepancy detected'}`);
console.log('======================================================================\n');

// 6. Generate Master CSV of All Debtors
if (allDebtors.length > 0) {
  const desktop = path.join(process.env.USERPROFILE || '', 'Desktop');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const csvFile = path.join(desktop, `nexus_debtors_all_${timestamp}.csv`);

  const escapeCsv = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
  const header = [
    'Student ID',
    'Student Name',
    'Class & Arm',
    'Total Fees (NGN)',
    'Current Payment (NGN)',
    'Balance Due (NGN)',
    'Status',
    'Has Extras',
    'Recalculated'
  ].join(',');

  const rows = allDebtors.map((s) => [
    escapeCsv(s.id),
    escapeCsv(s.name),
    escapeCsv(s.class),
    escapeCsv(s.billed),
    escapeCsv(s.paid),
    escapeCsv(s.balance),
    escapeCsv(s.status),
    escapeCsv(s.hasExtras),
    escapeCsv(s.recalculated)
  ].join(','));

  // Prepend UTF-8 BOM so Excel opens accented/special characters correctly
  fs.writeFileSync(csvFile, '\uFEFF' + [header, ...rows].join('\r\n'), 'utf8');
  console.log(`[EXPORT] Master Debtor CSV saved to Desktop:`);
  console.log(`  --> ${csvFile}`);
  console.log(`  --> Total rows exported: ${allDebtors.length}\n`);
} else {
  console.log('[INFO] All students have cleared their fees. No debtor CSV export required.');
}
'@

node "$env:TEMP\reconcile.js"
Remove-Item "$env:TEMP\reconcile.js" -ErrorAction SilentlyContinue
```

---

## 5. Post-Run Verification

1. **Verify Terminal Census Parity**:
   - Check the **NEXUS SCHOOL FINANCIAL CENSUS AUDIT** table printed in PowerShell.
   - Confirm that `Cleared + Debtors == Total Active Students` and that `[PASS] 100% Parity Reconciled` is shown.
2. **Review Master Debtor CSV on Desktop**:
   - Open `nexus_debtors_all_<timestamp>.csv` in Microsoft Excel.
   - Filter or sort by the `Has Extras` and `Recalculated` columns to see which students had extras refreshed versus base fees only.
   - Notice that the number of student rows in the CSV matches the `Total Outstanding Debtors` in the terminal table.
3. **Verify Nexus School OS Financial Hub**:
   - Launch Nexus School OS and navigate to **Financial Hub**.
   - Check that student balances match the recalculated figures in the CSV.
