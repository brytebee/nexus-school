"use strict";

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
  .attendance-radios input[type="radio"]:checked + .radio-btn.green  { background: rgba(16,185,129,0.2); color: #10b981; }
  .attendance-radios input[type="radio"]:checked + .radio-btn.red    { background: rgba(239,68,68,0.2);  color: #ef4444; }
  .attendance-radios input[type="radio"]:checked + .radio-btn.yellow { background: rgba(245,158,11,0.2); color: #f59e0b; }
`;

const styleEl = document.createElement("style");
styleEl.textContent = attendanceCss;
document.head.appendChild(styleEl);

const initAttendanceModule = async () => {
    const classSelect = document.getElementById("attendance-class-select");
    const datePicker = document.getElementById("attendance-date-picker");
    
    // Prevent selecting future dates
    const today = new Date().toISOString().split('T')[0];
    datePicker.max = today;
    
    const saveBtn = document.getElementById("btn-save-attendance");
    const tbody = document.getElementById("attendance-tbody");

    if (!classSelect || !datePicker || !saveBtn || !tbody) {
        console.warn("[Attendance] DOM not ready, retrying...");
        setTimeout(initAttendanceModule, 200);
        return;
    }

    // ── State ─────────────────────────────────────────────────────────────
    let _attendanceSearch = "";
    let _attendancePage = 0;
    let _attendanceLimit = 15;
    let _fullRegister = [];

    // ── Logic ─────────────────────────────────────────────────────────────
    async function loadClasses() {
        if (typeof _allStudents === "undefined" || !_allStudents || _allStudents.length === 0) {
            if (window.electronAPI && window.electronAPI.getAllStudents) {
                const res = await window.electronAPI.getAllStudents({ limit: 5000 });
                _allStudents = res.data || [];
            }
        }
        const students = _allStudents || [];
        const classes = [...new Set(students.map(s => s.class_name).filter(Boolean))].sort();
        
        classSelect.innerHTML = '<option value="">Select Class...</option>';
        classes.forEach(c => {
            const opt = document.createElement("option");
            opt.value = opt.textContent = c;
            classSelect.appendChild(opt);
        });

        // Report Class Dropdown
        const rClass = document.getElementById("att-report-class");
        if (rClass) {
            rClass.innerHTML = '<option value="">All Classes</option>';
            classes.forEach(c => {
                const opt = document.createElement("option");
                opt.value = opt.textContent = c;
                rClass.appendChild(opt);
            });
        }
    }

    function renderRegister() {
        const query = (_attendanceSearch || "").toLowerCase();
        const filtered = _fullRegister.filter(r => 
            (r.student.name || "").toLowerCase().includes(query) || 
            (r.student.id || "").toLowerCase().includes(query)
        );

        tbody.innerHTML = "";
        const start = _attendancePage * _attendanceLimit;
        const paginated = filtered.slice(start, start + _attendanceLimit);

        if (paginated.length === 0) {
            tbody.innerHTML = `<tr><td colspan="2" style="text-align:center;padding:40px;color:var(--text-dim);">No students found.</td></tr>`;
        }

        paginated.forEach(row => {
            const s = row.student;
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${s.name}<div style="font-size:11px;color:#64748b;">${s.id}</div></td>
                <td style="text-align:center;">
                    <div class="attendance-radios" data-student-id="${s.id}">
                        <label><input type="radio" name="att-${s.id}" value="Present" ${row.status === "Present" ? "checked" : ""}><span class="radio-btn green">Present</span></label>
                        <label><input type="radio" name="att-${s.id}" value="Absent" ${row.status === "Absent" ? "checked" : ""}><span class="radio-btn red">Absent</span></label>
                        <label><input type="radio" name="att-${s.id}" value="Late" ${row.status === "Late" ? "checked" : ""}><span class="radio-btn yellow">Late</span></label>
                    </div>
                </td>
            `;
            tr.querySelectorAll('input').forEach(i => i.addEventListener("change", (e) => {
                row.status = e.target.value;
            }));
            tbody.appendChild(tr);
        });

        NexusUI.renderPagination("attendance-pagination", filtered.length, _attendanceLimit, _attendancePage, (p) => {
            _attendancePage = p;
            renderRegister();
        });
    }

    async function loadRegister() {
        const cls = classSelect.value;
        const date = datePicker.value;
        if (!cls || !date) return;

        const res = await window.electronAPI.getDailyAttendance({ class_name: cls, date });
        if (!res.ok) return;

        const students = (_allStudents || []).filter(s => s.class_name === cls);
        const attMap = {};
        res.data.forEach(r => attMap[r.student_id] = r.status);

        _fullRegister = students.map(s => ({ student: s, status: attMap[s.id] || "Present" }));
        _attendancePage = 0;
        renderRegister();
    }

    // ── Init ──────────────────────────────────────────────────────────────
    datePicker.value = new Date().toISOString().split("T")[0];
    classSelect.addEventListener("change", loadRegister);
    datePicker.addEventListener("change", loadRegister);

    saveBtn.addEventListener("click", async () => {
        if (!_fullRegister.length) return;
        saveBtn.disabled = true;
        saveBtn.textContent = "Saving...";

        const cfg = await window.electronAPI.getTermConfig();
        const res = await window.electronAPI.saveDailyAttendance({
            class_name: classSelect.value,
            date: datePicker.value,
            session: cfg.academic_session || "2024/2025",
            term: cfg.term || "First Term",
            records: _fullRegister.map(r => ({ student_id: r.student.id, status: r.status }))
        });

        saveBtn.disabled = false;
        saveBtn.textContent = "Save Register";
        if (res.ok) {
            Swal.fire({ title: "Saved!", icon: "success", toast: true, position: "top-end", timer: 2000, showConfirmButton: false });
        }
    });

    NexusUI.injectSearch("#view-attendance .view-header", "Filter students...", (val) => {
        _attendanceSearch = val;
        _attendancePage = 0;
        renderRegister();
    });

    window.attendanceInit = loadClasses;
    await loadClasses();

    // ── Report Logic ──────────────────────────────────────────────────────
    const btnReport = document.getElementById("btn-student-attendance-report");
    if (btnReport) {
        btnReport.addEventListener("click", () => {
            document.getElementById("attendance-report-overlay").style.display = "flex";
        });
    }
    const btnClose = document.getElementById("btn-att-report-close");
    if (btnClose) {
        btnClose.addEventListener("click", () => {
            document.getElementById("attendance-report-overlay").style.display = "none";
        });
    }

    const rClass = document.getElementById("att-report-class");
    const rStu = document.getElementById("att-report-student");
    if (rClass && rStu) {
        rClass.addEventListener("change", () => {
            const cls = rClass.value;
            const students = (_allStudents || []).filter(s => !cls || s.class_name === cls);
            rStu.innerHTML = '<option value="">Select Student...</option>';
            students.forEach(s => {
                const opt = document.createElement("option");
                opt.value = s.id; opt.textContent = `${s.name} (${s.id})`;
                rStu.appendChild(opt);
            });
        });
    }

    const btnQuery = document.getElementById("btn-att-report-query");
    if (btnQuery) {
        btnQuery.addEventListener("click", async () => {
            const sid = rStu.value;
            const sess = document.getElementById("att-report-session").value;
            const term = document.getElementById("att-report-term").value;
            if (!sid) return;

            btnQuery.textContent = "Loading...";
            const res = await window.electronAPI.getStudentAttendanceReport({ student_id: sid, session: sess, term: term });
            btnQuery.textContent = "🔍 Query Record";

            if (res.ok) {
                document.getElementById("att-stat-present").textContent = res.stats.present;
                document.getElementById("att-stat-absent").textContent = res.stats.absent;
                document.getElementById("att-stat-late").textContent = res.stats.late;
                document.getElementById("att-stat-pct").textContent = res.stats.percentage + "%";
                
                const rTbody = document.getElementById("att-report-tbody");
                rTbody.innerHTML = res.data.map(r => `
                    <tr>
                        <td>${r.date}</td>
                        <td><span style="color:${r.status==='Present'?'#10b981':'#ef4444'}">${r.status}</span></td>
                    </tr>
                `).join("");
            }
        });
    }
};

// Start
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAttendanceModule);
} else {
    initAttendanceModule();
}
