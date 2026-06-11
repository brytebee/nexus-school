/**
 * grader-sync.spec.js — Feature Guides:
 *   - 08-device-handshake.md
 *   - 11-attendance-mobile.md
 *   - 15-nexus-pulse.md
 *
 * Simulates:
 *   1. Opening Sync Hub and selecting a registered teacher
 *   2. Simulating a teacher device syncing grades + attendance to the Express server (port 3000)
 *   3. Verifying sync feed updates in real-time on the Dashboard command center
 *   4. Navigating to Nexus Pulse (WhatsApp hub)
 */

const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./helpers/launch');
const { injectHighlighter, showCaption, hideCaption, clickWithHalo } = require('./helpers/ui-highlight');
const { execSync } = require('child_process');
const path = require('path');

// Seeds the database before starting the Electron app to guarantee clean matching data
const seedTestData = () => {
  const dbPath = path.resolve(__dirname, '..', '..', '..', '..', 'private_engine', 'nexus.sqlite');
  try {
    // 1. Seed Teacher
    const q1 = `sqlite3 "${dbPath}" "INSERT OR IGNORE INTO teachers (id, name, phone, email) VALUES ('TCH-009', 'Jane Doe', '2348011112222', 'jane@example.com');"`;
    execSync(q1);
    
    // 2. Seed Teacher Allocation
    const q2 = `sqlite3 "${dbPath}" "INSERT OR IGNORE INTO teacher_allocations (teacher_id, class_name, subject) VALUES ('TCH-009', 'JSS 1', 'Mathematics');"`;
    execSync(q2);

    // 3. Seed Student
    const q3 = `sqlite3 "${dbPath}" "INSERT OR IGNORE INTO students (id, name, class_name) VALUES ('STU-001', 'Obi Emeka', 'JSS 1');"`;
    execSync(q3);

    // 4. Seed Student Subject
    const q4 = `sqlite3 "${dbPath}" "INSERT OR IGNORE INTO student_subjects (student_id, subject) VALUES ('STU-001', 'Mathematics');"`;
    execSync(q4);

    console.log("[E2E Grader Sync] Successfully seeded test data via SQLite CLI.");
  } catch (err) {
    console.error("[E2E Grader Sync] Seeding database failed:", err.message);
  }
};

test('Feature Guide — Mobile Grader Sync & WhatsApp Pulse', async ({ request }) => {
  // 1. Pre-seed database record
  seedTestData();

  // Cooldown delay
  await new Promise(resolve => setTimeout(resolve, 3000));

  // 2. Launch Electron
  const { app, window } = await launchApp('Diamond');
  await injectHighlighter(window);

  // ── Step 1: Open the Sync Hub ─────────────────────────────────────────────
  await showCaption(window, '🔄 Opening the Sync Hub to pair teacher terminals…');
  await clickWithHalo(window, '.nav-item[data-view="sync"]');
  await window.waitForSelector('#view-sync', { timeout: 20_000 });
  await window.waitForTimeout(800);

  // ── Step 2: Select Teacher ────────────────────────────────────────────────
  await showCaption(window, '👩‍🏫 Selecting teacher Jane Doe to generate connection payload…');
  const picker = window.locator('#teacher-picker');
  await expect(picker).toBeVisible({ timeout: 10000 });
  await picker.selectOption({ label: 'Jane Doe' });
  await window.dispatchEvent('#teacher-picker', 'change');
  await window.waitForTimeout(1500);

  // Assert QR code becomes visible (showing it is ready to be scanned)
  const qrCode = window.locator('#qr-code');
  await expect(qrCode).toBeVisible({ timeout: 15000 });
  await showCaption(window, '📱 Sync QR Code generated! Pointing tablet app here to sync…');
  await window.waitForTimeout(2000);

  // ── Step 3: Trigger API Sync Payload ──────────────────────────────────────
  await showCaption(window, '📡 [Simulated] Mobile tablet uploading 1 grade event & 1 attendance event to desktop hub…');
  await window.waitForTimeout(1000);

  const syncResponse = await request.post('http://localhost:3000/sync', {
    data: {
      device_id: 'TEST_PHONE_OPPO_A78',
      teacher_id: 'TCH-009',
      teacher_name: 'Jane Doe',
      events: [
        {
          event_id: 'GRADE_STU-001_MATHEMATICS_1',
          event_type: 'UPDATE_GRADE',
          payload: JSON.stringify({
            student_id: 'STU-001',
            subject: 'Mathematics',
            assessment: 'CA1',
            score: 88,
            breakdown: { CA1: 18, CA2: 20, Exam: 50 }
          })
        },
        {
          event_id: 'ATTEND_STU-001_2026-05-28',
          event_type: 'ATTENDANCE_UPDATE',
          payload: JSON.stringify({
            student_id: 'STU-001',
            class_name: 'JSS 1',
            date: '2026-05-28',
            status: 'Present',
            source: 'teacher'
          })
        }
      ]
    }
  });

  expect(syncResponse.ok()).toBeTruthy();
  await window.waitForTimeout(1500);

  // ── Step 4: Verify sync feed updates on Dashboard ─────────────────────────
  await showCaption(window, '🏠 Swapping to Dashboard command center to monitor live updates…');
  await clickWithHalo(window, '.nav-item[data-view="dashboard"]');
  await window.waitForSelector('#view-dashboard', { timeout: 15_000 });
  await window.waitForTimeout(1000);

  // Check that the events container has received the card for Obi Emeka's grade
  await showCaption(window, '⚡ Live feed updated! Verifying Jane Doe\'s grade submission is recorded…');
  const feedCard = window.locator('#events-container >> text=STU-001').first();
  await expect(feedCard).toBeVisible({ timeout: 15000 });
  await window.waitForTimeout(1500);

  // ── Step 5: Navigate to Nexus Pulse ───────────────────────────────────────
  await showCaption(window, '📡 Navigating to Nexus Pulse (WhatsApp Notification Center)…');
  await clickWithHalo(window, '.nav-item[data-view="pulse"]');
  await window.waitForSelector('#view-pulse', { timeout: 15_000 });
  await window.waitForTimeout(1000);

  await showCaption(window, '🤖 Verifying Pulse engine state and cloud bridge portal connectivity…');
  const botUi = window.locator('#pulse-bot-ui');
  await expect(botUi).toBeVisible({ timeout: 10000 });
  await window.waitForTimeout(2000);

  await showCaption(window, '✅ Mobile Grader Sync and WhatsApp Pulse verified successfully!');
  await window.waitForTimeout(1500);
  await hideCaption(window);

  await closeApp(app);
});
