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

      window.applyFeatureMasking = function() {
        const tier = window.currentLicenseTier || "Silver";
        const tiers = { "Silver": 1, "Gold": 2, "Diamond": 3 };
        const currentLevel = tiers[tier] || 1;

        // Mask Sidebar Items
        document.querySelectorAll(".nav-item[data-tier]").forEach(item => {
          const reqTier = item.getAttribute("data-tier");
          const reqLevel = tiers[reqTier] || 1;
          const lockIcon = item.querySelector(".nav-lock");
          
          if (currentLevel < reqLevel) {
             item.classList.add("locked-feature");
             item.style.opacity = "0.6";
             item.style.filter = "grayscale(100%)";
             if (lockIcon) lockIcon.style.display = "inline";
          } else {
             item.classList.remove("locked-feature");
             item.style.opacity = "1";
             item.style.filter = "none";
             if (lockIcon) lockIcon.style.display = "none";
          }
        });

        // Mask Select Options (Result Templates)
        document.querySelectorAll("option[data-tier]").forEach(opt => {
          const reqTier = opt.getAttribute("data-tier");
          const reqLevel = tiers[reqTier] || 1;
          
          if (currentLevel < reqLevel) {
             opt.disabled = true;
             if (!opt.text.includes("🔒")) {
                opt.dataset.originalText = opt.text;
                opt.text = "🔒 " + opt.text + " (Locked)";
             }
          } else {
             opt.disabled = false;
             if (opt.dataset.originalText) {
                opt.text = opt.dataset.originalText;
             }
          }
        });

        // Fallback for selects if current value is disabled
        ['ph-template', 'rs-template'].forEach(id => {
            const select = document.getElementById(id);
            if (select && select.selectedOptions[0] && select.selectedOptions[0].disabled) {
                select.value = "clean_slate"; // Fall back to classic free
                if (typeof updateTemplatePreview === "function") {
                    updateTemplatePreview(select.value, id + '-preview');
                }
            }
        });
      };

      function hydrateAboutView() {
          const planInfo = document.getElementById('about-plan-info');
          if (!planInfo) return;

          const data = window.currentLicenseData || { tier: "Silver", student_count: 0, expires_at: Date.now() };
          const tier = window.currentLicenseTier || "Silver";
          
          let tierIcon = "🥈";
          if (tier === "Gold") tierIcon = "🥇";
          if (tier === "Diamond") tierIcon = "💎";

          const expiryDate = new Date(data.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
          const isExpired = Date.now() > data.expires_at;

          // Note: In a real app we'd fetch actual student count from DB.
          // For now we'll just show the limit.
          planInfo.innerHTML = `
              <div style="display:flex; justify-content:space-between; margin-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:12px;">
                  <span>Active Tier</span>
                  <span style="color:#fff; font-weight:bold;">${tierIcon} ${tier}</span>
              </div>
              <div style="display:flex; justify-content:space-between; margin-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:12px;">
                  <span>Student Quota</span>
                  <span style="color:#fff; font-weight:bold;">Up to ${data.student_count}</span>
              </div>
              <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
                  <span>Valid Until</span>
                  <span style="${isExpired ? 'color:#ff4444' : 'color:#00e5ff'}; font-weight:bold;">${expiryDate}</span>
              </div>
              ${isExpired ? '<div style="color:#ff4444; margin-top:8px; font-weight:bold;">⚠️ License Expired</div>' : ''}
          `;
      }

      function showView(viewId) {
        const navEl = document.querySelector(`.nav-item[data-view="${viewId}"]`);
        if (navEl && navEl.classList.contains("locked-feature")) {
            const reqTier = navEl.getAttribute("data-tier");
            Swal.fire({
                title: 'Premium Feature Locked',
                html: `<div style="font-size:40px;margin-bottom:10px;">🔒</div><p>This module requires the <b>Nexus ${reqTier} Tier</b>.</p>`,
                background: '#0d1235',
                color: '#fff',
                confirmButtonColor: '#d4af37',
                confirmButtonText: 'Contact Partner to Upgrade'
            });
            return;
        }

        // ── Step 1: DOM transition (unconditional, never aborted) ──────────────
        document
          .querySelectorAll(".nav-item")
          .forEach((el) => el.classList.remove("active"));
        document
          .querySelectorAll(".view")
          .forEach((el) => el.classList.remove("active"));

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
        if (viewId === "attendance")     _safe(() => { if (typeof window.attendanceInit === "function") window.attendanceInit(); });
      }
