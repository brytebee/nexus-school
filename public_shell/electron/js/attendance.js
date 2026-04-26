const attendanceCss = `
  .attendance-radios {
    display: inline-flex;
    gap: 8px;
    background: rgba(255, 255, 255, 0.05);
    padding: 4px;
    border-radius: 8px;
  }
  .attendance-radios .radio-label {
    cursor: pointer;
  }
  .attendance-radios input[type="radio"] {
    display: none;
  }
  .attendance-radios .radio-btn {
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    transition: all 0.2s;
    color: #64748b;
  }
  /* Confirmed states */
  .attendance-radios input[type="radio"]:checked + .radio-btn.green  { background: rgba(16,185,129,0.2); color: #10b981; }
  .attendance-radios input[type="radio"]:checked + .radio-btn.red    { background: rgba(239,68,68,0.2);  color: #ef4444; }
  .attendance-radios input[type="radio"]:checked + .radio-btn.yellow { background: rgba(245,158,11,0.2); color: #f59e0b; }

  /* Virgin (no existing DB record) date banner */
  .att-virgin-notice {
    background: rgba(255,179,0,0.07);
    border: 1px solid rgba(255,179,0,0.25);
    border-radius: 8px;
    padding: 9px 14px;
    font-size: 11px;
    color: #f59e0b;
    margin-bottom: 14px;
    text-align: center;
    letter-spacing: 0.2px;
  }
`;
const styleEl = document.createElement("style");
styleEl.textContent = attendanceCss;
document.head.appendChild(styleEl);

document.addEventListener("DOMContentLoaded", () => {
  const classSelect = document.getElementById("attendance-class-select");
  const datePicker = document.getElementById("attendance-date-picker");
  const saveBtn = document.getElementById("btn-save-attendance");
  const tbody = document.getElementById("attendance-tbody");

  // Default to today
  datePicker.value = new Date().toISOString().split("T")[0];

  async function loadClasses() {
    if (typeof _allStudents === "undefined" || _allStudents.length === 0) {
      if (window.electronAPI && window.electronAPI.getAllStudents) {
        _allStudents = await window.electronAPI.getAllStudents();
      }
    }
    if (typeof _allStudents === "undefined" || !_allStudents) return;
    const classes = [...new Set(_allStudents.map((s) => s.class_name).filter(Boolean))].sort();
    classSelect.innerHTML = '<option value="">Select Class...</option>';
    classes.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      classSelect.appendChild(opt);
    });
  }

  // Load classes whenever the system updates (students.js emits this or we just hook into dashboard)
  document.addEventListener("students-loaded", loadClasses);
  
  // Expose to nav.js so it can trigger it when the tab is clicked
  window.attendanceInit = loadClasses;

  // Call periodically until loaded, since events might fire before this mounts
  const initInterval = setInterval(() => {
    if (typeof _allStudents !== "undefined" && _allStudents.length > 0) {
      loadClasses();
      clearInterval(initInterval);
    }
  }, 500);

  async function loadRegister() {
    const className = classSelect.value;
    const date = datePicker.value;

    if (!className || !date) {
      tbody.innerHTML = `<tr><td colspan="2" style="text-align:center;padding:40px;color:#64748b;">Please select a class and date to load the attendance register.</td></tr>`;
      saveBtn.disabled = false;
      return;
    }

    const today = new Date().toISOString().split("T")[0];

    // ── Fetch records + term calendar dates in one round-trip ────────────────
    const response = await window.electronAPI.getDailyAttendance({ class_name: className, date });
    if (!response.ok) {
      alert("Error fetching attendance: " + response.error);
      return;
    }

    const { term_start_date: termStart, term_end_date: termEnd } = response;
    const hasTermBounds = termStart && termEnd;

    // ── Date validation (term-aware) ─────────────────────────────────────────
    const dateValidation = (() => {
      if (date > today) {
        return { blocked: true, msg: `⚠️ Cannot take attendance for a future date (<strong>${date}</strong>). Please select today or an earlier school day.` };
      }
      if (hasTermBounds) {
        if (date < termStart) {
          return { blocked: true, msg: `⚠️ <strong>${date}</strong> is before this term started (<strong>${termStart}</strong>). Select a date within the current term.` };
        }
        if (date > termEnd) {
          return { blocked: true, msg: `⚠️ <strong>${date}</strong> is after this term ended (<strong>${termEnd}</strong>). Select a date within the current term.` };
        }
      }
      return { blocked: false };
    })();

    if (dateValidation.blocked) {
      tbody.innerHTML = `<tr><td colspan="2" style="text-align:center;padding:40px;color:#f59e0b;">${dateValidation.msg}</td></tr>`;
      saveBtn.disabled = true;
      return;
    }
    saveBtn.disabled = false;

    // ── Soft advisory: term dates not yet configured ─────────────────────────
    const showTermWarning = !hasTermBounds;

    // ── Load students ────────────────────────────────────────────────────────
    const students = _allStudents.filter(s => s.class_name === className);
    if (students.length === 0) {
      tbody.innerHTML = `<tr><td colspan="2" style="text-align:center;padding:40px;color:#64748b;">No students found in this class.</td></tr>`;
      return;
    }

    const attendanceMap = {};
    response.data.forEach(r => { attendanceMap[r.student_id] = r.status; });

    const isVirginDate = response.data.length === 0;
    tbody.innerHTML = "";

    // ── Advisory banner: term calendar not set ───────────────────────────────
    if (showTermWarning) {
      const warnRow = document.createElement("tr");
      warnRow.innerHTML = `
        <td colspan="2">
          <div class="att-virgin-notice" style="color:#94a3b8;border-color:rgba(148,163,184,0.25);background:rgba(148,163,184,0.05);">
            ℹ️ Term start &amp; end dates are not configured. Open <strong>Print Hub → Term Calendar</strong> to enable strict date validation.
          </div>
        </td>`;
      tbody.appendChild(warnRow);
    }

    // ── Virgin-date notice (no prior records for this date) ──────────────────
    if (isVirginDate) {
      const noticeRow = document.createElement("tr");
      noticeRow.innerHTML = `
        <td colspan="2">
          <div class="att-virgin-notice">
            ⚠️ No attendance has been recorded for <strong>${date}</strong> yet.
            Review each student status before saving.
          </div>
        </td>`;
      tbody.appendChild(noticeRow);
    }

    // ── Render per-student rows ───────────────────────────────────────────────
    students.forEach(student => {
      const status = attendanceMap[student.id] ?? "Present";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="font-weight:500;">
          ${student.name}
          <div style="font-size:11px;color:#64748b;">${student.id}</div>
        </td>
        <td style="text-align:center;">
          <div class="attendance-radios" data-student-id="${student.id}">
            <label class="radio-label">
              <input type="radio" name="att-${student.id}" value="Present" ${status === "Present" ? "checked" : ""}>
              <span class="radio-btn green">Present</span>
            </label>
            <label class="radio-label">
              <input type="radio" name="att-${student.id}" value="Absent" ${status === "Absent" ? "checked" : ""}>
              <span class="radio-btn red">Absent</span>
            </label>
            <label class="radio-label">
              <input type="radio" name="att-${student.id}" value="Late" ${status === "Late" ? "checked" : ""}>
              <span class="radio-btn yellow">Late</span>
            </label>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  classSelect.addEventListener("change", loadRegister);
  datePicker.addEventListener("change", loadRegister);

  saveBtn.addEventListener("click", async () => {
    const className = classSelect.value;
    const date = datePicker.value;

    if (!className || !date) {
      alert("Please select a class and date.");
      return;
    }

    const records = [];
    const radioGroups = document.querySelectorAll(".attendance-radios");
    radioGroups.forEach(group => {
      const studentId = group.getAttribute("data-student-id");
      const checked = group.querySelector(`input[name="att-${studentId}"]:checked`);
      if (checked) {
        records.push({ student_id: studentId, status: checked.value });
      }
    });

    if (records.length === 0) {
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";

    const cfgRes = await window.electronAPI.getTermConfig();
    let session = "2024/2025";
    let term = "First Term";
    if (cfgRes.ok && cfgRes.data) {
        session = cfgRes.data.academic_session || session;
        term = cfgRes.data.term || term;
    }

    const res = await window.electronAPI.saveDailyAttendance({
      class_name: className,
      date,
      session,
      term,
      records
    });

    saveBtn.disabled = false;
    saveBtn.textContent = "Save Register";

    if (res.ok) {
      const oldBg = saveBtn.style.background;
      saveBtn.style.background = "#10b981"; // Success green
      saveBtn.textContent = "Saved!";
      setTimeout(() => {
        saveBtn.style.background = oldBg;
        saveBtn.textContent = "Save Register";
      }, 2000);
    } else {
      alert("Error saving attendance: " + res.error);
    }
  });
});

/* ════════════════════════════════════════════════════════════
   Student Attendance Report Logic
   ════════════════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {
  const btnReport = document.getElementById("btn-student-attendance-report");
  const overlay = document.getElementById("attendance-report-overlay");
  const btnClose = document.getElementById("btn-att-report-close");
  
  const classSelect = document.getElementById("att-report-class");
  const studentSelect = document.getElementById("att-report-student");
  const sessionSelect = document.getElementById("att-report-session");
  const termSelect = document.getElementById("att-report-term");
  
  let currentStudentData = []; // To cache attendance rows

  // ── Cache helper: wait for _allStudents to be populated ────────────────────
  function getStudentCache() {
    return (typeof _allStudents !== "undefined" && Array.isArray(_allStudents) && _allStudents.length > 0)
      ? _allStudents : null;
  }

  function waitForStudents(maxWaitMs = 3000, intervalMs = 150) {
    return new Promise((resolve, reject) => {
      const s = getStudentCache();
      if (s) return resolve(s);
      let elapsed = 0;
      const timer = setInterval(() => {
        const s2 = getStudentCache();
        if (s2) { clearInterval(timer); return resolve(s2); }
        elapsed += intervalMs;
        if (elapsed >= maxWaitMs) { clearInterval(timer); reject(new Error("Student data not loaded.")); }
      }, intervalMs);
    });
  }

  // ── Open modal ─────────────────────────────────────────────────────────────
  btnReport.addEventListener("click", async () => {
    overlay.style.display = "flex";
    classSelect.innerHTML = '<option value="">Loading classes...</option>';
    studentSelect.innerHTML = '<option value="">Select Student...</option>';
    studentSelect.disabled = true;
    resetStatsAndTable();

    try {
      const students = await waitForStudents();
      populateReportClassDropdown(students);
    } catch (e) {
      classSelect.innerHTML = '<option value="">⚠ Data not ready — close and retry</option>';
    }
  });

  btnClose.addEventListener("click", () => { overlay.style.display = "none"; });

  function populateReportClassDropdown(students) {
    const classes = [...new Set(students.map(s => s.class_name).filter(Boolean))].sort();
    classSelect.innerHTML = '<option value="">Select Class...</option>';
    classes.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      classSelect.appendChild(opt);
    });
    studentSelect.innerHTML = '<option value="">Select Student...</option>';
    studentSelect.disabled = true;
    resetStatsAndTable();
  }
  
  classSelect.addEventListener("change", (e) => {
    const cls = e.target.value;
    if (!cls) {
      studentSelect.innerHTML = '<option value="">Select Student...</option>';
      studentSelect.disabled = true;
      resetStatsAndTable();
      return;
    }
    const students = (getStudentCache() || []).filter(s => s.class_name === cls).sort((a,b) => a.name.localeCompare(b.name));
    studentSelect.innerHTML = '<option value="">Select Student...</option>';
    students.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.name;
      studentSelect.appendChild(opt);
    });
    studentSelect.disabled = false;
    resetStatsAndTable();
  });
  
  studentSelect.addEventListener("change", async (e) => {
    const studentId = e.target.value;
    if (!studentId) {
      resetStatsAndTable();
      return;
    }
    await loadStudentAttendance(studentId);
  });
  
  sessionSelect.addEventListener("change", renderStudentAttendance);
  termSelect.addEventListener("change", renderStudentAttendance);
  
  async function loadStudentAttendance(studentId) {
    const res = await window.electronAPI.getStudentAttendanceReport({ student_id: studentId });
    if (!res.ok) {
      alert("Failed to load attendance report: " + res.error);
      return;
    }
    currentStudentData = res.data || [];
    
    // Auto-populate session & term filters based on active config or data
    populateSessionTermFilters();
    renderStudentAttendance();
  }
  
  function populateSessionTermFilters() {
    const sessions = new Set();
    const terms = new Set();
    currentStudentData.forEach(r => {
      if (r.academic_session) sessions.add(r.academic_session);
      if (r.term) terms.add(r.term);
    });
    
    // Attempt to set to current session/term if config exists
    let activeSession = null;
    let activeTerm = null;
    if (window._activeTermConfig) {
      activeSession = window._activeTermConfig.academic_session;
      activeTerm = window._activeTermConfig.term;
    }
    
    if (activeSession) sessions.add(activeSession);
    if (activeTerm) terms.add(activeTerm);
    
    const sessArr = [...sessions].sort().reverse();
    sessionSelect.innerHTML = '<option value="ALL">All Sessions</option>';
    sessArr.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      if (s === activeSession) opt.selected = true;
      sessionSelect.appendChild(opt);
    });
    
    const termArr = [...terms].sort();
    termSelect.innerHTML = '<option value="ALL">All Terms</option>';
    termArr.forEach(t => {
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t;
      if (t === activeTerm) opt.selected = true;
      termSelect.appendChild(opt);
    });
  }
  
  function renderStudentAttendance() {
    const filterSession = sessionSelect.value;
    const filterTerm = termSelect.value;
    
    let filtered = currentStudentData;
    if (filterSession !== "ALL") {
      filtered = filtered.filter(r => r.academic_session === filterSession);
    }
    if (filterTerm !== "ALL") {
      filtered = filtered.filter(r => r.term === filterTerm);
    }
    
    let present = 0, absent = 0, late = 0;
    filtered.forEach(r => {
      if (r.status === "Present") present++;
      else if (r.status === "Absent") absent++;
      else if (r.status === "Late") late++;
    });
    
    const total = present + absent + late;
    const pct = total === 0 ? 0 : Math.round((present / total) * 100);
    
    document.getElementById("att-stat-present").textContent = present;
    document.getElementById("att-stat-absent").textContent = absent;
    document.getElementById("att-stat-late").textContent = late;
    document.getElementById("att-stat-pct").textContent = pct + "%";
    
    const tbody = document.getElementById("att-report-tbody");
    tbody.innerHTML = "";
    
    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-dim);">No attendance records found for this period.</td></tr>`;
      return;
    }
    
    filtered.forEach(r => {
      const tr = document.createElement("tr");
      
      let statusColor = "#64748b";
      if (r.status === "Present") statusColor = "#10b981";
      if (r.status === "Absent") statusColor = "#ef4444";
      if (r.status === "Late") statusColor = "#f59e0b";
      
      tr.innerHTML = `
        <td>${r.date}</td>
        <td><div style="font-size:11px;">${r.academic_session}</div><div style="font-size:10px;color:var(--text-dim);">${r.term}</div></td>
        <td>
           <span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(255,255,255,0.1);">${r.source || 'teacher'}</span>
        </td>
        <td style="text-align:center;">
           <span style="color:${statusColor};font-weight:600;">${r.status}</span>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }
  
  function resetStatsAndTable() {
    document.getElementById("att-stat-present").textContent = "0";
    document.getElementById("att-stat-absent").textContent = "0";
    document.getElementById("att-stat-late").textContent = "0";
    document.getElementById("att-stat-pct").textContent = "0%";
    document.getElementById("att-report-tbody").innerHTML = `<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-dim);">Select a student to view history.</td></tr>`;
  }

  // Exports
  const getStudentName = () => {
     const st = document.getElementById("att-report-student");
     return st.options[st.selectedIndex]?.text || "Unknown Student";
  };

  document.getElementById("btn-att-print").addEventListener("click", () => {
    const studentName = getStudentName();
    const session = sessionSelect.value === "ALL" ? "All Time" : sessionSelect.value;
    const term = termSelect.value === "ALL" ? "" : termSelect.value;
    const schoolName = window._schoolConfig?.name || "Nexus School";
    
    const present = document.getElementById("att-stat-present").textContent;
    const absent = document.getElementById("att-stat-absent").textContent;
    const late = document.getElementById("att-stat-late").textContent;
    const pct = document.getElementById("att-stat-pct").textContent;
    
    const tbodyHtml = document.getElementById("att-report-tbody").innerHTML;
    
    const printHtml = `
      <div style="text-align:center;margin-bottom:20px;border-bottom:2px solid #000;padding-bottom:10px;">
        <h1 style="margin:0;font-size:24px;">${schoolName}</h1>
        <h2 style="margin:5px 0 0 0;font-size:18px;">Student Attendance Report</h2>
      </div>
      
      <div style="margin-bottom:20px;font-size:14px;">
        <strong>Student Name:</strong> ${studentName}<br/>
        <strong>Class:</strong> ${classSelect.value}<br/>
        <strong>Period:</strong> ${session} ${term}
      </div>
      
      <table style="width:100%;text-align:center;margin-bottom:20px;border-collapse:collapse;">
        <tr>
          <td style="border:1px solid #000;padding:8px;"><strong>Present:</strong> ${present}</td>
          <td style="border:1px solid #000;padding:8px;"><strong>Absent:</strong> ${absent}</td>
          <td style="border:1px solid #000;padding:8px;"><strong>Late:</strong> ${late}</td>
          <td style="border:1px solid #000;padding:8px;"><strong>Attendance %:</strong> ${pct}</td>
        </tr>
      </table>
      
      <table style="width:100%;border-collapse:collapse;font-size:12px;text-align:left;">
        <thead>
          <tr>
            <th style="border:1px solid #000;padding:8px;background:#eee !important;">Date</th>
            <th style="border:1px solid #000;padding:8px;background:#eee !important;">Session / Term</th>
            <th style="border:1px solid #000;padding:8px;background:#eee !important;">Status</th>
          </tr>
        </thead>
        <tbody>
           ${Array.from(document.getElementById("att-report-tbody").querySelectorAll('tr')).map(tr => {
              if (tr.children.length === 1) return `<tr><td colspan="3" style="border:1px solid #000;padding:8px;text-align:center;">${tr.textContent}</td></tr>`;
              return `<tr>
                 <td style="border:1px solid #000;padding:8px;">${tr.children[0].innerText}</td>
                 <td style="border:1px solid #000;padding:8px;">${tr.children[1].innerText.replace('\\n', ' ')}</td>
                 <td style="border:1px solid #000;padding:8px;">${tr.children[3].innerText}</td>
              </tr>`;
           }).join('')}
        </tbody>
      </table>
    `;
    
    document.getElementById("attendance-print-area").innerHTML = printHtml;
    window.print();
  });
  
  document.getElementById("btn-att-whatsapp").addEventListener("click", () => {
    const studentName = getStudentName();
    const present = document.getElementById("att-stat-present").textContent;
    const absent = document.getElementById("att-stat-absent").textContent;
    const pct = document.getElementById("att-stat-pct").textContent;
    const text = `Attendance Report for ${studentName}\nPresent: ${present}\nAbsent: ${absent}\nAttendance Score: ${pct}\nGenerated via Nexus School OS`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  });
  
  document.getElementById("btn-att-email").addEventListener("click", () => {
    const studentName = getStudentName();
    const present = document.getElementById("att-stat-present").textContent;
    const absent = document.getElementById("att-stat-absent").textContent;
    const pct = document.getElementById("att-stat-pct").textContent;
    const subject = `Attendance Report: ${studentName}`;
    const body = `Attendance Report for ${studentName}\n\nPresent: ${present}\nAbsent: ${absent}\nAttendance Score: ${pct}\n\nGenerated via Nexus School OS`;
    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  });
});
