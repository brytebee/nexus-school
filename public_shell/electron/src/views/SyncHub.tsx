import React, { useState, useEffect, useRef, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Teacher {
  id: string;
  name: string;
}

interface TeacherAccess {
  id: string;
  name: string;
  sync_revoked: 0 | 1;
}

interface QrPayload {
  ip: string;
  port: string;
  teacher_id: string;
  config?: any;
}

interface Admin {
  id: string;
  username: string;
}

// ── PIN Confirmation Modal ────────────────────────────────────────────────────
interface PinModalProps {
  title: string;
  body: string;
  danger?: boolean;
  onConfirm: (adminId: string, pin: string) => Promise<void>;
  onClose: () => void;
  admins: Admin[];
}

function PinModal({ title, body, danger = true, onConfirm, onClose, admins }: PinModalProps) {
  const [selectedAdmin, setSelectedAdmin] = useState(admins[0]?.id || '');
  const [pin, setPin]                     = useState('');
  const [error, setError]                 = useState('');
  const [loading, setLoading]             = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 80); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAdmin || !pin.trim()) { setError('Enter your PIN.'); return; }
    setLoading(true); setError('');
    try {
      await onConfirm(selectedAdmin, pin.trim());
    } catch (err: any) {
      setError(err?.message || 'Incorrect PIN or error.');
    } finally {
      setLoading(false);
    }
  };

  const accentColor = danger ? '#FF5252' : '#4CAF50';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <form
        onSubmit={handleSubmit}
        style={{
          background: 'var(--bg-dark)',
          border: `1px solid ${accentColor}55`,
          borderRadius: '16px',
          padding: '28px 32px',
          width: '360px',
          boxShadow: `0 0 40px ${accentColor}22`,
          display: 'flex', flexDirection: 'column', gap: '18px',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '22px' }}>{danger ? '🔐' : '🔓'}</span>
          <div>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-main)' }}>
              {title}
            </h3>
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-dim)', marginTop: '3px', lineHeight: 1.5 }}>
              {body}
            </p>
          </div>
        </div>

        {/* Admin selector */}
        {admins.length > 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 500 }}>Admin Account</label>
            <select
              className="modern-input"
              value={selectedAdmin}
              onChange={e => setSelectedAdmin(e.target.value)}
              style={{ fontSize: '12px' }}
            >
              {admins.map(a => <option key={a.id} value={a.id}>{a.username}</option>)}
            </select>
          </div>
        )}

        {/* PIN input */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 500 }}>Admin PIN</label>
          <input
            ref={inputRef}
            type="password"
            className="modern-input"
            value={pin}
            onChange={e => setPin(e.target.value)}
            placeholder="Enter your PIN to confirm"
            autoComplete="current-password"
            style={{ fontSize: '13px', letterSpacing: '0.2em' }}
          />
        </div>

        {error && (
          <div style={{ fontSize: '12px', color: '#FF5252', background: 'rgba(255,82,82,0.1)', padding: '8px 12px', borderRadius: '8px' }}>
            ⚠️ {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '2px' }}>
          <button
            type="button"
            className="secondary-btn"
            onClick={onClose}
            style={{ fontSize: '12px', padding: '8px 16px' }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="primary-btn"
            style={{
              fontSize: '12px', padding: '8px 18px',
              background: danger
                ? 'linear-gradient(135deg, #c62828, #FF5252)'
                : 'linear-gradient(135deg, #1b5e20, #4CAF50)',
              border: 'none', color: '#fff',
            }}
          >
            {loading ? '⌛ Verifying…' : (danger ? '🔒 Revoke Access' : '✅ Restore Access')}
          </button>
        </div>
      </form>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SyncHub
// ═══════════════════════════════════════════════════════════════════════════════
export function SyncHub() {
  // ── QR / Pairing state ────────────────────────────────────────────────────
  const [teachers,          setTeachers]          = useState<Teacher[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [qrPayload,         setQrPayload]         = useState<QrPayload | null>(null);
  const [copyText,          setCopyText]          = useState('Copy Manual Sync Code');
  const [handshakeMessage,  setHandshakeMessage]  = useState<string | null>(null);
  const [generating,        setGenerating]        = useState(false);

  const qrCodeContainerRef = useRef<HTMLDivElement>(null);

  // ── Revoke Access state ───────────────────────────────────────────────────
  const [accessList,    setAccessList]    = useState<TeacherAccess[]>([]);
  const [loadingAccess, setLoadingAccess] = useState(false);
  const [searchRevoke,  setSearchRevoke]  = useState('');
  const [admins,        setAdmins]        = useState<Admin[]>([]);

  // Pending modal state
  const [pendingAction, setPendingAction] = useState<{
    teacher: TeacherAccess;
    action: 'revoke' | 'restore';
  } | null>(null);

  const [indicator, setIndicator] = useState<{ text: string; color: string } | null>(null);

  const showIndicator = useCallback((text: string, color = '#4CAF50') => {
    setIndicator({ text, color });
    setTimeout(() => setIndicator(null), 3000);
  }, []);

  // ── Load admins (for PIN modal selector) ─────────────────────────────────
  const loadAdmins = useCallback(async () => {
    try {
      const res = await window.electronAPI?.auth?.getAdmins?.();
      if (Array.isArray(res)) setAdmins(res);
    } catch (_) {}
  }, []);

  // ── Load teacher access list ──────────────────────────────────────────────
  // Falls back to the teachers list (sync_revoked=0) if the new IPC isn't registered yet.
  const loadAccessList = useCallback(async (fallbackTeachers?: Teacher[]) => {
    setLoadingAccess(true);
    try {
      if (window.electronAPI?.teacher?.getAccessList) {
        const res = await window.electronAPI.teacher.getAccessList();
        if (res?.ok && Array.isArray(res.data) && res.data.length > 0) {
          setAccessList(res.data);
          return;
        }
      }
      // Fallback: build from the teachers list with sync_revoked=0
      const base = fallbackTeachers ?? [];
      if (base.length > 0) {
        setAccessList(base.map(t => ({ id: t.id, name: t.name, sync_revoked: 0 as const })));
      }
    } catch (err) {
      console.error('[SyncHub] loadAccessList error:', err);
    } finally {
      setLoadingAccess(false);
    }
  }, []);

  // ── Load teachers for QR select (optimised minimal list) ─────────────────
  useEffect(() => {
    const fetchTeachers = async () => {
      if (!window.electronAPI) return;
      try {
        // Prefer the scalable paginated handler (minimal=true skips N+1 allocations)
        if (window.electronAPI.getAllTeachers) {
          const res = await window.electronAPI.getAllTeachers({ minimal: true, limit: 500, offset: 0 });
          const list: Teacher[] = res?.ok ? (res.data || []) : [];
          setTeachers(list);
          // Immediately seed the access list so the revoke table is never blank
          await loadAccessList(list);
        } else if (window.electronAPI.getTeachers) {
          // Legacy fallback
          const list: Teacher[] = (await window.electronAPI.getTeachers()) || [];
          setTeachers(list);
          await loadAccessList(list);
        }
      } catch (err) {
        console.error('[SyncHub] Error fetching teachers:', err);
      }
    };
    fetchTeachers();
    loadAdmins();
  }, [loadAccessList, loadAdmins]);

  // ── QR IPC listeners ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!window.electronAPI) return;

    const handleQrUpdate = (payload: any) => {
      setGenerating(false);
      setQrPayload(payload);
    };

    const handleHandshake = (data: any) => {
      setHandshakeMessage(`📱 ${data?.teacher_name || 'Teacher'} tablet successfully paired!`);
      setTimeout(() => setHandshakeMessage(null), 5000);
    };

    window.electronAPI.onQrPayload(handleQrUpdate);
    window.electronAPI.onHandshakeComplete(handleHandshake);

    // Listen for revoke broadcasts (e.g. from another admin session)
    window.electronAPI.teacher?.onRevokeBroadcast?.(() => loadAccessList(teachers));
  }, [loadAccessList]);

  // ── Render QR Code ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!qrPayload || !qrCodeContainerRef.current) return;
    qrCodeContainerRef.current.innerHTML = '';

    const qrData = JSON.parse(JSON.stringify(qrPayload));
    if (qrData.config) {
      qrData.config.logoBase64          = null;
      qrData.config.principalSignBase64 = null;
      qrData.config.teacherSignBase64   = null;
    }

    try {
      const QRCodeLib = (window as any).QRCode;
      if (QRCodeLib) {
        new QRCodeLib(qrCodeContainerRef.current, {
          text:         JSON.stringify(qrData),
          width:        220,
          height:       220,
          colorDark:    '#000000',
          colorLight:   '#FFFFFF',
          correctLevel: 1,
        });
      }
    } catch (err) {
      console.error('[SyncHub] QR render error:', err);
    }
  }, [qrPayload]);

  // ── Handlers: QR ─────────────────────────────────────────────────────────
  const handleTeacherChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const teacherId = e.target.value;
    setSelectedTeacherId(teacherId);
    const teacher = teachers.find(t => t.id === teacherId);
    if (teacher && window.electronAPI?.setTeacher) {
      setGenerating(true);
      setQrPayload(null);
      try {
        await window.electronAPI.setTeacher({ id: teacher.id, name: teacher.name });
      } catch (err) {
        console.error('[SyncHub] setTeacher error:', err);
        setGenerating(false);
      }
    }
  };

  const handleCopyPayload = () => {
    if (!qrPayload) return;
    const qrData = JSON.parse(JSON.stringify(qrPayload));
    if (qrData.config) {
      qrData.config.logoBase64          = null;
      qrData.config.principalSignBase64 = null;
      qrData.config.teacherSignBase64   = null;
    }
    navigator.clipboard.writeText(JSON.stringify(qrData));
    setCopyText('Copied!');
    setTimeout(() => setCopyText('Copy Manual Sync Code'), 2000);
  };

  // ── Handlers: Revoke/Restore ──────────────────────────────────────────────
  const handleConfirmAction = async (adminId: string, pin: string) => {
    if (!pendingAction) return;
    const { teacher, action } = pendingAction;

    const api = action === 'revoke'
      ? window.electronAPI?.teacher?.revokeAccess
      : window.electronAPI?.teacher?.restoreAccess;

    if (!api) throw new Error('IPC handler not available');

    const res = await api({ teacherId: teacher.id, adminId, pin });
    if (!res?.ok) throw new Error(res?.error || 'Operation failed');

    setPendingAction(null);
    showIndicator(
      action === 'revoke'
        ? `🔒 ${teacher.name}'s sync access revoked`
        : `✅ ${teacher.name}'s sync access restored`,
      action === 'revoke' ? '#FF5252' : '#4CAF50',
    );
    await loadAccessList();
  };

  // ── Filtered access list for search ──────────────────────────────────────
  const filteredAccess = searchRevoke.trim()
    ? accessList.filter(t => t.name.toLowerCase().includes(searchRevoke.toLowerCase()))
    : accessList;

  const revokedCount = accessList.filter(t => t.sync_revoked).length;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--grid-gap)' }}>

      {/* PIN Confirmation Modal */}
      {pendingAction && admins.length > 0 && (
        <PinModal
          title={pendingAction.action === 'revoke' ? 'Revoke Sync Access' : 'Restore Sync Access'}
          body={
            pendingAction.action === 'revoke'
              ? `You are about to permanently block "${pendingAction.teacher.name}" from syncing with this hub. Enter your admin PIN to confirm.`
              : `You are restoring sync access for "${pendingAction.teacher.name}". Enter your admin PIN to confirm.`
          }
          danger={pendingAction.action === 'revoke'}
          admins={admins}
          onConfirm={handleConfirmAction}
          onClose={() => setPendingAction(null)}
        />
      )}

      {/* Header */}
      <div className="view-header">
        <div>
          <h2 className="view-title">🔄 Sync Hub</h2>
          <p className="view-sub">
            Pair Android Teacher tablets to canonical databases and manage sync access credentials.
          </p>
        </div>
        {indicator && (
          <span style={{ fontSize: '12px', color: indicator.color, fontWeight: 600 }}>
            {indicator.text}
          </span>
        )}
      </div>

      {handshakeMessage && (
        <div style={{
          background: 'rgba(0,230,118,0.1)',
          border: '1px solid rgba(0,230,118,0.25)',
          padding: '12px 16px',
          borderRadius: 'var(--radius-md)',
          fontSize: '12px',
          color: 'var(--accent-green)',
          fontWeight: 600,
        }}>
          {handshakeMessage}
        </div>
      )}

      {/* ── TOP SECTION: QR Pairing ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--grid-gap)' }}>

        {/* Left: Selector & Info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--grid-gap)' }}>
          <div style={{ background: 'var(--glass)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: '22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text-main)', borderBottom: '1px solid var(--glass-border)', paddingBottom: '12px' }}>
              Select Staff Profile
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 500 }}>
                Choose a teacher to generate their custom pairing credentials:
              </label>
              <select
                value={selectedTeacherId}
                onChange={handleTeacherChange}
                className="modern-input"
                style={{ width: '100%' }}
              >
                <option value="" disabled>Select teacher to generate QR…</option>
                {teachers.map(t => (
                  <option key={t.id} value={t.id} style={{ background: 'var(--bg-dark)', color: 'var(--text-main)' }}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid var(--glass-border)', paddingTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                <span style={{ color: 'var(--text-dim)' }}>Broadcasting Node IP:</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-main)', fontWeight: 600 }}>
                  {qrPayload?.ip || '0.0.0.0'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                <span style={{ color: 'var(--text-dim)' }}>System Synced Port:</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-main)', fontWeight: 600 }}>
                  {qrPayload?.port || '3000'}
                </span>
              </div>
            </div>
          </div>

          <div style={{ background: 'var(--glass)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <h4 style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Pairing Instructions
            </h4>
            <ol style={{ margin: 0, paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', color: 'var(--text-dim)', lineHeight: '1.6' }}>
              <li>Open the <strong style={{ color: 'var(--text-main)' }}>Nexus Teacher App</strong> on the teacher's Android tablet.</li>
              <li>Ensure the tablet and this computer are on the <strong style={{ color: 'var(--text-main)' }}>same local Wi-Fi router</strong>.</li>
              <li>Tap <strong style={{ color: 'var(--text-main)' }}>Pair with School Hub</strong> in the tablet app.</li>
              <li>Align the camera to scan the QR code displayed here.</li>
              <li>Once paired, the tablet downloads classroom rosters automatically.</li>
            </ol>
          </div>
        </div>

        {/* Right: QR Card */}
        <div style={{ background: 'var(--glass)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: '22px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '350px' }}>
          {generating ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', textAlign: 'center' }}>
              <div className="bar-container"><div className="bar-fill" /></div>
              <p style={{ fontSize: '12px', color: 'var(--text-dim)', margin: 0 }}>Generating pair handshake payload…</p>
            </div>
          ) : qrPayload ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', width: '100%' }}>
              <h3 style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center' }}>
                HANDSHAKE CREDENTIALS
              </h3>
              <div
                ref={qrCodeContainerRef}
                style={{
                  background: '#FFFFFF', padding: '16px',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--glass-border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '252px', height: '252px',
                  boxShadow: '0 8px 32px rgba(0,229,255,0.08)',
                }}
              />
              <button
                onClick={handleCopyPayload}
                className="secondary-btn"
                style={{ width: '100%', maxWidth: '252px', justifyContent: 'center' }}
              >
                {copyText}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', textAlign: 'center', padding: '32px 16px' }}>
              <span style={{ fontSize: '32px', display: 'block' }}>🔄</span>
              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-main)' }}>
                Roster Profile Select Required
              </h4>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-dim)', maxWidth: '280px', lineHeight: '1.6' }}>
                Choose a teacher profile from the left to initialize dynamic pairing handshake codes.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── BOTTOM SECTION: Revoke Access ── */}
      <div style={{
        background: 'var(--glass)',
        border: '1px solid var(--glass-border)',
        borderRadius: 'var(--radius-lg)',
        padding: '22px',
      }}>
        {/* Section header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '18px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              🔒 Teacher Sync Access
              {revokedCount > 0 && (
                <span style={{
                  display: 'inline-block', background: 'rgba(255,82,82,0.15)',
                  color: '#FF5252', border: '1px solid rgba(255,82,82,0.3)',
                  borderRadius: '12px', fontSize: '11px', fontWeight: 700,
                  padding: '2px 9px',
                }}>
                  {revokedCount} revoked
                </span>
              )}
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.5 }}>
              Block or restore individual teacher tablet connections. Revoked teachers cannot sync even with a valid QR code.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {/* Search */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px', padding: '5px 10px', height: '32px',
            }}>
              <span style={{ fontSize: '13px', color: 'var(--text-dim)' }}>🔍</span>
              <input
                type="text"
                value={searchRevoke}
                onChange={e => setSearchRevoke(e.target.value)}
                placeholder="Search teachers…"
                style={{
                  background: 'none', border: 'none', color: 'var(--text-main)',
                  fontSize: '12px', width: '150px', outline: 'none',
                }}
              />
            </div>
            <button
              className="secondary-btn"
              onClick={() => loadAccessList(teachers)}
              disabled={loadingAccess}
              style={{ fontSize: '12px', padding: '6px 14px' }}
            >
              {loadingAccess ? '⌛' : '↻ Refresh'}
            </button>
          </div>
        </div>

        {/* Access table */}
        {loadingAccess && accessList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)', fontSize: '13px' }}>
            Loading teacher access list…
          </div>
        ) : filteredAccess.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)', fontSize: '13px' }}>
            {accessList.length === 0 ? 'No teachers found. Add teachers in the Teachers module first.' : 'No teachers match your search.'}
          </div>
        ) : (
          <div className="table-container" style={{ maxHeight: '340px', overflowY: 'auto' }}>
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: '32px' }}>#</th>
                  <th>Teacher Name</th>
                  <th style={{ textAlign: 'center', width: '130px' }}>Sync Status</th>
                  <th style={{ textAlign: 'center', width: '140px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredAccess.map((teacher, i) => {
                  const isRevoked = !!teacher.sync_revoked;
                  return (
                    <tr key={teacher.id}>
                      <td style={{ color: 'var(--text-dim)', fontSize: '12px' }}>{i + 1}</td>
                      <td style={{ fontWeight: 500 }}>
                        {teacher.name}
                        {isRevoked && (
                          <span style={{
                            marginLeft: '8px', fontSize: '10px', fontWeight: 600,
                            color: '#FF5252', background: 'rgba(255,82,82,0.1)',
                            border: '1px solid rgba(255,82,82,0.3)',
                            borderRadius: '8px', padding: '1px 7px',
                          }}>
                            REVOKED
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: '5px',
                          padding: '4px 12px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                          background: isRevoked ? 'rgba(255,82,82,0.12)' : 'rgba(76,175,80,0.12)',
                          color: isRevoked ? '#FF5252' : '#4CAF50',
                          border: `1px solid ${isRevoked ? 'rgba(255,82,82,0.3)' : 'rgba(76,175,80,0.3)'}`,
                        }}>
                          {isRevoked ? '🔒 Blocked' : '✅ Active'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {isRevoked ? (
                          <button
                            className="small-btn"
                            onClick={() => setPendingAction({ teacher, action: 'restore' })}
                            style={{
                              fontSize: '11px', padding: '5px 12px',
                              background: 'rgba(76,175,80,0.1)',
                              color: '#4CAF50',
                              borderColor: 'rgba(76,175,80,0.35)',
                            }}
                          >
                            🔓 Restore
                          </button>
                        ) : (
                          <button
                            className="small-btn"
                            onClick={() => setPendingAction({ teacher, action: 'revoke' })}
                            style={{
                              fontSize: '11px', padding: '5px 12px',
                              background: 'rgba(255,82,82,0.08)',
                              color: '#FF5252',
                              borderColor: 'rgba(255,82,82,0.3)',
                            }}
                          >
                            🔒 Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer note */}
        <p style={{ margin: '14px 0 0', fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.6 }}>
          ⚠️ Revoking a teacher's access immediately disconnects their tablet on next sync attempt and is logged to the audit trail. Re-issuing QR codes does not restore access — you must explicitly click <strong>Restore</strong>.
        </p>
      </div>
    </div>
  );
}

export default SyncHub;
