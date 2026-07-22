import React, { useState, useEffect } from 'react';
import { DataTable, Column } from '../components/DataTable';
import { CurriculumPresets } from '../lib/curriculum';
import { useSudoAuth } from '../context/SudoAuthContext';
import { Combobox } from '../components/Combobox';
import { MultiSelectCombobox } from '../components/MultiSelectCombobox';
import { useClassArms } from '../hooks/useClassArms';
import { SetupGuardModal } from '../components/SetupGuardModal';
import { CSVReviewModal } from '../components/CSVReviewModal';
import { validateName, validatePhone, validateEmail } from '../lib/validators';

interface TeacherAllocation {
  class_name: string;
  subject: string;
}

interface Teacher {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  host_class?: string;
  signature?: string;
  allocations?: TeacherAllocation[];
}

export function Teachers() {
  const { requireSudo } = useSudoAuth();
  const { fullList } = useClassArms();
  // ── State ──────────────────────────────────────────────────────────────────
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [totalTeachers, setTotalTeachers] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [searchVal, setSearchVal] = useState('');
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(10);

  // Add / Edit Drawer
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editTeacherId, setEditTeacherId] = useState<string | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [hostClass, setHostClass] = useState('');
  const [signatureBase64, setSignatureBase64] = useState<string | null>(null);

  // Subject / Allocation staging
  const [stagedAllocations, setStagedAllocations] = useState<{ class_name: string; subjects: string[] }[]>([]);
  const [activePresetTab, setActivePresetTab] = useState<'pri_lower' | 'pri_upper' | 'jss' | 'sss'>('jss');
  const [checkedSubjects, setCheckedSubjects] = useState<string[]>([]);
  const [customSubjects, setCustomSubjects] = useState<string[]>([]);
  const [customSubjectInput, setCustomSubjectInput] = useState('');
  const [classAllocationInput, setClassAllocationInput] = useState<string[]>([]);
  const [formLog, setFormLog] = useState<{ text: string; isError: boolean } | null>(null);

  // Modals
  const [isClassHostsOpen, setIsClassHostsOpen] = useState(false);
  const [classHosts, setClassHosts] = useState<{ class_name: string; teacher_id: string }[]>([]);
  const [classHostTeachers, setClassHostTeachers] = useState<Teacher[]>([]);
  const [isSubjectAuditOpen, setIsSubjectAuditOpen] = useState(false);
  const [syncWarnings, setSyncWarnings] = useState<any[]>([]);

  // Detail (View) Modal
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [detailTeacher, setDetailTeacher] = useState<Teacher | null>(null);

  // CSV
  const [csvStatus, setCsvStatus] = useState<string | null>(null);

  // Setup Guard & CSV Review Modal States
  const [setupGuardOpen, setSetupGuardOpen] = useState(false);
  const [setupGuardStep, setSetupGuardStep] = useState('');
  const [setupGuardMessage, setSetupGuardMessage] = useState('');
  const [csvReviewOpen, setCsvReviewOpen] = useState(false);
  const [csvReviewResult, setCsvReviewResult] = useState<any>(null);
  const [pendingCsvFile, setPendingCsvFile] = useState<any>(null);

  // ── Data Fetching ──────────────────────────────────────────────────────────
  const fetchTeachers = async () => {
    if (!window.electronAPI?.getAllTeachers) return;
    setLoading(true);
    try {
      const res = await window.electronAPI.getAllTeachers({ limit, offset: page * limit, search });
      if (res?.ok) {
        setTeachers(res.data || []);
        setTotalTeachers(res.total || 0);
      }
    } catch (err) {
      console.error('Error fetching teachers:', err);
    } finally {
      setLoading(false);
    }
  };

  // Debounce searchVal -> search
  useEffect(() => {
    const handler = setTimeout(() => {
      setSearch(searchVal);
      setPage(0);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchVal]);

  useEffect(() => { fetchTeachers(); }, [page, search, limit]);

  useEffect(() => {
    if (window.electronAPI?.onCSVLoaded) {
      window.electronAPI.onCSVLoaded((payload: any) => {
        const count = typeof payload === 'object' ? payload.count : payload;
        const error: string | null = typeof payload === 'object' ? (payload.error || null) : null;
        const warnings: string[] = typeof payload === 'object' ? (payload.warnings || []) : [];

        const Swal = (window as any).Swal;

        // ── Layer 5: error → wrong-template → success ─────────────────
        if (error) {
          if (error === 'SETUP_INCOMPLETE' && payload.setupCheck) {
            setSetupGuardStep(payload.setupCheck.step || 'classes');
            setSetupGuardMessage(payload.setupCheck.message || '');
            setSetupGuardOpen(true);
            setCsvStatus(null);
            return;
          }
          setCsvStatus(`❌ Import Failed: ${error}`);
          if (Swal) {
            Swal.fire({
              title: 'Import Failed',
              text: error.startsWith('WRONG_TEMPLATE:')
                ? 'Wrong file selected. Please use the official Nexus Teachers CSV template.'
                : error,
              icon: 'error',
              background: '#0b0f19',
              color: '#fff',
              confirmButtonColor: '#ef4444'
            });
          }
          setTimeout(() => setCsvStatus(null), 6000);
          return;
        }

        if (count === 0) {
          setCsvStatus('⚠️ No records imported. Check that you selected the correct CSV template.');
          if (Swal) {
            Swal.fire({
              title: 'No Records Imported',
              text: 'Zero rows were processed. Ensure you are using the official Nexus Teachers CSV template with Teacher_ID and Teacher_Name columns.',
              icon: 'warning',
              background: '#0b0f19',
              color: '#fff',
              confirmButtonColor: '#f59e0b'
            });
          }
          setTimeout(() => setCsvStatus(null), 6000);
          return;
        }

        const baseMsg = `✅ CSV Processed: ${count} Records Imported`;
        const fullMsg = warnings.length > 0
          ? `${baseMsg} — ⚠️ ${warnings.length} warning(s): ${warnings.join(' | ')}`
          : baseMsg;
        setCsvStatus(fullMsg);
        fetchTeachers();
        setTimeout(() => setCsvStatus(null), warnings.length > 0 ? 8000 : 4000);

        if (Swal) {
          if (warnings.length > 0) {
            Swal.fire({
              title: 'Import Processed with Warnings',
              html: `
                <p style="color: #fff; margin-bottom: 10px;">Successfully loaded <strong>${count}</strong> teachers.</p>
                <div style="text-align: left; background: rgba(239, 68, 68, 0.1); border-left: 4px solid #ef4444; padding: 10px; margin-top: 10px; border-radius: 4px; max-height: 200px; overflow-y: auto;">
                  <strong style="color: #ef4444; font-size: 13px;">Warnings:</strong>
                  <ul style="margin: 5px 0 0 0; padding-left: 15px; color: #fca5a5; font-size: 11px; line-height: 1.6;">
                    ${warnings.map(w => `<li>${w}</li>`).join('')}
                  </ul>
                </div>
              `,
              icon: 'warning',
              background: '#0b0f19',
              color: '#fff',
              confirmButtonColor: '#00E5FF'
            });
          } else {
            Swal.fire({
              title: 'Success!',
              text: `Successfully loaded ${count} teachers.`,
              icon: 'success',
              background: '#0b0f19',
              color: '#fff',
              confirmButtonColor: '#00E5FF'
            });
          }
        }
      });
    }
  }, []);

  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const Swal = (window as any).Swal;
    const api = (window as any).electronAPI;

    if (api?.getDbStats) {
      try {
        const stats = await api.getDbStats();
        if (stats && stats.classes === 0) {
          if (Swal) {
            Swal.fire({
              title: 'Setup Step Required',
              text: 'No classes have been set up yet. Import your Classes CSV first, then return here to import teachers.',
              icon: 'info',
              background: '#0b0f19',
              color: '#fff',
              confirmButtonColor: '#f59e0b',
              confirmButtonText: 'Go to Classes'
            }).then((res: any) => {
              if (res.isConfirmed) {
                window.dispatchEvent(new CustomEvent('nexus-nav', { detail: 'classes' }));
              }
            });
          } else {
            alert('No classes found. Import Classes first.');
          }
          e.target.value = '';
          return;
        }
      } catch (err) {
        console.error('Failed to run preflight check:', err);
      }
    }

    // Dry-run validation before writing
    try {
      const dryRun = await (window as any).nexusAPI?.validateCSVDryRun?.({ filePath: file.path, type: 'teachers' });
      if (dryRun && (dryRun.blocking?.length > 0 || dryRun.normalizable?.length > 0)) {
        setPendingCsvFile(file);
        setCsvReviewResult(dryRun);
        setCsvReviewOpen(true);
        e.target.value = '';
        return;
      }
    } catch (err) {
      console.warn('Dry-run validation skipped:', err);
    }

    setCsvStatus('⏳ Uploading and processing CSV...');
    if (api?.processCSV) api.processCSV(file.path);
    e.target.value = '';
  };

  const handleCSVReviewAccept = () => {
    setCsvReviewOpen(false);
    if (!pendingCsvFile) return;
    const file = pendingCsvFile;
    setPendingCsvFile(null);
    const api = (window as any).electronAPI;
    setCsvStatus('⏳ Uploading and processing CSV...');
    if (api?.processCSV) api.processCSV(file.path);
  };

  const handleClearTeachers = async () => {
    const Swal = (window as any).Swal;
    const api = (window as any).electronAPI;
    if (!api?.assets?.clear) return;

    try {
      if (api.getDbStats) {
        const stats = await api.getDbStats();
        if (!stats || stats.teachers === 0) {
          if (Swal) Swal.fire({ title: 'No Teachers Found', text: 'There are no teacher records to clear.', icon: 'info', background: '#0b0f19', color: '#fff', confirmButtonColor: '#00E5FF' });
          return;
        }
      }

      requireSudo(
        async () => {
          setCsvStatus('⏳ Clearing teachers from database...');
          const res = await api.assets.clear({ asset: 'teachers' });
          if (res?.ok) {
            setCsvStatus('✅ All teacher configurations cleared');
            fetchTeachers();
            if (Swal) {
              Swal.fire({
                title: 'Cleared!',
                text: 'All teachers and their allocations have been successfully deleted.',
                icon: 'success',
                background: '#0b0f19',
                color: '#fff',
                confirmButtonColor: '#00E5FF'
              });
            }
          } else {
            setCsvStatus(`❌ Clear Failed: ${res?.error}`);
            if (Swal) {
              Swal.fire({
                title: 'Clear Failed',
                text: res?.error || 'Unknown error occurred.',
                icon: 'error',
                background: '#0b0f19',
                color: '#fff',
                confirmButtonColor: '#ef4444'
              });
            }
          }
        },
        'Clear All Teachers?',
        'This will completely delete all teachers and their subject/class allocations from the database. This action is permanent and cannot be undone.',
        true
      );
    } catch (err: any) {
      console.error(err);
      if (Swal) Swal.fire({ title: 'Error', text: err.message, icon: 'error', background: '#0b0f19', color: '#fff' });
    }
  };

  // ── Drawer helpers ─────────────────────────────────────────────────────────
  const resetForm = () => {
    setName(''); setPhone(''); setEmail(''); setHostClass('');
    setSignatureBase64(null); setStagedAllocations([]);
    setCheckedSubjects([]); setCustomSubjects([]);
    setCustomSubjectInput(''); setClassAllocationInput([]); setFormLog(null);
  };

  const openAddDrawer = async () => {
    const api = (window as any).electronAPI;
    if (api?.getDbStats) {
      try {
        const stats = await api.getDbStats();
        if (stats && stats.classes === 0) {
          setSetupGuardStep('classes');
          setSetupGuardMessage('No classes have been configured yet. Set up classes before adding teachers.');
          setSetupGuardOpen(true);
          return;
        }
      } catch (_) {}
    }
    setEditTeacherId(null); resetForm(); setIsDrawerOpen(true);
  };

  // Open View Detail Modal
  const openDetailModal = (teacher: Teacher) => {
    setDetailTeacher(teacher);
    setIsDetailModalOpen(true);
  };

  const openEditDrawer = (teacher: Teacher) => {
    setEditTeacherId(teacher.id);
    setName(teacher.name || ''); setPhone(teacher.phone || '');
    setEmail(teacher.email || ''); setHostClass(teacher.host_class || '');
    setSignatureBase64(teacher.signature || null);
    const grouped: Record<string, string[]> = {};
    (teacher.allocations || []).forEach(a => {
      if (!grouped[a.class_name]) grouped[a.class_name] = [];
      grouped[a.class_name].push(a.subject);
    });
    setStagedAllocations(Object.entries(grouped).map(([class_name, subjects]) => ({ class_name, subjects })));
    setCheckedSubjects([]); setCustomSubjects([]);
    setCustomSubjectInput(''); setClassAllocationInput([]); setFormLog(null);
    setIsDrawerOpen(true);
  };

  // ── Subject / Allocation Logic ─────────────────────────────────────────────
  const toggleSubjectChecked = (subj: string) =>
    setCheckedSubjects(prev => prev.includes(subj) ? prev.filter(s => s !== subj) : [...prev, subj]);

  const handleAddCustomSubject = () => {
    const val = customSubjectInput.trim();
    if (!val) return;
    if (!customSubjects.includes(val)) {
      setCustomSubjects(prev => [...prev, val]);
      setCheckedSubjects(prev => [...prev, val]);
    }
    setCustomSubjectInput('');
  };

  const handleAddStagedAllocation = () => {
    const classes = classAllocationInput;
    if (!classes.length) { alert('Please select at least one class.'); return; }
    if (!checkedSubjects.length) { alert('Please select at least one subject.'); return; }
    setStagedAllocations(prev => {
      const copy = [...prev];
      classes.forEach(cls => {
        const idx = copy.findIndex(a => a.class_name.toLowerCase() === cls.toLowerCase());
        if (idx !== -1) {
          copy[idx] = { class_name: cls, subjects: Array.from(new Set([...copy[idx].subjects, ...checkedSubjects])) };
        } else {
          copy.push({ class_name: cls, subjects: [...checkedSubjects] });
        }
      });
      return copy;
    });
    setClassAllocationInput([]);
  };

  const handleRemoveStagedAllocation = (idx: number) =>
    setStagedAllocations(prev => prev.filter((_, i) => i !== idx));

  const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setSignatureBase64(ev.target?.result as string || null);
    reader.readAsDataURL(file);
  };

  // ── Save / Delete ──────────────────────────────────────────────────────────
  const handleSaveTeacher = async () => {
    const nRes = validateName(name, 'Full Name');
    if (!nRes.ok && nRes.error) { setFormLog({ text: `⚠ ${nRes.error}`, isError: true }); return; }

    if (phone.trim()) {
      const phRes = validatePhone(phone);
      if (!phRes.ok && phRes.error) { setFormLog({ text: `⚠ ${phRes.error}`, isError: true }); return; }
    }

    if (email.trim()) {
      const emRes = validateEmail(email);
      if (!emRes.ok && emRes.error) { setFormLog({ text: `⚠ ${emRes.error}`, isError: true }); return; }
    }

    if (!stagedAllocations.length) { setFormLog({ text: '⚠ Add at least one class allocation.', isError: true }); return; }
    setFormLog({ text: 'Saving shard...', isError: false });
    try {
      if (editTeacherId) {
        const res = await window.electronAPI.updateTeacherFull({
          id: editTeacherId, name, phone, email,
          allocations: stagedAllocations, signature: signatureBase64, host_class: hostClass,
        });
        if (res?.ok) {
          setFormLog({ text: '✅ Teacher profile saved!', isError: false });
          setTimeout(() => { setIsDrawerOpen(false); fetchTeachers(); }, 1000);
        } else if (res?.error === 'SETUP_INCOMPLETE' || res?.step) {
          setSetupGuardStep(res.step || 'classes');
          setSetupGuardMessage(res.message || 'Setup step required before saving teacher.');
          setSetupGuardOpen(true);
          setIsDrawerOpen(false);
        } else setFormLog({ text: `❌ ${res?.error || 'Failed to update teacher'}`, isError: true });
      } else {
        const id = 'TCH-' + crypto.randomUUID().split('-')[0].toUpperCase();
        const res = await window.electronAPI.addTeacherForm({
          id, name, phone, email,
          allocations: stagedAllocations, signature: signatureBase64 || undefined,
        });
        if (res?.ok) {
          setFormLog({ text: `✅ Teacher saved! (${id})`, isError: false });
          setTimeout(() => { setIsDrawerOpen(false); fetchTeachers(); }, 1000);
        } else if (res?.error === 'SETUP_INCOMPLETE' || res?.step) {
          setSetupGuardStep(res.step || 'classes');
          setSetupGuardMessage(res.message || 'Setup step required before adding teacher.');
          setSetupGuardOpen(true);
          setIsDrawerOpen(false);
        } else setFormLog({ text: `❌ ${res?.error || 'Failed to add teacher'}`, isError: true });
      }
    } catch (err: any) {
      setFormLog({ text: `❌ Save failed: ${err.message}`, isError: true });
    }
  };

  const handleDeleteTeacher = (teacher: Teacher) => {
    requireSudo(
      async () => {
        if (!window.electronAPI?.deleteTeacher) return;
        try {
          const res = await window.electronAPI.deleteTeacher({ id: teacher.id });
          if (res.ok) fetchTeachers();
          else alert(`Error: ${res.error}`);
        } catch (err: any) { alert(`Error removing teacher: ${err.message}`); }
      },
      'Delete Teacher Profile',
      `You are about to permanently remove ${teacher.name} and all their class allocations. Grade records are unaffected. This cannot be undone.`
    );
  };

  // ── Modals ─────────────────────────────────────────────────────────────────
  const openClassHostsModal = async () => {
    setIsClassHostsOpen(true);
    if (!window.electronAPI) return;
    try {
      const tchRes = await window.electronAPI.getAllTeachers({ limit: 1000, minimal: true });
      setClassHostTeachers(tchRes?.data || []);

      const mappingRes = await window.electronAPI.getFormTeachers();
      if (mappingRes.ok) setClassHosts(mappingRes.data || []);
    } catch (err) { console.error('Failed to load class host mapping:', err); }
  };

  const handleSetClassHost = async (className: string, teacherId: string) => {
    if (!window.electronAPI?.setFormTeacher) return;
    try {
      const res = await window.electronAPI.setFormTeacher({ class_name: className, teacher_id: teacherId });
      if (res.ok) {
        setClassHosts(prev => {
          const filtered = prev.filter(m => m.class_name !== className);
          if (teacherId) filtered.push({ class_name: className, teacher_id: teacherId });
          return filtered;
        });
      } else alert('Failed to save class host allocation: ' + res.error);
    } catch (err: any) { alert('Error saving class host allocation: ' + err.message); }
  };

  const openSubjectAuditModal = async () => {
    setIsSubjectAuditOpen(true);
    if (!window.electronAPI?.subjects?.getSyncWarnings) return;
    try {
      const res = await window.electronAPI.subjects.getSyncWarnings();
      if (res.ok) setSyncWarnings(res.data || []);
    } catch (err) { console.error('Failed to load sync warnings:', err); }
  };

  const handleClearSubjectAudit = async () => {
    if (!window.electronAPI?.subjects?.clearSyncWarnings) return;
    const ok = window.confirm('Are you sure you want to clear the Subject Consistency Audit logs?');
    if (ok) {
      try {
        const res = await window.electronAPI.subjects.clearSyncWarnings();
        if (res.ok) { setSyncWarnings([]); alert('Sync warnings cleared!'); }
      } catch (err: any) { alert('Error clearing warnings: ' + err.message); }
    }
  };

  // ── Table Columns ──────────────────────────────────────────────────────────
  const columns: Column<Teacher>[] = [
    {
      header: 'STAFF ID',
      accessorKey: 'id',
      cell: (t) => (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-dim)' }}>
          {t.id}
        </span>
      ),
      width: '130px',
    },
    {
      header: 'TEACHER PROFILE',
      cell: (t) => (
        <div>
          <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '13px' }}>{t.name}</div>
          {t.host_class && (
            <span style={{
              display: 'inline-block', marginTop: '6px', fontSize: '9px', fontWeight: 700,
              background: 'rgba(0,229,255,0.07)', color: 'var(--accent)',
              border: '1px solid rgba(0,229,255,0.2)', padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
            }}>
              🏠 HOST: {t.host_class}
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'CONTACT PHONE',
      cell: (t) => <span style={{ fontSize: '13px', color: 'var(--text-dim)' }}>{t.phone || '—'}</span>,
      width: '150px',
    },
    {
      header: 'CLASS ALLOCATIONS',
      cell: (t) => {
        const grouped: Record<string, string[]> = {};
        (t.allocations || []).forEach(a => {
          if (!grouped[a.class_name]) grouped[a.class_name] = [];
          grouped[a.class_name].push(a.subject);
        });
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxWidth: '360px' }}>
            {Object.entries(grouped).map(([cls, subjects]) => (
              <span key={cls} style={{
                display: 'inline-flex', flexDirection: 'column',
                background: 'var(--glass)', border: '1px solid var(--glass-border)',
                borderRadius: 'var(--radius-sm)', padding: '4px 10px', fontSize: '11px',
              }}>
                <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{cls}</span>
                <span style={{ color: 'var(--text-dim)', fontSize: '10px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={subjects.join(', ')}>
                  {subjects.join(', ')}
                </span>
              </span>
            ))}
            {!t.allocations?.length && (
              <span style={{ color: 'var(--text-dim)', fontSize: '12px', fontStyle: 'italic' }}>No allocations</span>
            )}
          </div>
        );
      },
    },
    {
      header: 'ACTIONS',
      align: 'right',
      cell: (t) => (
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
          <button
            onClick={() => openDetailModal(t)}
            className="secondary-btn"
            style={{
              padding: '6px 10px',
              fontSize: '11px',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--accent)',
              borderColor: 'rgba(0, 229, 255, 0.3)',
            }}
          >
            <span style={{ marginRight: '4px' }}>👁</span> View
          </button>
          <button
            onClick={() => openEditDrawer(t)}
            className="secondary-btn"
            style={{
              padding: '6px 10px',
              fontSize: '11px',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--accent-gold)',
              borderColor: 'rgba(255, 215, 0, 0.35)',
            }}
          >
            <span style={{ marginRight: '4px' }}>✏️</span> Edit
          </button>
          <button
            onClick={() => handleDeleteTeacher(t)}
            className="secondary-btn"
            style={{
              padding: '6px 10px',
              fontSize: '11px',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--danger)',
              borderColor: 'rgba(239, 68, 68, 0.35)',
            }}
          >
            <span style={{ marginRight: '4px' }}>🗑️</span> Remove
          </button>
        </div>
      ),
      width: '180px',
    },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--grid-gap)' }}>

      {/* ── View Header ── */}
      <div className="view-header">
        <div>
          <h2 className="view-title">👩‍🏫 Teacher Directory</h2>
          <p className="view-sub">Manage staff profiles, class hosts, and classroom subject allocations.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <label htmlFor="teacher-csv-upload-input" className="secondary-btn" style={{ cursor: 'pointer' }}>
            ⚡ Import CSV
          </label>
          <input type="file" id="teacher-csv-upload-input" accept=".csv" onChange={handleCSVUpload} style={{ display: 'none' }} />

          {teachers.length > 0 && (
            <button
              onClick={handleClearTeachers}
              className="secondary-btn"
              style={{
                borderColor: 'rgba(239, 68, 68, 0.35)',
                color: '#fca5a5',
                background: 'rgba(239, 68, 68, 0.05)',
              }}
            >
              🗑️ Clear Data
            </button>
          )}

          <button className="secondary-btn" onClick={openSubjectAuditModal} style={{ borderColor: 'rgba(245,158,11,0.35)', color: 'var(--warning)' }}>
            ⚠️ Subject Audit
          </button>

          <button className="secondary-btn" onClick={openClassHostsModal}>
            🏠 Class Hosts
          </button>

          <button className="primary-btn" onClick={openAddDrawer}>
            + Add Teacher
          </button>
        </div>
      </div>

      {/* ── CSV Status Banner ── */}
      {csvStatus && (
        <div 
          className="slide-in-right"
          style={{
            position: 'fixed',
            top: '24px',
            right: '24px',
            zIndex: 99999,
            background: csvStatus.startsWith('❌') || csvStatus.includes('Failed') 
              ? 'rgba(239, 68, 68, 0.95)' 
              : csvStatus.startsWith('✅') 
                ? 'rgba(16, 185, 129, 0.95)' 
                : 'rgba(13, 18, 53, 0.95)',
            border: csvStatus.startsWith('❌') || csvStatus.includes('Failed')
              ? '1px solid rgba(239, 68, 68, 0.5)'
              : csvStatus.startsWith('✅')
                ? '1px solid rgba(16, 185, 129, 0.5)'
                : '1px solid rgba(0, 229, 255, 0.4)',
            padding: '14px 20px',
            borderRadius: '12px',
            fontSize: '13px',
            color: '#fff',
            fontWeight: 600,
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(10px)',
            maxWidth: '350px',
            wordBreak: 'break-word',
          }}
        >
          {csvStatus}
        </div>
      )}

      {/* ── Search ── */}
      <div style={{ width: '100%', display: 'flex', position: 'relative', alignItems: 'center' }}>
        <span style={{ position: 'absolute', left: '16px', color: 'var(--text-dim)', fontSize: '14px', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
          🔍
        </span>
        <input
          type="text"
          className="modern-input"
          value={searchVal}
          onChange={e => { setSearchVal(e.target.value); }}
          placeholder="Search teachers by name or Staff ID..."
          style={{ width: '100%', padding: '12px 16px 12px 42px', fontSize: '13px', borderRadius: 'var(--radius-md)' }}
        />
        {searchVal && (
          <button
            onClick={() => {
              setSearchVal('');
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
            onMouseOver={e => e.currentTarget.style.color = 'var(--text-main)'}
            onMouseOut={e => e.currentTarget.style.color = 'var(--text-dim)'}
          >
            ✕
          </button>
        )}
      </div>

      {/* ── Data Table ── */}
      <DataTable
        data={teachers}
        columns={columns}
        isLoading={loading}
        emptyMessage={
          search
            ? 'No matching teachers found in directory.'
            : 'No teachers registered. Click + Add Teacher or Import CSV to populate the registry.'
        }
      />

      {/* ── Pagination ── */}
      {totalTeachers > 0 && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'rgba(0,0,0,0.15)', border: '1px solid var(--glass-border)',
          borderRadius: 'var(--radius-lg)', padding: '12px 20px', flexShrink: 0, gap: '16px', flexWrap: 'wrap'
        }}>
          <span style={{ fontSize: '12px', color: 'var(--text-dim)', fontWeight: 500 }}>
            Showing {page * limit + 1} to {Math.min((page + 1) * limit, totalTeachers)} of {totalTeachers} staff
          </span>

          {/* Middle Page Numbers */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="secondary-btn"
              style={{ padding: '6px 10px', fontSize: '11px', borderRadius: 'var(--radius-sm)', minWidth: '30px', justifyContent: 'center' }}
            >
              &lt;
            </button>

            {(() => {
              const totalPages = Math.ceil(totalTeachers / limit);
              const pages: (number | string)[] = [];
              if (totalPages <= 6) {
                for (let i = 1; i <= totalPages; i++) pages.push(i);
              } else {
                pages.push(1);
                const currentPageNum = page + 1;
                let start = Math.max(2, currentPageNum - 1);
                let end = Math.min(totalPages - 1, currentPageNum + 1);

                if (currentPageNum <= 3) {
                  end = 4;
                } else if (currentPageNum >= totalPages - 2) {
                  start = totalPages - 3;
                }

                if (start > 2) pages.push('...');
                for (let i = start; i <= end; i++) pages.push(i);
                if (end < totalPages - 1) pages.push('...');
                pages.push(totalPages);
              }

              return pages.map((p, idx) => {
                if (p === '...') {
                  return (
                    <span key={`ellipsis-${idx}`} style={{ color: 'var(--text-dim)', padding: '0 4px', fontSize: '11px' }}>
                      ...
                    </span>
                  );
                }
                const pageIdx = (p as number) - 1;
                const isActive = page === pageIdx;
                return (
                  <button
                    key={`page-${p}`}
                    onClick={() => setPage(pageIdx)}
                    className="secondary-btn"
                    style={{
                      padding: '6px 10px',
                      fontSize: '11px',
                      borderRadius: 'var(--radius-sm)',
                      color: isActive ? 'var(--accent)' : 'var(--text-dim)',
                      borderColor: isActive ? 'var(--accent)' : 'var(--glass-border)',
                      background: isActive ? 'rgba(0, 229, 255, 0.08)' : 'transparent',
                      minWidth: '30px',
                      justifyContent: 'center',
                    }}
                  >
                    {p}
                  </button>
                );
              });
            })()}

            <button
              onClick={() => {
                const totalPages = Math.ceil(totalTeachers / limit);
                setPage(p => Math.min(totalPages - 1, p + 1));
              }}
              disabled={page === Math.ceil(totalTeachers / limit) - 1}
              className="secondary-btn"
              style={{ padding: '6px 10px', fontSize: '11px', borderRadius: 'var(--radius-sm)', minWidth: '30px', justifyContent: 'center' }}
            >
              &gt;
            </button>
          </div>

          {/* Rows per page dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-dim)' }}>
            <span>Rows per page</span>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(parseInt(e.target.value));
                setPage(0);
              }}
              className="modern-input"
              style={{
                padding: '4px 8px',
                fontSize: '11px',
                borderRadius: 'var(--radius-sm)',
                width: 'auto',
                background: 'rgba(0,0,0,0.2)',
                border: '1px solid var(--glass-border)',
                color: 'var(--text-main)',
                cursor: 'pointer',
              }}
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
      )}
      </div>

      {/* ══════════════════════════════════════════════
          Add / Edit Drawer  (§9B Slide-in Drawer Sheet)
      ══════════════════════════════════════════════ */}
      {isDrawerOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 2000,
          display: 'flex', justifyContent: 'flex-end',
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', userSelect: 'none',
          WebkitAppRegion: 'no-drag' as any,
        }}>
          <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setIsDrawerOpen(false)} />

          <div style={{
            width: '500px', height: '100vh',
            background: 'var(--bg-dark)', borderLeft: '1px solid var(--glass-border)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)', zIndex: 2001,
          }}>
            {/* Drawer Header */}
            <div style={{
              padding: '16px 24px', borderBottom: '1px solid var(--glass-border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: 'rgba(0,0,0,0.15)', flexShrink: 0,
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--text-main)' }}>
                  {editTeacherId ? 'Edit Teacher Shard' : 'Provision Staff Identity'}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--text-dim)' }}>
                  Allocate canonical subjects and configure tablet access parameters.
                </p>
              </div>
              <button
                id="close-teacher-drawer-btn"
                onClick={() => setIsDrawerOpen(false)}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: 'none',
                  color: 'var(--text-dim)',
                  fontSize: '18px',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  padding: 0,
                  lineHeight: 1
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 68, 68, 0.2)';
                  e.currentTarget.style.color = '#ff4444';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                  e.currentTarget.style.color = 'var(--text-dim)';
                }}
              >
                ×
              </button>
            </div>

            {/* Drawer Scrollable Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

              {/* Alert */}
              {formLog && (
                <div style={{
                  padding: '10px 16px', borderRadius: 'var(--radius-sm)', fontSize: '12px', border: '1px solid',
                  background: formLog.isError ? 'rgba(239,68,68,0.1)' : 'rgba(0,230,118,0.1)',
                  borderColor: formLog.isError ? 'rgba(239,68,68,0.25)' : 'rgba(0,230,118,0.25)',
                  color: formLog.isError ? 'var(--danger)' : 'var(--accent-green)',
                }}>
                  {formLog.text}
                </div>
              )}

              {/* Identity Fields */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="form-group">
                  <label style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Full Name *
                  </label>
                  <input type="text" className="modern-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Obi Emeka" id="wiz-tch-name" />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-group">
                    <label style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Phone Number</label>
                    <input type="text" className="modern-input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 08012345678" id="wiz-tch-phone" />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Email Address</label>
                    <input type="email" className="modern-input" value={email} onChange={e => setEmail(e.target.value)} placeholder="e.g. obi@school.edu" id="wiz-tch-email" />
                  </div>
                </div>

                {editTeacherId && (
                  <div className="form-group">
                    <label style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Host Class Designation</label>
                    <Combobox options={fullList} value={hostClass} onChange={setHostClass} placeholder="e.g. JSS 1 Gold (Optional)" />
                  </div>
                )}
              </div>

              {/* ── Class & Subject Allocation ── */}
              <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <h4 style={{ margin: 0, fontSize: '11px', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '1.5px', paddingBottom: '8px', borderBottom: '1px solid var(--glass-border)' }}>
                  Allocate Classes &amp; Subjects
                </h4>

                <div className="form-group">
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-dim)' }}>Target Classes</label>
                  <MultiSelectCombobox options={fullList} selectedValues={classAllocationInput} onChange={setClassAllocationInput} placeholder="Select classes..." />
                </div>

                {/* Curriculum Preset Tabs — Pattern 1: fees-tab-btn underline rail */}
                <div className="form-group" style={{ gap: '8px' }}>
                  <label style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Curriculum Presets</label>
                  <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--glass-border)', flexShrink: 0 }}>
                    {(['pri_lower', 'pri_upper', 'jss', 'sss'] as const).map(tab => (
                      <button
                        key={tab}
                        type="button"
                        className={`fees-tab-btn${activePresetTab === tab ? ' active' : ''}`}
                        onClick={() => setActivePresetTab(tab)}
                        style={{ fontSize: '11px' }}
                      >
                        {tab.replace('_', ' ').toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Subject Grid */}
                <div style={{
                  height: '176px', border: '1px solid var(--glass-border)',
                  borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.15)',
                  overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px',
                }}>
                  {CurriculumPresets[activePresetTab].map((group, gIdx) => (
                    <div key={gIdx}>
                      <div style={{ fontSize: '10px', color: 'var(--accent)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--glass-border)', paddingBottom: '4px', marginBottom: '8px' }}>
                        {group.cat}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {group.subjects.map(subj => {
                          const isChecked = checkedSubjects.includes(subj);
                          return (
                            <button
                              key={subj}
                              type="button"
                              onClick={() => toggleSubjectChecked(subj)}
                              className={isChecked ? 'secondary-btn' : ''}
                              style={{
                                padding: '4px 8px', borderRadius: 'var(--radius-sm)',
                                fontSize: '11px', fontWeight: 500, cursor: 'pointer',
                                border: `1px solid ${isChecked ? 'rgba(0,229,255,0.35)' : 'var(--glass-border)'}`,
                                background: isChecked ? 'rgba(0,229,255,0.08)' : 'rgba(255,255,255,0.03)',
                                color: isChecked ? 'var(--accent)' : 'var(--text-dim)',
                                transition: 'all 0.15s',
                              }}
                            >
                              {subj}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {/* Custom Subjects */}
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--accent)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--glass-border)', paddingBottom: '4px', marginBottom: '8px' }}>
                      Custom Subjects
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {customSubjects.map(subj => {
                        const isChecked = checkedSubjects.includes(subj);
                        return (
                          <button
                            key={subj}
                            type="button"
                            onClick={() => toggleSubjectChecked(subj)}
                            style={{
                              padding: '4px 8px', borderRadius: 'var(--radius-sm)',
                              fontSize: '11px', fontWeight: 500, cursor: 'pointer',
                              border: `1px solid ${isChecked ? 'rgba(0,229,255,0.35)' : 'var(--glass-border)'}`,
                              background: isChecked ? 'rgba(0,229,255,0.08)' : 'rgba(255,255,255,0.03)',
                              color: isChecked ? 'var(--accent)' : 'var(--text-dim)',
                              transition: 'all 0.15s',
                            }}
                          >
                            {subj}
                          </button>
                        );
                      })}
                      {customSubjects.length === 0 && (
                        <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontStyle: 'italic' }}>No custom subjects added.</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Add Custom Subject */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    className="modern-input"
                    value={customSubjectInput}
                    onChange={e => setCustomSubjectInput(e.target.value)}
                    placeholder="e.g. Civic Education"
                    style={{ flex: 1, fontSize: '12px' }}
                  />
                  <button type="button" className="secondary-btn" onClick={handleAddCustomSubject} style={{ whiteSpace: 'nowrap' }}>
                    ➕ Custom
                  </button>
                </div>

                {/* Append Allocation */}
                <button type="button" className="secondary-btn" onClick={handleAddStagedAllocation} style={{ width: '100%', justifyContent: 'center' }}>
                  Append Allocation to List
                </button>

                {/* Staged Allocations */}
                <div className="form-group">
                  <label style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Staged Allocation Registry
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '160px', overflowY: 'auto' }}>
                    {stagedAllocations.map((alloc, idx) => (
                      <div key={idx} style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.15)',
                        borderRadius: 'var(--radius-sm)', padding: '8px 12px', fontSize: '11px',
                      }}>
                        <span style={{ color: 'var(--accent)', fontWeight: 700, flexShrink: 0 }}>{alloc.class_name}</span>
                        <span style={{ color: 'var(--text-dim)', flexShrink: 0 }}>|</span>
                        <span style={{ color: 'var(--text-main)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {alloc.subjects.join(', ')}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveStagedAllocation(idx)}
                          style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: '14px', cursor: 'pointer', fontWeight: 700, flexShrink: 0 }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    {stagedAllocations.length === 0 && (
                      <div style={{ textAlign: 'center', padding: '16px', border: '1px dashed var(--glass-border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-dim)', fontSize: '12px' }}>
                        No allocations staged. Add details above.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Signature Upload ── */}
              <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <label style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Staff Signature Image
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <label htmlFor="staff-sig-upload-input" className="secondary-btn" style={{ cursor: 'pointer' }}>
                    📁 Upload Signature
                  </label>
                  <input type="file" id="staff-sig-upload-input" accept="image/*" onChange={handleSignatureUpload} style={{ display: 'none' }} />
                  {signatureBase64 && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)',
                      borderRadius: 'var(--radius-sm)', padding: '6px 12px 6px 6px',
                    }}>
                      <img src={signatureBase64} alt="Signature Preview" style={{ height: '36px', objectFit: 'contain', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', padding: '2px 6px' }} />
                      <button
                        type="button"
                        onClick={() => setSignatureBase64(null)}
                        style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}
                      >
                        ✕ Remove
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Drawer Footer */}
            <div style={{
              padding: '16px 24px', borderTop: '1px solid var(--glass-border)',
              background: 'rgba(0,0,0,0.15)', display: 'flex', gap: '8px', flexShrink: 0,
            }}>
              <button type="button" className="secondary-btn" onClick={() => setIsDrawerOpen(false)} style={{ flex: 1, justifyContent: 'center', padding: '12px 0' }}>
                Cancel
              </button>
              <button type="button" className="primary-btn" onClick={handleSaveTeacher} style={{ flex: 1, justifyContent: 'center', padding: '12px 0' }}>
                {editTeacherId ? 'Save Profile' : 'Register Staff'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          Class Hosts Modal  (§9C Centered Dialog)
      ══════════════════════════════════════════════ */}
      {isClassHostsOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 2000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', userSelect: 'none',
        }}>
          <div style={{
            width: '520px', maxHeight: '80vh',
            background: 'var(--bg-dark)', border: '1px solid var(--glass-border)',
            borderRadius: 'var(--radius-xl)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.15)', flexShrink: 0 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--text-main)' }}>🏠 Class Host Mapping</h3>
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--text-dim)' }}>Assign form teachers to each class for report sign-off.</p>
              </div>
              <button onClick={() => setIsClassHostsOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center' }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {fullList.length === 0 && (
                <p style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '13px', padding: '24px' }}>
                  No classes found. Ensure students are registered in the system.
                </p>
              )}
              {fullList.map(cls => {
                const currentHost = classHosts.find(m => (m.class_name || '').replace(/\s+/g, '').toUpperCase() === (cls || '').replace(/\s+/g, '').toUpperCase())?.teacher_id || '';
                return (
                  <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: '14px', background: 'var(--glass)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-sm)', padding: '10px 14px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)', minWidth: '80px' }}>{cls}</span>
                    <select
                      value={currentHost}
                      onChange={e => handleSetClassHost(cls, e.target.value)}
                      className="modern-input"
                      style={{ flex: 1, fontSize: '12px', padding: '6px 10px' }}
                    >
                      <option value="">— Unassigned —</option>
                      {classHostTeachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.15)', flexShrink: 0, display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button className="primary-btn" onClick={() => { setIsClassHostsOpen(false); fetchTeachers(); }}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          Subject Audit Modal  (§9C Centered Dialog)
      ══════════════════════════════════════════════ */}
      {isSubjectAuditOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 2000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', userSelect: 'none',
        }}>
          <div style={{
            width: '580px', maxHeight: '80vh',
            background: 'var(--bg-dark)', border: '1px solid var(--glass-border)',
            borderRadius: 'var(--radius-xl)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.15)', flexShrink: 0 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--text-main)' }}>⚠️ Subject Consistency Audit</h3>
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--text-dim)' }}>Flagged discrepancies between student subjects and teacher allocations.</p>
              </div>
              <button onClick={() => setIsSubjectAuditOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center' }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {syncWarnings.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ textAlign: 'center', padding: '24px 20px', background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: 'var(--radius-md)', color: 'var(--accent-green)', fontSize: '13px' }}>
                    ✅ No subject inconsistencies detected. All teacher-tablet syncs are clean.
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)', padding: '14px 16px', fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.7 }}>
                    <p style={{ margin: '0 0 6px', fontWeight: 600, color: 'var(--text-main)' }}>ℹ️ What is this audit?</p>
                    <p style={{ margin: 0 }}>When a teacher's Android tablet submits grades, the sync server checks whether the subject matches the teacher's assigned allocation. If a teacher submits grades for a subject they are <strong>not allocated to teach</strong>, a warning is flagged here.</p>
                    <p style={{ margin: '8px 0 0' }}>Warnings accumulate from tablet sync events. Pair tablets via <strong>Sync Hub</strong> and begin grade submissions for this log to populate.</p>
                  </div>
                </div>
              ) : (
                syncWarnings.map((w: any, idx: number) => (
                  <div key={idx} style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 'var(--radius-sm)', padding: '12px 16px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <span style={{ color: 'var(--warning)', fontWeight: 700, fontSize: '13px' }}>
                          ⚠️ {w.mismatched_subject || 'Unknown Subject'}
                        </span>
                        <span style={{ color: 'var(--text-dim)' }}>
                          Teacher: <strong style={{ color: 'var(--text-main)' }}>{w.teacher_name || w.teacher_id || '—'}</strong>
                          {w.student_name && <> · Student: <strong style={{ color: 'var(--text-main)' }}>{w.student_name}</strong></>}
                        </span>
                      </div>
                      {w.timestamp && (
                        <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {new Date(w.timestamp).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                    {w.device_id && (
                      <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                        Device: {w.device_id}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.15)', flexShrink: 0, display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              {syncWarnings.length > 0 && (
                <button
                  className="secondary-btn"
                  onClick={handleClearSubjectAudit}
                  style={{ borderColor: 'rgba(239,68,68,0.35)', color: 'var(--danger)' }}
                >
                  🗑 Clear Warnings
                </button>
              )}
              <button className="primary-btn" onClick={() => setIsSubjectAuditOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Teacher Detail Modal ────────────────────────────────────────────── */}
      {isDetailModalOpen && detailTeacher && (
        <div
          onClick={() => setIsDetailModalOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
            userSelect: 'none',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-dark)',
              border: '1px solid var(--glass-border)',
              borderRadius: 'var(--radius-xl)',
              width: '520px',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}
          >
            {/* Modal Header */}
            <div style={{
              padding: '16px 24px',
              borderBottom: '1px solid var(--glass-border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              flexShrink: 0, background: 'rgba(0,0,0,0.15)',
            }}>
              <div>
                <h3 style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '14px', margin: 0 }}>
                  🧑‍🏫 Teacher Profile
                </h3>
                <p style={{ fontSize: '11px', color: 'var(--text-dim)', margin: '2px 0 0' }}>
                  {detailTeacher.id}
                </p>
              </div>
              <button
                onClick={() => setIsDetailModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center' }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto' }}>

              {/* Identity */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                {([
                  { label: 'Full Name',   value: detailTeacher.name },
                  { label: 'Phone',       value: detailTeacher.phone      || '—' },
                  { label: 'Email',       value: detailTeacher.email      || '—' },
                  { label: 'Host Class',  value: detailTeacher.host_class || '—' },
                ] as { label: string; value: string }[]).map(({ label, value }) => (
                  <div key={label}>
                    <p style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>{label}</p>
                    <p style={{ fontSize: '13px', color: 'var(--text-main)', fontWeight: label === 'Full Name' ? 600 : 400, margin: 0 }}>{value}</p>
                  </div>
                ))}
              </div>

              {/* Class Allocations */}
              <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '16px' }}>
                <p style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
                  Class Allocations ({detailTeacher.allocations?.length || 0} entries)
                </p>
                {detailTeacher.allocations?.length ? (() => {
                  // Group by class_name
                  const grouped: Record<string, string[]> = {};
                  detailTeacher.allocations!.forEach(a => {
                    if (!grouped[a.class_name]) grouped[a.class_name] = [];
                    grouped[a.class_name].push(a.subject);
                  });
                  return Object.entries(grouped).map(([cls, subs]) => (
                    <div key={cls} style={{ marginBottom: '12px' }}>
                      <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-gold)', marginBottom: '6px' }}>{cls}</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {subs.map(sub => (
                          <span key={sub} style={{
                            fontSize: '11px', padding: '3px 10px',
                            background: 'rgba(255,215,0,0.07)',
                            border: '1px solid rgba(255,215,0,0.25)',
                            borderRadius: '20px', color: 'var(--accent-gold)',
                          }}>{sub}</span>
                        ))}
                      </div>
                    </div>
                  ));
                })() : (
                  <span style={{ fontSize: '12px', color: 'var(--text-dim)', fontStyle: 'italic' }}>No class allocations</span>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '14px 24px',
              borderTop: '1px solid var(--glass-border)',
              flexShrink: 0, background: 'rgba(0,0,0,0.15)',
              display: 'flex', justifyContent: 'flex-end', gap: '8px',
            }}>
              <button onClick={() => { setIsDetailModalOpen(false); openEditDrawer(detailTeacher); }} className="secondary-btn">
                ✏️ Edit Profile
              </button>
              <button onClick={() => setIsDetailModalOpen(false)} className="primary-btn" style={{ justifyContent: 'center' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      <SetupGuardModal
        isOpen={setupGuardOpen}
        onClose={() => setSetupGuardOpen(false)}
        step={setupGuardStep}
        message={setupGuardMessage}
      />
      <CSVReviewModal
        isOpen={csvReviewOpen}
        onClose={() => { setCsvReviewOpen(false); setPendingCsvFile(null); }}
        result={csvReviewResult}
        onAccept={handleCSVReviewAccept}
      />
    </>
  );
}

export default Teachers;
