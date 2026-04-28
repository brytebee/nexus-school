"use strict";
// ══════════════════════════════════════════════════════════════════════════════
// Nexus School OS — Students
// ══════════════════════════════════════════════════════════════════════════════


      function toggleAddStudentForm() {
        const drawer = document.getElementById("add-student-drawer");
        drawer.style.display =
          drawer.style.display === "none" ? "block" : "none";
        if (drawer.style.display === "block") {
          ["stu-add-name", "stu-add-class", "stu-add-regno", "stu-add-gender", "stu-add-dob", "stu-add-pemail", "stu-add-pphone", "stu-add-fee"].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = "";
          });
          document.getElementById("stu-add-fee").value = "cleared";
          document.getElementById("stu-add-log").textContent = "";
          renderSubjectsPicker("stu", "jss");

          // Extract all known classes for autocomplete
          const allClassesSet = new Set();
          _allStudents.forEach(s => { if(s.class_name) allClassesSet.add(s.class_name); });
          _allTeachers.forEach(t => { 
            (t.allocations || []).forEach(a => { if(a.class_name) allClassesSet.add(a.class_name); });
          });
          const datalist = document.getElementById("stu-class-datalist");
          if (datalist) {
            datalist.innerHTML = [...allClassesSet].sort().map(c => `<option value="${c}">`).join('');
          }
        }
      }

      async function addStudentFromDirectory() {
        const name = document.getElementById("stu-add-name").value.trim();
        const class_name = document.getElementById("stu-add-class").value.trim();
        const reg_no = document.getElementById("stu-add-regno").value.trim();
        const gender = document.getElementById("stu-add-gender").value.trim();
        const dob = document.getElementById("stu-add-dob").value.trim();
        const parent_email = document.getElementById("stu-add-pemail").value.trim();
        const parent_phone = document.getElementById("stu-add-pphone").value.trim();
        const fee_status = document.getElementById("stu-add-fee").value.trim() || 'cleared';
        const log = document.getElementById("stu-add-log");
        const subjects = getCheckedSubjects("stu");

        if (!name || !class_name) {
          log.style.color = "#ff4444";
          log.textContent = "⚠ Name and Class are required.";
          return;
        }
        if (!subjects.length) {
          log.style.color = "#ff4444";
          log.textContent = "⚠ Please select at least one enrolled subject.";
          return;
        }

        const id = "STU-" + crypto.randomUUID().split("-")[0].toUpperCase();
        const res = await window.electronAPI.addStudentForm({
          id,
          name,
          class_name,
          subjects,
          reg_no,
          gender,
          dob,
          parent_email,
          parent_phone,
          fee_status
        });

        if (res.ok) {
          log.style.color = "#4CAF50";
          log.textContent = `✅ ${name} added (${id}).`;
          ["stu-add-name", "stu-add-class", "stu-add-regno", "stu-add-gender", "stu-add-dob", "stu-add-pemail", "stu-add-pphone"].forEach((f) => {
            const el = document.getElementById(f);
            if(el) el.value = "";
          });
          document.getElementById("stu-add-fee").value = "cleared";
          renderSubjectsPicker("stu", "jss"); // Reset checkboxes to a default view
          await refreshStudentsTable();
          setTimeout(() => toggleAddStudentForm(), 1400);
        } else {
          log.style.color = "#ff4444";
          log.textContent = `❌ ${res.error}`;
        }
      }

      async function refreshStudentsTable() {
        if (!window.electronAPI?.getAllStudents) return;
        _allStudents = await window.electronAPI.getAllStudents();

        // Update badge
        const badge = document.getElementById("badge-students");
        if (badge) badge.textContent = _allStudents.length;
        const dashCount = document.getElementById("dash-students-count");
        if (dashCount) dashCount.textContent = _allStudents.length;

        // Rebuild class filter dropdown
        const filter = document.getElementById("student-class-filter");
        const currentFilter = filter.value;
        const classes = [
          ...new Set(_allStudents.map((s) => s.class_name)),
        ].sort();
        filter.innerHTML = '<option value="">All Classes</option>';
        classes.forEach((cls) => {
          const opt = document.createElement("option");
          opt.value = cls;
          opt.textContent = cls;
          filter.appendChild(opt);
        });
        filter.value = currentFilter;

        renderStudentsTable();
      }

      function renderStudentsTable() {
        const filter = document.getElementById("student-class-filter").value;
        const tbody = document.getElementById("students-tbody");
        tbody.innerHTML = "";

        const filtered = filter
          ? _allStudents.filter((s) => s.class_name === filter)
          : _allStudents;

        if (!filtered.length) {
          tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-dim);">${_allStudents.length ? "No students in this class." : "No students loaded. Import a CSV or add manually."}</td></tr>`;
          return;
        }

        filtered.forEach((s, idx) => {
          const row = document.createElement("tr");
          const subjectsList =
            s.subjects && s.subjects.length > 0
              ? s.subjects
                  .map(
                    (subj) =>
                      `<span style="background:rgba(255,255,255,0.06);padding:2px 6px;border-radius:4px;font-size:10px;margin-right:2px;display:inline-block;white-space:nowrap;margin-bottom:2px;">${subj}</span>`,
                  )
                  .join("")
              : '<span style="color:#666;font-style:italic;font-size:11px;">No explicitly enrolled subjects</span>';

          row.innerHTML = `
          <td style="color:var(--text-dim);font-size:12px;">${idx + 1}</td>
          <td style="font-family:monospace;font-size:11px;color:var(--text-dim);">${s.id}</td>
          <td style="font-weight:600;">${s.name}</td>
          <td>
            <div style="margin-bottom:6px;"><span style="background:rgba(0,229,255,0.08);border:1px solid rgba(0,229,255,0.15);padding:2px 10px;border-radius:5px;font-size:11px;color:var(--accent);">${s.class_name}</span></div>
            <div style="max-width:300px;line-height:1.4;">${subjectsList}</div>
          </td>
          <td style="text-align:right;display:flex;gap:6px;justify-content:flex-end;">
            <button class="tbl-action-btn" style="color:#00e5ff;border-color:rgba(0,229,255,0.3);" onclick="openEditStudent('${s.id}')">✏️ Edit</button>
            <button class="tbl-action-btn" onclick="deleteStudent('${s.id}', '${s.name.replace(/'/g, " ")}')">🗑 Remove</button>
          </td>
        `;
          tbody.appendChild(row);
        });
      }

      async function deleteStudent(id, name) {
        const { isConfirmed } = await Swal.fire({
          title: `Remove ${name}?`,
          text: "This will delete the student record from this device.",
          icon: "warning",
          showCancelButton: true,
          confirmButtonColor: "#ff4444",
          confirmButtonText: "Yes, remove",
          background: "#0A0E2E",
          color: "#fff",
          backdrop: false,
        });
        if (isConfirmed && window.electronAPI?.deleteStudent) {
          await window.electronAPI.deleteStudent({ id });
          await refreshStudentsTable();
        }
      }

    function openEditStudent(id) {
      const stu = _allStudents.find(s => s.id === id);
      if (!stu) return;

      document.getElementById('edit-stu-id').value = stu.id;
      document.getElementById('edit-stu-name').value = stu.name;
      document.getElementById('edit-stu-class').value = stu.class_name;
      document.getElementById('edit-stu-regno').value = stu.reg_no || '';
      document.getElementById('edit-stu-gender').value = stu.gender || '';
      document.getElementById('edit-stu-dob').value = stu.dob || '';
      document.getElementById('edit-stu-pemail').value = stu.parent_email || '';
      document.getElementById('edit-stu-pphone').value = stu.parent_phone || '';
      document.getElementById('edit-stu-fee').value = stu.fee_status || 'cleared';
      document.getElementById('edit-stu-log').textContent = '';

      // Populate class datalist
      const dl = document.getElementById('edit-stu-class-datalist');
      const allClasses = new Set();
      _allStudents.forEach(s => { if(s.class_name) allClasses.add(s.class_name); });
      _allTeachers.forEach(t => { (t.allocations||[]).forEach(a => { if(a.class_name) allClasses.add(a.class_name); }); });
      dl.innerHTML = [...allClasses].sort().map(c => '<option value="' + c + '">').join('');

      // Pre-tick the student's current subjects
      const currentSubjects = stu.subjects || [];
      _customSubjects['edit_stu'] = currentSubjects.filter(sub =>
        !Object.values(CurriculumPresets).flat().flatMap(g => g.subjects || []).includes(sub)
      );
      renderSubjectsPicker('edit_stu', 'jss');
      // After render, check the current subjects
      setTimeout(() => {
        const grid = document.getElementById('edit_stu-subject-grid');
        grid.querySelectorAll('input[type="checkbox"]').forEach(cb => {
          if (currentSubjects.includes(cb.value)) {
            cb.checked = true;
            cb.parentElement.classList.add('checked');
          }
        });
      }, 0);

      const overlay = document.getElementById('edit-student-overlay');
      overlay.style.display = 'flex';
    }

    function closeEditStudent() {
      document.getElementById('edit-student-overlay').style.display = 'none';
    }

    async function saveEditStudent() {
      const id         = document.getElementById('edit-stu-id').value;
      const name       = document.getElementById('edit-stu-name').value.trim();
      const class_name = document.getElementById('edit-stu-class').value.trim();
      const reg_no     = document.getElementById('edit-stu-regno').value.trim();
      const gender     = document.getElementById('edit-stu-gender').value.trim();
      const dob        = document.getElementById('edit-stu-dob').value.trim();
      const parent_email = document.getElementById('edit-stu-pemail').value.trim();
      const parent_phone = document.getElementById('edit-stu-pphone').value.trim();
      const fee_status = document.getElementById('edit-stu-fee').value.trim();
      const log        = document.getElementById('edit-stu-log');
      const subjects  = getCheckedSubjects('edit_stu');

      if (!name || !class_name) {
        log.style.color = '#ff4444';
        log.textContent = '⚠ Name and Class are required.';
        return;
      }
      if (!subjects.length) {
        log.style.color = '#ff4444';
        log.textContent = '⚠ Select at least one subject.';
        return;
      }

      log.style.color = 'var(--text-dim)';
      log.textContent = 'Saving…';
      const res = await window.electronAPI.updateStudent({ 
        id, name, class_name, subjects, reg_no, gender, dob, parent_email, parent_phone, fee_status 
      });
      if (res.ok) {
        log.style.color = '#4CAF50';
        log.textContent = '✅ Saved!';
        await refreshStudentsTable();
        setTimeout(() => closeEditStudent(), 1000);
      } else {
        log.style.color = '#ff4444';
        log.textContent = '❌ ' + res.error;
      }
    }
