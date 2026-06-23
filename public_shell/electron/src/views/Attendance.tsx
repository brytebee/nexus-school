import React, { useState, useEffect } from 'react';
import { useLicense } from '../hooks/useLicense';
import { DataTable, Column } from '../components/DataTable';
import { Combobox } from '../components/Combobox';
import { useClassArms } from '../hooks/useClassArms';

interface AttendanceRecord {
  student: {
    id: string;
    name: string;
  };
  status: 'Present' | 'Absent' | 'Late';
}

interface TruancyRow {
  student_id: string;
  student_name: string;
  class_name: string;
  flag_count: number;
  escalation_step: number;
  last_flagged?: string;
}

interface EscalationStep {
  step: number;
  notify: 'form_teacher' | 'principal' | 'parent';
  trigger_after: number;
  channel: 'in-app' | 'whatsapp';
}

export function Attendance() {
  const { license } = useLicense();
  const { fullList } = useClassArms();
  const currentTier = license?.tier || 'Silver';
  const isDiamond = currentTier === 'Diamond';

  // Navigation tabs: 'register' | 'radar' | 'reports' | 'settings'
  const [activeSubTab, setActiveSubTab] = useState<'register' | 'radar' | 'reports' | 'settings'>('register');

  // Register State
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [register, setRegister] = useState<AttendanceRecord[]>([]);
  const [registerSearch, setRegisterSearch] = useState('');
  const [registerPage, setRegisterPage] = useState(0);
  const [savingRegister, setSavingRegister] = useState(false);
  const limit = 15;

  // Truancy Radar State
  const [truancyRows, setTruancyRows] = useState<TruancyRow[]>([]);
  const [loadingRadar, setLoadingRadar] = useState(false);

  // Settings State
  const [enableDaily, setEnableDaily] = useState(true);
  const [enableSubject, setEnableSubject] = useState(false);
  const [escalationFlow, setEscalationFlow] = useState<EscalationStep[]>([]);
  const [savingSettings, setSavingSettings] = useState(false);

  // Edit Escalation State
  const [isEscalationModalOpen, setIsEscalationModalOpen] = useState(false);
  const [editingStepIdx, setEditingStepIdx] = useState<number | null>(null);
  const [stepNotify, setStepNotify] = useState<'form_teacher' | 'principal' | 'parent'>('form_teacher');
  const [stepTriggerAfter, setStepTriggerAfter] = useState(1);

  // Reports Query State
  const [reportClass, setReportClass] = useState('');
  const [reportStudents, setReportStudents] = useState<{ id: string; name: string }[]>([]);
  const [reportStudentId, setReportStudentId] = useState('');
  const [reportSession, setReportSession] = useState('');
  const [reportTerm, setReportTerm] = useState('');
  const [queryLoading, setQueryLoading] = useState(false);
  
  // Reports Output State
  const [reportStats, setReportStats] = useState<{ present: number; absent: number; late: number; percentage: number } | null>(null);
  const [reportHistory, setReportHistory] = useState<{ date: string; status: string }[]>([]);

  // Load term details and classes
  useEffect(() => {
    const initData = async () => {
      if (!window.electronAPI) return;
      try {
        // Get term config for queries
        const termCfg = await window.electronAPI.getTermConfig();
        if (termCfg) {
          setReportSession(termCfg.academic_session || '2025/2026');
          setReportTerm(termCfg.term || 'First Term');
        }

        // Get attendance settings
        const settingsRes = await window.electronAPI.attendance.getSettings();
        if (settingsRes?.ok && settingsRes.settings) {
          setEnableDaily(settingsRes.settings.enable_daily_attendance === true || settingsRes.settings.enable_daily_attendance === 'true');
          setEnableSubject(settingsRes.settings.enable_subject_attendance === true || settingsRes.settings.enable_subject_attendance === 'true');
          setEscalationFlow(settingsRes.settings.truancy_escalation_flow || []);
        }
      } catch (err) {
        console.error('Failed initialization:', err);
      }
    };
    initData();
  }, []);

  // Sync current register list when class/date changes
  useEffect(() => {
    const fetchRegister = async () => {
      if (!selectedClass || !selectedDate || !window.electronAPI) return;
      try {
        // Always load students for the selected class first
        const studRes = await window.electronAPI.getAllStudents({ class_name: selectedClass, limit: 1000, minimal: true });
        const filteredStudents = studRes?.data || [];

        // Build a map of any already-saved attendance for this class/date
        const attMap: Record<string, 'Present' | 'Absent' | 'Late'> = {};
        if (window.electronAPI.getDailyAttendance) {
          try {
            const res = await window.electronAPI.getDailyAttendance({ class_name: selectedClass, date: selectedDate });
            if (res?.ok) {
              (res.data || []).forEach((r: any) => {
                attMap[r.student_id] = r.status;
              });
            }
          } catch (_) {
            // No saved record yet — that's fine, default to Present
          }
        }

        // Merge: student roster + saved statuses (default Present)
        const reg = filteredStudents.map((s: any) => ({
          student: { id: s.id, name: s.name },
          status: attMap[s.id] || 'Present',
        }));

        setRegister(reg);
        setRegisterPage(0);
      } catch (err) {
        console.error('Error fetching attendance register:', err);
      }
    };
    fetchRegister();
  }, [selectedClass, selectedDate]);

  // Load Truancy Radar rows when tab is opened
  useEffect(() => {
    if (activeSubTab === 'radar' && isDiamond) {
      fetchTruancyFlags();
    }
  }, [activeSubTab, currentTier]);

  const fetchTruancyFlags = async () => {
    if (!window.electronAPI?.attendance?.getTruancyFlags) return;
    setLoadingRadar(true);
    try {
      const res = await window.electronAPI.attendance.getTruancyFlags();
      if (res && res.ok) {
        setTruancyRows(res.rows || []);
      }
    } catch (err) {
      console.error('Error loading truancy radar:', err);
    } finally {
      setLoadingRadar(false);
    }
  };

  // Class selection for queries updates the student list suggestion
  useEffect(() => {
    const updateQueryStudents = async () => {
      if (!window.electronAPI) return;
      try {
        const studRes = await window.electronAPI.getAllStudents({ class_name: reportClass, limit: 1000, minimal: true });
        const filtered = studRes?.data || [];
        setReportStudents(filtered.map((s: any) => ({ id: s.id, name: s.name })));
        setReportStudentId('');
      } catch (err) {
        console.error('Error loading students for report:', err);
      }
    };
    updateQueryStudents();
  }, [reportClass]);

  // Save register records
  const handleSaveRegister = async () => {
    if (!selectedClass || !selectedDate || !register.length || !window.electronAPI?.saveDailyAttendance) return;
    setSavingRegister(true);
    const Swal = (window as any).Swal;
    try {
      const termCfg = await window.electronAPI.getTermConfig();
      const session = termCfg?.academic_session || '2025/2026';
      const term = termCfg?.term || 'First Term';

      const res = await window.electronAPI.saveDailyAttendance({
        class_name: selectedClass,
        date: selectedDate,
        session,
        term,
        records: register.map(r => ({ student_id: r.student.id, status: r.status })),
      });

      if (res && res.ok) {
        if (Swal) {
          Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Register saved successfully', showConfirmButton: false, timer: 2800, background: '#0d1235', color: '#fff' });
        }
      } else {
        if (Swal) {
          Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Save failed: ' + res.error, showConfirmButton: false, timer: 3500, background: '#0d1235', color: '#fff' });
        }
      }
    } catch (err: any) {
      if (Swal) {
        Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Failed saving attendance', showConfirmButton: false, timer: 3500, background: '#0d1235', color: '#fff' });
      }
    } finally {
      setSavingRegister(false);
    }
  };

  // Update status locally in staged register
  const handleStatusChange = (studentId: string, status: 'Present' | 'Absent' | 'Late') => {
    setRegister(prev =>
      prev.map(r => (r.student.id === studentId ? { ...r, status } : r))
    );
  };

  // Dismiss truancy flag
  const handleDismissTruancy = async (studentId: string) => {
    if (!window.electronAPI?.attendance?.dismissTruancyFlag) return;
    try {
      // Use the correct nested API path (window.electronAPI.attendance.*)
      const res = await window.electronAPI.attendance.dismissTruancyFlag({ student_id: studentId });
      if (res.ok) {
        fetchTruancyFlags();
      }
    } catch (err) {
      console.error('Failed dismissing truancy flag:', err);
    }
  };

  // Settings: save configs
  const handleSaveSettings = async () => {
    if (!window.electronAPI?.attendance?.saveSettings) return;
    setSavingSettings(true);
    const Swal = (window as any).Swal;
    try {
      const res = await window.electronAPI.attendance.saveSettings({
        enable_daily_attendance: enableDaily,
        enable_subject_attendance: isDiamond ? enableSubject : false,
        truancy_escalation_flow: escalationFlow,
      });
      if (res.ok) {
        if (Swal) {
          Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Attendance settings saved', showConfirmButton: false, timer: 2800, background: '#0d1235', color: '#fff' });
        }
      } else {
        if (Swal) {
          Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Failed: ' + res.error, showConfirmButton: false, timer: 3500, background: '#0d1235', color: '#fff' });
        }
      }
    } catch (err: any) {
      if (Swal) {
        Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Error saving settings', showConfirmButton: false, timer: 3500, background: '#0d1235', color: '#fff' });
      }
    } finally {
      setSavingSettings(false);
    }
  };

  // Add/Edit Escalation step
  const handleOpenEscalationModal = (idx: number | null) => {
    setEditingStepIdx(idx);
    if (idx !== null) {
      const step = escalationFlow[idx];
      setStepNotify(step.notify);
      setStepTriggerAfter(step.trigger_after);
    } else {
      setStepNotify('form_teacher');
      setStepTriggerAfter(1);
    }
    setIsEscalationModalOpen(true);
  };

  const handleSaveEscalationStep = () => {
    setEscalationFlow(prev => {
      const copy = [...prev];
      const channel = stepNotify === 'parent' ? 'whatsapp' : 'in-app';
      if (editingStepIdx !== null) {
        copy[editingStepIdx] = {
          step: copy[editingStepIdx].step,
          notify: stepNotify,
          trigger_after: stepTriggerAfter,
          channel,
        };
      } else {
        copy.push({
          step: copy.length + 1,
          notify: stepNotify,
          trigger_after: stepTriggerAfter,
          channel,
        });
      }
      return copy;
    });
    setIsEscalationModalOpen(false);
  };

  const handleRemoveEscalationStep = (idx: number) => {
    setEscalationFlow(prev => prev.filter((_, i) => i !== idx).map((step, i) => ({ ...step, step: i + 1 })));
  };

  // Query Reports
  const handleQueryReport = async () => {
    if (!reportStudentId || !window.electronAPI?.getStudentAttendanceReport) return;
    setQueryLoading(true);
    try {
      // Backend returns raw records (no stats, no session/term filter) — we do it client-side
      const res = await window.electronAPI.getStudentAttendanceReport({
        student_id: reportStudentId,
      });
      if (res && res.ok) {
        // Filter by session and term if specified
        const filtered = (res.data || []).filter((r: any) => {
          const sessMatch = !reportSession || r.academic_session === reportSession;
          const termMatch = !reportTerm || r.term === reportTerm;
          return sessMatch && termMatch;
        });

        // Compute stats from filtered records
        const present = filtered.filter((r: any) => r.status === 'Present').length;
        const absent  = filtered.filter((r: any) => r.status === 'Absent').length;
        const late    = filtered.filter((r: any) => r.status === 'Late').length;
        const total   = filtered.length;
        const percentage = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

        setReportStats({ present, absent, late, percentage });
        setReportHistory(
          filtered
            .sort((a: any, b: any) => (b.date > a.date ? 1 : -1))
            .map((r: any) => ({ date: r.date, status: r.status }))
        );
      }
    } catch (err) {
      console.error('Error fetching student report:', err);
    } finally {
      setQueryLoading(false);
    }
  };

  // Filter Register Results
  const filteredRegister = register.filter(r =>
    (r.student.name || '').toLowerCase().includes(registerSearch.toLowerCase()) ||
    (r.student.id || '').toLowerCase().includes(registerSearch.toLowerCase())
  );
  
  const paginatedRegister = filteredRegister.slice(
    registerPage * limit,
    (registerPage + 1) * limit
  );

  return (
    <>
      <div className="fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--grid-gap)' }}>
      {/* Header Bar */}
      <div className="view-header">
        <div>
          <h2 className="view-title">📅 Attendance Module</h2>
          <p className="view-sub">
            Daily roll calls, truancy alerts, and Guardian Shield parent WhatsApp alerts.
          </p>
        </div>
        <div className="view-header-actions">
          {activeSubTab === 'register' && selectedClass && register.length > 0 && (
            <button
              onClick={handleSaveRegister}
              disabled={savingRegister}
              className="primary-btn"
              style={{ padding: '8px 18px', fontSize: '13px', fontWeight: 700 }}
            >
              <span>{savingRegister ? '⏳' : '💾'}</span>
              <span>{savingRegister ? 'Saving...' : 'Save Register'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Tab Navigation — V1 fees-tab-btn underline rail */}
      <div style={{ display: 'flex', gap: '4px', padding: '0 20px', borderBottom: '1px solid var(--glass-border)', flexShrink: 0, marginBottom: '0' }}>
        <button
          onClick={() => setActiveSubTab('register')}
          className={`fees-tab-btn${activeSubTab === 'register' ? ' active' : ''}`}
        >
          📋 Daily Register
        </button>
        <button
          onClick={() => {
            if (isDiamond) {
              setActiveSubTab('radar');
              return;
            }
            const Swal = (window as any).Swal;
            if (Swal) {
              Swal.fire({
                title: '<span style="color:#00E5FF; font-size:24px; font-weight:700;">💎 Diamond Exclusive</span>',
                html: `
                    <div style="text-align: left; padding: 10px 5px; font-family: 'Inter', sans-serif;">
                        <p style="color: #fff; font-size: 14px; margin-bottom: 15px; line-height: 1.5;">
                            The <strong>Truancy Radar & Guardian Shield</strong> is exclusive to our <strong>Diamond Tier</strong> partner schools.
                        </p>
                        <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 15px;">
                            <div style="display: flex; gap: 10px; align-items: flex-start;">
                                <span style="font-size: 18px;">🚨</span>
                                <div>
                                    <strong style="color: #fff; font-size: 13px;">Subject-Level Tracking</strong>
                                    <div style="color: #aaa; font-size: 11px; margin-top: 2px;">Track attendance period-by-period rather than once a day.</div>
                                </div>
                            </div>
                            <div style="display: flex; gap: 10px; align-items: flex-start;">
                                <span style="font-size: 18px;">🛡️</span>
                                <div>
                                    <strong style="color: #fff; font-size: 13px;">Guardian Shield Escalation</strong>
                                    <div style="color: #aaa; font-size: 11px; margin-top: 2px;">Set up automatic alert triggers for Form Teachers, Principals, and Parents.</div>
                                </div>
                            </div>
                            <div style="display: flex; gap: 10px; align-items: flex-start;">
                                <span style="font-size: 18px;">💬</span>
                                <div>
                                    <strong style="color: #fff; font-size: 13px;">Parent WhatsApp Integration</strong>
                                    <div style="color: #aaa; font-size: 11px; margin-top: 2px;">Instantly notify parents on their mobile phones when a class is skipped.</div>
                                </div>
                            </div>
                        </div>
                    </div>
                `,
                confirmButtonText: 'Secure Your Upgrade',
                confirmButtonColor: '#00E5FF',
                showCancelButton: true,
                cancelButtonText: 'Maybe Later',
                cancelButtonColor: '#ef4444',
                background: '#0b0f19',
                color: '#fff',
                customClass: {
                    popup: 'premium-swal-popup',
                    confirmButton: 'premium-swal-confirm',
                    cancelButton: 'premium-swal-cancel'
                }
              }).then((result: any) => {
                if (result.isConfirmed) {
                  Swal.fire({
                    title: 'Upgrade Initiated',
                    text: 'Please contact the Sovereign operations team or visit your portal at nexusos.com.ng to request an upgrade to Diamond.',
                    icon: 'success',
                    confirmButtonText: 'Got it',
                    confirmButtonColor: '#00E5FF',
                    background: '#0b0f19',
                    color: '#fff'
                  });
                }
              });
            } else {
              alert('Truancy Radar requires the Diamond Tier upgrade.');
            }
          }}
          className={`fees-tab-btn${activeSubTab === 'radar' ? ' active' : ''}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
        >
          🚨 Truancy Radar
          {!isDiamond && <span style={{ fontSize: '10px' }}>💎</span>}
        </button>
        <button
          onClick={() => setActiveSubTab('reports')}
          className={`fees-tab-btn${activeSubTab === 'reports' ? ' active' : ''}`}
        >
          📊 Query Reports
        </button>
        <button
          onClick={() => setActiveSubTab('settings')}
          className={`fees-tab-btn${activeSubTab === 'settings' ? ' active' : ''}`}
        >
          ⚙️ Rules Setup
        </button>
      </div>

      {/* RENDER VIEW: Daily Register */}
      {activeSubTab === 'register' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--grid-gap)' }}>

          {/* Register Controls Card — Cloud Bridge pattern */}
          <div style={{ background: 'var(--glass)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* Card header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-border)', paddingBottom: '12px' }}>
              <div>
                <h3 style={{
                  fontSize: 'var(--text-h3)',
                  fontWeight: 600,
                  color: 'var(--text-main)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  letterSpacing: 'var(--tracking-h)',
                  margin: 0
                }}>
                  📋 Register Controls
                </h3>
                <p style={{
                  fontSize: 'var(--text-body)',
                  color: 'var(--text-dim)',
                  lineHeight: 'var(--lh-body)',
                  marginTop: '4px',
                  margin: 0
                }}>
                  Select a class and date to load the active roll call roster.
                </p>
              </div>
              {/* Save button moved to view header actions */}
            </div>

            {/* Filter sub-items */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <div className="form-group">
                <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '2px' }}>Class Room</label>
                <Combobox
                  options={fullList}
                  value={selectedClass}
                  onChange={setSelectedClass}
                  placeholder="Select Class..."
                />
              </div>
              <div className="form-group">
                <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '2px' }}>Roll Date</label>
                <input
                  type="date"
                  max={new Date().toISOString().split('T')[0]}
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="modern-input"
                  style={{ fontFamily: 'var(--font-mono)', cursor: 'pointer' }}
                />
              </div>
            </div>
          </div>

          {selectedClass ? (
            <>
              {/* Filter search bar */}
              <div style={{ width: '100%', display: 'flex', position: 'relative', alignItems: 'center' }}>
                <span style={{ position: 'absolute', left: '16px', color: 'var(--text-dim)', fontSize: '14px', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                  🔍
                </span>
                <input
                  type="text"
                  value={registerSearch}
                  onChange={(e) => {
                    setRegisterSearch(e.target.value);
                    setRegisterPage(0);
                  }}
                  placeholder="Filter student register list by name or ID..."
                  className="modern-input"
                  style={{ width: '100%', padding: '12px 16px 12px 42px', fontSize: '13px', borderRadius: 'var(--radius-md)' }}
                />
                {registerSearch && (
                  <button
                    onClick={() => {
                      setRegisterSearch('');
                      setRegisterPage(0);
                    }}
                    style={{
                      position: 'absolute',
                      right: '16px',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-dim)',
                      cursor: 'pointer',
                      fontSize: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '4px',
                      transition: 'color 0.2s',
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Table list */}
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ padding: '12px 24px', textAlign: 'left' }}>Student details</th>
                      <th style={{ padding: '12px 24px', textAlign: 'center', width: '320px' }}>Attendance Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRegister.length === 0 ? (
                      <tr>
                        <td colSpan={2} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-dim)' }}>
                          No students found in the register.
                        </td>
                      </tr>
                    ) : (
                      paginatedRegister.map(row => (
                        <tr key={row.student.id}>
                          <td style={{ padding: '14px 24px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                background: 'linear-gradient(135deg, rgba(0, 229, 255, 0.12) 0%, rgba(140, 158, 255, 0.12) 100%)',
                                border: '1px solid rgba(0, 229, 255, 0.2)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '11px',
                                fontWeight: 700,
                                color: 'var(--accent)',
                                textTransform: 'uppercase',
                                flexShrink: 0
                              }}>
                                {row.student.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                              </div>
                              <div>
                                <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '13px' }}>{row.student.name}</div>
                                <div style={{ fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>{row.student.id}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '14px 24px', textAlign: 'center' }}>
                            <div style={{
                              display: 'inline-flex',
                              gap: '6px',
                              background: 'rgba(0, 0, 0, 0.45)',
                              padding: '4px',
                              borderRadius: 'var(--radius-sm)',
                              border: '1px solid var(--glass-border)',
                              fontSize: '11px'
                            }}>
                              {(['Present', 'Absent', 'Late'] as const).map(status => {
                                const isChecked = row.status === status;
                                const btnStyle: React.CSSProperties = isChecked
                                  ? status === 'Present'
                                    ? {
                                        background: 'rgba(0, 230, 118, 0.12)',
                                        borderColor: 'var(--accent-green)',
                                        color: 'var(--accent-green)',
                                        boxShadow: '0 0 12px rgba(0, 230, 118, 0.15)'
                                      }
                                    : status === 'Absent'
                                      ? {
                                          background: 'rgba(239, 68, 68, 0.12)',
                                          borderColor: 'var(--danger)',
                                          color: 'var(--danger)',
                                          boxShadow: '0 0 12px rgba(239, 68, 68, 0.15)'
                                        }
                                      : {
                                          background: 'rgba(245, 158, 11, 0.12)',
                                          borderColor: 'var(--warning)',
                                          color: 'var(--warning)',
                                          boxShadow: '0 0 12px rgba(245, 158, 11, 0.15)'
                                        }
                                  : {
                                      color: 'var(--text-dim)',
                                      background: 'transparent',
                                      borderColor: 'transparent'
                                    };
                                return (
                                  <button
                                    key={status}
                                    type="button"
                                    onClick={() => handleStatusChange(row.student.id, status)}
                                    style={{
                                      padding: '6px 14px',
                                      borderRadius: 'var(--radius-sm)',
                                      cursor: 'pointer',
                                      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                      border: '1px solid',
                                      fontSize: '11px',
                                      fontWeight: isChecked ? 700 : 500,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '5px',
                                      ...btnStyle
                                    }}
                                  >
                                    <span style={{
                                      width: '6px',
                                      height: '6px',
                                      borderRadius: '50%',
                                      background: status === 'Present' ? 'var(--accent-green)' : status === 'Absent' ? 'var(--danger)' : 'var(--warning)',
                                      opacity: isChecked ? 1 : 0.4,
                                      transition: 'opacity 0.2s'
                                    }} />
                                    {status}
                                  </button>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {filteredRegister.length > limit && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'rgba(0, 0, 0, 0.15)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '12px 20px',
                  flexShrink: 0,
                  gap: '16px',
                  flexWrap: 'wrap'
                }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-dim)', fontWeight: 500 }}>
                    Showing {registerPage * limit + 1} to {Math.min((registerPage + 1) * limit, filteredRegister.length)} of {filteredRegister.length} students
                  </span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => setRegisterPage(p => Math.max(0, p - 1))}
                      disabled={registerPage === 0}
                      className="secondary-btn"
                      style={{ padding: '6px 12px', fontSize: '11px', borderRadius: 'var(--radius-sm)', minWidth: '70px', justifyContent: 'center' }}
                    >
                      ← Prev
                    </button>
                    <button
                      onClick={() => setRegisterPage(p => p + 1)}
                      disabled={(registerPage + 1) * limit >= filteredRegister.length}
                      className="secondary-btn"
                      style={{ padding: '6px 12px', fontSize: '11px', borderRadius: 'var(--radius-sm)', minWidth: '70px', justifyContent: 'center' }}
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{
              border: '1px dashed var(--glass-border)',
              background: 'rgba(255,255,255,0.01)',
              padding: '64px 24px',
              textAlign: 'center',
              borderRadius: 'var(--radius-lg)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '16px',
              boxShadow: 'inset 0 0 40px rgba(0,0,0,0.2)'
            }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, rgba(0, 229, 255, 0.08) 0%, rgba(140, 158, 255, 0.08) 100%)',
                border: '1px solid rgba(0, 229, 255, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '28px',
                color: 'var(--accent)',
                marginBottom: '4px'
              }}>
                📅
              </div>
              <h3 style={{
                fontSize: 'var(--text-h3)',
                fontWeight: 700,
                color: 'var(--text-main)',
                letterSpacing: 'var(--tracking-h)',
                margin: 0
              }}>
                Roster Load Required
              </h3>
              <p style={{
                fontSize: 'var(--text-body)',
                color: 'var(--text-dim)',
                maxWidth: '340px',
                lineHeight: 'var(--lh-body)',
                margin: 0
              }}>
                Select a classroom name and date above to generate the active roll call register.
              </p>
            </div>
          )}
        </div>
      )}

      {/* RENDER VIEW: Truancy Radar */}
      {activeSubTab === 'radar' && isDiamond && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--grid-gap)' }}>

              {/* Radar header card — Cloud Bridge pattern */}
              <div style={{ background: 'var(--glass)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: '22px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-border)', paddingBottom: '12px' }}>
                  <div>
                    <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
                      🚨 Truancy Radar
                    </h4>
                    <p style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '2px', margin: 0 }}>
                      Tracks chronic absences across class registers. Dismissing a flag resets the escalation ladder.
                    </p>
                  </div>
                  <span style={{ fontSize: '9px', fontWeight: 900, color: 'var(--danger)', background: 'rgba(239, 68, 68, 0.1)', padding: '2px 8px', borderRadius: '9999px', border: '1px solid rgba(239, 68, 68, 0.2)', textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>
                    Diamond
                  </span>
                </div>
                <div style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: 'var(--radius-lg)', padding: '14px 18px', fontSize: '12px', color: 'var(--danger)', lineHeight: '1.6' }}>
                  Students who breach the configured absence threshold automatically escalate through the Guardian Shield flow below.
                </div>
              </div>

              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ padding: '12px 24px', textAlign: 'left' }}>Student Name</th>
                      <th style={{ padding: '12px 24px', textAlign: 'left' }}>Class</th>
                      <th style={{ padding: '12px 24px', textAlign: 'center' }}>Flag Count</th>
                      <th style={{ padding: '12px 24px', textAlign: 'left' }}>Escalation Status</th>
                      <th style={{ padding: '12px 24px', textAlign: 'left' }}>Last Flagged</th>
                      <th style={{ padding: '12px 24px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingRadar ? (
                      <tr>
                        <td colSpan={6} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                          Analyzing truancy radar indexes...
                        </td>
                      </tr>
                    ) : truancyRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-dim)', fontWeight: 500 }}>
                          ✅ No active truancy thresholds breached. All rosters are currently clean.
                        </td>
                      </tr>
                    ) : (
                      truancyRows.map(row => {
                        const stepColor =
                          row.escalation_step >= 3
                            ? 'var(--danger)'
                            : row.escalation_step >= 2
                              ? 'var(--warning)'
                              : 'var(--accent)';

                        const stepLabels: Record<number, string> = {
                          0: '—',
                          1: '🧑‍🏫 Form Teacher',
                          2: '👤 Principal',
                          3: '📱 Parent Notified',
                        };

                        return (
                          <tr key={row.student_id}>
                            <td style={{ padding: '12px 24px', fontWeight: 'bold', color: 'var(--text-main)' }}>{row.student_name}</td>
                            <td style={{ padding: '12px 24px', color: 'var(--text-dim)' }}>{row.class_name}</td>
                            <td style={{ padding: '12px 24px', textAlign: 'center', fontWeight: 'bold', color: stepColor }}>{row.flag_count}</td>
                            <td style={{ padding: '12px 24px', fontWeight: 600, color: stepColor }}>
                              {stepLabels[row.escalation_step] || row.escalation_step}
                            </td>
                            <td style={{ padding: '12px 24px', color: 'var(--text-dim)', fontSize: '12px' }}>
                              {row.last_flagged || '—'}
                            </td>
                            <td style={{ padding: '12px 24px', textAlign: 'right' }}>
                              <button
                                onClick={() => handleDismissTruancy(row.student_id)}
                                className="secondary-btn"
                                style={{ borderColor: 'rgba(0, 230, 118, 0.4)', color: 'var(--accent-green)', padding: '4px 10px', fontSize: '11px', borderRadius: '4px' }}
                              >
                                Dismiss
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

      {/* RENDER VIEW: Query Reports */}
      {activeSubTab === 'reports' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--grid-gap)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--grid-gap)', alignItems: 'flex-start' }}>

            {/* Query Form — Cloud Bridge pattern */}
            <div style={{ flex: '1 1 300px', maxWidth: '100%', background: 'var(--glass)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: '22px', display: 'flex', flexDirection: 'column', gap: '18px', height: 'fit-content' }}>
              {/* Card header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-border)', paddingBottom: '12px' }}>
                <div>
                  <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
                    📊 Scope Parameters
                  </h4>
                  <p style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '2px', margin: 0 }}>
                    Filter by class, student, session and term.
                  </p>
                </div>
                <span style={{ fontSize: '9px', fontWeight: 900, color: 'var(--accent)', background: 'rgba(0, 229, 255, 0.1)', padding: '2px 8px', borderRadius: '9999px', border: '1px solid rgba(0, 229, 255, 0.15)', textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>
                  Query
                </span>
              </div>

              {/* Form Fields container */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Class Room form group */}
                <div className="form-group">
                  <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Class Room</label>
                  <Combobox
                    options={['All Classes', ...fullList]}
                    value={reportClass || 'All Classes'}
                    onChange={(val) => setReportClass(val === 'All Classes' ? '' : val)}
                    placeholder="All Classes"
                  />
                </div>

                {/* Target Student form group */}
                <div className="form-group">
                  <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Target Student <span style={{ color: 'var(--accent)' }}>*</span>
                  </label>
                  <select value={reportStudentId} onChange={(e) => setReportStudentId(e.target.value)} className="modern-input">
                    <option value="">Select Student...</option>
                    {reportStudents.map(s => <option key={s.id} value={s.id}>{s.name} ({s.id})</option>)}
                  </select>
                </div>

                {/* Academic Period form group */}
                <div className="form-group">
                  <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Academic Period</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>Session</span>
                      <input type="text" value={reportSession} onChange={(e) => setReportSession(e.target.value)} placeholder="2025/2026" className="modern-input" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>Term</span>
                      <input type="text" value={reportTerm} onChange={(e) => setReportTerm(e.target.value)} placeholder="First Term" className="modern-input" />
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={handleQueryReport}
                disabled={queryLoading || !reportStudentId}
                className="primary-btn"
                style={{ width: '100%', justifyContent: 'center', marginTop: '6px' }}
              >
                🔍 {queryLoading ? 'Loading records...' : 'Query Records'}
              </button>
            </div>

            {/* Results display panel */}
            <div style={{ flex: '2 2 600px', maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--grid-gap)' }}>
              {reportStats ? (
                <>
                  {/* Report Actions header — Cloud Bridge pattern */}
                  <div style={{ background: 'var(--glass)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: '22px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-border)', paddingBottom: '12px' }}>
                      <div>
                        <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent-gold)', display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
                          📊 Active Student Report
                        </h4>
                        <p style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '2px', margin: 0 }}>Attendance ledger loaded. Export or share below.</p>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                        <button onClick={() => alert('Print / PDF not configured')} className="small-btn">🖨 Print</button>
                        <button onClick={() => alert('WhatsApp via Guardian Shield')} className="small-btn" style={{ borderColor: 'rgba(37,211,102,0.4)', color: '#25D366' }}>💬 WhatsApp</button>
                        <button onClick={() => alert('Email not configured')} className="small-btn" style={{ borderColor: 'rgba(59,130,246,0.35)', color: '#60A5FA' }}>✉ Email</button>
                      </div>
                    </div>

                    {/* Stats inline */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '12px' }}>
                      <div className="stat-card"><span className="stat-label">Present</span><span className="stat-value" style={{ color: 'var(--success)' }}>{reportStats.present}</span></div>
                      <div className="stat-card"><span className="stat-label">Absent</span><span className="stat-value" style={{ color: 'var(--danger)' }}>{reportStats.absent}</span></div>
                      <div className="stat-card"><span className="stat-label">Late</span><span className="stat-value" style={{ color: 'var(--warning)' }}>{reportStats.late}</span></div>
                      <div className="stat-card"><span className="stat-label">Roll Freq.</span><span className="stat-value">{reportStats.percentage}%</span></div>
                    </div>
                  </div>

                  {/* History Logs — Cloud Bridge pattern */}
                  <div style={{ background: 'var(--glass)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: '22px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-border)', paddingBottom: '12px' }}>
                      <div>
                        <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
                          📅 Term Attendance Timeline
                        </h4>
                        <p style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '2px', margin: 0 }}>Day-by-day attendance log for the selected term.</p>
                      </div>
                      <span style={{ fontSize: '9px', fontWeight: 900, color: 'var(--accent)', background: 'rgba(0,229,255,0.1)', padding: '2px 8px', borderRadius: '9999px', border: '1px solid rgba(0,229,255,0.15)', textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>
                        {reportHistory.length} entries
                      </span>
                    </div>
                    <div className="table-container" style={{ maxHeight: '320px' }}>
                      <table className="data-table" style={{ fontSize: '12px' }}>
                        <thead>
                          <tr>
                            <th style={{ padding: '10px 16px', textAlign: 'left' }}>Date</th>
                            <th style={{ padding: '10px 16px', textAlign: 'right' }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportHistory.map((row, idx) => {
                            const statusColor = row.status === 'Present' ? 'var(--success)' : row.status === 'Absent' ? 'var(--danger)' : 'var(--warning)';
                            return (
                              <tr key={idx}>
                                <td style={{ padding: '10px 16px', fontWeight: 500, color: 'var(--text-main)' }}>{row.date}</td>
                                <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: statusColor }}>{row.status}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ border: '1px dashed var(--glass-border)', background: 'rgba(255,255,255,0.02)', padding: '64px var(--card-pad)', textAlign: 'center', borderRadius: 'var(--radius-lg)', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '36px' }}>📊</span>
                  <h3 style={{ fontSize: 'var(--text-h3)', fontWeight: 700, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>No Report Loaded</h3>
                  <p style={{ fontSize: 'var(--text-body)', color: 'var(--text-dim)', maxWidth: '380px', lineHeight: 'var(--lh-body)', margin: 0 }}>
                    Select a student scope and run the query indexer to fetch attendance statistics and logs.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* RENDER VIEW: Rules Setup */}
      {activeSubTab === 'settings' && (
        <div className="attendance-settings-content">


          {/* Left Column: Attendance Layer Configuration */}
          <div className="settings-column">
            <div style={{ background: 'var(--glass)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

              {/* Card title */}
              <h3 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0, borderBottom: 'none', paddingBottom: 0 }}>
                Attendance Layer Configuration
              </h3>

              {/* Toggle rows — flat, no sub-card wrappers */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                {/* Daily Roll toggle */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px' }}>
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)', display: 'block', marginBottom: '4px' }}>Enable Daily Attendance Roll</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-dim)', lineHeight: '1.55' }}>Activates the school-wide daily class present/absent roll registers.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={enableDaily}
                    onChange={(e) => setEnableDaily(e.target.checked)}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--accent)', cursor: 'pointer', flexShrink: 0, marginTop: '2px' }}
                  />
                </div>

                {/* Subject Roll toggle */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', opacity: isDiamond ? 1 : 0.55 }}>
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)', display: 'block', marginBottom: '4px' }}>Enable Period-Level Subject Roll</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-dim)', lineHeight: '1.55' }}>Tracks attendance subject-by-subject per period. Ideal for secondary school structures.</span>
                  </div>
                  <input
                    type="checkbox"
                    disabled={!isDiamond}
                    checked={isDiamond && enableSubject}
                    onChange={(e) => setEnableSubject(e.target.checked)}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--accent)', cursor: isDiamond ? 'pointer' : 'not-allowed', flexShrink: 0, marginTop: '2px' }}
                  />
                </div>
              </div>

              {/* Save button — full width, prominent */}
              <button
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="primary-btn"
                style={{ width: '100%', justifyContent: 'center', marginTop: 'auto', padding: '12px 24px', fontSize: '13px', fontWeight: 700 }}
              >
                <span>💾</span>
                <span>{savingSettings ? 'Saving Settings...' : 'Save Settings'}</span>
              </button>
            </div>
          </div>

          {/* Right Column: Guardian Shield Escalation Flow */}
          <div className="settings-column">
            <div style={{ background: 'var(--glass)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* Card header: title + DIAMOND TIER pill */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0, borderBottom: 'none', paddingBottom: 0 }}>
                  Guardian Shield Escalation Flow
                </h3>
                <span style={{
                  fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em',
                  padding: '3px 8px', borderRadius: '4px', flexShrink: 0,
                  border: isDiamond ? '1px solid rgba(0, 229, 255, 0.35)' : '1px solid rgba(255,255,255,0.1)',
                  background: 'transparent',
                  color: isDiamond ? 'var(--accent)' : 'var(--text-dim)'
                }}>
                  {currentTier} Tier
                </span>
              </div>

              {isDiamond ? (
                <>
                  {/* Escalation step rows — flat, numbered */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {escalationFlow.map((step, idx) => {
                      const notifyLabels: Record<string, string> = {
                        form_teacher: '🧑‍🏫 Form Teacher',
                        principal: '👤 Principal',
                        parent: '💬 Parent (WhatsApp)',
                      };
                      return (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                          {/* Step number circle */}
                          <span style={{
                            width: '28px', height: '28px', borderRadius: '50%',
                            background: 'rgba(140, 158, 255, 0.12)', border: '1px solid rgba(140, 158, 255, 0.25)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontWeight: 700, color: 'var(--accent-indigo)', fontSize: '11px', flexShrink: 0
                          }}>
                            {step.step}
                          </span>

                          {/* Label + subtext */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)', display: 'block' }}>
                              {notifyLabels[step.notify] || step.notify}
                            </span>
                            <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                              Triggers after {step.trigger_after} flag{step.trigger_after > 1 ? 's' : ''} · via {step.channel}
                            </span>
                          </div>

                          {/* Edit button */}
                          <button
                            onClick={() => handleOpenEscalationModal(idx)}
                            className="small-btn"
                            style={{ flexShrink: 0 }}
                          >
                            Edit
                          </button>

                          {/* Delete button — red ✕ */}
                          <button
                            onClick={() => handleRemoveEscalationStep(idx)}
                            style={{
                              background: 'transparent', border: 'none',
                              color: 'var(--danger)', cursor: 'pointer',
                              fontSize: '15px', padding: '2px 4px',
                              display: 'flex', alignItems: 'center', flexShrink: 0,
                              lineHeight: 1
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}

                    {escalationFlow.length === 0 && (
                      <div style={{ textAlign: 'center', padding: '28px', color: 'var(--text-dim)', fontSize: '12px', fontStyle: 'italic', border: '1px dashed var(--glass-border)', borderRadius: 'var(--radius-lg)' }}>
                        No escalation triggers defined yet.
                      </div>
                    )}
                  </div>

                  {/* Add trigger button — full width, secondary */}
                  <button
                    onClick={() => handleOpenEscalationModal(null)}
                    className="secondary-btn"
                    style={{ width: '100%', justifyContent: 'center', fontSize: '13px' }}
                  >
                    + Add Escalation Trigger
                  </button>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '32px 16px', border: '1px dashed var(--glass-border)', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '32px' }}>🔒</span>
                  <h4 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Upgrade to Diamond Tier</h4>
                  <p style={{ fontSize: '10px', color: 'var(--text-dim)', maxWidth: '260px', margin: 0, lineHeight: 'var(--lh-body)' }}>
                    Set up rule-based alerts for form teachers, principals, and parent WhatsApp routing when absences breach thresholds.
                  </p>
                  <span style={{ fontSize: '9px', fontWeight: 900, color: 'var(--accent)', background: 'rgba(0,229,255,0.1)', padding: '3px 10px', borderRadius: '4px', border: '1px solid rgba(0,229,255,0.2)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Diamond Required</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Escalation Step Edit Modal */}
      {isEscalationModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(8px)', userSelect: 'none' }}>
          <div style={{ background: 'var(--bg-dark)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-xl)', width: '400px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, background: 'rgba(0, 0, 0, 0.15)' }}>
              <h3 style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '14px', margin: 0 }}>
                {editingStepIdx !== null ? `Edit Step ${editingStepIdx + 1}` : 'Add Escalation Step'}
              </h3>
              <button
                onClick={() => setIsEscalationModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center' }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block' }}>
                  Alert Role Destination
                </label>
                <select
                  value={stepNotify}
                  onChange={(e) => setStepNotify(e.target.value as any)}
                  className="modern-input"
                >
                  <option value="form_teacher">Form Teacher (In-App)</option>
                  <option value="principal">Principal (In-App)</option>
                  <option value="parent">Parent (WhatsApp)</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block' }}>
                  Absence Flag Threshold
                </label>
                <input
                  type="number"
                  min="1"
                  value={stepTriggerAfter}
                  onChange={(e) => setStepTriggerAfter(parseInt(e.target.value) || 1)}
                  className="modern-input"
                >
                </input>
              </div>
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--glass-border)', flexShrink: 0, background: 'rgba(0, 0, 0, 0.15)', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setIsEscalationModalOpen(false)}
                className="secondary-btn"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEscalationStep}
                className="primary-btn"
              >
                Save Step
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Attendance;
