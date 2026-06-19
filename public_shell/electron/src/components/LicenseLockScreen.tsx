import React, { useEffect } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────
export type LockReason =
  | 'no_license'
  | 'expired'
  | 'tampered'
  | 'hardware_mismatch'
  | 'clock_rollback'
  | 'invalid_tier'
  | 'server_revoked';

interface LockConfig {
  icon: string;
  title: string;
  subtitle: string;
  body: string;
  accentColor: string;
  glowColor: string;
  ctaType: 'renew' | 'support' | 'both';
}

const LOCK_CONFIGS: Record<LockReason, LockConfig> = {
  no_license: {
    icon: '🔑',
    title: 'No License Found',
    subtitle: 'Activation Required',
    body: 'Nexus School OS requires a valid license to run. Purchase or import your license.nexus file to get started.',
    accentColor: '#3b82f6',
    glowColor: 'rgba(59,130,246,0.3)',
    ctaType: 'renew',
  },
  expired: {
    icon: '📅',
    title: 'License Expired',
    subtitle: 'Subscription Ended',
    body: 'Your current subscription term has ended. Renew your plan online to restore full access immediately.',
    accentColor: '#f59e0b',
    glowColor: 'rgba(245,158,11,0.3)',
    ctaType: 'renew',
  },
  tampered: {
    icon: '⛔',
    title: 'License Tampered',
    subtitle: 'Integrity Check Failed',
    body: 'Your license file has been modified or corrupted. Import a fresh copy from the Nexus portal to continue.',
    accentColor: '#ef4444',
    glowColor: 'rgba(239,68,68,0.35)',
    ctaType: 'both',
  },
  hardware_mismatch: {
    icon: '💻',
    title: 'Device Mismatch',
    subtitle: 'License Bound Elsewhere',
    body: 'This license is registered to a different computer. Contact support to transfer your license to this device.',
    accentColor: '#8b5cf6',
    glowColor: 'rgba(139,92,246,0.3)',
    ctaType: 'support',
  },
  clock_rollback: {
    icon: '🕐',
    title: 'Clock Tampering Detected',
    subtitle: 'System Time Anomaly',
    body: 'Your system clock appears to have been rolled back. Correct your system date and time, then restart the application.',
    accentColor: '#f97316',
    glowColor: 'rgba(249,115,22,0.3)',
    ctaType: 'support',
  },
  invalid_tier: {
    icon: '🚨',
    title: 'Invalid License Tier',
    subtitle: 'Possible Tampering Detected',
    body: 'This license contains an unrecognised tier value. This may indicate an attempt to tamper with your license. Contact support immediately.',
    accentColor: '#ef4444',
    glowColor: 'rgba(239,68,68,0.4)',
    ctaType: 'support',
  },
  server_revoked: {
    icon: '🔐',
    title: 'License Revoked',
    subtitle: 'Server Verification Failed',
    body: 'Your license has been flagged or revoked by the Nexus license server. Contact support to investigate and restore access.',
    accentColor: '#ef4444',
    glowColor: 'rgba(239,68,68,0.35)',
    ctaType: 'support',
  },
};

// ── Inject animation keyframes once ─────────────────────────────────────────
function useKeyframes() {
  useEffect(() => {
    const id = 'nexus-lock-keyframes';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      @keyframes nexus-ping {
        0%  { transform: scale(1);   opacity: 0.35; }
        75% { transform: scale(1.6); opacity: 0; }
        100%{ transform: scale(1.6); opacity: 0; }
      }
      @keyframes nexus-float {
        from { transform: translateY(0px)   rotate(0deg); }
        to   { transform: translateY(-18px) rotate(8deg); }
      }
      @keyframes nexus-lock-in {
        from { opacity: 0; transform: scale(0.95) translateY(10px); }
        to   { opacity: 1; transform: scale(1)    translateY(0);    }
      }
      @keyframes nexus-overlay-in {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
      @keyframes nexus-dot-pulse {
        0%, 100% { opacity: 1; box-shadow: 0 0 6px currentColor; }
        50%      { opacity: 0.4; box-shadow: none; }
      }
    `;
    document.head.appendChild(style);
  }, []);
}

// ── Floating background particles ────────────────────────────────────────────
function Particles({ color }: { color: string }) {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {Array.from({ length: 22 }).map((_, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            width: `${2 + (i % 3)}px`,
            height: `${2 + (i % 3)}px`,
            borderRadius: '50%',
            background: color,
            opacity: 0.10 + (i % 5) * 0.04,
            left: `${(i * 37 + 11) % 100}%`,
            top: `${(i * 53 + 7) % 100}%`,
            animation: `nexus-float ${6 + (i % 4) * 2}s ease-in-out ${i * 0.4}s infinite alternate`,
          }}
        />
      ))}
    </div>
  );
}

// ── Pulsing icon ring ────────────────────────────────────────────────────────
function IconRing({ icon, accentColor, glowColor }: { icon: string; accentColor: string; glowColor: string }) {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '28px' }}>
      <div style={{
        position: 'absolute', width: '116px', height: '116px', borderRadius: '50%',
        border: `2px solid ${accentColor}`, opacity: 0.3,
        animation: 'nexus-ping 2.2s cubic-bezier(0,0,0.2,1) infinite',
      }} />
      <div style={{
        position: 'absolute', width: '94px', height: '94px', borderRadius: '50%',
        border: `1.5px solid ${accentColor}`, opacity: 0.18,
        animation: 'nexus-ping 2.2s cubic-bezier(0,0,0.2,1) 0.5s infinite',
      }} />
      <div style={{
        width: '78px', height: '78px', borderRadius: '50%',
        background: `radial-gradient(circle at 38% 38%, ${accentColor}28, ${accentColor}08)`,
        border: `1.5px solid ${accentColor}50`,
        boxShadow: `0 0 36px ${glowColor}, inset 0 0 20px ${glowColor}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '34px',
      }}>
        {icon}
      </div>
    </div>
  );
}

// ── CTA section ──────────────────────────────────────────────────────────────
function CTAButtons({ ctaType, accentColor }: { ctaType: LockConfig['ctaType']; accentColor: string }) {
  const renewOnline  = () => (window as any).nexusAPI?.license?.activateOnline?.();
  const importFile   = () => (window as any).nexusAPI?.license?.importFile?.() ?? (window as any).nexusImportLicense?.();
  const openSupport  = () => (window as any).nexusAPI?.openExternal?.('https://nexusos.com.ng/portal');
  const closeApp     = () => window.close();

  const ghost: React.CSSProperties = {
    width: '100%', padding: '12px 20px', borderRadius: '11px',
    fontSize: '13.5px', fontWeight: 600, cursor: 'pointer',
    background: 'rgba(255,255,255,0.055)',
    color: '#c8d0e0',
    border: '1px solid rgba(255,255,255,0.13)',
    transition: 'background 0.2s',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', width: '100%' }}>

      {/* Renew path */}
      {(ctaType === 'renew' || ctaType === 'both') && <>
        <button id="lock-btn-renew" onClick={renewOnline} style={{
          width: '100%', padding: '13px 20px', borderRadius: '11px',
          fontSize: '14px', fontWeight: 700, cursor: 'pointer', border: 'none',
          background: `linear-gradient(135deg, ${accentColor}dd, ${accentColor})`,
          color: '#fff', boxShadow: `0 4px 22px ${accentColor}44`,
          letterSpacing: '0.02em', transition: 'opacity 0.18s',
        }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.86')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >🌐 Renew Online →</button>

        <button id="lock-btn-import" onClick={importFile} style={ghost}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.10)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.055)')}
        >📁 Import License File</button>
      </>}

      {/* Support path */}
      {(ctaType === 'support' || ctaType === 'both') && (
        <button id="lock-btn-support" onClick={openSupport} style={ghost}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.10)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.055)')}
        >📧 Contact Support</button>
      )}

      {/* Close */}
      <button id="lock-btn-close" onClick={closeApp} style={{
        background: 'transparent', border: 'none', cursor: 'pointer',
        color: 'rgba(255,100,100,0.6)', fontSize: '12px',
        padding: '5px', marginTop: '2px', textDecoration: 'underline',
      }}>Close Application</button>
    </div>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────
interface LicenseLockScreenProps {
  reason: LockReason;
  message?: string;
}

export function LicenseLockScreen({ reason, message }: LicenseLockScreenProps) {
  useKeyframes();
  const cfg = LOCK_CONFIGS[reason] ?? LOCK_CONFIGS.tampered;

  return (
    <div
      id="react-license-lock-overlay"
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(5, 7, 24, 0.97)',
        backdropFilter: 'blur(16px)',
        fontFamily: "'Inter', system-ui, sans-serif",
        animation: 'nexus-overlay-in 0.35s ease forwards',
      }}
    >
      <Particles color={cfg.accentColor} />

      {/* Background glow blob */}
      <div style={{
        position: 'absolute', width: '560px', height: '560px', borderRadius: '50%',
        background: `radial-gradient(circle, ${cfg.glowColor} 0%, transparent 70%)`,
        pointerEvents: 'none', opacity: 0.45,
      }} />

      {/* Card */}
      <div style={{
        position: 'relative', maxWidth: '440px', width: '90%',
        padding: '44px 40px 38px', textAlign: 'center',
        background: 'linear-gradient(160deg, rgba(14,18,48,0.96) 0%, rgba(7,9,26,0.99) 100%)',
        border: `1px solid ${cfg.accentColor}2a`,
        borderRadius: '24px',
        boxShadow: `0 32px 80px rgba(0,0,0,0.72), 0 0 0 1px ${cfg.accentColor}15, inset 0 1px 0 rgba(255,255,255,0.045)`,
        animation: 'nexus-lock-in 0.45s cubic-bezier(0.16,1,0.3,1) 0.08s both',
      }}>
        {/* Top accent line */}
        <div style={{
          position: 'absolute', top: 0, left: '22%', right: '22%', height: '2px',
          background: `linear-gradient(90deg, transparent, ${cfg.accentColor}, transparent)`,
          borderRadius: '0 0 2px 2px',
        }} />

        <IconRing icon={cfg.icon} accentColor={cfg.accentColor} glowColor={cfg.glowColor} />

        {/* Status pill */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '7px',
          background: `${cfg.accentColor}16`, border: `1px solid ${cfg.accentColor}32`,
          borderRadius: '20px', padding: '4px 14px', marginBottom: '16px',
        }}>
          <div style={{
            width: '6px', height: '6px', borderRadius: '50%',
            background: cfg.accentColor,
            color: cfg.accentColor,
            animation: 'nexus-dot-pulse 1.6s ease-in-out infinite',
          }} />
          <span style={{
            color: cfg.accentColor, fontSize: '10.5px', fontWeight: 700,
            letterSpacing: '0.09em', textTransform: 'uppercase',
          }}>
            {cfg.subtitle}
          </span>
        </div>

        {/* Title */}
        <h2 style={{ color: '#fff', fontSize: '22px', fontWeight: 800, margin: '0 0 12px', letterSpacing: '-0.01em', lineHeight: 1.3 }}>
          {cfg.title}
        </h2>

        {/* Body */}
        <p style={{ color: '#7d8899', fontSize: '13.5px', lineHeight: 1.78, margin: 0 }}>
          {message || cfg.body}
        </p>

        {/* Divider */}
        <div style={{
          width: '44px', height: '2.5px', borderRadius: '2px', margin: '22px auto',
          background: `linear-gradient(90deg, transparent, ${cfg.accentColor}, transparent)`,
        }} />

        <CTAButtons ctaType={cfg.ctaType} accentColor={cfg.accentColor} />

        {/* Footer */}
        <p style={{ marginTop: '22px', color: 'rgba(255,255,255,0.12)', fontSize: '10.5px', letterSpacing: '0.06em' }}>
          NEXUS SCHOOL OS · LICENSE ENFORCEMENT
        </p>
      </div>
    </div>
  );
}
