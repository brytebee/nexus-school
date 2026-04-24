"use strict";
// ══════════════════════════════════════════════════════════════════════════════
// Nexus School OS — Teachers
// ══════════════════════════════════════════════════════════════════════════════


      function toggleAddTeacherForm() {
        const drawer = document.getElementById("add-teacher-drawer");
        drawer.style.display =
          drawer.style.display === "none" ? "block" : "none";
        if (drawer.style.display === "block") {
          _wizAllocations = [];
          renderAllocations();
          ["wiz-tch-name", "wiz-tch-phone", "wiz-tch-email"].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = "";
          });
          document.getElementById("wiz-tch-log").textContent = "";
          renderSubjectsPicker("tch", "jss");
        }
      }

      function renderSubjectsPicker(prefix, level) {
        // Update active pill
        document
          .querySelectorAll(`#${prefix}-preset-pills .subject-pill`)
          .forEach((el) => el.classList.remove("active"));
        const activePill = Array.from(
          document.querySelectorAll(`#${prefix}-preset-pills .subject-pill`),
        ).find((el) => el.getAttribute("onclick").includes(level));
        if (activePill) activePill.classList.add("active");

        const grid = document.getElementById(`${prefix}-subject-grid`);

        // Bug #6 fix: snapshot which subjects are currently checked BEFORE
        // clearing the grid, so we can restore them after re-rendering.
        const previouslyChecked = getCheckedSubjects(prefix);

        grid.innerHTML = "";
        // NOTE: do NOT reset _customSubjects[prefix] here — users may have
        // added custom subjects and then switched tabs to compare presets.

        const preset = CurriculumPresets[level] || [];
        preset.forEach((group) => {
          if (group.cat) {
            const title = document.createElement("div");
            title.className = "subject-group-title";
            title.textContent = group.cat;
            grid.appendChild(title);
          }
          group.subjects.forEach((subj) => {
            // Restore checked state if this subject was already selected
            renderCheckbox(prefix, grid, subj, previouslyChecked.includes(subj));
          });
        });

        // Re-render custom subjects so they are not lost on tab switch
        if (_customSubjects[prefix] && _customSubjects[prefix].length > 0) {
          const customTitle = document.createElement("div");
          customTitle.className = "subject-group-title";
          customTitle.textContent = "Custom";
          grid.appendChild(customTitle);
          _customSubjects[prefix].forEach((subj) => {
            renderCheckbox(prefix, grid, subj, previouslyChecked.includes(subj));
          });
        }
      }

      function renderCheckbox(prefix, grid, subj, isChecked) {
        const id = `${prefix}-subj-${subj
          .replace(/\\s+/g, "-")
          .replace(/[^a-zA-Z0-9-]/g, "")
          .toLowerCase()}`;
        const lbl = document.createElement("label");
        lbl.className = "subject-checkbox" + (isChecked ? " checked" : "");
        lbl.innerHTML = `<input type="checkbox" value="${subj}" ${isChecked ? "checked" : ""} onchange="this.parentElement.classList.toggle('checked', this.checked)"> <span>${subj}</span>`;
        grid.appendChild(lbl);
      }

      function addCustomSubject(prefix) {
        const inp = document.getElementById(`${prefix}-custom-subj`);
        const val = inp.value.trim();
        if (!val) return;

        const grid = document.getElementById(`${prefix}-subject-grid`);
        renderCheckbox(prefix, grid, val, true);
        _customSubjects[prefix].push(val);
        inp.value = "";
      }

      function getCheckedSubjects(prefix) {
        const grid = document.getElementById(`${prefix}-subject-grid`);
        const inputs = grid.querySelectorAll('input[type="checkbox"]:checked');
        return Array.from(inputs).map((cb) => cb.value);
      }

      function wizAddAllocation() {
        const classInp = document.getElementById("wiz-alloc-class");
        const rawClasses = classInp.value
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean);
        const subjects = getCheckedSubjects("tch");

        if (!rawClasses.length) {
          alert("Please enter at least one class name.");
          return;
        }
        if (!subjects.length) {
          alert("Please select at least one subject.");
          return;
        }

        let addedCount = 0;
        for (const cls of rawClasses) {
          if (
            _wizAllocations.find(
              (a) => a.class_name.toLowerCase() === cls.toLowerCase(),
            )
          ) {
            alert(
              `Allocation for ${cls} already added. Remove it first to update.`,
            );
            continue;
          }
          _wizAllocations.push({ class_name: cls, subjects });
          addedCount++;
        }

        if (addedCount > 0) {
          renderAllocations();
          classInp.value = "";
          // Retain the checkboxes in case they are allocating the exact same subjects to another set of classes
        }
      }

      function renderAllocations() {
        const list = document.getElementById("wiz-alloc-list");
        list.innerHTML = "";
        _wizAllocations.forEach((alloc, idx) => {
          const row = document.createElement("div");
          row.style.cssText =
            "display:flex;align-items:center;gap:8px;background:rgba(0,229,255,0.07);border:1px solid rgba(0,229,255,0.18);border-radius:7px;padding:6px 10px;font-size:12px;";
          row.innerHTML = `
          <span style="color:#00E5FF;font-weight:600;">${alloc.class_name}</span>
          <span style="color:#555;">—</span>
          <span style="color:#ccc;flex:1;">${alloc.subjects.join(", ")}</span>
          <button onclick="wizRemoveAllocation(${idx})" style="background:none;border:none;color:#ff6666;cursor:pointer;font-size:15px;padding:0;line-height:1;" title="Remove">×</button>
        `;
          list.appendChild(row);
        });
      }

      function wizRemoveAllocation(idx) {
        _wizAllocations.splice(idx, 1);
        renderAllocations();
      }

      function previewTchSign(input) {
        if (input.files && input.files[0]) {
          const reader = new FileReader();
          reader.onload = function (e) {
             _wizTchSignBase64 = e.target.result;
             document.getElementById("tch-sign-preview-img").src = _wizTchSignBase64;
             document.getElementById("tch-sign-preview-wrap").style.display = "block";
          };
          reader.readAsDataURL(input.files[0]);
        }
      }

      async function wizSaveTeacher() {
        const name = document.getElementById("wiz-tch-name").value.trim();
        const phone = document.getElementById("wiz-tch-phone").value.trim();
        const email = document.getElementById("wiz-tch-email").value.trim();
        const log = document.getElementById("wiz-tch-log");

        if (!name) {
          log.style.color = "#ff4444";
          log.textContent = "⚠ Full Name is required.";
          return;
        }
        if (!_wizAllocations.length) {
          log.style.color = "#ff4444";
          log.textContent = "⚠ Add at least one class allocation.";
          return;
        }

        const id = "TCH-" + crypto.randomUUID().split("-")[0].toUpperCase();
        const res = await window.electronAPI.addTeacherForm({
          id,
          name,
          phone,
          email,
          allocations: _wizAllocations,
          signature: _wizTchSignBase64,
        });

        if (res.ok) {
          log.style.color = "#4CAF50";
          log.textContent = `✅ ${name} saved! (${id})`;
          ["wiz-tch-name", "wiz-tch-phone", "wiz-tch-email"].forEach((f) => {
            document.getElementById(f).value = "";
          });
          _wizAllocations = [];
          _wizTchSignBase64 = null;
          document.getElementById("tch-sign-preview-wrap").style.display = "none";
          document.getElementById("tch-signature-upload").value = "";
          renderAllocations();
          await refreshTeachersTable();
          setTimeout(() => toggleAddTeacherForm(), 1400);
        } else {
          log.style.color = "#ff4444";
          log.textContent = `❌ ${res.error}`;
        }
      }

      async function refreshTeachersTable() {
        if (!window.electronAPI?.getAllTeachers) return;
        _allTeachers = await window.electronAPI.getAllTeachers();
        const tbody = document.getElementById("teachers-tbody");
        tbody.innerHTML = "";

        // Update badge
        const badge = document.getElementById("badge-teachers");
        badge.textContent = _allTeachers.length;
        const dashCount = document.getElementById("dash-teachers-count");
        if (dashCount) dashCount.textContent = _allTeachers.length;

        await refreshDropdownMetadata();

        if (!_allTeachers.length) {
          tbody.innerHTML =
            '<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-dim);">No teachers yet. Click <strong>＋ Add Teacher</strong> or <strong>Import CSV</strong>.</td></tr>';
          return;
        }

        _allTeachers.forEach((t) => {
          const row = document.createElement("tr");

          // Build allocation tags grouped by class
          const classMap = {};
          (t.allocations || []).forEach((a) => {
            if (!classMap[a.class_name]) classMap[a.class_name] = [];
            classMap[a.class_name].push(a.subject);
          });
          const allocHTML =
            Object.entries(classMap)
              .map(
                ([cls, subjs]) =>
                  `<span class="alloc-tag"><span class="tag-class">${cls}</span><span class="tag-subj">· ${subjs.join(", ")}</span></span>`,
              )
              .join("") ||
            '<span style="color:#444;font-size:11px;">No allocations</span>';

          const hostHTML = t.host_class 
            ? `<div style="font-size:10px;margin-top:4px;"><span style="background:rgba(0,229,255,0.15);color:#00e5ff;padding:2px 6px;border-radius:4px;border:1px solid rgba(0,229,255,0.3);font-weight:700;">🏠 HOST: ${t.host_class}</span></div>` 
            : '';

          row.innerHTML = `
          <td style="font-family:monospace;font-size:11px;color:var(--text-dim);">${t.id}</td>
          <td>
            <div style="font-weight:600;">${t.name}</div>
            ${hostHTML}
          </td>
          <td style="color:var(--text-dim);">${t.phone || "—"}</td>
          <td><div style="display:flex;flex-wrap:wrap;gap:2px;">${allocHTML}</div></td>
          <td style="text-align:right;display:flex;gap:6px;justify-content:flex-end;">
            <button class="tbl-action-btn" style="color:#00e5ff;border-color:rgba(0,229,255,0.3);" onclick="openEditTeacher('${t.id}')">✏️ Edit</button>
            <button class="tbl-action-btn" onclick="deleteTeacher('${t.id}', '${t.name.replace(/'/g, " ")}')" >🗑 Remove</button>
          </td>
        `;
          tbody.appendChild(row);
        });
      }

      async function deleteTeacher(id, name) {
        const { isConfirmed } = await Swal.fire({
          title: `Remove ${name}?`,
          text: "This will delete the teacher and all their class allocations. Grade records are unaffected.",
          icon: "warning",
          showCancelButton: true,
          confirmButtonColor: "#ff4444",
          confirmButtonText: "Yes, remove",
          background: "#0A0E2E",
          color: "#fff",
          backdrop: false,
        });
        if (isConfirmed && window.electronAPI?.deleteTeacher) {
          await window.electronAPI.deleteTeacher({ id });
          await refreshTeachersTable();
          await loadTeacherDropdown();
        }
      }

    async function openEditTeacher(id) {
      const tch = _allTeachers.find(t => t.id === id);
      if (!tch) return;

      await refreshDropdownMetadata();

      document.getElementById('edit-tch-id').value = tch.id;
      document.getElementById('edit-tch-name').value  = tch.name;
      document.getElementById('edit-tch-phone').value = tch.phone || '';
      document.getElementById('edit-tch-email').value = tch.email || '';
      const hostEl = document.getElementById('edit-tch-host-class');
      if (hostEl) hostEl.value = tch.host_class || '';
      document.getElementById('edit-tch-log').textContent = '';

      // Reconstruct allocation groups from teacher's flat allocation list
      const classMap = {};
      (tch.allocations || []).forEach(a => {
        if (!classMap[a.class_name]) classMap[a.class_name] = [];
        classMap[a.class_name].push(a.subject);
      });
      _editTchAllocations = Object.entries(classMap).map(([class_name, subjects]) => ({ class_name, subjects }));
      renderEditTchAllocations();

      _customSubjects['edit_tch'] = [];
      renderSubjectsPicker('edit_tch', 'jss');

      // Signature Preview
      if (tch.signature) {
        _editTchSignBase64 = tch.signature;
        document.getElementById("edit-tch-sign-preview-img").src = tch.signature;
        document.getElementById("edit-tch-sign-preview-wrap").style.display = "block";
      } else {
        _editTchSignBase64 = null;
        document.getElementById("edit-tch-sign-preview-wrap").style.display = "none";
      }

      const overlay = document.getElementById('edit-teacher-overlay');
      overlay.style.display = 'flex';
    }

    function closeEditTeacher() {
      document.getElementById('edit-teacher-overlay').style.display = 'none';
    }

    function renderEditTchAllocations() {
      const list = document.getElementById('edit-tch-alloc-list');
      list.innerHTML = '';
      _editTchAllocations.forEach((alloc, idx) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;background:rgba(0,229,255,0.07);border:1px solid rgba(0,229,255,0.18);border-radius:7px;padding:6px 10px;font-size:12px;';
        row.innerHTML =
          '<span style="color:#00E5FF;font-weight:600;">' + alloc.class_name + '</span>' +
          '<span style="color:#555;">—</span>' +
          '<span style="color:#ccc;flex:1;">' + alloc.subjects.join(', ') + '</span>' +
          '<button onclick="editTchRemoveAlloc(' + idx + ')" style="background:none;border:none;color:#ff6666;cursor:pointer;font-size:15px;padding:0;line-height:1;" title="Remove">×</button>';
        list.appendChild(row);
      });
    }

    function editTchRemoveAlloc(idx) {
      _editTchAllocations.splice(idx, 1);
      renderEditTchAllocations();
    }

    function editTchWizAddAllocation() {
      const classInp = document.getElementById('edit-tch-alloc-class');
      const selectedClass = classInp.value;
      const subjects = getCheckedSubjects('edit_tch');
      if (!selectedClass) { alert('Select a class to allocate.'); return; }
      if (!subjects.length) { alert('Select at least one subject.'); return; }
      
      const cls = selectedClass;
        const existing = _editTchAllocations.findIndex(a => a.class_name.toLowerCase() === cls.toLowerCase());
        if (existing !== -1) {
          // Merge subjects into existing allocation
          const merged = [...new Set([..._editTchAllocations[existing].subjects, ...subjects])];
          _editTchAllocations[existing] = { class_name: cls, subjects: merged };
        } else {
          _editTchAllocations.push({ class_name: cls, subjects });
        }
      }

    async function saveEditTeacher() {
      const id    = document.getElementById('edit-tch-id').value;
      const name  = document.getElementById('edit-tch-name').value.trim();
      const phone = document.getElementById('edit-tch-phone').value.trim();
      const email = document.getElementById('edit-tch-email').value.trim();
      const log   = document.getElementById('edit-tch-log');

      if (!name) {
        log.style.color = '#ff4444';
        log.textContent = '⚠ Name is required.';
        return;
      }
      if (!_editTchAllocations.length) {
        log.style.color = '#ff4444';
        log.textContent = '⚠ Add at least one class allocation.';
        return;
      }

      const host_class = document.getElementById('edit-tch-host-class').value.trim();
      log.style.color = 'var(--text-dim)';
      log.textContent = 'Saving…';
      const res = await window.electronAPI.updateTeacherFull({
        id, name, phone, email,
        allocations: _editTchAllocations,
        signature: _editTchSignBase64,
        host_class
      });
      if (res.ok) {
        log.style.color = '#4CAF50';
        log.textContent = '✅ Saved!';
        await refreshTeachersTable();
        await loadTeacherDropdown();
        setTimeout(() => closeEditTeacher(), 1000);
      } else {
        log.style.color = '#ff4444';
        log.textContent = '❌ ' + res.error;
      }
    }

    async function openFormTeacherModal() {
        const overlay = document.getElementById("form-teacher-overlay");
        const container = document.getElementById("ft-mapping-container");
        overlay.style.display = "flex";
        container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-dim);">Loading class list...</div>`;

        try {
            // 1. Get all unique classes from students
            const students = await window.electronAPI.queryResults({ scope: "all" });
            const classes = [...new Set(students.results.map(s => s.class_name))].sort();

            // 2. Get all teachers
            const teachers = await window.electronAPI.getAllTeachers();

            // 3. Get current mapping
            const mappingRes = await window.electronAPI.getFormTeachers();
            const activeMap = new Map();
            if (mappingRes.ok) {
                mappingRes.data.forEach(m => activeMap.set(m.class_name, m.teacher_id));
            }

            if (!classes.length) {
                container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-dim);">No students found. Add students first.</div>`;
                return;
            }

            container.innerHTML = "";
            classes.forEach(cls => {
                const row = document.createElement("div");
                row.style.cssText = "display:grid;grid-template-columns:1fr 2fr;gap:15px;align-items:center;padding:12px;border-bottom:1px solid rgba(255,255,255,0.05);";
                
                const label = document.createElement("div");
                label.style.fontWeight = "600";
                label.style.color = "#fff";
                label.textContent = cls;

                const select = document.createElement("select");
                select.className = "modern-input";
                select.style.padding = "6px 10px";
                select.innerHTML = `<option value="">— Unassigned —</option>`;
                teachers.forEach(t => {
                    const opt = document.createElement("option");
                    opt.value = t.id;
                    opt.textContent = t.name;
                    if (activeMap.get(cls) === t.id) opt.selected = true;
                    select.appendChild(opt);
                });

                select.onchange = async () => {
                    const res = await window.electronAPI.setFormTeacher({ class_name: cls, teacher_id: select.value });
                    if (!res.ok) alert("Failed to save mapping: " + res.error);
                };

                row.appendChild(label);
                row.appendChild(select);
                container.appendChild(row);
            });

        } catch (err) {
            container.innerHTML = `<div style="text-align:center;padding:40px;color:#ff4444;">Error: ${err.message}</div>`;
        }
    }

    function closeFormTeacherModal() {
        document.getElementById("form-teacher-overlay").style.display = "none";
    }

    function previewEditTchSign(input) {
        if (input.files && input.files[0]) {
            const reader = new FileReader();
            reader.onload = function(e) {
                _editTchSignBase64 = e.target.result;
                document.getElementById("edit-tch-sign-preview-img").src = _editTchSignBase64;
                document.getElementById("edit-tch-sign-preview-wrap").style.display = "block";
            }
            reader.readAsDataURL(input.files[0]);
        }
    }

    function clearEditTchSign() {
        _editTchSignBase64 = null;
        document.getElementById("edit-tch-sign-preview-img").src = "";
        document.getElementById("edit-tch-sign-preview-wrap").style.display = "none";
        document.getElementById("edit-tch-signature-upload").value = "";
    }
