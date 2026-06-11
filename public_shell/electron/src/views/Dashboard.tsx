import React, { useState, useEffect } from 'react';

interface GradeEvent {
  event_type: string;
  created_at: string;
  payload: string; // JSON string containing student_id, subject, score, breakdown
}

interface LivePulse {
  teacher: string;
  action: string;
  timestamp: string;
}

interface DashboardProps {
  onTabChange?: (tab: string) => void;
}

export function Dashboard({ onTabChange }: DashboardProps = {}) {
  // Stat counts
  const [teachersCount, setTeachersCount] = useState(0);
  const [studentsCount, setStudentsCount] = useState(0);
  const [devicesSynced, setDevicesSynced] = useState(0);
  const [gradeEventsCount, setGradeEventsCount] = useState(0);

  // Grade Events Feed
  const [gradeEvents, setGradeEvents] = useState<GradeEvent[]>([]);
  const [livePulses, setLivePulses] = useState<LivePulse[]>([]);
  const [pulseLabel, setPulseLabel] = useState('Ready for teacher sync...');
  const [pulseActive, setPulseActive] = useState(false);

  // Settings Drawer
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [classHierarchy, setClassHierarchy] = useState<string[]>([]);
  const [newClassInput, setNewClassInput] = useState('');
  const [passMark, setPassMark] = useState(50);
  const [activeSession, setActiveSession] = useState('2025/2026');

  // Drag and Drop State
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // ── Data Fetching ──────────────────────────────────────────────────────────
  const fetchDbStats = async () => {
    if (!window.electronAPI?.getDbStats) return;
    try {
      const stats = await window.electronAPI.getDbStats();
      setTeachersCount(stats.teachers || 0);
      setStudentsCount(stats.students || 0);
    } catch (err) {
      console.error('Error fetching db stats:', err);
    }
  };

  const fetchSettings = async () => {
    if (!window.electronAPI?.cbt?.getSystemSettings) return;
    try {
      const res = await window.electronAPI.cbt.getSystemSettings();
      if (res) {
        setClassHierarchy(Array.isArray(res.class_hierarchy) ? res.class_hierarchy : []);
        setPassMark(parseInt(res.pass_mark_threshold) || 50);
        setActiveSession(res.current_academic_session || '2025/2026');
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
    }
  };

  useEffect(() => { fetchDbStats(); fetchSettings(); }, []);

  // IPC event listeners
  useEffect(() => {
    if (!window.electronAPI) return;

    const handleHandshake = (data: any) => {
      setDevicesSynced(prev => prev + 1);
      setPulseLabel(`📱 ${data?.teacher_name || 'A teacher'} tablet is now married.`);
      setPulseActive(true);
      setTimeout(() => setPulseActive(false), 3000);
      fetchDbStats();
    };

    const handleSync = (payload: any) => {
      const events = Array.isArray(payload) ? payload : payload.events || [];
      const count = payload.count || events.length || 0;
      const teacherName = payload.teacher_name || 'A Teacher';
      setGradeEventsCount(prev => prev + count);
      setPulseLabel(`⚡ ${teacherName} just synced ${count} scores!`);
      setPulseActive(true);
      setTimeout(() => setPulseActive(false), 3000);
      setGradeEvents(prev => [...events, ...prev].slice(0, 50));
      fetchDbStats();
    };

    const handleHeartbeat = (payload: any) => {
      setPulseLabel(`📡 ${payload.teacher} is live typing...`);
      setPulseActive(true);
      setTimeout(() => setPulseActive(false), 1000);
      setLivePulses(prev => {
        const p = { teacher: payload.teacher || 'Teacher', action: payload.action || 'Grading active...', timestamp: new Date().toLocaleTimeString() };
        return [p, ...prev].slice(0, 20);
      });
    };

    if (window.electronAPI.onHandshakeComplete) window.electronAPI.onHandshakeComplete(handleHandshake);
    if (window.electronAPI.onSyncUpdate) window.electronAPI.onSyncUpdate(handleSync);
    if (window.electronAPI.onPulseHeartbeat) {
      window.electronAPI.onPulseHeartbeat(handleHeartbeat);
      window.electronAPI.invoke('pulse-bridge-ready');
    }
  }, []);

  // ── Settings handlers ──────────────────────────────────────────────────────
  const handleAddClassToHierarchy = () => {
    const val = newClassInput.trim();
    if (!val) return;
    const Swal = (window as any).Swal;
    if (classHierarchy.includes(val)) {
      if (Swal) Swal.fire({ toast: true, position: 'top-end', icon: 'warning', title: 'Class already exists in hierarchy', showConfirmButton: false, timer: 2500, background: '#0d1235', color: '#fff' });
      return;
    }
    setClassHierarchy(prev => [...prev, val]);
    setNewClassInput('');
  };

  const handleRemoveClassFromHierarchy = (index: number) =>
    setClassHierarchy(prev => prev.filter((_, i) => i !== index));

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === index) return;
    setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) return;

    const newHierarchy = [...classHierarchy];
    const draggedItem = newHierarchy[draggedIndex];
    newHierarchy.splice(draggedIndex, 1);
    newHierarchy.splice(targetIndex, 0, draggedItem);
    setClassHierarchy(newHierarchy);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleMoveClass = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === classHierarchy.length - 1) return;
    
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const newHierarchy = [...classHierarchy];
    
    const temp = newHierarchy[index];
    newHierarchy[index] = newHierarchy[targetIndex];
    newHierarchy[targetIndex] = temp;
    
    setClassHierarchy(newHierarchy);
  };

  const handleSaveHierarchy = async () => {
    if (!window.electronAPI?.cbt?.saveSystemSetting) return;
    const Swal = (window as any).Swal;
    try {
      await window.electronAPI.cbt.saveSystemSetting({ key: 'class_hierarchy', value: classHierarchy });
      if (Swal) Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Class hierarchy updated', showConfirmButton: false, timer: 2800, background: '#0d1235', color: '#fff' });
    } catch (err: any) {
      if (Swal) Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Failed saving hierarchy', showConfirmButton: false, timer: 3000, background: '#0d1235', color: '#fff' });
    }
  };

  const handleSavePassMark = async () => {
    if (!window.electronAPI?.cbt?.saveSystemSetting) return;
    const Swal = (window as any).Swal;
    try {
      await window.electronAPI.cbt.saveSystemSetting({ key: 'pass_mark_threshold', value: passMark.toString() });
      if (Swal) Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Pass mark threshold updated', showConfirmButton: false, timer: 2800, background: '#0d1235', color: '#fff' });
    } catch (err: any) {
      if (Swal) Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Failed saving threshold', showConfirmButton: false, timer: 3000, background: '#0d1235', color: '#fff' });
    }
  };

  const handleRollover = async () => {
    if (!window.electronAPI?.cbt?.saveSystemSetting) return;
    const Swal = (window as any).Swal;
    if (!Swal) return;
    const confirmResult = await Swal.fire({
      title: '<span style="color:#EF4444; font-size:18px; font-weight:700;">⚠️ End Academic Session?</span>',
      html: '<p style="color:rgba(255,255,255,0.65); font-size:13px; line-height:1.6;">This will rollover the active session and affects the entire grading ledger. This action cannot be undone.</p>',
      showCancelButton: true,
      confirmButtonText: 'Yes, Rollover',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#EF4444',
      cancelButtonColor: '#1a1a2e',
      background: '#0d1235',
      color: '#fff',
    });
    if (!confirmResult.isConfirmed) return;
    const { value: newSessionInput } = await Swal.fire({
      title: '<span style="color:#fff; font-size:16px; font-weight:700;">New Academic Session</span>',
      input: 'text',
      inputLabel: 'Enter the new session (e.g. 2026/2027)',
      inputPlaceholder: '2026/2027',
      showCancelButton: true,
      confirmButtonText: 'Apply Rollover',
      confirmButtonColor: '#00E5FF',
      cancelButtonColor: '#1a1a2e',
      background: '#0d1235',
      color: '#fff',
      inputAttributes: { style: 'background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.09); color: #fff; border-radius: 8px; padding: 10px 14px; font-size: 13px;' },
    });
    if (newSessionInput?.trim()) {
      try {
        await window.electronAPI.cbt.saveSystemSetting({ key: 'current_academic_session', value: newSessionInput.trim() });
        setActiveSession(newSessionInput.trim());
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Academic session rolled over', showConfirmButton: false, timer: 3000, background: '#0d1235', color: '#fff' });
      } catch (err: any) {
        Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Failed session rollover', showConfirmButton: false, timer: 3000, background: '#0d1235', color: '#fff' });
      }
    }
  };

  const handleGeneratePDFReports = async () => {
    if (!window.electronAPI?.generateReports) return;
    const Swal = (window as any).Swal;
    if (Swal) {
      const result = await Swal.fire({
        title: '<span style="color:#fff; font-size:16px; font-weight:700;">📄 Generate Report Cards?</span>',
        html: '<p style="color:rgba(255,255,255,0.65); font-size:13px; line-height:1.6;">This will compile PDF terminal report cards for all classes. Exports will be saved in your Documents directory.</p>',
        showCancelButton: true,
        confirmButtonText: 'Generate',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#00E5FF',
        cancelButtonColor: '#1a1a2e',
        background: '#0d1235',
        color: '#fff',
      });
      if (!result.isConfirmed) return;
      Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: 'Report compilation started…', showConfirmButton: false, timer: 3500, background: '#0d1235', color: '#fff' });
    }
    try {
      await window.electronAPI.generateReports({ scope: 'all' });
    } catch (err: any) {
      if (Swal) Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Report generation failed', showConfirmButton: false, timer: 3000, background: '#0d1235', color: '#fff' });
    }
  };

  // ── Stat Cards definition ──────────────────────────────────────────────────
  const statCards = [
    { icon: '👩‍🏫', value: teachersCount, label: 'Teachers', target: 'teachers' },
    { icon: '👥', value: studentsCount, label: 'Students', target: 'students' },
    { icon: '📱', value: devicesSynced, label: 'Devices Synced' },
    { icon: '📊', value: gradeEventsCount, label: 'Grade Events' },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--grid-gap)', height: '100%', minHeight: 0 }}>

      {/* ── View Header ── */}
      <div className="view-header">
        <div>
          <h2 className="view-title">Command Center</h2>
          <p className="view-sub">Real-time overview of your school vault.</p>
        </div>

        <div className="view-header-actions">
          {/* Live Sync Status Pill */}
          <div className="pulse-indicator">
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              flexShrink: 0,
              background: pulseActive ? 'var(--accent)' : 'var(--text-dim)',
              boxShadow: pulseActive ? '0 0 8px var(--accent)' : 'none',
              transition: 'all 0.3s',
            }} />
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-main)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={pulseLabel}>
              {pulseLabel}
            </span>
          </div>

          {/* Academic Pipeline Gear */}
          <button
            onClick={() => setIsSettingsOpen(prev => !prev)}
            title="Academic Pipeline Settings"
            className="secondary-btn"
            style={{ padding: '6px 10px', fontSize: '14px', gap: 0 }}
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* ── Stat Cards Row ── */}
      <div className="stats-row">
        {statCards.map((card, i) => {
          const isInteractive = !!card.target;
          return (
            <div
              key={i}
              className="stat-card fade-in-up"
              onClick={() => isInteractive && onTabChange?.(card.target!)}
              style={{
                cursor: isInteractive ? 'pointer' : 'default',
                animationDelay: `${i * 0.08}s`,
              }}
              title={isInteractive ? `View ${card.label}` : undefined}
            >
              <div className="stat-icon">{card.icon}</div>
              <div className="stat-value">{card.value}</div>
              <div className="stat-label">{card.label}</div>
            </div>
          );
        })}
      </div>

      {/* ── Live Feed Section ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexShrink: 0 }}>
        <h3 style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>
          Live Grade Events
        </h3>
        {(gradeEvents.length > 0 || livePulses.length > 0) && (
          <button onClick={handleGeneratePDFReports} className="primary-btn" style={{ padding: '8px 18px', fontSize: '12px' }}>
            📄 Generate Report Cards
          </button>
        )}
      </div>

      {/* ── Live Feed Container ── */}
      <div className="events-container">
        {/* Heartbeat pulses */}
        {livePulses.map((pulse, idx) => (
          <div
            key={`pulse-${idx}`}
            className="event-card slide-in"
            style={{ borderLeft: '4px solid var(--accent-gold)' }}
          >
            <div className="event-type" style={{ color: 'var(--accent-gold)' }}>LIVE PULSE</div>
            <div className="event-details">
              <span className="student-id">{pulse.teacher || 'Teacher'}</span>
              <span className="score-pill" style={{ background: 'rgba(255, 215, 0, 0.12)' }}>
                {pulse.action || 'Grading active...'}
              </span>
            </div>
            <div className="event-time">{pulse.timestamp}</div>
          </div>
        ))}

        {/* Synced grade events */}
        {gradeEvents.map((event, idx) => {
          let parsed: any = {};
          try { parsed = JSON.parse(event.payload); } catch (_) {}
          const score = parsed.score ?? 'N/A';

          return (
            <div
              key={`event-${idx}`}
              className="event-card slide-in"
            >
              <div className="event-type">{event.event_type || 'UPDATE'}</div>
              <div className="event-details">
                <span className="student-id">{parsed.student_id || 'Unknown'} · {parsed.subject || ''}</span>
                <span className="score-pill">
                  Score: {score}
                  {parsed.breakdown && (
                    <>
                      {' '}
                      <span style={{ fontSize: '10px', opacity: 0.6 }}>
                        (CA1:{parsed.breakdown.CA1} CA2:{parsed.breakdown.CA2} Ex:{parsed.breakdown.Exam})
                      </span>
                    </>
                  )}
                </span>
              </div>
              <div className="event-time">{new Date(event.created_at).toLocaleTimeString()}</div>
            </div>
          );
        })}

        {gradeEvents.length === 0 && livePulses.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '60px 20px', color: 'var(--text-dim)', fontSize: '13px', lineHeight: 1.7 }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>📡</div>
            No grading events yet. Fire up the Android Teacher tablets to start syncing scores.
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════
          Academic Pipeline Drawer  (§9A/9B Slide-in)
      ══════════════════════════════════════════════ */}
      {isSettingsOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 2000,
          display: 'flex',
          justifyContent: 'flex-end',
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(8px)',
          userSelect: 'none',
          WebkitAppRegion: 'no-drag' as any,
        }}>
          <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setIsSettingsOpen(false)} />

          <div className="slide-in-right" style={{
            width: '420px',
            height: '100vh',
            background: '#0d1235',
            borderLeft: '1px solid var(--glass-border)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '-10px 0 40px rgba(0,0,0,0.7)',
            zIndex: 2001,
          }}>
            {/* Drawer Header */}
            <div style={{ padding: '20px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 700, color: 'var(--text-main)' }}>⚙️ Academic Pipeline</h3>
                <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-dim)' }}>
                  Class hierarchy, pass marks &amp; session management
                </p>
              </div>
              <button onClick={() => setIsSettingsOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '24px', cursor: 'pointer', lineHeight: '1', display: 'flex', alignItems: 'center' }}>
                &times;
              </button>
            </div>

            {/* Scrollable Content */}
            <div style={{ padding: '20px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Class Hierarchy */}
              <div className="card" style={{ padding: '16px', background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.2)' }}>
                <h4 style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-dim)', margin: '0 0 8px', letterSpacing: '1px' }}>CLASS PROGRESSION HIERARCHY</h4>
                <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '12px', lineHeight: 1.5 }}>
                  Define class order from lowest to highest. Students are promoted along this track.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px', maxHeight: '180px', overflowY: 'auto', paddingRight: '4px' }}>
                  {classHierarchy.map((cls, index) => {
                    const isDragged = draggedIndex === index;
                    const isDragOver = dragOverIndex === index;
                    
                    return (
                      <div
                        key={cls}
                        draggable
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragEnd={handleDragEnd}
                        onDrop={(e) => handleDrop(e, index)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: isDragged 
                            ? 'rgba(16, 185, 129, 0.15)' 
                            : isDragOver 
                              ? 'rgba(0, 229, 255, 0.15)' 
                              : 'rgba(0,0,0,0.25)',
                          border: isDragged
                            ? '1px dashed var(--accent)'
                            : isDragOver
                              ? '1px solid var(--accent-cyan)'
                              : '1px solid var(--glass-border)',
                          borderRadius: 'var(--radius-sm)',
                          padding: '8px 12px',
                          fontSize: '12px',
                          color: 'var(--text-main)',
                          cursor: 'grab',
                          opacity: isDragged ? 0.5 : 1,
                          transform: isDragged ? 'scale(0.98)' : 'none',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ 
                            cursor: 'grab', 
                            color: 'var(--text-dim)', 
                            opacity: 0.5, 
                            fontWeight: 'bold',
                            fontSize: '14px',
                            userSelect: 'none',
                            paddingRight: '4px'
                          }}>
                            ⋮⋮
                          </span>
                          <span style={{ fontWeight: 600 }}>{index + 1}. {cls}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            disabled={index === 0}
                            onClick={() => handleMoveClass(index, 'up')}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '24px',
                              height: '24px',
                              borderRadius: '50%',
                              background: 'rgba(255,255,255,0.05)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              color: 'var(--text-main)',
                              cursor: index === 0 ? 'not-allowed' : 'pointer',
                              fontSize: '10px',
                              opacity: index === 0 ? 0.3 : 0.8,
                              transition: 'all 0.2s',
                            }}
                            onMouseOver={e => {
                              if (index !== 0) {
                                e.currentTarget.style.background = 'rgba(0, 229, 255, 0.15)';
                                e.currentTarget.style.borderColor = 'var(--accent-cyan)';
                                e.currentTarget.style.color = 'var(--accent-cyan)';
                              }
                            }}
                            onMouseOut={e => {
                              if (index !== 0) {
                                e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                                e.currentTarget.style.color = 'var(--text-main)';
                              }
                            }}
                            title="Move Up"
                          >
                            ▲
                          </button>
                          <button
                            disabled={index === classHierarchy.length - 1}
                            onClick={() => handleMoveClass(index, 'down')}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '24px',
                              height: '24px',
                              borderRadius: '50%',
                              background: 'rgba(255,255,255,0.05)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              color: 'var(--text-main)',
                              cursor: index === classHierarchy.length - 1 ? 'not-allowed' : 'pointer',
                              fontSize: '10px',
                              opacity: index === classHierarchy.length - 1 ? 0.3 : 0.8,
                              transition: 'all 0.2s',
                            }}
                            onMouseOver={e => {
                              if (index !== classHierarchy.length - 1) {
                                e.currentTarget.style.background = 'rgba(0, 229, 255, 0.15)';
                                e.currentTarget.style.borderColor = 'var(--accent-cyan)';
                                e.currentTarget.style.color = 'var(--accent-cyan)';
                              }
                            }}
                            onMouseOut={e => {
                              if (index !== classHierarchy.length - 1) {
                                e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                                e.currentTarget.style.color = 'var(--text-main)';
                              }
                            }}
                            title="Move Down"
                          >
                            ▼
                          </button>
                          <button
                            onClick={() => handleRemoveClassFromHierarchy(index)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '24px',
                              height: '24px',
                              borderRadius: '50%',
                              background: 'rgba(239, 68, 68, 0.05)',
                              border: '1px solid rgba(239, 68, 68, 0.15)',
                              color: 'var(--danger)',
                              cursor: 'pointer',
                              fontSize: '12px',
                              transition: 'all 0.2s',
                            }}
                            onMouseOver={e => {
                              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                              e.currentTarget.style.borderColor = 'var(--danger)';
                              e.currentTarget.style.transform = 'scale(1.1)';
                            }}
                            onMouseOut={e => {
                              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.05)';
                              e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.15)';
                              e.currentTarget.style.transform = 'scale(1)';
                            }}
                            title="Remove Class"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {classHierarchy.length === 0 && (
                    <div style={{ color: 'var(--text-dim)', fontSize: '12px', textAlign: 'center', padding: '10px' }}>
                      Loading…
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input
                    type="text"
                    className="modern-input"
                    value={newClassInput}
                    onChange={e => setNewClassInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddClassToHierarchy()}
                    placeholder="e.g. Nursery 1"
                    style={{ flex: 1, fontSize: '12px' }}
                  />
                  <button
                    onClick={handleAddClassToHierarchy}
                    className="primary-btn"
                    style={{ background: '#10b981', border: 'none', color: '#000', whiteSpace: 'nowrap' }}
                  >
                    + Add
                  </button>
                </div>
                <button className="secondary-btn" onClick={handleSaveHierarchy} style={{ width: '100%', justifyContent: 'center' }}>
                  💾 Save Hierarchy
                </button>
              </div>

              {/* Pass Mark */}
              <div className="card" style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)' }}>
                <h4 style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-dim)', margin: '0 0 12px', letterSpacing: '1px' }}>GLOBAL PASS MARK (%)</h4>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="number"
                    className="modern-input"
                    min="0"
                    max="100"
                    value={passMark}
                    onChange={e => setPassMark(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                    style={{ flex: 1 }}
                  />
                  <button onClick={handleSavePassMark} className="primary-btn">
                    Save
                  </button>
                </div>
                <p style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '6px' }}>Minimum score for promotion recommendation.</p>
              </div>

              {/* Rollover */}
              <div className="card" style={{ padding: '16px', background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <h4 style={{ fontSize: '11px', fontWeight: 800, color: '#ef4444', margin: '0 0 6px', letterSpacing: '1px' }}>ACADEMIC ROLLOVER</h4>
                <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '12px', lineHeight: 1.4 }}>
                  Current Session: <strong style={{ color: '#fff' }}>{activeSession}</strong>
                </p>
                <button
                  onClick={handleRollover}
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: 'transparent',
                    border: '1px dashed #ef4444',
                    color: '#ef4444',
                    cursor: 'pointer',
                    borderRadius: '6px',
                    fontSize: '13px',
                  }}
                >
                  End Session &amp; Rollover →
                </button>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
