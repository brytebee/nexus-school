import React, { useState, useEffect } from 'react';
import { DataTable, Column } from '../components/DataTable';
import { CurriculumPresets } from '../lib/curriculum';
import { useSudoAuth } from '../context/SudoAuthContext';

interface Student {
  id: string;
  name: string;
  class_name: string;
  reg_no?: string;
  gender?: string;
  dob?: string;
  parent_email?: string;
  parent_phone?: string;
  parent_name?: string;
  fee_status?: string;
  subjects?: string[];
  photo?: string;
}

export function Students() {
  const { requireSudo } = useSudoAuth();
  // State
  const [students, setStudents] = useState<Student[]>([]);
  const [totalStudents, setTotalStudents] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [searchVal, setSearchVal] = useState('');
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(10);

  // Add/Edit Drawer State
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editStudentId, setEditStudentId] = useState<string | null>(null);

  // Form Fields State
  const [name, setName] = useState('');
  const [className, setClassName] = useState('');
  const [regNo, setRegNo] = useState('');
  const [gender, setGender] = useState('');
  const [dob, setDob] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [parentName, setParentName] = useState('');
  const [feeStatus, setFeeStatus] = useState('cleared');
  const [stagedSubjects, setStagedSubjects] = useState<string[]>([]);
  const [photo, setPhoto] = useState<string | null>(null);

  // Subject Picker State
  const [activePresetTab, setActivePresetTab] = useState<'pri_lower' | 'pri_upper' | 'jss' | 'sss'>('jss');
  const [customSubjects, setCustomSubjects] = useState<string[]>([]);
  const [customSubjectInput, setCustomSubjectInput] = useState('');
  const [formLog, setFormLog] = useState<{ text: string; isError: boolean } | null>(null);

  // Settings Panel State
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [mobileRegLocked, setMobileRegLocked] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);

  // Autocomplete for Class
  const [classSuggestions, setClassSuggestions] = useState<string[]>([]);
  const [csvStatus, setCsvStatus] = useState<string | null>(null);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024) {
        setFormLog({ text: '⚠ Image size exceeds 1MB limit. Please upload a smaller photo.', isError: true });
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        setPhoto(base64String);
      };
      reader.readAsDataURL(file);
    }
  };

  // Detail (View) Modal State
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [detailStudent, setDetailStudent] = useState<Student | null>(null);

  // Fetch student records
  const fetchStudents = async () => {
    if (!window.electronAPI?.getAllStudents) return;
    setLoading(true);
    try {
      const res = await window.electronAPI.getAllStudents({
        limit,
        offset: page * limit,
        search,
      });
      if (res && res.ok) {
        setStudents(res.data || []);
        setTotalStudents(res.total || 0);
      }
    } catch (err) {
      console.error('Error fetching students:', err);
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

  useEffect(() => {
    fetchStudents();
  }, [page, search, limit]);

  // Load class list on mount for suggestions
  useEffect(() => {
    const loadSuggestions = async () => {
      if (!window.electronAPI?.getClasses) return;
      try {
        const classList = await window.electronAPI.getClasses();
        if (Array.isArray(classList)) {
          setClassSuggestions(classList);
        }
      } catch (err) {
        console.error('Error fetching class list for suggestions:', err);
      }
    };
    loadSuggestions();
  }, []);

  // Load student directory settings on mount
  useEffect(() => {
    const loadStudentSettings = async () => {
      try {
        const res = await window.electronAPI?.students?.getSettings();
        if (res?.ok) setMobileRegLocked(res.mobile_registration_locked ?? false);
      } catch (err) {
        console.error('Error loading student settings:', err);
      }
    };
    loadStudentSettings();
  }, []);

  // Handle CSV Loaded notification
  useEffect(() => {
    if (window.electronAPI?.onCSVLoaded) {
      window.electronAPI.onCSVLoaded((count) => {
        setCsvStatus(`✅ CSV Processed: ${count} Students Loaded`);
        fetchStudents();
        setTimeout(() => setCsvStatus(null), 4000);
      });
    }
  }, []);

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvStatus('⏳ Ingesting and verifying student CSV data...');
    if (window.electronAPI?.processCSV) {
      window.electronAPI.processCSV(file.path);
    }
  };

  // Open View Detail Modal
  const openDetailModal = (student: Student) => {
    setDetailStudent(student);
    setIsDetailModalOpen(true);
  };

  // Open drawer for Add Student
  const openAddDrawer = () => {
    setEditStudentId(null);
    setName('');
    setClassName('');
    setRegNo('');
    setGender('');
    setDob('');
    setParentEmail('');
    setParentPhone('');
    setParentName('');
    setFeeStatus('cleared');
    setStagedSubjects([]);
    setCustomSubjects([]);
    setCustomSubjectInput('');
    setPhoto(null);
    setFormLog(null);
    setIsDrawerOpen(true);
  };

  // Open drawer for Edit Student
  const openEditDrawer = (student: Student) => {
    setEditStudentId(student.id);
    setName(student.name || '');
    setClassName(student.class_name || '');
    setRegNo(student.reg_no || '');
    setGender(student.gender || '');
    setDob(student.dob || '');
    setParentEmail(student.parent_email || '');
    setParentPhone(student.parent_phone || '');
    setParentName(student.parent_name || '');
    setFeeStatus(student.fee_status || 'cleared');
    setPhoto(student.photo || null);

    // Pre-populate subjects
    const currentSubjects = student.subjects || [];
    setStagedSubjects(currentSubjects);

    // Identify custom subjects that aren't in canonical preset definitions
    const presetsFlat = Object.values(CurriculumPresets)
      .flat()
      .flatMap(g => g.subjects || []);
    
    const customs = currentSubjects.filter(sub => !presetsFlat.includes(sub));
    setCustomSubjects(customs);
    
    setCustomSubjectInput('');
    setFormLog(null);
    setIsDrawerOpen(true);
  };

  // Toggle subject checks
  const toggleSubjectChecked = (subj: string) => {
    setStagedSubjects(prev =>
      prev.includes(subj) ? prev.filter(s => s !== subj) : [...prev, subj]
    );
  };

  // Add custom subject
  const handleAddCustomSubject = () => {
    const val = customSubjectInput.trim();
    if (!val) return;
    if (!customSubjects.includes(val)) {
      setCustomSubjects(prev => [...prev, val]);
      setStagedSubjects(prev => [...prev, val]);
    }
    setCustomSubjectInput('');
  };

  // Save student data
  const handleSaveStudent = async () => {
    if (!name.trim() || !className.trim()) {
      setFormLog({ text: '⚠ Name and Class are required.', isError: true });
      return;
    }
    if (!stagedSubjects.length) {
      setFormLog({ text: '⚠ Please select at least one enrolled subject.', isError: true });
      return;
    }

    setFormLog({ text: 'Saving record...', isError: false });

    try {
      const payload = {
        id: editStudentId || '',
        name,
        class_name: className,
        reg_no: regNo,
        gender,
        dob,
        parent_email: parentEmail,
        parent_phone: parentPhone,
        parent_name: parentName,
        fee_status: feeStatus,
        subjects: stagedSubjects,
        photo,
      };

      if (editStudentId) {
        // Edit Mode
        const res = await window.electronAPI.updateStudent(payload);
        if (res.ok) {
          setFormLog({ text: '✅ Student details updated!', isError: false });
          setTimeout(() => {
            setIsDrawerOpen(false);
            fetchStudents();
          }, 1000);
        } else {
          setFormLog({ text: `❌ ${res.error}`, isError: true });
        }
      } else {
        // Create Mode
        const id = 'STU-' + crypto.randomUUID().split('-')[0].toUpperCase();
        const res = await window.electronAPI.addStudentForm({
          ...payload,
          id,
        });

        if (res.ok) {
          setFormLog({ text: `✅ Student registered! (${id})`, isError: false });
          setTimeout(() => {
            setIsDrawerOpen(false);
            fetchStudents();
          }, 1000);
        } else {
          setFormLog({ text: `❌ ${res.error}`, isError: true });
        }
      }
    } catch (err: any) {
      setFormLog({ text: `❌ Save failed: ${err.message}`, isError: true });
    }
  };

  // Delete student
  const handleDeleteStudent = (student: Student) => {
    requireSudo(
      async () => {
        if (!window.electronAPI?.deleteStudent) return;
        try {
          const res = await window.electronAPI.deleteStudent({ id: student.id });
          if (res.ok) fetchStudents();
          else alert(`Error: ${res.error}`);
        } catch (err: any) {
          alert(`Error removing student: ${err.message}`);
        }
      },
      'Delete Student Profile',
      `You are about to permanently remove ${student.name}'s profile and all associated data. This cannot be undone.`
    );
  };

  // Table columns
  const columns: Column<Student>[] = [
    {
      header: 'INDEX',
      cell: (_, idx) => <span style={{ fontSize: '12px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{page * limit + (idx ?? 0) + 1}</span>,
      width: '60px',
    },
    {
      header: 'STUDENT ID',
      accessorKey: 'id',
      cell: (s) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-dim)' }}>{s.id}</span>,
      width: '120px',
    },
    {
      header: 'STUDENT NAME',
      accessorKey: 'name',
      cell: (s) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {s.photo ? (
            <img
              src={`data:image/jpeg;base64,${s.photo}`}
              alt={s.name}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                objectFit: 'cover',
                border: '1px solid var(--glass-border)',
                flexShrink: 0
              }}
            />
          ) : (
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid var(--glass-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              color: 'var(--text-dim)',
              fontWeight: 'bold',
              flexShrink: 0
            }}>
              {s.name ? s.name.charAt(0).toUpperCase() : '?'}
            </div>
          )}
          <span style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '13px' }}>{s.name}</span>
        </div>
      ),
    },
    {
      header: 'ENROLLED CLASS & SUBJECTS',
      cell: (s) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '4px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              display: 'inline-block',
              background: 'rgba(0, 229, 255, 0.1)',
              color: 'var(--accent)',
              border: '1px solid rgba(0, 229, 255, 0.2)',
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '11px',
              fontWeight: 700
            }}>
              {s.class_name}
            </span>
            {s.reg_no && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-dim)' }}>
                Reg: {s.reg_no}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxWidth: '400px' }}>
            {s.subjects?.map(subj => (
              <span
                key={subj}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '2px 6px',
                  fontSize: '9px',
                  color: 'var(--text-main)'
                }}
              >
                {subj}
              </span>
            ))}
            {!s.subjects?.length && (
              <span style={{ color: 'var(--text-dim)', fontSize: '11px', fontStyle: 'italic' }}>No enrolled subjects</span>
            )}
          </div>
        </div>
      ),
    },
    {
      header: 'ACTIONS',
      align: 'right',
      cell: (s) => (
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
          <button
            onClick={() => openDetailModal(s)}
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
            onClick={() => openEditDrawer(s)}
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
            onClick={() => handleDeleteStudent(s)}
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

  return (
    <div className="fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--grid-gap)' }}>
      {/* Header Bar */}
      <div className="view-header">
        <div>
          <h2 className="view-title">🎓 Student Directory</h2>
          <p className="view-sub">
            Enrol new students, configure parent contacts, and track subject enrollments.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {/* CSV Import */}
          <label
            htmlFor="student-csv-upload-input"
            className="secondary-btn"
            style={{ cursor: 'pointer' }}
          >
            ⚡ Import CSV
          </label>
          <input
            type="file"
            id="student-csv-upload-input"
            accept=".csv"
            onChange={handleCSVUpload}
            style={{ display: 'none' }}
          />

          <button
            onClick={openAddDrawer}
            className="primary-btn"
          >
            + Add Student
          </button>

          {/* Settings Button */}
          <button
            id="btn-students-settings-toggle"
            onClick={() => setIsSettingsPanelOpen(true)}
            title="Student Directory Settings"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--glass-border)',
              color: 'var(--text-dim)',
              padding: '8px 10px',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              fontSize: '16px',
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
              transition: 'background 0.2s, color 0.2s',
            }}
            onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#fff'; }}
            onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'var(--text-dim)'; }}
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* Mobile Registration Lock Banner */}
      {mobileRegLocked && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.3)',
          padding: '10px 16px',
          borderRadius: 'var(--radius-sm)',
          fontSize: '12px',
          color: '#fca5a5',
        }}>
          <span style={{ fontSize: '16px' }}>🔒</span>
          <span><strong>Mobile student registration is disabled.</strong> Mobile devices cannot add new students while this lock is active. Existing sync and grade updates are unaffected.</span>
          <button
            onClick={() => setIsSettingsPanelOpen(true)}
            style={{ marginLeft: 'auto', background: 'none', border: '1px solid rgba(239,68,68,0.4)', color: '#fca5a5', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', whiteSpace: 'nowrap' }}
          >
            Manage →
          </button>
        </div>
      )}

      {csvStatus && (
        <div style={{
          background: 'rgba(0, 229, 255, 0.1)',
          border: '1px solid rgba(0, 229, 255, 0.25)',
          padding: '10px 16px',
          borderRadius: 'var(--radius-sm)',
          fontSize: '12px',
          color: 'var(--accent)',
        }}>
          {csvStatus}
        </div>
      )}

      {/* Real-time search bar */}
      <div style={{ width: '100%', display: 'flex', position: 'relative', alignItems: 'center' }}>
        <span style={{ position: 'absolute', left: '16px', color: 'var(--text-dim)', fontSize: '14px', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
          🔍
        </span>
        <input
          type="text"
          value={searchVal}
          onChange={(e) => {
            setSearchVal(e.target.value);
          }}
          placeholder="Search students by name, Student ID, or registration number..."
          className="modern-input"
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

      {/* Data Table */}
      <DataTable
        data={students}
        columns={columns}
        isLoading={loading}
        emptyMessage={
          search
            ? 'No matching students found in the roster.'
            : 'No students loaded. Import a CSV or add manually to populate the directory.'
        }
      />

      {/* Pagination */}
      {totalStudents > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0, 0, 0, 0.15)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: '12px 20px', flexShrink: 0, gap: '16px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-dim)', fontWeight: 500 }}>
            Showing {page * limit + 1} to {Math.min((page + 1) * limit, totalStudents)} of {totalStudents} students
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
              const totalPages = Math.ceil(totalStudents / limit);
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
                const totalPages = Math.ceil(totalStudents / limit);
                setPage(p => Math.min(totalPages - 1, p + 1));
              }}
              disabled={page === Math.ceil(totalStudents / limit) - 1}
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

      {/* Form Drawer Overlay */}
      {isDrawerOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', justifyContent: 'flex-end', background: 'rgba(0, 0, 0, 0.55)', backdropFilter: 'blur(8px)', userSelect: 'none' }}>
          {/* Backdrop click close */}
          <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setIsDrawerOpen(false)} />

          <div style={{ width: '500px', height: '100vh', background: 'var(--bg-dark)', borderLeft: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)' }}>
            {/* Drawer Header */}
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0, 0, 0, 0.15)', flexShrink: 0 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--text-main)' }}>
                  {editStudentId ? 'Edit Student Registry' : 'Enrol New Student'}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--text-dim)' }}>
                  Configure student metadata, WhatsApp parent details, and subjects.
                </p>
              </div>
              <button
                onClick={() => setIsDrawerOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center' }}
              >
                ✕
              </button>
            </div>

            {/* Drawer Scrollable Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {formLog && (
                <div
                  style={{
                    padding: '10px 16px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '12px',
                    border: '1px solid',
                    background: formLog.isError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(0, 230, 118, 0.1)',
                    borderColor: formLog.isError ? 'rgba(239, 68, 68, 0.25)' : 'rgba(0, 230, 118, 0.25)',
                    color: formLog.isError ? 'var(--danger)' : 'var(--accent-green)'
                  }}
                >
                  {formLog.text}
                </div>
              )}

              {/* Core Details Form Section */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Profile Photo Uploader */}
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center', background: 'rgba(255, 255, 255, 0.02)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)' }}>
                  {photo ? (
                    <img
                      src={`data:image/jpeg;base64,${photo}`}
                      alt="Student Preview"
                      style={{
                        width: '64px',
                        height: '64px',
                        borderRadius: '50%',
                        objectFit: 'cover',
                        border: '2px solid var(--accent)'
                      }}
                    />
                  ) : (
                    <div style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '50%',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      border: '2px dashed var(--glass-border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      color: 'var(--text-dim)',
                      fontWeight: 600,
                      textAlign: 'center',
                      lineHeight: 1.2
                    }}>
                      No Photo
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 500 }}>
                      Passport Photo (JPG/PNG, max 1MB)
                    </span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <label
                        htmlFor="student-photo-upload"
                        className="secondary-btn"
                        style={{ cursor: 'pointer', padding: '6px 12px', fontSize: '11px', borderRadius: 'var(--radius-sm)' }}
                      >
                        Upload Photo
                      </label>
                      <input
                        type="file"
                        id="student-photo-upload"
                        accept="image/*"
                        onChange={handlePhotoChange}
                        style={{ display: 'none' }}
                      />
                      {photo && (
                        <button
                          type="button"
                          onClick={() => setPhoto(null)}
                          className="secondary-btn"
                          style={{ padding: '6px 12px', fontSize: '11px', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.25)' }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block' }}>
                    Full Name *
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Jane Smith"
                    id="stu-add-name"
                    className="modern-input"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block' }}>
                      Class Room Designation *
                    </label>
                    <input
                      type="text"
                      value={className}
                      onChange={(e) => setClassName(e.target.value)}
                      placeholder="e.g. JSS 1"
                      list="class-suggestions-list"
                      id="stu-add-class"
                      className="modern-input"
                    />
                    <datalist id="class-suggestions-list">
                      {classSuggestions.map(cls => (
                        <option key={cls} value={cls} />
                      ))}
                    </datalist>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block' }}>
                      Registration Number
                    </label>
                    <input
                      type="text"
                      value={regNo}
                      onChange={(e) => setRegNo(e.target.value)}
                      placeholder="e.g. REG-4920"
                      id="stu-add-regno"
                      className="modern-input"
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block' }}>
                      Gender
                    </label>
                    <select
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
                      id="stu-add-gender"
                      className="modern-input"
                    >
                      <option value="">Select Gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block' }}>
                      Date of Birth
                    </label>
                    <input
                      type="date"
                      value={dob}
                      onChange={(e) => setDob(e.target.value)}
                      id="stu-add-dob"
                      className="modern-input"
                    />
                  </div>
                </div>
              </div>

              {/* Parent & Financial Details Section */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderTop: '1px solid var(--glass-border)', paddingTop: '20px' }}>
                <h4 style={{ margin: '0 0 4px', fontSize: '11px', color: 'var(--accent)', letterSpacing: '1.5px', textTransform: 'uppercase', paddingBottom: '8px', borderBottom: '1px solid var(--glass-border)' }}>
                  Parent / Guardian & Billing Details
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block' }}>
                      Parent Name
                    </label>
                    <input
                      type="text"
                      value={parentName}
                      onChange={(e) => setParentName(e.target.value)}
                      placeholder="e.g. Mr. Smith"
                      id="stu-add-pname"
                      className="modern-input"
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block' }}>
                      WhatsApp Phone *
                    </label>
                    <input
                      type="text"
                      value={parentPhone}
                      onChange={(e) => setParentPhone(e.target.value)}
                      placeholder="e.g. 2348012345678"
                      id="stu-add-pphone"
                      className="modern-input"
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block' }}>
                      Parent Email
                    </label>
                    <input
                      type="email"
                      value={parentEmail}
                      onChange={(e) => setParentEmail(e.target.value)}
                      placeholder="e.g. parent@gmail.com"
                      id="stu-add-pemail"
                      className="modern-input"
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block' }}>
                      Initial Fee Status
                    </label>
                    <select
                      value={feeStatus}
                      onChange={(e) => setFeeStatus(e.target.value)}
                      id="stu-add-fee"
                      className="modern-input"
                    >
                      <option value="cleared">Cleared</option>
                      <option value="owing">Owing</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Subject Allocations Pickers */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderTop: '1px solid var(--glass-border)', paddingTop: '20px' }}>
                <h4 style={{ margin: '0 0 4px', fontSize: '11px', color: 'var(--accent)', letterSpacing: '1.5px', textTransform: 'uppercase', paddingBottom: '8px', borderBottom: '1px solid var(--glass-border)' }}>
                  Select Enrolled Subjects
                </h4>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* Preset Tab Headers */}
                  <div style={{ display: 'flex', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-sm)', background: 'rgba(0, 0, 0, 0.25)', overflow: 'hidden', textAlign: 'center' }}>
                    {(['pri_lower', 'pri_upper', 'jss', 'sss'] as const).map(tab => {
                      const isActive = activePresetTab === tab;
                      return (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => setActivePresetTab(tab)}
                          style={{
                            flex: 1,
                            padding: '8px 4px',
                            fontSize: '11px',
                            fontWeight: isActive ? 600 : 400,
                            background: isActive ? 'rgba(0, 229, 255, 0.08)' : 'transparent',
                            border: 'none',
                            color: isActive ? 'var(--accent)' : 'var(--text-dim)',
                            cursor: 'pointer',
                            borderRadius: 0,
                          }}
                        >
                          {tab.replace('_', ' ').toUpperCase()}
                        </button>
                      );
                    })}
                  </div>

                  {/* Preset Subject List grid */}
                  <div style={{ height: '176px', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-sm)', background: 'rgba(0, 0, 0, 0.2)', overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {CurriculumPresets[activePresetTab].map((group, groupIdx) => (
                      <div key={groupIdx} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ fontSize: '10px', color: 'var(--accent)', fontWeight: 700, trackingSpacing: '0.08em', textTransform: 'uppercase', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '2px', marginBottom: '4px' }}>
                          {group.cat}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {group.subjects.map(subj => {
                            const isChecked = stagedSubjects.includes(subj);
                            return (
                              <button
                                key={subj}
                                type="button"
                                onClick={() => toggleSubjectChecked(subj)}
                                style={{
                                  padding: '4px 10px',
                                  fontSize: '11px',
                                  borderRadius: 'var(--radius-sm)',
                                  background: isChecked ? 'rgba(0, 229, 255, 0.15)' : 'transparent',
                                  color: isChecked ? 'var(--accent)' : 'var(--text-dim)',
                                  border: isChecked ? '1px solid var(--accent)' : '1px solid var(--glass-border)',
                                  fontWeight: 500,
                                  cursor: 'pointer'
                                }}
                              >
                                {subj}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}

                    {/* Custom subjects group */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '8px' }}>
                      <div style={{ fontSize: '10px', color: 'var(--accent)', fontWeight: 700, trackingSpacing: '0.08em', textTransform: 'uppercase', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '2px', marginBottom: '4px' }}>
                        Custom Subjects
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {customSubjects.map(subj => {
                          const isChecked = stagedSubjects.includes(subj);
                          return (
                            <button
                              key={subj}
                              type="button"
                              onClick={() => toggleSubjectChecked(subj)}
                              style={{
                                padding: '4px 10px',
                                fontSize: '11px',
                                borderRadius: 'var(--radius-sm)',
                                background: isChecked ? 'rgba(0, 229, 255, 0.15)' : 'transparent',
                                color: isChecked ? 'var(--accent)' : 'var(--text-dim)',
                                border: isChecked ? '1px solid var(--accent)' : '1px solid var(--glass-border)',
                                fontWeight: 500,
                                cursor: 'pointer'
                              }}
                            >
                              {subj}
                            </button>
                          );
                        })}
                        {customSubjects.length === 0 && (
                          <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                            No custom subjects added yet.
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Add Custom Subject field */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      value={customSubjectInput}
                      onChange={(e) => setCustomSubjectInput(e.target.value)}
                      placeholder="e.g. Moral Instruction"
                      className="modern-input"
                      style={{ flex: 1, padding: '8px 12px', fontSize: '12px' }}
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomSubject}
                      className="secondary-btn"
                      style={{ padding: '8px 14px', fontSize: '11px', borderRadius: 'var(--radius-sm)' }}
                    >
                      ➕ Add Custom
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Drawer Footer Actions */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--glass-border)', background: 'rgba(0, 0, 0, 0.15)', flexShrink: 0, display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                className="secondary-btn"
                style={{ flex: 1, justifyContent: 'center', padding: '12px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveStudent}
                className="primary-btn"
                style={{ flex: 1, justifyContent: 'center', padding: '12px' }}
              >
                {editStudentId ? 'Save Changes' : 'Confirm Enrollment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Student Detail Modal ─────────────────────────────────────────────── */}
      {isDetailModalOpen && detailStudent && (
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
              width: '480px',
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
                  🎓 Student Profile
                </h3>
                <p style={{ fontSize: '11px', color: 'var(--text-dim)', margin: '2px 0 0' }}>
                  {detailStudent.id}
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

              {/* Profile Photo Header */}
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', background: 'rgba(255, 255, 255, 0.02)', padding: '16px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--glass-border)' }}>
                {detailStudent.photo ? (
                  <img
                    src={`data:image/jpeg;base64,${detailStudent.photo}`}
                    alt={detailStudent.name}
                    style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '50%',
                      objectFit: 'cover',
                      border: '2px solid var(--accent)',
                      flexShrink: 0
                    }}
                  />
                ) : (
                  <div style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '2px dashed var(--glass-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px',
                    color: 'var(--text-dim)',
                    fontWeight: 'bold',
                    flexShrink: 0
                  }}>
                    {detailStudent.name ? detailStudent.name.charAt(0).toUpperCase() : '?'}
                  </div>
                )}
                <div>
                  <h4 style={{ margin: 0, fontWeight: 700, color: 'var(--text-main)', fontSize: '15px' }}>{detailStudent.name}</h4>
                  <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--accent)', fontWeight: 600 }}>{detailStudent.class_name}</p>
                </div>
              </div>

              {/* Identity Row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                {([
                  { label: 'Full Name',    value: detailStudent.name },
                  { label: 'Class',        value: detailStudent.class_name },
                  { label: 'Reg. Number',  value: detailStudent.reg_no  || '—' },
                  { label: 'Gender',       value: detailStudent.gender  || '—' },
                  { label: 'Date of Birth',value: detailStudent.dob     || '—' },
                  { label: 'Fee Status',   value: detailStudent.fee_status || '—' },
                ] as { label: string; value: string }[]).map(({ label, value }) => (
                  <div key={label}>
                    <p style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>{label}</p>
                    <p style={{
                      fontSize: '13px',
                      color: label === 'Fee Status'
                        ? (value === 'cleared' ? 'var(--success)' : value === 'partial' ? 'var(--warning)' : 'var(--danger)')
                        : 'var(--text-main)',
                      fontWeight: label === 'Full Name' ? 600 : 400,
                      margin: 0,
                    }}>{value}</p>
                  </div>
                ))}
              </div>

              {/* Parent / Guardian */}
              <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '16px' }}>
                <p style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>Parent / Guardian</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  {([
                    { label: 'Guardian Name',  value: detailStudent.parent_name  || '—' },
                    { label: 'Phone',          value: detailStudent.parent_phone || '—' },
                    { label: 'Email',          value: detailStudent.parent_email || '—' },
                  ] as { label: string; value: string }[]).map(({ label, value }) => (
                    <div key={label}>
                      <p style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>{label}</p>
                      <p style={{ fontSize: '13px', color: 'var(--text-main)', margin: 0 }}>{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Enrolled Subjects */}
              <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '16px' }}>
                <p style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
                  Enrolled Subjects ({detailStudent.subjects?.length || 0})
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {detailStudent.subjects?.length ? detailStudent.subjects.map(sub => (
                    <span key={sub} style={{
                      fontSize: '11px', padding: '3px 10px',
                      background: 'rgba(0,229,255,0.08)',
                      border: '1px solid rgba(0,229,255,0.25)',
                      borderRadius: '20px', color: 'var(--accent)',
                    }}>{sub}</span>
                  )) : (
                    <span style={{ fontSize: '12px', color: 'var(--text-dim)', fontStyle: 'italic' }}>No subjects enrolled</span>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '14px 24px',
              borderTop: '1px solid var(--glass-border)',
              flexShrink: 0, background: 'rgba(0,0,0,0.15)',
              display: 'flex', justifyContent: 'flex-end', gap: '8px',
            }}>
              <button onClick={() => { setIsDetailModalOpen(false); openEditDrawer(detailStudent); }} className="secondary-btn">
                ✏️ Edit Profile
              </button>
              <button onClick={() => setIsDetailModalOpen(false)} className="primary-btn" style={{ justifyContent: 'center' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Student Settings Panel ─────────────────────────────────────────── */}
      {isSettingsPanelOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setIsSettingsPanelOpen(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 1999,
              background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
            }}
          />

          {/* Panel */}
          <div style={{
            position: 'fixed', top: 0, right: 0, width: '380px', height: '100vh',
            background: 'var(--bg-dark, #0d1128)',
            borderLeft: '1px solid var(--glass-border)',
            zIndex: 2000,
            display: 'flex', flexDirection: 'column',
            boxShadow: '-12px 0 40px rgba(0,0,0,0.6)',
            animation: 'slideInRight 0.25s cubic-bezier(0.4,0,0.2,1)',
          }}>
            {/* Header */}
            <div style={{
              padding: '20px 24px 16px',
              borderBottom: '1px solid var(--glass-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexShrink: 0,
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-main)' }}>⚙️ Student Directory Settings</h3>
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--text-dim)' }}>Configure student management policies.</p>
              </div>
              <button
                onClick={() => setIsSettingsPanelOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '20px', lineHeight: 1, padding: '4px' }}
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>

              {/* Section label */}
              <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--accent-gold, #FFD700)', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 16px' }}>Mobile Companion Controls</p>

              {/* Toggle Row */}
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--glass-border)',
                borderRadius: 'var(--radius-md)',
                padding: '16px 18px',
                display: 'flex', alignItems: 'flex-start', gap: '14px',
              }}>
                {/* Toggle Switch */}
                <div
                  onClick={() => setMobileRegLocked(v => !v)}
                  style={{
                    width: '40px', height: '22px', borderRadius: '11px', flexShrink: 0, marginTop: '2px',
                    background: mobileRegLocked ? 'rgba(239,68,68,0.8)' : 'rgba(0,229,255,0.7)',
                    position: 'relative', cursor: 'pointer',
                    transition: 'background 0.25s',
                    boxShadow: mobileRegLocked ? '0 0 10px rgba(239,68,68,0.35)' : '0 0 10px rgba(0,229,255,0.25)',
                  }}
                >
                  <div style={{
                    position: 'absolute', top: '3px',
                    left: mobileRegLocked ? '21px' : '3px',
                    width: '16px', height: '16px', borderRadius: '50%',
                    background: '#fff',
                    transition: 'left 0.25s cubic-bezier(0.4,0,0.2,1)',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
                  }} />
                </div>

                <div style={{ flex: 1 }}>
                  <p style={{ margin: '0 0 4px', fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>
                    {mobileRegLocked ? '🔒 Mobile Registration Locked' : '🔓 Mobile Registration Enabled'}
                  </p>
                  <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.5 }}>
                    {mobileRegLocked
                      ? 'Mobile companion devices cannot add new students. Existing sync, grade updates, and attendance are still allowed.'
                      : 'Mobile companion devices can register new students into the school database during sync.'}
                  </p>
                </div>
              </div>

              <div style={{ height: '1px', background: 'var(--glass-border)', margin: '24px 0' }} />

              <p style={{ fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.6, margin: 0 }}>
                <strong style={{ color: 'var(--text-main)' }}>Note:</strong> This only restricts <em>new student registration</em> from mobile. Teachers can still submit grades and sync attendance normally. Changes take effect immediately on the next sync from any mobile device.
              </p>

            </div>

            {/* Footer */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid var(--glass-border)',
              flexShrink: 0, display: 'flex', gap: '10px',
            }}>
              <button
                onClick={() => setIsSettingsPanelOpen(false)}
                className="secondary-btn"
                style={{ flex: 1, justifyContent: 'center', padding: '11px' }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setSettingsSaving(true);
                  try {
                    const res = await window.electronAPI?.students?.saveSettings({ mobile_registration_locked: mobileRegLocked });
                    if (res?.ok) setIsSettingsPanelOpen(false);
                    else alert('Failed to save settings.');
                  } finally {
                    setSettingsSaving(false);
                  }
                }}
                className="primary-btn"
                style={{ flex: 1, justifyContent: 'center', padding: '11px' }}
                disabled={settingsSaving}
              >
                {settingsSaving ? 'Saving…' : 'Save Settings'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default Students;
