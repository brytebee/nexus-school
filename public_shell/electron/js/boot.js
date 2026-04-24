"use strict";
      // Boot sequence (runs when electronAPI is available)
      // ══════════════════════════════════════════════════════════════════════════
      if (window.electronAPI) {
        // ── License Guard ─────────────────────────────────────────────────────
        if (window.electronAPI.onLicenseStatus) {
          window.electronAPI.onLicenseStatus((status) => {
            if (status?.locked) {
              document.getElementById("license-lock-overlay").style.display =
                "flex";
              if (status.message)
                document.getElementById("license-lock-message").textContent =
                  status.message;
            }
          });
        }

        // ── QR Payload ────────────────────────────────────────────────────────
        window.electronAPI.onQrPayload((payload) => {
          renderQR(payload);
        });

        // ── Handshake Complete ────────────────────────────────────────────────
        window.electronAPI.onHandshakeComplete((data) => {
          devicesMarried++;
          const badge = document.getElementById("thermal-badge");
          if (badge) {
            badge.innerHTML = '<span class="dot"></span> Synced: Active';
            badge.style.color = "#4CAF50";
          }

          const devEl = document.getElementById("stat-devices-count");
          if (devEl) devEl.textContent = devicesMarried;

          const pulse = document.getElementById("pulse-label");
          if (pulse)
            pulse.textContent = `📱 ${data.teacher_name} tablet is now married.`;

          const pi = document.getElementById("pulse-indicator");
          if (pi) {
            pi.classList.add("active-sync");
            setTimeout(() => pi.classList.remove("active-sync"), 4000);
          }

          // Auto-navigate to dashboard on first successful handshake
          if (devicesMarried === 1) showView("dashboard");
        });

        // ── Sync Events (Grade Pulse) ─────────────────────────────────────────
        window.electronAPI.onSyncUpdate((payload) => {
          const events = Array.isArray(payload)
            ? payload
            : payload.events || [];
          const syncCount = payload.count || events.length || 0;
          const teacherName = payload.teacher_name || "A Teacher";

          totalGradeEvents += syncCount;
          const evEl = document.getElementById("stat-events-count");
          if (evEl) evEl.textContent = totalGradeEvents;

          const pi = document.getElementById("pulse-indicator");
          if (pi) {
            pi.classList.add("active-sync");
            setTimeout(() => pi.classList.remove("active-sync"), 3000);
          }

          const pulse = document.getElementById("pulse-label");
          if (pulse)
            pulse.textContent = `⚡ ${teacherName} just synced ${syncCount} scores!`;

          const container = document.getElementById("events-container");
          events.forEach((event) => {
            let p = {};
            try {
              p = JSON.parse(event.payload);
            } catch (e) {}
            let scoreDisplay = `Score: ${p.score ?? "N/A"}`;
            if (p.breakdown)
              scoreDisplay += ` <span style="font-size:10px;opacity:0.6;">(CA1:${p.breakdown.CA1} CA2:${p.breakdown.CA2} Ex:${p.breakdown.Exam})</span>`;

            const card = document.createElement("div");
            card.className = "event-card slide-in";
            card.innerHTML = `
            <div class="event-type">${event.event_type || "UPDATE"}</div>
            <div class="event-details">
              <span class="student-id">${p.student_id || "Unknown"} · ${p.subject || ""}</span>
              <span class="score-pill">${scoreDisplay}</span>
            </div>
            <div class="event-time">${new Date(event.created_at).toLocaleTimeString()}</div>
          `;
            container.prepend(card);
            if (container.children.length > 50) {
              container.removeChild(container.lastChild);
            }
           });

          // Track for PDF generation — show button once grades arrive
          allGradeEvents.push(...events);
          const genBtn = document.getElementById("generate-pdf-btn");
          if (genBtn && allGradeEvents.length)
            genBtn.style.display = "inline-flex";
        });

        // ── Phase 3.1: Live Pulse Heartbeat ──────────────────────────────────
        if (window.electronAPI.onPulseHeartbeat) {
          window.electronAPI.onPulseHeartbeat((payload) => {
            const container = document.getElementById("events-container");
            const card = document.createElement("div");
            card.className = "event-card slide-in";
            // Flash color for live UDP pulses
            card.style.borderLeft = "4px solid #b8860b";
            card.innerHTML = `
              <div class="event-type" style="color: #b8860b;">LIVE PULSE</div>
              <div class="event-details">
                <span class="student-id">${payload.teacher || "Teacher"}</span>
                <span class="score-pill" style="background: rgba(184, 134, 11, 0.2);">${payload.action || "Grading active..."}</span>
              </div>
              <div class="event-time">${new Date().toLocaleTimeString()}</div>
            `;
            container.prepend(card);
            if (container.children.length > 50) {
              container.removeChild(container.lastChild);
            }
            
            // Flash the top indicator
            const pi = document.getElementById("pulse-indicator");
            if (pi) {
              pi.classList.add("active-sync");
              setTimeout(() => pi.classList.remove("active-sync"), 1000);
            }
            const pulseLabel = document.getElementById("pulse-label");
            if (pulseLabel) {
               pulseLabel.textContent = `📡 ${payload.teacher} is live typing...`;
            }
          });
          // Acknowledge bridge ready
          if (window.electronAPI.invoke) window.electronAPI.invoke('pulse-bridge-ready');
        }

        // ── Track Grade Events for PDF generation ─────────────────────────────
        // (already handled inside the main onSyncUpdate callback above)

        // ── CSV Upload ────────────────────────────────────────────────────────
        const csvUploadEl = document.getElementById("csv-upload");
        if (csvUploadEl) {
          csvUploadEl.addEventListener("change", async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const tooltip = document.getElementById("upload-status-tooltip");
            if (tooltip) {
              tooltip.style.color = "#00E5FF";
              tooltip.textContent = "⏳ Processing CSV…";
            }
            if (window.electronAPI.processCSV)
              window.electronAPI.processCSV(file.path);
          });
        }

        window.electronAPI.onCSVLoaded(async (count) => {
          const tooltip = document.getElementById("upload-status-tooltip");
          if (tooltip) {
            tooltip.style.color = "#4CAF50";
            tooltip.textContent = `✅ ${count} Students Ready`;
          }

          await refreshTeachersTable();
          await refreshStudentsTable();
          await loadTeacherDropdown();
          await refreshDashboardStats();

          if (count > 0 && typeof Swal !== "undefined") {
            Swal.fire({
              title: "Import Successful",
              text: `${count} students have been ingested.`,
              icon: "success",
              background: "#0A0E2E",
              color: "#fff",
              confirmButtonColor: "#1A237E",
              backdrop: false,
              heightAuto: false,
            });
          }
        });

        // ── PDF Report Generation ─────────────────────────────────────────────
        const pdfBtn = document.getElementById("generate-pdf-btn");
        if (pdfBtn) pdfBtn.addEventListener("click", async () => {
            if (!allGradeEvents.length) {
              Swal.fire({
                title: "No Grade Data",
                text: "Sync grade events from the Android device first.",
                icon: "warning",
                background: "#0A0E2E",
                color: "#fff",
                backdrop: false,
              });
              return;
            }
            Swal.fire({
              title: "Generating PDF Reports",
              html: `<div style="margin:10px 0 20px;font-size:14px;opacity:0.8;">Nexus Engine is rendering A4 layouts…</div><div style="display:flex;justify-content:center;"><div class="bar-container" style="width:200px;"><div class="bar-fill"></div></div></div>`,
              allowOutsideClick: false,
              showConfirmButton: false,
              background: "#0A0E2E",
              color: "#fff",
              backdrop: false,
            });

            const gradeMap = {};
            allGradeEvents.forEach((evt) => {
              try {
                const p = JSON.parse(evt.payload);
                gradeMap[p.student_id] = {
                  total: p.score,
                  breakdown: p.breakdown || {},
                };
              } catch (e) {}
            });

            const identity = await window.electronAPI.getIdentity();
            const studentsForPdf = Object.entries(gradeMap).map(([id, g]) => ({
              id,
              name: id,
              class_name: "",
              ...g,
            }));

            try {
              const result = await window.electronAPI.generateReports({
                identity,
                students: studentsForPdf,
              });
              let msg = `Saved to: <code style="font-size:11px;">${result.folder}</code>`;
              if (identity.premiumPlan)
                msg += `<br><br><span style="color:#FFD700;font-size:12px;">⭐ Digital Envelopes generated!</span>`;
              Swal.fire({
                title: "✅ Reports Done!",
                html: msg,
                icon: "success",
                background: "#0A0E2E",
                color: "#fff",
                confirmButtonColor: "#1A237E",
                backdrop: false,
              });
            } catch (err) {
              Swal.fire({
                title: "Error",
                text: "PDF generation failed.",
                icon: "error",
                background: "#0A0E2E",
                color: "#fff",
                backdrop: false,
              });
            }
          });

        // ── License Status Enforcement ─────────────────────────────────────────
        if (window.electronAPI.onLicenseStatus) {
            window.electronAPI.onLicenseStatus(async (status) => {
                window.currentLicenseTier = status.tier || "Silver";
                if (typeof window.applyFeatureMasking === "function") window.applyFeatureMasking();
                
                if (status.locked) {
                    document.getElementById("license-lock-screen").style.display = "flex";
                    document.getElementById("lock-message").textContent = status.message || "Your Sovereign Shield license has expired.";
                    const hwid = await window.electronAPI.getHardwareId();
                    document.getElementById("lock-hardware-id").textContent = hwid;
                } else {
                    document.getElementById("license-lock-screen").style.display = "none";
                }
            });
        }

        // ── Settings Persistence ──────────────────────────────────────────────
        // ── Boot: load identity + stats ───────────────────────────────────────
        if (window.electronAPI.getIdentity) {
          window.electronAPI.getIdentity().then((id) => {
            if (id) applyIdentityToUI(id);
          });
        }
        refreshDashboardStats();

        // Robustness: retry renderQR until QRCode library is ready
        const readyInterval = setInterval(() => {
          if (typeof QRCode !== "undefined" && cachedPayload) {
            renderQR(cachedPayload);
            cachedPayload = null;
            clearInterval(readyInterval);
          }
        }, 500);

        if (window.electronAPI.uiReady) window.electronAPI.uiReady();

        // ── Platform Detection: show custom win controls on non-macOS ─────────
        window.electronAPI.getPlatform().then((platform) => {
          if (platform !== "darwin") {
            // Show custom ×  □  − buttons in the titlebar
            const wc = document.getElementById("win-controls");
            if (wc) wc.style.display = "flex";
            // On Win/Linux, no native inset — remove the traffic light placeholder
            const tls = document.getElementById("traffic-light-space");
            if (tls) tls.style.display = "none";
          }
        });

        // Seed the history with the starting view so the back button is disabled correctly
        _historyPush("dashboard");
        
        // ── Init Module Listeners ─────────────────────────────────────────────
        if (typeof initSettingsListeners === "function") initSettingsListeners();
        if (typeof initSyncListeners === "function") initSyncListeners();
      }
      
      // Global Support Backdoor
      window.promptSupportPIN = function() {
          const today = new Date();
          const dateStr = today.getFullYear() + "-" + (today.getMonth()+1) + "-" + today.getDate();
          let hash = 0;
          for(let i=0; i<dateStr.length; i++) hash += dateStr.charCodeAt(i);
          const expectedPin = ((hash * 1234) % 9000 + 1000).toString(); // 4 digit PIN
          
          Swal.fire({
              title: 'Nexus Support Override',
              input: 'password',
              inputPlaceholder: 'Enter Daily Support PIN',
              background: '#0d1235',
              color: '#fff',
              confirmButtonColor: '#00e5ff'
          }).then(result => {
              if (result.value === expectedPin) {
                  document.getElementById("license-lock-screen").style.display = "none";
                  Swal.fire({title: 'Unlocked', text: 'System unlocked for this session.', icon: 'success', background: '#0d1235', color: '#fff', timer: 2000, showConfirmButton: false});
              } else if (result.value) {
                  Swal.fire({title: 'Invalid PIN', icon: 'error', background: '#0d1235', color: '#fff'});
              }
          });
      };
