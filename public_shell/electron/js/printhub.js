"use strict";
// ══════════════════════════════════════════════════════════════════════════════
// Nexus School OS — Printhub
// ══════════════════════════════════════════════════════════════════════════════


      async function phInit() {
        if (!window.electronAPI?.getTermConfig) return;
        const cfg = await window.electronAPI.getTermConfig();
        if (cfg.academic_session)
          document.getElementById("ph-session").value = cfg.academic_session;
        if (cfg.term) {
          const sel = document.getElementById("ph-term");
          for (const opt of sel.options)
            if (opt.value === cfg.term) {
              opt.selected = true;
              break;
            }
        }
        if (cfg.resumption_date)
          document.getElementById("ph-resumption").value = cfg.resumption_date;
        if (cfg.term_start_date)
          document.getElementById("ph-term-start").value = cfg.term_start_date;
        if (cfg.term_end_date)
          document.getElementById("ph-term-end").value = cfg.term_end_date;
        document.getElementById("ph-show-position").checked =
          cfg.show_position !== 0;
        document.getElementById("ph-show-domains").checked =
          cfg.show_domains !== 0;
        const showAttEl = document.getElementById("ph-show-attendance");
        const weightContEl = document.getElementById("ph-attendance-weight-container");
        
        if (showAttEl && weightContEl) {
          showAttEl.checked = cfg.show_attendance !== 0;
          weightContEl.style.display = showAttEl.checked ? "flex" : "none";
          showAttEl.addEventListener("change", (e) => {
            weightContEl.style.display = e.target.checked ? "flex" : "none";
            _phRefreshTotal();
          });
        }
        const weightInput = document.getElementById("ph-attendance-weight");
        if (weightInput) {
          if (cfg.attendance_score_weight !== undefined)
            weightInput.value = cfg.attendance_score_weight;
          weightInput.addEventListener("input", _phRefreshTotal);
        }

        if (window.currentLicenseTier === "Silver") {
          const attWrapper = document.getElementById("ph-attendance-wrapper");
          if (attWrapper) attWrapper.style.display = "none";
        }
        if (window.currentLicenseTier === "Gold" || window.currentLicenseTier === "Diamond") {
          const portalSec = document.getElementById("ph-portal-section");
          if (portalSec) portalSec.style.display = "block";
        }
        // Hydrate template picker and trigger preview
        if (cfg.template) {
          const tplEl = document.getElementById("ph-template");
          if (tplEl) tplEl.value = cfg.template;
          updateTemplatePreview(cfg.template, 'ph-template-preview');
        } else {
          updateTemplatePreview('clean_slate', 'ph-template-preview');
        }
        // Populate teachers/classes moved to Result Studio.
        // Load saved score breakdown components from grading_scale
        try {
          if (cfg.grading_scale) {
            const raw = JSON.parse(cfg.grading_scale);
            if (raw && !Array.isArray(raw) && raw.components && raw.components.length) {
              _phComponents = raw.components;
            }
          }
        } catch(e) {}
        // Render the score components panel
        phRenderComponents();
      }

      async function phSaveConfig() {
        if (!window.electronAPI?.saveTermConfig) return;
        let existingScale = [];
        try {
          const existing = await window.electronAPI.getTermConfig();
          if (existing?.grading_scale) {
            const raw = JSON.parse(existing.grading_scale);
            if (raw && !Array.isArray(raw) && raw.scale) existingScale = raw.scale;
            else if (Array.isArray(raw)) existingScale = raw;
          }
        } catch(e) {}
        const templateEl = document.getElementById("ph-template");
        const config = {
          academic_session: document.getElementById("ph-session").value.trim() || "2024/2025",
          term:             document.getElementById("ph-term").value,
          resumption_date:  document.getElementById("ph-resumption").value,
          term_start_date:  document.getElementById("ph-term-start")?.value || "",
          term_end_date:    document.getElementById("ph-term-end")?.value   || "",
          show_position:    document.getElementById("ph-show-position").checked,
          show_domains:     document.getElementById("ph-show-domains").checked,
          show_attendance:  document.getElementById("ph-show-attendance").checked,
          attendance_score_weight: document.getElementById("ph-attendance-weight").value,
          grading_scale:    JSON.stringify({ scale: existingScale, components: _phComponents || [] }),
          template:         templateEl ? templateEl.value : "clean_slate",
        };
        const r = await window.electronAPI.saveTermConfig(config);
        // Sync template picker in Result Studio
        const rsTemplateEl = document.getElementById("rs-template");
        if (rsTemplateEl && templateEl) rsTemplateEl.value = templateEl.value;
        const statusEl = document.getElementById("ph-status");
        if (statusEl) statusEl.textContent = r.ok ? "✅ Config saved." : "❌ Save failed: " + r.error;
        if (r.ok && typeof Swal !== "undefined") {
          Swal.fire({ title: "Config Saved", icon: "success", background: "#0A0E2E", color: "#fff", timer: 1500, showConfirmButton: false, backdrop: false });
        }
      }

      function updateTemplatePreview(templateId, targetId = 'ph-template-preview') {
        const container = document.getElementById(targetId);
        if (!container) return;

        // Map template IDs to PNG filenames in assets/templates/
        const imgMap = {
          'clean_slate': 'classic',
          'prestige':    'prestige',
          'azure':       'azure',
          'royal':       'royal',
          'monarch':     'monarch',
          'sovereign':   'sovereign',
          'sterling':    'sterling',
          'apex':        'apex'
        };

        const imgName = imgMap[templateId] || 'classic';
        const src = `../../private_engine/assets/templates/${imgName}.png`;

        container.innerHTML = `
          <img
            src="${src}"
            alt="${templateId} template preview"
            style="width:100%;height:100%;object-fit:cover;object-position:top center;display:block;border-radius:3px;"
            onerror="this.style.display='none';
                     this.insertAdjacentHTML('afterend',
                       '<div style=\\'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:8px;color:rgba(255,255,255,0.3);\\'>' +
                       '<span style=\\'font-size:28px;\\'>🖼️</span>' +
                       '<span style=\\'font-size:10px;text-align:center;line-height:1.4;\\'>Preview image<br>not yet available</span>' +
                       '</div>'
                     );"
          />`;
      }

      function phRenderComponents() {
        const list = document.getElementById("ph-components-list");
        if (!list) return;
        list.innerHTML = "";
        (_phComponents || []).forEach((c, i) => {
          const row = document.createElement("div");
          row.style.cssText =
            "display:flex;align-items:center;gap:6px;margin-bottom:4px;";
          // Editable label input
          const labelInp = document.createElement("input");
          labelInp.value = c.label;
          labelInp.placeholder = "Label";
          labelInp.style.cssText =
            "flex:1;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:5px;" +
            "color:#ccc;font-size:11px;padding:3px 7px;height:26px;min-width:0;outline:none;";
          labelInp.addEventListener("change", () => phUpdateComponent(i, "label", labelInp.value.trim()));
          labelInp.addEventListener("focus", () => labelInp.style.borderColor = "rgba(0,229,255,0.5)");
          labelInp.addEventListener("blur",  () => labelInp.style.borderColor = "rgba(255,255,255,0.12)");

          // Editable max score input
          const maxInp = document.createElement("input");
          maxInp.type = "number";
          maxInp.value = c.max;
          maxInp.min = 1;
          maxInp.max = 100;
          maxInp.placeholder = "Max";
          maxInp.style.cssText =
            "width:52px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:5px;" +
            "color:var(--text-dim);font-size:11px;padding:3px 5px;height:26px;text-align:center;outline:none;";
          maxInp.addEventListener("change", () => phUpdateComponent(i, "max", parseInt(maxInp.value, 10) || 0));
          maxInp.addEventListener("focus", () => maxInp.style.borderColor = "rgba(0,229,255,0.5)");
          maxInp.addEventListener("blur",  () => maxInp.style.borderColor = "rgba(255,255,255,0.12)");

          const ptsLabel = document.createElement("span");
          ptsLabel.textContent = "pts";
          ptsLabel.style.cssText = "font-size:10px;color:var(--text-dim);flex-shrink:0;";

          // Remove button
          const rmBtn = document.createElement("button");
          rmBtn.innerHTML = "×";
          rmBtn.title = "Remove";
          rmBtn.style.cssText =
            "background:none;border:none;color:#ff6666;cursor:pointer;font-size:14px;padding:0 2px;line-height:1;flex-shrink:0;";
          rmBtn.addEventListener("click", () => phRemoveComponent(i));

          row.appendChild(labelInp);
          row.appendChild(maxInp);
          row.appendChild(ptsLabel);
          row.appendChild(rmBtn);
          list.appendChild(row);
        });
        _phRefreshTotal();
      }

      function phUpdateComponent(idx, field, value) {
        if (!_phComponents || !_phComponents[idx]) return;
        if (field === "label" && value) {
          _phComponents[idx].label = value;
          _phComponents[idx].key = value.replace(/[^a-zA-Z0-9]/g, "_");
        } else if (field === "max" && value > 0) {
          _phComponents[idx].max = value;
        }
        _phRefreshTotal();
      }

      function _phRefreshTotal() {
        const showAttEl = document.getElementById("ph-show-attendance");
        const weightInp = document.getElementById("ph-attendance-weight");
        const attWeight = (showAttEl && showAttEl.checked && weightInp) ? (Number(weightInp.value) || 0) : 0;
        
        const total = (_phComponents || []).reduce(
          (s, c) => s + (Number(c.max) || 0),
          0,
        ) + attWeight;
        const el = document.getElementById("ph-comp-total");
        if (el) {
          el.textContent = "Total: " + total + "/100";
          el.style.color =
            total === 100 ? "#4CAF50" : total > 100 ? "#ff4444" : "#ffd700";
        }
      }

      function phAddComponent() {
        const labelEl = document.getElementById("ph-comp-label");
        const maxEl = document.getElementById("ph-comp-max");
        const label = (labelEl?.value || "").trim();
        const max = parseInt(maxEl?.value || "0", 10);
        if (!label || !max || max <= 0) {
          alert("Enter a label and a positive max score.");
          return;
        }
        const key = label.replace(/[^a-zA-Z0-9]/g, "_");
        if (
          (_phComponents || []).find(
            (c) => c.key.toLowerCase() === key.toLowerCase(),
          )
        ) {
          alert("A component with a similar key already exists.");
          return;
        }
        if (!_phComponents) _phComponents = [];
        _phComponents.unshift({ key, label, max });
        phRenderComponents();
        if (labelEl) labelEl.value = "";
        if (maxEl) maxEl.value = "";
      }

      function phRemoveComponent(idx) {
        if (_phComponents && _phComponents[idx] !== undefined) {
          _phComponents.splice(idx, 1);
          phRenderComponents();
        }
      }

      function phSetType(type) {
        _phType = type;
        document
          .getElementById("ph-type-terminal")
          .classList.toggle("active", type === "terminal");
        document
          .getElementById("ph-type-broadsheet")
          .classList.toggle("active", type === "broadsheet");
        // Show subject field only for broadsheet
        const show = type === "broadsheet";
        const subjectRow = document.getElementById("ph-scope-subject");
        if (show) subjectRow.style.display = "flex";
      }

      function phOnScopeChange() {
        const scope = document.getElementById("ph-scope").value;
        ["class", "teacher", "subject", "student"].forEach((s) => {
          document.getElementById("ph-scope-" + s).style.display =
            scope === s ? "flex" : "none";
        });
      }

      async function phPreview() {
        const status = document.getElementById("ph-status");
        status.textContent = "⏳ Querying results…";
        const scope = document.getElementById("ph-scope").value;
        const session =
          document.getElementById("ph-session").value.trim() || "2024/2025";
        const term = document.getElementById("ph-term").value;
        const class_name = document.getElementById("ph-class-pick").value;
        const teacher_id = document.getElementById("ph-teacher-pick").value;
        const subject = document
          .getElementById("ph-subject-input")
          .value.trim();
        const student_id = document.getElementById("ph-student-pick").value;

        const resp = await window.electronAPI.queryResults({
          scope,
          session,
          term,
          class_name,
          teacher_id,
          subject,
          student_id,
        });
        if (!resp.ok) {
          status.textContent = "❌ Query failed: " + resp.error;
          return;
        }

        _phResults = resp.results;
        const tbody = document.getElementById("ph-preview-tbody");
        if (!_phResults.length) {
          tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-dim);">No results found for this filter. Try a different scope or ensure grades have been synced.</td></tr>`;
        } else {
          tbody.innerHTML = _phResults
            .map(
              (s, i) => `
          <tr>
            <td>${i + 1}</td>
            <td><strong>${s.name}</strong></td>
            <td>${s.class_name}</td>
            <td>${s.subjects?.length || 0} subject(s)</td>
            <td>${s.total_score || "—"}</td>
            <td>${s.average || "—"}</td>
          </tr>`,
            )
            .join("");
        }

        document.getElementById("ph-preview-label").textContent =
          `${_phResults.length} student(s) ready · ${session}, ${term}`;
        document.getElementById("ph-preview-container").style.display = "block";
        status.textContent = "";
      }

      function phGenerate() { showView('result-studio'); rsInit(); }

      function downloadSampleCSV() {
        const csv = `Student_ID,First_Name,Last_Name,Class,Teacher_ID,Teacher_Name,Teacher_Phone,Subjects\nA-001,Obi,Ndidi,JSS1,TCH-001,Mr. Example,08012345678,Mathematics|English\n`;
        const a = Object.assign(document.createElement("a"), {
          href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
          download: "nexus_sample_roster.csv",
        });
        a.click();
      }
