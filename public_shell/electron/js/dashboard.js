"use strict";
// ══════════════════════════════════════════════════════════════════════════════
// Nexus School OS — Dashboard
// ══════════════════════════════════════════════════════════════════════════════


      async function refreshDashboardStats() {
        if (!window.electronAPI?.getDbStats) return;
        const stats = await window.electronAPI.getDbStats();
        const tc = document.getElementById("dash-teachers-count");
        const sc = document.getElementById("dash-students-count");
        const bt = document.getElementById("badge-teachers");
        const bs = document.getElementById("badge-students");
        if (tc) tc.textContent = stats.teachers;
        if (sc) sc.textContent = stats.students;
        if (bt) bt.textContent = stats.teachers;
        if (bs) bs.textContent = stats.students;
      }

      async function refreshDropdownMetadata() {
        if (!window.electronAPI?.getUniqueMetadata) return;
        _cachedMetadata = await window.electronAPI.getUniqueMetadata();
        
        // Helper to fill <select> elements with plain string lists
        const fill = (id, list, placeholder) => {
          const el = document.getElementById(id);
          if (!el) return;
          const current = el.value;
          el.innerHTML = placeholder ? `<option value="">-- ${placeholder} --</option>` : "";
          list.forEach(item => {
            const opt = document.createElement("option");
            opt.value = item;
            opt.textContent = item;
            el.appendChild(opt);
          });
          if (list.includes(current)) el.value = current;
        };

        fill("rs-class-pick",   _cachedMetadata.classes,  "All Classes");
        fill("rs-subject-pick", _cachedMetadata.subjects, "All Subjects");
        fill("edit-tch-alloc-class", _cachedMetadata.classes, "Class Name (comma-sep)");

        // Populate the Host Class datalist for the Edit Teacher modal
        const hostClassList = document.getElementById("edit-tch-host-class-list");
        if (hostClassList) {
          hostClassList.innerHTML = (_cachedMetadata.classes || [])
            .map(c => `<option value="${c}">`).join("");
        }

        // Teacher picker — needs id as value, name as label
        const rsTeacherEl = document.getElementById("rs-teacher-pick");
        if (rsTeacherEl && _allTeachers && _allTeachers.length) {
          const currentVal = rsTeacherEl.value;
          rsTeacherEl.innerHTML = `<option value="">-- All Teachers --</option>`;
          _allTeachers.forEach(t => {
            const opt = document.createElement("option");
            opt.value = t.id;
            opt.textContent = t.name;
            rsTeacherEl.appendChild(opt);
          });
          if (_allTeachers.some(t => t.id === currentVal)) rsTeacherEl.value = currentVal;
        }
      }

