"use strict";
// ══════════════════════════════════════════════════════════════════════════════
// Nexus School OS — Settings
// ══════════════════════════════════════════════════════════════════════════════


      // Global holder for principal signature base64
      let _principalSignBase64 = null;

      async function hydrateSettingsForm() {
        if (!window.electronAPI?.getIdentity) return;
        const identity = await window.electronAPI.getIdentity();
        if (!identity) return;
        document.getElementById("school-name-input").value = identity.name || "";
        document.getElementById("school-address-input").value = identity.address || "";
        document.getElementById("school-motto-input").value = identity.motto || "";
        document.getElementById("school-signature-input").value = identity.signature || "";
        document.getElementById("premium-plan-toggle").checked = !!identity.premiumPlan;
        const tp = document.getElementById("theme-primary");
        const ts = document.getElementById("theme-secondary");
        tp.value = identity.themePrimary || "#1A237E";
        ts.value = identity.themeSecondary || "#00E5FF";
        document.getElementById("primary-hex").textContent = tp.value.toUpperCase();
        document.getElementById("secondary-hex").textContent = ts.value.toUpperCase();
        if (identity.logoBase64) {
          currentLogoBase64 = identity.logoBase64;
          const prev = document.getElementById("logo-preview");
          prev.src = identity.logoBase64;
          prev.style.display = "block";
          document.getElementById("uploader-content").style.display = "none";
        }
        if (identity.stamp) {
          _stampBase64 = identity.stamp;
          document.getElementById("stamp-preview-img").src = identity.stamp;
          document.getElementById("stamp-preview-wrap").style.display = "block";
        } else {
          _stampBase64 = null;
          document.getElementById("stamp-preview-wrap").style.display = "none";
        }
        // Restore principal signature preview
        if (identity.principalSignBase64) {
          _principalSignBase64 = identity.principalSignBase64;
          const img = document.getElementById("principal-sign-preview-img");
          const wrap = document.getElementById("principal-sign-preview-wrap");
          if (img) img.src = identity.principalSignBase64;
          if (wrap) wrap.style.display = "flex";
        }
      }

      function previewPrincipalSign(input) {
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

      function clearPrincipalSign() {
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
        try {
          _currentIdentity = identity;
          _schoolTier = identity.tier || "Silver";

          // 1. Core Branding (Priority)
          document.documentElement.style.setProperty("--primary", identity.themePrimary || "#1A237E");
          document.documentElement.style.setProperty("--accent", identity.themeSecondary || "#00E5FF");
          document.documentElement.style.setProperty("--school-primary", identity.themePrimary || "");
          document.documentElement.style.setProperty("--school-secondary", identity.themeSecondary || "");

        const sn = document.getElementById("school-name");
        if (sn) sn.textContent = identity.name || "Nexus School";
        const tsn = document.getElementById("titlebar-school-name");
        if (tsn) tsn.textContent = identity.name || "Nexus School OS";

        document.getElementById("school-name-input").value = identity.name || "";
        document.getElementById("school-address-input").value = identity.address || "";
        document.getElementById("school-motto-input").value = identity.motto || "";
        document.getElementById("school-signature-input").value = identity.signature || "";
        document.getElementById("theme-primary").value = identity.themePrimary || "#1A237E";
        document.getElementById("theme-secondary").value = identity.themeSecondary || "#00E5FF";
        document.getElementById("primary-hex").textContent = identity.themePrimary || "#1A237E";
        document.getElementById("secondary-hex").textContent = identity.themeSecondary || "#00E5FF";

        const logoPreview = document.getElementById("logo-preview");
        const uploaderContent = document.getElementById("uploader-content");
        if (identity.logoBase64 && logoPreview) {
          logoPreview.src = identity.logoBase64;
          logoPreview.style.display = "block";
          if (uploaderContent) uploaderContent.style.display = "none";
          currentLogoBase64 = identity.logoBase64;
        }

        // Handled at top

        // V2.2 Stamp Settings
        _stampStyle = identity.stampStyle || "none";
        _stampCustomColor = identity.stampCustomColor || null;
        renderStampGallery();

        // Tier Indicator
          const tierBadge = document.getElementById("stamp-tier-badge");
          if (tierBadge) {
            tierBadge.textContent = _schoolTier;
            tierBadge.style.color = (_schoolTier === "Gold" || _schoolTier === "Diamond") ? "#ffd700" : "#00E5FF";
          }
        } catch (err) {
          console.error("[Identity] Failed to apply rebranding:", err);
        }

        const hex = identity.themePrimary || "#1A237E";
        let r = 26, g = 35, b = 126;
        if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
          let c = hex.substring(1).split("");
          if (c.length === 3) c = [c[0], c[0], c[1], c[1], c[2], c[2]];
          c = "0x" + c.join("");
          r = (c >> 16) & 255;
          g = (c >> 8) & 255;
          b = c & 255;
        }
        document.documentElement.style.setProperty("--primary-rgb", `${r}, ${g}, ${b}`);

        const logo = document.getElementById("sidebar-logo");
        if (logo) {
          if (identity.logoBase64) {
            logo.innerHTML = `<img src="${identity.logoBase64}" style="width:100%;height:100%;object-fit:contain;border-radius:10px;">`;
          } else {
            logo.innerHTML = identity.name ? identity.name.charAt(0).toUpperCase() : "N";
          }
        }
      }

      async function renderStampGallery() {
        const gallery = document.getElementById("stamp-gallery");
        const colorList = document.getElementById("stamp-color-swatches");
        if (!gallery) return;

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
             const color = _stampCustomColor || (_schoolTier === "Silver" ? "#0D47A1" : _currentIdentity.themePrimary);
             const preview = await window.electronAPI.getStampPreview({ style: s.id, color });
             opt.innerHTML = `<img src="${preview}" class="stamp-template-preview" /><span class="stamp-option-label">${s.label}</span>`;
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
          { id: "primary", color: _currentIdentity.themePrimary },
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
  if (file.type !== "image/png" && file.type !== "image/jpeg") {
    alert("PNG or JPEG only.");
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    currentLogoBase64 = e.target.result;
    const logoPreview = document.getElementById("logo-preview");
    const uploaderContent = document.getElementById("uploader-content");
    if (logoPreview) {
      logoPreview.src = currentLogoBase64;
      logoPreview.style.display = "block";
    }
    if (uploaderContent) {
      uploaderContent.style.display = "none";
    }
  };
  reader.readAsDataURL(file);
}

function initSettingsListeners() {
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

  if (logoDropzone && logoUpload) {
    logoDropzone.onclick = () => logoUpload.click();
    logoUpload.onchange = (e) => {
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
      if (e.dataTransfer.files?.[0]) handleLogoFile(e.dataTransfer.files[0]);
    };
  }

  const saveIdentityBtn = document.getElementById("save-identity-btn");
  if (saveIdentityBtn) {
    saveIdentityBtn.onclick = async () => {
      const btn = document.getElementById("save-identity-btn");
      btn.textContent = "Saving…";
      const identity = {
        name: document.getElementById("school-name-input").value.trim(),
        address: document.getElementById("school-address-input").value.trim(),
        motto: document.getElementById("school-motto-input").value.trim(),
        signature: document.getElementById("school-signature-input").value.trim(),
        themePrimary: document.getElementById("theme-primary").value,
        themeSecondary: document.getElementById("theme-secondary").value,
        logoBase64: currentLogoBase64,
        stampStyle: _stampStyle,
        stampCustomColor: _stampCustomColor,
        principalSignBase64: _principalSignBase64 || undefined,
      };
      if (window.electronAPI.saveIdentity) {
        const res = await window.electronAPI.saveIdentity(identity);
        if (res && res.ok) {
          applyIdentityToUI(res.identity);
          btn.textContent = "✅ Saved!";
        } else {
          btn.textContent = "❌ Error";
          console.error("[Identity] Save failed:", res?.error);
        }
        setTimeout(() => {
          btn.textContent = "Save Identity Shard";
        }, 1500);
      }
    };
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
