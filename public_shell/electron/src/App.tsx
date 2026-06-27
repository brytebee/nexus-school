import React, { useState } from "react";
import { NavSidebar } from "./components/NavSidebar";
import { HelpDrawer } from "./components/HelpDrawer";
import { SetupGuideDrawer } from "./components/SetupGuideDrawer";
import { LicenseLockScreen, LockReason } from "./components/LicenseLockScreen";
import { useLicense } from "./hooks/useLicense";
import { useIdentity } from "./hooks/useIdentity";
import { FinancialHub } from "./views/FinancialHub";
import { ExamClearance } from "./views/ExamClearance";
import { CbtArena } from "./views/CbtArena";
import { NexusPulse } from "./views/NexusPulse";
import { NexusScholar } from "./views/NexusScholar";
import { About } from "./views/About";
import { Settings } from "./views/Settings";
import { Dashboard } from "./views/Dashboard";
import { Teachers } from "./views/Teachers";
import { Students } from "./views/Students";
import Classes from "./views/Classes";
import { Attendance } from "./views/Attendance";
import { SyncHub } from "./views/SyncHub";
import { PrintHub } from "./views/PrintHub";
import { ResultStudio } from "./views/ResultStudio";
import { SovereignPortal } from "./views/SovereignPortal";
import { PortalContent } from "./views/PortalContent";
import { LiveQuiz } from "./views/LiveQuiz";
import { AnalyticsDashboard } from "./views/AnalyticsDashboard";
import { NotesMarketplace } from "./views/NotesMarketplace";
import { SkillMastery } from "./views/SkillMastery";
import UpdateBanner from "./components/UpdateBanner";
import { AdModal } from "./components/AdModal";

function App() {
  const [activeTab, setActiveTab] = useState<string>(() => {
    return localStorage.getItem("nexus_nav_activeTab") || "dashboard";
  });
  const [tabHistory, setTabHistory] = useState<string[]>(["dashboard"]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem("nexus_nav_collapsed") === "true";
  });
  const [isHelpOpen, setIsHelpOpen] = useState<boolean>(false);
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);
  const [guideModule, setGuideModule] = useState<string>("");

  // ── Engagement Ad State ──────────────────────────────────────────────────
  const [navClickCount, setNavClickCount] = useState(0);
  const [currentAd, setCurrentAd] = useState<any>(null);
  const [adsList, setAdsList] = useState<any[]>([]);

  React.useEffect(() => {
    const loadAds = async () => {
      try {
        if ((window as any).electronAPI?.fetchAds) {
          const list = await (window as any).electronAPI.fetchAds();
          if (Array.isArray(list)) setAdsList(list);
        }
      } catch (err) {
        console.error('Failed to load ads list:', err);
      }
    };
    loadAds();
  }, []);

  // ── License enforcement ───────────────────────────────────────────────────
  const { license, loading: licenseLoading } = useLicense();
  const isLicenseLocked = license?.locked === true;
  const lockReason: LockReason =
    (license?.server_revoked ? 'server_revoked' : license?.reason) as LockReason
    ?? 'tampered';

  React.useEffect(() => {
    (window as any).showModuleSetupGuide = (moduleName: string) => {
      setGuideModule(moduleName);
      setIsGuideOpen(true);
    };
  }, []);

  const { identity } = useIdentity();
  const schoolName = identity?.name || "Nexus School OS";

  const navigateTo = (tab: string, pushToHistory = true) => {
    setActiveTab(tab);
    localStorage.setItem("nexus_nav_activeTab", tab);

    // Click counter logic for Standalone / Silver ad displays
    setNavClickCount((prevCount) => {
      const nextCount = prevCount + 1;
      if (nextCount >= 3) {
        const isStandaloneOrSilver = !license?.tier || license.tier === 'Standalone' || license.tier === 'Silver';
        const hasAdShownThisSession = sessionStorage.getItem('ad_shown') === '1';
        const isGeneratingReport = (window as any).isReportGenerating === true;

        if (isStandaloneOrSilver && !hasAdShownThisSession && !isGeneratingReport && adsList.length > 0) {
          const lastAdIndex = parseInt(localStorage.getItem('ad_last_index') || '0', 10);
          const nextIndex = (lastAdIndex + 1) % adsList.length;
          localStorage.setItem('ad_last_index', nextIndex.toString());
          
          setCurrentAd(adsList[nextIndex]);
          sessionStorage.setItem('ad_shown', '1');
        }
        return 0; // Reset
      }
      return nextCount;
    });

    if (pushToHistory) {
      const newHistory = tabHistory.slice(0, historyIndex + 1);
      newHistory.push(tab);
      setTabHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }
  };

  const navigateBack = () => {
    if (historyIndex > 0) {
      const idx = historyIndex - 1;
      setHistoryIndex(idx);
      setActiveTab(tabHistory[idx]);
      localStorage.setItem("nexus_nav_activeTab", tabHistory[idx]);
    }
  };

  const navigateForward = () => {
    if (historyIndex < tabHistory.length - 1) {
      const idx = historyIndex + 1;
      setHistoryIndex(idx);
      setActiveTab(tabHistory[idx]);
      localStorage.setItem("nexus_nav_activeTab", tabHistory[idx]);
    }
  };

  const renderActiveView = () => {
    switch (activeTab) {
      case "dashboard":
        return <Dashboard onTabChange={(tab) => navigateTo(tab, true)} />;
      case "teachers":
        return <Teachers />;
      case "students":
        return <Students />;
      case "classes":
        return <Classes />;
      case "attendance":
        return <Attendance />;
      case "sync":
        return <SyncHub />;
      case "printhub":
        return <PrintHub onTabChange={(tab) => navigateTo(tab, true)} />;
      case "result-studio":
        return <ResultStudio />;
      case "portal":
        return <SovereignPortal />;
      case "portal-content":
        return <PortalContent />;
      case "fees":
        return <FinancialHub />;
      case "cbt":
        return <CbtArena onOpenHelp={() => setIsHelpOpen(true)} />;
      case "pulse":
        return <NexusPulse />;
      case "scholar":
        return <NexusScholar />;
      case "about":
        return <About onTabChange={(tab) => navigateTo(tab, true)} />;
      case "settings":
        return <Settings onTabChange={(tab) => navigateTo(tab, true)} />;
      case "live-quiz":
        return <LiveQuiz />;
      case "analytics":
        return <AnalyticsDashboard onOpenHelp={() => setIsHelpOpen(true)} />;
      case "notes-marketplace":
        return <NotesMarketplace />;
      case "skill-mastery":
        return <SkillMastery />;
      default:
        return (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border border-dashed border-nexus-border rounded-2xl bg-nexus-panel/40 animate-in fade-in duration-300">
            <span className="text-4xl mb-4">🏗️</span>
            <h2 className="text-2xl font-bold text-white mb-2 uppercase tracking-wide">
              {activeTab} Page
            </h2>
            <p className="text-nexus-text-dim max-w-md text-sm leading-relaxed">
              This component is part of the Phase 2 view migration backlog. It
              will be loaded natively from the legacy template interface until
              fully ported to React.
            </p>
          </div>
        );
    }
  };

  // ── Three mutually exclusive render paths ────────────────────────────────
  // The app shell is NEVER in the DOM while loading or locked.
  // This eliminates any flash regardless of IPC timing or React batching.

  // 1. Loading — dark screen matching the BrowserWindow backgroundColor
  if (licenseLoading) {
    return (
      <div style={{
        position: 'fixed', inset: 0,
        background: '#0A0E2E',
        zIndex: 99999,
      }} />
    );
  }

  // 2. Locked — only the lock screen, nothing else in the DOM
  if (isLicenseLocked) {
    return (
      <LicenseLockScreen
        reason={lockReason}
        message={license?.message}
      />
    );
  }

  // 3. Valid license — full app
  return (
    <>
      <div className="background-glow"></div>
      <div
        className={`app-shell ${isSidebarCollapsed ? "sidebar-collapsed" : ""} flex h-screen w-screen overflow-hidden text-nexus-text font-inter select-none`}
      >
        {/* Sidebar Layout */}
        <NavSidebar
          activeTab={activeTab}
          onTabChange={(tab) => navigateTo(tab, true)}
          isCollapsed={isSidebarCollapsed}
          onOpenHelp={() => setIsHelpOpen(true)}
        />

        {/* Main Content Area */}
        <main className="main-content">
          {/* Custom titlebar: toggle | school name | drag | nav arrows | win controls */}
          <div className="main-titlebar" id="main-titlebar">
            {/* Sidebar collapse toggle */}
            <button
              className="sidebar-toggle-btn"
              id="sidebar-toggle-btn"
              title="Toggle Sidebar"
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            >
              {isSidebarCollapsed ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.8"
                    fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="1" y="3" width="14" height="1.5" rx="0.75" />
                  <rect x="1" y="7.25" width="14" height="1.5" rx="0.75" />
                  <rect x="1" y="11.5" width="14" height="1.5" rx="0.75" />
                </svg>
              )}
            </button>

            {/* School Name */}
            <span className="titlebar-school-name" id="titlebar-school-name">
              {schoolName}
            </span>

            {/* Drag region fills remaining space */}
            <div className="titlebar-drag-region" />

            {/* Back/Forward Nav */}
            <div className="titlebar-nav">
              <button className="titlebar-nav-btn" id="btn-back" title="Go Back"
                disabled={historyIndex <= 0} onClick={navigateBack}>←</button>
              <button className="titlebar-nav-btn" id="btn-forward" title="Go Forward"
                disabled={historyIndex >= tabHistory.length - 1} onClick={navigateForward}>→</button>
            </div>
          </div>

          {/* View container */}
          <div className="view active">{renderActiveView()}</div>
        </main>
      </div>

      {/* Reusable right slide-in Help Drawer */}
      <HelpDrawer isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} activeTab={activeTab} />

      {/* Reusable right slide-in Setup Guide Drawer */}
      <SetupGuideDrawer isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} moduleName={guideModule} />

      {/* OTA Update Banner */}
      <UpdateBanner />

      {/* Ad Modal Overlay */}
      {currentAd && (
        <AdModal ad={currentAd} onClose={() => setCurrentAd(null)} />
      )}
    </>
  );
}

export default App;
