"use strict";
// ══════════════════════════════════════════════════════════════════════════════
// Nexus Pulse — Bot Control & Cloud Bridge UI Controller
// ══════════════════════════════════════════════════════════════════════════════

// ─── One-time listener flag ────────────────────────────────────────────────────
// ipcRenderer.on() stacks callbacks on every navigation; we register only once.
let _statusListenerRegistered = false;
let _cloudListenerRegistered  = false;

// ─── Entry Point (called by showView('pulse')) ─────────────────────────────────
async function initPulseView() {
    console.log("[Pulse UI] Initialising Nexus Pulse view...");

    _wireBotButtons();
    _wireCloudBridge();
    _wireGuardianShieldButtons();

    // Register status listener exactly once across all navigations
    if (!_statusListenerRegistered) {
        _statusListenerRegistered = true;
        window.electronAPI.onPulseStatus(_handleBotStatus);
    }
    if (!_cloudListenerRegistered) {
        _cloudListenerRegistered = true;
        window.electronAPI.pulse.onCloudSynced(() => _onCloudSynced());
        window.electronAPI.pulse.onSyncError((msg) => _onCloudError(msg));
    }

    // Sync current bot state immediately (bot may already be running)
    try {
        const current = await window.electronAPI.pulse.status();
        if (current) _handleBotStatus(current);
    } catch (_) { /* not critical */ }

    // Hydrate Cloud Bridge panel
    await _hydrateCloudStatus();

    // Hydrate Guardian Shield principal phone (lives in view-guardian)
    await _hydratePrincipalPhone();
}

// ─── Bot Button Wiring ─────────────────────────────────────────────────────────
function _wireBotButtons() {
    const btnStart = document.getElementById("btn-start-pulse");
    const btnStop  = document.getElementById("btn-stop-pulse");

    if (btnStart) {
        // Replace to avoid stacking duplicate listeners on re-navigation
        const fresh = btnStart.cloneNode(true);
        btnStart.parentNode.replaceChild(fresh, btnStart);
        fresh.addEventListener("click", () => {
            fresh.disabled    = true;
            fresh.textContent = "Starting…";
            window.electronAPI.pulse.start();
        });
    }

    if (btnStop) {
        const fresh = btnStop.cloneNode(true);
        btnStop.parentNode.replaceChild(fresh, btnStop);
        fresh.addEventListener("click", () => {
            fresh.disabled    = true;
            fresh.textContent = "Stopping…";
            window.electronAPI.pulse.stop();
        });
    }
}

// ─── Bot Status Handler ────────────────────────────────────────────────────────
function _handleBotStatus({ status, data } = {}) {
    const $ = (id) => document.getElementById(id);

    const icon    = $("pulse-icon");
    const text    = $("pulse-status-text");
    const desc    = $("pulse-status-desc");
    const qrBox   = $("pulse-qr-container");
    const btnStart = $("btn-start-pulse");
    const btnStop  = $("btn-stop-pulse");

    // Utility helpers
    const show = (el) => { if (el) el.style.display = ""; };
    const hide = (el) => { if (el) el.style.display = "none"; };
    const set  = (el, val) => { if (el) el.textContent = val; };

    // Reset button states before applying new status
    if (btnStart) { btnStart.disabled = false; }
    if (btnStop)  { btnStop.disabled  = false; }

    switch (status) {
        case "starting":
            set(icon, "⏳");
            set(text, "Initialising Bot…");
            set(desc, "Please wait while the WhatsApp engine starts.");
            hide(qrBox); hide(btnStart); hide(btnStop);
            break;

        case "qr":
            set(icon, "📱");
            set(text, "Scan QR Code");
            set(desc, "Open WhatsApp on the school phone → Linked Devices → Link a Device → Scan code.");
            if (qrBox && data) {
                // data is already a data-URL from QRCode.toDataURL in pulse-bot.js
                qrBox.innerHTML = `<img src="${data}" style="width:220px;height:220px;border-radius:8px;display:block;" alt="WhatsApp QR" />`;
                qrBox.style.display = "block";
            }
            hide(btnStart);
            show(btnStop); set(btnStop, "Cancel");
            break;

        case "authenticated":
            set(icon, "🔐");
            set(text, "Authenticated — Loading…");
            set(desc, "Session verified. The bot will be ready in a moment.");
            hide(qrBox); hide(btnStart);
            show(btnStop); set(btnStop, "Stop Bot");
            break;

        case "ready":
            set(icon, "✅");
            if (text) { text.textContent = "Bot is Online"; text.style.color = "var(--success, #4CAF50)"; }
            set(desc, "Parents can now WhatsApp the school number to check results, attendance & fees.");
            hide(qrBox); hide(btnStart);
            show(btnStop); set(btnStop, "Stop Bot");
            break;

        case "disconnected":
        case "error":
        default:
            set(icon, status === "error" ? "❌" : "🤖");
            if (text) { text.textContent = status === "error" ? "Bot Error" : "Bot is Disconnected"; text.style.color = ""; }
            set(desc, data ? `Error: ${data}` : 'Click "Start Bot" to initialise the WhatsApp engine.');
            hide(qrBox);
            show(btnStart); set(btnStart, "Start Bot");
            hide(btnStop);
            break;
    }
}

// ─── Cloud Bridge Wiring ───────────────────────────────────────────────────────
function _wireCloudBridge() {
    // "Configure" button toggles the credentials form
    const btnConnect = document.getElementById("btn-connect-google");
    const setupForm  = document.getElementById("cloud-setup-form");
    if (btnConnect && setupForm) {
        const fresh = btnConnect.cloneNode(true);
        btnConnect.parentNode.replaceChild(fresh, btnConnect);
        fresh.addEventListener("click", () => {
            setupForm.style.display = setupForm.style.display === "none" ? "block" : "none";
        });
    }

    // Save credentials → open OAuth URL
    const btnSave = document.getElementById("btn-save-google-creds");
    if (btnSave) {
        const fresh = btnSave.cloneNode(true);
        btnSave.parentNode.replaceChild(fresh, btnSave);
        fresh.addEventListener("click", async () => {
            const clientId     = document.getElementById("google-client-id")?.value.trim();
            const clientSecret = document.getElementById("google-client-secret")?.value.trim();
            if (!clientId || !clientSecret) {
                alert("Please enter both Client ID and Client Secret.");
                return;
            }
            fresh.textContent = "Saving…";
            fresh.disabled    = true;
            window.electronAPI.pulse.saveGoogleCreds({ clientId, clientSecret });

            // Give init() time to complete, then fetch the auth URL
            await new Promise(r => setTimeout(r, 1200));
            const url = await window.electronAPI.pulse.getGoogleAuthUrl();
            if (url) {
                // Open in the default system browser via the generic IPC send bridge
                window.electronAPI.send("shell:openExternal", url);
            } else {
                alert("Credentials saved. Restart the app if the auth URL does not open automatically.");
            }
            fresh.textContent = "Save Credentials";
            fresh.disabled    = false;
            if (setupForm) setupForm.style.display = "none";
            await _hydrateCloudStatus();
        });
    }

    // Sync Now
    const btnSync = document.getElementById("btn-trigger-sync");
    if (btnSync) {
        const fresh = btnSync.cloneNode(true);
        btnSync.parentNode.replaceChild(fresh, btnSync);
        fresh.addEventListener("click", () => {
            fresh.textContent = "Syncing…";
            fresh.disabled    = true;
            window.electronAPI.pulse.triggerSync();
            setTimeout(() => { fresh.textContent = "Sync Now"; fresh.disabled = false; }, 5000);
        });
    }

    // Copy Security Key
    _wireCopyButton("btn-copy-security-key", "pulse-security-key");
    // Copy Refresh Token
    _wireCopyButton("btn-copy-refresh-token", "pulse-refresh-token");
}

function _wireCopyButton(btnId, sourceId) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn);
    fresh.addEventListener("click", () => {
        const el  = document.getElementById(sourceId);
        const val = el?.dataset.fullToken || el?.textContent || "";
        if (!val) return;
        navigator.clipboard.writeText(val).then(() => {
            const orig = fresh.textContent;
            fresh.textContent = "Copied ✓";
            setTimeout(() => { fresh.textContent = orig; }, 1500);
        });
    });
}

// ─── Cloud Event Callbacks ─────────────────────────────────────────────────────
function _onCloudSynced() {
    const el = document.getElementById("cloud-sync-status");
    if (el) { el.textContent = "Synced ✓"; el.style.color = "var(--success, #4CAF50)"; }
}

function _onCloudError(message) {
    const el = document.getElementById("cloud-sync-status");
    if (el) { el.textContent = `Error: ${message}`; el.style.color = "var(--danger, #ff4444)"; }
}

// ─── Cloud Status Hydration ────────────────────────────────────────────────────
async function _hydrateCloudStatus() {
    const bridge = document.getElementById("pulse-cloud-bridge");
    if (bridge) bridge.style.display = "block"; // Always visible; server gates by tier

    try {
        const cs       = await window.electronAPI.pulse.getCloudStatus();
        const statusEl = document.getElementById("cloud-sync-status");
        const syncBtn  = document.getElementById("btn-trigger-sync");
        const keyPanel = document.getElementById("cloud-key-panel");
        const keyEl    = document.getElementById("pulse-security-key");
        const tokWrap  = document.getElementById("refresh-token-wrapper");
        const tokEl    = document.getElementById("pulse-refresh-token");

        // Connection status badge
        if (statusEl) {
            if (cs.isConfigured && cs.refreshToken) {
                statusEl.textContent = "Connected";
                statusEl.style.color = "var(--success, #4CAF50)";
                if (syncBtn) syncBtn.style.display = "";
            } else if (cs.isConfigured) {
                statusEl.textContent = "Authorisation Required";
                statusEl.style.color = "var(--warning, #FFA726)";
            } else {
                statusEl.textContent = "Not Configured";
                statusEl.style.color = "var(--danger, #ff4444)";
            }
        }

        // Security key display (masked)
        if (keyPanel && cs.securityKey) {
            keyPanel.style.display = "block";
            if (keyEl) {
                keyEl.dataset.fullToken = cs.securityKey;
                keyEl.textContent = cs.securityKey.slice(0, 14) + "••••••••••••••••••";
            }
        }

        // Refresh token display (masked)
        if (tokWrap && tokEl && cs.refreshToken) {
            tokWrap.style.display = "block";
            tokEl.dataset.fullToken = cs.refreshToken;
            tokEl.textContent = cs.refreshToken.slice(0, 14) + "••••••••••••••••••";
        }
    } catch (err) {
        console.error("[Pulse UI] Cloud status hydration failed:", err);
    }
}

// ─── Guardian Shield Buttons ───────────────────────────────────────────────────
function _wireGuardianShieldButtons() {
    // Fee Recovery Pulse button (in view-guardian's Financial Recovery card)
    const btnFeeRecovery = document.getElementById("btn-trigger-fee-pulse");
    if (btnFeeRecovery) {
        const fresh = btnFeeRecovery.cloneNode(true);
        btnFeeRecovery.parentNode?.replaceChild(fresh, btnFeeRecovery);
        fresh.addEventListener("click", () => {
            window.electronAPI.send("trigger-fee-reminders");
            fresh.textContent = "Dispatching…";
            fresh.disabled    = true;
            setTimeout(() => { fresh.textContent = "🚀 Trigger Fee Pulse"; fresh.disabled = false; }, 6000);
        });
    }
}

// ─── Principal Phone (Guardian Shield view) ────────────────────────────────────
async function _hydratePrincipalPhone() {
    if (!window.electronAPI?.getIdentity) return;
    try {
        const identity = await window.electronAPI.getIdentity();
        const display  = document.getElementById("pulse-principal-phone-display");
        if (!display) return;
        if (identity?.principalPhone) {
            display.textContent = identity.principalPhone;
            display.style.color = "var(--gold)";
        } else {
            display.textContent = "Not Set — Configure in Settings";
            display.style.color = "var(--text-dim)";
        }
    } catch (err) {
        console.error("[Pulse UI] Principal phone hydration failed:", err);
    }
}
