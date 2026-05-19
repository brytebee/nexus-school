"use strict";

// ══════════════════════════════════════════════════════════════════════════════
// Nexus School OS — Sovereign Portal UI Controller
// The "Nexus Mask" Architecture:
//   - Brand URL  → http://[school].edu.nexus     (displayed everywhere)
//   - Real URL   → http://[LAN-IP]:3002/portal   (encoded in QR code)
//   - mDNS URL   → http://[school].nexus.local   (Bonjour/mDNS discovery)
// ══════════════════════════════════════════════════════════════════════════════

/** Cached portal info so we only fetch once per view session. */
let _portalInfo = null;

/**
 * Derives the brand "Nexus Mask" URL from the school name.
 * @param {string} name  School name (e.g. "Hope Academy")
 * @returns {string}     e.g. "http://hope.edu.nexus"
 */
function _deriveBrandUrl(name) {
    const part = (name || "Nexus").split(" ")[0].toLowerCase().replace(/[^a-z0-9]/g, "");
    return `http://${part}.edu.nexus`;
}

/**
 * Renders a real QR code into #portal-qr-container using the bundled qrcode.min.js.
 * @param {string} url  The real LAN connection URL to encode.
 */
function _renderQR(url) {
    const container = document.getElementById("portal-qr-container");
    if (!container) return;

    // Clear the CSS placeholder
    container.innerHTML = "";

    if (typeof QRCode === "undefined") {
        container.innerHTML = `<p style="color:#888;font-size:11px;padding:10px;">QR lib unavailable</p>`;
        return;
    }

    new QRCode(container, {
        text:          url,
        width:         200,
        height:        200,
        colorDark:     "#000000",
        colorLight:    "#ffffff",
        correctLevel:  QRCode.CorrectLevel.H,
    });
}

/**
 * Main entry point — called by nav.js whenever the Portal view is shown.
 * Fetches portal info from the main process once, then renders everything.
 */
async function initPortalView() {
    try {
        // Fetch from main process (always fresh in case identity changed)
        _portalInfo = await window.electronAPI.portal.getInfo();
    } catch (e) {
        console.error("[Portal UI] Failed to fetch portal info:", e);
        // Graceful degradation: fall back to identity-derived values
        try {
            const identity = await window.electronAPI.getIdentity();
            const name = identity?.name || "Nexus";
            _portalInfo = {
                schoolName: name,
                brandUrl:   _deriveBrandUrl(name),
                realUrl:    "http://localhost:3002/portal",
                mdnsUrl:    null,
                lanIp:      "127.0.0.1",
                port:       3002,
                allIps:     ["127.0.0.1"]
            };
        } catch (_) { return; }
    }

    const { realUrl, mdnsUrl, allIps, port } = _portalInfo;

    // ── Primary URL label ──────────────
    const urlEl = document.getElementById("portal-local-url");
    if (urlEl) urlEl.textContent = realUrl;

    // ── mDNS discovery label ───────────────────────────────────────────────────
    const mdnsEl = document.getElementById("portal-mdns-url");
    if (mdnsEl) {
        mdnsEl.textContent = mdnsUrl || "Not supported on this network";
    }

    // ── Render IP Chips ─────────────────────────────────────────────────────────
    const ipListEl = document.getElementById("portal-ip-list");
    if (ipListEl && Array.isArray(allIps)) {
        ipListEl.innerHTML = "";
        allIps.forEach((ip, idx) => {
            const isPrimary = (idx === 0);
            const chipUrl = `http://${ip}:${port}/portal`;
            const chip = document.createElement("div");
            chip.className = `portal-ip-chip ${isPrimary ? "primary" : ""}`;
            chip.innerHTML = `<span>${ip}</span>`;
            chip.onclick = () => {
                // Change primary URL and QR code on tap
                if (urlEl) urlEl.textContent = chipUrl;
                _renderQR(chipUrl);
                
                // Update primary style
                Array.from(ipListEl.children).forEach(c => c.classList.remove("primary"));
                chip.classList.add("primary");
                
                // Copy to clipboard
                navigator.clipboard.writeText(chipUrl).catch(()=>{});
                if (typeof showToast === "function") showToast(`Switched & copied: ${ip}`);
            };
            ipListEl.appendChild(chip);
        });
    }

    // ── Real QR code (defaults to the first IP) ───────────────────────────────
    _renderQR(realUrl);

    console.log(`[Portal UI] Primary QR: ${realUrl}`);
}

/**
 * Copies the real working URL to clipboard (the one that actually opens).
 * Shows a toast with the brand name so it feels premium.
 */
function copyPortalLink() {
    const urlEl = document.getElementById("portal-local-url");
    const link = urlEl ? urlEl.textContent : (_portalInfo?.realUrl || "http://localhost:3002/portal");
    navigator.clipboard.writeText(link);

    if (typeof Swal !== "undefined") {
        Swal.fire({
            title:             "Link Copied!",
            html:              `Parents on this network can use this link.`,
            icon:              "success",
            background:        "#0A0E2E",
            color:             "#fff",
            timer:             2500,
            showConfirmButton: false,
            backdrop:          false,
        });
    }
}

/**
 * Opens the portal locally in the default browser for admin preview.
 */
function openLocalPortal() {
    const urlEl = document.getElementById('portal-local-url');
    const url = urlEl ? urlEl.textContent : (_portalInfo?.realUrl || 'http://localhost:3002/portal');
    window.open(url, '_blank');
}

/**
 * Downloads the rendered portal QR code as a PNG image.
 * Uses the canvas element that QRCode.js renders inside #portal-qr-container.
 */
function downloadPortalQR() {
    const container = document.getElementById('portal-qr-container');
    if (!container) return;

    // QRCode.js renders a <canvas> inside the container
    const canvas = container.querySelector('canvas');
    if (!canvas) {
        if (typeof showToast === 'function') showToast('QR code not ready yet.', 'error');
        return;
    }

    // Build a filename using school name
    const schoolName = (_portalInfo?.schoolName || 'Nexus')
        .split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    const filename = `nexus-portal-qr-${schoolName}.png`;

    // Convert canvas → PNG data URL → anchor download
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();

    if (typeof showToast === 'function') showToast(`QR saved as ${filename}`);
}
