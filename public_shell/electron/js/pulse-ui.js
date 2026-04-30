"use strict";

/**
 * Guardian Shield (Nexus Pulse) UI Controller
 * Manages the status displays for institutional briefings and safety alerts.
 */

async function initPulseView() {
    console.log("[Pulse UI] Initializing Guardian Shield View...");
    
    try {
        const identity = await window.electronAPI.getIdentity();
        const display = document.getElementById("pulse-principal-phone-display");
        
        if (display) {
            if (identity && identity.principalPhone) {
                display.textContent = identity.principalPhone;
                display.style.color = "var(--gold)";
            } else {
                display.textContent = "Not Set (Configure in Settings)";
                display.style.color = "var(--text-dim)";
            }
        }
    } catch (err) {
        console.error("[Pulse UI] Failed to hydrate Guardian Shield view:", err);
    }
}
