import React, { useState, useEffect, useRef } from 'react';

const api = (window as any).nexusAPI;

type Step = 'credentials' | 'recovery' | 'success';

interface FormState {
  username: string;
  pin: string;
  confirmPin: string;
  phone: string;
  question: string;
  answer: string;
}

const SECURITY_QUESTIONS = [
  'What is the name of your school?',
  'What city is your school located in?',
  'What was the name of your first student?',
  'What is your mother\'s maiden name?',
  'What was the name of your primary school?',
];

interface AdminSetupScreenProps {
  onBack?: () => void;
}

export function AdminSetupScreen({ onBack }: AdminSetupScreenProps) {
  const [step, setStep] = useState<Step>('credentials');
  const [authType, setAuthType] = useState<'pin' | 'password'>('pin');
  const [form, setForm] = useState<FormState>({
    username: '', pin: '', confirmPin: '',
    phone: '', question: SECURITY_QUESTIONS[0], answer: '',
  });
  const [errors, setErrors] = useState<Partial<FormState>>({});
  const [submitting, setSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState('');
  const [schoolName, setSchoolName] = useState('Nexus School OS');
  const [logoUrl, setLogoUrl] = useState('');
  const [pinVisible, setPinVisible] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    usernameRef.current?.focus();
    // Load school identity for branding
    api?.getIdentity?.().then((id: any) => {
      if (id?.school_name) setSchoolName(id.school_name);
      if (id?.logo_url) setLogoUrl(id.logo_url);
    }).catch(() => {});
  }, []);

  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm(f => ({ ...f, [field]: e.target.value }));
    setErrors(err => ({ ...err, [field]: '' }));
    setGlobalError('');
  };

  function validateCredentials(): boolean {
    const e: Partial<FormState> = {};
    if (!form.username.trim()) e.username = 'Name is required.';
    else if (form.username.trim().length < 2) e.username = 'Name must be at least 2 characters.';

    if (authType === 'pin') {
      if (!form.pin.trim()) e.pin = 'PIN is required.';
      else if (form.pin.trim().length < 4) e.pin = 'PIN must be at least 4 digits.';
      else if (!/^\d+$/.test(form.pin.trim())) e.pin = 'PIN must be digits only.';
      if (form.pin !== form.confirmPin) e.confirmPin = 'PINs do not match.';
    } else {
      if (!form.pin.trim()) e.pin = 'Password is required.';
      else if (form.pin.trim().length < 6) e.pin = 'Password must be at least 6 characters.';
      if (form.pin !== form.confirmPin) e.confirmPin = 'Passwords do not match.';
    }
    
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleNextStep(e: React.FormEvent) {
    e.preventDefault();
    if (validateCredentials()) setStep('recovery');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.answer.trim()) {
      setErrors(err => ({ ...err, answer: 'Please provide a recovery answer.' }));
      return;
    }
    setSubmitting(true);
    setGlobalError('');
    try {
      const result = await api.invoke('auth:create-admin', {
        username: form.username.trim(),
        pin: form.pin.trim(),
        authType: authType,
        roleLevel: 9,
        displayName: form.username.trim(),
        phone: form.phone.trim() || null,
        question: form.question,
        answer: form.answer.trim(),
      });
      if (result?.ok) {
        setStep('success');
        setTimeout(() => api.invoke('app:load-lock'), 2200);
      } else {
        setGlobalError(result?.error || 'Failed to create admin. Please try again.');
      }
    } catch (err: any) {
      setGlobalError(err?.message || 'Unexpected error. Please restart the app.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0a0a0f 0%, #0d1117 50%, #0a0a0f 100%)',
      fontFamily: '"Inter", system-ui, sans-serif',
      position: 'relative', overflow: 'hidden',
    }}>
      {onBack && step === 'credentials' && (
        <button
          onClick={onBack}
          style={{
            position: 'absolute',
            top: 24,
            left: 24,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px',
            color: 'rgba(255,255,255,0.7)',
            padding: '10px 16px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
            backdropFilter: 'blur(10px)',
            zIndex: 10,
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(0,229,255,0.4)';
            (e.currentTarget as HTMLButtonElement).style.color = '#fff';
            (e.currentTarget as HTMLButtonElement).style.transform = 'translateX(-2px)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.03)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.08)';
            (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.7)';
            (e.currentTarget as HTMLButtonElement).style.transform = 'translateX(0)';
          }}
        >
          ← Back
        </button>
      )}
      {/* Background glow orbs */}
      <div style={{
        position: 'absolute', width: 500, height: 500, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0,229,255,0.06) 0%, transparent 70%)',
        top: '-100px', left: '-100px', pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', width: 400, height: 400, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(139,92,246,0.05) 0%, transparent 70%)',
        bottom: '-80px', right: '-80px', pointerEvents: 'none',
      }} />

      <div style={{
        width: '100%', maxWidth: 460, padding: '0 24px',
        animation: 'fadeIn 0.4s ease',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          {logoUrl ? (
            <img src={logoUrl} alt="School Logo" style={{
              width: 64, height: 64, borderRadius: 16, objectFit: 'cover',
              marginBottom: 16, boxShadow: '0 0 20px rgba(0,229,255,0.2)',
            }} />
          ) : (
            <div style={{
              width: 64, height: 64, borderRadius: 16, background: 'rgba(0,229,255,0.1)',
              border: '1px solid rgba(0,229,255,0.25)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontSize: 28,
              margin: '0 auto 16px', boxShadow: '0 0 20px rgba(0,229,255,0.15)',
            }}>🏫</div>
          )}
          <div style={{ fontSize: 11, letterSpacing: '0.15em', color: 'rgba(0,229,255,0.7)', textTransform: 'uppercase', marginBottom: 8 }}>
            First Time Setup
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: 0 }}>
            {schoolName}
          </h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 8 }}>
            {step === 'credentials'
              ? 'Create your Super Admin account to get started.'
              : step === 'recovery'
              ? 'Set a security question in case you forget your PIN.'
              : 'Admin account created successfully!'}
          </p>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 28 }}>
          {(['credentials', 'recovery', 'success'] as Step[]).map((s, i) => (
            <div key={s} style={{
              height: 4, borderRadius: 2, transition: 'all 0.3s ease',
              width: step === s ? 32 : 16,
              background: step === s ? '#00E5FF'
                : ((['credentials', 'recovery', 'success'].indexOf(step) > i) ? 'rgba(0,229,255,0.4)' : 'rgba(255,255,255,0.1)'),
            }} />
          ))}
        </div>

        {/* Card */}
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 20,
          padding: '32px 28px',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
        }}>

          {/* ── Step 1: Credentials ── */}
          {step === 'credentials' && (
            <form onSubmit={handleNextStep} noValidate>
              <Field label="Admin Name" error={errors.username}>
                <input
                  ref={usernameRef}
                  type="text"
                  placeholder="e.g. Mrs. Okonkwo"
                  value={form.username}
                  onChange={set('username')}
                  style={inputStyle(!!errors.username)}
                  autoComplete="off"
                />
              </Field>

              {/* Authentication Type Selector */}
              <div style={{ marginTop: 20 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 8, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Security Method
                </label>
                <div style={{
                  display: 'flex', background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 3, border: '1px solid rgba(255,255,255,0.08)'
                }}>
                  <button
                    type="button"
                    onClick={() => { setAuthType('pin'); setErrors({}); }}
                    style={{
                      flex: 1, padding: '8px 0', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                      background: authType === 'pin' ? '#00E5FF' : 'transparent',
                      color: authType === 'pin' ? '#000' : 'rgba(255,255,255,0.6)',
                    }}
                  >
                    🔢 PIN Code
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAuthType('password'); setErrors({}); }}
                    style={{
                      flex: 1, padding: '8px 0', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                      background: authType === 'password' ? '#00E5FF' : 'transparent',
                      color: authType === 'password' ? '#000' : 'rgba(255,255,255,0.6)',
                    }}
                  >
                    🔑 Password
                  </button>
                </div>
              </div>

              <Field
                label={authType === 'pin' ? 'PIN' : 'Password'}
                hint={authType === 'pin' ? 'Numbers only, minimum 4 digits' : 'Alphanumeric, minimum 6 characters'}
                error={errors.pin}
                style={{ marginTop: 20 }}
              >
                <div style={{ position: 'relative' }}>
                  <input
                    type={pinVisible ? 'text' : 'password'}
                    inputMode={authType === 'pin' ? 'numeric' : 'text'}
                    placeholder={authType === 'pin' ? '••••' : 'Enter security password'}
                    value={form.pin}
                    onChange={set('pin')}
                    maxLength={authType === 'pin' ? 8 : 32}
                    style={{
                      ...inputStyle(!!errors.pin),
                      paddingRight: 44,
                      letterSpacing: (authType === 'pin' && form.pin && !pinVisible) ? '0.3em' : 'normal'
                    }}
                  />
                  <button type="button" onClick={() => setPinVisible(v => !v)} style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
                    cursor: 'pointer', fontSize: 16, padding: 4,
                  }}>{pinVisible ? '🙈' : '👁️'}</button>
                </div>
              </Field>

              <Field label={authType === 'pin' ? 'Confirm PIN' : 'Confirm Password'} error={errors.confirmPin} style={{ marginTop: 20 }}>
                <input
                  type={pinVisible ? 'text' : 'password'}
                  inputMode={authType === 'pin' ? 'numeric' : 'text'}
                  placeholder={authType === 'pin' ? '••••' : 'Confirm security password'}
                  value={form.confirmPin}
                  onChange={set('confirmPin')}
                  maxLength={authType === 'pin' ? 8 : 32}
                  style={{
                    ...inputStyle(!!errors.confirmPin),
                    letterSpacing: (authType === 'pin' && form.confirmPin && !pinVisible) ? '0.3em' : 'normal'
                  }}
                />
              </Field>

              <Field label="Phone (optional)" hint="For account recovery" style={{ marginTop: 20 }}>
                <input
                  type="tel"
                  placeholder="+234 800 000 0000"
                  value={form.phone}
                  onChange={set('phone')}
                  style={inputStyle(false)}
                />
              </Field>

              <button type="submit" style={primaryBtn('#00E5FF')}>
                Continue →
              </button>
            </form>
          )}

          {/* ── Step 2: Recovery ── */}
          {step === 'recovery' && (
            <form onSubmit={handleSubmit} noValidate>
              <Field label="Security Question" error={errors.question}>
                <select value={form.question} onChange={set('question')} style={{ ...inputStyle(false), background: '#12131a' }}>
                  {SECURITY_QUESTIONS.map(q => <option key={q} value={q} style={{ background: '#12131a', color: '#fff' }}>{q}</option>)}
                </select>
              </Field>

              <Field label="Your Answer" hint="Case-insensitive. Store this safely." error={errors.answer} style={{ marginTop: 20 }}>
                <input
                  type="text"
                  placeholder="Enter your answer"
                  value={form.answer}
                  onChange={set('answer')}
                  style={inputStyle(!!errors.answer)}
                  autoFocus
                />
              </Field>

              {globalError && (
                <div style={{
                  marginTop: 16, padding: '10px 14px', borderRadius: 10,
                  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                  color: '#f87171', fontSize: 13,
                }}>
                  ⚠️ {globalError}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 28 }}>
                <button
                  type="button"
                  onClick={() => setStep('credentials')}
                  disabled={submitting}
                  style={{ ...primaryBtn('rgba(255,255,255,0.1)'), flex: '0 0 auto', width: 'auto', padding: '0 20px', color: 'rgba(255,255,255,0.6)' }}
                >
                  ← Back
                </button>
                <button type="submit" disabled={submitting} style={{ ...primaryBtn('#00E5FF'), flex: 1 }}>
                  {submitting ? (
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <Spinner /> Creating account...
                    </span>
                  ) : 'Create Admin Account'}
                </button>
              </div>
            </form>
          )}

          {/* ── Step 3: Success ── */}
          {step === 'success' && (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{
                fontSize: 56, marginBottom: 16,
                animation: 'popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
              }}>✅</div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: '0 0 10px' }}>
                Account Created!
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, margin: '0 0 20px' }}>
                Signed in as <strong style={{ color: '#00E5FF' }}>{form.username}</strong>.<br />
                Redirecting to login screen...
              </p>
              <div style={{
                height: 3, borderRadius: 2, background: 'rgba(0,229,255,0.15)',
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', background: '#00E5FF', borderRadius: 2,
                  animation: 'progressFill 2.2s linear forwards',
                }} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>
          Nexus School OS · Super Admin Setup
        </p>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes popIn { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes progressFill { from { width: 0%; } to { width: 100%; } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function Field({ label, hint, error, children, style }: {
  label: string; hint?: string; error?: string; children: React.ReactNode; style?: React.CSSProperties;
}) {
  return (
    <div style={style}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 8, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        {label}
        {hint && <span style={{ fontWeight: 400, textTransform: 'none', marginLeft: 6, color: 'rgba(255,255,255,0.3)', letterSpacing: 0 }}>— {hint}</span>}
      </label>
      {children}
      {error && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#f87171' }}>{error}</p>}
    </div>
  );
}

function Spinner() {
  return (
    <span style={{
      display: 'inline-block', width: 14, height: 14,
      border: '2px solid rgba(0,0,0,0.3)', borderTopColor: '#000',
      borderRadius: '50%', animation: 'spin 0.7s linear infinite',
    }} />
  );
}

function inputStyle(hasError: boolean): React.CSSProperties {
  return {
    width: '100%', height: 46, padding: '0 14px', boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.05)',
    border: `1px solid ${hasError ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.1)'}`,
    borderRadius: 10, color: '#fff', fontSize: 14,
    outline: 'none', transition: 'border-color 0.2s',
    fontFamily: 'inherit',
    appearance: 'none' as any,
  };
}

function primaryBtn(bg: string): React.CSSProperties {
  return {
    display: 'block', width: '100%', height: 48,
    marginTop: 28, borderRadius: 12, border: 'none',
    background: bg === '#00E5FF'
      ? 'linear-gradient(135deg, #00E5FF, #0090a8)'
      : bg,
    color: bg === '#00E5FF' ? '#000' : 'inherit',
    fontSize: 15, fontWeight: 700,
    cursor: 'pointer', transition: 'opacity 0.2s, transform 0.15s',
    fontFamily: 'inherit',
    boxShadow: bg === '#00E5FF' ? '0 4px 20px rgba(0,229,255,0.3)' : 'none',
  };
}
