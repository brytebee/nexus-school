"use strict";
// ══════════════════════════════════════════════════════════════════════════════
// Nexus School OS — Result Studio
// ══════════════════════════════════════════════════════════════════════════════


      async function rsInit() {
        if (!window.electronAPI?.getTermConfig) return;
        const cfg = await window.electronAPI.getTermConfig();
        // Sync template from saved config and trigger preview
        if (cfg.template) {
          const el = document.getElementById("rs-template");
          if (el) el.value = cfg.template;
          updateTemplatePreview(cfg.template, 'rs-template-preview');
        } else {
          updateTemplatePreview('clean_slate', 'rs-template-preview');
        }
        // Load teacher cache first (needed by refreshDropdownMetadata for the teacher picker)
        if (!_allTeachers || !_allTeachers.length) {
          _allTeachers = await window.electronAPI.getAllTeachers() || [];
        }
        // Populate classes, subjects (from DB) and teachers via single source of truth
        await refreshDropdownMetadata();
        // Student picker needs full name + class display — handle separately
        const students = await window.electronAPI.getAllStudents() || [];
        const stuEl = document.getElementById("rs-student-pick");
        if (stuEl) {
          stuEl.innerHTML = `<option value="">-- All Students --</option>` +
            students.map(s => `<option value="${s.id}">${s.name} (${s.class_name})</option>`).join("");
        }
      }

      async function rsOnScopeChange() {
        const scope = document.getElementById("rs-scope").value;
        ["class","teacher","subject","student"].forEach(s => {
          const el = document.getElementById("rs-scope-" + s);
          if (el) el.style.display = scope === s ? "flex" : "none";
        });
        // Ensure dropdowns are fresh
        try { await refreshDropdownMetadata(); } catch(e) { console.warn("Metadata refresh failed:", e); }
      }

      function rsOnFormatChange() {
        const fmt = document.getElementById("rs-format").value;
        const copyBtn = document.getElementById("rs-copy-btn");
        if (copyBtn) copyBtn.style.display = fmt === "image" ? "inline-flex" : "none";
      }

      function toggleBrandColorOption(templateId) {
        const grp = document.getElementById('brand-color-group');
        if (!grp) return;
        if (PAID_TEMPLATES.includes(templateId)) {
          grp.style.display = 'flex';
          // Show live swatch preview using identity colors stored in DOM (if available)
          const primary   = getComputedStyle(document.documentElement).getPropertyValue('--school-primary').trim();
          const secondary = getComputedStyle(document.documentElement).getPropertyValue('--school-secondary').trim();
          const priBox = document.getElementById('bcp-primary');
          const secBox = document.getElementById('bcp-secondary');
          if (priBox && primary)   priBox.style.background   = primary;
          if (secBox && secondary) secBox.style.background   = secondary;
          const checked = document.getElementById('rs-use-brand-colors')?.checked;
          const previewRow = document.getElementById('brand-color-preview');
          if (previewRow) previewRow.style.display = (checked && (primary || secondary)) ? 'flex' : 'none';
        } else {
          grp.style.display = 'none';
        }
      }

      function rsOnBrandColorChange(checked) {
        const previewRow = document.getElementById('brand-color-preview');
        if (!previewRow) return;
        const primary = getComputedStyle(document.documentElement).getPropertyValue('--school-primary').trim();
        previewRow.style.display = (checked && primary) ? 'flex' : 'none';
      }

      async function rsPreview() {
        const status = document.getElementById("rs-status");
        const previewContainer = document.getElementById("rs-preview-container");
        const tbody = document.getElementById("rs-preview-tbody");
        if (!status || !previewContainer || !tbody) {
          console.error("[rsPreview] Required DOM elements missing.");
          return;
        }

        // Show loading state immediately
        status.textContent = "⏳ Querying results…";
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-dim);">⏳ Loading…</td></tr>`;
        previewContainer.style.display = "block";

        try {
          const cfg = await window.electronAPI.getTermConfig();
          const scope      = (document.getElementById("rs-scope")?.value)      || "all";
          const session    = cfg.academic_session || "2024/2025";
          const term       = cfg.term || "First Term";
          const class_name = document.getElementById("rs-class-pick")?.value   || "";
          const teacher_id = document.getElementById("rs-teacher-pick")?.value || "";
          const subject    = (document.getElementById("rs-subject-pick")?.value || "").trim();
          const student_id = document.getElementById("rs-student-pick")?.value  || "";

          const resp = await window.electronAPI.queryResults({ scope, session, term, class_name, teacher_id, subject, student_id });
          if (!resp.ok) {
            status.textContent = "❌ Query failed: " + resp.error;
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:#ff6b6b;">❌ ${resp.error}</td></tr>`;
            return;
          }

          _rsResults = resp.results;
          if (!_rsResults.length) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-dim);">No results found for <strong>${session}, ${term}</strong>.<br>Ensure grades have been synced from teacher devices.</td></tr>`;
          } else {
            tbody.innerHTML = _rsResults.map((s, i) => `
              <tr>
                <td>${i+1}</td><td><strong>${s.name}</strong></td><td>${s.class_name}</td>
                <td>${s.subjects?.filter(x=>x.score!==null).length || 0} graded</td>
                <td>${s.total_score ?? "—"}</td><td>${s.average ?? "—"}</td>
              </tr>`).join("");
          }
          document.getElementById("rs-preview-label").textContent = `${_rsResults.length} student(s) · ${session}, ${term}`;
          status.textContent = "";
          // Scroll preview into view
          previewContainer.scrollIntoView({ behavior: "smooth", block: "nearest" });
        } catch(err) {
          console.error("[rsPreview] Error:", err);
          status.textContent = "❌ Error: " + err.message;
          tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:#ff6b6b;">❌ Unexpected error. Check console.</td></tr>`;
        }
      }

      async function rsGenerate() {
        if (!_rsResults.length) { alert("Click Preview first to load results."); return; }
        const status  = document.getElementById("rs-status");
        const btn     = document.getElementById("rs-generate-btn");
        const pathEl  = document.getElementById("rs-result-path");
        btn.disabled  = true;
        btn.textContent = "⏳ Generating…";
        status.textContent = "";
        pathEl.textContent = "";

        const identity   = await window.electronAPI.getIdentity();
        const cfg        = await window.electronAPI.getTermConfig();
        const templateId = document.getElementById("rs-template").value;
        const format     = document.getElementById("rs-format").value;
        const reportType = document.getElementById("rs-type").value;
        const subject    = document.getElementById("rs-subject-pick") ? document.getElementById("rs-subject-pick").value.trim() : "";

        try {
          const useSchoolColors = document.getElementById('rs-use-brand-colors')?.checked || false;
          const result = await window.electronAPI.generateReports({
            identity, students: _rsResults, termConfig: cfg,
            reportType, templateId, format, subject, useSchoolColors,
          });
          if (result.success) {
            const fmtLabel = { pdf: "PDF", html: "HTML file", image: "PNG image" }[format] || format;
            status.textContent = `✅ ${fmtLabel} saved to Desktop/NexusReports/`;
            pathEl.textContent = result.path || "";
            _rsLastImagePath = result.format === "image" ? result.path : null;
            const copyBtn = document.getElementById("rs-copy-btn");
            if (copyBtn && format === "image") {
              copyBtn.style.display = "inline-flex";
              copyBtn.style.animation = "none";
              copyBtn.style.background = "rgba(0,229,255,0.2)";
            }
          } else {
            status.textContent = "❌ Generation failed.";
          }
        } catch(e) {
          status.textContent = "❌ Error: " + e.message;
        }
        btn.disabled = false;
        btn.textContent = "📄 Generate & Save";
      }

      async function rsCopyImage() {
        const status = document.getElementById("rs-status");
        try {
          const r = await window.electronAPI.copyResultImage({ imagePath: _rsLastImagePath });
          status.textContent = r.ok ? "📋 Image copied to clipboard!" : "❌ Copy failed: " + r.error;
        } catch(e) {
          status.textContent = "❌ Copy error: " + e.message;
        }
      }
