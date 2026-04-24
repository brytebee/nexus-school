"use strict";
// ══════════════════════════════════════════════════════════════════════════════
// Nexus School OS — Nav
// ══════════════════════════════════════════════════════════════════════════════


      function toggleSidebar() {
        _sidebarCollapsed = !_sidebarCollapsed;
        const shell = document.getElementById("app-shell");
        const sidebar = document.getElementById("app-sidebar");
        if (_sidebarCollapsed) {
          shell.classList.add("sidebar-collapsed");
          sidebar.classList.add("collapsed");
          // Flip the icon to a right-pointing chevron
          document.getElementById("sidebar-toggle-btn").innerHTML = `
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.8"
                  fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>`;
        } else {
          shell.classList.remove("sidebar-collapsed");
          sidebar.classList.remove("collapsed");
          document.getElementById("sidebar-toggle-btn").innerHTML = `
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <rect x="1" y="3"    width="14" height="1.5" rx="0.75"/>
            <rect x="1" y="7.25" width="14" height="1.5" rx="0.75"/>
            <rect x="1" y="11.5" width="14" height="1.5" rx="0.75"/>
          </svg>`;
        }
      }

      function _historyPush(viewId) {
        // Truncate forward stack on new navigation
        if (_historyIdx < _viewHistory.length - 1) {
          _viewHistory.splice(_historyIdx + 1);
        }
        _viewHistory.push(viewId);
        _historyIdx = _viewHistory.length - 1;
        _updateHistoryBtns();
      }

      function _updateHistoryBtns() {
        const back = document.getElementById("btn-back");
        const forward = document.getElementById("btn-forward");
        if (back) back.disabled = _historyIdx <= 0;
        if (forward) forward.disabled = _historyIdx >= _viewHistory.length - 1;
      }

      function historyBack() {
        if (_historyIdx <= 0) return;
        _historyIdx--;
        _navToView(_viewHistory[_historyIdx]);
        _updateHistoryBtns();
      }

      function historyForward() {
        if (_historyIdx >= _viewHistory.length - 1) return;
        _historyIdx++;
        _navToView(_viewHistory[_historyIdx]);
        _updateHistoryBtns();
      }

      function _navToView(viewId) {
        document
          .querySelectorAll(".nav-item")
          .forEach((el) => el.classList.remove("active"));
        document
          .querySelectorAll(".view")
          .forEach((el) => el.classList.remove("active"));
        const navEl = document.querySelector(
          `.nav-item[data-view="${viewId}"]`,
        );
        const viewEl = document.getElementById(`view-${viewId}`);
        if (navEl) navEl.classList.add("active");
        if (viewEl) viewEl.classList.add("active");
        if (viewId === "teachers") refreshTeachersTable();
        if (viewId === "students") refreshStudentsTable();
        if (viewId === "sync") loadTeacherDropdown();
        if (viewId === "settings") hydrateSettingsForm();
        if (viewId === "about") hydrateAboutView();
        if (viewId === "dashboard") refreshDashboardStats();
      }

      function showView(viewId) {
        // ── Step 1: DOM transition (unconditional, never aborted) ──────────────
        document
          .querySelectorAll(".nav-item")
          .forEach((el) => el.classList.remove("active"));
        document
          .querySelectorAll(".view")
          .forEach((el) => el.classList.remove("active"));

        const navEl = document.querySelector(
          `.nav-item[data-view="${viewId}"]`,
        );
        if (navEl) navEl.classList.add("active");

        const viewEl = document.getElementById(`view-${viewId}`);
        if (viewEl) viewEl.classList.add("active");

        // ── Step 2: History (unconditional) ────────────────────────────────────
        _historyPush(viewId);

        // ── Step 3: Async side effects (isolated — a failure here never ────────
        //            prevents the view from being shown)                         
        const _safe = (fn) => {
          try {
            const result = fn();
            if (result && typeof result.catch === "function") {
              result.catch((err) =>
                console.error(`[showView:${viewId}] side-effect error:`, err)
              );
            }
          } catch (err) {
            console.error(`[showView:${viewId}] side-effect error:`, err);
          }
        };

        if (viewId === "teachers")       _safe(() => refreshTeachersTable());
        if (viewId === "students")       _safe(() => refreshStudentsTable());
        if (viewId === "sync")           _safe(() => loadTeacherDropdown());
        if (viewId === "settings")       _safe(() => hydrateSettingsForm());
        if (viewId === "about")          _safe(() => hydrateAboutView());
        if (viewId === "dashboard")      _safe(() => refreshDashboardStats());
        if (viewId === "printhub")       _safe(() => phInit());
        if (viewId === "result-studio")  _safe(() => rsInit());
      }
