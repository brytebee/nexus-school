import React, { useState, useEffect } from 'react';

const api = (window as any).nexusAPI || (window as any).electronAPI;

interface StartupChoiceScreenProps {
  onStartFresh: () => void;
}

export function StartupChoiceScreen({ onStartFresh }: StartupChoiceScreenProps) {
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState('');
  const [schoolName, setSchoolName] = useState('Nexus School OS');

  useEffect(() => {
    // Try to read school identity for branding (may not exist yet on first run)
    api?.getIdentity?.()
      .then((id: any) => { if (id?.school_name) setSchoolName(id.school_name); })
      .catch(() => {});
  }, []);

  const handleRestore = async () => {
    setRestoring(true);
    setRestoreError('');
    try {
      const res = await api?.restoreDatabase?.();
      if (res?.ok === false) {
        setRestoreError(res.error || 'Restore failed. Please try again.');
        setRestoring(false);
      }
      // On success the main process relaunches the app — no further action needed here.
    } catch (err: any) {
      setRestoreError(err?.message || 'Unexpected error during restore.');
      setRestoring(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #050814 0%, #0b1120 50%, #0a0f1e 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 24px',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      position: 'relative',
      overflowY: 'auto',
      overflowX: 'hidden',
      boxSizing: 'border-box',
    }}>
      {/* Ambient glow blobs */}
      <div style={{
        position: 'absolute', top: '-120px', left: '-120px',
        width: '360px', height: '360px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0,100,255,0.12) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: '-100px', right: '-100px',
        width: '320px', height: '320px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(100,0,255,0.10) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Logo / Brand */}
      <div style={{ textAlign: 'center', marginBottom: '48px', zIndex: 1 }}>
        <div style={{ fontSize: '52px', marginBottom: '14px' }}>🏫</div>
        <h1 style={{
          fontSize: '26px', fontWeight: 800, color: '#fff',
          margin: 0, letterSpacing: '-0.02em',
        }}>
          {schoolName}
        </h1>
        <p style={{
          marginTop: '8px', fontSize: '13px', color: 'rgba(255,255,255,0.4)',
          fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase',
        }}>
          Powered by Nexus School OS
        </p>
      </div>

      {/* Heading */}
      <div style={{ textAlign: 'center', marginBottom: '36px', zIndex: 1 }}>
        <h2 style={{
          fontSize: '20px', fontWeight: 700, color: '#fff',
          margin: '0 0 8px',
        }}>
          Welcome — How would you like to begin?
        </h2>
        <p style={{
          fontSize: '13px', color: 'rgba(255,255,255,0.45)',
          margin: 0, maxWidth: '400px',
        }}>
          Set up a fresh school database, or restore a previous backup to continue where you left off.
        </p>
      </div>

      {/* Choice Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '20px',
        width: '100%',
        maxWidth: '640px',
        zIndex: 1,
      }}>
        {/* ── Start Fresh ── */}
        <button
          onClick={onStartFresh}
          style={{
            background: 'linear-gradient(135deg, rgba(0,80,200,0.18) 0%, rgba(0,180,255,0.08) 100%)',
            border: '1px solid rgba(0,150,255,0.35)',
            borderRadius: '20px',
            padding: '32px 28px',
            cursor: 'pointer',
            textAlign: 'left',
            color: '#fff',
            transition: 'all 0.25s ease',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            boxShadow: '0 8px 32px rgba(0,100,255,0.10)',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(0,200,255,0.6)';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 12px 48px rgba(0,150,255,0.22)';
            (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-3px)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(0,150,255,0.35)';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 8px 32px rgba(0,100,255,0.10)';
            (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
          }}
        >
          <div style={{ fontSize: '36px' }}>✨</div>
          <div>
            <div style={{ fontSize: '17px', fontWeight: 700, marginBottom: '6px', color: '#00e5ff' }}>
              Start Fresh
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)', lineHeight: '1.65' }}>
              Create a new school database and complete the initial administrator setup wizard.
            </div>
          </div>
          <div style={{
            marginTop: '4px',
            fontSize: '11px', fontWeight: 600,
            color: '#00e5ff',
            display: 'flex', alignItems: 'center', gap: '5px',
          }}>
            Continue with setup →
          </div>
        </button>

        {/* ── Restore Backup ── */}
        <button
          onClick={handleRestore}
          disabled={restoring}
          style={{
            background: 'linear-gradient(135deg, rgba(60,0,180,0.18) 0%, rgba(180,0,255,0.08) 100%)',
            border: '1px solid rgba(150,0,255,0.35)',
            borderRadius: '20px',
            padding: '32px 28px',
            cursor: restoring ? 'wait' : 'pointer',
            textAlign: 'left',
            color: '#fff',
            transition: 'all 0.25s ease',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            boxShadow: '0 8px 32px rgba(100,0,255,0.10)',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            opacity: restoring ? 0.7 : 1,
          }}
          onMouseEnter={e => {
            if (!restoring) {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(200,100,255,0.6)';
              (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 12px 48px rgba(150,0,255,0.22)';
              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-3px)';
            }
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(150,0,255,0.35)';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 8px 32px rgba(100,0,255,0.10)';
            (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
          }}
        >
          <div style={{ fontSize: '36px' }}>{restoring ? '⏳' : '🗄️'}</div>
          <div>
            <div style={{ fontSize: '17px', fontWeight: 700, marginBottom: '6px', color: '#ce93d8' }}>
              {restoring ? 'Restoring Backup…' : 'Restore from Backup'}
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)', lineHeight: '1.65' }}>
              Select a previous database backup file (.sqlite or .zip) to restore your existing school data.
            </div>
          </div>
          {!restoring && (
            <div style={{
              marginTop: '4px',
              fontSize: '11px', fontWeight: 600,
              color: '#ce93d8',
              display: 'flex', alignItems: 'center', gap: '5px',
            }}>
              Pick backup file →
            </div>
          )}
        </button>
      </div>

      {/* Error message */}
      {restoreError && (
        <div style={{
          marginTop: '20px',
          background: 'rgba(255,82,82,0.12)',
          border: '1px solid rgba(255,82,82,0.35)',
          borderRadius: '12px',
          padding: '12px 20px',
          fontSize: '12px',
          color: '#ff8a80',
          maxWidth: '560px',
          textAlign: 'center',
          zIndex: 1,
        }}>
          ⚠️ {restoreError}
        </div>
      )}

      {/* Footer */}
      <p style={{
        position: 'absolute', bottom: '20px',
        fontSize: '11px', color: 'rgba(255,255,255,0.2)',
        zIndex: 1, margin: 0,
      }}>
        Nexus School OS · Secure Offline-First School Management
      </p>
    </div>
  );
}
