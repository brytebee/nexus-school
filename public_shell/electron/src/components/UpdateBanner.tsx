import React, { useState, useEffect } from 'react';

const LS_KEY = 'nexus_update_ready';

export default function UpdateBanner() {
  const [isReady, setIsReady]       = useState(false);
  const [version, setVersion]       = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [upToDate, setUpToDate]     = useState(false); // Gap 3: "You're up to date" toast

  useEffect(() => {
    const api = (window as any).electronAPI?.updater;
    if (!api) return;

    // Gap 5: signal main process renderer is ready so it can re-emit pending update:ready
    api.notifyReady?.();

    // Gap 5: restore from localStorage if banner was visible before a page nav
    const cached = localStorage.getItem(LS_KEY);
    if (cached) {
      try {
        const info = JSON.parse(cached);
        setVersion(info.version || null);
        setIsReady(true);
      } catch {}
    }

    // Gap 2: listen to canonical update:ready only
    api.onUpdateReady?.((info: any) => {
      const ver = info?.version || null;
      setVersion(ver);
      setIsReady(true);
      // Gap 5: persist so banner re-appears after navigation
      localStorage.setItem(LS_KEY, JSON.stringify({ version: ver }));
      console.log('[UpdateBanner] Update ready:', ver);
    });

    // Gap 3: "You're up to date" feedback for manual checks
    api.onNone?.((info: any) => {
      setUpToDate(true);
      setTimeout(() => setUpToDate(false), 4000); // dismiss after 4s
    });

  }, []);

  const handleInstall = async () => {
    if (installing) return;
    setInstalling(true);
    localStorage.removeItem(LS_KEY); // clear so stale banner doesn't re-appear
    try {
      await (window as any).electronAPI?.updater?.install();
    } catch (err) {
      console.error('[UpdateBanner] Install failed:', err);
      setInstalling(false);
    }
  };

  const handleDismiss = () => {
    setIsReady(false);
    // Keep localStorage so it comes back if they restart and update is still pending
  };

  return (
    <>
      {/* ── Up-to-date toast (Gap 3) ── */}
      {upToDate && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            borderRadius: '10px',
            padding: '10px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            zIndex: 9998,
            animation: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1) forwards',
            boxShadow: '0 4px 24px rgba(16,185,129,0.2)',
          }}
        >
          <span style={{ fontSize: '16px' }}>✓</span>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#10b981' }}>
            Nexus School OS is up to date
          </span>
        </div>
      )}

      {/* ── Update ready banner ── */}
      {isReady && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            height: '56px',
            background: 'rgba(11, 15, 25, 0.92)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            borderTop: '1px solid rgba(0, 229, 255, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
            zIndex: 9999,
            boxShadow: '0 -8px 32px rgba(0, 0, 0, 0.4)',
            animation: 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
          }}
        >
          <style>{`
            @keyframes slideUp {
              from { transform: translateY(100%); opacity: 0; }
              to   { transform: translateY(0);    opacity: 1; }
            }
            @keyframes pulseDot {
              0%   { transform: scale(0.9); opacity: 0.6; }
              50%  { transform: scale(1.1); opacity: 1;   }
              100% { transform: scale(0.9); opacity: 0.6; }
            }
          `}</style>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#00E5FF',
                boxShadow: '0 0 8px #00E5FF',
                animation: 'pulseDot 2s infinite ease-in-out',
                flexShrink: 0,
              }}
            />
            <div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>
                {/* Gap: show version number in banner */}
                {version
                  ? `Nexus School OS v${version} is ready to install!`
                  : 'A new version of Nexus School OS is ready to install!'}
              </span>
              <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '8px' }}>
                Restart the app to apply the update.
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={handleDismiss}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#64748b',
                fontSize: '12px',
                cursor: 'pointer',
                padding: '6px 12px',
                borderRadius: '6px',
                transition: 'color 0.2s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#cbd5e1')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
            >
              Later
            </button>
            <button
              id="btn-update-install"
              onClick={handleInstall}
              disabled={installing}
              style={{
                background: 'linear-gradient(135deg, #00E5FF 0%, #1A237E 100%)',
                border: '1px solid rgba(0, 229, 255, 0.4)',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 700,
                cursor: installing ? 'not-allowed' : 'pointer',
                padding: '8px 18px',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0, 229, 255, 0.2)',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                opacity: installing ? 0.7 : 1,
              }}
              onMouseEnter={(e) => {
                if (!installing) {
                  e.currentTarget.style.transform = 'scale(1.03)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 229, 255, 0.4)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 229, 255, 0.2)';
              }}
            >
              {installing ? 'Restarting…' : 'Restart & Update →'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
