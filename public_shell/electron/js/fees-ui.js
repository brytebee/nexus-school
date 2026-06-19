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
  let _fsClasses   = []; // Classes from db
  let _fsData      = []; // Fee structure items
  let _adjData     = []; // Fee adjustments

  // ── DOM refs (resolved at init time) ────────────────────────────────────────
  let $ = {};

  function _resolve() {
    const ids = [
      "fees-session-select","fees-term-select","fees-status-filter",
      "fees-summary-pill","btn-fees-load","fees-tbody","fees-th-actions",
      "fees-save-bar","fees-pending-count","btn-fees-save-all","btn-fees-discard",
      "fees-save-indicator","btn-fees-settings","fees-subtitle","btn-trigger-fee-pulse",
      // Tabs & Settings
      "fees-tab-btn-roster","fees-tab-btn-structure","fees-tab-btn-adjustments",
      "fees-tab-roster","fees-tab-structure","fees-tab-adjustments",
      // Settings slide-in panel
      "fees-settings-panel","btn-fees-settings-close","btn-fees-settings-save",
      "fees-reminder-1","fees-reminder-2",
      "fees-accounts-list","btn-fees-add-account",
      "fees-installments-list","btn-fees-add-installment",
      // Fee Gate Config
      "fee-gate-enabled","fee-gate-config-group","fee-gate-mode",
      "fee-gate-threshold-group","fee-gate-threshold","fee-gate-threshold-label",
      // Fee Shield (Diamond)
      "fees-shield-section","fees-shield-enabled","fees-shield-mode-group","fees-shield-mode",
      // Payment modal (Diamond)
      "modal-record-payment","payment-student-id","payment-modal-student-name",
      "payment-amount","payment-method","payment-reference","payment-note",
      "btn-payment-cancel","btn-payment-submit",
      // Ledger modal (Diamond)
      "modal-ledger","ledger-modal-student-name","ledger-tbody","btn-ledger-close",
      // Fee Structure Tab
      "fs-class-select","fs-term-filter","btn-fs-load","btn-fs-apply",
      "fs-tbody","fs-new-name","fs-new-term","fs-new-amount","btn-fs-add-item",
      "fs-class-count","fs-total-display",
      // Adjustments Tab
      "adj-tbody","btn-adj-add",
      "modal-adj","adj-student-select","adj-class-filter","adj-students-datalist","adj-type","adj-amount","adj-description",
      "btn-adj-cancel","btn-adj-submit",
      // Receipts tab
      "fees-tab-btn-receipts","fees-tab-receipts","receipts-badge","receipts-empty","receipts-table","receipts-tbody",
      "receipt-lightbox","receipt-lightbox-img","receipt-lightbox-text",
      "modal-receipt-approve","receipt-approve-subtitle","receipt-approve-amount","receipt-approve-method",
      "receipt-approve-ref","receipt-approve-term","receipt-approve-session","receipt-approve-note",
      "receipt-pdf-helper","receipt-pdf-text",
      "modal-receipt-reject","receipt-reject-reason","receipts-toast",
    ];
    ids.forEach(id => { $[id] = document.getElementById(id); });
  }

  // ── Tab Management ───────────────────────────────────────────────────────────
  window.feesSetTab = function(tabId) {
    ["roster", "structure", "adjustments", "receipts"].forEach(t => {
      const btn   = $[`fees-tab-btn-${t}`] || document.getElementById(`fees-tab-btn-${t}`);
      const panel = $[`fees-tab-${t}`]     || document.getElementById(`fees-tab-${t}`);
      if (btn)   btn.classList.toggle("active", t === tabId);
      if (panel) panel.style.display = t === tabId ? (t === 'roster' ? 'block' : 'flex') : 'none';
    });
    if (tabId === 'structure')   _loadStructure();
    if (tabId === 'adjustments') _loadAdjustments();
    if (tabId === 'receipts')    receiptsLoad();
  };

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function _showIndicator(msg, color = "#4CAF50") {
    const el = $["fees-save-indicator"];
    if (!el) return;
    el.textContent   = msg;
    el.style.color   = color;
    el.style.opacity = "1";
    setTimeout(() => { el.style.opacity = "0"; }, 2500);
  }

  function _openPanel()  { const p = $["fees-settings-panel"]; if (p) p.style.transform = 'translateX(0)'; }
  function _closePanel() { const p = $["fees-settings-panel"]; if (p) p.style.transform = 'translateX(100%)'; }
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

  async function _populateClassesAndStudents() {
    try {
      _fsClasses = await window.electronAPI.getClasses();
      if (!_fsClasses || _fsClasses.length === 0) {
         _fsClasses = ["JSS1", "JSS2", "JSS3", "SS1", "SS2", "SS3"];
      }
      const fsSel = $["fs-class-select"];
      if (fsSel) {
        fsSel.innerHTML = "";
        _fsClasses.forEach(c => {
          const opt = document.createElement("option");
          opt.value = c;
          opt.textContent = c;
          fsSel.appendChild(opt);
        });
      }

      // Populate students for adjustments dropdown
      const adjSel = $["adj-students-datalist"];
      const classSel = $["adj-class-filter"];
      if (adjSel && classSel) {
        adjSel.innerHTML = "";
        classSel.innerHTML = '<option value="">All Classes</option>';
        window._adjAllStudents = [];
        const res = await window.electronAPI.getAllStudents({ limit: 10000 });
        if (res.ok && res.data) {
          window._adjAllStudents = res.data;
          
          // Populate class filter dropdown
          const classes = [...new Set(res.data.map(s => s.class_name))].sort();
          classes.forEach(c => {
             const opt = document.createElement("option");
             opt.value = c; opt.textContent = c;
             classSel.appendChild(opt);
          });

          // Define filter function
          window.NexusFees = window.NexusFees || {};
          window.NexusFees.filterAdjStudents = (cls) => {
             adjSel.innerHTML = "";
             let studentIdInput = document.getElementById("adj-student-select").value.trim();
             const studentId = studentIdInput.split(" ")[0]; // Just in case name is also copied
             const inputEl = document.getElementById("adj-student-select");
             if (inputEl) inputEl.value = "";
             
             const filtered = cls ? window._adjAllStudents.filter(s => (s.class_name || '').replace(/\s+/g, '').toUpperCase() === (cls || '').replace(/\s+/g, '').toUpperCase()) : window._adjAllStudents;
             filtered.forEach(s => {
                const opt = document.createElement("option");
                opt.value = s.id;
                opt.textContent = `${s.name} (${s.class_name})`;
                adjSel.appendChild(opt);
             });
          };
          window.NexusFees.filterAdjStudents("");
        }
      }
    } catch(e) { console.error("Failed to load classes/students for fees ui", e); }
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

  // ── Fee Structure (Phase B) ──────────────────────────────────────────────────
  async function _loadStructure() {
    const className = $["fs-class-select"]?.value;
    if (!className) return;

    const tbody = $["fs-tbody"];
    if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:30px;color:var(--text-dim);">Loading...</td></tr>`;

    try {
      _fsData = await window.electronAPI.feeStructure.getAll({ className });
      if (tbody) {
        if (!_fsData.length) {
          tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:40px;color:var(--text-dim);">No fee items mapped for ${className}. Add one below.</td></tr>`;
          if ($["fs-total-display"]) $["fs-total-display"].textContent = "Total: ₦0";
          return;
        }

        const termFilter = $["fs-term-filter"]?.value || "All Terms";
        let total = 0;
        
        tbody.innerHTML = _fsData.map(item => {
          if (item.term === "All Terms" || item.term === termFilter) total += item.amount;
          return `<tr data-id="${item.id}">
            <td style="font-weight:500;">${item.item_name}</td>
            <td style="font-size:12px;color:var(--text-dim);">${item.term}</td>
            <td style="text-align:right;font-family:var(--font-mono);font-size:13px;color:#fff;">₦${fmt(item.amount)}</td>
            <td style="text-align:center;">
              <button class="small-btn btn-fs-del" data-id="${item.id}" style="color:#ff6b6b;border-color:rgba(255,107,107,0.2);">✕</button>
            </td>
          </tr>`;
        }).join("");

        if ($["fs-total-display"]) $["fs-total-display"].textContent = `Total (${termFilter}): ₦${fmt(total)}`;
      }
    } catch(e) {
      console.error("[Financial Hub] getStructure failed", e);
    }
  }

  async function _addStructureItem() {
    const className = $["fs-class-select"]?.value;
    const name = $["fs-new-name"]?.value.trim();
    const term = $["fs-new-term"]?.value;
    const amount = Number($["fs-new-amount"]?.value);
    
    if (!className || !name || !amount) return;

    $["btn-fs-add-item"].disabled = true;
    try {
      await window.electronAPI.feeStructure.upsertItem({ className, itemName: name, term, amount });
      $["fs-new-name"].value = "";
      $["fs-new-amount"].value = "";
      await _loadStructure();
    } finally {
      $["btn-fs-add-item"].disabled = false;
    }
  }

  async function _applyStructureToClass() {
    const className = $["fs-class-select"]?.value;
    const session = $["fees-session-select"]?.value || _currentSession;
    const term = $["fs-term-filter"]?.value || _currentTerm;
    
    if (!className || !session || !term) return;

    const { isConfirmed } = await Swal.fire({
      title: "Apply Fee Structure?",
      text: `This will bill ALL students in ${className} for ${term} based on the current structure. Proceed?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "var(--gold)",
      background: "#0A0E2E", color: "#fff"
    });

    if (isConfirmed) {
      const btn = $["btn-fs-apply"];
      if (btn) { btn.disabled = true; btn.textContent = "Applying..."; }
      try {
        const res = await window.electronAPI.feeStructure.applyToClass({ className, academicSession: session, term });
        if (res.ok) {
          _showIndicator(`✅ Billed ₦${fmt(res.totalBilled)} to ${res.count} students`);
          if (document.getElementById("fees-tab-btn-roster").classList.contains("active")) {
             _loadRoster();
          }
        }
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = "⚡ Apply to Class"; }
      }
    }
  }

  // ── Adjustments (Phase B) ────────────────────────────────────────────────────
  async function _loadAdjustments() {
    const tbody = $["adj-tbody"];
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text-dim);">Loading...</td></tr>`;

    try {
      _adjData = await window.electronAPI.feeStructure.getAdjustments({ academicSession: _currentSession, term: _currentTerm });
      if (tbody) {
        if (!_adjData.length) {
          tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-dim);">No adjustments recorded for this term.</td></tr>`;
          return;
        }
        tbody.innerHTML = _adjData.map(adj => {
          let emoji = "🏷️";
          if (adj.adjustment_type === 'scholarship') emoji = "🎓";
          if (adj.adjustment_type === 'waiver') emoji = "✋";
          if (adj.adjustment_type === 'owner_grant') emoji = "🏫";
          if (adj.adjustment_type === 'bursary') emoji = "💼";

          return `<tr>
            <td style="font-weight:500;">${adj.student_name}</td>
            <td style="font-size:12px;color:var(--text-dim);">${adj.class_name}</td>
            <td style="font-size:12px;">${emoji} ${adj.adjustment_type.replace('_',' ')}</td>
            <td style="font-size:12px;color:var(--text-dim);">${adj.description || '—'}</td>
            <td style="text-align:right;font-family:var(--font-mono);font-size:13px;color:#4CAF50;">₦${fmt(adj.amount)}</td>
            <td style="font-size:11px;color:var(--text-dim);">${adj.approved_by}</td>
            <td style="text-align:center;">
              <button class="small-btn btn-adj-del" data-id="${adj.id}" style="color:#ff6b6b;border-color:rgba(255,107,107,0.2);">✕</button>
            </td>
          </tr>`;
        }).join("");
      }
    } catch(e) {
      console.error("[Financial Hub] getAdjustments failed", e);
    }
  }

  async function _submitAdjustment() {
    const studentIdRaw = $["adj-student-select"]?.value || "";
    const studentId = studentIdRaw.split(" ")[0].trim();
    const type = $["adj-type"]?.value;
    const amount = Number($["adj-amount"]?.value);
    const desc = $["adj-description"]?.value.trim();

    if (!studentId || !amount) return;

    const btn = $["btn-adj-submit"];
    if (btn) { btn.disabled = true; btn.textContent = "Applying..."; }

    try {
      await window.electronAPI.feeStructure.addAdjustment({
        studentId, academicSession: _currentSession, term: _currentTerm, adjustmentType: type, description: desc, amount
      });
      _closeModal("modal-adj");
      _showIndicator("✅ Adjustment applied");
      await _loadAdjustments();
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Apply Adjustment"; }
    }
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

  // ── Unified Settings Panel (slide-in) ────────────────────────────────────────
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

    // ── Fee Gate Config ─────────────────────────────────────────────────────
    const gateEnabled = s.fee_gate_enabled !== false; // default on
    const gateMode    = s.fee_gate_mode || 'fixed';
    const gateThresh  = Number(s.fee_gate_threshold) || 0;
    if ($["fee-gate-enabled"]) $["fee-gate-enabled"].checked = gateEnabled;
    if ($["fee-gate-config-group"]) $["fee-gate-config-group"].style.display = gateEnabled ? 'flex' : 'none';
    // Map stored mode to UI option: threshold 0 + fixed → 'any', else use stored mode
    const uiMode = (gateMode === 'fixed' && gateThresh === 0) ? 'any' : gateMode;
    if ($["fee-gate-mode"]) $["fee-gate-mode"].value = uiMode;
    if ($["fee-gate-threshold"]) $["fee-gate-threshold"].value = gateThresh || '';
    if ($["fee-gate-threshold-group"]) $["fee-gate-threshold-group"].style.display = uiMode !== 'any' ? 'block' : 'none';
    if ($["fee-gate-threshold-label"]) $["fee-gate-threshold-label"].textContent = gateMode === 'percent' ? 'Threshold (% of billed)' : 'Threshold Amount (₦)';

    // Fee Shield (Diamond)
    if ($["fees-shield-section"]) $["fees-shield-section"].style.display = _isDiamond ? "block" : "none";
    if ($["fees-shield-enabled"]) $["fees-shield-enabled"].checked = !!s.fee_shield_enabled;
    if ($["fees-shield-mode"])    $["fees-shield-mode"].value        = s.fee_shield_mode || "warn";
    if ($["fees-shield-mode-group"]) {
      $["fees-shield-mode-group"].style.display = s.fee_shield_enabled ? "block" : "none";
    }
    _openPanel();
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

    // Fee Gate config
    const gateEnabled = $["fee-gate-enabled"]?.checked || false;
    const uiMode      = $["fee-gate-mode"]?.value || 'any';
    const threshold   = Number($["fee-gate-threshold"]?.value) || 0;
    patch.fee_gate_enabled   = gateEnabled;
    patch.fee_gate_mode      = uiMode === 'any' ? 'fixed' : uiMode; // 'any' stored as fixed+threshold 0
    patch.fee_gate_threshold = uiMode === 'any' ? 0 : threshold;

    if (_isDiamond) {
      patch.fee_shield_enabled = $["fees-shield-enabled"]?.checked || false;
      patch.fee_shield_mode    = $["fees-shield-mode"]?.value      || "warn";
    }

    const btn = $["btn-fees-settings-save"];
    if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }

    const res = await window.electronAPI.fees.saveSettings(patch);
    if (btn) { btn.disabled = false; btn.textContent = "Save Settings"; }

    if (res.ok) {
      _closePanel();
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

    // Settings slide-in panel
    $["btn-fees-settings"]?.addEventListener("click", _openSettingsModal);
    $["btn-fees-settings-close"]?.addEventListener("click", _closePanel);
    $["btn-fees-settings-save"]?.addEventListener("click", _saveSettings);

    // Fee gate toggle
    $["fee-gate-enabled"]?.addEventListener("change", (e) => {
      if ($["fee-gate-config-group"]) $["fee-gate-config-group"].style.display = e.target.checked ? 'flex' : 'none';
    });
    // Threshold label update on mode change
    $["fee-gate-mode"]?.addEventListener("change", (e) => {
      const lbl = $["fee-gate-threshold-label"];
      if (lbl) lbl.textContent = e.target.value === 'percent' ? 'Threshold (% of billed)' : 'Threshold Amount (₦)';
    });
    
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

    // Fee Structure Events
    $["fs-class-select"]?.addEventListener("change", _loadStructure);
    $["fs-term-filter"]?.addEventListener("change", _loadStructure);
    $["btn-fs-load"]?.addEventListener("click", _loadStructure);
    $["btn-fs-add-item"]?.addEventListener("click", _addStructureItem);
    $["btn-fs-apply"]?.addEventListener("click", _applyStructureToClass);
    $["fs-tbody"]?.addEventListener("click", async (e) => {
      const delBtn = e.target.closest(".btn-fs-del");
      if (delBtn) {
        if (confirm("Delete this fee item?")) {
          await window.electronAPI.feeStructure.deleteItem(delBtn.dataset.id);
          _loadStructure();
        }
      }
    });

    // Adjustments Events
    $["btn-adj-add"]?.addEventListener("click", () => {
      $["adj-amount"].value = "";
      $["adj-description"].value = "";
      _openModal("modal-adj");
    });
    $["btn-adj-cancel"]?.addEventListener("click", () => _closeModal("modal-adj"));
    $["btn-adj-submit"]?.addEventListener("click", _submitAdjustment);
    $["adj-tbody"]?.addEventListener("click", async (e) => {
      const delBtn = e.target.closest(".btn-adj-del");
      if (delBtn) {
        if (confirm("Delete this adjustment? It will NOT reverse the student's bill automatically.")) {
          await window.electronAPI.feeStructure.deleteAdjustment(delBtn.dataset.id);
          _loadAdjustments();
        }
      }
    });
    
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
    ["modal-record-payment", "modal-ledger"].forEach(id => {
      $[id]?.addEventListener("click", (e) => {
        if (e.target === $[id]) _closeModal(id);
      });
    });
  }

  // ── Public init ──────────────────────────────────────────────────────────────
  window.feesInit = async function () {
    _resolve();

    // Determine tier correctly from global license state
    const tier     = window.currentLicenseTier || "Silver";
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
    await _populateClassesAndStudents();
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

// ═══════════════════════════════════════════════════════════════════════════════
// RECEIPTS MODULE — Payment Receipt Review (Gold+)
// ═══════════════════════════════════════════════════════════════════════════════
(function() {
  'use strict';
  let _pendingReceiptId = null;
  let _pollInterval    = null;
  const fmt = (n) => n != null ? `₦${Number(n).toLocaleString('en-NG')}` : '—';

  // ── Toast ──────────────────────────────────────────────────────────────────
  function _toast(msg) {
    const container = document.getElementById('receipts-toast');
    if (!container) return;
    const el = document.createElement('div');
    el.style.cssText = 'background:var(--bg-panel);border:1px solid var(--glass-border);border-radius:10px;padding:12px 16px;font-size:13px;box-shadow:0 4px 20px rgba(0,0,0,0.4);pointer-events:all;cursor:pointer;max-width:300px;';
    el.innerHTML = `<span style="margin-right:8px;">📄</span>${msg}`;
    el.onclick = () => { feesSetTab('receipts'); el.remove(); };
    container.appendChild(el);
    setTimeout(() => el.remove(), 6000);
  }

  // ── Badge ──────────────────────────────────────────────────────────────────
  function _updateBadge(count) {
    const badge = document.getElementById('receipts-badge');
    if (!badge) return;
    badge.textContent = count;
    badge.style.display = count > 0 ? 'inline-block' : 'none';
  }

  // ── Poll every 30s ─────────────────────────────────────────────────────────
  function _startPolling() {
    if (_pollInterval) return;
    _pollInterval = setInterval(async () => {
      const res = await window.electronAPI.receipts.getCount();
      if (res?.ok) _updateBadge(res.count);
    }, 30000);
  }

  // ── Real-time push from main process ──────────────────────────────────────
  if (window.electronAPI?.receipts?.onNew) {
    window.electronAPI.receipts.onNew(({ count, studentName }) => {
      _updateBadge(count);
      _toast(`New receipt from ${studentName}'s parent`);
    });
  }

  // ── Name match badge ───────────────────────────────────────────────────────
  function _matchBadge(score) {
    if (score == null) return '<span style="color:var(--text-dim);font-size:11px;">—</span>';
    const pct = Math.round(score * 100);
    const color = pct >= 80 ? '#4CAF50' : pct >= 50 ? '#FFB300' : '#ff4444';
    const label = pct >= 80 ? '🟢' : pct >= 50 ? '🟡' : '🔴';
    return `<span style="color:${color};font-size:11px;" title="${pct}% name match">${label} ${pct}%</span>`;
  }

  // ── Load & render receipts ─────────────────────────────────────────────────
  window.receiptsLoad = async function() {
    const res = await window.electronAPI.receipts.getPending();
    const tbody  = document.getElementById('receipts-tbody');
    const table  = document.getElementById('receipts-table');
    const empty  = document.getElementById('receipts-empty');
    if (!tbody) return;

    const rows = res?.data || [];
    _updateBadge(rows.length);

    if (!rows.length) {
      if (table) table.style.display = 'none';
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';
    if (table) table.style.display = 'table';

    tbody.innerHTML = rows.map(r => {
      const via = r.submitted_via === 'whatsapp'
        ? '<span style="color:#25D366;font-size:11px;">📱 WhatsApp</span>'
        : '<span style="color:var(--accent);font-size:11px;">🌐 Portal</span>';
      const dt = r.created_at ? new Date(r.created_at).toLocaleDateString('en-NG') : '—';
      const hasImg = r.file_type && r.file_type.startsWith('image/');
      const hasPdf = r.file_type === 'application/pdf';
      return `<tr>
        <td><div style="font-weight:600;">${r.student_name}</div><div style="font-size:11px;color:var(--text-dim);">${r.class_name}</div></td>
        <td>${via}</td>
        <td style="font-weight:600;">${fmt(r.extracted_amount)}</td>
        <td style="font-size:11px;color:var(--text-dim);">${r.extracted_reference || '—'}</td>
        <td style="font-size:11px;">${r.extracted_payer_name || '—'}</td>
        <td>${_matchBadge(r.name_match_score)}</td>
        <td style="font-size:11px;color:var(--text-dim);">${dt}</td>
        <td style="display:flex;gap:6px;flex-wrap:wrap;">
          ${hasImg ? `<button class="tbl-action-btn" style="color:#00e5ff;border-color:rgba(0,229,255,0.3);" onclick="receiptsViewImg(${r.id})">👁️ View</button>` : ''}
          ${hasPdf && r.pdf_raw_text ? `<button class="tbl-action-btn" style="color:#00e5ff;border-color:rgba(0,229,255,0.3);" onclick="receiptsViewPdf(${r.id})">📄 View</button>` : ''}
          <button class="tbl-action-btn" style="color:#4CAF50;border-color:rgba(76,175,80,0.3);" onclick="receiptsOpenApprove(${r.id})">✅ Approve</button>
          <button class="tbl-action-btn" onclick="receiptsOpenReject(${r.id})">❌ Reject</button>
        </td>
      </tr>`;
    }).join('');

    _startPolling();
  };

  // ── Lightbox helpers ───────────────────────────────────────────────────────
  window.receiptsViewImg = async function(receiptId) {
    const res = await window.electronAPI.receipts.getPending();
    const r = (res?.data||[]).find(x => x.id === receiptId);
    if (!r) return;
    const lb  = document.getElementById('receipt-lightbox');
    const img = document.getElementById('receipt-lightbox-img');
    const txt = document.getElementById('receipt-lightbox-text');
    img.src = `data:${r.file_type};base64,${r.file_data_b64}`;
    img.style.display = 'block';
    txt.style.display = 'none';
    lb.style.display = 'flex';
  };

  window.receiptsViewPdf = async function(receiptId) {
    const res = await window.electronAPI.receipts.getPending();
    const r = (res?.data||[]).find(x => x.id === receiptId);
    if (!r) return;
    const lb  = document.getElementById('receipt-lightbox');
    const img = document.getElementById('receipt-lightbox-img');
    const txt = document.getElementById('receipt-lightbox-text');
    txt.textContent = r.pdf_raw_text || '(no text)';
    txt.style.display = 'block';
    img.style.display = 'none';
    lb.style.display = 'flex';
  };

  // ── Open Approve modal ─────────────────────────────────────────────────────
  window.receiptsOpenApprove = async function(receiptId) {
    _pendingReceiptId = receiptId;
    const res = await window.electronAPI.receipts.getPending();
    const r = (res?.data||[]).find(x => x.id === receiptId);
    if (!r) return;

    const subtitle = document.getElementById('receipt-approve-subtitle');
    if (subtitle) subtitle.textContent = `${r.student_name} · ${r.class_name} · via ${r.submitted_via}`;

    // Pre-fill if Diamond AI data available
    const amtEl = document.getElementById('receipt-approve-amount');
    const refEl = document.getElementById('receipt-approve-ref');
    if (amtEl) amtEl.value = r.extracted_amount || '';
    if (refEl) refEl.value = r.extracted_reference || '';

    // Pre-fill term/session from receipt context
    const termEl    = document.getElementById('receipt-approve-term');
    const sessionEl = document.getElementById('receipt-approve-session');
    if (termEl && r.term)             termEl.value = r.term;
    if (sessionEl && r.academic_session) sessionEl.value = r.academic_session;

    // PDF copy-helper
    const helper = document.getElementById('receipt-pdf-helper');
    const pdfTxt = document.getElementById('receipt-pdf-text');
    if (helper && pdfTxt) {
      if (r.pdf_raw_text) {
        pdfTxt.value = r.pdf_raw_text;
        helper.style.display = 'block';
      } else {
        helper.style.display = 'none';
      }
    }

    const modal = document.getElementById('modal-receipt-approve');
    if (modal) modal.style.display = 'flex';
  };

  // ── Approve action ─────────────────────────────────────────────────────────
  window.receiptsApprove = async function() {
    if (!_pendingReceiptId) return;
    const amount  = parseFloat(document.getElementById('receipt-approve-amount')?.value);
    const method  = document.getElementById('receipt-approve-method')?.value || 'transfer';
    const ref     = document.getElementById('receipt-approve-ref')?.value || '';
    const term    = document.getElementById('receipt-approve-term')?.value || '';
    const session = document.getElementById('receipt-approve-session')?.value || '';
    const note    = document.getElementById('receipt-approve-note')?.value || '';

    if (!amount || isNaN(amount)) {
      alert('Please enter the payment amount.');
      return;
    }

    const btn = document.getElementById('receipt-approve-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

    const res = await window.electronAPI.receipts.approve({
      receiptId: _pendingReceiptId, amount, method, reference: ref, note, term, session
    });

    if (btn) { btn.disabled = false; btn.textContent = '✅ Approve & Record'; }

    if (res?.ok) {
      document.getElementById('modal-receipt-approve').style.display = 'none';
      _pendingReceiptId = null;
      await receiptsLoad();
    } else {
      alert('Error: ' + (res?.error || 'Unknown error'));
    }
  };

  // ── Open Reject modal ──────────────────────────────────────────────────────
  window.receiptsOpenReject = function(receiptId) {
    _pendingReceiptId = receiptId;
    const el = document.getElementById('receipt-reject-reason');
    if (el) el.value = '';
    const modal = document.getElementById('modal-receipt-reject');
    if (modal) modal.style.display = 'flex';
  };

  // ── Reject action ──────────────────────────────────────────────────────────
  window.receiptsReject = async function() {
    if (!_pendingReceiptId) return;
    const reason = document.getElementById('receipt-reject-reason')?.value || '';
    const btn = document.getElementById('receipt-reject-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

    const res = await window.electronAPI.receipts.reject({ receiptId: _pendingReceiptId, reason });

    if (btn) { btn.disabled = false; btn.textContent = '❌ Reject'; }

    if (res?.ok) {
      document.getElementById('modal-receipt-reject').style.display = 'none';
      _pendingReceiptId = null;
      await receiptsLoad();
    } else {
      alert('Error: ' + (res?.error || 'Unknown error'));
    }
  };

  // Kick off initial badge count on page load
  window.addEventListener('load', async () => {
    const res = await window.electronAPI?.receipts?.getCount?.();
    if (res?.ok) _updateBadge(res.count);
    _startPolling();
  });
})();
