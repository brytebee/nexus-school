import React from 'react';
import { useLicense } from '../hooks/useLicense';

interface AboutProps {
  onTabChange: (tab: string) => void;
}

export function About({ onTabChange }: AboutProps) {
  const { license, loading } = useLicense();

  const currentTier = license?.tier || 'Silver';
  const studentCount = license?.student_count || 0;
  const expiresAt = license?.expires_at || Date.now();

  let tierIcon = '🥈';
  if (currentTier === 'Gold') tierIcon = '🥇';
  if (currentTier === 'Diamond') tierIcon = '💎';

  const expiryDate = new Date(expiresAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const isExpired = Date.now() > expiresAt;

  return (
    <div className="animate-in fade-in duration-300 h-full flex flex-col min-h-0">
      {/* ── View Header ── */}
      <div className="view-header">
        <div>
          <h2 className="view-title">About Nexus School OS</h2>
          <p className="view-sub">
            Application information, license and upgrade options.
          </p>
        </div>
      </div>

      {/* ── Top 2-column grid ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '18px',
          marginBottom: '18px',
        }}
      >
        {/* App info card */}
        <div
          style={{
            background: 'var(--glass)',
            border: '1px solid var(--glass-border)',
            borderRadius: '16px',
            padding: '24px',
          }}
        >
          <div style={{ fontSize: '44px', marginBottom: '14px' }}>🏫</div>
          <h3 style={{ fontSize: '17px', marginBottom: '8px' }}>
            Nexus School OS
          </h3>
          <p
            style={{
              color: 'var(--text-dim)',
              fontSize: '12px',
              lineHeight: '1.7',
              marginBottom: '16px',
            }}
          >
            A secure, offline-first school management system with Ed25519
            cryptographic QR handshake and Android tablet integration for
            grade collection.
          </p>
          <div
            style={{
              fontSize: '12px',
              color: '#666',
              fontFamily: 'monospace',
              display: 'flex',
              flexDirection: 'column',
              gap: '5px',
            }}
          >
            <div>
              Version: <span style={{ color: 'var(--accent)' }}>1.0.0</span>
            </div>
            <div>
              Engine:{' '}
              <span style={{ color: 'var(--accent)' }}>
                Electron + SQLite (better-sqlite3)
              </span>
            </div>
            <div>
              Protocol:{' '}
              <span style={{ color: 'var(--accent)' }}>
                Ed25519 Secure Handshake
              </span>
            </div>
          </div>
        </div>

        {/* Current Plan card */}
        <div
          style={{
            background: 'rgba(255, 215, 0, 0.05)',
            border: '1px solid rgba(255, 215, 0, 0.2)',
            borderRadius: '16px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ fontSize: '44px', marginBottom: '14px' }}>⭐</div>
          <h3 style={{ fontSize: '17px', marginBottom: '8px', color: '#ffd700' }}>
            Current Plan
          </h3>
          <div
            id="about-plan-info"
            style={{
              color: 'var(--text-dim)',
              fontSize: '12px',
              lineHeight: '1.7',
              flex: 1,
            }}
          >
            {loading ? (
              <div>Loading plan info…</div>
            ) : (
              <>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '12px',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    paddingBottom: '12px',
                  }}
                >
                  <span>Active Tier</span>
                  <span style={{ color: '#fff', fontWeight: 'bold' }}>
                    {tierIcon} {currentTier}
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '12px',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    paddingBottom: '12px',
                  }}
                >
                  <span>Student Quota</span>
                  <span style={{ color: '#fff', fontWeight: 'bold' }}>
                    Up to {studentCount}
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '12px',
                  }}
                >
                  <span>Valid Until</span>
                  <span
                    style={{
                      color: isExpired ? '#ff4444' : '#00e5ff',
                      fontWeight: 'bold',
                    }}
                  >
                    {expiryDate}
                  </span>
                </div>
                {isExpired && (
                  <div style={{ color: '#ff4444', marginTop: '8px', fontWeight: 'bold' }}>
                    ⚠️ License Expired
                  </div>
                )}
              </>
            )}
          </div>
          <button
            onClick={() => onTabChange('settings')}
            className="primary-btn"
            style={{
              marginTop: '16px',
              background: 'linear-gradient(135deg, #b8860b, #ffd700)',
              color: '#000',
              boxShadow: 'none',
              justifyContent: 'center',
            }}
          >
            ⚙️ Manage Plan
          </button>
        </div>
      </div>

      {/* ── Security & Architecture card ── */}
      <div
        style={{
          background: 'var(--glass)',
          border: '1px solid var(--glass-border)',
          borderRadius: '16px',
          padding: '22px',
        }}
      >
        <h3
          style={{
            fontSize: '11px',
            color: 'var(--text-dim)',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            marginBottom: '14px',
          }}
        >
          Security &amp; Architecture
        </h3>
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '12px', color: '#4caf50' }}>
            ✅ Ed25519 Signature Active
          </div>
          <div style={{ fontSize: '12px', color: '#4caf50' }}>
            ✅ Local-Only Network (No Internet Required)
          </div>
          <div style={{ fontSize: '12px', color: '#4caf50' }}>
            ✅ SQLite Encrypted Vault
          </div>
          <div style={{ fontSize: '12px', color: '#4caf50' }}>
            ✅ Biometric Lock on Android Tablet
          </div>
          <div style={{ fontSize: '12px', color: '#4caf50' }}>
            ✅ Admin-Dictated Device Identity
          </div>
        </div>
      </div>
    </div>
  );
}

export default About;
