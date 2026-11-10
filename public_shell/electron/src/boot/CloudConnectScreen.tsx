import React, { useState } from 'react';

const api = (window as any).nexusAPI || (window as any).electronAPI;

interface CloudConnectScreenProps {
  onBack: () => void;
}

type Step = 'form' | 'loading' | 'success' | 'error';

export function CloudConnectScreen({ onBack }: CloudConnectScreenProps) {
  const [step, setStep] = useState<Step>('form');

  // Form fields
  const [slug, setSlug]           = useState('');
  const [email, setEmail]         = useState('');
  const [pin, setPin]             = useState('');
  const [pinConfirm, setPinConfirm] = useState('');

  // Feedback
  const [errorMsg, setErrorMsg]   = useState('');
  const [seeded, setSeeded]       = useState<{ classes: number; teachers: number; students: number } | null>(null);
  const [schoolName, setSchoolName] = useState('');
  const [loadingLabel, setLoadingLabel] = useState('Connecting to cloud…');

  // ── Validation ─────────────────────────────────────────────────────────────
  const pinPattern = /^\d{4,8}$/;
  const pinMismatch = pin && pinConfirm && pin !== pinConfirm;
  const canSubmit =
    slug.trim().length > 0 &&
    email.trim().length > 0 &&
    pinPattern.test(pin) &&
    pin === pinConfirm;

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleConnect = async () => {
    if (!canSubmit) return;
    setErrorMsg('');
    setStep('loading');
    setLoadingLabel('Connecting to cloud…');

    try {
      // Small UX delay so the loading label is visible
      setTimeout(() => setLoadingLabel('Seeding local database…'), 2500);

      const result = await api.invoke('sync:cloud-connect', {
        slug: slug.trim().toLowerCase(),
        email: email.trim().toLowerCase(),
        pin: pin.trim(),
      });

      if (!result?.ok) {
        setErrorMsg(result?.message || 'Connection failed. Please check your details and try again.');
        setStep('error');
        return;
      }

      setSchoolName(result.school?.name || slug);
      setSeeded(result.seeded || null);
      setStep('success');

      // Auto-advance to lock screen after 2.5 s
      setTimeout(async () => {
        await api.invoke('app:load-lock');
      }, 2500);

    } catch (err: any) {
      setErrorMsg(err?.message || 'Unexpected error. Please try again.');
      setStep('error');
    }
  };

  // ── Shared layout wrapper ──────────────────────────────────────────────────
  const wrap = (children: React.ReactNode) => (
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
      boxSizing: 'border-box',
      color: '#fff',
    }}>
      {/* Ambient blobs */}
      <div style={{
        position: 'absolute', top: '-120px', left: '-120px',
        width: '360px', height: '360px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0,180,80,0.10) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: '-100px', right: '-100px',
        width: '320px', height: '320px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0,255,120,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      {children}
    </div>
  );

  // ── Loading ────────────────────────────────────────────────────────────────
  if (step === 'loading') return wrap(
    <div style={{ textAlign: 'center', zIndex: 1 }}>
      <div style={{ fontSize: '52px', marginBottom: '20px', animation: 'pulse 1.5s ease-in-out infinite' }}>☁️</div>
      <div style={{ fontSize: '20px', fontWeight: 700, marginBottom: '10px', color: '#00e5a0' }}>
        {loadingLabel}
      </div>
      <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>
        This may take a few seconds…
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
    </div>
  );

  // ── Success ────────────────────────────────────────────────────────────────
  if (step === 'success') return wrap(
    <div style={{ textAlign: 'center', zIndex: 1, maxWidth: '480px' }}>
      <div style={{ fontSize: '52px', marginBottom: '16px' }}>🎉</div>
      <div style={{ fontSize: '22px', fontWeight: 800, color: '#00e5a0', marginBottom: '8px' }}>
        Connected!
      </div>
      <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.7)', marginBottom: '24px' }}>
        {schoolName} is ready on this device.
      </div>
      {seeded && (
        <div style={{
          display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap',
          marginBottom: '24px',
        }}>
          {[
            { label: 'Classes', value: seeded.classes, icon: '📚' },
            { label: 'Teachers', value: seeded.teachers, icon: '👩‍🏫' },
            { label: 'Students', value: seeded.students, icon: '🧑‍🎓' },
          ].map(({ label, value, icon }) => (
            <div key={label} style={{
              background: 'rgba(0,229,160,0.08)',
              border: '1px solid rgba(0,229,160,0.25)',
              borderRadius: '12px', padding: '14px 20px', minWidth: '100px',
            }}>
              <div style={{ fontSize: '24px', marginBottom: '4px' }}>{icon}</div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: '#00e5a0' }}>{value}</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>{label}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)' }}>
        Loading login screen…
      </div>
    </div>
  );

  // ── Error ──────────────────────────────────────────────────────────────────
  if (step === 'error') return wrap(
    <div style={{ textAlign: 'center', zIndex: 1, maxWidth: '460px' }}>
      <div style={{ fontSize: '52px', marginBottom: '16px' }}>⚠️</div>
      <div style={{ fontSize: '20px', fontWeight: 700, color: '#ff8a80', marginBottom: '12px' }}>
        Connection Failed
      </div>
      <div style={{
        background: 'rgba(255,82,82,0.10)',
        border: '1px solid rgba(255,82,82,0.30)',
        borderRadius: '12px', padding: '14px 20px',
        fontSize: '13px', color: '#ff8a80', marginBottom: '28px', lineHeight: '1.6',
      }}>
        {errorMsg}
      </div>
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
        <button
          onClick={() => { setStep('form'); setErrorMsg(''); }}
          style={{
            background: 'rgba(0,180,80,0.14)',
            border: '1px solid rgba(0,200,100,0.35)',
            borderRadius: '10px', padding: '10px 24px',
            fontSize: '13px', fontWeight: 600, color: '#00e5a0', cursor: 'pointer',
          }}
        >
          Try Again
        </button>
        <button
          onClick={onBack}
          style={{
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '10px', padding: '10px 24px',
            fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.5)', cursor: 'pointer',
          }}
        >
          ← Back
        </button>
      </div>
    </div>
  );

  // ── Main form ──────────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '10px',
    padding: '11px 14px',
    fontSize: '14px',
    color: '#fff',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: '11px', fontWeight: 600,
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: '0.07em', textTransform: 'uppercase',
    marginBottom: '6px', display: 'block',
  };

  return wrap(
    <div style={{ width: '100%', maxWidth: '440px', zIndex: 1 }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '36px' }}>
        <div style={{ fontSize: '44px', marginBottom: '14px' }}>☁️</div>
        <h1 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 8px' }}>
          Connect Cloud School
        </h1>
        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', margin: 0 }}>
          Already onboarded online? Enter your school details to sync data to this device.
        </p>
      </div>

      {/* Card */}
      <div style={{
        background: 'rgba(0,180,80,0.06)',
        border: '1px solid rgba(0,200,100,0.20)',
        borderRadius: '20px',
        padding: '28px 28px 24px',
      }}>
        {/* School Slug */}
        <div style={{ marginBottom: '18px' }}>
          <label style={labelStyle}>School Slug</label>
          <input
            type="text"
            value={slug}
            onChange={e => setSlug(e.target.value)}
            placeholder="e.g. crestmont"
            style={inputStyle}
            autoComplete="off"
            spellCheck={false}
            onFocus={e => { e.currentTarget.style.borderColor = 'rgba(0,229,160,0.5)'; }}
            onBlur={e  => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
          />
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '4px' }}>
            The short identifier from your school's web portal URL
          </div>
        </div>

        {/* Admin Email */}
        <div style={{ marginBottom: '18px' }}>
          <label style={labelStyle}>Admin Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="admin@yourschool.com"
            style={inputStyle}
            autoComplete="off"
            onFocus={e => { e.currentTarget.style.borderColor = 'rgba(0,229,160,0.5)'; }}
            onBlur={e  => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
          />
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '4px' }}>
            Email used when you registered on the web portal
          </div>
        </div>

        {/* Divider */}
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.08)',
          margin: '8px 0 18px',
        }} />
        <div style={{ fontSize: '11px', color: 'rgba(0,229,160,0.7)', fontWeight: 600, marginBottom: '16px', letterSpacing: '0.06em' }}>
          🔐 CREATE YOUR DESKTOP PIN
        </div>

        {/* PIN */}
        <div style={{ marginBottom: '18px' }}>
          <label style={labelStyle}>Desktop PIN</label>
          <input
            type="password"
            value={pin}
            onChange={e => setPin(e.target.value)}
            placeholder="4–8 digits"
            maxLength={8}
            inputMode="numeric"
            style={inputStyle}
            onFocus={e => { e.currentTarget.style.borderColor = 'rgba(0,229,160,0.5)'; }}
            onBlur={e  => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
          />
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '4px' }}>
            This PIN is separate from your web password — used only on this device
          </div>
        </div>

        {/* Confirm PIN */}
        <div style={{ marginBottom: '8px' }}>
          <label style={labelStyle}>Confirm PIN</label>
          <input
            type="password"
            value={pinConfirm}
            onChange={e => setPinConfirm(e.target.value)}
            placeholder="Repeat PIN"
            maxLength={8}
            inputMode="numeric"
            style={{
              ...inputStyle,
              borderColor: pinMismatch ? 'rgba(255,100,100,0.6)' : 'rgba(255,255,255,0.12)',
            }}
            onFocus={e => { if (!pinMismatch) e.currentTarget.style.borderColor = 'rgba(0,229,160,0.5)'; }}
            onBlur={e  => { e.currentTarget.style.borderColor = pinMismatch ? 'rgba(255,100,100,0.6)' : 'rgba(255,255,255,0.12)'; }}
          />
          {pinMismatch && (
            <div style={{ fontSize: '11px', color: '#ff8a80', marginTop: '4px' }}>
              PINs do not match
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <button
          onClick={handleConnect}
          disabled={!canSubmit}
          style={{
            width: '100%',
            background: canSubmit
              ? 'linear-gradient(135deg, #00c864 0%, #00e5a0 100%)'
              : 'rgba(255,255,255,0.08)',
            border: 'none',
            borderRadius: '12px',
            padding: '14px',
            fontSize: '15px',
            fontWeight: 700,
            color: canSubmit ? '#050814' : 'rgba(255,255,255,0.3)',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => { if (canSubmit) (e.currentTarget as HTMLButtonElement).style.opacity = '0.9'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
        >
          Connect &amp; Set Up →
        </button>

        <button
          onClick={onBack}
          style={{
            width: '100%',
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '12px',
            padding: '12px',
            fontSize: '13px',
            fontWeight: 500,
            color: 'rgba(255,255,255,0.4)',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.3)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.12)'; }}
        >
          ← Back to startup
        </button>
      </div>

      {/* Footer */}
      <p style={{
        textAlign: 'center', marginTop: '24px',
        fontSize: '11px', color: 'rgba(255,255,255,0.18)',
      }}>
        Nexus School OS · Secure Offline-First School Management
      </p>
    </div>
  );
}
