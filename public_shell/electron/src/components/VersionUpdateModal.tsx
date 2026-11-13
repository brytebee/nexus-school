import React, { useState } from 'react';

export interface VersionUpdateInfo {
  has_update: boolean;
  current_version: string;
  latest_version: string;
  release_name?: string;
  release_date?: string;
  release_notes?: string[];
  download_url_mac_arm64?: string;
  download_url_mac_x64?: string;
  download_url_mac?: string;
  download_url_win?: string;
  download_url_linux?: string;
  is_critical?: boolean;
}

interface VersionUpdateModalProps {
  update: VersionUpdateInfo;
  onClose: () => void;
}

export function VersionUpdateModal({ update, onClose }: VersionUpdateModalProps) {
  const [isApplying, setIsApplying] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleDownloadNow = async () => {
    setIsApplying(true);
    setErrorMessage('');
    setStatusMessage('Launching installer download in your default browser…');

    try {
      if ((window as any).electronAPI?.invoke) {
        const res = await (window as any).electronAPI.invoke('system:apply-update');
        if (res?.ok) {
          setTimeout(() => {
            setIsApplying(false);
            onClose();
          }, 800);
        } else {
          setIsApplying(false);
          setErrorMessage(res?.error || 'Failed to trigger download.');
        }
      } else {
        // Fallback direct release URL
        const fallbackUrl = update.download_url_mac_arm64 || update.download_url_mac || 'https://github.com/brytebee/nexus-school-releases/releases';
        window.open(fallbackUrl, '_blank');
        setIsApplying(false);
        onClose();
      }
    } catch (err: any) {
      setIsApplying(false);
      setErrorMessage(err.message || 'Unexpected download error.');
    }
  };

  const handleSnoozeHour = () => {
    // Snooze for 1 hour
    const oneHour = Date.now() + 60 * 60 * 1000;
    try {
      localStorage.setItem('nexus_update_snoozed_until', String(oneHour));
    } catch (_) {}
    onClose();
  };

  const handleSnoozeDay = () => {
    // Snooze for 24 hours
    const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
    try {
      localStorage.setItem('nexus_update_snoozed_until', String(tomorrow));
    } catch (_) {}
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(5, 7, 18, 0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '24px',
        animation: 'fadeIn 0.25s ease-out forwards',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
        @keyframes pulseDot { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.1); } }
      `}</style>

      <div
        style={{
          width: '100%',
          maxWidth: '560px',
          background: '#0d1235',
          border: '1px solid rgba(0, 229, 255, 0.25)',
          borderRadius: '24px',
          padding: '32px',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.75), 0 0 40px rgba(0, 229, 255, 0.08)',
          color: '#fff',
          position: 'relative',
        }}
      >
        {/* Close button */}
        {!isApplying && (
          <button
            onClick={handleSnoozeHour}
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              background: 'transparent',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.4)',
              fontSize: '22px',
              cursor: 'pointer',
              lineHeight: 1,
            }}
            title="Remind me later"
          >
            &times;
          </button>
        )}

        {/* Header Icon + Titles */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '20px' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '14px',
              background: 'rgba(0, 229, 255, 0.12)',
              border: '1px solid rgba(0, 229, 255, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              flexShrink: 0,
            }}
          >
            🚀
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#fff' }}>
                System Update Available
              </h3>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#00e5ff',
                  background: 'rgba(0, 229, 255, 0.1)',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  border: '1px solid rgba(0, 229, 255, 0.2)',
                }}
              >
                v{update.latest_version}
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'rgba(255, 255, 255, 0.55)', lineHeight: 1.5 }}>
              A new build of Nexus School OS is ready. Upgrade to receive the latest academic suite features and security enhancements.
            </p>
          </div>
        </div>

        {/* Version compare pills */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            padding: '12px 18px',
            marginBottom: '20px',
            fontSize: '12px',
          }}
        >
          <div>
            <span style={{ color: 'rgba(255, 255, 255, 0.45)', display: 'block', fontSize: '10.5px' }}>Current Version</span>
            <span style={{ fontWeight: 600, color: '#94a3b8' }}>v{update.current_version || '1.2.01'}</span>
          </div>
          <div style={{ color: 'rgba(255, 255, 255, 0.3)', fontSize: '16px' }}>➔</div>
          <div>
            <span style={{ color: 'rgba(255, 255, 255, 0.45)', display: 'block', fontSize: '10.5px' }}>Target Version</span>
            <span style={{ fontWeight: 700, color: '#00e5ff' }}>v{update.latest_version}</span>
          </div>
          <div>
            <span style={{ color: 'rgba(255, 255, 255, 0.45)', display: 'block', fontSize: '10.5px' }}>Release Date</span>
            <span style={{ fontWeight: 600, color: '#cbd5e1' }}>{update.release_date || 'Today'}</span>
          </div>
        </div>

        {/* Release Notes */}
        <div style={{ marginBottom: '20px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#00e5ff', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '8px' }}>
            What’s New in This Release
          </span>
          <div
            style={{
              background: 'rgba(0, 0, 0, 0.25)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              borderRadius: '12px',
              padding: '14px 16px',
              maxHeight: '140px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            {(update.release_notes && update.release_notes.length > 0
              ? update.release_notes
              : [
                  'Desktop Workstation ERP: Flat 3-Tier Enterprise Suite integration',
                  'Ecosystem feature unlock: All Result Studio templates, Truancy Radar & Fee Shield',
                  'Pre-install Safety: Automated SQLite backup safeguard prior to version upgrades',
                  'Enhanced offline synchronization with Android tablet grade collector',
                ]
            ).map((note, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12px', color: '#e2e8f0', lineHeight: 1.5 }}>
                <span style={{ color: '#00e5ff', fontSize: '13px', lineHeight: 1 }}>•</span>
                <span>{note}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Direct download notice banner */}
        <div
          style={{
            background: 'rgba(0, 230, 118, 0.06)',
            border: '1px solid rgba(0, 230, 118, 0.25)',
            borderRadius: '12px',
            padding: '12px 16px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <span style={{ fontSize: '20px', flexShrink: 0 }}>⚡</span>
          <p style={{ margin: 0, fontSize: '11.5px', color: '#e2e8f0', lineHeight: 1.5 }}>
            <strong style={{ color: '#00e5a0' }}>Direct Download:</strong> Your installer downloads in your default browser. You can continue using Nexus School OS without interruption while it downloads.
          </p>
        </div>

        {/* Status / Error feedback */}
        {statusMessage && (
          <div
            style={{
              background: 'rgba(0, 229, 255, 0.1)',
              border: '1px solid rgba(0, 229, 255, 0.3)',
              borderRadius: '8px',
              padding: '10px 14px',
              fontSize: '12px',
              color: '#00e5ff',
              marginBottom: '16px',
              textAlign: 'center',
            }}
          >
            {statusMessage}
          </div>
        )}

        {errorMessage && (
          <div
            style={{
              background: 'rgba(255, 82, 82, 0.1)',
              border: '1px solid rgba(255, 82, 82, 0.3)',
              borderRadius: '8px',
              padding: '10px 14px',
              fontSize: '12px',
              color: '#ff8a80',
              marginBottom: '16px',
              textAlign: 'center',
            }}
          >
            ⚠️ {errorMessage}
          </div>
        )}

        {/* Action Buttons: Not now (1h), Remind me Tomorrow (24h), Download Now */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap', alignItems: 'center' }}>
          {!isApplying && (
            <>
              <button
                onClick={handleSnoozeHour}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: 'rgba(255, 255, 255, 0.65)',
                  padding: '10px 16px',
                  borderRadius: '10px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                title="Notify me again in 1 hour"
              >
                Not now
              </button>

              <button
                onClick={handleSnoozeDay}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255, 255, 255, 0.18)',
                  color: 'rgba(255, 255, 255, 0.8)',
                  padding: '10px 16px',
                  borderRadius: '10px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                title="Snooze update prompt for 24 hours"
              >
                Remind me Tomorrow
              </button>
            </>
          )}

          <button
            onClick={handleDownloadNow}
            disabled={isApplying}
            style={{
              background: isApplying ? 'rgba(0, 229, 255, 0.4)' : 'linear-gradient(135deg, #00e5ff 0%, #00b4d8 100%)',
              border: 'none',
              color: '#000',
              padding: '10px 22px',
              borderRadius: '10px',
              fontSize: '12.5px',
              fontWeight: 800,
              cursor: isApplying ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 16px rgba(0, 229, 255, 0.3)',
            }}
          >
            {isApplying ? (
              <>
                <span style={{ animation: 'pulseDot 1s infinite' }}>⏳</span>
                Opening Download…
              </>
            ) : (
              <>
                <span>🚀</span>
                Download Now
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default VersionUpdateModal;
