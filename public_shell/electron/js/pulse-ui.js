// public_shell/electron/js/pulse-ui.js

document.addEventListener("DOMContentLoaded", () => {
  const btnStartPulse = document.getElementById("btn-start-pulse");
  const btnStopPulse = document.getElementById("btn-stop-pulse");
  const pulseStatusText = document.getElementById("pulse-status-text");
  const pulseStatusDesc = document.getElementById("pulse-status-desc");
  const pulseQrContainer = document.getElementById("pulse-qr-container");
  const pulseQrCanvas = document.getElementById("pulse-qr-canvas");
  const pulseIcon = document.getElementById("pulse-icon");

  if (!btnStartPulse) return;

  function updateUI(status, data) {
    switch (status) {
      case "disconnected":
        btnStartPulse.style.display = "block";
        btnStopPulse.style.display = "none";
        pulseStatusText.textContent = "Bot is Disconnected";
        pulseStatusText.style.color = "var(--text-bright)";
        pulseStatusDesc.textContent =
          'Click "Start Bot" to initialize the WhatsApp engine. You will need to scan a QR code with the school\'s WhatsApp phone.';
        pulseQrContainer.style.display = "none";
        pulseIcon.textContent = "🤖";
        pulseIcon.style.animation = "none";
        break;
      case "starting":
        btnStartPulse.style.display = "none";
        btnStopPulse.style.display = "block";
        pulseStatusText.textContent = "Initializing WhatsApp Engine...";
        pulseStatusText.style.color = "var(--text-bright)";
        pulseStatusDesc.textContent = "Please wait, generating QR code...";
        pulseQrContainer.style.display = "none";
        pulseIcon.textContent = "⏳";
        pulseIcon.style.animation = "pulse 1.5s infinite ease-in-out";
        break;
      case "qr":
        btnStartPulse.style.display = "none";
        btnStopPulse.style.display = "block";
        pulseStatusText.textContent = "Scan QR Code";
        pulseStatusText.style.color = "#ffd700";
        pulseStatusDesc.textContent =
          "Open WhatsApp on your phone, tap Menu > Linked Devices, and scan this QR code.";

        if (data) {
          pulseQrContainer.style.display = "inline-block";
          const img = new Image();
          img.onload = () => {
            pulseQrCanvas.width = img.width;
            pulseQrCanvas.height = img.height;
            const ctx = pulseQrCanvas.getContext("2d");
            ctx.drawImage(img, 0, 0);
          };
          img.src = data;
        }
        pulseIcon.textContent = "📱";
        pulseIcon.style.animation = "none";
        break;
      case "authenticated":
        pulseStatusText.textContent = "Authentication Successful";
        pulseStatusText.style.color = "#4CAF50";
        pulseStatusDesc.textContent = "Linking your device...";
        pulseQrContainer.style.display = "none";
        pulseIcon.textContent = "✅";
        break;
      case "ready":
        btnStartPulse.style.display = "none";
        btnStopPulse.style.display = "block";
        pulseStatusText.textContent = "Nexus Pulse is Active 🟢";
        pulseStatusText.style.color = "#4CAF50";
        pulseStatusDesc.textContent =
          "The bot is now monitoring incoming messages and automatically replying to parent inquiries.";
        pulseQrContainer.style.display = "none";
        pulseIcon.textContent = "🚀";
        pulseIcon.style.animation = "pulse 2s infinite ease-in-out";
        break;
      case "error":
        btnStartPulse.style.display = "block";
        btnStopPulse.style.display = "none";
        pulseStatusText.textContent = "Connection Error";
        pulseStatusText.style.color = "#ff4d4d";
        pulseStatusDesc.textContent =
          data ||
          "An unknown error occurred. Please try starting the bot again.";
        pulseQrContainer.style.display = "none";
        pulseIcon.textContent = "❌";
        pulseIcon.style.animation = "none";
        break;
    }
  }

  btnStartPulse.addEventListener("click", () => {
    window.electronAPI.pulse.start();
  });

  btnStopPulse.addEventListener("click", () => {
    window.electronAPI.pulse.stop();
  });

  window.electronAPI.onPulseStatus((payload) => {
    updateUI(payload.status, payload.data);
  });

  window.electronAPI.pulse.status().then((payload) => {
    updateUI(payload.status, payload.data);
  });

  // 💎 Turn 2: Always-On Cloud Bridge Logic
  const pulseCloudBridge = document.getElementById("pulse-cloud-bridge");
  const cloudSyncStatus = document.getElementById("cloud-sync-status");
  const btnConnectGoogle = document.getElementById("btn-connect-google");
  const cloudSetupForm = document.getElementById("cloud-setup-form");
  const googleClientId = document.getElementById("google-client-id");
  const googleClientSecret = document.getElementById("google-client-secret");
  const btnSaveGoogleCreds = document.getElementById("btn-save-google-creds");
  const btnTriggerSync = document.getElementById("btn-trigger-sync");
  const cloudKeyPanel = document.getElementById("cloud-key-panel");
  const pulseSecurityKey = document.getElementById("pulse-security-key");
  const btnCopySecurityKey = document.getElementById("btn-copy-security-key");

  async function refreshCloudStatus() {
    const identity = await window.electronAPI.getIdentity();
    // Visible for Diamond, also show to Gold as a teaser but grayed out or with upgrade prompt
    pulseCloudBridge.style.display = "block";

    if (identity.tier !== "Diamond") {
      pulseCloudBridge.style.opacity = "0.5";
      pulseCloudBridge.style.pointerEvents = "none";
      cloudSyncStatus.textContent = "Upgrade to Diamond to Unlock";
      return;
    }

    pulseCloudBridge.style.opacity = "1";
    pulseCloudBridge.style.pointerEvents = "auto";

    const status = await window.electronAPI.pulse.getCloudStatus();

    if (status.isConfigured) {
      cloudSyncStatus.textContent = "Linked to Google Drive 🟢";
      cloudSyncStatus.style.color = "#4CAF50";
      btnConnectGoogle.textContent = "Change Account";
      btnTriggerSync.style.display = "block";
      cloudKeyPanel.style.display = "block";
      pulseSecurityKey.textContent = status.securityKey;
    } else {
      cloudSyncStatus.textContent = "Not Configured";
      cloudSyncStatus.style.color = "var(--danger)";
      btnConnectGoogle.textContent = "Configure";
      btnTriggerSync.style.display = "none";
      cloudKeyPanel.style.display = "none";
    }
  }

  btnConnectGoogle.addEventListener("click", () => {
    if (cloudSetupForm.style.display === "none") {
      cloudSetupForm.style.display = "block";
      btnConnectGoogle.textContent = "Cancel";
    } else {
      cloudSetupForm.style.display = "none";
      btnConnectGoogle.textContent = "Configure";
    }
  });

  btnSaveGoogleCreds.addEventListener("click", async () => {
    const clientId = googleClientId.value.trim();
    const clientSecret = googleClientSecret.value.trim();

    if (!clientId || !clientSecret) {
      alert("Please provide both Client ID and Secret.");
      return;
    }

    window.electronAPI.pulse.saveGoogleCreds({ clientId, clientSecret });
    const authUrl = await window.electronAPI.pulse.getGoogleAuthUrl();
    if (authUrl) {
      window.open(authUrl, "_blank");
    }
    cloudSetupForm.style.display = "none";
    btnConnectGoogle.textContent = "Waiting for Auth...";
  });

  btnTriggerSync.addEventListener("click", () => {
    window.electronAPI.pulse.triggerSync();
    btnTriggerSync.textContent = "Syncing...";
    btnTriggerSync.disabled = true;
    setTimeout(() => {
      btnTriggerSync.textContent = "Sync Now";
      btnTriggerSync.disabled = false;
    }, 3000);
  });

  btnCopySecurityKey.addEventListener("click", () => {
    navigator.clipboard.writeText(pulseSecurityKey.textContent);
    btnCopySecurityKey.textContent = "Copied!";
    setTimeout(() => (btnCopySecurityKey.textContent = "Copy Key"), 2000);
  });

  window.electronAPI.pulse.onCloudSynced(() => {
    refreshCloudStatus();
  });

  window.electronAPI.pulse.onSyncError((message) => {
    alert(message);
    btnTriggerSync.textContent = "Sync Now";
    btnTriggerSync.disabled = false;
  });

  refreshCloudStatus();
});
