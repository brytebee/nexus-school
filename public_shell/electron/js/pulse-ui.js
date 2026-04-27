// public_shell/electron/js/pulse-ui.js

document.addEventListener('DOMContentLoaded', () => {
    const btnStartPulse = document.getElementById('btn-start-pulse');
    const btnStopPulse = document.getElementById('btn-stop-pulse');
    const pulseStatusText = document.getElementById('pulse-status-text');
    const pulseStatusDesc = document.getElementById('pulse-status-desc');
    const pulseQrContainer = document.getElementById('pulse-qr-container');
    const pulseQrCanvas = document.getElementById('pulse-qr-canvas');
    const pulseIcon = document.getElementById('pulse-icon');

    if (!btnStartPulse) return;

    function updateUI(status, data) {
        switch (status) {
            case 'disconnected':
                btnStartPulse.style.display = 'block';
                btnStopPulse.style.display = 'none';
                pulseStatusText.textContent = 'Bot is Disconnected';
                pulseStatusText.style.color = 'var(--text-bright)';
                pulseStatusDesc.textContent = 'Click "Start Bot" to initialize the WhatsApp engine. You will need to scan a QR code with the school\'s WhatsApp phone.';
                pulseQrContainer.style.display = 'none';
                pulseIcon.textContent = '🤖';
                pulseIcon.style.animation = 'none';
                break;
            case 'starting':
                btnStartPulse.style.display = 'none';
                btnStopPulse.style.display = 'block';
                pulseStatusText.textContent = 'Initializing WhatsApp Engine...';
                pulseStatusText.style.color = 'var(--text-bright)';
                pulseStatusDesc.textContent = 'Please wait, generating QR code...';
                pulseQrContainer.style.display = 'none';
                pulseIcon.textContent = '⏳';
                pulseIcon.style.animation = 'pulse 1.5s infinite ease-in-out';
                break;
            case 'qr':
                btnStartPulse.style.display = 'none';
                btnStopPulse.style.display = 'block';
                pulseStatusText.textContent = 'Scan QR Code';
                pulseStatusText.style.color = '#ffd700';
                pulseStatusDesc.textContent = 'Open WhatsApp on your phone, tap Menu > Linked Devices, and scan this QR code.';
                
                if (data) {
                    pulseQrContainer.style.display = 'inline-block';
                    const img = new Image();
                    img.onload = () => {
                        pulseQrCanvas.width = img.width;
                        pulseQrCanvas.height = img.height;
                        const ctx = pulseQrCanvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);
                    };
                    img.src = data;
                }
                pulseIcon.textContent = '📱';
                pulseIcon.style.animation = 'none';
                break;
            case 'authenticated':
                pulseStatusText.textContent = 'Authentication Successful';
                pulseStatusText.style.color = '#4CAF50';
                pulseStatusDesc.textContent = 'Linking your device...';
                pulseQrContainer.style.display = 'none';
                pulseIcon.textContent = '✅';
                break;
            case 'ready':
                btnStartPulse.style.display = 'none';
                btnStopPulse.style.display = 'block';
                pulseStatusText.textContent = 'Nexus Pulse is Active 🟢';
                pulseStatusText.style.color = '#4CAF50';
                pulseStatusDesc.textContent = 'The bot is now monitoring incoming messages and automatically replying to parent inquiries.';
                pulseQrContainer.style.display = 'none';
                pulseIcon.textContent = '🚀';
                pulseIcon.style.animation = 'pulse 2s infinite ease-in-out';
                break;
            case 'error':
                btnStartPulse.style.display = 'block';
                btnStopPulse.style.display = 'none';
                pulseStatusText.textContent = 'Connection Error';
                pulseStatusText.style.color = '#ff4d4d';
                pulseStatusDesc.textContent = data || 'An unknown error occurred. Please try starting the bot again.';
                pulseQrContainer.style.display = 'none';
                pulseIcon.textContent = '❌';
                pulseIcon.style.animation = 'none';
                break;
        }
    }

    btnStartPulse.addEventListener('click', () => {
        window.electronAPI.startPulse();
    });

    btnStopPulse.addEventListener('click', () => {
        window.electronAPI.stopPulse();
    });

    window.electronAPI.onPulseStatus((payload) => {
        updateUI(payload.status, payload.data);
    });

    window.electronAPI.getPulseStatus().then(payload => {
        updateUI(payload.status, payload.data);
    });
});
