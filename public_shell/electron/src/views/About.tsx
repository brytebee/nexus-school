import React, { useState, useEffect } from 'react';
import { useLicense } from '../hooks/useLicense';
import { VersionUpdateModal, type VersionUpdateInfo } from '../components/VersionUpdateModal';

interface AboutProps {
  onTabChange: (tab: string) => void;
}

interface UpToDateModalProps {
  version: string;
  onClose: () => void;
}

export function UpToDateModal({ version, onClose }: UpToDateModalProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          background: 'linear-gradient(145deg, rgba(16, 24, 38, 0.98), rgba(8, 14, 24, 0.98))',
          border: '1px solid rgba(0, 229, 255, 0.25)',
          borderRadius: '20px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.7), 0 0 40px rgba(0, 229, 255, 0.1)',
          padding: '28px',
          color: '#fff',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'none',
            border: 'none',
            color: 'var(--text-dim, #888)',
            fontSize: '20px',
            cursor: 'pointer',
            padding: '4px',
            lineHeight: 1,
          }}
          aria-label="Close"
        >
          ×
        </button>

        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(0, 230, 118, 0.2) 0%, rgba(0, 230, 118, 0.05) 70%)',
              border: '2px solid rgba(0, 230, 118, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '28px',
              margin: '0 auto 16px auto',
              boxShadow: '0 0 24px rgba(0, 230, 118, 0.25)',
            }}
          >
            ✅
          </div>
          <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 6px 0', color: '#fff' }}>
            Nexus School OS is Up to Date
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-dim, #8899aa)', margin: 0 }}>
            Version <strong style={{ color: 'var(--accent, #00e5ff)' }}>v{version}</strong> is currently the newest available release.
          </p>
        </div>

        <div
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            padding: '14px 16px',
            fontSize: '12px',
            color: 'var(--text-dim, #8899aa)',
            marginBottom: '22px',
            lineHeight: '1.6',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span>Release Channel:</span>
            <span style={{ color: '#fff', fontWeight: 600 }}>Academic Workstation ERP</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span>Channel Status:</span>
            <span style={{ color: '#00e676', fontWeight: 600 }}>Latest Verified Build</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Checked:</span>
            <span style={{ color: '#fff' }}>Just now</span>
          </div>
        </div>

        <button
          onClick={onClose}
          style={{
            width: '100%',
            padding: '10px 16px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, rgba(0, 229, 255, 0.2), rgba(0, 229, 255, 0.1))',
            border: '1px solid rgba(0, 229, 255, 0.4)',
            color: '#fff',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
}

export function About({ onTabChange }: AboutProps) {
  const { license, loading, importLicenseFile } = useLicense();
  const [licenseActionStatus, setLicenseActionStatus] = useState<'idle' | 'importing' | 'success' | 'error'>('idle');
  const [licenseActionMsg, setLicenseActionMsg] = useState('');
  const [enrolledCount, setEnrolledCount] = useState<number | null>(null);
  const [appVersion, setAppVersion] = useState('1.2.01');
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<VersionUpdateInfo | null>(null);
  const [showUpToDate, setShowUpToDate] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const handleCheckForUpdate = async () => {
    setIsCheckingUpdate(true);
    setUpdateError(null);
    try {
      const api = (window as any).electronAPI || (window as any).nexusAPI;
      if (api?.invoke) {
        const updateRes = await api.invoke('system:check-version-update');
        if (updateRes && updateRes.has_update) {
          setAvailableUpdate(updateRes);
        } else {
          setShowUpToDate(true);
        }
      } else {
        setUpdateError('Desktop API bridge unavailable.');
      }
    } catch (err: any) {
      console.warn('[About] Check update failed:', err);
      setUpdateError('Unable to check for updates. Please check your internet connection.');
    } finally {
      setIsCheckingUpdate(false);
    }
  };

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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
              <div>
                Version: <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{appVersion}</span>
              </div>
              <button
                id="about-check-update-btn"
                onClick={handleCheckForUpdate}
                disabled={isCheckingUpdate}
                style={{
                  padding: '3px 10px',
                  borderRadius: '6px',
                  background: isCheckingUpdate ? 'rgba(0, 229, 255, 0.15)' : 'rgba(0, 229, 255, 0.08)',
                  border: '1px solid rgba(0, 229, 255, 0.3)',
                  color: 'var(--accent)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: isCheckingUpdate ? 'wait' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s ease',
                }}
                title="Check for software updates"
              >
                {isCheckingUpdate ? (
                  <>
                    <span
                      style={{
                        width: '9px',
                        height: '9px',
                        border: '1.5px solid var(--accent)',
                        borderTopColor: 'transparent',
                        borderRadius: '50%',
                        display: 'inline-block',
                        animation: 'spin 0.8s linear infinite',
                      }}
                    />
                    Checking…
                  </>
                ) : (
                  <>🔄 Check for Update</>
                )}
              </button>
            </div>
            {updateError && (
              <div style={{ color: '#ff5252', fontSize: '11px', lineHeight: 1.4, marginTop: '2px' }}>
                ⚠️ {updateError}
              </div>
            )}
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

      {/* ── Update Modals ── */}
      {availableUpdate && (
        <VersionUpdateModal
          update={availableUpdate}
          onClose={() => setAvailableUpdate(null)}
        />
      )}

      {showUpToDate && (
        <UpToDateModal
          version={appVersion}
          onClose={() => setShowUpToDate(false)}
        />
      )}
    </div>
  );
}

export default About;
