import React, { useState } from "react";
import { NavSidebar } from "./components/NavSidebar";
import { HelpDrawer } from "./components/HelpDrawer";
import { SetupGuideDrawer } from "./components/SetupGuideDrawer";
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

function App() {
  const [activeTab, setActiveTab] = useState<string>(() => {
    return localStorage.getItem("nexus_nav_activeTab") || "dashboard";
  });
  const [historyStack, setHistoryStack] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("nexus_nav_historyStack");
      return saved ? JSON.parse(saved) : ["dashboard"];
    } catch {
      return ["dashboard"];
    }
  });
  const [historyIdx, setHistoryIdx] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("nexus_nav_historyIdx");
      return saved ? parseInt(saved, 10) : 0;
    } catch {
      return 0;
    }
  });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isHelpOpen, setIsHelpOpen] = useState<boolean>(false);
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);
  const [guideModule, setGuideModule] = useState<string>("");

  React.useEffect(() => {
    (window as any).showModuleSetupGuide = (moduleName: string) => {
      setGuideModule(moduleName);
      setIsGuideOpen(true);
    };
  }, []);

  const { identity } = useIdentity();
  const schoolName = identity?.name || "Nexus School OS";

  const navigateTo = (viewId: string, pushToHistory = true) => {
    if (viewId === activeTab) return;
    setActiveTab(viewId);
    localStorage.setItem("nexus_nav_activeTab", viewId);
    if (pushToHistory) {
      setHistoryStack((prev) => {
        const nextStack = prev.slice(0, historyIdx + 1);
        nextStack.push(viewId);
        const nextIdx = nextStack.length - 1;
        setHistoryIdx(nextIdx);
        localStorage.setItem(
          "nexus_nav_historyStack",
          JSON.stringify(nextStack),
        );
        localStorage.setItem("nexus_nav_historyIdx", nextIdx.toString());
        return nextStack;
      });
    }
  };

  const handleBack = () => {
    if (historyIdx > 0) {
      const nextIdx = historyIdx - 1;
      setHistoryIdx(nextIdx);
      const nextTab = historyStack[nextIdx];
      setActiveTab(nextTab);
      localStorage.setItem("nexus_nav_activeTab", nextTab);
      localStorage.setItem("nexus_nav_historyIdx", nextIdx.toString());
    }
  };

  const handleForward = () => {
    if (historyIdx < historyStack.length - 1) {
      const nextIdx = historyIdx + 1;
      setHistoryIdx(nextIdx);
      const nextTab = historyStack[nextIdx];
      setActiveTab(nextTab);
      localStorage.setItem("nexus_nav_activeTab", nextTab);
      localStorage.setItem("nexus_nav_historyIdx", nextIdx.toString());
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
        return <Settings />;
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
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                >
                  <path
                    d="M6 3l5 5-5 5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                >
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
              <button
                className="titlebar-nav-btn"
                id="btn-back"
                title="Go Back"
                disabled={historyIdx <= 0}
                onClick={handleBack}
              >
                ←
              </button>
              <button
                className="titlebar-nav-btn"
                id="btn-forward"
                title="Go Forward"
                disabled={historyIdx >= historyStack.length - 1}
                onClick={handleForward}
              >
                →
              </button>
            </div>
          </div>

          {/* View container */}
          <div className="view active">{renderActiveView()}</div>
        </main>
      </div>

      {/* Reusable right slide-in Help Drawer */}
      <HelpDrawer
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
        activeTab={activeTab}
      />

      {/* Reusable right slide-in Setup Guide Drawer */}
      <SetupGuideDrawer
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
        moduleName={guideModule}
      />
    </>
  );
}

export default App;
