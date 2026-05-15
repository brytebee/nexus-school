// ══════════════════════════════════════════════════════════════════════════════
// Nexus School OS — Attendance UI Controller (V2.3)
// Dual-Layer Attendance & Truancy Detection
// ══════════════════════════════════════════════════════════════════════════════
'use strict';

(function initAttendanceUI() {
    // ── State ─────────────────────────────────────────────────────────────────
    let _settings = {
        enable_daily_attendance: true,
        enable_subject_attendance: false,
        truancy_escalation_flow: [
            { step: 1, trigger_after: 1, notify: 'form_teacher', channel: 'in-app' },
            { step: 2, trigger_after: 3, notify: 'principal',    channel: 'in-app' },
            { step: 3, trigger_after: 5, notify: 'parent',       channel: 'whatsapp' }
        ]
    };

    // ── Boot: called when the Attendance view is navigated to ─────────────────
    window.initAttendanceView = async function () {
        await _loadSettings();
        _renderSettingsPanel();
        _applyTruancyTabGating();
        _renderTruancyRadar();
    };

    // ── Apply tier gate to the Truancy Radar tab itself ───────────────────────
    function _applyTruancyTabGating() {
        const isDiamond = window.currentLicenseTier === 'Diamond';
        const isGoldOrAbove = isDiamond || window.currentLicenseTier === 'Gold';
        const btn = document.getElementById('att-tab-btn-truancy');
        if (!btn) return;

        if (!isGoldOrAbove) {
            // Silver: hide the tab entirely
            btn.style.display = 'none';
            return;
        }

        // Gold: tab is visible but show an inline upgrade notice inside the radar
        if (!isDiamond) {
            // Add a subtle badge to the tab button
            if (!btn.querySelector('.radar-tier-badge')) {
                const badge = document.createElement('span');
                badge.className = 'radar-tier-badge';
                badge.textContent = '💎';
                badge.style.cssText = 'font-size:11px; margin-left:6px; opacity:0.7;';
                btn.appendChild(badge);
            }
        }
    }


    // ── Settings Load ─────────────────────────────────────────────────────────
    async function _loadSettings() {
        if (!window.electronAPI?.attendance?.getSettings) return;
        const res = await window.electronAPI.attendance.getSettings();
        if (res.ok && res.settings) {
            _settings = { ..._settings, ...res.settings };
        }
    }

    // ── Settings Panel Render ─────────────────────────────────────────────────
    function _renderSettingsPanel() {
        const isDiamond = window.currentLicenseTier === 'Diamond';

        // Toggle hydration
        const dailyToggle   = document.getElementById('att-toggle-daily');
        const subjectToggle = document.getElementById('att-toggle-subject');
        
        if (dailyToggle) {
            dailyToggle.checked = _settings.enable_daily_attendance === true || _settings.enable_daily_attendance === 'true';
        }
        
        if (subjectToggle) {
            if (isDiamond) {
                subjectToggle.checked = _settings.enable_subject_attendance === true || _settings.enable_subject_attendance === 'true';
                subjectToggle.disabled = false;
            } else {
                subjectToggle.checked = false;
                subjectToggle.disabled = true;
            }
        }

        // Escalation ladder render
        const truancyWrapper = document.getElementById('truancy-config-wrapper');
        if (truancyWrapper) {
            if (isDiamond) {
                _renderEscalationLadder();
            } else {
                truancyWrapper.innerHTML = `
                    <div style="text-align: center; padding: 20px 10px;">
                        <span style="font-size: 24px; margin-bottom: 10px; display: block;">💎</span>
                        <h4 style="color: var(--text); font-size: 14px; margin-bottom: 8px;">Diamond Tier Required</h4>
                        <p style="color: var(--text-dim); font-size: 11px; line-height: 1.4; margin-bottom: 12px;">
                            Guardian Shield allows you to configure automated escalation ladders when students skip specific subjects.
                        </p>
                        <span style="font-size:10px; font-weight:700; color:#00e5ff; padding:4px 8px; background:rgba(0,229,255,0.1); border-radius:4px;">Upgrade to Unlock</span>
                    </div>
                `;
            }
        }
    }

    function _renderEscalationLadder() {
        const container = document.getElementById('truancy-escalation-container');
        if (!container) return;
        const flow = Array.isArray(_settings.truancy_escalation_flow) ? _settings.truancy_escalation_flow : [];

        if (flow.length === 0) {
            container.innerHTML = `<div style="color:var(--text-dim); font-size:12px; text-align:center; padding:10px;">No escalation steps defined.</div>`;
            return;
        }

        const notifyLabels = { form_teacher: '🧑‍🏫 Form Teacher', principal: '👤 Principal', parent: '📱 Parent (WhatsApp)' };
        container.innerHTML = flow.map((step, i) => `
            <div style="display:flex; align-items:center; gap:10px; padding:10px 12px; background:rgba(255,255,255,0.04); border-radius:8px; border:1px solid rgba(255,255,255,0.08); margin-bottom:8px;">
                <div style="width:26px; height:26px; border-radius:50%; background:rgba(99,102,241,0.2); display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; color:#818cf8; flex-shrink:0;">
                    ${step.step}
                </div>
                <div style="flex:1;">
                    <div style="font-size:13px; font-weight:600;">${notifyLabels[step.notify] || step.notify}</div>
                    <div style="font-size:11px; color:var(--text-dim);">Triggers after <strong>${step.trigger_after}</strong> flag${step.trigger_after > 1 ? 's' : ''} · via ${step.channel}</div>
                </div>
                <button onclick="window.editEscalationStep(${i})" style="background:none; border:1px solid rgba(255,255,255,0.1); color:var(--text-dim); border-radius:5px; padding:3px 8px; cursor:pointer; font-size:11px;">Edit</button>
                <button onclick="window.removeEscalationStep(${i})" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:14px;">✕</button>
            </div>
        `).join('');
    }

    // ── Truancy Radar Render ──────────────────────────────────────────────────
    async function _renderTruancyRadar() {
        const tbody = document.getElementById('truancy-radar-tbody');
        if (!tbody || !window.electronAPI?.attendance?.getTruancyFlags) return;

        const res = await window.electronAPI.attendance.getTruancyFlags();
        if (!res.ok) { tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#ef4444; padding:20px;">Error loading data.</td></tr>`; return; }

        if (!res.rows || res.rows.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-dim); padding:20px;">✅ No active truancy flags.</td></tr>`;
            return;
        }

        const stepLabels = { 0: '—', 1: '🧑‍🏫 Form Teacher', 2: '👤 Principal', 3: '📱 Parent Notified' };
        tbody.innerHTML = res.rows.map(r => {
            const stepColor = r.escalation_step >= 3 ? '#ef4444' : r.escalation_step >= 2 ? '#f59e0b' : '#6366f1';
            return `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                <td style="padding:10px;">${r.student_name}</td>
                <td style="color:var(--text-dim);">${r.class_name}</td>
                <td style="font-weight:700; color:${stepColor}; text-align:center;">${r.flag_count}</td>
                <td style="color:${stepColor};">${stepLabels[r.escalation_step] || r.escalation_step}</td>
                <td style="color:var(--text-dim); font-size:11px;">${r.last_flagged || '—'}</td>
                <td>
                    <button onclick="window.dismissTruancyFlag('${r.student_id}', this)" style="background:transparent; border:1px solid rgba(16,185,129,0.4); color:#10b981; border-radius:5px; padding:3px 8px; cursor:pointer; font-size:11px;">Dismiss</button>
                </td>
            </tr>`;
        }).join('');
    }

    // ── Global Handlers (called from onclick attributes) ──────────────────────

    window.dismissTruancyFlag = async function (studentId, btn) {
        if (!window.electronAPI?.attendance?.dismissTruancyFlag) return;
        btn.disabled = true; btn.textContent = '...';
        const res = await window.electronAPI.attendance.dismissTruancyFlag({ student_id: studentId });
        if (res.ok) {
            btn.closest('tr').style.opacity = '0.3';
            setTimeout(() => _renderTruancyRadar(), 600);
        } else {
            btn.disabled = false; btn.textContent = 'Dismiss';
        }
    };

    window.removeEscalationStep = function (idx) {
        _settings.truancy_escalation_flow.splice(idx, 1);
        _renderEscalationLadder();
    };

    window.editEscalationStep = async function (idx) {
        const step = _settings.truancy_escalation_flow[idx];
        const { value: newThreshold } = await Swal.fire({
            title: `Edit Step ${step.step}`,
            html: `
                <div style="text-align:left;">
                    <label style="font-size:12px; color:#aaa;">Trigger after how many flags?</label><br/>
                    <input id="swal-threshold" type="number" min="1" value="${step.trigger_after}" class="swal2-input" style="width:100%;"/>
                </div>`,
            showCancelButton: true,
            confirmButtonText: 'Save',
            background: '#0b0f19', color: '#fff',
            preConfirm: () => document.getElementById('swal-threshold').value
        });
        if (newThreshold) {
            _settings.truancy_escalation_flow[idx].trigger_after = parseInt(newThreshold);
            _renderEscalationLadder();
        }
    };

    // ── Save Handlers (wired to buttons in index.html) ────────────────────────

    window.saveAttendanceSettings = async function () {
        if (!window.electronAPI?.attendance?.saveSettings) return;
        const dailyToggle   = document.getElementById('att-toggle-daily');
        const subjectToggle = document.getElementById('att-toggle-subject');

        const patch = {
            enable_daily_attendance:   dailyToggle   ? dailyToggle.checked   : _settings.enable_daily_attendance,
            enable_subject_attendance: subjectToggle ? subjectToggle.checked : _settings.enable_subject_attendance,
            truancy_escalation_flow: _settings.truancy_escalation_flow
        };

        const res = await window.electronAPI.attendance.saveSettings(patch);
        if (res.ok) {
            Swal.fire({ title: 'Saved!', icon: 'success', timer: 1200, showConfirmButton: false, background: '#0b0f19', color: '#fff' });
        } else {
            Swal.fire('Error', res.error || 'Failed to save', 'error');
        }
    };

    window.addEscalationStep = async function () {
        const notifyOptions = `
            <option value="form_teacher">Form Teacher (In-App)</option>
            <option value="principal">Principal (In-App)</option>
            <option value="parent">Parent (WhatsApp)</option>`;

        const result = await Swal.fire({
            title: 'Add Escalation Step',
            html: `
                <div style="text-align:left; display:flex; flex-direction:column; gap:12px;">
                    <div>
                        <label style="font-size:12px; color:#aaa;">Notify</label><br/>
                        <select id="swal-notify" class="swal2-input" style="width:100%;">${notifyOptions}</select>
                    </div>
                    <div>
                        <label style="font-size:12px; color:#aaa;">Trigger after (flag count)</label><br/>
                        <input id="swal-after" type="number" min="1" value="1" class="swal2-input" style="width:100%;"/>
                    </div>
                </div>`,
            showCancelButton: true,
            confirmButtonText: 'Add Step',
            background: '#0b0f19', color: '#fff',
            preConfirm: () => ({
                notify: document.getElementById('swal-notify').value,
                trigger_after: parseInt(document.getElementById('swal-after').value)
            })
        });

        if (result.isConfirmed && result.value) {
            const flow = _settings.truancy_escalation_flow;
            const channel = result.value.notify === 'parent' ? 'whatsapp' : 'in-app';
            flow.push({ step: flow.length + 1, ...result.value, channel });
            _renderEscalationLadder();
        }
    };

    window.refreshTruancyRadar = function () { _renderTruancyRadar(); };

})();
