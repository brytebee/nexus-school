import React, { useState, useEffect } from 'react';
import { useClassArms, ClassConfig } from '../hooks/useClassArms';
import { generateSessionsList } from '../lib/sessions';
import { useTermConfig } from '../hooks/useTermConfig';
import { useSudoAuth } from '../context/SudoAuthContext';
import { SetupGuardModal } from '../components/SetupGuardModal';
import { CSVReviewModal } from '../components/CSVReviewModal';

export default function Classes() {
  const { configs, refresh } = useClassArms();
  const { requireSudo } = useSudoAuth();
  
  // Slide-in drawer state
  const [selectedClass, setSelectedClass] = useState<ClassConfig | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [newArmName, setNewArmName] = useState('');

  // ── Phase 10: ILS curriculum type per class ──────────────────────────
  const [ilsClassType, setIlsClassType] = useState<'STANDARD_NIGERIAN' | 'ILS'>('STANDARD_NIGERIAN');
  const [ilsPacCount, setIlsPacCount] = useState<number>(12);
  const [ilsPacLabels, setIlsPacLabels] = useState<string[]>([]);
  const [ilsTypeLoading, setIlsTypeLoading] = useState(false);

  // Manual Class Creation Form states
  const [createClassName, setCreateClassName] = useState('');
  const [createMaxSubjects, setCreateMaxSubjects] = useState('10');
  const [createPassMark, setCreatePassMark] = useState('');
  const [createArms, setCreateArms] = useState('');

  // CSV Import state
  const [csvStatus, setCsvStatus] = useState<string | null>(null);

  // Setup Guard & CSV Review Modal States
  const [setupGuardOpen, setSetupGuardOpen] = useState(false);
  const [setupGuardStep, setSetupGuardStep] = useState('');
  const [setupGuardMessage, setSetupGuardMessage] = useState('');
  const [csvReviewOpen, setCsvReviewOpen] = useState(false);
  const [csvReviewResult, setCsvReviewResult] = useState<any>(null);
  const [pendingCsvFile, setPendingCsvFile] = useState<any>(null);

  // Handle Classes CSV Loaded notification
  useEffect(() => {
    if ((window as any).electronAPI?.onClassesCSVLoaded) {
      (window as any).electronAPI.onClassesCSVLoaded((res: { count: number, error: string | null }) => {
        const Swal = (window as any).Swal;
        if (res.error === 'SETUP_INCOMPLETE' && (res as any).setupCheck) {
          setSetupGuardStep((res as any).setupCheck.step || 'identity');
          setSetupGuardMessage((res as any).setupCheck.message || '');
          setSetupGuardOpen(true);
          setCsvStatus(null);
          return;
        }
        if (res.error) {
          setCsvStatus(`❌ Classes Import Failed: ${res.error}`);
          if (Swal) {
            Swal.fire({
              title: 'Classes Import Failed',
              text: res.error,
              icon: 'error',
              background: '#0b0f19',
              color: '#fff',
              confirmButtonColor: '#ef4444'
            });
          }
        } else if (res.count === 0) {
          setCsvStatus('⚠️ No class records imported. Check that you selected the correct CSV template.');
          if (Swal) {
            Swal.fire({
              title: 'No Records Imported',
              text: 'Zero rows were processed. Ensure you are using the Nexus Classes CSV template with a Class_Name column.',
              icon: 'warning',
              background: '#0b0f19',
              color: '#fff',
              confirmButtonColor: '#f59e0b'
            });
          }
        } else {
          setCsvStatus(`✅ Classes CSV Processed: ${res.count} records loaded`);
          refresh();
          if (Swal) {
            Swal.fire({
              title: 'Success!',
              text: `Successfully imported ${res.count} class records.`,
              icon: 'success',
              background: '#0b0f19',
              color: '#fff',
              confirmButtonColor: '#00E5FF'
            });
          }
        }
        setTimeout(() => setCsvStatus(null), 4000);
      });
    }
  }, [refresh]);

  const handleClassesCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const Swal = (window as any).Swal;
    const api = (window as any).electronAPI;

    if (api?.getDbStats) {
      try {
        const stats = await api.getDbStats();
        if (stats && stats.classes > 0) {
          if (Swal) {
            const result = await Swal.fire({
              title: 'Replace Existing Classes?',
              text: `Warning: You currently have ${stats.classes} classes/arms configured. Uploading this template will completely delete and replace them. Continue?`,
              icon: 'warning',
              showCancelButton: true,
              confirmButtonText: 'Yes, Overwrite',
              cancelButtonText: 'Cancel',
              background: '#0b0f19',
              color: '#fff',
              confirmButtonColor: '#f59e0b',
              cancelButtonColor: '#ef4444'
            });
            if (!result.isConfirmed) {
              e.target.value = '';
              return;
            }
          }
        }
      } catch (err) {
        console.error('Failed to run preflight check:', err);
      }
    }

    // Dry-run validation before sending
    try {
      const dryRun = await (window as any).nexusAPI?.validateCSVDryRun?.({ filePath: file.path, type: 'classes' });
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

    setCsvStatus('⏳ Ingesting and verifying Classes CSV data...');
    if (api?.processClassesCSV) {
      api.processClassesCSV(file.path);
    }
    e.target.value = '';
  };

  const handleCSVReviewAccept = () => {
    setCsvReviewOpen(false);
    if (!pendingCsvFile) return;
    const file = pendingCsvFile;
    setPendingCsvFile(null);
    const api = (window as any).electronAPI;
    setCsvStatus('⏳ Ingesting and verifying Classes CSV data...');
    if (api?.processClassesCSV) api.processClassesCSV(file.path);
  };

  const handleClearClasses = async () => {
    const Swal = (window as any).Swal;
    const api = (window as any).electronAPI;
    if (!api?.assets?.clear) return;

    try {
      if (api.getDbStats) {
        const stats = await api.getDbStats();
        if (stats && (stats.teachers > 0 || stats.students > 0)) {
          if (Swal) {
            Swal.fire({
              title: 'Cannot Clear Classes',
              text: `There are currently ${stats.teachers} teachers and ${stats.students} students registered in the system that depend on these classes. Please clear them first.`,
              icon: 'error',
              background: '#0b0f19',
              color: '#fff',
              confirmButtonColor: '#ef4444'
            });
          } else {
            alert('Cannot clear classes: teachers or students exist.');
          }
          return;
        }
      }

      requireSudo(
        async () => {
          setCsvStatus('⏳ Clearing classes from database...');
          const res = await api.assets.clear({ asset: 'classes' });
          if (res?.ok) {
            setCsvStatus('✅ All class configurations cleared');
            refresh();
            fetchGlobalSettings();
            if (Swal) {
              Swal.fire({
                title: 'Cleared!',
                text: 'All classes and arms have been successfully deleted.',
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
        'Clear All Classes & Arms?',
        'This will completely delete all configured classes and arms from the database. This action is permanent and cannot be undone.',
        true
      );
    } catch (err: any) {
      console.error(err);
      if (Swal) Swal.fire({ title: 'Error', text: err.message, icon: 'error', background: '#0b0f19', color: '#fff' });
    }
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    const Swal = (window as any).Swal;
    if (!createClassName.trim()) {
      if (Swal) Swal.fire({ title: 'Error', text: 'Class name is required.', icon: 'error', background: '#0b0f19', color: '#fff' });
      return;
    }

    const api = (window as any).electronAPI;
    if (!api?.classes?.create) {
      if (Swal) Swal.fire({ title: 'Error', text: 'Class creation is not supported on this platform.', icon: 'error', background: '#0b0f19', color: '#fff' });
      return;
    }

    const parsedMax = parseInt(createMaxSubjects) || 10;
    const parsedPass = createPassMark.trim() === '' ? null : parseInt(createPassMark);
    const parsedArms = createArms
      .split(/[,|]/)
      .map(a => a.trim())
      .filter(Boolean);

    try {
      const res = await api.classes.create({
        className: createClassName.trim(),
        maxSubjects: parsedMax,
        passMarkOverride: parsedPass,
        arms: parsedArms
      });

      if (res?.error === 'SETUP_INCOMPLETE' || res?.step) {
        setSetupGuardStep(res.step || 'identity');
        setSetupGuardMessage(res.message || 'Setup step required before creating classes.');
        setSetupGuardOpen(true);
        return;
      }

      if (res && res.success) {
        if (Swal) {
          Swal.fire({
            title: 'Success!',
            text: `Class "${createClassName.trim()}" created successfully.`,
            icon: 'success',
            background: '#0b0f19',
            color: '#fff',
            confirmButtonColor: '#00E5FF'
          });
        }
        // Clear form
        setCreateClassName('');
        setCreateMaxSubjects('10');
        setCreatePassMark('');
        setCreateArms('');
        // Refresh class list & global settings
        refresh();
        fetchGlobalSettings();
      } else {
        if (Swal) {
          Swal.fire({
            title: 'Failed',
            text: res?.error || 'Unknown error occurred.',
            icon: 'error',
            background: '#0b0f19',
            color: '#fff',
            confirmButtonColor: '#ef4444'
          });
        }
      }
    } catch (err: any) {
      console.error(err);
      if (Swal) Swal.fire({ title: 'Error', text: err.message, icon: 'error', background: '#0b0f19', color: '#fff' });
    }
  };
  
  // Inline/card temporary inputs
  const [cardMaxSubjects, setCardMaxSubjects] = useState<Record<string, string>>({});
  const [cardPassOverride, setCardPassOverride] = useState<Record<string, string>>({});
  const [cardNewArm, setCardNewArm] = useState<Record<string, string>>({});

  // Bottom Settings Accordion states
  const [classHierarchy, setClassHierarchy] = useState<string[]>([]);
  const [newClassInput, setNewClassInput] = useState('');
  const [globalPassMark, setGlobalPassMark] = useState(50);
  const [activeSession, setActiveSession] = useState('2025/2026');
  
  const [isHierarchyOpen, setIsHierarchyOpen] = useState(false);
  const [isGlobalPassMarkOpen, setIsGlobalPassMarkOpen] = useState(false);
  const [isRolloverOpen, setIsRolloverOpen] = useState(false);

  // Drag-and-drop state for Hierarchy reordering
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // ── Phase 3B Rollover state ───────────────────────────────────────────────
  const [rolloverTab, setRolloverTab] = useState<'structure'|'session'|'class'|'student'>('session');

  // Term Config Hook
  const { termsList, periodLabel: configPeriodLabel } = useTermConfig();

  // Tab 1 – Term Structure
  const [termStructure, setTermStructure] = useState<{ terms: string[]; period_label: string }>({ terms: ['First Term','Second Term','Third Term','Fourth Term'], period_label: 'term' });
  const [newTermInput, setNewTermInput] = useState('');
  const [termStructureSaving, setTermStructureSaving] = useState(false);

  // Sync termsList into termStructure state when hook loads
  useEffect(() => {
    if (termsList && termsList.length > 0) {
      setTermStructure(prev => ({
        terms: termsList,
        period_label: configPeriodLabel || prev.period_label || 'term'
      }));
    }
  }, [termsList, configPeriodLabel]);

  // Tab 2 – Full Session / Term Advance preview
  const [rolloverPreview, setRolloverPreview] = useState<any>(null);
  const [rolloverNewSession, setRolloverNewSession] = useState('');

  // Tab 3 – Single Class
  const [classRolloverClass, setClassRolloverClass] = useState('');
  const [classRolloverArm, setClassRolloverArm] = useState('');

  // Tab 4 – Student Level
  const [studentRolloverMode, setStudentRolloverMode] = useState<'batch'|'single'>('batch');
  // Batch
  const [batchFilterClass, setBatchFilterClass] = useState('');
  const [batchFilterArm,   setBatchFilterArm]   = useState('');
  const [batchStudents, setBatchStudents] = useState<any[]>([]);
  const [batchSelected, setBatchSelected] = useState<Set<number>>(new Set());
  const [batchAction, setBatchAction] = useState('promote');
  const [batchTargetClass, setBatchTargetClass] = useState('');
  const [batchTargetArm, setBatchTargetArm] = useState('');
  // Single
  const [singleSearch, setSingleSearch] = useState('');
  const [singleResults, setSingleResults] = useState<any[]>([]);
  const [singleStudent, setSingleStudent] = useState<any>(null);
  const [singleAction, setSingleAction] = useState('promote');
  const [singleTargetClass, setSingleTargetClass] = useState('');
  const [singleTargetArm, setSingleTargetArm] = useState('');
  const [singleNote, setSingleNote] = useState('');
  // Preview error state
  const [rolloverPreviewError, setRolloverPreviewError] = useState<string|null>(null);
  // Active term (from school_term_config — same source as PrintHub)
  const [activeTerm, setActiveTerm] = useState('');

  // Load global system settings
  const fetchGlobalSettings = async () => {
    if (!(window as any).electronAPI?.cbt?.getSystemSettings) return;
    try {
      const res = await (window as any).electronAPI.cbt.getSystemSettings();
      if (res) {
        setClassHierarchy(Array.isArray(res.class_hierarchy) ? res.class_hierarchy : []);
        setGlobalPassMark(parseInt(res.pass_mark_threshold) || 50);
        setActiveSession(res.current_academic_session || '2025/2026');
        if (res.term_structure) {
          try { setTermStructure(JSON.parse(res.term_structure)); } catch (_) {}
        }
      }
    } catch (err) {
      console.error('Error fetching global settings:', err);
    }
    // Also load the active term from school_term_config (same source as PrintHub)
    try {
      const termCfg = await (window as any).electronAPI?.getTermConfig?.();
      if (termCfg?.term) setActiveTerm(termCfg.term);
    } catch (_) {}
  };

  // Load rollover session preview
  const fetchRolloverPreview = async () => {
    const api = (window as any).electronAPI?.rollover || (window as any).nexusAPI?.rollover;
    if (!api?.sessionPreview) { setRolloverPreviewError('Rollover API not available.'); return; }
    setRolloverPreviewError(null);
    try {
      const res = await api.sessionPreview();
      if (res?.ok) {
        setRolloverPreview(res);
        // Sync activeTerm from the live preview (most up-to-date source)
        if (res.currentTerm) setActiveTerm(res.currentTerm);
      } else {
        setRolloverPreviewError(res?.error || 'Preview failed');
      }
    } catch (e: any) {
      setRolloverPreviewError(e?.message || 'Preview error');
    }
  };

  useEffect(() => {
    fetchGlobalSettings();
    fetchRolloverPreview();
  }, []);

  // ── Issue 3A fix: Fetch batch students using the real getAllStudents API ──
  useEffect(() => {
    if (!batchFilterClass) { setBatchStudents([]); setBatchSelected(new Set()); return; }
    const api = (window as any).electronAPI;
    if (!api?.getAllStudents) return;
    api.getAllStudents({ class_name: batchFilterClass, limit: 500, minimal: true }).then((res: any) => {
      let list = Array.isArray(res?.data) ? res.data : [];
      if (batchFilterArm) {
        list = list.filter((s: any) =>
          (s.class_arm || '').trim().toUpperCase() === batchFilterArm.trim().toUpperCase()
        );
      }
      setBatchStudents(list);
      setBatchSelected(new Set());
    }).catch(() => {});
  }, [batchFilterClass, batchFilterArm]);

  // ── Issue 3B fix: Debounce single student search via getAllStudents ──
  useEffect(() => {
    if (!singleSearch.trim()) { setSingleResults([]); return; }
    const api = (window as any).electronAPI;
    if (!api?.getAllStudents) return;
    const t = setTimeout(() => {
      api.getAllStudents({ search: singleSearch, limit: 8, minimal: true }).then((res: any) => {
        const list = Array.isArray(res?.data) ? res.data : [];
        setSingleResults(list);
      }).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [singleSearch]);

  // Update local input values when configs list refreshes
  useEffect(() => {
    const maxSubsMap: Record<string, string> = {};
    const passOverMap: Record<string, string> = {};
    configs.forEach(c => {
      maxSubsMap[c.hierarchy_class] = c.max_subjects > 0 ? c.max_subjects.toString() : '';
      passOverMap[c.hierarchy_class] = c.pass_mark_override !== null && c.pass_mark_override !== undefined ? c.pass_mark_override.toString() : '';
    });
    setCardMaxSubjects(maxSubsMap);
    setCardPassOverride(passOverMap);
  }, [configs]);

  // Keep the selectedClass reference updated when configs change
  useEffect(() => {
    if (selectedClass) {
      const updated = configs.find(c => c.hierarchy_class === selectedClass.hierarchy_class);
      if (updated) {
        setSelectedClass(updated);
      }
    }
  }, [configs, selectedClass]);

  const handleSaveClassConfig = async (hierarchyClass: string, maxSubjects: number, passMarkOverride: number | null) => {
    const api = (window as any).electronAPI;
    const Swal = (window as any).Swal;
    try {
      const res = await api.classes.saveConfig({ hierarchyClass, maxSubjects, passMarkOverride });
      if (res?.error === 'SETUP_INCOMPLETE') {
        setSetupGuardStep(res.step || 'identity');
        setSetupGuardMessage(res.message || '');
        setSetupGuardOpen(true);
        return;
      }
      refresh();
    } catch (err: any) {
      if (Swal) Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Failed saving config', showConfirmButton: false, timer: 3000, background: '#0d1235', color: '#fff' });
    }
  };

  const handleAddArm = async (hierarchyClass: string, arm: string) => {
    if (!arm.trim()) return;
    const api = (window as any).electronAPI;
    const Swal = (window as any).Swal;
    try {
      const res = await api.classes.addArm({ hierarchyClass, arm: arm.trim() });
      if (res?.error === 'SETUP_INCOMPLETE') {
        setSetupGuardStep(res.step || 'identity');
        setSetupGuardMessage(res.message || '');
        setSetupGuardOpen(true);
        return;
      }
      if (res && res.success) {
        refresh();
      } else if (Swal) {
        Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: res?.error || 'Failed adding arm', showConfirmButton: false, timer: 3000, background: '#0d1235', color: '#fff' });
      }
    } catch (err: any) {
      if (Swal) Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Failed adding arm', showConfirmButton: false, timer: 3000, background: '#0d1235', color: '#fff' });
    }
  };

  const handleRemoveArm = async (hierarchyClass: string, arm: string) => {
    const api = (window as any).electronAPI;
    const Swal = (window as any).Swal;
    if (!Swal) return;

    const confirmResult = await Swal.fire({
      title: `<span style="color:#EF4444; font-size:18px; font-weight:700;">⚠️ Delete Arm "${hierarchyClass} ${arm}"?</span>`,
      html: '<p style="color:rgba(255,255,255,0.65); font-size:13px; line-height:1.6;">This will remove this class arm designation. Existing student allocations to this arm will be unlinked.</p>',
      showCancelButton: true,
      confirmButtonText: 'Yes, Delete',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#EF4444',
      cancelButtonColor: '#1a1a2e',
      background: '#0d1235',
      color: '#fff',
    });
    if (!confirmResult.isConfirmed) return;

    try {
      const res = await api.classes.removeArm({ hierarchyClass, arm });
      if (res && res.success) {
        refresh();
      } else {
        Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: res?.error || 'Failed removing arm', showConfirmButton: false, timer: 3000, background: '#0d1235', color: '#fff' });
      }
    } catch (err: any) {
      Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Failed removing arm', showConfirmButton: false, timer: 3000, background: '#0d1235', color: '#fff' });
    }
  };

  // Hierarchy reordering handlers
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

  const handleRemoveClassFromHierarchy = (index: number) => {
    setClassHierarchy(prev => prev.filter((_, i) => i !== index));
  };

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
    if (!(window as any).electronAPI?.cbt?.saveSystemSetting) return;
    const Swal = (window as any).Swal;
    try {
      await (window as any).electronAPI.cbt.saveSystemSetting({ key: 'class_hierarchy', value: classHierarchy });
      if (Swal) Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Class hierarchy updated', showConfirmButton: false, timer: 2800, background: '#0d1235', color: '#fff' });
      refresh();
    } catch (err: any) {
      if (Swal) Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Failed saving hierarchy', showConfirmButton: false, timer: 3000, background: '#0d1235', color: '#fff' });
    }
  };

  const handleSavePassMark = async () => {
    if (!(window as any).electronAPI?.cbt?.saveSystemSetting) return;
    const Swal = (window as any).Swal;
    try {
      await (window as any).electronAPI.cbt.saveSystemSetting({ key: 'pass_mark_threshold', value: globalPassMark.toString() });
      if (Swal) Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Global pass mark threshold updated', showConfirmButton: false, timer: 2800, background: '#0d1235', color: '#fff' });
    } catch (err: any) {
      if (Swal) Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Failed saving threshold', showConfirmButton: false, timer: 3000, background: '#0d1235', color: '#fff' });
    }
  };

  const handleRollover = async () => {
    if (!(window as any).electronAPI?.cbt?.saveSystemSetting) return;
    const Swal = (window as any).Swal;
    if (!Swal) return;
    const sessionOptions: Record<string, string> = {};
    generateSessionsList().forEach((s) => {
      sessionOptions[s] = s;
    });

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
      input: 'select',
      inputOptions: sessionOptions,
      inputLabel: 'Select the new session',
      inputPlaceholder: 'Select session',
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
        await (window as any).electronAPI.cbt.saveSystemSetting({ key: 'current_academic_session', value: newSessionInput.trim() });
        setActiveSession(newSessionInput.trim());
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Academic session rolled over', showConfirmButton: false, timer: 3000, background: '#0d1235', color: '#fff' });
      } catch (err: any) {
        Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Failed session rollover', showConfirmButton: false, timer: 3000, background: '#0d1235', color: '#fff' });
      }
    }
  };

  const openClassDrawer = (c: ClassConfig) => {
    setSelectedClass(c);
    setDrawerOpen(true);
    setNewArmName('');
    // Phase 10: load this class's curriculum_type, pac_count & pac_labels
    setIlsClassType('STANDARD_NIGERIAN');
    setIlsPacCount(12);
    setIlsPacLabels([]);
    const api = (window as any).electronAPI;
    if (api?.ils?.getClassType) {
      api.ils.getClassType(c.hierarchy_class).then((res: any) => {
        if (res?.ok) {
          setIlsClassType(res.type || 'STANDARD_NIGERIAN');
          setIlsPacCount(res.pacCount || 12);
          setIlsPacLabels(Array.isArray(res.pacLabels) ? res.pacLabels : []);
        }
      }).catch(() => {});
    }
  };


  return (
    <div className="animate-in fade-in duration-300 h-full flex flex-col min-h-0" style={{ padding: '24px', background: '#020617', color: '#f8fafc', overflowY: 'auto' }}>
      
      {/* View Header */}
      <div className="view-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h2 className="view-title" style={{ fontSize: '24px', fontWeight: 800, color: '#f8fafc', margin: 0 }}>🏫 Class & Arm Manager</h2>
          <p className="view-sub" style={{ fontSize: '13px', color: '#94a3b8', margin: '4px 0 0 0' }}>
            Configure hierarchy classes, assign stable subject capacities, override pass marks, and manage aliases/arms.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <a
            href="data:text/csv;charset=utf-8,Class_Name,Max_Subjects,Pass_Mark_Override,Arms%0AJSS 1,12,45,A|B|C%0ASS 1,15,50,Science|Arts"
            download="Nexus_Classes_Template.csv"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '6px',
              color: '#f8fafc',
              fontSize: '12px',
              fontWeight: 500,
              padding: '6px 12px',
              textDecoration: 'none',
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
            onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)')}
            onMouseOut={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)')}
          >
            📥 Download CSV Template
          </a>
          <label
            htmlFor="classes-csv-upload-input"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              background: '#00e5ff',
              color: '#020617',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              padding: '6px 14px',
              cursor: 'pointer',
              transition: 'opacity 0.2s',
            }}
            onMouseOver={(e) => (e.currentTarget.style.opacity = '0.9')}
            onMouseOut={(e) => (e.currentTarget.style.opacity = '1')}
          >
            ⚡ Import CSV
          </label>
          <input
            id="classes-csv-upload-input"
            type="file"
            accept=".csv"
            onChange={handleClassesCSVUpload}
            style={{ display: 'none' }}
          />
          {configs.length > 0 && (
            <button
              onClick={handleClearClasses}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '6px',
                color: '#fca5a5',
                fontSize: '12px',
                fontWeight: 600,
                padding: '6px 14px',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)';
              }}
            >
              🗑️ Clear Data
            </button>
          )}
        </div>
      </div>

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

      {/* Main Grid: Class configs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px', marginBottom: '40px' }}>
        {/* Creation Card */}
        <form 
          onSubmit={handleCreateClass}
          style={{
            background: 'rgba(30, 41, 59, 0.25)',
            border: '2px dashed rgba(0, 229, 255, 0.2)',
            borderRadius: '12px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            backdropFilter: 'blur(8px)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '6px' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#00E5FF' }}>➕ Create Class Manual</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>Class Name</label>
            <input 
              type="text"
              required
              value={createClassName}
              onChange={(e) => setCreateClassName(e.target.value)}
              placeholder="e.g. JSS 4, SS 4"
              className="modern-input"
              style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#fff', padding: '6px 10px', fontSize: '12px' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>Max Subjects</label>
              <input 
                type="number"
                min="1"
                value={createMaxSubjects}
                onChange={(e) => setCreateMaxSubjects(e.target.value)}
                placeholder="10"
                className="modern-input"
                style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#fff', padding: '6px 10px', fontSize: '12px' }}
              />
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>Pass Mark</label>
              <input 
                type="number"
                min="0"
                max="100"
                value={createPassMark}
                onChange={(e) => setCreatePassMark(e.target.value)}
                placeholder={`Global: ${globalPassMark}`}
                className="modern-input"
                style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#fff', padding: '6px 10px', fontSize: '12px' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>Arms / Sections (Comma-separated)</label>
            <input 
              type="text"
              value={createArms}
              onChange={(e) => setCreateArms(e.target.value)}
              placeholder="e.g. Gold, Ruby, Emerald"
              className="modern-input"
              style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#fff', padding: '6px 10px', fontSize: '12px' }}
            />
          </div>

          <button
            type="submit"
            style={{
              background: 'linear-gradient(135deg, #00E5FF 0%, #00B0FF 100%)',
              border: 'none',
              borderRadius: '6px',
              color: '#020617',
              fontSize: '12px',
              fontWeight: 700,
              padding: '8px',
              cursor: 'pointer',
              marginTop: '6px',
              boxShadow: '0 4px 12px rgba(0, 229, 255, 0.2)',
              transition: 'opacity 0.2s',
            }}
            onMouseOver={(e) => (e.currentTarget.style.opacity = '0.9')}
            onMouseOut={(e) => (e.currentTarget.style.opacity = '1')}
          >
            Create Class
          </button>
        </form>

        {configs.map((c) => {
          const maxSubs = cardMaxSubjects[c.hierarchy_class] || '';
          const passMarkOver = cardPassOverride[c.hierarchy_class] || '';
          const armInputVal = cardNewArm[c.hierarchy_class] || '';

          return (
            <div 
              key={c.hierarchy_class} 
              style={{
                background: 'rgba(30, 41, 59, 0.4)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '12px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                position: 'relative',
                backdropFilter: 'blur(8px)'
              }}
            >
              {/* Header block */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '16px', fontWeight: 700, color: '#00E5FF' }}>{c.hierarchy_class}</span>
                <button 
                  onClick={() => openClassDrawer(c)}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '4px 8px',
                    fontSize: '11px',
                    color: '#94a3b8',
                    cursor: 'pointer'
                  }}
                >
                  Manage ⚙️
                </button>
              </div>

              {/* Card inputs */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>Max Subjects</label>
                  <input 
                    type="number"
                    value={maxSubs}
                    onChange={(e) => setCardMaxSubjects(prev => ({ ...prev, [c.hierarchy_class]: e.target.value }))}
                    onBlur={() => {
                      const num = parseInt(maxSubs) || 0;
                      handleSaveClassConfig(c.hierarchy_class, num, c.pass_mark_override);
                    }}
                    placeholder="Auto (Graded)"
                    className="modern-input"
                    style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#fff', padding: '6px 10px', fontSize: '12px' }}
                  />
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>Pass Mark Override</label>
                  <input 
                    type="number"
                    value={passMarkOver}
                    onChange={(e) => setCardPassOverride(prev => ({ ...prev, [c.hierarchy_class]: e.target.value }))}
                    onBlur={() => {
                      const num = passMarkOver === '' ? null : parseInt(passMarkOver);
                      handleSaveClassConfig(c.hierarchy_class, c.max_subjects, num);
                    }}
                    placeholder={`Global: ${globalPassMark}`}
                    className="modern-input"
                    style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#fff', padding: '6px 10px', fontSize: '12px' }}
                  />
                </div>
              </div>

              {/* Arm chips */}
              <div>
                <label style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Arms / Sections</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '26px' }}>
                  {c.arms.map(arm => (
                    <span 
                      key={arm} 
                      style={{
                        background: 'rgba(0, 229, 255, 0.08)',
                        border: '1px solid rgba(0, 229, 255, 0.2)',
                        borderRadius: '16px',
                        padding: '2px 8px',
                        fontSize: '11px',
                        color: '#00E5FF',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      {arm}
                      <span 
                        onClick={() => handleRemoveArm(c.hierarchy_class, arm)}
                        style={{ cursor: 'pointer', opacity: 0.7, fontWeight: 800 }}
                      >
                        &times;
                      </span>
                    </span>
                  ))}
                  {c.arms.length === 0 && (
                    <span style={{ fontSize: '11px', color: '#475569', fontStyle: 'italic' }}>No arms configured</span>
                  )}
                </div>
              </div>

              {/* Add arm inline form */}
              <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                <input 
                  type="text"
                  placeholder="New Arm (e.g. Gold)"
                  value={armInputVal}
                  onChange={(e) => setCardNewArm(prev => ({ ...prev, [c.hierarchy_class]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleAddArm(c.hierarchy_class, armInputVal);
                      setCardNewArm(prev => ({ ...prev, [c.hierarchy_class]: '' }));
                    }
                  }}
                  className="modern-input"
                  style={{ flex: 1, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#fff', padding: '4px 8px', fontSize: '11px' }}
                />
                <button
                  onClick={() => {
                    handleAddArm(c.hierarchy_class, armInputVal);
                    setCardNewArm(prev => ({ ...prev, [c.hierarchy_class]: '' }));
                  }}
                  style={{
                    background: '#00E5FF',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#000',
                    fontWeight: 700,
                    fontSize: '11px',
                    padding: '4px 10px',
                    cursor: 'pointer'
                  }}
                >
                  + Add
                </button>
              </div>

            </div>
          );
        })}
      </div>

      {/* Slide-in right drawer for selected class details */}
      {drawerOpen && selectedClass && (
        <>
          <div 
            style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.55)', zIndex: 2000, backdropFilter: 'blur(4px)' }} 
            onClick={() => setDrawerOpen(false)} 
          />
          <div 
            style={{ 
              position: 'fixed', 
              top: 0, 
              bottom: 0, 
              right: 0, 
              width: '400px', 
              height: '100vh', 
              background: '#0d1235', 
              borderLeft: '1px solid var(--glass-border)', 
              zIndex: 2001, 
              display: 'flex', 
              flexDirection: 'column' 
            }}
          >
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, background: 'rgba(0, 0, 0, 0.15)' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#00E5FF', margin: 0 }}>⚙️ Manage: {selectedClass.hierarchy_class}</h3>
              <button
                id="close-classes-drawer-btn"
                onClick={() => setDrawerOpen(false)}
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

            <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Configs */}
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <span style={{ fontSize: '11px', color: '#00E5FF', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Stable Subject Denominator
                </span>
                <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
                  The number of core subjects expected to be graded for average calculations. Enter 0 to fall back to the dynamic student subject count.
                </p>
                <div className="form-group">
                  <input
                    type="number"
                    placeholder="e.g. 10"
                    value={selectedClass.max_subjects > 0 ? selectedClass.max_subjects.toString() : ''}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      handleSaveClassConfig(selectedClass.hierarchy_class, val, selectedClass.pass_mark_override);
                    }}
                    className="modern-input"
                  />
                </div>
              </div>

              <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <span style={{ fontSize: '11px', color: '#00E5FF', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Pass Mark Override
                </span>
                <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
                  Specify a distinct pass mark target (%) for this class. Leave empty to inherit the global pass mark threshold.
                </p>
                <div className="form-group">
                  <input
                    type="number"
                    placeholder={`Global default: ${globalPassMark}%`}
                    value={selectedClass.pass_mark_override !== null && selectedClass.pass_mark_override !== undefined ? selectedClass.pass_mark_override.toString() : ''}
                    onChange={(e) => {
                      const val = e.target.value === '' ? null : parseInt(e.target.value);
                      handleSaveClassConfig(selectedClass.hierarchy_class, selectedClass.max_subjects, val);
                    }}
                    className="modern-input"
                  />
                </div>
              </div>

              {/* ── Phase 10: Curriculum Mode ───────────────────────── */}
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <span style={{ fontSize: '11px', color: '#00E5FF', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Curriculum Mode
                </span>
                <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
                  Switch to <strong style={{ color: '#fff' }}>ILS</strong> for ACE PAC-based grading (affects score entry &amp; reports only). All other features remain unchanged.
                </p>

                <div style={{ display: 'flex', gap: '8px' }}>
                  {(['STANDARD_NIGERIAN', 'ILS'] as const).map(mode => (
                    <button
                      key={mode}
                      id={`curriculum-mode-${mode.toLowerCase()}-btn`}
                      disabled={ilsTypeLoading}
                      onClick={async () => {
                        if (ilsTypeLoading || !selectedClass || ilsClassType === mode) return;
                        setIlsTypeLoading(true);
                        try {
                          const api = (window as any).electronAPI;
                          const recCheck = await api?.ils?.checkClassRecords(selectedClass.hierarchy_class);

                          const applySwitch = async () => {
                            const res = await api?.ils?.setClassType({ className: selectedClass.hierarchy_class, type: mode, pacCount: ilsPacCount });
                            if (res?.ok) {
                              setIlsClassType(mode);
                              const Swal = (window as any).Swal;
                              const purgedMsg = (res?.purgedCount ?? 0) > 0 ? ` (${res.purgedCount} record(s) cleared)` : '';
                              Swal?.fire({
                                toast: true,
                                position: 'top-end',
                                icon: 'success',
                                title: `Curriculum set to ${mode === 'ILS' ? 'ILS (PAC)' : 'Standard Nigerian'}${purgedMsg}`,
                                showConfirmButton: false,
                                timer: 3000,
                                background: '#0d1235',
                                color: '#fff',
                              });
                            } else {
                              const Swal = (window as any).Swal;
                              Swal?.fire({
                                toast: true,
                                position: 'top-end',
                                icon: 'error',
                                title: res?.error || 'Failed to update',
                                showConfirmButton: false,
                                timer: 3000,
                                background: '#0d1235',
                                color: '#fff',
                              });
                            }
                          };

                          // ── Always require Principal/Superadmin (Level 7+) to switch curriculum ──
                          const modeLabel = mode === 'ILS' ? 'ILS (ACE PAC)' : 'Standard Nigerian';
                          let bodyMsg: string;
                          if ((recCheck?.recordCount ?? 0) > 0) {
                            const prevSystem = mode === 'ILS' ? 'Standard Nigerian' : 'ILS (ACE PAC)';
                            bodyMsg = `⚠️ ${selectedClass.hierarchy_class} has ${recCheck.recordCount} existing record(s) for the active term (${recCheck.academicSession} – ${recCheck.term}).

Switching to ${modeLabel} will archive the current ${prevSystem} records for this term — they will NOT be deleted but will be inaccessible during the new mode.

A Principal or Superadmin (Level 7+) must authorize this change.`;
                          } else {
                            bodyMsg = `You are switching ${selectedClass.hierarchy_class} to ${modeLabel} curriculum mode. This affects score entry and report templates for all arms of this class. A Principal or Superadmin (Level 7+) must authorize this change.`;
                          }

                          await requireSudo(
                            async () => { await applySwitch(); },
                            `Authorize Curriculum Switch: ${selectedClass.hierarchy_class} → ${modeLabel}`,
                            bodyMsg,
                            true,
                            7 // minRoleLevel: Principal/Superadmin+
                          );
                        } finally {
                          setIlsTypeLoading(false);
                        }
                      }}
                      style={{
                        flex: 1, padding: '10px 0',
                        borderRadius: '8px', fontWeight: 700, fontSize: '12px',
                        cursor: ilsTypeLoading ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s ease',
                        border: ilsClassType === mode ? '2px solid #00E5FF' : '2px solid rgba(255,255,255,0.1)',
                        background: ilsClassType === mode ? 'rgba(0,229,255,0.12)' : 'rgba(255,255,255,0.03)',
                        color: ilsClassType === mode ? '#00E5FF' : '#94a3b8',
                      }}
                    >
                      {mode === 'STANDARD_NIGERIAN' ? '🇳🇬 Standard Nigerian' : '📚 ILS (PAC)'}
                    </button>
                  ))}
                </div>

                {ilsClassType === 'ILS' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                    <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', fontWeight: 600 }}>
                      PAC Count per Subject (5–25):
                    </label>
                    <input
                      type="number"
                      min={5}
                      max={25}
                      value={ilsPacCount}
                      onChange={async (e) => {
                        const val = Math.min(25, Math.max(5, parseInt(e.target.value) || 12));
                        setIlsPacCount(val);
                        if (selectedClass) {
                          const api = (window as any).electronAPI;
                          await api?.ils?.setClassType({ className: selectedClass.hierarchy_class, type: 'ILS', pacCount: val });
                        }
                      }}
                      className="modern-input"
                      style={{ width: '100%' }}
                    />
                    <p style={{ fontSize: '10px', color: '#f59e0b', margin: 0, padding: '8px 10px', background: 'rgba(245,158,11,0.08)', borderRadius: '6px', border: '1px solid rgba(245,158,11,0.25)', lineHeight: 1.5 }}>
                      ⚠️ ILS mode: Score entry in Result Studio will show PAC inputs (Packs 1–{ilsPacCount}, pass ≥ 85). Report cards will use the ILS Landscape template. Class position ranking is suppressed.
                    </p>

                    {/* ── Editable PAC Column Labels ── */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>
                          PAC Column Labels <span style={{ color: '#64748b', fontWeight: 400 }}>(leave blank to use P1, P2…)</span>
                        </label>
                        <button
                          id="save-pac-labels-btn"
                          onClick={async () => {
                            if (!selectedClass) return;
                            const api = (window as any).electronAPI;
                            const cleanLabels = ilsPacLabels.map(l => l.trim());
                            const res = await api?.ils?.setClassType({
                              className: selectedClass.hierarchy_class,
                              type: 'ILS',
                              pacCount: ilsPacCount,
                              pacLabels: cleanLabels,
                            });
                            const Swal = (window as any).Swal;
                            if (res?.ok) {
                              Swal?.fire({ toast: true, position: 'top-end', icon: 'success', title: 'PAC labels saved', showConfirmButton: false, timer: 2500, background: '#0d1235', color: '#fff' });
                            } else {
                              Swal?.fire({ toast: true, position: 'top-end', icon: 'error', title: res?.error || 'Failed to save labels', showConfirmButton: false, timer: 3000, background: '#0d1235', color: '#fff' });
                            }
                          }}
                          style={{
                            padding: '4px 12px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 700,
                            background: 'rgba(0,229,255,0.12)',
                            border: '1px solid rgba(0,229,255,0.4)',
                            color: '#00E5FF',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                          }}
                          onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(0,229,255,0.22)'; }}
                          onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(0,229,255,0.12)'; }}
                        >
                          💾 Save Labels
                        </button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '6px' }}>
                        {Array.from({ length: ilsPacCount }, (_, i) => {
                          const idx = i;
                          const placeholder = `P${i + 1}`;
                          const val = ilsPacLabels[idx] ?? '';
                          return (
                            <input
                              key={idx}
                              type="text"
                              placeholder={placeholder}
                              value={val}
                              maxLength={12}
                              className="modern-input"
                              style={{ fontSize: '11px', padding: '5px 8px', textAlign: 'center' }}
                              onChange={(e) => {
                                const updated = [...ilsPacLabels];
                                while (updated.length <= idx) updated.push('');
                                updated[idx] = e.target.value;
                                setIlsPacLabels(updated);
                              }}
                            />
                          );
                        })}
                      </div>
                      <p style={{ fontSize: '10px', color: '#64748b', margin: 0 }}>
                        Tip: Edit labels then click <strong style={{ color: '#00E5FF' }}>💾 Save Labels</strong> to persist. Blank fields default to P1, P2…
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Arms Management */}
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <span style={{ fontSize: '11px', color: '#00E5FF', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Arm Designation List
                </span>
                <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
                  Add aliases or distinct arm tags (e.g. Gold, Onyx, Diamond, A, B) to segment students into classes.
                </p>

                <div style={{ display: 'flex', gap: '6px' }}>
                  <input 
                    type="text"
                    placeholder="e.g. Bronze"
                    value={newArmName}
                    onChange={(e) => setNewArmName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleAddArm(selectedClass.hierarchy_class, newArmName);
                        setNewArmName('');
                      }
                    }}
                    className="modern-input"
                  />
                  <button
                    onClick={() => {
                      handleAddArm(selectedClass.hierarchy_class, newArmName);
                      setNewArmName('');
                    }}
                    className="primary-btn"
                    style={{ marginTop: 0 }}
                  >
                    Add
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                  {selectedClass.arms.map(arm => (
                    <div 
                      key={arm} 
                      style={{
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid var(--glass-border)',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '13px'
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{selectedClass.hierarchy_class} {arm}</span>
                      <button 
                        onClick={() => handleRemoveArm(selectedClass.hierarchy_class, arm)}
                        style={{ background: 'none', border: 'none', color: '#EF4444', fontSize: '18px', cursor: 'pointer', padding: 0 }}
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                  {selectedClass.arms.length === 0 && (
                    <span style={{ fontSize: '11px', color: '#475569', fontStyle: 'italic', textAlign: 'center', padding: '12px 0' }}>No arms defined for this class.</span>
                  )}
                </div>

              </div>

            </div>
          </div>
        </>
      )}

      {/* Bottom section: Global settings accordion panel list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '20px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '30px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc', margin: '0 0 10px 0' }}>⚙️ Global School Setup</h3>
        
        {/* Accordion 1: Class Progression Hierarchy */}
        <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', background: 'rgba(30, 41, 59, 0.2)', overflow: 'hidden' }}>
          <div 
            onClick={() => setIsHierarchyOpen(!isHierarchyOpen)}
            style={{ padding: '16px 20px', background: 'rgba(255,255,255,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
          >
            <span style={{ fontWeight: 700, fontSize: '14px' }}>🎓 Class Progression Hierarchy</span>
            <span>{isHierarchyOpen ? '▲' : '▼'}</span>
          </div>
          {isHierarchyOpen && (
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
                Define the absolute progression sequence (e.g. JSS 1 → JSS 2). Reorder levels by dragging or using the control arrows. Auto-promotions during Rollovers follow this order.
              </p>
              
              {/* Add form */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <input 
                  type="text" 
                  placeholder="e.g. SSS 1" 
                  value={newClassInput}
                  onChange={(e) => setNewClassInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddClassToHierarchy();
                  }}
                  className="modern-input"
                  style={{ flex: 1 }}
                />
                <button onClick={handleAddClassToHierarchy} className="primary-btn" style={{ marginTop: 0 }}>
                  Add Class
                </button>
              </div>

              {/* Hierarchy List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {classHierarchy.map((cls, index) => (
                  <div
                    key={cls}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={(e) => handleDrop(e, index)}
                    onDragEnd={handleDragEnd}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 16px',
                      background: dragOverIndex === index ? 'rgba(0, 229, 255, 0.1)' : 'rgba(0, 0, 0, 0.25)',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      borderRadius: '6px',
                      cursor: 'grab',
                      opacity: draggedIndex === index ? 0.4 : 1,
                      transition: 'background 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ color: 'rgba(255,255,255,0.3)', cursor: 'grab' }}>☰</span>
                      <span style={{ fontSize: '11px', color: '#475569', fontWeight: 700 }}>#{index + 1}</span>
                      <span style={{ fontSize: '14px', fontWeight: 600 }}>{cls}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button 
                        disabled={index === 0}
                        onClick={() => handleMoveClass(index, 'up')}
                        style={{ background: 'none', border: 'none', color: index === 0 ? '#475569' : '#00E5FF', fontSize: '16px', cursor: index === 0 ? 'not-allowed' : 'pointer' }}
                      >
                        ▲
                      </button>
                      <button 
                        disabled={index === classHierarchy.length - 1}
                        onClick={() => handleMoveClass(index, 'down')}
                        style={{ background: 'none', border: 'none', color: index === classHierarchy.length - 1 ? '#475569' : '#00E5FF', fontSize: '16px', cursor: index === classHierarchy.length - 1 ? 'not-allowed' : 'pointer' }}
                      >
                        ▼
                      </button>
                      <button 
                        onClick={() => handleRemoveClassFromHierarchy(index)}
                        style={{ background: 'none', border: 'none', color: '#EF4444', fontSize: '18px', cursor: 'pointer', marginLeft: '10px' }}
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button 
                onClick={handleSaveHierarchy} 
                className="primary-btn"
                style={{ alignSelf: 'flex-start', background: '#00E5FF', color: '#000', fontWeight: 700 }}
              >
                Save Hierarchy
              </button>
            </div>
          )}
        </div>

        {/* Accordion 2: Global Pass Mark */}
        <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', background: 'rgba(30, 41, 59, 0.2)', overflow: 'hidden' }}>
          <div 
            onClick={() => setIsGlobalPassMarkOpen(!isGlobalPassMarkOpen)}
            style={{ padding: '16px 20px', background: 'rgba(255,255,255,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
          >
            <span style={{ fontWeight: 700, fontSize: '14px' }}>🎯 Global Pass Mark Threshold</span>
            <span>{isGlobalPassMarkOpen ? '▲' : '▼'}</span>
          </div>
          {isGlobalPassMarkOpen && (
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
                Configure the default baseline pass mark percentage. Can be overridden per class inside the configs above.
              </p>
              
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <input 
                  type="number" 
                  value={globalPassMark}
                  onChange={(e) => setGlobalPassMark(parseInt(e.target.value) || 0)}
                  className="modern-input"
                  style={{ width: '120px' }}
                />
                <span style={{ fontSize: '14px', color: '#94a3b8' }}>% score is needed to pass a subject.</span>
              </div>

              <button 
                onClick={handleSavePassMark} 
                className="primary-btn"
                style={{ alignSelf: 'flex-start', background: '#00E5FF', color: '#000', fontWeight: 700 }}
              >
                Save Global Threshold
              </button>
            </div>
          )}
        </div>

        {/* Accordion 3: Academic Rollover */}
        <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', background: 'rgba(30, 41, 59, 0.2)', overflow: 'hidden' }}>
          <div
            onClick={() => { setIsRolloverOpen(!isRolloverOpen); if (!isRolloverOpen) fetchRolloverPreview(); }}
            style={{ padding: '16px 20px', background: 'rgba(255,255,255,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
          >
            <span style={{ fontWeight: 700, fontSize: '14px' }}>🔄 Academic Rollover & Progression</span>
            <span>{isRolloverOpen ? '▲' : '▼'}</span>
          </div>
          {isRolloverOpen && (() => {
            const rolloverAPI = (window as any).electronAPI?.rollover;
            const Swal = (window as any).Swal;
            const tabStyle = (t: string) => ({
              padding: '8px 16px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', border: 'none',
              background: rolloverTab === t ? 'rgba(0,229,255,0.15)' : 'rgba(255,255,255,0.04)',
              color: rolloverTab === t ? '#00E5FF' : 'rgba(255,255,255,0.5)',
              transition: 'all 0.15s'
            });
            return (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                {/* Tab strip */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button style={tabStyle('session')}  onClick={() => setRolloverTab('session')}>📅 Session / Term</button>
                  <button style={tabStyle('class')}   onClick={() => setRolloverTab('class')}>🏫 Single Class</button>
                  <button style={tabStyle('student')} onClick={() => setRolloverTab('student')}>👤 Students</button>
                  <button style={tabStyle('structure')} onClick={() => setRolloverTab('structure')}>⚙️ Term Structure</button>
                </div>

                {/* ── Tab: Term Structure ── */}
                {rolloverTab === 'structure' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <p style={{ margin: 0, fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
                      Define how many periods your school runs per academic year. Default is 3 terms (Nigerian standard). Change this for semester, quarterly, or custom structures.
                    </p>
                    {/* Issue 4 fix: Current active term selector — same data source as PrintHub */}
                    <div style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.12)', borderRadius: '8px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#00E5FF' }}>📌 Active Term (school-wide)</span>
                      <p style={{ margin: 0, fontSize: '11px', color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>This is the term currently active across the app — PrintHub, Reports, Attendance, Fees. Changing it here updates the global term immediately.</p>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <select
                          value={activeTerm}
                          onChange={e => setActiveTerm(e.target.value)}
                          style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,229,255,0.2)', color: '#fff', borderRadius: '6px', padding: '7px 12px', fontSize: '12px' }}
                        >
                          <option value=''>— Select Term —</option>
                          {termStructure.terms.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <button
                          disabled={!activeTerm}
                          onClick={async () => {
                            if (!activeTerm) return;
                            await (window as any).electronAPI?.cbt?.saveSystemSetting({ key: 'current_term', value: activeTerm });
                            fetchRolloverPreview();
                            (window as any).Swal?.fire({ toast: true, position: 'top-end', icon: 'success', title: `Active term set to ${activeTerm}`, showConfirmButton: false, timer: 2000, background: '#0d1235', color: '#fff' });
                          }}
                          style={{ background: activeTerm ? 'rgba(0,229,255,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${activeTerm ? 'rgba(0,229,255,0.25)' : 'rgba(255,255,255,0.08)'}`, color: activeTerm ? '#00E5FF' : 'rgba(255,255,255,0.3)', borderRadius: '6px', padding: '7px 14px', fontSize: '12px', fontWeight: 600, cursor: activeTerm ? 'pointer' : 'default' }}
                        >Set Active Term</button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>Period label:</label>
                      <select
                        value={termStructure.period_label}
                        onChange={e => setTermStructure(prev => ({ ...prev, period_label: e.target.value }))}
                        style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '6px', padding: '6px 10px', fontSize: '12px' }}
                      >
                        {['term','semester','quarter','period','block'].map(l => <option key={l} value={l}>{l.charAt(0).toUpperCase()+l.slice(1)}</option>)}
                      </select>
                      <span style={{ fontSize: '12px', color: '#00E5FF', fontWeight: 600 }}>
                        School runs <strong>{termStructure.terms.length}</strong> {termStructure.period_label}{termStructure.terms.length !== 1 ? 's' : ''} per academic session
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {termStructure.terms.map((t, i) => (
                        <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', width: '20px' }}>{i + 1}.</span>
                          <input
                            value={t}
                            onChange={e => setTermStructure(prev => { const ts = [...prev.terms]; ts[i] = e.target.value; return { ...prev, terms: ts }; })}
                            style={{ flex: 1, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', borderRadius: '6px', padding: '6px 10px', fontSize: '12px' }}
                          />
                          <button onClick={() => setTermStructure(prev => ({ ...prev, terms: prev.terms.filter((_, j) => j !== i) }))}
                            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444', borderRadius: '4px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer' }}>✕</button>
                        </div>
                      ))}
                      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                        <input value={newTermInput} onChange={e => setNewTermInput(e.target.value)} placeholder={`Add ${termStructure.period_label} name…`}
                          style={{ flex: 1, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', borderRadius: '6px', padding: '6px 10px', fontSize: '12px' }} />
                        <button onClick={() => { if (newTermInput.trim()) { setTermStructure(prev => ({ ...prev, terms: [...prev.terms, newTermInput.trim()] })); setNewTermInput(''); } }}
                          style={{ background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.2)', color: '#00E5FF', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer' }}>+ Add</button>
                      </div>
                    </div>
                    <button
                      disabled={termStructureSaving || termStructure.terms.length === 0}
                      onClick={async () => {
                        setTermStructureSaving(true);
                        try {
                          await (window as any).electronAPI.cbt.saveSystemSetting({ key: 'term_structure', value: JSON.stringify(termStructure) });
                          fetchRolloverPreview();
                          Swal?.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Term structure saved', showConfirmButton: false, timer: 2500, background: '#0d1235', color: '#fff' });
                        } catch (_) {
                          Swal?.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Failed to save', showConfirmButton: false, timer: 2500, background: '#0d1235', color: '#fff' });
                        } finally { setTermStructureSaving(false); }
                      }}
                      style={{ alignSelf: 'flex-start', background: termStructureSaving ? 'rgba(255,255,255,0.05)' : 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.2)', color: '#00E5FF', borderRadius: '6px', padding: '8px 16px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                    >{termStructureSaving ? 'Saving…' : 'Save Term Structure'}</button>
                  </div>
                )}

                {/* ── Tab: Full Session / Term Advance ── */}
                {rolloverTab === 'session' && (() => {
                  const p = rolloverPreview;
                  const periodLabel = p?.periodLabel || termStructure.period_label;
                  const capLabel = periodLabel.charAt(0).toUpperCase() + periodLabel.slice(1);
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {!p && !rolloverPreviewError ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', margin: 0 }}>Loading preview…</p>
                          <button onClick={fetchRolloverPreview} style={{ fontSize: '11px', background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)', borderRadius: '4px', padding: '3px 8px', cursor: 'pointer' }}>Retry</button>
                        </div>
                      ) : rolloverPreviewError ? (
                        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px', padding: '10px 14px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                          <span style={{ fontSize: '12px', color: '#f87171' }}>⚠ {rolloverPreviewError}</span>
                          <button onClick={fetchRolloverPreview} style={{ fontSize: '11px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', borderRadius: '4px', padding: '3px 8px', cursor: 'pointer' }}>Retry</button>
                        </div>
                      ) : p.isLastTerm ? (
                        // MODE B — Session End
                        <div style={{ border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.05)', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          <span style={{ fontSize: '14px', fontWeight: 700, color: '#EF4444' }}>⚠️ Danger Zone — End of Academic Year</span>
                          <p style={{ fontSize: '12px', color: '#fca5a5', margin: 0, lineHeight: 1.7 }}>
                            Active: <strong style={{ color: '#fff' }}>{p.currentSession} · {p.currentTerm}</strong> (Final {capLabel})<br />
                            <strong style={{ color: '#fff' }}>{p.toPromote}</strong> students will be promoted · <strong style={{ color: '#f87171' }}>{p.toGraduate}</strong> will graduate<br />
                            All student academic slates reset for the new session. Prior records are preserved.
                          </p>
                          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>New Session:</label>
                            <select value={rolloverNewSession} onChange={e => setRolloverNewSession(e.target.value)}
                              style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '6px', padding: '7px 12px', fontSize: '12px' }}>
                              <option value=''>— Select —</option>
                              {generateSessionsList().map((s: string) => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                          <button
                            disabled={!rolloverNewSession}
                            onClick={async () => {
                              const c = await Swal?.fire({ title: '<span style="color:#EF4444;font-size:17px;font-weight:700;">⚠️ End Academic Year?</span>', html: `<p style="color:rgba(255,255,255,0.65);font-size:13px;line-height:1.6;">This will promote <strong>${p.toPromote}</strong> students and graduate <strong>${p.toGraduate}</strong>. New session: <strong>${rolloverNewSession}</strong>.<br/>This cannot be undone.</p>`, showCancelButton: true, confirmButtonText: 'Yes, End Session & Rollover', confirmButtonColor: '#EF4444', cancelButtonColor: '#1a1a2e', background: '#0d1235', color: '#fff' });
                              if (!c?.isConfirmed) return;
                              const res = await rolloverAPI?.session({ newSession: rolloverNewSession });
                              if (res?.ok) {
                                setActiveSession(rolloverNewSession);
                                setRolloverNewSession('');
                                fetchRolloverPreview();
                                Swal?.fire({ toast: true, position: 'top-end', icon: 'success', title: `Session rolled over → ${rolloverNewSession}`, showConfirmButton: false, timer: 3500, background: '#0d1235', color: '#fff' });
                              } else {
                                Swal?.fire({ toast: true, position: 'top-end', icon: 'error', title: res?.message || res?.error || 'Rollover failed', showConfirmButton: false, timer: 3500, background: '#0d1235', color: '#fff' });
                              }
                            }}
                            style={{ alignSelf: 'flex-start', background: rolloverNewSession ? '#EF4444' : 'rgba(239,68,68,0.2)', color: '#fff', borderRadius: '6px', padding: '9px 18px', fontSize: '13px', fontWeight: 700, border: 'none', cursor: rolloverNewSession ? 'pointer' : 'default', opacity: rolloverNewSession ? 1 : 0.5 }}
                          >End Session & Rollover →</button>
                        </div>
                      ) : (
                        // MODE A — Term Advance
                        <div style={{ border: '1px solid rgba(0,229,255,0.15)', background: 'rgba(0,229,255,0.04)', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', margin: 0, lineHeight: 1.7 }}>
                            Active: <strong style={{ color: '#fff' }}>{p.currentSession} · {p.currentTerm}</strong><br />
                            Next: <strong style={{ color: '#00E5FF' }}>{p.nextTerm}</strong><br />
                            No student promotion — only term dates reset. Students keep their classes.
                          </p>
                          <button
                            onClick={async () => {
                              const c = await Swal?.fire({ title: `<span style="color:#00E5FF;font-size:17px;font-weight:700;">Advance to ${p.nextTerm}?</span>`, html: `<p style="color:rgba(255,255,255,0.65);font-size:13px;">Term dates will be cleared. Students stay in their current classes.</p>`, showCancelButton: true, confirmButtonText: `Advance to ${p.nextTerm}`, confirmButtonColor: '#00E5FF', cancelButtonColor: '#1a1a2e', background: '#0d1235', color: '#fff' });
                              if (!c?.isConfirmed) return;
                              const res = await rolloverAPI?.session({});
                              if (res?.ok) {
                                fetchRolloverPreview();
                                fetchGlobalSettings();
                                Swal?.fire({ toast: true, position: 'top-end', icon: 'success', title: `Advanced to ${res.newTerm}`, showConfirmButton: false, timer: 2500, background: '#0d1235', color: '#fff' });
                              } else {
                                Swal?.fire({ toast: true, position: 'top-end', icon: 'error', title: res?.error || 'Failed', showConfirmButton: false, timer: 2500, background: '#0d1235', color: '#fff' });
                              }
                            }}
                            style={{ alignSelf: 'flex-start', background: 'rgba(0,229,255,0.12)', border: '1px solid rgba(0,229,255,0.25)', color: '#00E5FF', borderRadius: '6px', padding: '9px 18px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                          >Advance to {p.nextTerm} →</button>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* ── Tab: Single Class ── */}
                {rolloverTab === 'class' && (() => {
                  const uniqueArms = configs.find(c => c.hierarchy_class === classRolloverClass)?.arms || [];
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <p style={{ margin: 0, fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>Promote or graduate all active students in a specific class (and optionally a specific arm) without rolling the entire session.</p>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <select value={classRolloverClass} onChange={e => { setClassRolloverClass(e.target.value); setClassRolloverArm(''); }}
                          style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '6px', padding: '7px 12px', fontSize: '12px' }}>
                          <option value=''>— Select Class —</option>
                          {classHierarchy.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        {classRolloverClass && (
                          <select value={classRolloverArm} onChange={e => setClassRolloverArm(e.target.value)}
                            style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '6px', padding: '7px 12px', fontSize: '12px' }}>
                            <option value=''>All Arms</option>
                            {uniqueArms.map((a: string) => <option key={a} value={a}>{a}</option>)}
                          </select>
                        )}
                      </div>
                      {classRolloverClass && (
                        <p style={{ margin: 0, fontSize: '12px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
                          {classRolloverClass} is {classHierarchy.indexOf(classRolloverClass) >= classHierarchy.length - 1 ? <><strong style={{ color: '#f87171' }}>the final class</strong> — students will be <strong style={{ color: '#f87171' }}>graduated</strong></> : <>followed by <strong style={{ color: '#00E5FF' }}>{classHierarchy[classHierarchy.indexOf(classRolloverClass) + 1]}</strong> in the hierarchy — students will be <strong style={{ color: '#00E5FF' }}>promoted</strong></>}.
                        </p>
                      )}
                      <button
                        disabled={!classRolloverClass}
                        onClick={async () => {
                          const targetLabel = classRolloverArm ? `${classRolloverClass} ${classRolloverArm}` : `all arms of ${classRolloverClass}`;
                          const c = await Swal?.fire({ title: '<span style="color:#fff;font-size:16px;font-weight:700;">Rollover Class?</span>', html: `<p style="color:rgba(255,255,255,0.65);font-size:13px;">All active students in <strong>${targetLabel}</strong> will be promoted or graduated.</p>`, showCancelButton: true, confirmButtonText: 'Rollover Class', confirmButtonColor: '#00E5FF', cancelButtonColor: '#1a1a2e', background: '#0d1235', color: '#fff' });
                          if (!c?.isConfirmed) return;
                          const res = await rolloverAPI?.byClass({ hierarchyClass: classRolloverClass, arm: classRolloverArm || undefined });
                          if (res?.ok) {
                            Swal?.fire({ toast: true, position: 'top-end', icon: 'success', title: `${res.promoted} promoted · ${res.graduated} graduated`, showConfirmButton: false, timer: 3000, background: '#0d1235', color: '#fff' });
                          } else {
                            Swal?.fire({ toast: true, position: 'top-end', icon: 'error', title: res?.error || 'Failed', showConfirmButton: false, timer: 3000, background: '#0d1235', color: '#fff' });
                          }
                        }}
                        style={{ alignSelf: 'flex-start', background: classRolloverClass ? 'rgba(0,229,255,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${classRolloverClass ? 'rgba(0,229,255,0.25)' : 'rgba(255,255,255,0.08)'}`, color: classRolloverClass ? '#00E5FF' : 'rgba(255,255,255,0.3)', borderRadius: '6px', padding: '8px 16px', fontSize: '12px', fontWeight: 600, cursor: classRolloverClass ? 'pointer' : 'default' }}
                      >Rollover {classRolloverClass || 'Class'} →</button>
                    </div>
                  );
                })()}

                {/* ── Tab: Student-Level ── */}
                {rolloverTab === 'student' && (() => {
                  const actionOpts = [
                    { val: 'promote', label: 'Promote' }, { val: 'graduate', label: 'Graduate' },
                    { val: 'repeat', label: 'Repeat (Stay)' }, { val: 'demote', label: 'Demote' },
                    { val: 'move', label: 'Move to…' }, { val: 'switch_arm', label: 'Switch Arm' },
                  ];
                  const needsTarget = ['move','switch_arm'].includes(studentRolloverMode === 'batch' ? batchAction : singleAction);
                  const isMove = (studentRolloverMode === 'batch' ? batchAction : singleAction) === 'move';
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {/* Mode toggle */}
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {(['batch','single'] as const).map(m => (
                          <button key={m} onClick={() => setStudentRolloverMode(m)}
                            style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', border: 'none', background: studentRolloverMode === m ? 'rgba(0,229,255,0.15)' : 'rgba(255,255,255,0.04)', color: studentRolloverMode === m ? '#00E5FF' : 'rgba(255,255,255,0.4)' }}>
                            {m === 'batch' ? '☑ Filtered Batch' : '👤 Single Student'}
                          </button>
                        ))}
                      </div>

                      {/* Batch sub-mode */}
                      {studentRolloverMode === 'batch' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>Class:</label>
                            <select value={batchFilterClass} onChange={e => { setBatchFilterClass(e.target.value); setBatchFilterArm(''); }}
                              style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '6px', padding: '6px 10px', fontSize: '12px' }}>
                              <option value=''>— Select Class —</option>
                              {classHierarchy.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            {batchFilterClass && (() => {
                              const arms = configs.find(c => c.hierarchy_class === batchFilterClass)?.arms || [];
                              return arms.length > 0 ? (
                                <>
                                  <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>Arm:</label>
                                  <select value={batchFilterArm} onChange={e => setBatchFilterArm(e.target.value)}
                                    style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '6px', padding: '6px 10px', fontSize: '12px' }}>
                                    <option value=''>All Arms</option>
                                    {arms.map((a: string) => <option key={a} value={a}>{a}</option>)}
                                  </select>
                                </>
                              ) : null;
                            })()}
                          </div>
                          {batchStudents.length > 0 && (
                            <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px' }}>
                              <div style={{ padding: '6px 10px', background: 'rgba(255,255,255,0.03)', display: 'flex', gap: '8px', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                <input type='checkbox' checked={batchSelected.size === batchStudents.length && batchStudents.length > 0}
                                  onChange={e => setBatchSelected(e.target.checked ? new Set(batchStudents.map((s: any) => s.id)) : new Set())}
                                  style={{ cursor: 'pointer' }} />
                                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>Select all ({batchStudents.length})</span>
                              </div>
                              {batchStudents.map((s: any) => (
                                <div key={s.id} style={{ padding: '8px 10px', display: 'flex', gap: '10px', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.04)', background: batchSelected.has(s.id) ? 'rgba(0,229,255,0.04)' : 'transparent' }}>
                                  <input type='checkbox' checked={batchSelected.has(s.id)}
                                    onChange={e => setBatchSelected(prev => { const n = new Set(prev); e.target.checked ? n.add(s.id) : n.delete(s.id); return n; })}
                                    style={{ cursor: 'pointer' }} />
                                  <span style={{ fontSize: '12px', color: '#e2e8f0', flex: 1 }}>{s.name || s.student_name}</span>
                                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>{s.class_arm || ''}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {batchStudents.length === 0 && batchFilterClass && (
                            <p style={{ margin: 0, fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>No active students found in {batchFilterClass}.</p>
                          )}
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {actionOpts.map(opt => (
                              <button key={opt.val} onClick={() => setBatchAction(opt.val)}
                                style={{ padding: '5px 10px', borderRadius: '5px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', border: 'none', background: batchAction === opt.val ? 'rgba(0,229,255,0.15)' : 'rgba(255,255,255,0.05)', color: batchAction === opt.val ? '#00E5FF' : 'rgba(255,255,255,0.5)' }}>
                                {opt.label}
                              </button>
                            ))}
                          </div>
                          {needsTarget && (
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                              {isMove && <select value={batchTargetClass} onChange={e => setBatchTargetClass(e.target.value)}
                                style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '6px', padding: '6px 10px', fontSize: '12px' }}>
                                <option value=''>— Target Class —</option>
                                {classHierarchy.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>}
                              <select value={batchTargetArm} onChange={e => setBatchTargetArm(e.target.value)}
                                style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '6px', padding: '6px 10px', fontSize: '12px' }}>
                                <option value=''>— Target Arm —</option>
                                {(configs.find(c => c.hierarchy_class === (isMove ? batchTargetClass : batchFilterClass))?.arms || []).map((a: string) => <option key={a} value={a}>{a}</option>)}
                              </select>
                            </div>
                          )}
                          <button
                            disabled={batchSelected.size === 0}
                            onClick={async () => {
                              const c = await Swal?.fire({ title: '<span style="color:#fff;font-size:16px;font-weight:700;">Apply Rollover Action?</span>', html: `<p style="color:rgba(255,255,255,0.65);font-size:13px;">Action: <strong>${batchAction}</strong> on <strong>${batchSelected.size}</strong> students. This cannot be undone.</p>`, showCancelButton: true, confirmButtonText: 'Apply', confirmButtonColor: '#00E5FF', cancelButtonColor: '#1a1a2e', background: '#0d1235', color: '#fff' });
                              if (!c?.isConfirmed) return;
                              const res = await rolloverAPI?.students({ studentIds: [...batchSelected], action: batchAction, targetClass: batchTargetClass || undefined, targetArm: batchTargetArm || undefined });
                              if (res?.ok) {
                                setBatchSelected(new Set()); setBatchFilterClass('');
                                Swal?.fire({ toast: true, position: 'top-end', icon: 'success', title: `${res.processed} students updated`, showConfirmButton: false, timer: 2500, background: '#0d1235', color: '#fff' });
                              } else {
                                Swal?.fire({ toast: true, position: 'top-end', icon: 'error', title: res?.error || 'Failed', showConfirmButton: false, timer: 2500, background: '#0d1235', color: '#fff' });
                              }
                            }}
                            style={{ alignSelf: 'flex-start', background: batchSelected.size > 0 ? 'rgba(0,229,255,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${batchSelected.size > 0 ? 'rgba(0,229,255,0.25)' : 'rgba(255,255,255,0.06)'}`, color: batchSelected.size > 0 ? '#00E5FF' : 'rgba(255,255,255,0.3)', borderRadius: '6px', padding: '8px 16px', fontSize: '12px', fontWeight: 600, cursor: batchSelected.size > 0 ? 'pointer' : 'default' }}
                          >Apply to {batchSelected.size} Selected →</button>
                        </div>
                      )}

                      {/* Single student sub-mode */}
                      {studentRolloverMode === 'single' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {/* Search sits OUTSIDE the scroll container so the dropdown isn't clipped */}
                          <div style={{ position: 'relative' }}>
                            <input
                              value={singleSearch}
                              onChange={e => { setSingleSearch(e.target.value); setSingleStudent(null); }}
                              placeholder='Search student by name…'
                              style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '6px', padding: '8px 12px', fontSize: '12px', boxSizing: 'border-box' }}
                            />
                            {singleResults.length > 0 && !singleStudent && (
                              <div style={{ marginTop: '8px', background: 'rgba(13, 18, 53, 0.95)', border: '1px solid rgba(0,229,255,0.25)', borderRadius: '8px', padding: '10px', maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
                                <div style={{ fontSize: '11px', color: '#00E5FF', fontWeight: 700, padding: '2px 6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                  Select Student ({singleResults.length} found):
                                </div>
                                {singleResults.map((s: any) => (
                                  <div
                                    key={s.id}
                                    onClick={() => { setSingleStudent(s); setSingleSearch(s.name || s.student_name); setSingleResults([]); }}
                                    style={{
                                      padding: '10px 14px',
                                      cursor: 'pointer',
                                      fontSize: '13px',
                                      color: '#fff',
                                      background: 'rgba(255,255,255,0.04)',
                                      borderRadius: '6px',
                                      border: '1px solid rgba(255,255,255,0.08)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      transition: 'all 0.15s ease'
                                    }}
                                    onMouseEnter={e => {
                                      e.currentTarget.style.background = 'rgba(0,229,255,0.12)';
                                      e.currentTarget.style.borderColor = 'rgba(0,229,255,0.3)';
                                    }}
                                    onMouseLeave={e => {
                                      e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                                    }}
                                  >
                                    <div>
                                      <strong style={{ fontSize: '13px', color: '#fff' }}>{s.name || s.student_name}</strong>
                                      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>
                                        {s.class_name || s.class} {s.class_arm || ''}
                                      </div>
                                    </div>
                                    <span style={{
                                      fontSize: '11px',
                                      padding: '3px 8px',
                                      borderRadius: '4px',
                                      fontWeight: 600,
                                      background: s.enrollment_status === 'active' ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)',
                                      color: s.enrollment_status === 'active' ? '#4ade80' : '#f87171',
                                      border: `1px solid ${s.enrollment_status === 'active' ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}`
                                    }}>
                                      {s.enrollment_status || 'active'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Scrollable action section below */}
                          {singleStudent && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '340px', overflowY: 'auto', paddingRight: '4px' }}>
                              <div style={{ background: 'rgba(0,229,255,0.05)', border: '1px solid rgba(0,229,255,0.12)', borderRadius: '6px', padding: '10px 14px', fontSize: '12px', color: '#94a3b8' }}>
                                <strong style={{ color: '#fff' }}>{singleStudent.name || singleStudent.student_name}</strong> · {singleStudent.class_name || singleStudent.class} {singleStudent.class_arm} · <span style={{ color: '#4ade80' }}>{singleStudent.enrollment_status}</span>
                              </div>
                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                {actionOpts.map(opt => (
                                  <button key={opt.val} onClick={() => setSingleAction(opt.val)}
                                    style={{ padding: '5px 10px', borderRadius: '5px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', border: 'none', background: singleAction === opt.val ? 'rgba(0,229,255,0.15)' : 'rgba(255,255,255,0.05)', color: singleAction === opt.val ? '#00E5FF' : 'rgba(255,255,255,0.5)' }}>
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                              {(['move','switch_arm'].includes(singleAction)) && (
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                  {singleAction === 'move' && (
                                    <select value={singleTargetClass} onChange={e => setSingleTargetClass(e.target.value)}
                                      style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '6px', padding: '6px 10px', fontSize: '12px' }}>
                                      <option value=''>— Target Class —</option>
                                      {classHierarchy.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                  )}
                                  <select value={singleTargetArm} onChange={e => setSingleTargetArm(e.target.value)}
                                    style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '6px', padding: '6px 10px', fontSize: '12px' }}>
                                    <option value=''>— Target Arm —</option>
                                    {(configs.find(c => c.hierarchy_class === (singleAction === 'move' ? singleTargetClass : (singleStudent.class_name || singleStudent.class)))?.arms || []).map((a: string) => <option key={a} value={a}>{a}</option>)}
                                  </select>
                                </div>
                              )}
                              <input value={singleNote} onChange={e => setSingleNote(e.target.value)} placeholder='Admin note (optional)…'
                                style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', borderRadius: '6px', padding: '7px 12px', fontSize: '12px' }} />
                              <button
                                onClick={async () => {
                                  const c = await Swal?.fire({ title: `<span style="color:#fff;font-size:16px;font-weight:700;">Apply: ${singleAction}?</span>`, html: `<p style="color:rgba(255,255,255,0.65);font-size:13px;">Student: <strong>${singleStudent.name || singleStudent.student_name}</strong><br/>Action: <strong>${singleAction}</strong>${singleNote ? `<br/>Note: ${singleNote}` : ''}</p>`, showCancelButton: true, confirmButtonText: 'Apply', confirmButtonColor: '#00E5FF', cancelButtonColor: '#1a1a2e', background: '#0d1235', color: '#fff' });
                                  if (!c?.isConfirmed) return;
                                  const res = await rolloverAPI?.student({ studentId: singleStudent.id, action: singleAction, targetClass: singleTargetClass || undefined, targetArm: singleTargetArm || undefined, note: singleNote || undefined });
                                  if (res?.ok) {
                                    setSingleStudent(null); setSingleSearch(''); setSingleNote(''); setSingleAction('promote');
                                    Swal?.fire({ toast: true, position: 'top-end', icon: 'success', title: `${res.student?.name} → ${res.student?.newClass} ${res.student?.newArm}`, showConfirmButton: false, timer: 3000, background: '#0d1235', color: '#fff' });
                                  } else {
                                    Swal?.fire({ toast: true, position: 'top-end', icon: 'error', title: res?.error || 'Failed', showConfirmButton: false, timer: 2500, background: '#0d1235', color: '#fff' });
                                  }
                                }}
                                style={{ alignSelf: 'flex-start', background: 'rgba(0,229,255,0.12)', border: '1px solid rgba(0,229,255,0.25)', color: '#00E5FF', borderRadius: '6px', padding: '8px 16px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                              >Apply Action →</button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

              </div>
            );
          })()}
        </div>

      </div>

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

    </div>
  );
}
