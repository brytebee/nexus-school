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
        if (viewId === "attendance" && typeof window.initAttendanceView === "function") window.initAttendanceView();
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

        // ── Step 2: History + current view tracking (unconditional) ─────────────
        _historyPush(viewId);
        window._currentViewId = viewId;
        try { localStorage.setItem('nexus_last_view', viewId); } catch(_) {}

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
        if (viewId === "cbt")            _safe(() => { if(window.cbtInit) window.cbtInit() });
        if (viewId === "settings")       _safe(() => hydrateSettingsForm());
        if (viewId === "about")          _safe(() => hydrateAboutView());
        if (viewId === "dashboard")      _safe(() => { refreshDashboardStats(); if (typeof window.initDashboardPipeline === "function") window.initDashboardPipeline(); });
        if (viewId === "printhub")       _safe(() => phInit());
        if (viewId === "result-studio")  _safe(() => rsInit());
        if (viewId === "attendance")     _safe(() => { if (typeof window.attendanceInit === "function") window.attendanceInit(); });
        if (viewId === "fees")           _safe(() => { if (typeof window.feesInit === "function") window.feesInit(); });
        if (viewId === "portal")         _safe(() => { if (typeof initPortalView === "function") initPortalView(); });
        // _injectHelpBtn is retired — the persistent sidebar ? button handles all contextual help
         if (viewId === "pulse")          _safe(() => { if (typeof initPulseView === "function") initPulseView(); });
        if (viewId === "scholar")        _safe(() => { if (typeof initScholarView === "function") initScholarView(); });
        if (viewId === "guardian")       _safe(() => { if (typeof initGuardianView === "function") initGuardianView(); });
      }

      var VIEW_HELP = {
        dashboard: { icon: '🏠', title: 'Command Center', tier: null, desc: `Your live school overview — everything at a glance.<br><br><strong style="color:#10b981;">Live Stats:</strong> Teacher count, student enrolment, and real-time grade sync events appear as teachers submit scores from their devices.<br><br><strong style="color:#10b981;">⚙️ Academic Pipeline:</strong> Click the gear icon in the top-right to set your class progression order (e.g. JSS1→SS1) and global pass marks.<br><br><strong style="color:#10b981;">Grade Feed:</strong> Every score synced from a teacher's tablet shows as a live card — your real-time audit trail.<br><br><strong style="color:#10b981;">Quick Action:</strong> Click <em>📄 Generate Report Cards</em> once grades appear in the feed.` },
        teachers:  { icon: '👨‍🏫', title: 'Teacher Registry', tier: null, desc: `Add and manage your entire teaching staff.<br><br><strong style="color:#10b981;">To add a teacher:</strong><br>1. Click <strong>+ Add Teacher</strong><br>2. Enter name, phone number, and host class<br>3. Assign the subjects they teach<br>4. Save — they can now pair their tablet via Sync Hub<br><br><strong style="color:#10b981;">Tip:</strong> A teacher must be registered here before they can receive a QR pairing code. Their phone number is used for Guardian Shield alerts.` },
        students:  { icon: '🎓', title: 'Student Registry', tier: null, desc: `Enrol and manage every student.<br><br><strong style="color:#10b981;">To add a student:</strong><br>1. Click <strong>+ Add Student</strong><br>2. Enter name, class (e.g. SS2A), and reg number<br>3. Add the <em>parent's WhatsApp number</em> with country code (e.g. 2348012345678)<br>4. Assign their subject list<br><br><strong style="color:#10b981;">Bulk Import:</strong> Click <em>📥 Upload CSV</em> to add hundreds of students at once. CSV columns: Name, Class, Reg No, Parent Phone.` },
        sync:      { icon: '🔄', title: 'Sync Hub', tier: null, desc: `Pair teacher tablets and receive grade submissions wirelessly.<br><br><strong style="color:#10b981;">To pair a teacher's device:</strong><br>1. Open the <strong>Nexus Teacher App</strong> on their Android tablet<br>2. Tap <em>Pair with School Hub</em><br>3. Point camera at the QR code on this screen<br>4. The teacher appears in the Dashboard feed when paired<br><br><strong style="color:#10b981;">Troubleshooting:</strong> Both devices must be on the same Wi-Fi. If QR expires, reload this screen.` },
        attendance: { icon: '📋', title: 'Attendance Module', tier: 'Gold', desc: `Two-layer attendance tracking with automated truancy escalation.<br><br><strong style="color:#f59e0b;">Daily Roll Call (Gold):</strong> Mark whole-day presence per class. Select class → pick date → tick each student → Save.<br><br><strong style="color:#f59e0b;">Subject Roll Call (Diamond):</strong> Track attendance per subject per period — ideal for secondary schools.<br><br><strong style="color:#f59e0b;">Truancy Flags:</strong> When absences exceed your threshold, Guardian Shield auto-alerts the parent via WhatsApp (Diamond).<br><br><strong style="color:#f59e0b;">⚙️ Settings:</strong> Click the gear icon to set thresholds, term dates, and alert templates.` },
        fees:      { icon: '💰', title: 'Financial Hub', tier: 'Gold', desc: `End-to-end fee management from billing to payment recording.<br><br><strong style="color:#f59e0b;">Setup fees:</strong><br>1. Go to <em>Fee Structure</em> → set amounts per class (e.g. SS1: ₦45,000)<br>2. Activate billing for this term — all students are auto-billed<br><br><strong style="color:#f59e0b;">Record a payment:</strong><br>1. Search for the student<br>2. Click <em>Record Payment</em><br>3. Enter amount + date — balance updates instantly<br><br><strong style="color:#f59e0b;">Fee Shield (Diamond):</strong> Blocks report card printing for students with outstanding balances.` },
        cbt:       { icon: '📎', title: 'CBT Arena', tier: 'Diamond', desc: `Computer-Based Testing — from question bank to live exam, fully offline.<br><br><strong style="color:#00e5ff;">Step 1 — Build a Question Bank:</strong><br>• Click <em>+ Create Bank</em> → name it and pick a subject<br>• Open the bank → click <em>+ Add Question</em> to type questions manually<br>• OR click <em>Upload via Nexus Scholar 🪄</em> to extract MCQs from any PDF/DOCX automatically<br><br><strong style="color:#00e5ff;">Step 2 — Deploy:</strong> Switch to the <em>Deploy</em> tab → pick bank, class, duration → 🚀 Deploy<br><br><strong style="color:#00e5ff;">Step 3 — Monitor:</strong> Watch live student progress from the <em>Live</em> tab.` },
        printhub:  { icon: '🖨️', title: 'Print Hub', tier: null, desc: `Generate professional report cards and broadsheets.<br><br><strong style="color:#10b981;">Terminal Report Cards:</strong><br>1. Select class and term<br>2. Click <em>Generate PDF</em> — saved to your Documents folder<br>3. Print or share<br><br><strong style="color:#10b981;">Broadsheets:</strong> Class-level subject tables for staff review — select subject and term.<br><br><strong style="color:#10b981;">Tip:</strong> Use <em>Result Studio</em> to design the report card template before printing here.` },
        'result-studio': { icon: '🎨', title: 'Result Studio', tier: null, desc: `Design your report card template before printing.<br><br><strong style="color:#10b981;">What you can customise:</strong><br>• Header layout — logo, school name, accreditation badge<br>• Grading scale — letter grades, remarks, performance bands<br>• Footer — address, contact, academic year<br>• Principal signature and stamp style<br><br><strong style="color:#10b981;">How:</strong> Adjust controls in the panel → click <em>Preview</em> to see a sample card → go to Print Hub to generate the full batch.` },
        pulse:     { icon: '📡', title: 'Nexus Pulse', tier: 'Gold', desc: `WhatsApp communication engine — keep parents informed automatically.<br><br><strong style="color:#f59e0b;">One-time setup:</strong><br>1. Scan the WhatsApp QR code with the school's dedicated phone number<br>2. Pulse is now connected and ready<br><br><strong style="color:#f59e0b;">What Pulse sends:</strong><br>• Fee reminders • Attendance alerts (Diamond) • Term digest • Emergency OTPs<br><br><strong style="color:#f59e0b;">Always-On Bridge (Diamond):</strong> Publishes a 24/7 parent portal accessible from anywhere, even when this computer is off.` },
        guardian:  { icon: '🛡️', title: 'Guardian Shield', tier: 'Gold', desc: `Automated school governance — runs in the background so you don't have to.<br><br><strong style="color:#f59e0b;">What Guardian does:</strong><br>• Sends the Principal a daily WhatsApp briefing every morning<br>• Auto-alerts parents when a student misses too many days<br>• Flags students with overdue fees<br>• Monitors CBT integrity<br><br><strong style="color:#f59e0b;">Configure:</strong> Set briefing time → enter Principal's WhatsApp number → toggle the alerts you want → Save.` },
        scholar:   { icon: '🧠', title: 'Nexus Scholar', tier: 'Diamond', desc: `AI knowledge base built from your school's own documents.<br><br><strong style="color:#00e5ff;">Upload documents:</strong><br>1. Click <em>Upload Document</em> (PDF, DOCX, or TXT — max 15MB)<br>2. Scholar indexes it in seconds<br>3. Ask questions in plain English: e.g. <em>"What is the fee for SS3?"</em><br>4. Scholar returns the answer from your documents<br><br><strong style="color:#00e5ff;">CBT Integration:</strong> In CBT Arena → open a Question Bank → click <em>Upload via Nexus Scholar</em> to auto-extract MCQs from past question PDFs.` },
        settings:  { icon: '⚙️', title: 'School Identity Forge', tier: null, desc: `Configure your school's official identity — appears on all reports and the parent portal.<br><br><strong style="color:#10b981;">Set up:</strong><br>• <em>School Name</em> — full official name as on report cards<br>• <em>Logo</em> — PNG/JPG, recommended 200×200px<br>• <em>Address, Motto, Signature</em> — for report footers<br>• <em>Principal Phone</em> — for OTP emergency access and Guardian briefings<br><br><strong style="color:#10b981;">Academic Pipeline:</strong> Set your class progression order (e.g. Nursery 1 → Primary 1 → JSS1) for promotion tracking.<br><br><strong style="color:#10b981;">Important:</strong> Always click <em>Save Identity</em> after changes.` },
        about:     { icon: 'ℹ️', title: 'About Nexus School OS', tier: null, desc: `Your license status, system information, and support details.<br><br><strong style="color:#10b981;">License info:</strong><br>• <em>Current Tier</em> — Silver (Free), Gold, or Diamond<br>• <em>Student Quota</em> — maximum students your license supports<br>• <em>Expiry Date</em> — when your Sovereign Shield license expires<br><br><strong style="color:#10b981;">To upgrade:</strong><br>1. Copy your <em>Hardware Fingerprint</em> from this screen<br>2. Send it to your Nexus Partner<br>3. Enter the license key they provide to activate.` },
        'live-quiz':      { icon: '⚡', title: 'Live Quiz System', tier: 'Diamond', desc: 'Kahoot-style real-time quiz — coming in the next release. Teachers project questions; students answer on their phones via a browser. No app install needed.' },
        analytics:        { icon: '📈', title: 'Analytics Dashboard', tier: 'Diamond', desc: 'At-risk student flagging, subject heatmaps, and grade progression charts — coming in the next release.' },
        'notes-marketplace': { icon: '📚', title: 'Notes Marketplace', tier: 'Diamond', desc: 'A storefront for teachers to sell study materials to students via the school portal — coming in the next release.' },
        'skill-mastery':  { icon: '🎯', title: 'Skill Mastery Tracking', tier: 'Diamond', desc: 'IEP-standard competency reports that track what students can do, not just their scores — coming in the next release.' },
      };

      function _injectHelpBtn(viewId) {

        document.querySelectorAll('.nexus-help-btn').forEach(b => b.remove());
        const help = VIEW_HELP[viewId];
        if (!help) return;
        const viewEl = document.getElementById('view-' + viewId);
        if (!viewEl) return;
        const header = viewEl.querySelector('.view-header');
        if (!header) return;

        const btn = document.createElement('button');
        btn.className = 'nexus-help-btn';
        btn.title = 'Help & Feature Info';
        btn.textContent = '?';
        btn.style.cssText = 'width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);color:rgba(255,255,255,0.5);font-size:13px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;transition:all 0.2s;margin-left:8px;-webkit-app-region:no-drag;outline:none;';
        btn.onmouseenter = () => { btn.style.background='rgba(0,229,255,0.15)'; btn.style.borderColor='rgba(0,229,255,0.4)'; btn.style.color='#00e5ff'; };
        btn.onmouseleave = () => { btn.style.background='rgba(255,255,255,0.06)'; btn.style.borderColor='rgba(255,255,255,0.15)'; btn.style.color='rgba(255,255,255,0.5)'; };

        btn.onclick = () => {
          const isGold = help.tier === 'Gold';
          const isDiamond = help.tier === 'Diamond';
          const tierColor  = isDiamond ? '#00e5ff' : '#ffd700';
          const tierBg     = isDiamond ? 'rgba(0,229,255,0.1)' : 'rgba(255,215,0,0.1)';
          const tierBorder = isDiamond ? 'rgba(0,229,255,0.3)' : 'rgba(255,215,0,0.3)';
          const tierEmoji  = isDiamond ? '💎' : '🥇';
          const tierBadge  = help.tier
            ? '<span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;background:' + tierBg + ';color:' + tierColor + ';border:1px solid ' + tierBorder + ';">' + tierEmoji + ' ' + help.tier + ' Tier</span>'
            : '<span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;background:rgba(16,185,129,0.1);color:#10b981;border:1px solid rgba(16,185,129,0.3);">✅ All Plans</span>';

          Swal.fire({
            html: '<div style="text-align:left;font-family:\'Inter\',sans-serif;"><div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;"><span style="font-size:36px;line-height:1;">' + help.icon + '</span><div><div style="font-size:17px;font-weight:800;color:#fff;margin-bottom:6px;">' + help.title + '</div>' + tierBadge + '</div></div><p style="font-size:13px;color:rgba(255,255,255,0.6);line-height:1.7;margin:0;">' + help.desc + '</p></div>',
            background: '#0d1235',
            color: '#fff',
            showConfirmButton: false,
            showCloseButton: true,
            width: 420,
          });
        };

        const actionsDiv = header.querySelector('.view-header-actions');
        if (actionsDiv) actionsDiv.appendChild(btn);
        else header.appendChild(btn);
      }

      // ── Persistent nav ? button — shows help for whatever view is active ────
      window._showNavHelp = function() {
        const viewId = window._currentViewId || 'dashboard';
        const help = VIEW_HELP[viewId];
        if (!help) {
          Swal.fire({ title: 'No Help Available', text: 'There is no feature guide for this screen yet.', background: '#0d1235', color: '#fff', showCloseButton: true, showConfirmButton: false });
          return;
        }
        const isGold    = help.tier === 'Gold';
        const isDiamond = help.tier === 'Diamond';
        const tierColor  = isDiamond ? '#00e5ff' : '#ffd700';
        const tierBg     = isDiamond ? 'rgba(0,229,255,0.1)' : 'rgba(255,215,0,0.1)';
        const tierBorder = isDiamond ? 'rgba(0,229,255,0.3)' : 'rgba(255,215,0,0.3)';
        const tierEmoji  = isDiamond ? '💎' : '🥇';
        const tierBadge  = help.tier
          ? '<span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;background:' + tierBg + ';color:' + tierColor + ';border:1px solid ' + tierBorder + ';">' + tierEmoji + ' ' + help.tier + ' Tier</span>'
          : '<span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;background:rgba(16,185,129,0.1);color:#10b981;border:1px solid rgba(16,185,129,0.3);">✅ All Plans</span>';
        Swal.fire({
          html: '<div style="text-align:left;font-family:\'Inter\',sans-serif;max-height:55vh;overflow-y:auto;"><div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;"><span style="font-size:36px;line-height:1;">' + help.icon + '</span><div><div style="font-size:17px;font-weight:800;color:#fff;margin-bottom:6px;">' + help.title + '</div>' + tierBadge + '</div></div><div style="font-size:13px;color:rgba(255,255,255,0.65);line-height:1.75;">' + help.desc + '</div></div>',
          background: '#0d1235',
          color: '#fff',
          showConfirmButton: false,
          showCloseButton: true,
          width: 460,
        });
      };
