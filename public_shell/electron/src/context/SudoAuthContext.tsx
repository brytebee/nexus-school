import React, { createContext, useContext, useState, useEffect } from 'react';

interface Admin {
  id: string;
  username: string;
}

interface SudoAuthContextType {
  requireSudo: (
    onConfirm: () => Promise<void> | void,
    title?: string,
    body?: string,
    destructive?: boolean
  ) => Promise<void>;
  resetSudo: () => void;
}

const SudoAuthContext = createContext<SudoAuthContextType | undefined>(undefined);

export function useSudoAuth() {
  const context = useContext(SudoAuthContext);
  if (!context) {
    throw new Error('useSudoAuth must be used within a SudoAuthProvider');
  }
  return context;
}

export function SudoAuthProvider({ children }: { children: React.ReactNode }) {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [lastAuthTime, setLastAuthTime] = useState<number | null>(null);

  // Pending action queued until the user confirms (either path)
  const [pendingAction, setPendingAction] = useState<{
    onConfirm: () => Promise<void> | void;
    title: string;
    body: string;
    destructive: boolean;
  } | null>(null);

  // ── PIN modal state ─────────────────────────────────────────────────────────
  const [isPinOpen, setIsPinOpen] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState('');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinLoading, setPinLoading] = useState(false);

  // ── Confirm modal state (session still valid, just needs a safety click) ────
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  useEffect(() => {
    const fetchAdmins = async () => {
      try {
        const res = await window.electronAPI?.auth?.getAdmins?.();
        if (Array.isArray(res)) {
          setAdmins(res);
          if (res.length > 0) setSelectedAdmin(res[0].id);
        }
      } catch (err) {
        console.error('Failed to load admins for sudo auth:', err);
      }
    };
    fetchAdmins();
  }, []);

  const resetSudo = () => {
    setLastAuthTime(null);
  };

  const requireSudo = async (
    onConfirm: () => Promise<void> | void,
    title = 'Confirm Destructive Action',
    body = 'This action is irreversible and will permanently destroy data. Are you sure you want to continue?',
    destructive = true
  ) => {
    const now = Date.now();
    const isSessionValid = lastAuthTime && (now - lastAuthTime < 30 * 60 * 1000); // 30 minutes

    setPin('');
    setPinError('');

    if (isSessionValid) {
      if (!destructive) {
        // Non-destructive read action (e.g. View Grades) — session is valid,
        // skip the confirm dialog entirely and call the callback immediately.
        await onConfirm();
        return;
      }
      // Destructive action within a valid session — show confirm-only modal
      setPendingAction({ onConfirm, title, body, destructive });
      setIsConfirmOpen(true);
    } else {
      // Session expired — full PIN verification required
      setPendingAction({ onConfirm, title, body, destructive });
      setIsPinOpen(true);
    }
  };

  // ── Confirm modal handler (session valid path) ──────────────────────────────
  const handleConfirmOnly = async () => {
    setIsConfirmOpen(false);
    if (pendingAction) {
      await pendingAction.onConfirm();
    }
    setPendingAction(null);
  };

  // ── PIN modal handler (session expired path) ────────────────────────────────
  const handlePinConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAdmin || !pin.trim()) {
      setPinError('Please enter your PIN.');
      return;
    }
    setPinLoading(true);
    setPinError('');
    try {
      const res = await window.electronAPI.auth.verifyPin({ adminId: selectedAdmin, pin: pin.trim() });
      if (res && res.ok) {
        setLastAuthTime(Date.now());
        setIsPinOpen(false);
        if (pendingAction) {
          await pendingAction.onConfirm();
        }
        setPendingAction(null);
      } else {
        setPinError(res?.error || 'Incorrect PIN.');
      }
    } catch (err: any) {
      setPinError(err.message || 'Verification failed.');
    } finally {
      setPinLoading(false);
    }
  };

  const BACKDROP: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 99999,
    background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };

  const CARD: React.CSSProperties = {
    background: '#0b0f19',
    border: '1px solid rgba(239, 68, 68, 0.35)',
    borderRadius: '16px',
    padding: '28px 32px',
    width: '360px',
    boxShadow: '0 0 40px rgba(239, 68, 68, 0.12)',
    display: 'flex', flexDirection: 'column', gap: '18px',
  };

  return (
    <SudoAuthContext.Provider value={{ requireSudo, resetSudo }}>
      {children}

      {/* ── Confirm-Only Modal (session valid, ≤30 min) ── */}
      {isConfirmOpen && pendingAction && (
        <div style={BACKDROP}>
          <div style={CARD}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <span style={{ fontSize: '24px', lineHeight: 1, marginTop: '2px' }}>⚠️</span>
              <div>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#fff' }}>
                  {pendingAction.title}
                </h3>
                <p style={{ margin: '5px 0 0', fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.6 }}>
                  {pendingAction.body}
                </p>
              </div>
            </div>

            {/* Session pill */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)',
              borderRadius: '8px', padding: '8px 12px', fontSize: '11px', color: '#10b981',
            }}>
              <span>🔓</span>
              <span>Admin session active — PIN not required for 30 minutes</span>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '2px' }}>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => { setIsConfirmOpen(false); setPendingAction(null); }}
                style={{ fontSize: '12px', padding: '8px 16px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmOnly}
                style={{
                  fontSize: '12px', padding: '8px 20px', borderRadius: '8px',
                  background: pendingAction.destructive
                    ? 'linear-gradient(135deg, #ef4444, #f87171)'
                    : 'linear-gradient(135deg, var(--accent), #00b4d8)',
                  border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 600,
                }}
              >
                {pendingAction.destructive ? '🗑️ Confirm Delete' : '✅ Proceed'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PIN Verification Modal (session expired) ── */}
      {isPinOpen && pendingAction && (
        <div style={BACKDROP}>
          <form onSubmit={handlePinConfirm} style={CARD}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '22px' }}>🔐</span>
              <div>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#fff' }}>
                  {pendingAction.title}
                </h3>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-dim)', marginTop: '3px', lineHeight: 1.5 }}>
                  {pendingAction.body}
                </p>
              </div>
            </div>

            {/* Admin selector */}
            {admins.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 500 }}>Admin Account</label>
                <select
                  className="modern-input"
                  value={selectedAdmin}
                  onChange={e => setSelectedAdmin(e.target.value)}
                  style={{ fontSize: '12px', width: '100%', background: '#0d1235', color: '#fff' }}
                >
                  {admins.map(a => <option key={a.id} value={a.id}>{a.username}</option>)}
                </select>
              </div>
            )}

            {/* PIN input */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 500 }}>Admin PIN</label>
              <input
                type="password"
                className="modern-input"
                value={pin}
                onChange={e => setPin(e.target.value)}
                placeholder="Enter PIN to authorize"
                autoFocus
                style={{ fontSize: '13px', letterSpacing: '0.2em', width: '100%', boxSizing: 'border-box' }}
              />
            </div>

            {pinError && (
              <div style={{ fontSize: '12px', color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: '8px 12px', borderRadius: '8px' }}>
                ⚠️ {pinError}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '2px' }}>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => { setIsPinOpen(false); setPendingAction(null); }}
                style={{ fontSize: '12px', padding: '8px 16px' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pinLoading}
                style={{
                  fontSize: '12px', padding: '8px 18px',
                  background: 'linear-gradient(135deg, #ef4444, #f87171)',
                  border: 'none', color: '#fff', borderRadius: '8px',
                  cursor: 'pointer', fontWeight: 600,
                }}
              >
                {pinLoading ? '⌛ Verifying…' : '🔐 Verify & Confirm'}
              </button>
            </div>
          </form>
        </div>
      )}
    </SudoAuthContext.Provider>
  );
}
