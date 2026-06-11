"use strict";
// ══════════════════════════════════════════════════════════════════════════════
// Nexus School OS — Settings
// ══════════════════════════════════════════════════════════════════════════════


      // Globals — use var so hot-reloads (Cmd+R in Electron) don't throw
      // "Identifier already declared". var is re-declarable; let is not.
      var _principalSignBase64 = null;
      var currentLogoBase64 = null;
      var _stampBase64 = null;
      var _stampStyle = "none";
      var _stampCustomColor = null;
      var _schoolTier = "Silver";
      var _currentIdentity = null;

      async function hydrateSettingsForm() {
        console.log("[Settings:hydrate] START");
        if (!window.electronAPI?.getIdentity) {
          console.error("[Settings:hydrate] ABORT — window.electronAPI.getIdentity is missing");
          return;
        }
        const identity = await window.electronAPI.getIdentity();
        if (!identity) {
          console.error("[Settings:hydrate] ABORT — getIdentity() returned null/undefined");
          return;
        }
        console.log("[Settings:hydrate] identity received:", {
          name: identity.name,
          tier: identity.tier,
          stampStyle: identity.stampStyle,
          hasLogo: !!identity.logoBase64,
          hasPrincipalSign: !!identity.principalSignBase64,
          themePrimary: identity.themePrimary,
        });

        // Store identity globally so stamps and save button can access it
        _currentIdentity = identity;
        _schoolTier = identity.tier || "Silver";
        _stampStyle = identity.stampStyle || "none";
        _stampCustomColor = identity.stampCustomColor || null;

        const schoolNameEl = document.getElementById("school-name-input");
        if (schoolNameEl) schoolNameEl.value = identity.name || "";
        const schoolAddrEl = document.getElementById("school-address-input");
        if (schoolAddrEl) schoolAddrEl.value = identity.address || "";
        const schoolMottoEl = document.getElementById("school-motto-input");
        if (schoolMottoEl) schoolMottoEl.value = identity.motto || "";
        const schoolSigEl = document.getElementById("school-signature-input");
        if (schoolSigEl) schoolSigEl.value = identity.signature || "";
        const principalPhoneEl = document.getElementById("principal-phone-input");
        if (principalPhoneEl) principalPhoneEl.value = identity.principalPhone || "";
        const portalSlugEl = document.getElementById("portal-slug-input");
        if (portalSlugEl) portalSlugEl.value = identity.portalSlug || "";
        const premiumToggle = document.getElementById("premium-plan-toggle");
        if (premiumToggle) premiumToggle.checked = !!identity.premiumPlan;

        const tp = document.getElementById("theme-primary");
        const ts = document.getElementById("theme-secondary");
        if (tp) tp.value = identity.themePrimary || "#1A237E";
        if (ts) ts.value = identity.themeSecondary || "#00E5FF";
        const phex = document.getElementById("primary-hex");
        const shex = document.getElementById("secondary-hex");
        if (phex) phex.textContent = (identity.themePrimary || "#1A237E").toUpperCase();
        if (shex) shex.textContent = (identity.themeSecondary || "#00E5FF").toUpperCase();

        if (identity.logoBase64) {
          currentLogoBase64 = identity.logoBase64;
          const prev = document.getElementById("logo-preview");
          const uc = document.getElementById("uploader-content");
          if (prev) { prev.src = identity.logoBase64; prev.style.display = "block"; }
          if (uc) uc.style.display = "none";
        }

        // Principal signature image (separate from text signature)
        const _psImg  = document.getElementById("principal-sign-preview-img");
        const _psWrap = document.getElementById("principal-sign-preview-wrap");
        if (identity.principalSignBase64) {
          _principalSignBase64 = identity.principalSignBase64;
          if (_psImg)  { _psImg.src = identity.principalSignBase64; }
          if (_psWrap) { _psWrap.style.display = "flex"; }
        } else {
          _principalSignBase64 = null;
          if (_psImg)  { _psImg.src = ""; }
          if (_psWrap) { _psWrap.style.display = "none"; }
        }

        // Update tier badge
        const tierBadge = document.getElementById("stamp-tier-badge");
        if (tierBadge) {
          tierBadge.textContent = _schoolTier;
          tierBadge.style.color = (_schoolTier === "Gold" || _schoolTier === "Diamond") ? "#ffd700" : "#00E5FF";
        }

        // Render stamps now that identity is loaded
        console.log("[Settings:hydrate] calling renderStampGallery() — tier:", _schoolTier, "style:", _stampStyle);
        renderStampGallery();
        console.log("[Settings:hydrate] DONE");

        // Hydrate Academic Pipeline Settings
        if (window.electronAPI?.cbt?.getSystemSettings) {
          try {
            const sysSettings = await window.electronAPI.cbt.getSystemSettings();
            const pmEl = document.getElementById('pass-mark-input');
            if (pmEl && sysSettings.pass_mark_threshold) pmEl.value = sysSettings.pass_mark_threshold;
            const sesEl = document.getElementById('lbl-active-session');
            if (sesEl && sysSettings.current_academic_session) sesEl.textContent = sysSettings.current_academic_session;
            if (sysSettings.class_hierarchy) {
              window._classHierarchy = Array.isArray(sysSettings.class_hierarchy) ? sysSettings.class_hierarchy : [];
              renderClassHierarchy();
            }
          } catch(e) { console.warn('[Settings] Pipeline hydration failed:', e); }
        }
      }

      function renderClassHierarchy() {
        const container = document.getElementById('class-hierarchy-container');
        if (!container) return;
        
        if (!window._classHierarchy || window._classHierarchy.length === 0) {
            container.innerHTML = `<div style="color:var(--text-dim); font-size:12px; text-align:center; padding:10px;">No classes defined. Add your first class.</div>`;
            return;
        }

        let html = '';
        window._classHierarchy.forEach((cls, idx) => {
            html += `
            <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:8px 12px; border-radius:6px; border:1px solid rgba(255,255,255,0.1);">
                <div style="display:flex; align-items:center; gap:10px;">
                    <span style="color:var(--text-dim); font-size:10px;">${idx + 1}.</span>
                    <span style="font-size:13px;">${cls}</span>
                </div>
                <div style="display:flex; gap:5px;">
                    <button onclick="moveClass(${idx}, -1)" style="background:none; border:none; color:var(--text-dim); cursor:pointer;" ${idx === 0 ? 'disabled' : ''}>⬆️</button>
                    <button onclick="moveClass(${idx}, 1)" style="background:none; border:none; color:var(--text-dim); cursor:pointer;" ${idx === window._classHierarchy.length - 1 ? 'disabled' : ''}>⬇️</button>
                    <button onclick="removeClass(${idx})" style="background:none; border:none; color:#ef4444; cursor:pointer; margin-left:5px;">✕</button>
                </div>
            </div>`;
        });
        container.innerHTML = html;
      }

      window.moveClass = (idx, dir) => {
          if (idx + dir < 0 || idx + dir >= window._classHierarchy.length) return;
          const temp = window._classHierarchy[idx];
          window._classHierarchy[idx] = window._classHierarchy[idx + dir];
          window._classHierarchy[idx + dir] = temp;
          renderClassHierarchy();
      };

      window.removeClass = (idx) => {
          window._classHierarchy.splice(idx, 1);
          renderClassHierarchy();
      };

      window.previewPrincipalSign = function(input) {
        if (input.files && input.files[0]) {
          const reader = new FileReader();
          reader.onload = (e) => {
            _principalSignBase64 = e.target.result;
            const img = document.getElementById("principal-sign-preview-img");
            const wrap = document.getElementById("principal-sign-preview-wrap");
            if (img) img.src = _principalSignBase64;
            if (wrap) wrap.style.display = "flex";
          };
          reader.readAsDataURL(input.files[0]);
        }
      }

    window.clearPrincipalSign = function() {
        _principalSignBase64 = null;
        const img = document.getElementById("principal-sign-preview-img");
        const wrap = document.getElementById("principal-sign-preview-wrap");
        const upload = document.getElementById("principal-sign-upload");
        if (img) img.src = "";
        if (wrap) wrap.style.display = "none";
        if (upload) upload.value = "";
      }

      function applyIdentityToUI(identity) {
        if (!identity) return;

        // ── Globals ──────────────────────────────────────────────────────────
        _currentIdentity = identity;
        _schoolTier = identity.tier || "Silver";

        // ── CSS variables (apply immediately, no DOM element required) ───────
        const primary   = identity.themePrimary   || "#1A237E";
        const secondary = identity.themeSecondary || "#00E5FF";
        document.documentElement.style.setProperty("--primary",          primary);
        document.documentElement.style.setProperty("--accent",           secondary);
        document.documentElement.style.setProperty("--school-primary",   primary);
        document.documentElement.style.setProperty("--school-secondary", secondary);

        // --primary-rgb (needed for rgba() shadows)
        let r = 26, g = 35, b = 126;
        if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(primary)) {
          let c = primary.substring(1).split("");
          if (c.length === 3) c = [c[0], c[0], c[1], c[1], c[2], c[2]];
          const hex = parseInt("0x" + c.join(""), 16);
          r = (hex >> 16) & 255;
          g = (hex >> 8)  & 255;
          b =  hex        & 255;
        }
        document.documentElement.style.setProperty("--primary-rgb", `${r}, ${g}, ${b}`);

        // ── Titlebar / sidebar labels ────────────────────────────────────────
        const sn = document.getElementById("school-name");
        if (sn) sn.textContent = identity.name || "Nexus School";
        const tsn = document.getElementById("titlebar-school-name");
        if (tsn) tsn.textContent = identity.name || "Nexus School OS";

        // Sidebar logo avatar
        const logo = document.getElementById("sidebar-logo");
        if (logo) {
          logo.innerHTML = identity.logoBase64
            ? `<img src="${identity.logoBase64}" style="width:100%;height:100%;object-fit:contain;border-radius:10px;pointer-events:none;">`
            : (identity.name ? identity.name.charAt(0).toUpperCase() : "N");
        }

        // ── Settings form fields (safe — all views always in DOM) ────────────
        const _set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        const _txt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        _set("school-name-input",    identity.name          || "");
        _set("school-address-input", identity.address       || "");
        _set("school-motto-input",   identity.motto         || "");
        _set("school-signature-input", identity.signature   || "");
        _set("principal-phone-input", identity.principalPhone || "");
        _set("theme-primary",   primary);
        _set("theme-secondary", secondary);
        _txt("primary-hex",   primary.toUpperCase());
        _txt("secondary-hex", secondary.toUpperCase());

        // ── Logo preview in the dropzone ─────────────────────────────────────
        if (identity.logoBase64) {
          currentLogoBase64 = identity.logoBase64;
          const prev = document.getElementById("logo-preview");
          const uc   = document.getElementById("uploader-content");
          if (prev) {
            prev.src = identity.logoBase64;
            prev.style.display = "block";
            // CRITICAL: let clicks pass through the img to the dropzone
            prev.style.pointerEvents = "none";
          }
          if (uc) uc.style.display = "none";
        }

        // ── Principal signature preview ───────────────────────────────────────
        const _psImg  = document.getElementById("principal-sign-preview-img");
        const _psWrap = document.getElementById("principal-sign-preview-wrap");
        if (identity.principalSignBase64) {
          _principalSignBase64 = identity.principalSignBase64;
          if (_psImg)  { _psImg.src = identity.principalSignBase64; }
          if (_psWrap) { _psWrap.style.display = "flex"; }
        } else {
          _principalSignBase64 = null;
          if (_psImg)  { _psImg.src = ""; }
          if (_psWrap) { _psWrap.style.display = "none"; }
        }

        // ── Stamp gallery ────────────────────────────────────────────────────
        _stampStyle       = identity.stampStyle       || "none";
        _stampCustomColor = identity.stampCustomColor || null;
        renderStampGallery();

        // Tier badge
        const tierBadge = document.getElementById("stamp-tier-badge");
        if (tierBadge) {
          tierBadge.textContent  = _schoolTier;
          tierBadge.style.color  = (_schoolTier === "Gold" || _schoolTier === "Diamond") ? "#ffd700" : "#00E5FF";
        }
      }

      async function renderStampGallery() {
        console.log("[Settings:stamps] renderStampGallery() called — _schoolTier:", _schoolTier, "_stampStyle:", _stampStyle);
        const gallery   = document.getElementById("stamp-gallery");
        const colorList = document.getElementById("stamp-color-swatches");
        if (!gallery)    { console.error("[Settings:stamps] ABORT — #stamp-gallery not found in DOM"); return; }
        if (!colorList)  { console.error("[Settings:stamps] ABORT — #stamp-color-swatches not found in DOM"); return; }
        if (!window.electronAPI?.getStampPreview) {
          console.error("[Settings:stamps] ABORT — window.electronAPI.getStampPreview is missing");
          return;
        }
        console.log("[Settings:stamps] gallery and colorList found, rendering", 5, "stamp options");

        const styles = [
          { id: "none", label: "No Stamp" },
          { id: "classic_round", label: "Classic Seal" },
          { id: "modern_rect", label: "Modern Rect" },
          { id: "ribbon_endorse", label: "Legal Ribbon" },
          { id: "minimal_sig", label: "Signature" }
        ];

        gallery.innerHTML = "";
        for (const s of styles) {
          const opt = document.createElement("div");
          opt.className = `stamp-option ${_stampStyle === s.id ? 'active' : ''}`;
          opt.onclick = () => pickStampStyle(s.id);
          
          if (s.id === "none") {
            opt.innerHTML = `<div style="height:60px;display:flex;align-items:center;justify-content:center;font-size:24px;">🚫</div><span class="stamp-option-label">${s.label}</span>`;
          } else {
            try {
              const color = _stampCustomColor || (_schoolTier === "Silver" ? "#0D47A1" : (_currentIdentity?.themePrimary || "#1A237E"));
              console.log(`[Settings:stamps] fetching preview for "${s.id}" color=${color}`);
              const preview = await window.electronAPI.getStampPreview({ style: s.id, color });
              console.log(`[Settings:stamps] preview OK for "${s.id}" — length:`, preview?.length);
              opt.innerHTML = `<img src="${preview}" class="stamp-template-preview" /><span class="stamp-option-label">${s.label}</span>`;
            } catch (err) {
              console.error(`[Settings:stamps] getStampPreview FAILED for "${s.id}":`, err);
              opt.innerHTML = `<div style="height:60px;display:flex;align-items:center;justify-content:center;font-size:20px;opacity:0.4;">🖋</div><span class="stamp-option-label">${s.label}</span>`;
            }
          }
          gallery.appendChild(opt);
        }

        // Render Color Gating
        const canColor = (_schoolTier === "Gold" || _schoolTier === "Diamond");
        colorList.className = `color-swatch-list ${!canColor ? 'tier-locked' : ''}`;
        
        const colorSection = document.getElementById("stamp-color-section");
        if (colorSection) colorSection.style.display = canColor ? "block" : "none";

        const colors = [
          { id: "red", color: "#D32F2F" },
          { id: "primary", color: _currentIdentity?.themePrimary || "#1A237E" },
          { id: "blue", color: "#0D47A1" }
        ];
        
        colorList.innerHTML = "";
        colors.forEach(c => {
          const s = document.createElement("div");
          s.className = `color-swatch ${(_stampCustomColor === c.color) ? 'active' : ''}`;
          s.style.background = c.color;
          s.title = c.id;
          s.onclick = () => canColor && pickStampColor(c.color);
          colorList.appendChild(s);
        });
        console.log("[Settings:stamps] renderStampGallery() COMPLETE");
      }

      function pickStampStyle(style) {
        _stampStyle = style;
        renderStampGallery();
      }

      function pickStampColor(color) {
        _stampCustomColor = color;
        renderStampGallery();
      }

    function previewStamp(input) {
        if (input.files && input.files[0]) {
            const reader = new FileReader();
            reader.onload = function(e) {
                _stampBase64 = e.target.result;
                document.getElementById("stamp-preview-img").src = _stampBase64;
                document.getElementById("stamp-preview-wrap").style.display = "block";
            }
            reader.readAsDataURL(input.files[0]);
        }
    }


function handleLogoFile(file) {
  console.log("[Settings:logo] handleLogoFile() — type:", file.type, "size:", file.size);
  if (file.type !== "image/png" && file.type !== "image/jpeg") {
    console.warn("[Settings:logo] Rejected — wrong type:", file.type);
    alert("PNG or JPEG only.");
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    currentLogoBase64 = e.target.result;
    console.log("[Settings:logo] FileReader done — base64 length:", currentLogoBase64?.length);
    const logoPreview    = document.getElementById("logo-preview");
    const uploaderContent = document.getElementById("uploader-content");
    if (!logoPreview) { console.error("[Settings:logo] #logo-preview not found"); }
    if (logoPreview) {
      logoPreview.src = currentLogoBase64;
      logoPreview.style.display = "block";
      logoPreview.style.pointerEvents = "none";
      console.log("[Settings:logo] preview img updated ✅");
    }
    if (uploaderContent) {
      uploaderContent.style.display = "none";
    }
  };
  reader.readAsDataURL(file);
}

function initSettingsListeners() {
  console.log("[Settings:init] initSettingsListeners() START");

  // Verify the IPC bridge is available
  const ipcOk = !!window.electronAPI;
  const saveOk = !!window.electronAPI?.saveIdentity;
  const stampOk = !!window.electronAPI?.getStampPreview;
  console.log("[Settings:init] electronAPI present:", ipcOk, "| saveIdentity:", saveOk, "| getStampPreview:", stampOk);
  if (!ipcOk) console.error("[Settings:init] ❌ window.electronAPI is MISSING — preload.js may not have loaded");

  const themePrimaryEl = document.getElementById("theme-primary");
  if (themePrimaryEl) {
    themePrimaryEl.oninput = (e) => {
      const hex = document.getElementById("primary-hex");
      if (hex) hex.textContent = e.target.value.toUpperCase();
    };
  }
  const themeSecondaryEl = document.getElementById("theme-secondary");
  if (themeSecondaryEl) {
    themeSecondaryEl.oninput = (e) => {
      const hex = document.getElementById("secondary-hex");
      if (hex) hex.textContent = e.target.value.toUpperCase();
    };
  }

  const logoDropzone = document.getElementById("logo-dropzone");
  const logoUpload = document.getElementById("logo-upload");
  console.log("[Settings:init] #logo-dropzone found:", !!logoDropzone, "| #logo-upload found:", !!logoUpload);

  if (logoDropzone && logoUpload) {
    logoDropzone.onclick = () => {
      console.log("[Settings:logo] dropzone clicked — triggering file picker");
      logoUpload.click();
    };
    logoUpload.onchange = (e) => {
      console.log("[Settings:logo] file input changed — files:", e.target.files?.length);
      if (e.target.files?.[0]) handleLogoFile(e.target.files[0]);
    };
    logoDropzone.ondragover = (e) => {
      e.preventDefault();
      logoDropzone.style.borderColor = "var(--accent)";
    };
    logoDropzone.ondragleave = () => {
      logoDropzone.style.borderColor = "var(--glass-border)";
    };
    logoDropzone.ondrop = (e) => {
      e.preventDefault();
      logoDropzone.style.borderColor = "var(--glass-border)";
      console.log("[Settings:logo] file dropped");
      if (e.dataTransfer.files?.[0]) handleLogoFile(e.dataTransfer.files[0]);
    };
  } else {
    console.error("[Settings:init] ❌ Logo dropzone wiring SKIPPED — dropzone:", !!logoDropzone, "upload:", !!logoUpload);
  }

  const saveIdentityBtn = document.getElementById("save-identity-btn");
  console.log("[Settings:init] #save-identity-btn found:", !!saveIdentityBtn);
  if (saveIdentityBtn && !saveIdentityBtn._bound) {
    saveIdentityBtn._bound = true;
    saveIdentityBtn.onclick = async () => {
      const btn = saveIdentityBtn;
      console.log("%c[Save Identity Shard] 🔘 BUTTON CLICKED", "color:#00E5FF;font-weight:bold;font-size:13px;");
      console.log("[Save] currentLogoBase64 in memory:", currentLogoBase64 ? `✅ (${currentLogoBase64.length} chars)` : "❌ null");
      console.log("[Save] _principalSignBase64 in memory:", _principalSignBase64 ? "✅ set" : "❌ null");
      console.log("[Save] _stampStyle:", _stampStyle, "| _stampCustomColor:", _stampCustomColor);
      btn.textContent = "Saving…";
      btn.disabled = true;
      try {
        // Helper: read a text input safely
        const _val = (id) => (document.getElementById(id)?.value || "").trim();

        const identity = {
          name:               _val("school-name-input"),
          address:            _val("school-address-input"),
          motto:              _val("school-motto-input"),
          signature:          _val("school-signature-input"),
          principalPhone:     _val("principal-phone-input"),
          portalSlug:         _val("portal-slug-input").toLowerCase().replace(/[^a-z0-9]/g, "") || undefined,
          themePrimary:       document.getElementById("theme-primary")?.value   || "#1A237E",
          themeSecondary:     document.getElementById("theme-secondary")?.value || "#00E5FF",
          stampStyle:         _stampStyle,
          stampCustomColor:   _stampCustomColor   || undefined,
          logoBase64:         currentLogoBase64   || undefined,
          principalSignBase64: _principalSignBase64 || undefined,
        };

        console.log("[Save] Payload being sent to IPC:", {
          name: identity.name,
          address: identity.address,
          motto: identity.motto,
          themePrimary: identity.themePrimary,
          themeSecondary: identity.themeSecondary,
          stampStyle: identity.stampStyle,
          hasLogo: !!identity.logoBase64,
          hasPrincipalSign: !!identity.principalSignBase64,
          fieldsIncluded: Object.keys(identity).filter(k => identity[k] !== undefined),
        });

        const res = await window.electronAPI.saveIdentity(identity);
        console.log("[Save] IPC response:", res);
        if (res && res.ok) {
          console.log("%c[Save Identity Shard] ✅ SUCCESS — identity written to disk", "color:#4ade80;font-weight:bold;");
          applyIdentityToUI(res.identity);
          btn.textContent = "✅ Saved!";
        } else {
          console.error("[Save Identity Shard] ❌ FAILED — IPC returned error:", res?.error);
          btn.textContent = "❌ Error";
        }
      } catch(err) {
        console.error("%c[Save Identity Shard] 💥 EXCEPTION thrown:", "color:#f87171;font-weight:bold;", err);
        btn.textContent = "❌ Error";
      } finally {
        btn.disabled = false;
        setTimeout(() => { btn.textContent = "Save Identity Shard"; }, 1500);
      }
    };
  }

  // Academic Pipeline Events
  const btnAddClass = document.getElementById("btn-add-class");
  if (btnAddClass) {
      btnAddClass.addEventListener("click", () => {
          const input = document.getElementById("new-class-input");
          const val = input.value.trim();
          if (val) {
              window._classHierarchy = window._classHierarchy || [];
              window._classHierarchy.push(val);
              input.value = '';
              renderClassHierarchy();
          }
      });
  }

  const btnSaveHierarchy = document.getElementById("btn-save-hierarchy");
  if (btnSaveHierarchy) {
      btnSaveHierarchy.addEventListener("click", async () => {
          if (!window.electronAPI?.cbt?.saveSystemSetting) return;
          try {
              await window.electronAPI.cbt.saveSystemSetting({ key: 'class_hierarchy', value: window._classHierarchy });
              Swal.fire({ title: "Saved!", text: "Class hierarchy updated.", icon: "success", background: "#0b0f19", color: "#fff", timer: 1500, showConfirmButton: false });
          } catch(e) {
              Swal.fire("Error", e.message, "error");
          }
      });
  }

  const btnSaveThreshold = document.getElementById("btn-save-threshold");
  if (btnSaveThreshold) {
      btnSaveThreshold.addEventListener("click", async () => {
          const val = document.getElementById("pass-mark-input").value;
          if (!window.electronAPI?.cbt?.saveSystemSetting) return;
          try {
              await window.electronAPI.cbt.saveSystemSetting({ key: 'pass_mark_threshold', value: val });
              Swal.fire({ title: "Saved!", text: "Threshold updated.", icon: "success", background: "#0b0f19", color: "#fff", timer: 1500, showConfirmButton: false });
          } catch(e) {
              Swal.fire("Error", e.message, "error");
          }
      });
  }

  const btnEndSession = document.getElementById("btn-end-session");
  if (btnEndSession) {
      btnEndSession.addEventListener("click", async () => {
          const { isConfirmed } = await Swal.fire({
              title: "End Academic Session?",
              text: "This will rollover the active session. This action affects the entire grading ledger.",
              icon: "warning",
              showCancelButton: true,
              confirmButtonColor: "#ef4444",
              cancelButtonColor: "#3085d6",
              confirmButtonText: "Yes, End Session",
              background: "#0b0f19",
              color: "#fff"
          });
          
          if (isConfirmed) {
              const { value: newSession } = await Swal.fire({
                  title: "New Academic Session",
                  input: "text",
                  inputPlaceholder: "e.g. 2026/2027",
                  showCancelButton: true,
                  background: "#0b0f19",
                  color: "#fff",
                  inputValidator: (value) => { if (!value) return 'You need to write something!' }
              });

              if (newSession && window.electronAPI?.cbt?.saveSystemSetting) {
                  try {
                      await window.electronAPI.cbt.saveSystemSetting({ key: 'current_academic_session', value: newSession });
                      document.getElementById('lbl-active-session').textContent = newSession;
                      Swal.fire({ title: "Session Updated!", icon: "success", background: "#0b0f19", color: "#fff", timer: 1500, showConfirmButton: false });
                  } catch(e) {
                      Swal.fire("Error", e.message, "error");
                  }
              }
          }
      });
  }

  const resetBtn = document.getElementById("reset-btn");
  if (resetBtn) {
    resetBtn.onclick = async () => {
      const { isConfirmed } = await Swal.fire({
        title: "Reset All Data?",
        text: "This will clear school identity and all student/teacher records. This cannot be undone.",
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#ff4444",
        cancelButtonColor: "#3085d6",
        confirmButtonText: "Yes, reset everything!",
        background: "#0A0E2E",
        color: "#fff",
        backdrop: false,
      });
      if (isConfirmed && window.electronAPI.resetAppData) {
        await window.electronAPI.resetAppData();
        Swal.fire({
          title: "System Reset",
          text: "Reloading…",
          icon: "success",
          background: "#0A0E2E",
          color: "#fff",
          showConfirmButton: false,
          timer: 1800,
          backdrop: false,
        });
        setTimeout(() => window.location.reload(), 1800);
      }
    };
  }
}

// ── Dashboard Academic Pipeline Panel ──────────────────────────────────────
// Initialises the dp- prefixed slide-in panel on the Dashboard view.
// Called from nav.js whenever the user navigates to 'dashboard'.
window.initDashboardPipeline = async function () {
  if (!window.electronAPI?.cbt?.getSystemSettings) return;

  let dpHierarchy = [];

  function _renderDP() {
    const c = document.getElementById('dp-class-hierarchy-container');
    if (!c) return;
    if (!dpHierarchy.length) {
      c.innerHTML = `<div style="color:var(--text-dim);font-size:12px;text-align:center;padding:10px;">No classes defined yet. Add your first class.</div>`;
      return;
    }
    c.innerHTML = dpHierarchy.map((cls, i) => `
      <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.05);padding:8px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="color:var(--text-dim);font-size:10px;">${i + 1}.</span>
          <span style="font-size:13px;">${cls}</span>
        </div>
        <div style="display:flex;gap:4px;">
          <button onclick="window._dpMove(${i},-1)" style="background:none;border:none;color:var(--text-dim);cursor:pointer;" ${i===0?'disabled':''}>⬆️</button>
          <button onclick="window._dpMove(${i},1)"  style="background:none;border:none;color:var(--text-dim);cursor:pointer;" ${i===dpHierarchy.length-1?'disabled':''}>⬇️</button>
          <button onclick="window._dpRemove(${i})"  style="background:none;border:none;color:#ef4444;cursor:pointer;margin-left:4px;">✕</button>
        </div>
      </div>`).join('');
  }

  window._dpMove = (i, dir) => {
    if (i + dir < 0 || i + dir >= dpHierarchy.length) return;
    [dpHierarchy[i], dpHierarchy[i + dir]] = [dpHierarchy[i + dir], dpHierarchy[i]];
    _renderDP();
  };
  window._dpRemove = (i) => { dpHierarchy.splice(i, 1); _renderDP(); };

  // Load settings
  try {
    const s = await window.electronAPI.cbt.getSystemSettings();
    dpHierarchy = Array.isArray(s.class_hierarchy) ? [...s.class_hierarchy] : [];
    const pm = document.getElementById('dp-pass-mark-input');
    if (pm && s.pass_mark_threshold) pm.value = s.pass_mark_threshold;
    const ses = document.getElementById('dp-lbl-active-session');
    if (ses && s.current_academic_session) ses.textContent = s.current_academic_session;

    // Load Class Arms & Terms
    const armsEl = document.getElementById('dp-class-arms-input');
    if (armsEl && Array.isArray(s.class_arms)) {
      armsEl.value = s.class_arms.join(', ');
    }
    const termsEl = document.getElementById('dp-terms-input');
    if (termsEl && Array.isArray(s.terms)) {
      termsEl.value = s.terms.join(', ');
    }
  } catch (e) { console.warn('[Dashboard Pipeline] load failed', e); }
  _renderDP();

  // Add Class
  const addBtn = document.getElementById('dp-btn-add-class');
  if (addBtn && !addBtn._dpBound) {
    addBtn._dpBound = true;
    addBtn.addEventListener('click', () => {
      const inp = document.getElementById('dp-new-class-input');
      const val = inp?.value.trim();
      if (val) { dpHierarchy.push(val); inp.value = ''; _renderDP(); }
    });
  }

  // Save Hierarchy
  const saveHBtn = document.getElementById('dp-btn-save-hierarchy');
  if (saveHBtn && !saveHBtn._dpBound) {
    saveHBtn._dpBound = true;
    saveHBtn.addEventListener('click', async () => {
      try {
        await window.electronAPI.cbt.saveSystemSetting({ key: 'class_hierarchy', value: dpHierarchy });
        // Sync to Settings view state too
        window._classHierarchy = [...dpHierarchy];
        Swal.fire({ title: 'Saved!', text: 'Class hierarchy updated.', icon: 'success', background: '#0b0f19', color: '#fff', timer: 1500, showConfirmButton: false });
      } catch (e) { Swal.fire('Error', e.message, 'error'); }
    });
  }

  // Save Pass Mark
  const saveThBtn = document.getElementById('dp-btn-save-threshold');
  if (saveThBtn && !saveThBtn._dpBound) {
    saveThBtn._dpBound = true;
    saveThBtn.addEventListener('click', async () => {
      const val = document.getElementById('dp-pass-mark-input')?.value;
      if (!val) return;
      try {
        await window.electronAPI.cbt.saveSystemSetting({ key: 'pass_mark_threshold', value: val });
        Swal.fire({ title: 'Saved!', text: 'Pass mark updated.', icon: 'success', background: '#0b0f19', color: '#fff', timer: 1500, showConfirmButton: false });
      } catch (e) { Swal.fire('Error', e.message, 'error'); }
    });
  }

  // Save Class Arms
  const saveArmsBtn = document.getElementById('dp-btn-save-arms');
  if (saveArmsBtn && !saveArmsBtn._dpBound) {
    saveArmsBtn._dpBound = true;
    saveArmsBtn.addEventListener('click', async () => {
      const inp = document.getElementById('dp-class-arms-input');
      if (!inp) return;
      try {
        const list = inp.value.split(',').map(s => s.trim()).filter(Boolean);
        await window.electronAPI.cbt.saveSystemSetting({ key: 'class_arms', value: list });
        Swal.fire({ title: 'Saved!', text: 'Class arms updated.', icon: 'success', background: '#0b0f19', color: '#fff', timer: 1500, showConfirmButton: false });
      } catch (e) { Swal.fire('Error', e.message, 'error'); }
    });
  }

  // Save Academic Terms
  const saveTermsBtn = document.getElementById('dp-btn-save-terms');
  if (saveTermsBtn && !saveTermsBtn._dpBound) {
    saveTermsBtn._dpBound = true;
    saveTermsBtn.addEventListener('click', async () => {
      const inp = document.getElementById('dp-terms-input');
      if (!inp) return;
      try {
        const list = inp.value.split(',').map(s => s.trim()).filter(Boolean);
        await window.electronAPI.cbt.saveSystemSetting({ key: 'terms', value: list });
        Swal.fire({ title: 'Saved!', text: 'Academic terms updated.', icon: 'success', background: '#0b0f19', color: '#fff', timer: 1500, showConfirmButton: false });
      } catch (e) { Swal.fire('Error', e.message, 'error'); }
    });
  }

  // End Session / Rollover
  const endSBtn = document.getElementById('dp-btn-end-session');
  if (endSBtn && !endSBtn._dpBound) {
    endSBtn._dpBound = true;
    endSBtn.addEventListener('click', async () => {
      const { isConfirmed } = await Swal.fire({ title: 'End Academic Session?', text: 'This will rollover the active session and affects the entire grading ledger.', icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'Yes, End Session', background: '#0b0f19', color: '#fff' });
      if (!isConfirmed) return;
      const { value: newSession } = await Swal.fire({ title: 'New Academic Session', input: 'text', inputPlaceholder: 'e.g. 2026/2027', showCancelButton: true, background: '#0b0f19', color: '#fff', inputValidator: v => !v ? 'Please enter the new session' : null });
      if (newSession) {
        try {
          await window.electronAPI.cbt.saveSystemSetting({ key: 'current_academic_session', value: newSession });
          const lbl = document.getElementById('dp-lbl-active-session');
          if (lbl) lbl.textContent = newSession;
          Swal.fire({ title: 'Session Updated!', icon: 'success', background: '#0b0f19', color: '#fff', timer: 1500, showConfirmButton: false });
        } catch (e) { Swal.fire('Error', e.message, 'error'); }
      }
    });
  }
};

// ── Staff Accounts Management ─────────────────────────────────────────────────
window.initAdminManagement = async function () {
  const panel   = document.getElementById('admin-mgmt-panel');
  const overlay = document.getElementById('admin-mgmt-overlay');
  if (!panel) return;
  panel.classList.add('open');
  if (overlay) overlay.style.display = 'block';

  const ROLE_LABEL = { 9: '👑 Super Admin', 5: '🔑 Manager', 1: '🧑‍💼 Staff' };
  const ROLE_COLOR = { 9: '#f59e0b', 5: '#818cf8', 1: '#10b981' };

  async function renderAdmins() {
    const list = document.getElementById('admin-list-container');
    if (!list) return;
    list.innerHTML = '<div style="color:var(--text-dim);font-size:12px;padding:10px;">Loading…</div>';
    try {
      const admins = await window.electronAPI.getAdmins();
      if (!admins.length) { list.innerHTML = '<div style="color:var(--text-dim);padding:10px;">No accounts found.</div>'; return; }
      list.innerHTML = admins.map(a => `
        <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:10px 14px;margin-bottom:8px;">
          <div>
            <div style="font-weight:600;font-size:13px;">${a.username}</div>
            <div style="font-size:11px;color:${ROLE_COLOR[a.role_level]||'#aaa'};margin-top:2px;">${ROLE_LABEL[a.role_level]||'Level '+a.role_level}</div>
          </div>
          <button onclick="window._deleteAdmin(${a.id},'${a.username}')" style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:#ef4444;padding:4px 10px;border-radius:6px;font-size:11px;cursor:pointer;">Remove</button>
        </div>`).join('');
    } catch (e) { list.innerHTML = `<div style="color:#ef4444;padding:10px;">${e.message}</div>`; }
  }

  window._deleteAdmin = async (id, username) => {
    const { isConfirmed } = await Swal.fire({ title: `Remove ${username}?`, text: 'This admin will no longer be able to log in.', icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'Yes, Remove', background: '#0d1235', color: '#fff' });
    if (!isConfirmed) return;
    const res = await window.electronAPI.deleteAdmin({ adminId: id });
    if (res.ok) { renderAdmins(); Swal.fire({ title: 'Removed', icon: 'success', background: '#0d1235', color: '#fff', timer: 1200, showConfirmButton: false }); }
    else Swal.fire('Error', res.error, 'error');
  };

  const addBtn = document.getElementById('admin-add-btn');
  if (addBtn && !addBtn._bound) {
    addBtn._bound = true;
    addBtn.addEventListener('click', async () => {
      const { value: f } = await Swal.fire({
        title: 'Add Staff Account', background: '#0d1235', color: '#fff',
        confirmButtonColor: '#10b981', showCancelButton: true, width: 440, focusConfirm: false,
        html: `
          <div style="text-align:left;display:flex;flex-direction:column;gap:10px;margin-top:8px;">
            <input id="na-user" class="swal2-input" placeholder="Username (e.g. deputy_principal)" style="margin:0;">
            <input id="na-pin" type="password" class="swal2-input" placeholder="Initial 4-digit PIN" maxlength="4" inputmode="numeric" style="margin:0;">
            <select id="na-role" class="swal2-input" style="margin:0;">
              <option value="9">👑 Super Admin — Full access (Principal)</option>
              <option value="5">🔑 Manager — Most features (Deputy, Bursar)</option>
              <option value="1" selected>🧑‍💼 Staff — Limited access (Clerk, Secretary)</option>
            </select>
          </div>`,
        preConfirm: () => ({
          username: document.getElementById('na-user').value.trim(),
          pin: document.getElementById('na-pin').value.trim(),
          roleLevel: document.getElementById('na-role').value
        })
      });
      if (!f?.username) return;
      const res = await window.electronAPI.createAdmin({ username: f.username, pin: f.pin, roleLevel: parseInt(f.roleLevel) });
      if (res.ok) {
        renderAdmins();
        Swal.fire({ title: 'Account Created!', html: `<strong>${f.username}</strong> can now log in with their PIN on the lock screen.`, icon: 'success', background: '#0d1235', color: '#fff', timer: 2500, showConfirmButton: false });
      } else Swal.fire('Error', res.error, 'error');
    });
  }

  const closeBtn = document.getElementById('admin-mgmt-close');
  function closePanel() { panel.classList.remove('open'); if (overlay) overlay.style.display = 'none'; }
  if (closeBtn && !closeBtn._bound) { closeBtn._bound = true; closeBtn.addEventListener('click', closePanel); }
  if (overlay && !overlay._adminBound) { overlay._adminBound = true; overlay.addEventListener('click', closePanel); }

  renderAdmins();
};

initSettingsListeners();

