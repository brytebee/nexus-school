import React, { useState, useEffect } from 'react';
import { DataTable, Column } from '../components/DataTable';
import { CurriculumPresets } from '../lib/curriculum';
import { useSudoAuth } from '../context/SudoAuthContext';
import { Combobox } from '../components/Combobox';
import { useClassArms } from '../hooks/useClassArms';

interface Student {
  id: string;
  name: string;
  class_name: string;
  class_arm?: string;
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

const splitClass = (selected: string, configs: { hierarchy_class: string }[]) => {
  const sorted = [...configs].sort((a, b) => b.hierarchy_class.length - a.hierarchy_class.length);
  for (const conf of sorted) {
    const prefix = conf.hierarchy_class;
    if (selected === prefix) {
      return { class_name: prefix, class_arm: '' };
    }
    if (selected.startsWith(prefix + ' ')) {
      return { class_name: prefix, class_arm: selected.substring(prefix.length + 1).trim() };
    }
  }
  const lastSpace = selected.lastIndexOf(' ');
  if (lastSpace > -1) {
    return {
      class_name: selected.substring(0, lastSpace).trim(),
      class_arm: selected.substring(lastSpace + 1).trim()
    };
  }
  return { class_name: selected, class_arm: '' };
};

export function Students() {
  const { requireSudo } = useSudoAuth();
  const { configs, fullList } = useClassArms();
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
  const [mobileGradesLocked, setMobileGradesLocked] = useState(false);
  const [mobileAttendanceLocked, setMobileAttendanceLocked] = useState(false);
  const [mobileRegLockAt, setMobileRegLockAt] = useState('');
  const [mobileGradesLockAt, setMobileGradesLockAt] = useState('');
  const [mobileAttendanceLockAt, setMobileAttendanceLockAt] = useState('');
  const [scheduleRegLock, setScheduleRegLock] = useState(false);
  const [scheduleGradesLock, setScheduleGradesLock] = useState(false);
  const [scheduleAttendanceLock, setScheduleAttendanceLock] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    if (!isSettingsPanelOpen) return;
    const interval = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isSettingsPanelOpen]);


  const getCountdownText = (targetTimeStr: string) => {
    if (!targetTimeStr) return '';
    const target = new Date(targetTimeStr).getTime();
    if (isNaN(target) || nowTick >= target) return '⏱️ Lock engaged / Deadline passed';
    const diff = target - nowTick;
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (mins > 0 || parts.length === 0) parts.push(`${mins}m`);
    return `⏱️ Locks in ${parts.join(' ')}`;
  };

  const isRegLockedEff = mobileRegLocked || (scheduleRegLock && mobileRegLockAt && nowTick >= new Date(mobileRegLockAt).getTime());
  const isGradesLockedEff = mobileGradesLocked || (scheduleGradesLock && mobileGradesLockAt && nowTick >= new Date(mobileGradesLockAt).getTime());
  const isAttendanceLockedEff = mobileAttendanceLocked || (scheduleAttendanceLock && mobileAttendanceLockAt && nowTick >= new Date(mobileAttendanceLockAt).getTime());

  const [csvStatus, setCsvStatus] = useState<string | null>(null);

  // Filter state — used to narrow the student list
  const [filterClass, setFilterClass] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterTeacherId, setFilterTeacherId] = useState('');
  const [filterNoArm, setFilterNoArm] = useState(false);

  // Filter metadata — teachers list and all known subjects
  const [filterTeachers, setFilterTeachers] = useState<{ id: string; name: string; allocations?: { class_name: string; subject: string }[] }[]>([]);
  const [filterSubjects, setFilterSubjects] = useState<string[]>([]);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

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

  // Grades Panel State (inside Student Detail Modal)
  const [gradesData, setGradesData] = useState<{ subject: string; score: number; breakdown: Record<string, number> }[]>([]);
  const [gradesLoading, setGradesLoading] = useState(false);
  const [gradesSaving, setGradesSaving] = useState(false);
  const [gradesEditMode, setGradesEditMode] = useState(false);
  const [gradesUnlocked, setGradesUnlocked] = useState(false);
  const [gradesStatus, setGradesStatus] = useState<string | null>(null);

  // Load filter metadata on mount (teachers + subjects from canonical allocation list)
  useEffect(() => {
    const loadFilterMeta = async () => {
      try {
        const tchRes = await window.electronAPI?.getAllTeachers?.({ limit: 500 });
        if (tchRes?.ok) setFilterTeachers(tchRes.data || []);

        const subRes = await window.electronAPI?.subjects?.getCanonicalList?.();
        if (subRes?.ok) {
          const unique = Array.from(new Set((subRes.data || []).map((r: any) => r.subject).filter(Boolean))).sort() as string[];
          setFilterSubjects(unique);
        }
      } catch (err) {
        console.error('Failed to load filter metadata:', err);
      }
    };
    loadFilterMeta();
  }, []);

  // Fetch student records
  const fetchStudents = async () => {
    if (!window.electronAPI?.getAllStudents) return;
    setLoading(true);
    try {
      const res = await window.electronAPI.getAllStudents({
        limit,
        offset: page * limit,
        search,
        class_name: filterClass,
        subject: filterSubject,
        teacher_id: filterTeacherId,
        no_arm: filterNoArm,
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
  }, [page, search, limit, filterClass, filterSubject, filterTeacherId, filterNoArm]);


  // Load student directory settings on mount
  useEffect(() => {
    const loadStudentSettings = async () => {
      try {
        const res = await window.electronAPI?.students?.getSettings();
        if (res?.ok) {
          setMobileRegLocked(res.mobile_registration_locked ?? false);
          setMobileGradesLocked(res.mobile_grades_locked ?? false);
          setMobileAttendanceLocked(res.mobile_attendance_locked ?? false);
          if (res.mobile_registration_lock_at) {
            setMobileRegLockAt(res.mobile_registration_lock_at.substring(0, 16));
            setScheduleRegLock(true);
          } else {
            setMobileRegLockAt('');
            setScheduleRegLock(false);
          }
          if (res.mobile_grades_lock_at) {
            setMobileGradesLockAt(res.mobile_grades_lock_at.substring(0, 16));
            setScheduleGradesLock(true);
          } else {
            setMobileGradesLockAt('');
            setScheduleGradesLock(false);
          }
          if (res.mobile_attendance_lock_at) {
            setMobileAttendanceLockAt(res.mobile_attendance_lock_at.substring(0, 16));
            setScheduleAttendanceLock(true);
          } else {
            setMobileAttendanceLockAt('');
            setScheduleAttendanceLock(false);
          }
        }
      } catch (err) {
        console.error('Error loading student settings:', err);
      }
    };
    loadStudentSettings();
  }, []);

  useEffect(() => {
    if (window.electronAPI?.onCSVLoaded) {
      window.electronAPI.onCSVLoaded((payload: any) => {
        const count = typeof payload === 'object' ? payload.count : payload;
        const warnings: string[] = typeof payload === 'object' ? (payload.warnings || []) : [];
        const baseMsg = `✅ CSV Processed: ${count} Students Loaded`;
        const fullMsg = warnings.length > 0
          ? `${baseMsg} — ⚠️ ${warnings.length} warning(s): ${warnings.join(' | ')}`
          : baseMsg;
        setCsvStatus(fullMsg);
        fetchStudents();
        setTimeout(() => setCsvStatus(null), warnings.length > 0 ? 8000 : 4000);

        const Swal = (window as any).Swal;
        if (Swal) {
          if (warnings.length > 0) {
            Swal.fire({
              title: 'Import Processed with Warnings',
              html: `
                <p style="color: #fff; margin-bottom: 10px;">Successfully loaded <strong>${count}</strong> students.</p>
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
              text: `Successfully loaded ${count} students.`,
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

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvStatus('⏳ Ingesting and verifying student CSV data...');
    if (window.electronAPI?.processCSV) {
      window.electronAPI.processCSV(file.path);
    }
  };

  const handleGradesCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvStatus('⏳ Ingesting and verifying Grades CSV data...');
    if ((window.electronAPI as any)?.processGradesCSV) {
      (window.electronAPI as any).processGradesCSV(file.path);
    }
  };

  const handleAttendanceCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvStatus('⏳ Ingesting and verifying Attendance CSV data...');
    if ((window.electronAPI as any)?.processAttendanceCSV) {
      (window.electronAPI as any).processAttendanceCSV(file.path);
    }
  };

  const handleClearData = async (type: 'grades' | 'attendance') => {
    const Swal = (window as any).Swal;
    if (!Swal) return;

    try {
      const res = await (window.electronAPI as any)?.db?.getClearImpact({ type });
      if (!res?.ok) {
        Swal.fire({
          title: 'Error',
          text: 'Failed to calculate database impact: ' + (res?.error || 'Unknown error'),
          icon: 'error',
          background: '#0b0f19',
          color: '#fff',
          confirmButtonColor: '#00E5FF'
        });
        return;
      }

      const counts = res.counts || {};
      let impactHtml = '<div style="text-align: left; padding: 10px 5px; font-family: \'Inter\', sans-serif;">';
      if (type === 'grades') {
        impactHtml += `
          <p style="color: #fff; font-size: 14px; margin-bottom: 15px; line-height: 1.5;">
            You are about to delete all grade records. This will affect:
          </p>
          <ul style="color: #aaa; font-size: 12px; line-height: 1.8; padding-left: 20px; margin-bottom: 15px;">
            <li><strong>${counts.student_records || 0}</strong> Student subject grade entries (scores/breakdowns)</li>
            <li><strong>${counts.sync_warnings || 0}</strong> Mismatched subject sync warnings</li>
          </ul>
        `;
      } else {
        impactHtml += `
          <p style="color: #fff; font-size: 14px; margin-bottom: 15px; line-height: 1.5;">
            You are about to delete all attendance records. This will affect:
          </p>
          <ul style="color: #aaa; font-size: 12px; line-height: 1.8; padding-left: 20px; margin-bottom: 15px;">
            <li><strong>${counts.student_attendance || 0}</strong> Term-level student attendance cards</li>
            <li><strong>${counts.daily_attendance || 0}</strong> Daily roll-call records</li>
            <li><strong>${counts.subject_attendance || 0}</strong> Subject-level period attendance logs</li>
            <li><strong>${counts.subject_attendance_agg || 0}</strong> Aggregated subject attendance caches</li>
            <li><strong>${counts.truancy_flags || 0}</strong> Truancy radar flags</li>
          </ul>
        `;
      }
      impactHtml += `
        <p style="color: #ef4444; font-size: 13px; font-weight: 600; margin-top: 15px;">
          ⚠️ THIS ACTION IS IRREVERSIBLE AND DESTROYS ALL CORRESPONDING DATA!
        </p>
      </div>`;

      const confirmRes = await Swal.fire({
        title: `<span style="color:#ef4444; font-size:20px; font-weight:700;">Clear All ${type === 'grades' ? 'Grades & Marks' : 'Attendance Records'}?</span>`,
        html: impactHtml,
        showCancelButton: true,
        confirmButtonText: 'Yes, Clear All',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#555',
        background: '#0b0f19',
        color: '#fff',
      });

      if (!confirmRes.isConfirmed) return;

      requireSudo(
        async () => {
          Swal.fire({
            title: 'Wiping Data...',
            html: '<p style="color:#aaa;">Please wait while records are being purged from the database.</p>',
            allowOutsideClick: false,
            didOpen: () => {
              Swal.showLoading();
            },
            background: '#0b0f19',
            color: '#fff'
          });

          const clearRes = await (window.electronAPI as any)?.db?.clearData({ type });
          if (clearRes?.ok) {
            Swal.fire({
              title: 'Success!',
              text: `All ${type} and cascading records have been deleted successfully.`,
              icon: 'success',
              background: '#0b0f19',
              color: '#fff',
              confirmButtonColor: '#00E5FF'
            });
          } else {
            Swal.fire({
              title: 'Clear Failed',
              text: clearRes?.error || 'Failed to clear data.',
              icon: 'error',
              background: '#0b0f19',
              color: '#fff',
              confirmButtonColor: '#ef4444'
            });
          }
        },
        `Authorize Deleting ${type === 'grades' ? 'Grades' : 'Attendance'}`,
        `Enter administrator PIN to confirm and execute the purge.`,
        true
      );

    } catch (err: any) {
      Swal.fire({
        title: 'Error',
        text: err.message,
        icon: 'error',
        background: '#0b0f19',
        color: '#fff',
        confirmButtonColor: '#ef4444'
      });
    }
  };

  // Handle Grades CSV Loaded notification
  useEffect(() => {
    if ((window.electronAPI as any)?.onGradesCSVLoaded) {
      (window.electronAPI as any).onGradesCSVLoaded((res: { count: number, error: string | null }) => {
        const Swal = (window as any).Swal;
        if (res.error) {
          setCsvStatus(`❌ Grades Import Failed: ${res.error}`);
          if (Swal) {
            Swal.fire({
              title: 'Grades Import Failed',
              text: res.error,
              icon: 'error',
              background: '#0b0f19',
              color: '#fff',
              confirmButtonColor: '#ef4444'
            });
          }
        } else {
          setCsvStatus(`✅ Grades CSV Processed: ${res.count} records loaded`);
          if (Swal) {
            Swal.fire({
              title: 'Success!',
              text: `Successfully imported ${res.count} grade records.`,
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
  }, []);

  // Handle Attendance CSV Loaded notification
  useEffect(() => {
    if ((window.electronAPI as any)?.onAttendanceCSVLoaded) {
      (window.electronAPI as any).onAttendanceCSVLoaded((res: { count: number, error: string | null }) => {
        const Swal = (window as any).Swal;
        if (res.error) {
          setCsvStatus(`❌ Attendance Import Failed: ${res.error}`);
          if (Swal) {
            Swal.fire({
              title: 'Attendance Import Failed',
              text: res.error,
              icon: 'error',
              background: '#0b0f19',
              color: '#fff',
              confirmButtonColor: '#ef4444'
            });
          }
        } else {
          setCsvStatus(`✅ Attendance CSV Processed: ${res.count} records loaded`);
          if (Swal) {
            Swal.fire({
              title: 'Success!',
              text: `Successfully imported ${res.count} attendance records.`,
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
  }, []);

  // Open View Detail Modal
  const openDetailModal = (student: Student) => {
    setDetailStudent(student);
    setIsDetailModalOpen(true);
    // Reset grades panel for the newly opened student
    setGradesUnlocked(false);
    setGradesEditMode(false);
    setGradesData([]);
    setGradesStatus(null);
  };

  // Fetch grades for the grade panel
  const fetchGrades = async (studentId: string) => {
    setGradesLoading(true);
    try {
      const res = await (window.electronAPI as any)?.students?.getGrades({ student_id: studentId });
      if (res?.ok) setGradesData(res.grades);
    } finally {
      setGradesLoading(false);
    }
  };

  // Prompt for sudo then unlock grades
  const handleViewGrades = () => {
    requireSudo(
      async () => {
        setGradesUnlocked(true);
        if (detailStudent) await fetchGrades(detailStudent.id);
      },
      'View & Edit Grades',
      'Admin access is required to view or modify student term grades.',
      false  // non-destructive — skip confirm dialog within active session
    );
  };

  // Save edited grades back to the Hub
  const handleSaveGrades = async () => {
    if (!detailStudent) return;
    setGradesSaving(true);
    try {
      const payload = {
        student_id: detailStudent.id,
        grades: gradesData.map(g => ({ subject: g.subject, breakdown: g.breakdown, score: g.score })),
      };
      const res = await (window.electronAPI as any)?.students?.saveGrades(payload);
      if (res?.ok) {
        setGradesStatus('✅ Grades saved successfully.');
        setGradesEditMode(false);
      } else {
        setGradesStatus('❌ ' + (res?.error || 'Save failed'));
      }
    } finally {
      setGradesSaving(false);
      setTimeout(() => setGradesStatus(null), 3500);
    }
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
    setClassName(student.class_arm ? `${student.class_name} ${student.class_arm}` : (student.class_name || ''));
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
      const { class_name, class_arm } = splitClass(className, configs);
      const payload = {
        id: editStudentId || '',
        name,
        class_name,
        class_arm,
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
        const id = 'STU-' + Math.random().toString(36).substring(2, 10).toUpperCase();
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
      cell: (_, rowIndex) => <span style={{ fontSize: '12px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{page * limit + rowIndex + 1}</span>,
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
              src={s.photo.startsWith('data:') ? s.photo : `data:image/jpeg;base64,${s.photo}`}
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
              {s.class_arm ? `${s.class_name} ${s.class_arm}` : s.class_name}
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
    <>
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
      {isRegLockedEff && (
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

      {/* ── Filter Panel ──────────────────────────────────────────────── */}
      {(() => {
        // Derive filtered options when a teacher is selected
        const selectedTeacherAllocations = filterTeacherId
          ? (filterTeachers.find(t => t.id === filterTeacherId)?.allocations || [])
          : null;
        const teacherClasses  = selectedTeacherAllocations ? Array.from(new Set(selectedTeacherAllocations.map(a => a.class_name))) : null;
        const teacherSubjects = selectedTeacherAllocations ? Array.from(new Set(selectedTeacherAllocations.map(a => a.subject))).sort() : null;

        const classOptions  = teacherClasses ? [...teacherClasses].sort() : [...fullList].sort();
        const subjectOptions = teacherSubjects || filterSubjects;

        const hasAnyFilter = filterClass || filterSubject || filterTeacherId || filterNoArm;

        const clearAll = () => {
          setFilterClass('');
          setFilterSubject('');
          setFilterTeacherId('');
          setFilterNoArm(false);
          setPage(0);
        };

        return (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--glass-border)',
            borderRadius: 'var(--radius-md)',
            padding: '14px 18px',
          }}>
            {/* Filter row */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap', paddingTop: '2px' }}>
                🔽 Filters
              </span>

              {/* Teacher */}
              <select
                value={filterTeacherId}
                onChange={e => { setFilterTeacherId(e.target.value); setFilterClass(''); setFilterSubject(''); setPage(0); }}
                className="modern-input"
                style={{ fontSize: '12px', padding: '7px 10px', minWidth: '160px', flex: '1 1 160px' }}
              >
                <option value="">All Teachers</option>
                {filterTeachers.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>

              {/* Class / Arm */}
              <select
                value={filterClass}
                onChange={e => { setFilterClass(e.target.value); setPage(0); }}
                className="modern-input"
                style={{ fontSize: '12px', padding: '7px 10px', minWidth: '150px', flex: '1 1 150px' }}
              >
                <option value="">All Classes</option>
                {classOptions.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>

              {/* Subject */}
              <select
                value={filterSubject}
                onChange={e => { setFilterSubject(e.target.value); setPage(0); }}
                className="modern-input"
                style={{ fontSize: '12px', padding: '7px 10px', minWidth: '160px', flex: '1 1 160px' }}
              >
                <option value="">All Subjects</option>
                {subjectOptions.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>

              {hasAnyFilter && (
                <button
                  onClick={clearAll}
                  style={{
                    background: 'rgba(239,68,68,0.12)',
                    border: '1px solid rgba(239,68,68,0.35)',
                    color: '#f87171',
                    borderRadius: 'var(--radius-md)',
                    padding: '7px 14px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'background 0.2s',
                  }}
                  onMouseOver={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.22)')}
                  onMouseOut={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.12)')}
                >
                  ✕ Clear filters
                </button>
              )}

              {/* No-arm data-quality toggle */}
              <button
                onClick={() => { setFilterNoArm(v => !v); setPage(0); }}
                title="Show only students with no arm assignment"
                style={{
                  background: filterNoArm ? 'rgba(245,158,11,0.2)' : 'rgba(245,158,11,0.06)',
                  border: `1px solid ${filterNoArm ? 'rgba(245,158,11,0.6)' : 'rgba(245,158,11,0.25)'}`,
                  color: '#f59e0b',
                  borderRadius: 'var(--radius-md)',
                  padding: '7px 12px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  fontWeight: filterNoArm ? 700 : 400,
                  transition: 'all 0.2s',
                }}
              >
                ⚠️ No Arm
              </button>
            </div>

            {hasAnyFilter && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {filterNoArm && (
                  <span style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.4)', color: '#f59e0b', borderRadius: '20px', padding: '2px 10px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    ⚠️ No arm assigned
                    <button onClick={() => { setFilterNoArm(false); setPage(0); }} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, lineHeight: 1, fontSize: '12px' }}>×</button>
                  </span>
                )}
                {filterTeacherId && (
                  <span style={{ background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.3)', color: '#00e5ff', borderRadius: '20px', padding: '2px 10px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    👤 {filterTeachers.find(t => t.id === filterTeacherId)?.name || filterTeacherId}
                    <button onClick={() => { setFilterTeacherId(''); setPage(0); }} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, lineHeight: 1, fontSize: '12px' }}>×</button>
                  </span>
                )}
                {filterClass && (
                  <span style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa', borderRadius: '20px', padding: '2px 10px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    🏫 {filterClass}
                    <button onClick={() => { setFilterClass(''); setPage(0); }} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, lineHeight: 1, fontSize: '12px' }}>×</button>
                  </span>
                )}
                {filterSubject && (
                  <span style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#34d399', borderRadius: '20px', padding: '2px 10px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    📚 {filterSubject}
                    <button onClick={() => { setFilterSubject(''); setPage(0); }} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, lineHeight: 1, fontSize: '12px' }}>×</button>
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })()}

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
      </div>

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
                      src={photo.startsWith('data:') ? photo : `data:image/jpeg;base64,${photo}`}
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
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="secondary-btn"
                        style={{ padding: '6px 12px', fontSize: '11px', borderRadius: 'var(--radius-sm)' }}
                      >
                        Upload Photo
                      </button>
                      <input
                        type="file"
                        ref={fileInputRef}
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
                    <Combobox
                      options={fullList}
                      value={className}
                      onChange={setClassName}
                      placeholder="e.g. JSS 1 Gold"
                    />
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
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              flexShrink: 0,
              background: 'rgba(0,0,0,0.15)',
            }}>
              {/* Student Photo */}
              {detailStudent.photo ? (
                <img
                  src={detailStudent.photo.startsWith('data:') ? detailStudent.photo : `data:image/jpeg;base64,${detailStudent.photo}`}
                  alt={detailStudent.name}
                  style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '12px',
                    objectFit: 'cover',
                    border: '1px solid var(--glass-border)',
                    flexShrink: 0
                  }}
                />
              ) : (
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '12px',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  border: '1px dashed var(--glass-border)',
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

              {/* Title & ID */}
              <div style={{ flexGrow: 1 }}>
                <h3 style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '15px', margin: 0 }}>
                  🎓 Student Profile
                </h3>
                <p style={{ fontSize: '11px', color: 'var(--text-dim)', margin: '4px 0 0', fontFamily: 'var(--font-mono)' }}>
                  {detailStudent.id}
                </p>
              </div>

              {/* Close Button */}
              <button
                onClick={() => setIsDetailModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center' }}
              >
                ✕
              </button>
            </div>

            {/* ── Modal Body — view switcher ─────────────────────────────── */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>

              {gradesUnlocked ? (
                /* ────── Grades View ────── */
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

                  {/* Grades Nav Bar */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '10px 24px', borderBottom: '1px solid var(--glass-border)',
                    flexShrink: 0, background: 'rgba(0,0,0,0.1)',
                  }}>
                    <button
                      onClick={() => { setGradesUnlocked(false); setGradesEditMode(false); setGradesStatus(null); }}
                      style={{ background: 'transparent', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px', padding: 0, fontWeight: 600 }}
                    >
                      ← Back
                    </button>
                    <p style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 auto' }}>
                      📊 Term Grades
                    </p>
                    {!gradesEditMode ? (
                      <button onClick={() => setGradesEditMode(true)} className="secondary-btn" style={{ fontSize: '11px', padding: '4px 12px' }}>
                        ✏️ Edit
                      </button>
                    ) : (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => setGradesEditMode(false)} className="secondary-btn" style={{ fontSize: '11px', padding: '4px 10px' }}>
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveGrades}
                          className="primary-btn"
                          style={{ fontSize: '11px', padding: '4px 12px' }}
                          disabled={gradesSaving}
                        >
                          {gradesSaving ? 'Saving…' : '💾 Save'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Status banner */}
                  {gradesStatus && (
                    <div style={{
                      margin: '10px 24px 0', fontSize: '12px', padding: '6px 10px',
                      borderRadius: 'var(--radius-sm)', flexShrink: 0,
                      background: gradesStatus.startsWith('✅') ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                      color: gradesStatus.startsWith('✅') ? 'var(--success)' : 'var(--danger)',
                    }}>
                      {gradesStatus}
                    </div>
                  )}

                  {/* Scrollable grades list */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
                    {gradesLoading ? (
                      <p style={{ fontSize: '12px', color: 'var(--text-dim)' }}>Loading grades…</p>
                    ) : gradesData.length === 0 ? (
                      <p style={{ fontSize: '12px', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                        No grades recorded for this term.
                      </p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {gradesData.map((g, gi) => (
                          <div key={g.subject} style={{
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid var(--glass-border)',
                            borderRadius: 'var(--radius-sm)',
                            padding: '8px 12px',
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: gradesEditMode && Object.keys(g.breakdown || {}).length > 0 ? '8px' : 0 }}>
                              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main)' }}>{g.subject}</span>
                              {/* In edit mode with NO breakdown sub-components, show a direct score input */}
                              {gradesEditMode && Object.keys(g.breakdown || {}).length === 0 ? (
                                <input
                                  type="number"
                                  step="any"
                                  value={g.score ?? 0}
                                  min={0}
                                  onChange={e => {
                                    const newVal = parseFloat(e.target.value) || 0;
                                    setGradesData(prev => prev.map((gx, gxi) =>
                                      gxi !== gi ? gx : { ...gx, score: newVal }
                                    ));
                                  }}
                                  className="modern-input"
                                  style={{ width: '60px', textAlign: 'center', fontSize: '12px', padding: '3px 6px' }}
                                />
                              ) : (
                                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
                                  {g.score ?? '—'}
                                </span>
                              )}
                            </div>
                            {/* Sub-component breakdown inputs — only shown when breakdown has keys */}
                            {gradesEditMode && Object.keys(g.breakdown || {}).length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', overflowY: 'auto', maxHeight: '120px' }}>
                                {Object.entries(g.breakdown || {}).map(([key, val]) => (
                                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <label style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{key}</label>
                                    <input
                                      type="number"
                                      step="any"
                                      value={val as number}
                                      min={0}
                                      onChange={e => {
                                        const newVal = parseFloat(e.target.value) || 0;
                                        setGradesData(prev => prev.map((gx, gxi) => {
                                          if (gxi !== gi) return gx;
                                          const newBd = { ...gx.breakdown, [key]: newVal };
                                          const newScore = Object.values(newBd).reduce((s, v) => s + (Number(v) || 0), 0);
                                          return { ...gx, breakdown: newBd, score: newScore };
                                        }));
                                      }}
                                      className="modern-input"
                                      style={{ width: '48px', textAlign: 'center', fontSize: '11px', padding: '3px 5px' }}
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

              ) : (
                /* ────── Details View ────── */
                <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                  {/* Identity Row */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    {([
                      { label: 'Full Name',    value: detailStudent.name },
                      { label: 'Class',        value: detailStudent.class_arm ? `${detailStudent.class_name} ${detailStudent.class_arm}` : detailStudent.class_name },
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

                  {/* Grades Access Row */}
                  <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <p style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
                      📊 Term Grades
                    </p>
                    <button onClick={handleViewGrades} className="secondary-btn" style={{ fontSize: '11px', padding: '4px 12px' }}>
                      🔐 View Grades
                    </button>
                  </div>

                </div>
              )}
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

              {/* Mobile Companion Controls Container */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                {/* 1. Mobile Registration Lock */}
                <div style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '16px 18px',
                  display: 'flex', flexDirection: 'column', gap: '14px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                    <div
                      onClick={() => setMobileRegLocked(v => !v)}
                      style={{
                        width: '40px', height: '22px', borderRadius: '11px', flexShrink: 0, marginTop: '2px',
                        background: isRegLockedEff ? 'rgba(239,68,68,0.8)' : 'rgba(0,229,255,0.7)',
                        position: 'relative', cursor: 'pointer',
                        transition: 'background 0.25s',
                        boxShadow: isRegLockedEff ? '0 0 10px rgba(239,68,68,0.35)' : '0 0 10px rgba(0,229,255,0.25)',
                      }}
                    >
                      <div style={{
                        position: 'absolute', top: '3px',
                        left: isRegLockedEff ? '21px' : '3px',
                        width: '16px', height: '16px', borderRadius: '50%',
                        background: '#fff',
                        transition: 'left 0.25s cubic-bezier(0.4,0,0.2,1)',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
                      }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: '0 0 4px', fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>
                        {isRegLockedEff ? '🔒 Mobile Registration Locked' : '🔓 Mobile Registration Enabled'}
                      </p>
                      <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.5 }}>
                        Mobile companion devices cannot register new students into Central Hub.
                      </p>
                    </div>
                  </div>
                  <div style={{ paddingLeft: '54px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-main)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={scheduleRegLock}
                        onChange={e => {
                          setScheduleRegLock(e.target.checked);
                          if (!e.target.checked) setMobileRegLockAt('');
                        }}
                        style={{ accentColor: 'var(--accent)' }}
                      />
                      Schedule lock at date & time
                    </label>
                    {scheduleRegLock && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <input
                          type="datetime-local"
                          value={mobileRegLockAt}
                          onChange={e => setMobileRegLockAt(e.target.value)}
                          className="modern-input"
                          style={{ fontSize: '12px', padding: '6px 10px', background: 'rgba(0,0,0,0.2)' }}
                        />
                        {mobileRegLockAt && (
                          <span style={{ fontSize: '11px', fontWeight: 600, color: getCountdownText(mobileRegLockAt).includes('passed') ? 'var(--danger, #ef4444)' : 'var(--accent, #00e5ff)' }}>
                            {getCountdownText(mobileRegLockAt)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. Mobile Grades Entry Lock */}
                <div style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '16px 18px',
                  display: 'flex', flexDirection: 'column', gap: '14px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                    <div
                      onClick={() => setMobileGradesLocked(v => !v)}
                      style={{
                        width: '40px', height: '22px', borderRadius: '11px', flexShrink: 0, marginTop: '2px',
                        background: isGradesLockedEff ? 'rgba(239,68,68,0.8)' : 'rgba(0,229,255,0.7)',
                        position: 'relative', cursor: 'pointer',
                        transition: 'background 0.25s',
                        boxShadow: isGradesLockedEff ? '0 0 10px rgba(239,68,68,0.35)' : '0 0 10px rgba(0,229,255,0.25)',
                      }}
                    >
                      <div style={{
                        position: 'absolute', top: '3px',
                        left: isGradesLockedEff ? '21px' : '3px',
                        width: '16px', height: '16px', borderRadius: '50%',
                        background: '#fff',
                        transition: 'left 0.25s cubic-bezier(0.4,0,0.2,1)',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
                      }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: '0 0 4px', fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>
                        {isGradesLockedEff ? '🔒 Mobile Grade Entry Locked' : '🔓 Mobile Grade Entry Enabled'}
                      </p>
                      <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.5 }}>
                        Restrict teachers from entering, updating, or saving student grades.
                      </p>
                    </div>
                  </div>
                  <div style={{ paddingLeft: '54px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-main)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={scheduleGradesLock}
                        onChange={e => {
                          setScheduleGradesLock(e.target.checked);
                          if (!e.target.checked) setMobileGradesLockAt('');
                        }}
                        style={{ accentColor: 'var(--accent)' }}
                      />
                      Schedule lock at date & time
                    </label>
                    {scheduleGradesLock && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <input
                          type="datetime-local"
                          value={mobileGradesLockAt}
                          onChange={e => setMobileGradesLockAt(e.target.value)}
                          className="modern-input"
                          style={{ fontSize: '12px', padding: '6px 10px', background: 'rgba(0,0,0,0.2)' }}
                        />
                        {mobileGradesLockAt && (
                          <span style={{ fontSize: '11px', fontWeight: 600, color: getCountdownText(mobileGradesLockAt).includes('passed') ? 'var(--danger, #ef4444)' : 'var(--accent, #00e5ff)' }}>
                            {getCountdownText(mobileGradesLockAt)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. Mobile Attendance Entry Lock */}
                <div style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '16px 18px',
                  display: 'flex', flexDirection: 'column', gap: '14px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                    <div
                      onClick={() => setMobileAttendanceLocked(v => !v)}
                      style={{
                        width: '40px', height: '22px', borderRadius: '11px', flexShrink: 0, marginTop: '2px',
                        background: isAttendanceLockedEff ? 'rgba(239,68,68,0.8)' : 'rgba(0,229,255,0.7)',
                        position: 'relative', cursor: 'pointer',
                        transition: 'background 0.25s',
                        boxShadow: isAttendanceLockedEff ? '0 0 10px rgba(239,68,68,0.35)' : '0 0 10px rgba(0,229,255,0.25)',
                      }}
                    >
                      <div style={{
                        position: 'absolute', top: '3px',
                        left: isAttendanceLockedEff ? '21px' : '3px',
                        width: '16px', height: '16px', borderRadius: '50%',
                        background: '#fff',
                        transition: 'left 0.25s cubic-bezier(0.4,0,0.2,1)',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
                      }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: '0 0 4px', fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>
                        {isAttendanceLockedEff ? '🔒 Mobile Attendance Locked' : '🔓 Mobile Attendance Enabled'}
                      </p>
                      <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.5 }}>
                        Restrict teachers from modifying class attendance registers.
                      </p>
                    </div>
                  </div>
                  <div style={{ paddingLeft: '54px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-main)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={scheduleAttendanceLock}
                        onChange={e => {
                          setScheduleAttendanceLock(e.target.checked);
                          if (!e.target.checked) setMobileAttendanceLockAt('');
                        }}
                        style={{ accentColor: 'var(--accent)' }}
                      />
                      Schedule lock at date & time
                    </label>
                    {scheduleAttendanceLock && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <input
                          type="datetime-local"
                          value={mobileAttendanceLockAt}
                          onChange={e => setMobileAttendanceLockAt(e.target.value)}
                          className="modern-input"
                          style={{ fontSize: '12px', padding: '6px 10px', background: 'rgba(0,0,0,0.2)' }}
                        />
                        {mobileAttendanceLockAt && (
                          <span style={{ fontSize: '11px', fontWeight: 600, color: getCountdownText(mobileAttendanceLockAt).includes('passed') ? 'var(--danger, #ef4444)' : 'var(--accent, #00e5ff)' }}>
                            {getCountdownText(mobileAttendanceLockAt)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

              </div>

              <div style={{ height: '1px', background: 'var(--glass-border)', margin: '24px 0' }} />

              {/* Data Import Section */}
              <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--accent-gold, #FFD700)', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 16px' }}>Academic Data Import</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
                {/* 1. Grades Import */}
                <div style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '16px 18px',
                  display: 'flex', flexDirection: 'column', gap: '10px',
                }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>📊 Grades & Scores</span>
                  <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.5 }}>
                    Columns: <code>Student_ID, Subject, Session, Term, CA1_Score, CA2_Score, Exam_Score</code> (or with <code>Score, Assessment</code>)
                  </p>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                    <a
                      href="data:text/csv;charset=utf-8,Student_ID,Subject,Session,Term,CA1_Score,CA2_Score,Exam_Score%0ASTU-001,Mathematics,2024/2025,First Term,15,15,40"
                      download="Nexus_Grades_Template.csv"
                      className="secondary-btn"
                      style={{ fontSize: '11px', padding: '6px 10px', flex: 1, textAlign: 'center', textDecoration: 'none', display: 'inline-block' }}
                    >
                      📥 Template
                    </a>
                    <label
                      htmlFor="grades-csv-upload-input"
                      className="primary-btn"
                      style={{ fontSize: '11px', padding: '6px 10px', cursor: 'pointer', flex: 1, textAlign: 'center' }}
                    >
                      📤 Import CSV
                    </label>
                    <input
                      type="file"
                      id="grades-csv-upload-input"
                      accept=".csv"
                      onChange={handleGradesCSVUpload}
                      style={{ display: 'none' }}
                    />
                  </div>
                </div>

                {/* 2. Attendance Summary Import */}
                <div style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '16px 18px',
                  display: 'flex', flexDirection: 'column', gap: '10px',
                }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>📅 Attendance Summaries</span>
                  <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.5 }}>
                    Columns: <code>Student_ID, Session, Term, Total_Days, Days_Attended</code>
                  </p>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                    <a
                      href="data:text/csv;charset=utf-8,Student_ID,Session,Term,Total_Days,Days_Attended%0ASTU-001,2024/2025,First Term,90,85"
                      download="Nexus_Attendance_Template.csv"
                      className="secondary-btn"
                      style={{ fontSize: '11px', padding: '6px 10px', flex: 1, textAlign: 'center', textDecoration: 'none', display: 'inline-block' }}
                    >
                      📥 Template
                    </a>
                    <label
                      htmlFor="attendance-csv-upload-input"
                      className="primary-btn"
                      style={{ fontSize: '11px', padding: '6px 10px', cursor: 'pointer', flex: 1, textAlign: 'center' }}
                    >
                      📤 Import CSV
                    </label>
                    <input
                      type="file"
                      id="attendance-csv-upload-input"
                      accept=".csv"
                      onChange={handleAttendanceCSVUpload}
                      style={{ display: 'none' }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ height: '1px', background: 'var(--glass-border)', margin: '24px 0' }} />

              {/* Danger Zone Container */}
              <div style={{
                background: 'rgba(239, 68, 68, 0.05)',
                border: '1px dashed rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '24px'
              }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 600, color: '#ef4444', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  ⚠️ Danger Zone
                </h4>
                <p style={{ fontSize: '11px', color: 'var(--text-dim)', margin: '0 0 12px 0', lineHeight: 1.5 }}>
                  These actions are destructive, irreversible, and require administrator credentials.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <button
                    onClick={() => handleClearData('grades')}
                    className="secondary-btn"
                    style={{
                      borderColor: 'rgba(239, 68, 68, 0.4)',
                      color: '#ef4444',
                      fontSize: '11px',
                      padding: '8px 12px',
                      justifyContent: 'center',
                      background: 'transparent'
                    }}
                  >
                    Clear All Grades & Marks
                  </button>
                  <button
                    onClick={() => handleClearData('attendance')}
                    className="secondary-btn"
                    style={{
                      borderColor: 'rgba(239, 68, 68, 0.4)',
                      color: '#ef4444',
                      fontSize: '11px',
                      padding: '8px 12px',
                      justifyContent: 'center',
                      background: 'transparent'
                    }}
                  >
                    Clear All Attendance Records
                  </button>
                </div>
              </div>

              <div style={{ height: '1px', background: 'var(--glass-border)', margin: '24px 0' }} />

              <p style={{ fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.6, margin: 0 }}>
                <strong style={{ color: 'var(--text-main)' }}>Note:</strong> Mobile lock statuses and scheduled deadlines take effect immediately on companion terminals upon their next sync query.
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
                    const res = await window.electronAPI?.students?.saveSettings({
                      mobile_registration_locked: mobileRegLocked,
                      mobile_grades_locked: mobileGradesLocked,
                      mobile_attendance_locked: mobileAttendanceLocked,
                      mobile_registration_lock_at: scheduleRegLock && mobileRegLockAt ? mobileRegLockAt : null,
                      mobile_grades_lock_at: scheduleGradesLock && mobileGradesLockAt ? mobileGradesLockAt : null,
                      mobile_attendance_lock_at: scheduleAttendanceLock && mobileAttendanceLockAt ? mobileAttendanceLockAt : null
                    });
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
    </>
  );
}

export default Students;
