"use strict";
// ══════════════════════════════════════════════════════════════════════════════
// Nexus School OS — Sync
// ══════════════════════════════════════════════════════════════════════════════


      function renderQR(payload) {
        const qrContainer = document.getElementById("qr-code");
        const skeleton = document.getElementById("qr-skeleton");
        
        const ipEl = document.getElementById("server-ip");
        const portEl = document.getElementById("server-port");
        if (ipEl) ipEl.textContent = payload.ip || "0.0.0.0";
        if (portEl) portEl.textContent = payload.port || "3000";

        if (!qrContainer || typeof QRCode === "undefined") {
          cachedPayload = payload;
          return;
        }
        if (!payload.teacher_id) {
          cachedPayload = payload;
          return;
        }

        qrContainer.innerHTML = "";
        const qrData = JSON.parse(JSON.stringify(payload));
        if (qrData.config) {
          qrData.config.logoBase64 = null;
          qrData.config.principalSignBase64 = null;
          qrData.config.teacherSignBase64 = null;
        }

        new QRCode(qrContainer, {
          text: JSON.stringify(qrData),
          width: 240,
          height: 240,
          colorDark: "#000000",
          colorLight: "#FFFFFF",
          correctLevel: QRCode.CorrectLevel.H,
        });

        if (skeleton) skeleton.style.display = "none";
        qrContainer.style.display = "block";

        if (payload.config) applyIdentityToUI(payload.config);

        const copyBtn = document.getElementById("copy-payload-btn");
        if (copyBtn) {
          copyBtn.onclick = () => {
            navigator.clipboard.writeText(JSON.stringify(qrData));
            const span = document.getElementById("copy-btn-text");
            span.textContent = "Copied!";
            setTimeout(() => {
              span.textContent = "Copy Manual Sync Code";
            }, 2000);
          };
        }
      }

      async function loadTeacherDropdown() {
        if (!window.electronAPI?.getTeachers) return;
        const teachers = await window.electronAPI.getTeachers();
        const picker = document.getElementById("teacher-picker");
        picker.innerHTML =
          '<option value="" disabled selected>Select teacher to generate QR…</option>';

        if (teachers && teachers.length > 0) {
          teachers.forEach((t) => {
            const opt = document.createElement("option");
            opt.value = t.id;
            opt.textContent = t.name;
            opt.dataset.name = t.name;
            picker.appendChild(opt);
          });
        }
      }

    async function openBulkRemarksModal() {
        const overlay = document.getElementById("bulk-remarks-overlay");
        const tbody = document.getElementById("remarks-bulk-tbody");
        const log = document.getElementById("remarks-save-log");
        
        // Use current RS scope results
        if (!_rsResultsCache || !_rsResultsCache.length) {
            alert("Please click 'Preview' in Result Studio first to load a scope of students.");
            return;
        }

        overlay.style.display = "flex";
        tbody.innerHTML = "";
        log.textContent = "";
        
        // Fetch existing attendance for this scope
        const attRes = await window.electronAPI.getAttendance({ 
            class_name: _rsLastScope.class_name, 
            session: _rsLastScope.session, 
            term: _rsLastScope.term 
        });
        const attMap = new Map();
        if (attRes.ok) attRes.rows.forEach(r => attMap.set(r.student_id, r));

        _bulkRemarksData = JSON.parse(JSON.stringify(_rsResultsCache)); // Deep copy

        _bulkRemarksData.forEach((stu, idx) => {
            const att = attMap.get(stu.id) || { days_attended: 0, total_days: 0 };
            stu.days_attended = att.days_attended;
            stu.total_days = att.total_days;

            const tr = document.createElement("tr");
            tr.style.borderBottom = "1px solid rgba(255,255,255,0.03)";
            
            tr.innerHTML = `
                <td style="padding:10px 16px;">
                    <div style="font-weight:600;color:#fff;">${stu.name}</div>
                    <div style="font-size:11px;color:var(--text-dim);">${stu.class_name}</div>
                </td>
                <td style="padding:10px 16px;">
                    <div style="display:flex;gap:4px;align-items:center;">
                        <input type="number" class="modern-input" style="width:50px;padding:4px;text-align:center;" 
                               value="${stu.days_attended || 0}" 
                               oninput="_bulkRemarksData[${idx}].days_attended = parseInt(this.value)||0" />
                        <span style="color:var(--text-dim);">/</span>
                        <input type="number" class="modern-input" style="width:50px;padding:4px;text-align:center;" 
                               value="${stu.total_days || 0}" 
                               oninput="_bulkRemarksData[${idx}].total_days = parseInt(this.value)||0" />
                    </div>
                </td>
                <td style="padding:10px 16px;">
                    <textarea 
                        class="modern-input" 
                        style="width:100%;height:45px;font-size:12px;padding:6px;resize:vertical;"
                        oninput="_bulkRemarksData[${idx}].remark = this.value"
                    >${stu.remark || ""}</textarea>
                </td>
                <td style="padding:10px 16px;">
                    <textarea 
                        class="modern-input" 
                        style="width:100%;height:45px;font-size:12px;padding:6px;resize:vertical;"
                        oninput="_bulkRemarksData[${idx}].principal_remark = this.value"
                    >${stu.principal_remark || ""}</textarea>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    async function saveBulkRemarksData() {
        const log = document.getElementById("remarks-save-log");
        log.style.color = "var(--accent)";
        log.textContent = "⏳ Saving...";

        const payload = _bulkRemarksData.map(s => ({
            student_id: s.id,
            session: _rsLastScope.session,
            term: _rsLastScope.term,
            remark: s.remark,
            principal_remark: s.principal_remark,
            days_attended: s.days_attended,
            total_days: s.total_days
        }));

        const res = await window.electronAPI.saveBulkRemarks(payload);
        if (res.ok) {
            log.style.color = "#4CAF50";
            log.textContent = "✅ All remarks saved successfully!";
            // Update cache so RS UI stays in sync if they click generate now
            _rsResultsCache = JSON.parse(JSON.stringify(_bulkRemarksData));
            setTimeout(() => { closeBulkRemarksModal(); }, 1200);
        } else {
            log.style.color = "#ff4444";
            log.textContent = "❌ Error: " + res.error;
        }
    }

    function autoFillRemarks() {
        const tbody = document.getElementById("remarks-bulk-tbody");
        _bulkRemarksData.forEach((stu, idx) => {
            if (!stu.remark) {
                let remark = "An impressive performance. Keep it up.";
                if (stu.average < 50) remark = "Work harder next term to improve your grades.";
                else if (stu.average < 70) remark = "A good result, but there is room for more effort.";
                
                stu.remark = remark;
                const rowTextareas = tbody.rows[idx].querySelectorAll("textarea");
                rowTextareas[0].value = remark;
            }
            if (!stu.principal_remark) {
                let princ = "Promoted to next class.";
                if (stu.average < 40) princ = "To repeat the class.";
                
                stu.principal_remark = princ;
                const rowTextareas = tbody.rows[idx].querySelectorAll("textarea");
                rowTextareas[1].value = princ;
            }
        });
    }

    function closeBulkRemarksModal() {
        document.getElementById("bulk-remarks-overlay").style.display = "none";
    }

    async function initSyncListeners() {
        const license = await window.electronAPI.getLicenseStatus();
        const tier = license?.tier || 'Silver';
        
        const picker = document.getElementById("teacher-picker");
        const adminQrBtn = document.getElementById("generate-admin-qr-btn");
        const deviceSlotsIndicator = document.getElementById("device-slots-indicator");
        
        if (tier === 'Standalone') {
          if (picker) picker.style.display = "none";
          if (adminQrBtn) {
            adminQrBtn.style.display = "block";
            adminQrBtn.onclick = async () => {
              document.getElementById("qr-code").style.display = "none";
              document.getElementById("qr-skeleton").style.display = "flex";
              await window.electronAPI.generateAdminQR();
            };
          }
          if (deviceSlotsIndicator) {
            deviceSlotsIndicator.style.display = "block";
            const stats = await window.electronAPI.getDbStats();
            const count = stats.devices || 0;
            deviceSlotsIndicator.textContent = `📲 Device Slots: ${count} / 2 used`;
          }
          
          if (window.electronAPI?.onHandshakeComplete) {
            window.electronAPI.onHandshakeComplete(async () => {
              if (deviceSlotsIndicator) {
                const stats = await window.electronAPI.getDbStats();
                const count = stats.devices || 0;
                deviceSlotsIndicator.textContent = `📲 Device Slots: ${count} / 2 used`;
              }
            });
          }
        } else {
          if (picker) picker.style.display = "block";
          if (adminQrBtn) adminQrBtn.style.display = "none";
          if (deviceSlotsIndicator) deviceSlotsIndicator.style.display = "none";
          
          if (picker) {
            picker.onchange = async (e) => {
              const sel = e.target.options[e.target.selectedIndex];
              if (sel.value && window.electronAPI?.setTeacher) {
                // Reset QR skeleton while waiting for new payload
                document.getElementById("qr-code").style.display = "none";
                document.getElementById("qr-skeleton").style.display = "flex";
                await window.electronAPI.setTeacher({
                  id: sel.value,
                  name: sel.dataset.name,
                });
              }
            };
          }
        }
    }

