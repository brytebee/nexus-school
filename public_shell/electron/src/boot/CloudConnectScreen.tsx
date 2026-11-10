import React, { useState } from 'react';

const api = (window as any).nexusAPI || (window as any).electronAPI;

interface CloudConnectScreenProps {
  onBack: () => void;
}

type Step = 'form' | 'loading' | 'success' | 'error';
type AuthType = 'pin' | 'password';

export function CloudConnectScreen({ onBack }: CloudConnectScreenProps) {
  const [step, setStep] = useState<Step>('form');

  // Form fields
  const [slug, setSlug]             = useState('');
  const [email, setEmail]           = useState('');
  const [authType, setAuthType]     = useState<AuthType>('pin');
  const [pin, setPin]               = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [secretVisible, setSecretVisible] = useState(false);

  // Feedback
  const [errorMsg, setErrorMsg]     = useState('');
  const [seeded, setSeeded]         = useState<{ classes: number; teachers: number; students: number } | null>(null);
  const [schoolName, setSchoolName] = useState('');
  const [loadingLabel, setLoadingLabel] = useState('Connecting to cloud…');

  // ── Validation ─────────────────────────────────────────────────────────────
  const isPinValid = authType === 'pin' ? /^\d{4}$/.test(pin) : pin.trim().length >= 6;
  const pinMismatch = pin && pinConfirm && pin !== pinConfirm;
  const canSubmit =
    slug.trim().length > 0 &&
    email.trim().length > 0 &&
    isPinValid &&
    pin === pinConfirm;

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleConnect = async () => {
    if (!canSubmit) return;
    setErrorMsg('');
    setStep('loading');
    setLoadingLabel('Connecting to cloud…');

    try {
      setTimeout(() => setLoadingLabel('Seeding local database…'), 2500);

      const result = await api.invoke('sync:cloud-connect', {
        slug: slug.trim().toLowerCase(),
        email: email.trim().toLowerCase(),
        pin: pin.trim(),
        authType,
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

  // ── Shared layout wrapper (strict viewport clip to prevent scrollbars) ─────
  const wrap = (children: React.ReactNode) => (
    <div style={{
      width: '100%',
      height: '100vh',
      maxHeight: '100vh',
      background: 'linear-gradient(135deg, #050814 0%, #0b1120 50%, #0a0f1e 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 20px',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      position: 'relative',
      overflow: 'hidden',
      boxSizing: 'border-box',
      color: '#fff',
    }}>
      {/* Hide native scrollbars anywhere on this screen */}
      <style>{`
        ::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
        * { scrollbar-width: none !important; -ms-overflow-style: none !important; }
      `}</style>

      {/* Decorative ambient blobs strictly clipped within boundary */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div style={{
          position: 'absolute', top: '-120px', left: '-120px',
          width: '360px', height: '360px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,180,80,0.10) 0%, transparent 70%)',
        }} />
        <div style={{
          position: 'absolute', bottom: '-100px', right: '-100px',
          width: '320px', height: '320px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,255,120,0.08) 0%, transparent 70%)',
        }} />
      </div>

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

  // ── Main form styling ──────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '10px',
    padding: '10px 14px',
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
    marginBottom: '5px', display: 'block',
  };

  return wrap(
    <div style={{
      width: '100%',
      maxWidth: '430px',
      zIndex: 1,
      overflowY: 'auto',
      maxHeight: 'calc(100vh - 36px)',
      padding: '4px 6px',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <div style={{ fontSize: '38px', marginBottom: '10px' }}>☁️</div>
        <h1 style={{ fontSize: '21px', fontWeight: 800, margin: '0 0 6px' }}>
          Connect Cloud School
        </h1>
        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', margin: 0 }}>
          Already onboarded online? Enter your school details to sync data to this device.
        </p>
      </div>

      {/* Card */}
      <div style={{
        background: 'rgba(0,180,80,0.06)',
        border: '1px solid rgba(0,200,100,0.20)',
        borderRadius: '18px',
        padding: '22px 24px 20px',
      }}>
        {/* School Slug */}
        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle}>School Slug</label>
          <input
            type="text"
            value={slug}
            onChange={e => setSlug(e.target.value)}
            placeholder="e.g. dms"
            style={inputStyle}
            autoComplete="off"
            spellCheck={false}
            onFocus={e => { e.currentTarget.style.borderColor = 'rgba(0,229,160,0.5)'; }}
            onBlur={e  => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
          />
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginTop: '3px' }}>
            The short identifier from your school's web portal URL
          </div>
        </div>

        {/* Admin Email */}
        <div style={{ marginBottom: '16px' }}>
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
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginTop: '3px' }}>
            Email used when you registered on the web portal
          </div>
        </div>

        {/* Divider */}
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.08)',
          margin: '6px 0 14px',
        }} />

        {/* Auth Type Selector: PIN vs Password */}
        <div style={{ marginBottom: '14px' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '8px',
          }}>
            <span style={{ fontSize: '11px', color: 'rgba(0,229,160,0.8)', fontWeight: 700, letterSpacing: '0.06em' }}>
              🔐 DESKTOP CREDENTIAL
            </span>
          </div>

          <div style={{
            display: 'flex',
            background: 'rgba(255,255,255,0.05)',
            borderRadius: '10px',
            padding: '3px',
            gap: '4px',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <button
              type="button"
              onClick={() => { setAuthType('pin'); setPin(''); setPinConfirm(''); }}
              style={{
                flex: 1,
                padding: '7px 0',
                border: 'none',
                borderRadius: '7px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600,
                transition: 'all 0.15s ease',
                background: authType === 'pin' ? '#00e5a0' : 'transparent',
                color: authType === 'pin' ? '#050814' : 'rgba(255,255,255,0.5)',
              }}
            >
              🔢 4-Digit PIN
            </button>
            <button
              type="button"
              onClick={() => { setAuthType('password'); setPin(''); setPinConfirm(''); }}
              style={{
                flex: 1,
                padding: '7px 0',
                border: 'none',
                borderRadius: '7px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600,
                transition: 'all 0.15s ease',
                background: authType === 'password' ? '#00e5a0' : 'transparent',
                color: authType === 'password' ? '#050814' : 'rgba(255,255,255,0.5)',
              }}
            >
              🔑 Password
            </button>
          </div>
        </div>

        {/* Secret input */}
        <div style={{ marginBottom: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={labelStyle}>
              {authType === 'pin' ? 'Desktop PIN' : 'Desktop Password'}
            </label>
            <button
              type="button"
              onClick={() => setSecretVisible(!secretVisible)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255,255,255,0.4)',
                fontSize: '11px',
                cursor: 'pointer',
                padding: '0 2px',
                marginBottom: '4px',
              }}
            >
              {secretVisible ? '🙈 Hide' : '👁️ Show'}
            </button>
          </div>

          <input
            type={secretVisible ? 'text' : 'password'}
            value={pin}
            onChange={e => {
              const val = e.target.value;
              if (authType === 'pin') {
                if (/^\d*$/.test(val) && val.length <= 4) setPin(val);
              } else {
                setPin(val);
              }
            }}
            placeholder={authType === 'pin' ? '•••• (4 digits)' : 'Minimum 6 characters'}
            maxLength={authType === 'pin' ? 4 : 32}
            inputMode={authType === 'pin' ? 'numeric' : 'text'}
            style={{
              ...inputStyle,
              letterSpacing: (authType === 'pin' && pin && !secretVisible) ? '0.3em' : 'normal',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'rgba(0,229,160,0.5)'; }}
            onBlur={e  => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
          />
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginTop: '3px' }}>
            {authType === 'pin'
              ? 'Numbers only, exactly 4 digits — used only on this device'
              : 'Alphanumeric password — used only on this device'}
          </div>
        </div>

        {/* Confirm Secret */}
        <div style={{ marginBottom: '4px' }}>
          <label style={labelStyle}>
            {authType === 'pin' ? 'Confirm PIN' : 'Confirm Password'}
          </label>
          <input
            type={secretVisible ? 'text' : 'password'}
            value={pinConfirm}
            onChange={e => {
              const val = e.target.value;
              if (authType === 'pin') {
                if (/^\d*$/.test(val) && val.length <= 4) setPinConfirm(val);
              } else {
                setPinConfirm(val);
              }
            }}
            placeholder={authType === 'pin' ? 'Repeat 4 digits' : 'Repeat password'}
            maxLength={authType === 'pin' ? 4 : 32}
            inputMode={authType === 'pin' ? 'numeric' : 'text'}
            style={{
              ...inputStyle,
              borderColor: pinMismatch ? 'rgba(255,100,100,0.6)' : 'rgba(255,255,255,0.12)',
              letterSpacing: (authType === 'pin' && pinConfirm && !secretVisible) ? '0.3em' : 'normal',
            }}
            onFocus={e => { if (!pinMismatch) e.currentTarget.style.borderColor = 'rgba(0,229,160,0.5)'; }}
            onBlur={e  => { e.currentTarget.style.borderColor = pinMismatch ? 'rgba(255,100,100,0.6)' : 'rgba(255,255,255,0.12)'; }}
          />
          {pinMismatch && (
            <div style={{ fontSize: '10px', color: '#ff8a80', marginTop: '3px' }}>
              {authType === 'pin' ? 'PINs do not match' : 'Passwords do not match'}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
            padding: '13px',
            fontSize: '14px',
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
            padding: '11px',
            fontSize: '12px',
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
        textAlign: 'center', marginTop: '16px',
        fontSize: '10px', color: 'rgba(255,255,255,0.18)',
      }}>
        Nexus School OS · Secure Offline-First School Management
      </p>
    </div>
  );
}
