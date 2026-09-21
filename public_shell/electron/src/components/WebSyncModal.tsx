import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';

interface WebSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  defaultTab?: 'overview' | 'classes' | 'branding' | 'calendar' | 'fees' | 'cbt';
}

export function WebSyncModal({
  isOpen,
  onClose,
  onSuccess,
  defaultTab = 'overview',
}: WebSyncModalProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'classes' | 'branding' | 'calendar' | 'fees' | 'cbt'>(defaultTab);
  const [loading, setLoading] = useState(false);
  const [testingImpact, setTestingImpact] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [impactResult, setImpactResult] = useState<any>(null);

  // Module selection toggles
  const [syncClasses, setSyncClasses] = useState(true);
  const [syncBranding, setSyncBranding] = useState(true);
  const [syncCalendar, setSyncCalendar] = useState(true);
  const [syncFees, setSyncFees] = useState(false);
  const [syncCustomSubjects, setSyncCustomSubjects] = useState(true);
  const [syncCbtQuestionBanks, setSyncCbtQuestionBanks] = useState(true);
  const [syncCbtExams, setSyncCbtExams] = useState(false);

  // Loaded snapshot data
  const [snapshot, setSnapshot] = useState<any>(null);

  // In-flight editable fields for Branding
  const [editSchoolName, setEditSchoolName] = useState('');
  const [editMotto, setEditMotto] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editPrimaryColor, setEditPrimaryColor] = useState('#0B3D2E');
  const [editAccentColor, setEditAccentColor] = useState('#D4AF37');

  // In-flight editable fields for Calendar
  const [editSession, setEditSession] = useState('2026/2027');
  const [editTerm, setEditTerm] = useState('First Term');

  useEffect(() => {
    if (isOpen) {
      loadSnapshot();
    } else {
      setImpactResult(null);
    }
  }, [isOpen]);

  const loadSnapshot = async () => {
    setLoading(true);
    setImpactResult(null);
    try {
      const api = (window as any).electronAPI?.webSync;
      if (!api?.getPackage) {
        throw new Error('Web Sync bridge not available in preload.');
      }
      const res = await api.getPackage();
      if (res.ok && res.modules) {
        setSnapshot(res);
        const b = res.modules.branding || {};
        setEditSchoolName(b.schoolName || '');
        setEditMotto(b.motto || '');
        setEditPhone(b.phone || '');
        setEditEmail(b.email || '');
        setEditAddress(b.address || '');
        if (b.primaryColor) setEditPrimaryColor(b.primaryColor);
        if (b.accentColor) setEditAccentColor(b.accentColor);

        const cal = res.modules.calendar || {};
        if (cal.academicSession) setEditSession(cal.academicSession);
        if (cal.term) setEditTerm(cal.term);
      }
    } catch (err: any) {
      console.error('Failed to load sync package:', err);
    } finally {
      setLoading(false);
    }
  };

  const buildActivePayload = () => {
    const activeModules: Record<string, any> = {};

    if (syncClasses && snapshot?.modules?.classes) {
      activeModules.classes = snapshot.modules.classes;
    }

    if (syncBranding) {
      activeModules.branding = {
        schoolName: editSchoolName.trim(),
        motto: editMotto.trim(),
        phone: editPhone.trim(),
        email: editEmail.trim(),
        address: editAddress.trim(),
        primaryColor: editPrimaryColor,
        accentColor: editAccentColor,
      };
    }

    if (syncCalendar) {
      activeModules.calendar = {
        academicSession: editSession.trim(),
        term: editTerm.trim(),
      };
    }

    if (syncFees && snapshot?.modules?.fees) {
      activeModules.fees = snapshot.modules.fees;
    }

    if (syncCustomSubjects && snapshot?.modules?.customSubjects) {
      activeModules.customSubjects = snapshot.modules.customSubjects;
    }

    if (syncCbtExams && snapshot?.modules?.cbtExams) {
      activeModules.cbtExams = snapshot.modules.cbtExams;
    }

    if (syncCbtQuestionBanks && snapshot?.modules?.cbtQuestionBanks) {
      activeModules.cbtQuestionBanks = snapshot.modules.cbtQuestionBanks;
    }

    return {
      schoolCloudId: snapshot?.schoolCloudId,
      modules: activeModules,
    };
  };

  // Run dry-run impact analysis
  const handleTestImpact = async () => {
    setTestingImpact(true);
    setImpactResult(null);
    try {
      const api = (window as any).electronAPI?.webSync;
      const payload = buildActivePayload();
      const res = await api.dryRun(payload);
      if (res.ok) {
        setImpactResult(res.impact);
      } else {
        const Swal = (window as any).Swal;
        if (Swal) {
          Swal.fire({
            title: 'Impact Test Failed',
            text: res.error || 'Failed to communicate with school website.',
            icon: 'error',
            confirmButtonColor: '#0ea5e9',
          });
        }
      }
    } catch (err: any) {
      console.error('Dry-run impact test error:', err);
    } finally {
      setTestingImpact(false);
    }
  };

  // Confirm and live push
  const handleConfirmPush = async () => {
    const Swal = (window as any).Swal;
    if (Swal) {
      const confirm = await Swal.fire({
        title: 'Publish to Live Web Portal?',
        html: `This will dispatch your vetted data to <strong>${snapshot?.websiteUrl || 'your website'}</strong>.`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Yes, Publish Data',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#10b981',
      });
      if (!confirm.isConfirmed) return;
    }

    setSyncing(true);
    try {
      const api = (window as any).electronAPI?.webSync;
      const payload = buildActivePayload();
      const res = await api.dispatch(payload);
      if (res.ok) {
        if (Swal) {
          await Swal.fire({
            title: 'Synchronization Complete!',
            text: res.message || 'Data published successfully to school website.',
            icon: 'success',
            confirmButtonColor: '#10b981',
          });
        }
        onClose();
        if (onSuccess) onSuccess();
      } else {
        if (Swal) {
          Swal.fire({
            title: 'Sync Failed',
            text: res.error || 'Failed to update school website.',
            icon: 'error',
            confirmButtonColor: '#0ea5e9',
          });
        }
      }
    } catch (err: any) {
      console.error('Sync push error:', err);
    } finally {
      setSyncing(false);
    }
  };

  if (!isOpen) return null;

  const classesCount = snapshot?.modules?.classes?.fullList?.length || 0;
  const hierarchyCount = snapshot?.modules?.classes?.hierarchy?.length || 0;
  const feesCount = snapshot?.modules?.fees?.length || 0;
  const cbtCount = snapshot?.modules?.cbtExams?.length || 0;
  const cbtBanksCount = snapshot?.modules?.cbtQuestionBanks?.length || 0;
  const cbtQuestionsTotal =
    snapshot?.modules?.cbtQuestionBanks?.reduce(
      (acc: number, b: any) =>
        acc + (b.questions?.length || b.questionCount || 0),
      0
    ) || 0;
  const subjectsCount = snapshot?.modules?.customSubjects?.length || 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="🌐 Web Portal Synchronization & Staging"
      subtitle={`Review, preview, and adjust data before publishing to ${snapshot?.websiteUrl || 'school website'}`}
      maxWidth="840px"
      footer={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <button
            onClick={handleTestImpact}
            disabled={testingImpact || syncing || loading}
            style={{
              padding: '9px 18px',
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: '8px',
              border: '1px solid rgba(14, 165, 233, 0.4)',
              background: 'rgba(14, 165, 233, 0.1)',
              color: '#38bdf8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {testingImpact ? '⏳ Checking Impact...' : '🔍 Check Cloud Impact (Dry Run)'}
          </button>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={onClose}
              disabled={syncing}
              style={{
                padding: '9px 18px',
                fontSize: '13px',
                fontWeight: 600,
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                background: 'rgba(255, 255, 255, 0.05)',
                color: 'rgba(255, 255, 255, 0.7)',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>

            <button
              onClick={handleConfirmPush}
              disabled={syncing || testingImpact || loading}
              style={{
                padding: '9px 22px',
                fontSize: '13px',
                fontWeight: 700,
                borderRadius: '8px',
                border: 'none',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#ffffff',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
              }}
            >
              {syncing ? '⏳ Pushing to Website...' : '🚀 Confirm & Publish'}
            </button>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', color: '#e2e8f0', fontSize: '13px' }}>
        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }}>
          {[
            { id: 'overview', label: '📊 Overview & Modules' },
            { id: 'classes', label: `🏫 Classes (${classesCount})` },
            { id: 'branding', label: '🎨 Profile & Branding' },
            { id: 'calendar', label: '📅 Calendar' },
            { id: 'fees', label: `💳 Fees (${feesCount})` },
            { id: 'cbt', label: `🧠 CBT (${cbtBanksCount > 0 ? `${cbtBanksCount} Banks` : `${cbtCount} Exams`})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: activeTab === tab.id ? 700 : 500,
                borderRadius: '6px',
                border: 'none',
                background: activeTab === tab.id ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                color: activeTab === tab.id ? '#38bdf8' : 'rgba(255,255,255,0.6)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Live Dry-Run Impact Banner */}
        {impactResult && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '10px',
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              fontSize: '12px',
            }}
          >
            <strong style={{ color: '#34d399', display: 'block', marginBottom: '4px' }}>
              ✓ Cloud Impact Analysis (Dry Run Verified)
            </strong>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', color: '#e2e8f0' }}>
              {impactResult.classes && (
                <span>
                  Classes: <strong>{impactResult.classes.incomingCount}</strong> incoming (
                  {impactResult.classes.obsoleteConfigsCount} obsolete configs will be pruned)
                </span>
              )}
              {impactResult.branding && (
                <span>
                  Branding: <strong>{impactResult.branding.fieldsChanged}</strong> field(s) will update
                </span>
              )}
              {impactResult.fees && (
                <span>
                  Fees: <strong>+{impactResult.fees.willAdd}</strong> new,{' '}
                  <strong>~{impactResult.fees.willUpdate}</strong> updated
                </span>
              )}
              {impactResult.customSubjects && (
                <span>
                  Subjects: <strong>+{impactResult.customSubjects.willAdd}</strong> new
                </span>
              )}
              {impactResult.cbtExams && (
                <span>
                  Exams: <strong>+{impactResult.cbtExams.willAdd}</strong> new,{' '}
                  <strong>~{impactResult.cbtExams.willUpdate}</strong> updated
                </span>
              )}
              {impactResult.cbtQuestionBanks && (
                <span>
                  Banks: <strong>+{impactResult.cbtQuestionBanks.banksWillAdd}</strong> new,{' '}
                  <strong>~{impactResult.cbtQuestionBanks.banksWillUpdate}</strong> updated ({impactResult.cbtQuestionBanks.totalIncomingQuestions} Qs)
                </span>
              )}
            </div>
          </div>
        )}

        {/* TAB 1: OVERVIEW & MODULE CHECKBOXES */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '10px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>
                Target School Website Linkage
              </span>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                <span style={{ fontFamily: 'monospace', fontSize: '13px', color: '#38bdf8' }}>
                  {snapshot?.websiteUrl || 'http://localhost:3005'}
                </span>
                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '12px', background: 'rgba(16,185,129,0.15)', color: '#34d399' }}>
                  License: {snapshot?.schoolCloudId || 'Linked'}
                </span>
              </div>
            </div>

            <span style={{ fontSize: '12px', fontWeight: 700, marginTop: '6px' }}>
              Select Modules to Synchronize:
            </span>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '10px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)' }}>
                <input type="checkbox" checked={syncClasses} onChange={(e) => setSyncClasses(e.target.checked)} />
                <div>
                  <strong>Classes &amp; Arms</strong>
                  <span style={{ display: 'block', fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
                    {classesCount} classes in {hierarchyCount} hierarchy levels
                  </span>
                </div>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '10px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)' }}>
                <input type="checkbox" checked={syncBranding} onChange={(e) => setSyncBranding(e.target.checked)} />
                <div>
                  <strong>Profile &amp; Branding</strong>
                  <span style={{ display: 'block', fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
                    Motto, contact hotline, campus address, colors
                  </span>
                </div>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '10px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)' }}>
                <input type="checkbox" checked={syncCalendar} onChange={(e) => setSyncCalendar(e.target.checked)} />
                <div>
                  <strong>Academic Calendar</strong>
                  <span style={{ display: 'block', fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
                    Active session ({editSession}) &amp; {editTerm}
                  </span>
                </div>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '10px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)' }}>
                <input type="checkbox" checked={syncFees} onChange={(e) => setSyncFees(e.target.checked)} />
                <div>
                  <strong>Acceptance Fee Schedules</strong>
                  <span style={{ display: 'block', fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
                    {feesCount} itemized fee structures across classes
                  </span>
                </div>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '10px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)' }}>
                <input type="checkbox" checked={syncCustomSubjects} onChange={(e) => setSyncCustomSubjects(e.target.checked)} />
                <div>
                  <strong>Custom School Subjects</strong>
                  <span style={{ display: 'block', fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
                    {subjectsCount} school-specific subjects
                  </span>
                </div>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '10px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)' }}>
                <input type="checkbox" checked={syncCbtQuestionBanks} onChange={(e) => setSyncCbtQuestionBanks(e.target.checked)} />
                <div>
                  <strong>CBT Question Banks &amp; Library</strong>
                  <span style={{ display: 'block', fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
                    {cbtBanksCount} banks ({cbtQuestionsTotal} questions) for cloud scheduling
                  </span>
                </div>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '10px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)' }}>
                <input type="checkbox" checked={syncCbtExams} onChange={(e) => setSyncCbtExams(e.target.checked)} />
                <div>
                  <strong>Deployed Entrance Exams</strong>
                  <span style={{ display: 'block', fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
                    {cbtCount} deployed exam templates
                  </span>
                </div>
              </label>
            </div>
          </div>
        )}

        {/* TAB 2: CLASSES & ARMS */}
        {activeTab === 'classes' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '380px', overflowY: 'auto' }}>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
              These classes will replace the classes on your website portal. Applicants will select from these exact arms.
            </p>
            {snapshot?.modules?.classes?.hierarchy?.map((h: any, idx: number) => (
              <div
                key={idx}
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#38bdf8' }}>
                  <span>{h.hierarchyClass}</span>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
                    {h.arms?.length || 0} Arms · Max {h.maxSubjects || 10} Subjects
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                  {h.arms && h.arms.length > 0 ? (
                    h.arms.map((arm: string, i: number) => (
                      <span
                        key={i}
                        style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: 'rgba(255,255,255,0.08)',
                          color: '#e2e8f0',
                        }}
                      >
                        {arm}
                      </span>
                    ))
                  ) : (
                    <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>
                      No arms (single cohort class)
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB 3: BRANDING & CONTACT (IN-FLIGHT EDITABLE) */}
        {activeTab === 'branding' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>
                School Official Name
              </label>
              <input
                type="text"
                value={editSchoolName}
                onChange={(e) => setEditSchoolName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: '#fff',
                  fontSize: '12px',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>
                Institutional Tagline / Motto
              </label>
              <input
                type="text"
                value={editMotto}
                onChange={(e) => setEditMotto(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: '#fff',
                  fontSize: '12px',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>
                Admissions Public Phone
              </label>
              <input
                type="text"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="080-ADMISSIONS"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: '#fff',
                  fontSize: '12px',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>
                Admissions Public Email
              </label>
              <input
                type="text"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="admissions@school.edu.ng"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: '#fff',
                  fontSize: '12px',
                }}
              />
            </div>

            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>
                Campus Address
              </label>
              <input
                type="text"
                value={editAddress}
                onChange={(e) => setEditAddress(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: '#fff',
                  fontSize: '12px',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>
                Primary Brand Color
              </label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="color"
                  value={editPrimaryColor}
                  onChange={(e) => setEditPrimaryColor(e.target.value)}
                  style={{ width: '36px', height: '36px', borderRadius: '6px', border: 'none', cursor: 'pointer' }}
                />
                <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{editPrimaryColor}</span>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>
                Accent Brand Color
              </label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="color"
                  value={editAccentColor}
                  onChange={(e) => setEditAccentColor(e.target.value)}
                  style={{ width: '36px', height: '36px', borderRadius: '6px', border: 'none', cursor: 'pointer' }}
                />
                <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{editAccentColor}</span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: CALENDAR & SESSION */}
        {activeTab === 'calendar' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>
                Target Academic Session
              </label>
              <input
                type="text"
                value={editSession}
                onChange={(e) => setEditSession(e.target.value)}
                placeholder="2026/2027"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: '#fff',
                  fontSize: '12px',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>
                Active Term
              </label>
              <select
                value={editTerm}
                onChange={(e) => setEditTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: '#0d1235',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: '#fff',
                  fontSize: '12px',
                }}
              >
                <option value="First Term">First Term</option>
                <option value="Second Term">Second Term</option>
                <option value="Third Term">Third Term</option>
              </select>
            </div>
          </div>
        )}

        {/* TAB 5: ACCEPTANCE FEES */}
        {activeTab === 'fees' && (
          <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
            {feesCount === 0 ? (
              <p style={{ color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>No fee structures configured in SQLite.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left', color: 'rgba(255,255,255,0.5)' }}>
                    <th style={{ padding: '6px 8px' }}>Class</th>
                    <th style={{ padding: '6px 8px' }}>Item Name</th>
                    <th style={{ padding: '6px 8px' }}>Amount</th>
                    <th style={{ padding: '6px 8px' }}>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot?.modules?.fees?.map((f: any, idx: number) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 600 }}>{f.className}</td>
                      <td style={{ padding: '6px 8px' }}>{f.itemName}</td>
                      <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: '#34d399' }}>
                        ₦{Number(f.amount || 0).toLocaleString()}
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: f.isOptional ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)', color: f.isOptional ? '#fbbf24' : '#34d399' }}>
                          {f.isOptional ? 'Optional' : 'Mandatory'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* TAB 6: CBT QUESTION BANKS & EXAMS */}
        {activeTab === 'cbt' && (
          <div style={{ maxHeight: '380px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Section 1: Question Banks (For Cloud Authoring & Deployment) */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div>
                  <strong style={{ fontSize: '13px', color: '#fff' }}>Question Banks ({cbtBanksCount})</strong>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginTop: '2px' }}>
                    Author offline in Question Studio. Synced banks can be scheduled directly on the school website without pre-existing student rosters.
                  </span>
                </div>
                {cbtBanksCount > 0 && (
                  <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '6px', background: 'rgba(56,189,248,0.15)', color: '#38bdf8', fontWeight: 600, flexShrink: 0 }}>
                    {cbtQuestionsTotal} Total Questions
                  </span>
                )}
              </div>

              {cbtBanksCount === 0 ? (
                <div style={{ padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px dashed rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)', fontStyle: 'italic', fontSize: '12px' }}>
                  No question banks found in local CBT repository. Create question banks in CBT Arena &gt; Question Studio to stage them here.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {snapshot?.modules?.cbtQuestionBanks?.map((bank: any, bIdx: number) => (
                    <div
                      key={bIdx}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '8px',
                        background: 'rgba(56,189,248,0.03)',
                        border: '1px solid rgba(56,189,248,0.15)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0, marginRight: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <strong style={{ color: '#fff', fontSize: '13px' }}>{bank.name}</strong>
                          <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(56,189,248,0.15)', color: '#38bdf8', fontWeight: 600 }}>
                            {bank.subject}
                          </span>
                          <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}>
                            {bank.classCategory}
                          </span>
                        </div>
                        {bank.description && (
                          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginTop: '3px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            {bank.description}
                          </div>
                        )}
                      </div>
                      <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', background: 'rgba(16,185,129,0.15)', color: '#34d399', fontWeight: 700, flexShrink: 0 }}>
                        {bank.questions?.length || bank.questionCount || 0} Qs
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Section 2: Deployed Exam Templates */}
            {cbtCount > 0 && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '14px' }}>
                <strong style={{ fontSize: '13px', color: '#fff', display: 'block', marginBottom: '8px' }}>
                  Deployed Exam Schedules ({cbtCount})
                </strong>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {snapshot?.modules?.cbtExams?.map((exam: any, idx: number) => {
                    const targetList = Array.isArray(exam.targetClasses) && exam.targetClasses.length > 0
                      ? exam.targetClasses
                      : (exam.className ? [exam.className] : []);

                    return (
                      <div
                        key={idx}
                        style={{
                          padding: '12px 14px',
                          borderRadius: '8px',
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <strong style={{ color: '#38bdf8', fontSize: '13px' }}>{exam.title}</strong>
                            <span style={{ display: 'block', fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>
                              {exam.durationMinutes} mins · {exam.questionCount} questions · Pass mark: {exam.passMarkPercentage || exam.passPercentage || 50}%
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <span
                              style={{
                                fontSize: '10px',
                                padding: '2px 8px',
                                borderRadius: '6px',
                                background: exam.deliveryMode === 'online' ? 'rgba(56,189,248,0.15)' : 'rgba(16,185,129,0.15)',
                                color: exam.deliveryMode === 'online' ? '#38bdf8' : '#34d399',
                                border: `1px solid ${exam.deliveryMode === 'online' ? 'rgba(56,189,248,0.3)' : 'rgba(16,185,129,0.3)'}`,
                                fontWeight: 'bold',
                                textTransform: 'uppercase',
                              }}
                            >
                              {exam.deliveryMode === 'online' ? '🌐 Online Remote' : '🏢 On-Premises'}
                            </span>
                          </div>
                        </div>

                        {/* Badges & Multi-Class Target */}
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                          {targetList.map((cls: string, cIdx: number) => (
                            <span
                              key={cIdx}
                              style={{
                                fontSize: '10px',
                                padding: '1px 7px',
                                borderRadius: '4px',
                                background: 'rgba(255,255,255,0.08)',
                                color: '#cbd5e1',
                              }}
                            >
                              {cls}
                            </span>
                          ))}

                          {exam.enableProctoring && (
                            <span
                              style={{
                                fontSize: '10px',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                background: 'rgba(239,68,68,0.15)',
                                color: '#f87171',
                                border: '1px solid rgba(239,68,68,0.3)',
                              }}
                            >
                              📹 Surveillance
                            </span>
                          )}

                          {exam.enforceKiosk && (
                            <span
                              style={{
                                fontSize: '10px',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                background: 'rgba(245,158,11,0.15)',
                                color: '#fbbf24',
                                border: '1px solid rgba(245,158,11,0.3)',
                              }}
                            >
                              🔒 Strict Kiosk
                            </span>
                          )}

                          {exam.calculatorType && exam.calculatorType !== 'none' && (
                            <span
                              style={{
                                fontSize: '10px',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                background: 'rgba(168,85,247,0.15)',
                                color: '#c084fc',
                                border: '1px solid rgba(168,85,247,0.3)',
                              }}
                            >
                              🧮 {exam.calculatorType === 'scientific' ? 'Scientific Calc' : 'Basic Calc'}
                            </span>
                          )}

                          {exam.isPromotional && (
                            <span
                              style={{
                                fontSize: '10px',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                background: 'rgba(99,102,241,0.15)',
                                color: '#818cf8',
                                border: '1px solid rgba(99,102,241,0.3)',
                              }}
                            >
                              🎓 Promotional
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
