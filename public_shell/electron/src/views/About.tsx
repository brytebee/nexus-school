import React, { useState, useEffect } from 'react';
import { useLicense } from '../hooks/useLicense';

interface AboutProps {
  onTabChange: (tab: string) => void;
}

export function About({ onTabChange }: AboutProps) {
  const { license, loading, importLicenseFile } = useLicense();
  const [licenseActionStatus, setLicenseActionStatus] = useState<'idle' | 'importing' | 'success' | 'error'>('idle');
  const [licenseActionMsg, setLicenseActionMsg] = useState('');
  const [enrolledCount, setEnrolledCount] = useState<number | null>(null);
  const [appVersion, setAppVersion] = useState('1.2.01');

  useEffect(() => {
    // Fetch live enrolled student count on mount
    const fetchCount = async () => {
      try {
        const res = await (window.electronAPI as any)?.students?.getCount?.();
        if (res?.ok) setEnrolledCount(res.count);
      } catch (_) {}
    };

    const fetchVersion = async () => {
      try {
        if ((window.electronAPI as any)?.getVersion) {
          const v = await (window.electronAPI as any).getVersion();
          if (v) setAppVersion(v);
        }
      } catch (_) {}
    };

    fetchCount();
    fetchVersion();
  }, []);

  const expiresAt = license?.expires_at;
  const hasExplicitExpiry = !!expiresAt;

  const expiryDate = expiresAt ? new Date(expiresAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }) : '';
  const isExpired = hasExplicitExpiry && Date.now() > expiresAt;

  function deriveTermDisplay(terms?: string[]): string {
    if (!terms || terms.length === 0) return 'Academic Term Subscription';
    const last = terms[terms.length - 1]; // e.g. "2025/2026-T3"
    const parts = last.split('-');
    if (parts.length !== 2) return `Licensed through ${last}`;
    const [session, term] = parts;
    if (term === 'T3') {
      const startYear = parseInt(session.split('/')[0], 10);
      const nextSession = `${startYear + 1}/${startYear + 2}`;
      return `Active through summer · Grace until ~Oct ${startYear + 1} (${nextSession} T1 + 30 days)`;
    }
    return `Valid through ${session} — ${term.replace('T', 'Term ')} (+ 30-day grace)`;
  }

  return (
    <div className="animate-in fade-in duration-300 h-full flex flex-col min-h-0">
      {/* ── View Header ── */}
      <div className="view-header">
        <div>
          <h2 className="view-title">About Nexus School OS</h2>
          <p className="view-sub">
            Workstation engine information, enterprise licensing and architecture.
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
              color: '#888',
              fontFamily: 'monospace',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div>
              Version: <span style={{ color: 'var(--accent)' }}>{appVersion}</span>
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
            <div>
              Local Storage:{' '}
              <span style={{ color: '#4caf50' }}>
                Encrypted SQLite Vault Active
              </span>
            </div>
          </div>
        </div>

        {/* Desktop ERP License card */}
        <div
          style={{
            background: 'rgba(0, 229, 255, 0.03)',
            border: '1px solid rgba(0, 229, 255, 0.2)',
            borderRadius: '16px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ fontSize: '44px', marginBottom: '14px' }}>💎</div>
          <h3 style={{ fontSize: '17px', marginBottom: '8px', color: '#00e5ff' }}>
            Enterprise Desktop ERP
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
              <div>Loading license details…</div>
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
                  <span>License Status</span>
                  <span style={{ color: '#00e5ff', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00e5ff', display: 'inline-block' }} />
                    Desktop ERP Enabled
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
                  <span>Enrolled Students</span>
                  <span style={{ color: '#fff', fontWeight: 'bold' }}>
                    {enrolledCount !== null ? `${enrolledCount} enrolled` : '—'} <span style={{ color: '#4caf50', fontSize: '11px', fontWeight: 'normal' }}>(Unlimited)</span>
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '12px',
                  }}
                >
                  <span>Validity &amp; Term</span>
                  <span
                    style={{
                      color: hasExplicitExpiry ? (isExpired ? '#ff4444' : '#00e5ff') : '#94a3b8',
                      fontWeight: 'bold',
                    }}
                  >
                    {hasExplicitExpiry ? expiryDate : deriveTermDisplay(license?.licensed_terms)}
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
            className="secondary-btn"
            style={{
              marginTop: '16px',
              justifyContent: 'center',
            }}
          >
            ⚙️ Manage School Settings
          </button>

          {/* ── Offline License Import (For air-gapped / offline deployments) ── */}
          <div
            style={{
              marginTop: '14px',
              paddingTop: '14px',
              borderTop: '1px solid rgba(255,255,255,0.07)',
            }}
          >
            <p style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
              Offline Key Management
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                id="about-import-license-btn"
                onClick={async () => {
                  setLicenseActionStatus('importing');
                  setLicenseActionMsg('');
                  const res = await importLicenseFile();
                  if (res?.ok) {
                    setLicenseActionStatus('success');
                    setLicenseActionMsg('License imported. Restarting application...');
                    setTimeout(async () => {
                      try {
                        if ((window.electronAPI as any)?.license?.relaunch) {
                          await (window.electronAPI as any).license.relaunch();
                        } else if ((window.electronAPI as any)?.relaunch) {
                          await (window.electronAPI as any).relaunch();
                        } else if ((window.electronAPI as any)?.invoke) {
                          await (window.electronAPI as any).invoke('app:relaunch');
                        }
                      } catch (_) {}
                    }, 1200);
                  } else if (res?.reason === 'cancelled') {
                    setLicenseActionStatus('idle');
                  } else {
                    setLicenseActionStatus('error');
                    setLicenseActionMsg(res?.reason || 'Import failed.');
                    setTimeout(() => setLicenseActionStatus('idle'), 4000);
                  }
                }}
                disabled={licenseActionStatus !== 'idle'}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: '8px',
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                  color: '#c8d0e0', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                }}
              >
                📁 Import .nexus License File
              </button>
            </div>
            {licenseActionStatus === 'importing' && (
              <p style={{ color: '#00e5ff', fontSize: '11px', marginTop: '6px', textAlign: 'center' }}>⏳ Importing license file...</p>
            )}
            {licenseActionStatus === 'success' && (
              <p style={{ color: '#4caf50', fontSize: '11px', marginTop: '6px', textAlign: 'center' }}>✅ {licenseActionMsg}</p>
            )}
            {licenseActionStatus === 'error' && (
              <p style={{ color: '#ff4444', fontSize: '11px', marginTop: '6px', textAlign: 'center' }}>❌ {licenseActionMsg}</p>
            )}
          </div>
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
