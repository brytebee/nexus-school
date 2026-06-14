"use strict";
// ══════════════════════════════════════════════════════════════════════════════
// Nexus School OS — Students
// ══════════════════════════════════════════════════════════════════════════════


      async function populateClassSelectors(levelSelectId, armSelectId, currentLevel = '', currentArm = '') {
        const levelSel = document.getElementById(levelSelectId);
        const armSel = document.getElementById(armSelectId);
        if (!levelSel || !armSel) return;

        try {
          const s = await window.electronAPI.cbt.getSystemSettings();
          const levels = Array.isArray(s.class_hierarchy) ? s.class_hierarchy : [];
          const arms = Array.isArray(s.class_arms) ? s.class_arms : [];

          // Populate Levels
          levelSel.innerHTML = '<option value="">Select Level *</option>' +
            levels.map(l => `<option value="${l}" ${l === currentLevel ? 'selected' : ''}>${l}</option>`).join('');

          // Populate Arms
          armSel.innerHTML = '<option value="">Select Arm (None)</option>' +
            arms.map(a => `<option value="${a}" ${a === currentArm ? 'selected' : ''}>${a}</option>`).join('');
        } catch(e) {
          console.warn('[Students] Failed to populate class selectors:', e);
        }
      }

      function toggleAddStudentForm() {
        const drawer = document.getElementById("add-student-drawer");
        drawer.style.display =
          drawer.style.display === "none" ? "block" : "none";
        if (drawer.style.display === "block") {
          ["stu-add-name", "stu-add-regno", "stu-add-gender", "stu-add-dob", "stu-add-pemail", "stu-add-pphone", "stu-add-fee"].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = "";
          });
          document.getElementById("stu-add-fee").value = "cleared";
          document.getElementById("stu-add-log").textContent = "";
          renderSubjectsPicker("stu", "jss");

          populateClassSelectors("stu-add-class-level", "stu-add-class-arm");
        }
      }

      function handleStudentPhotoUpload(inputEl, previewId) {
        const file = inputEl.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
          const base64 = e.target.result;
          const preview = document.getElementById(previewId);
          preview.innerHTML = `<img src="${base64}" style="width: 100%; height: 100%; object-fit: cover;" />`;
          preview.dataset.photo = base64; // Store base64 data url
        };
        reader.readAsDataURL(file);
      }

      async function addStudentFromDirectory() {
        const name = document.getElementById("stu-add-name").value.trim();
        const class_name = document.getElementById("stu-add-class-level").value.trim();
        const class_arm = document.getElementById("stu-add-class-arm").value.trim();
        const reg_no = document.getElementById("stu-add-regno").value.trim();
        const admission_no = document.getElementById("stu-add-admissionno").value.trim();
        const gender = document.getElementById("stu-add-gender").value.trim();
        const dob = document.getElementById("stu-add-dob").value.trim();
        const parent_email = document.getElementById("stu-add-pemail").value.trim();
        const parent_phone = document.getElementById("stu-add-pphone").value.trim();
        const parent_name  = document.getElementById("stu-add-pname")?.value.trim() || '';
        const fee_status = document.getElementById("stu-add-fee").value.trim() || 'cleared';
        const log = document.getElementById("stu-add-log");
        const subjects = getCheckedSubjects("stu");
        const photoPreview = document.getElementById("stu-add-photo-preview");
        const photo = photoPreview.dataset.photo || null;

        if (!name || !class_name) {
          log.style.color = "#ff4444";
          log.textContent = "⚠ Name and Class Level are required.";
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
          class_arm,
          subjects,
          reg_no,
          admission_no,
          gender,
          dob,
          photo,
          parent_email,
          parent_phone,
          parent_name,
          fee_status
        });

        if (res.ok) {
          log.style.color = "#4CAF50";
          log.textContent = `✅ ${name} added (${id}).`;
          ["stu-add-name", "stu-add-regno", "stu-add-admissionno", "stu-add-gender", "stu-add-dob", "stu-add-pemail", "stu-add-pphone", "stu-add-pname"].forEach((f) => {
            const el = document.getElementById(f);
            if(el) el.value = "";
          });
          document.getElementById("stu-add-fee").value = "cleared";
          document.getElementById("stu-add-photo-input").value = "";
          photoPreview.innerHTML = `<span style="font-size: 18px; color: rgba(255, 255, 255, 0.4)">📷</span>`;
          delete photoPreview.dataset.photo;
          renderSubjectsPicker("stu", "jss"); // Reset checkboxes to a default view
          await refreshStudentsTable();
          setTimeout(() => toggleAddStudentForm(), 1400);
        } else {
          log.style.color = "#ff4444";
          log.textContent = `❌ ${res.error}`;
        }
      }

      var _studentsPage   = 0;
      var _studentsLimit  = 15;
      var _studentsSearch = "";
      var _studentsTotal  = 0;

      async function refreshStudentsTable() {
        if (!window.electronAPI?.getAllStudents) return;
        
        const filter = document.getElementById("student-class-filter").value;
        const res = await window.electronAPI.getAllStudents({
          limit: _studentsLimit,
          offset: _studentsPage * _studentsLimit,
          search: _studentsSearch
        });

        if (!res.ok) return;

        _allStudents = res.data;
        _studentsTotal = res.total;

        // Update badge (Note: total in DB might be different from filtered)
        const badge = document.getElementById("badge-students");
        if (badge) badge.textContent = _studentsTotal;
        const dashCount = document.getElementById("dash-students-count");
        if (dashCount) dashCount.textContent = _studentsTotal;

        // Rebuild class filter dropdown (Optional: keep this client-side for now or fetch all classes)
        // For 1000+ students, we might need a separate API for classes, but let's stick to search for now.

        renderStudentsTable();
      }

      function renderStudentsTable() {
        const tbody = document.getElementById("students-tbody");
        tbody.innerHTML = "";

        if (!_allStudents.length) {
          tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-dim);">${_studentsTotal ? "No matching students found." : "No students loaded. Import a CSV or add manually."}</td></tr>`;
          return;
        }

        _allStudents.forEach((s, idx) => {
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

          const photoSrc = s.photo 
            ? (s.photo.startsWith('data:') ? s.photo : `data:image/jpeg;base64,${s.photo}`)
            : null;
          const photoImg = photoSrc 
            ? `<img src="${photoSrc}" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover; margin-right: 8px; vertical-align: middle;" />`
            : `<div style="width: 28px; height: 28px; border-radius: 50%; background: rgba(255,255,255,0.05); display: inline-flex; align-items: center; justify-content: center; margin-right: 8px; vertical-align: middle; font-size: 12px; color: rgba(255,255,255,0.3);">👤</div>`;

          row.innerHTML = `
          <td style="color:var(--text-dim);font-size:12px;">${(_studentsPage * _studentsLimit) + idx + 1}</td>
          <td style="font-family:monospace;font-size:11px;color:var(--text-dim);">${s.id}</td>
          <td style="font-weight:600; white-space: nowrap;">${photoImg}${s.name}</td>
          <td>
            <div style="margin-bottom:6px;"><span style="background:rgba(0,229,255,0.08);border:1px solid rgba(0,229,255,0.15);padding:2px 10px;border-radius:5px;font-size:11px;color:var(--accent);">${s.class_name}${s.class_arm || ''}</span></div>
            <div style="max-width:300px;line-height:1.4;">${subjectsList}</div>
          </td>
          <td style="text-align:right;display:flex;gap:6px;justify-content:flex-end;">
            <button class="tbl-action-btn" style="color:#00e5ff;border-color:rgba(0,229,255,0.3);" onclick="openEditStudent('${s.id}')">✏️ Edit</button>
            <button class="tbl-action-btn" onclick="deleteStudent('${s.id}', '${s.name.replace(/'/g, " ")}')">🗑 Remove</button>
          </td>
        `;
          tbody.appendChild(row);
        });

        NexusUI.renderPagination("students-pagination", _studentsTotal, _studentsLimit, _studentsPage, (newPage) => {
          _studentsPage = newPage;
          refreshStudentsTable();
        });
      }

      // Initialize Search
      const initStudentsSearch = () => {
        const header = document.querySelector("#view-students .view-header");
        if (!header) {
          setTimeout(initStudentsSearch, 100);
          return;
        }
        NexusUI.injectSearch("#view-students .view-header", "Search name, ID or Reg No...", (val) => {
          _studentsSearch = val;
          _studentsPage = 0;
          refreshStudentsTable();
        });
      };
      initStudentsSearch();

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
      document.getElementById('edit-stu-regno').value = stu.reg_no || '';
      document.getElementById('edit-stu-admissionno').value = stu.admission_no || '';
      document.getElementById('edit-stu-gender').value = stu.gender || '';
      document.getElementById('edit-stu-dob').value = stu.dob || '';
      document.getElementById('edit-stu-pemail').value = stu.parent_email || '';
      document.getElementById('edit-stu-pphone').value = stu.parent_phone || '';
      const pnameEl = document.getElementById('edit-stu-pname');
      if (pnameEl) pnameEl.value = stu.parent_name || '';
      document.getElementById('edit-stu-fee').value = stu.fee_status || 'cleared';
      document.getElementById('edit-stu-log').textContent = '';

      // Load photo preview
      const preview = document.getElementById('edit-stu-photo-preview');
      if (stu.photo) {
        const photoSrc = stu.photo.startsWith('data:') ? stu.photo : `data:image/jpeg;base64,${stu.photo}`;
        preview.innerHTML = `<img src="${photoSrc}" style="width: 100%; height: 100%; object-fit: cover;" />`;
        preview.dataset.photo = stu.photo;
      } else {
        preview.innerHTML = `<span style="font-size: 18px; color: rgba(255, 255, 255, 0.4)">📷</span>`;
        delete preview.dataset.photo;
      }
      document.getElementById("edit-stu-photo-input").value = "";

      // Populate Level and Arm selectors dynamically
      populateClassSelectors("edit-stu-class-level", "edit-stu-class-arm", stu.class_name, stu.class_arm);

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
      const class_name = document.getElementById('edit-stu-class-level').value.trim();
      const class_arm  = document.getElementById('edit-stu-class-arm').value.trim();
      const reg_no     = document.getElementById('edit-stu-regno').value.trim();
      const admission_no = document.getElementById('edit-stu-admissionno').value.trim();
      const gender     = document.getElementById('edit-stu-gender').value.trim();
      const dob        = document.getElementById('edit-stu-dob').value.trim();
      const parent_email = document.getElementById('edit-stu-pemail').value.trim();
      const parent_phone = document.getElementById('edit-stu-pphone').value.trim();
      const parent_name  = document.getElementById('edit-stu-pname')?.value.trim() || '';
      const fee_status = document.getElementById('edit-stu-fee').value.trim();
      const log        = document.getElementById('edit-stu-log');
      const subjects  = getCheckedSubjects('edit_stu');
      const photoPreview = document.getElementById('edit-stu-photo-preview');
      const photo = photoPreview.dataset.photo || null;

      if (!name || !class_name) {
        log.style.color = '#ff4444';
        log.textContent = '⚠ Name and Class Level are required.';
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
        id, name, class_name, class_arm, subjects, reg_no, admission_no, gender, dob, photo, parent_email, parent_phone, parent_name, fee_status 
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
