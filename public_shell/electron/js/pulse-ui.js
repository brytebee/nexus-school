"use strict";
// ══════════════════════════════════════════════════════════════════════════════
// Nexus Pulse — Bot Control & Cloud Bridge UI Controller
// ══════════════════════════════════════════════════════════════════════════════

// ─── One-time listener flag ────────────────────────────────────────────────────
// ipcRenderer.on() stacks callbacks on every navigation; we register only once.
var _statusListenerRegistered = false;
var _cloudListenerRegistered  = false;

// ─── Entry Point (called by showView('pulse')) ─────────────────────────────────
async function initPulseView() {
    console.log("[Pulse UI] Initialising Nexus Pulse view — tier:", window.currentLicenseTier);

    // ── Tier Gate ────────────────────────────────────────────────────────────
    const tier = window.currentLicenseTier || "Silver";
    const isGold = tier === "Gold" || tier === "Diamond";
    const tierGate = document.getElementById("pulse-tier-gate");
    const botUI    = document.getElementById("pulse-bot-ui");
    const btnStart = document.getElementById("btn-start-pulse");
    const btnStop  = document.getElementById("btn-stop-pulse");

    if (tierGate) tierGate.style.display = isGold ? "none" : "block";
    if (botUI)    botUI.style.display    = isGold ? ""     : "none";
    if (btnStart) btnStart.style.display = isGold ? ""     : "none";
    if (btnStop)  btnStop.style.display  = "none"; // always hidden until bot starts

    if (!isGold) {
        console.log("[Pulse UI] Gold tier required — bot controls hidden.");
        return; // no further wiring needed
    }

    _wireBotButtons();
    _wireCloudBridge();
    _wireGuardianShieldButtons();
    _wireSettingsPanel();

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

    // Hydrate Guardian Shield principal phone
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
    if (window.currentLicenseTier !== "Diamond") {
        console.log("[Pulse UI] Cloud Bridge wiring skipped: Diamond tier required.");
        return;
    }
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
    if (!bridge) return;

    // Always make the section visible — the tier check decides what it shows.
    bridge.style.display = "block";

    if (window.currentLicenseTier !== "Diamond") {
        bridge.innerHTML = `
            <div class="empty-state" style="padding: 30px; text-align: center; border: 1px dashed var(--border);">
                <span style="font-size: 32px; margin-bottom: 15px; display: block;">💎</span>
                <h3 style="color: var(--text);">Diamond Tier Required</h3>
                <p style="color: var(--text-dim); margin: 10px 0 20px; font-size: 13px; max-width: 300px; margin-left: auto; margin-right: auto;">
                    The Always-On Cloud Bridge allows Nexus to answer parent queries 24/7 via Vercel even when your laptop is turned off.
                </p>
                <div style="font-size: 11px; background: rgba(0,229,255,0.1); color: var(--accent); display: inline-block; padding: 4px 10px; border-radius: 12px;">
                    Upgrade to Diamond to unlock
                </div>
            </div>
        `;
        return;
    }

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

// ─── Settings Panel Wiring ─────────────────────────────────────────────────────
function _wireSettingsPanel() {
    // Phone save
    const btnSavePhone = document.getElementById("btn-pulse-phone-save");
    if (btnSavePhone) {
        const fresh = btnSavePhone.cloneNode(true);
        btnSavePhone.parentNode.replaceChild(fresh, btnSavePhone);
        fresh.addEventListener("click", async () => {
            const phone = document.getElementById("principal-phone-pulse")?.value.trim() || "";
            if (!phone) { alert("Please enter a phone number."); return; }
            fresh.textContent = "Saving…"; fresh.disabled = true;
            try {
                const identity = await window.electronAPI.getIdentity() || {};
                identity.principalPhone = phone;
                const res = await window.electronAPI.saveIdentity(identity);
                if (res?.ok) {
                    fresh.textContent = "✅ Saved!";
                    // update guardian shield display too
                    const disp = document.getElementById("pulse-principal-phone-display");
                    if (disp) { disp.textContent = phone; disp.style.color = "var(--gold)"; }
                } else {
                    fresh.textContent = "❌ Error";
                }
            } catch (e) {
                console.error("[Pulse Settings] Phone save failed:", e);
                fresh.textContent = "❌ Error";
            } finally {
                fresh.disabled = false;
                setTimeout(() => { fresh.textContent = "Save Phone"; }, 1500);
            }
        });
    }

    // Autostart toggle — read current state from app_settings via identity workaround
    const toggle = document.getElementById("pulse-autostart-toggle");
    if (toggle) {
        const stored = localStorage.getItem("nexus_pulse_autostart");
        toggle.checked = stored === "true";
        toggle.addEventListener("change", () => {
            localStorage.setItem("nexus_pulse_autostart", toggle.checked ? "true" : "false");
            window.electronAPI.send?.("pulse:set-autostart", toggle.checked);
        });
    }
}

// ─── Principal Phone (Guardian Shield view) ────────────────────────────────────
async function _hydratePrincipalPhone() {
    if (!window.electronAPI?.getIdentity) return;
    try {
        const identity = await window.electronAPI.getIdentity();
        const phone = identity?.principalPhone || "";

        // Guardian shield display
        const display = document.getElementById("pulse-principal-phone-display");
        if (display) {
            display.textContent = phone || "Not Set — Configure in Settings";
            display.style.color = phone ? "var(--gold)" : "var(--text-dim)";
        }

        // Slide-in settings panel input
        const input = document.getElementById("principal-phone-pulse");
        if (input && phone) input.value = phone;
    } catch (err) {
        console.error("[Pulse UI] Principal phone hydration failed:", err);
    }
}
