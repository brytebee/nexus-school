import React, { useState, useEffect } from 'react';

export default function UpdateBanner() {
  const [isReady, setIsReady] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if ((window as any).electronAPI?.updater?.onUpdateReady) {
      (window as any).electronAPI.updater.onUpdateReady(() => {
        console.log('[UpdateBanner] Update is ready for install');
        setIsReady(true);
      });
    }
  }, []);

  const handleInstall = async () => {
    if (installing) return;
    setInstalling(true);
    try {
      if ((window as any).electronAPI?.updater?.installUpdate) {
        await (window as any).electronAPI.updater.installUpdate();
      }
    } catch (err) {
      console.error('Failed to install update:', err);
      setInstalling(false);
    }
  };

  if (!isReady) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: '56px',
        background: 'rgba(11, 15, 25, 0.85)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderTop: '1px solid rgba(0, 229, 255, 0.2)',
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
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes pulseDot {
          0% { transform: scale(0.9); opacity: 0.6; }
          50% { transform: scale(1.1); opacity: 1; }
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
            animation: 'pulseDot 2s infinite ease-in-out'
          }} 
        />
        <div>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>
            A new version of Nexus School OS is ready to install!
          </span>
          <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '8px' }}>
            Restart the application to apply the changes.
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={() => setIsReady(false)}
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
          onMouseEnter={(e) => e.currentTarget.style.color = '#cbd5e1'}
          onMouseLeave={(e) => e.currentTarget.style.color = '#64748b'}
        >
          Dismiss
        </button>
        <button
          onClick={handleInstall}
          disabled={installing}
          style={{
            background: 'linear-gradient(135deg, #00E5FF 0%, #1A237E 100%)',
            border: '1px solid rgba(0, 229, 255, 0.4)',
            color: '#fff',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            padding: '8px 16px',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0, 229, 255, 0.2)',
            transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.03)';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 229, 255, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 229, 255, 0.2)';
          }}
        >
          {installing ? 'Restarting…' : 'Restart to update →'}
        </button>
      </div>
    </div>
  );
}
