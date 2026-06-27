import React, { useState, useEffect } from 'react';
import { useClassArms, ClassConfig } from '../hooks/useClassArms';
import { generateSessionsList } from '../lib/sessions';

export default function Classes() {
  const { configs, refresh } = useClassArms();
  
  // Slide-in drawer state
  const [selectedClass, setSelectedClass] = useState<ClassConfig | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [newArmName, setNewArmName] = useState('');

  // Manual Class Creation Form states
  const [createClassName, setCreateClassName] = useState('');
  const [createMaxSubjects, setCreateMaxSubjects] = useState('10');
  const [createPassMark, setCreatePassMark] = useState('');
  const [createArms, setCreateArms] = useState('');

  // CSV Import state
  const [csvStatus, setCsvStatus] = useState<string | null>(null);

  // Handle Classes CSV Loaded notification
  useEffect(() => {
    if ((window as any).electronAPI?.onClassesCSVLoaded) {
      (window as any).electronAPI.onClassesCSVLoaded((res: { count: number, error: string | null }) => {
        const Swal = (window as any).Swal;
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

  const handleClassesCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvStatus('⏳ Ingesting and verifying Classes CSV data...');
    if ((window as any).electronAPI?.processClassesCSV) {
      (window as any).electronAPI.processClassesCSV(file.path);
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

  // Load global system settings
  const fetchGlobalSettings = async () => {
    if (!(window as any).electronAPI?.cbt?.getSystemSettings) return;
    try {
      const res = await (window as any).electronAPI.cbt.getSystemSettings();
      if (res) {
        setClassHierarchy(Array.isArray(res.class_hierarchy) ? res.class_hierarchy : []);
        setGlobalPassMark(parseInt(res.pass_mark_threshold) || 50);
        setActiveSession(res.current_academic_session || '2025/2026');
      }
    } catch (err) {
      console.error('Error fetching global settings:', err);
    }
  };

  useEffect(() => {
    fetchGlobalSettings();
  }, []);

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
      await api.classes.saveConfig({ hierarchyClass, maxSubjects, passMarkOverride });
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
            onClick={() => setIsRolloverOpen(!isRolloverOpen)}
            style={{ padding: '16px 20px', background: 'rgba(255,255,255,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
          >
            <span style={{ fontWeight: 700, fontSize: '14px' }}>🔄 Academic Session Rollover</span>
            <span>{isRolloverOpen ? '▲' : '▼'}</span>
          </div>
          {isRolloverOpen && (
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ border: '1px solid rgba(239, 68, 68, 0.2)', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#EF4444' }}>Danger Zone: Academic Rollover</span>
                <p style={{ fontSize: '12px', color: '#fca5a5', margin: 0, lineHeight: 1.6 }}>
                  Active Academic Session: <strong style={{ color: '#fff', fontSize: '13px' }}>{activeSession}</strong>.
                  <br />
                  Ending a session will rollover student grades, apply auto-promotions based on class hierarchy rules, archive the current session, and setup a fresh ledger.
                </p>
                
                <button 
                  onClick={handleRollover} 
                  className="primary-btn"
                  style={{ alignSelf: 'flex-start', background: '#EF4444', color: '#fff', fontWeight: 700, border: 'none', marginTop: '10px' }}
                >
                  End Session & Rollover →
                </button>
              </div>
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
