// ══════════════════════════════════════════════════════════════════════════════
// Nexus Financial Hub — fees-ui.js
// Phase 5 (Gold Lightweight Fee Entry + Diamond Full Ledger)
// ══════════════════════════════════════════════════════════════════════════════
"use strict";

(function () {
  // ── Constants ───────────────────────────────────────────────────────────────
  const STATUS_CONFIG = {
    cleared: { label: "Cleared",  color: "#4CAF50", bg: "rgba(76,175,80,0.12)"  },
    partial:  { label: "Partial",  color: "#FFC107", bg: "rgba(255,193,7,0.12)"  },
    unpaid:   { label: "Unpaid",   color: "#FF5252", bg: "rgba(255,82,82,0.12)"  },
  };

  const fmt = (n) =>
    Number(n || 0).toLocaleString("en-NG", { minimumFractionDigits: 0 });

  const fmtDate = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return isNaN(d) ? iso : d.toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" });
  };

  const PAYMENT_METHOD_LABELS = {
    cash: "💵 Cash", transfer: "🏦 Transfer", pos: "💳 POS", bank_teller: "🧾 Bank Teller",
  };

  // ── State ───────────────────────────────────────────────────────────────────
  let _roster     = [];       // raw roster from backend
  let _pending    = new Map();// studentId → { total_billed, total_paid, next_due_date }
  let _isDiamond  = false;
  let _currentTerm, _currentSession;
  let _currentPage = 0;
  let _pageSize    = 15;
  let _searchQuery = "";

  // ── DOM refs (resolved at init time) ────────────────────────────────────────
  let $ = {};

  function _resolve() {
    const ids = [
      "fees-session-select","fees-term-select","fees-status-filter",
      "fees-summary-pill","btn-fees-load","fees-tbody","fees-th-actions",
      "fees-save-bar","fees-pending-count","btn-fees-save-all","btn-fees-discard",
      "fees-save-indicator","btn-fees-settings","fees-subtitle","btn-trigger-fee-pulse",
      // Settings modal
      "modal-fees-settings","btn-fees-settings-close","btn-fees-settings-cancel",
      "btn-fees-settings-save","fees-reminder-1","fees-reminder-2",
      "fees-accounts-list","btn-fees-add-account",
      "fees-installments-list","btn-fees-add-installment",
      "fees-shield-section","fees-shield-enabled","fees-shield-mode-group","fees-shield-mode",
      // Payment modal (Diamond)
      "modal-record-payment","payment-student-id","payment-modal-student-name",
      "payment-amount","payment-method","payment-reference","payment-note",
      "btn-payment-cancel","btn-payment-submit",
      // Ledger modal (Diamond)
      "modal-ledger","ledger-modal-student-name","ledger-tbody","btn-ledger-close",
    ];
    ids.forEach(id => { $[id] = document.getElementById(id); });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function _showIndicator(msg, color = "#4CAF50") {
    const el = $["fees-save-indicator"];
    if (!el) return;
    el.textContent   = msg;
    el.style.color   = color;
    el.style.opacity = "1";
    setTimeout(() => { el.style.opacity = "0"; }, 2500);
  }

  function _openModal(id)  { const el = $[id]; if (el) { el.style.display = "flex"; } }
  function _closeModal(id) { const el = $[id]; if (el) { el.style.display = "none"; } }

  function _updateSaveBar() {
    const count = _pending.size;
    if (!$["fees-save-bar"]) return;
    $["fees-save-bar"].style.display = count > 0 ? "flex" : "none";
    if ($["fees-pending-count"]) {
      $["fees-pending-count"].textContent = `${count} unsaved change${count !== 1 ? "s" : ""}`;
    }
  }

  function _updateSummaryPill(rows) {
    const pill = $["fees-summary-pill"];
    if (!pill || !rows.length) { if (pill) pill.textContent = ""; return; }
    const total    = rows.length;
    const cleared  = rows.filter(r => r.status === "cleared").length;
    const unpaid   = rows.filter(r => r.status === "unpaid").length;
    const outstanding = rows.reduce((acc, r) => acc + Number(r.balance || 0), 0);
    pill.textContent = `${cleared}/${total} cleared · ₦${fmt(outstanding)} outstanding`;
  }

  // ── Session selector (populated from term config) ────────────────────────────
  function _populateSessions() {
    const sel = $["fees-session-select"];
    if (!sel) return;
    // Offer last 3 academic sessions dynamically
    const year = new Date().getFullYear();
    sel.innerHTML = "";
    for (let y = year; y >= year - 2; y--) {
      const val = `${y - 1}/${y}`;
      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = val;
      sel.appendChild(opt);
    }
  }

  // ── Render roster ────────────────────────────────────────────────────────────
  function _renderRoster(rows) {
    const tbody  = $["fees-tbody"];
    const filter = $["fees-status-filter"]?.value || "all";
    if (!tbody) return;

    const filtered = filter === "all" ? rows : rows.filter(r => r.status === filter);
    _updateSummaryPill(filtered);

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text-dim);">
        No students match the selected filter.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map((r, i) => {
      const sc   = STATUS_CONFIG[r.status] || STATUS_CONFIG.unpaid;
      const pend = _pending.get(r.student_id);
      const billed = pend ? pend.total_billed : r.total_billed;
      const paid   = pend ? pend.total_paid   : r.total_paid;
      const bal    = billed - paid;
      const due    = pend ? pend.next_due_date : r.next_due_date;

      const billedInput = `<input type="number" class="fee-inline-input" data-field="total_billed"
        data-id="${r.student_id}" value="${billed}" min="0"
        style="width:100%;max-width:110px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
               border-radius:6px;color:#fff;padding:4px 8px;text-align:right;font-family:var(--font-mono);font-size:12px;">`;

      const paidInput  = `<input type="number" class="fee-inline-input" data-field="total_paid"
        data-id="${r.student_id}" value="${paid}" min="0"
        style="width:100%;max-width:110px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
               border-radius:6px;color:#fff;padding:4px 8px;text-align:right;font-family:var(--font-mono);font-size:12px;">`;

      const dueInput   = `<input type="date" class="fee-inline-input" data-field="next_due_date"
        data-id="${r.student_id}" value="${due || ''}"
        style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
               border-radius:6px;color:#fff;padding:4px 8px;font-size:11px;font-family:var(--font-mono);">`;

      const statusBadge = `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;
        font-weight:600;background:${sc.bg};color:${sc.color};">${sc.label}</span>`;

      const diamondActions = _isDiamond ? `
        <td style="text-align:center;white-space:nowrap;">
          <button class="small-btn btn-record-payment" data-id="${r.student_id}" data-name="${r.name}"
            style="font-size:11px;padding:4px 10px;margin-right:4px;background:rgba(0,229,255,0.08);
                   color:var(--accent);border-color:rgba(0,229,255,0.3);">+Pay</button>
          <button class="small-btn btn-view-ledger" data-id="${r.student_id}" data-name="${r.name}"
            style="font-size:11px;padding:4px 10px;background:rgba(255,255,255,0.05);
                   color:var(--text-dim);border-color:var(--glass-border);">Ledger</button>
        </td>` : "";

      // Gold: inline editable billed/paid; Diamond: read-only (payments go through modal)
      const billedCell = _isDiamond
        ? `<td style="text-align:right;font-family:var(--font-mono);font-size:13px;">₦${fmt(billed)}</td>`
        : `<td style="text-align:right;">${billedInput}</td>`;

      const paidCell   = _isDiamond
        ? `<td style="text-align:right;font-family:var(--font-mono);font-size:13px;color:#4CAF50;">₦${fmt(paid)}</td>`
        : `<td style="text-align:right;">${paidInput}</td>`;

      const dueCell    = _isDiamond
        ? `<td style="text-align:center;font-size:12px;">${fmtDate(due)}</td>`
        : `<td style="text-align:center;">${dueInput}</td>`;

      return `<tr data-id="${r.student_id}">
        <td style="color:var(--text-dim);font-size:12px;">${i + 1}</td>
        <td style="font-weight:500;">${r.name}</td>
        <td style="font-size:12px;color:var(--text-dim);">${r.class_name}</td>
        ${billedCell}
        ${paidCell}
        <td style="text-align:right;font-family:var(--font-mono);font-size:13px;
            color:${bal > 0 ? "#FF5252" : "#4CAF50"};">₦${fmt(bal)}</td>
        <td style="text-align:center;">${statusBadge}</td>
        ${dueCell}
        ${diamondActions}
      </tr>`;
    }).join("");
  }

  // ── Load roster from backend ─────────────────────────────────────────────────
  async function _loadRoster() {
    const session = $["fees-session-select"]?.value;
    const term    = $["fees-term-select"]?.value;
    if (!session || !term) return;

    _currentSession = session;
    _currentTerm    = term;
    _pending.clear();
    _updateSaveBar();

    if ($["fees-tbody"]) {
      $["fees-tbody"].innerHTML = `<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text-dim);">
        Loading…</td></tr>`;
    }

    const res = await window.electronAPI.fees.getRoster({ 
      academic_session: session, 
      term,
      limit: _pageSize,
      offset: _currentPage * _pageSize,
      search: _searchQuery
    });

    if (!res.ok) {
      console.error("[Financial Hub] getRoster failed:", res.error);
      return;
    }
    _roster = res.data;
    _renderRoster(_roster);

    // Render pagination
    NexusUI.renderPagination("fees-pagination", res.total, _pageSize, _currentPage, (newPage) => {
      _currentPage = newPage;
      _loadRoster();
    });
  }

  // ── Gold: inline edit event delegation ───────────────────────────────────────
  function _onInlineChange(e) {
    const input = e.target.closest(".fee-inline-input");
    if (!input) return;

    const id    = input.dataset.id;
    const field = input.dataset.field;
    const val   = input.value;

    // Retrieve base row from roster
    const baseRow = _roster.find(r => r.student_id === id) || {};
    const current = _pending.get(id) || {
      total_billed:  baseRow.total_billed  || 0,
      total_paid:    baseRow.total_paid    || 0,
      next_due_date: baseRow.next_due_date || "",
    };

    current[field] = field === "next_due_date" ? val : Number(val) || 0;
    _pending.set(id, current);
    _updateSaveBar();
  }

  // ── Gold: save all pending changes atomically ────────────────────────────────
  async function _saveAll() {
    if (!_pending.size) return;

    const btn = $["btn-fees-save-all"];
    if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }

    const results = await Promise.all(
      [..._pending.entries()].map(([student_id, vals]) =>
        window.electronAPI.fees.upsert({
          student_id,
          academic_session: _currentSession,
          term: _currentTerm,
          ...vals,
        })
      )
    );

    const failed = results.filter(r => !r.ok);
    if (failed.length) {
      console.error("[Financial Hub] Some saves failed:", failed);
      _showIndicator(`⚠️ ${failed.length} save(s) failed`, "#FF5252");
    } else {
      _showIndicator("✅ All changes saved");
    }

    if (btn) { btn.disabled = false; btn.textContent = "💾 Save All"; }
    await _loadRoster();
  }

  // ── Diamond: Record Payment ──────────────────────────────────────────────────
  function _openPaymentModal(studentId, studentName) {
    $["payment-student-id"].value          = studentId;
    $["payment-modal-student-name"].textContent = `Student: ${studentName}`;
    $["payment-amount"].value              = "";
    $["payment-reference"].value           = "";
    $["payment-note"].value                = "";
    $["payment-method"].value              = "cash";
    _openModal("modal-record-payment");
    setTimeout(() => $["payment-amount"]?.focus(), 80);
  }

  async function _submitPayment() {
    const studentId = $["payment-student-id"]?.value;
    const amount    = $["payment-amount"]?.value;
    const method    = $["payment-method"]?.value;
    const ref       = $["payment-reference"]?.value.trim();
    const note      = $["payment-note"]?.value.trim();

    if (!amount || Number(amount) <= 0) {
      $["payment-amount"]?.focus();
      return;
    }

    const btn = $["btn-payment-submit"];
    if (btn) { btn.disabled = true; btn.textContent = "Recording…"; }

    const res = await window.electronAPI.fees.recordPayment({
      student_id:       studentId,
      academic_session: _currentSession,
      term:             _currentTerm,
      amount:           Number(amount),
      payment_method:   method,
      reference_number: ref,
      note,
    });

    if (btn) { btn.disabled = false; btn.textContent = "Record Payment"; }

    if (res.ok) {
      _closeModal("modal-record-payment");
      _showIndicator("✅ Payment recorded");
      await _loadRoster();
    } else {
      console.error("[Financial Hub] recordPayment failed:", res.error);
      _showIndicator("⚠️ Payment failed: " + res.error, "#FF5252");
    }
  }

  // ── Diamond: Ledger ──────────────────────────────────────────────────────────
  async function _openLedger(studentId, studentName) {
    $["ledger-modal-student-name"].textContent = studentName;
    $["ledger-tbody"].innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-dim);">Loading…</td></tr>`;
    _openModal("modal-ledger");

    const res = await window.electronAPI.fees.getTransactions({
      student_id:       studentId,
      academic_session: _currentSession,
      term:             _currentTerm,
    });

    if (!res.ok || !res.data.length) {
      $["ledger-tbody"].innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-dim);">No transactions recorded for this term.</td></tr>`;
      return;
    }

    $["ledger-tbody"].innerHTML = res.data.map(tx => `<tr>
      <td style="font-size:12px;white-space:nowrap;">${fmtDate(tx.created_at)}</td>
      <td style="text-align:right;font-family:var(--font-mono);color:#4CAF50;">₦${fmt(tx.amount)}</td>
      <td style="font-size:12px;">${PAYMENT_METHOD_LABELS[tx.payment_method] || tx.payment_method}</td>
      <td style="font-size:12px;font-family:var(--font-mono);color:var(--text-dim);">${tx.reference_number || "—"}</td>
      <td style="font-size:12px;color:var(--text-dim);">${tx.note || "—"}</td>
    </tr>`).join("");
  }

  // ── Dynamic List Helpers ────────────────────────────────────────────────────
  function _createAccountRow(acc = {}) {
    const div = document.createElement("div");
    div.className = "fee-setting-row";
    div.style = "display:flex;gap:8px;align-items:center;margin-bottom:6px;";
    div.innerHTML = `
      <input type="text" placeholder="Bank Name" class="modern-input acc-bank" value="${acc.bank || ""}" style="flex:1;font-size:11px;padding:6px 10px;">
      <input type="text" placeholder="Acc Number" class="modern-input acc-num" value="${acc.number || ""}" style="flex:1;font-size:11px;padding:6px 10px;">
      <input type="text" placeholder="Acc Name" class="modern-input acc-name" value="${acc.name || ""}" style="flex:1;font-size:11px;padding:6px 10px;">
      <button class="small-btn btn-remove-row" style="color:#ff6b6b;border-color:rgba(255,107,107,0.2);">×</button>
    `;
    return div;
  }

  function _createInstallmentRow(inst = {}) {
    const div = document.createElement("div");
    div.className = "fee-setting-row";
    div.style = "display:flex;gap:8px;align-items:center;margin-bottom:6px;";
    div.innerHTML = `
      <input type="text" placeholder="Milestone Label (e.g. 1st Installment)" class="modern-input inst-label" value="${inst.label || ""}" style="flex:2;font-size:11px;padding:6px 10px;">
      <div style="display:flex;align-items:center;flex:1;gap:4px;">
        <input type="number" placeholder="%" class="modern-input inst-pct" value="${inst.percent || ""}" min="1" max="100" style="width:100%;font-size:11px;padding:6px 10px;">
        <span style="font-size:11px;color:var(--text-dim);">%</span>
      </div>
      <button class="small-btn btn-remove-row" style="color:#ff6b6b;border-color:rgba(255,107,107,0.2);">×</button>
    `;
    return div;
  }

  // ── Unified Settings Modal ───────────────────────────────────────────────────
  async function _openSettingsModal() {
    const res = await window.electronAPI.fees.getSettings();
    const s   = res.ok ? (res.data || {}) : {};

    if ($["fees-reminder-1"])    $["fees-reminder-1"].value    = s.reminder_date_1 || "";
    if ($["fees-reminder-2"])    $["fees-reminder-2"].value    = s.reminder_date_2 || "";
    
    // Accounts
    const accList = $["fees-accounts-list"];
    if (accList) {
      accList.innerHTML = "";
      const accounts = s.bank_accounts || [];
      if (accounts.length) {
        accounts.forEach(a => accList.appendChild(_createAccountRow(a)));
      } else {
        accList.appendChild(_createAccountRow());
      }
    }

    // Installments
    const instList = $["fees-installments-list"];
    if (instList) {
      instList.innerHTML = "";
      const installments = s.installment_plans || [];
      if (installments.length) {
        installments.forEach(i => instList.appendChild(_createInstallmentRow(i)));
      } else {
        instList.appendChild(_createInstallmentRow());
      }
    }

    if ($["fees-shield-section"]) $["fees-shield-section"].style.display = _isDiamond ? "block" : "none";
    if ($["fees-shield-enabled"]) $["fees-shield-enabled"].checked = !!s.fee_shield_enabled;
    if ($["fees-shield-mode"])    $["fees-shield-mode"].value        = s.fee_shield_mode || "warn";
    if ($["fees-shield-mode-group"]) {
      $["fees-shield-mode-group"].style.display = s.fee_shield_enabled ? "block" : "none";
    }
    _openModal("modal-fees-settings");
  }

  async function _saveSettings() {
    const patch = {
      reminder_date_1: $["fees-reminder-1"]?.value || "",
      reminder_date_2: $["fees-reminder-2"]?.value || "",
      bank_accounts: [],
      installment_plans: [],
    };

    // Serialize accounts
    document.querySelectorAll("#fees-accounts-list .fee-setting-row").forEach(row => {
      const bank = row.querySelector(".acc-bank").value.trim();
      const num  = row.querySelector(".acc-num").value.trim();
      const name = row.querySelector(".acc-name").value.trim();
      if (bank && num && name) {
        patch.bank_accounts.push({ bank, number: num, name });
      }
    });

    // Serialize installments
    document.querySelectorAll("#fees-installments-list .fee-setting-row").forEach(row => {
      const label = row.querySelector(".inst-label").value.trim();
      const pct   = row.querySelector(".inst-pct").value;
      if (label && pct) {
        patch.installment_plans.push({ label, percent: Number(pct) });
      }
    });

    if (_isDiamond) {
      patch.fee_shield_enabled = $["fees-shield-enabled"]?.checked || false;
      patch.fee_shield_mode    = $["fees-shield-mode"]?.value      || "warn";
    }

    const btn = $["btn-fees-settings-save"];
    if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }

    const res = await window.electronAPI.fees.saveSettings(patch);
    if (btn) { btn.disabled = false; btn.textContent = "Save Settings"; }

    if (res.ok) {
      _closeModal("modal-fees-settings");
      _showIndicator("✅ Settings saved");
    } else {
      console.error("[Financial Hub] saveSettings failed:", res.error);
    }
  }

  // ── Event wiring ─────────────────────────────────────────────────────────────
  function _bindEvents() {
    // Load button
    $["btn-fees-load"]?.addEventListener("click", _loadRoster);

    // Re-render on filter change (no backend call needed)
    $["fees-status-filter"]?.addEventListener("change", () => _renderRoster(_roster));

    // Gold inline editing
    $["fees-tbody"]?.addEventListener("change", _onInlineChange);

    // Gold save bar
    $["btn-fees-save-all"]?.addEventListener("click", _saveAll);
    $["btn-fees-discard"]?.addEventListener("click", () => {
      _pending.clear();
      _updateSaveBar();
      _renderRoster(_roster);
    });

    // Settings modal
    $["btn-fees-settings"]?.addEventListener("click", _openSettingsModal);
    $["btn-fees-settings-close"]?.addEventListener("click", () => _closeModal("modal-fees-settings"));
    $["btn-fees-settings-cancel"]?.addEventListener("click", () => _closeModal("modal-fees-settings"));
    $["btn-fees-settings-save"]?.addEventListener("click", _saveSettings);
    
    // Dynamic lists events
    $["btn-fees-add-account"]?.addEventListener("click", () => {
      $["fees-accounts-list"]?.appendChild(_createAccountRow());
    });
    $["btn-fees-add-installment"]?.addEventListener("click", () => {
      $["fees-installments-list"]?.appendChild(_createInstallmentRow());
    });

    ["fees-accounts-list", "fees-installments-list"].forEach(id => {
      $[id]?.addEventListener("click", (e) => {
        if (e.target.closest(".btn-remove-row")) {
          e.target.closest(".fee-setting-row").remove();
        }
      });
    });

    $["fees-shield-enabled"]?.addEventListener("change", (e) => {
      if ($["fees-shield-mode-group"]) {
        $["fees-shield-mode-group"].style.display = e.target.checked ? "block" : "none";
      }
    });

    // Payment modal
    $["btn-payment-cancel"]?.addEventListener("click", () => _closeModal("modal-record-payment"));
    $["btn-payment-submit"]?.addEventListener("click", _submitPayment);

    // Ledger modal
    $["btn-ledger-close"]?.addEventListener("click", () => _closeModal("modal-ledger"));
    
    // Fee Pulse Trigger
    $["btn-trigger-fee-pulse"]?.addEventListener("click", async () => {
      const { isConfirmed } = await Swal.fire({
        title: "Trigger Fee Reminders?",
        text: "This will send a WhatsApp message to ALL parents with outstanding balances for the current term. Proceed?",
        icon: "info",
        showCancelButton: true,
        confirmButtonColor: "var(--gold)",
        confirmButtonText: "🚀 Yes, Send Reminders",
        background: "#0A0E2E",
        color: "#fff",
        backdrop: false
      });

      if (isConfirmed) {
        $["btn-trigger-fee-pulse"].disabled = true;
        $["btn-trigger-fee-pulse"].textContent = "⌛ Sending...";
        window.electronAPI.send("trigger-fee-reminders");
      }
    });

    if (window.electronAPI.on) {
      window.electronAPI.on("fee-reminders-sent", (data) => {
        $["btn-trigger-fee-pulse"].disabled = false;
        $["btn-trigger-fee-pulse"].textContent = "🚀 Trigger Fee Pulse";
        Swal.fire({
          title: "Pulse Dispatched",
          text: `Successfully sent reminders to ${data.count} parents.`,
          icon: "success",
          background: "#0A0E2E",
          color: "#fff",
          backdrop: false
        });
      });
    }

    // Diamond action buttons (event delegation — tbody rebuilt on reload)
    $["fees-tbody"]?.addEventListener("click", (e) => {
      const payBtn    = e.target.closest(".btn-record-payment");
      const ledgerBtn = e.target.closest(".btn-view-ledger");
      if (payBtn)    _openPaymentModal(payBtn.dataset.id,    payBtn.dataset.name);
      if (ledgerBtn) _openLedger(ledgerBtn.dataset.id, ledgerBtn.dataset.name);
    });

    // Close modals on backdrop click
    ["modal-record-payment", "modal-ledger", "modal-fees-settings"].forEach(id => {
      $[id]?.addEventListener("click", (e) => {
        if (e.target === $[id]) _closeModal(id);
      });
    });
  }

  // ── Public init ──────────────────────────────────────────────────────────────
  window.feesInit = async function () {
    _resolve();

    // Determine tier
    const identity = await window.electronAPI.getIdentity();
    const tier     = identity?.tier || "Silver";
    _isDiamond     = (tier === "Diamond");

    // Configure subtitle
    if ($["fees-subtitle"]) {
      $["fees-subtitle"].textContent = _isDiamond
        ? "Full financial ledger — record payments, view transaction history, and enforce Fee Shield."
        : "Lightweight fee entry — track balances synced to Nexus Pulse for automated WhatsApp reminders.";
    }

    // Toggle Fee Pulse visibility
    if ($["btn-trigger-fee-pulse"]) {
      $["btn-trigger-fee-pulse"].style.display = (tier === "Gold" || tier === "Diamond") ? "block" : "none";
    }

    // Show/hide Diamond columns
    if ($["fees-th-actions"]) $["fees-th-actions"].style.display = _isDiamond ? "" : "none";

    _populateSessions();
    _bindEvents();

    // Auto-load with current config term
    const config = await window.electronAPI.getTermConfig();
    if (config?.academic_session && $["fees-session-select"]) {
      $["fees-session-select"].value = config.academic_session;
    }
    if (config?.term && $["fees-term-select"]) {
      $["fees-term-select"].value = config.term;
    }

    // Inject Search
    NexusUI.injectSearch("#view-fees .view-header", "Search students by name or ID...", (val) => {
      _searchQuery = val;
      _currentPage = 0;
      _loadRoster();
    });

    await _loadRoster();
  };
})();
