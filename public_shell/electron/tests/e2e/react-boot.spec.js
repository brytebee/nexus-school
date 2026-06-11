/**
 * react-boot.spec.js
 *
 * Simulates:
 *   1. Booting the Electron app in React UI mode (USE_REACT_UI=true)
 *   2. Verifying the sidebar navigation and default active tab (Nexus Scholar)
 *   3. Navigating to the Financial Hub view
 *   4. Navigating to the CBT Arena view
 */

const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./helpers/launch');

test('Feature Guide — React Client: Boot and Verify Diamond Preview', async () => {
  // Cooldown delay
  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('[E2E React Boot] Launching Electron app with React UI enabled...');
  const { app, window } = await launchApp('Diamond', { USE_REACT_UI: 'true' });

  try {
    // 1. Verify the React shell main titlebar school name
    const titleLocator = window.locator('.titlebar-school-name');
    await expect(titleLocator).toBeVisible({ timeout: 20000 });
    console.log('[E2E React Boot] React Client title verified.');

    // 2. Verify that the navigation sidebar is visible
    const sidebar = window.locator('nav');
    await expect(sidebar).toBeVisible();

    // Verify Dashboard is active by default (App.tsx activeTab defaults to 'dashboard')
    const dashboardHeading = window.locator('h2:has-text("Command Center")');
    await expect(dashboardHeading).toBeVisible({ timeout: 20000 });
    console.log('[E2E React Boot] Dashboard view verified.');

    // 2. Click on Nexus Scholar in NavSidebar
    const scholarTab = window.locator('.nav-item:has-text("Nexus Scholar")');
    await expect(scholarTab).toBeVisible();
    await scholarTab.click();
    await window.waitForTimeout(1000);

    // Verify Knowledge Base in NexusScholar view is displayed
    const scholarHeading = window.locator('h2:has-text("Knowledge Base")');
    await expect(scholarHeading).toBeVisible({ timeout: 20000 });
    console.log('[E2E React Boot] Scholar view verified.');

    // 3. Click on Financial Hub in NavSidebar
    const financialHubTab = window.locator('.nav-item:has-text("Financial Hub")');
    await expect(financialHubTab).toBeVisible();
    await financialHubTab.click();
    await window.waitForTimeout(1000);

    // Verify Transaction Ledger in FeeLedger view is displayed
    const ledgerHeading = window.locator('h3:has-text("Transaction Ledger")');
    await expect(ledgerHeading).toBeVisible({ timeout: 20000 });
    console.log('[E2E React Boot] Financial Hub view verified.');

    // 4. Click on CBT Arena in NavSidebar
    const cbtTab = window.locator('.nav-item:has-text("CBT Arena")');
    await expect(cbtTab).toBeVisible();
    await cbtTab.click();
    await window.waitForTimeout(1000);

    // Verify Exam Clearance Scanner in ExamClearance view is displayed
    const cbtHeading = window.locator('h2:has-text("Exam Clearance Scanner")');
    await expect(cbtHeading).toBeVisible({ timeout: 20000 });
    console.log('[E2E React Boot] CBT Arena view verified.');

  } finally {
    console.log('[E2E React Boot] Closing application...');
    await closeApp(app);
  }
});
