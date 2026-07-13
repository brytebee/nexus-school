import React, { useState, useEffect } from 'react';
import { useLicense } from '../hooks/useLicense';

interface AboutProps {
  onTabChange: (tab: string) => void;
}

export function About({ onTabChange }: AboutProps) {
  const { license, loading, importLicenseFile, activateOnline, refreshLicense } = useLicense();
  const [licenseActionStatus, setLicenseActionStatus] = useState<'idle' | 'importing' | 'activating' | 'success' | 'error'>('idle');
  const [licenseActionMsg, setLicenseActionMsg] = useState('');
  const [enrolledCount, setEnrolledCount] = useState<number | null>(null);

  useEffect(() => {
    // Fetch live enrolled student count on mount
    const fetchCount = async () => {
      try {
        const res = await (window.electronAPI as any)?.students?.getCount?.();
        if (res?.ok) setEnrolledCount(res.count);
      } catch (_) {}
    };
    fetchCount();
  }, []);

  const currentTier = license?.tier || 'Silver';
  const studentCount = license?.student_count || 0;
  const expiresAt = license?.expires_at;
  const hasExplicitExpiry = !!expiresAt;

  const expiryDate = expiresAt ? new Date(expiresAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }) : '';
  const isExpired = hasExplicitExpiry && Date.now() > expiresAt;

  function deriveTermDisplay(terms?: string[]): string {
    if (!terms || terms.length === 0) return 'Term-based license';
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

  let tierIcon = '🥈';
  if (currentTier === 'Standalone') tierIcon = '📦';
  if (currentTier === 'Gold') tierIcon = '🥇';
  if (currentTier === 'Diamond') tierIcon = '💎';

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
            ) : currentTier === 'Standalone' ? (
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
                    📦 Standalone Pack
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
                  <span>Device Slots</span>
                  <span style={{ color: '#fff', fontWeight: 'bold' }}>
                    2 devices max
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
                      color: '#00e5ff',
                      fontWeight: 'bold',
                    }}
                  >
                    Lifetime (Lifetime Owner)
                  </span>
                </div>
              </>
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
                    {enrolledCount !== null ? `${enrolledCount} / ${studentCount}` : `Up to ${studentCount}`} enrolled
                  </span>
                </div>
                {/* Quota progress bar */}
                {studentCount > 0 && enrolledCount !== null && (() => {
                  const pct = Math.min(100, Math.round((enrolledCount / studentCount) * 100));
                  const barColor = pct >= 100 ? '#ff4444' : pct >= 85 ? '#ffaa00' : '#00e676';
                  return (
                    <div style={{ marginBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '12px' }}>
                      <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '6px', height: '6px', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: '6px', transition: 'width 0.4s ease' }} />
                      </div>
                      <div style={{ fontSize: '10px', color: barColor, marginTop: '4px', textAlign: 'right' }}>
                        {pct}% of seat quota used
                      </div>
                    </div>
                  );
                })()}
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
                {/* Buy Seats CTA — shown when at or near the cap */}
                {enrolledCount !== null && studentCount > 0 && enrolledCount >= Math.floor(studentCount * 0.85) && (
                  <button
                    onClick={() => (window.electronAPI as any)?.license?.activateOnline?.()}
                    className="primary-btn"
                    style={{
                      marginTop: '10px',
                      background: enrolledCount >= studentCount
                        ? 'linear-gradient(135deg, #c62828, #ff5252)'
                        : 'linear-gradient(135deg, #e65100, #ff9800)',
                      color: '#fff',
                      boxShadow: 'none',
                      justifyContent: 'center',
                      fontSize: '12px',
                    }}
                  >
                    {enrolledCount >= studentCount ? '🚫 Cap Reached — Buy More Seats' : '⚠️ Nearing Limit — Buy Seats'}
                  </button>
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
          {currentTier === 'Standalone' && (
            <button
              onClick={() => {
                if (window.electronAPI?.openExternal) {
                  window.electronAPI.openExternal('https://nexusos.com.ng/portal');
                }
              }}
              className="primary-btn"
              style={{
                marginTop: '10px',
                background: 'linear-gradient(135deg, #1A237E, #3F51B5)',
                color: '#fff',
                boxShadow: 'none',
                justifyContent: 'center',
              }}
            >
              🚀 Upgrade to a Plan →
            </button>
          )}

          {/* ── In-app License Management ── */}
          <div
            style={{
              marginTop: '14px',
              paddingTop: '14px',
              borderTop: '1px solid rgba(255,255,255,0.07)',
            }}
          >
            <p style={{ fontSize: '10.5px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
              License Key
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
                    setLicenseActionMsg('License imported. Reloading...');
                    setTimeout(() => { refreshLicense(); setLicenseActionStatus('idle'); }, 1800);
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
                  flex: 1, padding: '8px 10px', borderRadius: '8px',
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                  color: '#c8d0e0', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                }}
              >
                📁 Import .nexus File
              </button>
              <button
                id="about-activate-online-btn"
                onClick={async () => {
                  setLicenseActionStatus('activating');
                  setLicenseActionMsg('');
                  await activateOnline();
                  setLicenseActionStatus('idle');
                }}
                disabled={licenseActionStatus !== 'idle'}
                style={{
                  flex: 1, padding: '8px 10px', borderRadius: '8px',
                  background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.2)',
                  color: '#00e5ff', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                }}
              >
                {licenseActionStatus === 'activating' ? '🌐 Opening...' : '🌐 Activate Online'}
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

      {/* ── Upgrade options banner (Conversion Bridge) ── */}
      {currentTier !== 'Diamond' && (
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(0, 229, 255, 0.06), rgba(168, 85, 247, 0.06))',
            border: '1px solid rgba(0, 229, 255, 0.18)',
            borderRadius: '16px',
            padding: '24px',
            marginBottom: '18px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '16px',
            flexWrap: 'wrap'
          }}
        >
          <div>
            <h4 style={{ fontSize: '15px', fontWeight: 700, color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              🚀 Unlock the Full Power of Nexus School OS
            </h4>
            <p style={{ margin: '6px 0 0', fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.5, maxWidth: '600px' }}>
              {currentTier === 'Standalone' ? (
                'You are currently on the Standalone Pack (limited to 2 admin devices, free templates, and entire school scope). Upgrade to the Silver or Gold plan to enable unlimited teacher devices, daily registers, mobile sync allocations, and sovereign parent portal access.'
              ) : (
                'Upgrade your subscription plan to unlock WhatsApp notifications to parents (Nexus Pulse), automated fees payment ledger tracking, computer-based testing (CBT Arena), and AI-generated report card recommendations.'
              )}
            </p>
          </div>
          <button
            onClick={() => {
              if (window.electronAPI?.openExternal) {
                window.electronAPI.openExternal('https://nexusos.com.ng/portal');
              } else {
                window.open('https://nexusos.com.ng/portal', '_blank');
              }
            }}
            className="primary-btn"
            style={{
              background: 'linear-gradient(135deg, #00e5ff, #8b5cf6)',
              color: '#000',
              fontWeight: 700,
              border: 'none',
              padding: '10px 20px',
              borderRadius: '8px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              boxShadow: 'none',
              justifyContent: 'center',
              animation: 'none'
            }}
          >
            {currentTier === 'Gold' ? 'Manage Plan →' : 'Request Upgrade →'}
          </button>
        </div>
      )}

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
