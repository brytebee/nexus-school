import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLicense } from '../hooks/useLicense';
import { useClassArms } from '../hooks/useClassArms';
import { Combobox } from '../components/Combobox';

// ── Interfaces ────────────────────────────────────────────────────────────────
interface RosterRow {
  student_id: string;
  name: string;
  class_name: string;
  total_billed: number;
  total_paid: number;
  balance: number;
  status: 'cleared' | 'partial' | 'unpaid';
  next_due_date: string;
}
interface FeeStructureItem {
  id: number;
  class_name: string;
  item_name: string;
  term: string;
  amount: number;
}
interface FeeAdjustment {
  id: number;
  student_id: string;
  student_name: string;
  class_name: string;
  adjustment_type: string;
  description: string;
  amount: number;
  approved_by: string;
  created_at: string;
}
interface Receipt {
  id: number;
  student_id: string;
  student_name: string;
  class_name: string;
  submitted_via: string;
  extracted_amount: number;
  extracted_reference: string;
  extracted_payer_name: string;
  name_match_score: number | null;
  created_at: string;
  file_type: string;
  file_data_b64: string;
  pdf_raw_text: string | null;
  term: string;
  academic_session: string;
}
interface BankAccount   { id?: number; bank: string; number: string; name: string; paystack_verified?: boolean; bank_code?: string | null; subaccount_code?: string | null; }
interface InstallPlan   { label: string; percent: number; }

// ── Helpers ───────────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  cleared: { label: 'Cleared', color: '#4CAF50', bg: 'rgba(76,175,80,0.12)'  },
  partial:  { label: 'Partial', color: '#FFC107', bg: 'rgba(255,193,7,0.12)'  },
  unpaid:   { label: 'Unpaid',  color: '#FF5252', bg: 'rgba(255,82,82,0.12)'  },
};
const PAY_LABELS: Record<string, string> = {
  cash: '💵 Cash', transfer: '🏦 Transfer', pos: '💳 POS', bank_teller: '🧾 Bank Teller',
};
const ADJ_EMOJI: Record<string, string> = {
  scholarship:'🎓', waiver:'✋', owner_grant:'🏫', bursary:'💼', discount:'🏷️',
};
const fmt = (n: number | null | undefined) =>
  Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 0 });
const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};
const PAGE_SIZE = 15;

// ── Label helper (V1 ph-label) ────────────────────────────────────────────────
const Lbl: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <label className="ph-label">{children}</label>
);

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

// PaystackBankSelect helper component
function PaystackBankSelect({ value, onChange }: { value: string; onChange: (name: string, code: string) => void }) {
  const [banks, setBanks] = useState<{ name: string; code: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchBanks = async () => {
      if (!window.electronAPI?.fees?.getBanks) return;
      setLoading(true);
      try {
        const res = await window.electronAPI.fees.getBanks();
        if (Array.isArray(res)) {
          setBanks(res.map((b: any) => ({ name: b.name, code: b.code })));
        }
      } catch (err) {
        console.error('Failed to load Paystack banks:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchBanks();
  }, []);

  return (
    <select
      value={value}
      onChange={e => {
        const selectedCode = e.target.value;
        const selectedBank = banks.find(b => b.code === selectedCode);
        if (selectedBank) {
          onChange(selectedBank.name, selectedBank.code);
        }
      }}
      className="modern-input"
      style={{ flex: 1.2, fontSize: '11px', padding: '6px 10px', background: 'var(--bg-card)' }}
    >
      <option value="">{loading ? "Loading..." : "Select Bank"}</option>
      {banks.map(b => (
        <option key={b.code} value={b.code}>{b.name}</option>
      ))}
    </select>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FinancialHub
// ═══════════════════════════════════════════════════════════════════════════════
export function FinancialHub() {
  const { license } = useLicense();
  const { fullList, configs } = useClassArms();
  const tier       = license?.tier || 'Silver';
  const isDiamond  = tier === 'Diamond';
  const isGoldPlus = tier === 'Gold' || tier === 'Diamond';
  const Swal       = (window as any).Swal;

  // ── Active tab ────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'roster'|'structure'|'adjustments'|'receipts'|'import'>('roster');

  // ── Session/Term ──────────────────────────────────────────────────────────
  const [sessions,        setSessions]        = useState<string[]>([]);
  const [selectedSession, setSelectedSession] = useState('');
  const [selectedTerm,    setSelectedTerm]    = useState('First Term');
  const [dbSummary, setDbSummary] = useState<{ outstanding: number; cleared: number; partial: number; unpaid: number; total: number } | null>(null);
  const [searchVal, setSearchVal] = useState('');
  const [adjMatchedStudents, setAdjMatchedStudents] = useState<{ id: string; name: string; class_name: string }[]>([]);

  // ── Roster ────────────────────────────────────────────────────────────────
  const [roster,        setRoster]        = useState<RosterRow[]>([]);
  const [totalCount,    setTotalCount]    = useState(0);
  const [rosterPage,    setRosterPage]    = useState(0);
  const [statusFilter,  setStatusFilter]  = useState('all');
  const [searchQuery,   setSearchQuery]   = useState('');
  const [loading,       setLoading]       = useState(false);
  const [pendingEdits,  setPendingEdits]  = useState<Record<string, Partial<RosterRow>>>({});

  // Session/term refs — needed for callbacks that fire after state updates
  const sessionRef = useRef('');
  const termRef    = useRef('First Term');

  // ── Fee Structure ─────────────────────────────────────────────────────────
  const [structClass,   setStructClass]   = useState('');
  const [structTerm,    setStructTerm]    = useState('All Terms');
  const [structItems,   setStructItems]   = useState<FeeStructureItem[]>([]);
  const [loadingStruct, setLoadingStruct] = useState(false);
  const [newName,       setNewName]       = useState('');
  const [newTerm,       setNewTerm]       = useState('All Terms');
  const [newAmount,     setNewAmount]     = useState('');
  const [addingItem,    setAddingItem]    = useState(false);
  const [applyingFs,    setApplyingFs]    = useState(false);

  // ── Adjustments ───────────────────────────────────────────────────────────
  const [adjustments,   setAdjustments]   = useState<FeeAdjustment[]>([]);
  const [loadingAdj,    setLoadingAdj]    = useState(false);
  const [isAdjOpen,     setIsAdjOpen]     = useState(false);
  const [adjClass,      setAdjClass]      = useState('');
  const [adjStudentStr, setAdjStudentStr] = useState('');
  const [adjStudentId,  setAdjStudentId]  = useState('');
  const [adjType,       setAdjType]       = useState('scholarship');
  const [adjAmount,     setAdjAmount]     = useState('');
  const [adjDesc,       setAdjDesc]       = useState('');
  const [applyingAdj,   setApplyingAdj]   = useState(false);

  // ── Receipts ──────────────────────────────────────────────────────────────
  const [receipts,     setReceipts]     = useState<Receipt[]>([]);
  const [receiptBadge, setReceiptBadge] = useState(0);
  const [lightbox,     setLightbox]     = useState<{ type: 'image'|'pdf'; src: string }|null>(null);
  // Approve modal
  const [approveR,       setApproveR]       = useState<Receipt|null>(null);
  const [approveAmt,     setApproveAmt]     = useState('');
  const [approveMethod,  setApproveMethod]  = useState('transfer');
  const [approveRef,     setApproveRef]     = useState('');
  const [approveTerm,    setApproveTerm]    = useState('First Term');
  const [approveSession, setApproveSession] = useState('');
  const [approveNote,    setApproveNote]    = useState('');
  const [approvingR,     setApprovingR]     = useState(false);
  // Reject modal
  const [rejectR,      setRejectR]      = useState<Receipt|null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectingR,   setRejectingR]   = useState(false);

  // ── Record Payment (Diamond) ──────────────────────────────────────────────
  const [payStudent,   setPayStudent]   = useState<{ id: string; name: string }|null>(null);
  const [payAmount,    setPayAmount]    = useState('');
  const [payMethod,    setPayMethod]    = useState('cash');
  const [payRef,       setPayRef]       = useState('');
  const [payNote,      setPayNote]      = useState('');
  const [recordingPay, setRecordingPay] = useState(false);

  // ── Ledger (Diamond) ──────────────────────────────────────────────────────
  const [ledgerStudent, setLedgerStudent] = useState<{ id: string; name: string }|null>(null);
  const [ledgerTx,      setLedgerTx]      = useState<any[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(false);

  // ── Settings panel ────────────────────────────────────────────────────────
  const [settingsOpen,     setSettingsOpen]     = useState(false);
  const [reminder1,        setReminder1]        = useState('');
  const [reminder2,        setReminder2]        = useState('');
  const [bankAccounts,     setBankAccounts]     = useState<BankAccount[]>([{ bank:'',number:'',name:'' }]);
  const [activeBankAccountId, setActiveBankAccountId] = useState<number|null>(null);
  const [installPlans,     setInstallPlans]     = useState<InstallPlan[]>([{ label:'', percent:0 }]);
  const [gateEnabled,      setGateEnabled]      = useState(true);
  const [gateMode,         setGateMode]         = useState<'any'|'fixed'|'percent'>('fixed');
  const [gateThreshold,    setGateThreshold]    = useState('');
  const [shieldEnabled,    setShieldEnabled]    = useState(false);
  const [shieldMode,       setShieldMode]       = useState<'warn'|'watermark'|'block'>('warn');
  const [savingSettings,   setSavingSettings]   = useState(false);

  // ── UI indicator ──────────────────────────────────────────────────────────
  const [indicator,     setIndicator]     = useState<{ text:string; color:string }|null>(null);
  const [dispatchPulse, setDispatchPulse] = useState(false);

  // ── Fee CSV Import state ──────────────────────────────────────────────────
  const [csvImportStatus, setCsvImportStatus] = useState<Record<string, { loading: boolean; result: string | null }>>({
    structure:  { loading: false, result: null },
    payment:    { loading: false, result: null },
    adjustment: { loading: false, result: null },
  });

  const handleFeeCSV = (type: 'structure' | 'payment' | 'adjustment') => {
    const api = (window as any).electronAPI;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = (e: any) => {
      const file = e.target?.files?.[0];
      if (!file) return;
      setCsvImportStatus(prev => ({ ...prev, [type]: { loading: true, result: null } }));

      const listeners: Record<string, string> = {
        structure:  'onFeeStructureCSVLoaded',
        payment:    'onFeePaymentCSVLoaded',
        adjustment: 'onFeeAdjustmentCSVLoaded',
      };
      const senders: Record<string, string> = {
        structure:  'processFeeStructureCSV',
        payment:    'processFeePaymentCSV',
        adjustment: 'processFeeAdjustmentCSV',
      };

      api?.[listeners[type]]?.((res: { count: number; error: string | null }) => {
        const msg = res.error
          ? `❌ Error: ${res.error}`
          : `✅ ${res.count} row${res.count === 1 ? '' : 's'} imported successfully.`;
        setCsvImportStatus(prev => ({ ...prev, [type]: { loading: false, result: msg } }));

        const Swal = (window as any).Swal;
        if (Swal) {
          if (res.error) {
            Swal.fire({
              title: 'Import Failed',
              text: res.error,
              icon: 'error',
              background: '#0b0f19',
              color: '#fff',
              confirmButtonColor: '#ef4444'
            });
          } else {
            Swal.fire({
              title: 'Success!',
              text: `${res.count} row${res.count === 1 ? '' : 's'} imported successfully.`,
              icon: 'success',
              background: '#0b0f19',
              color: '#fff',
              confirmButtonColor: '#00E5FF'
            });
          }
        }

        if (!res.error) {
          doLoadRoster(sessionRef.current, termRef.current, 0, searchQuery, statusFilter);
        }
      });
      api?.[senders[type]]?.(file.path);
    };
    input.click();
  };

  const showIndicator = useCallback((text: string, color = '#4CAF50') => {
    setIndicator({ text, color });
    setTimeout(() => setIndicator(null), 2500);
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // MOUNT — replicate feesInit exactly
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    // 1. Build session list
    const year = new Date().getFullYear();
    const list: string[] = [];
    for (let y = year; y >= year - 2; y--) list.push(`${y-1}/${y}`);
    setSessions(list);

    const boot = async () => {
      if (!window.electronAPI) return;
      try {
        // 2. Load classes configuration (handled by useClassArms hook)
        if (fullList.length > 0) {
          setStructClass(fullList[0]);
        } else {
          setStructClass('JSS 1');
        }



        // 4. Resolve term config — exact V1 feesInit pattern
        const config = await window.electronAPI.getTermConfig();
        let initSession = list[0] || '';
        let initTerm    = 'First Term';
        if (config?.academic_session) initSession = config.academic_session;
        if (config?.term)             initTerm    = config.term;

        setSelectedSession(initSession);
        setSelectedTerm(initTerm);
        sessionRef.current = initSession;
        termRef.current    = initTerm;

        // 5. Receipt badge
        try {
          const cnt = await window.electronAPI.receipts?.getCount?.();
          if (cnt?.ok) setReceiptBadge(cnt.count || 0);
        } catch (_) {}

        // 6. Auto-load roster — exact V1 _loadRoster call
        await doLoadRoster(initSession, initTerm, 0, '', 'all');
      } catch (err) {
        console.error('[FinancialHub] boot error:', err);
      }
    };

    boot();

    // 7. Real-time receipt push
    try {
      window.electronAPI?.receipts?.onNew?.((d: any) => {
        setReceiptBadge(d.count);
        showIndicator(`📄 New receipt from ${d.studentName}'s parent`, '#00E5FF');
      });
    } catch (_) {}

    // 8. Badge polling (30 s)
    const poll = setInterval(async () => {
      try {
        const r = await window.electronAPI?.receipts?.getCount?.();
        if (r?.ok) setReceiptBadge(r.count || 0);
      } catch (_) {}
    }, 30000);

    return () => clearInterval(poll);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!structClass && fullList.length > 0) {
      setStructClass(fullList[0]);
    }
  }, [fullList, structClass]);

  const handleCopyToAllArms = async () => {
    if (!structClass || !configs || !structItems.length) return;
    const { class_name } = splitClass(structClass, configs);
    const conf = configs.find(c => c.hierarchy_class === class_name);
    if (!conf) {
      if (Swal) {
        Swal.fire({
          title: 'Error',
          text: 'Class configuration not found.',
          icon: 'error',
          background: '#0b0f19',
          color: '#fff',
          confirmButtonColor: '#ef4444'
        });
      } else alert('Class configuration not found.');
      return;
    }
    const otherArms = (conf.arms || [])
      .map(arm => `${class_name} ${arm}`)
      .filter(armClass => armClass !== structClass);

    if (otherArms.length === 0) {
      if (Swal) {
        Swal.fire({
          title: 'Info',
          text: `No other arms found for class level "${class_name}".`,
          icon: 'info',
          background: '#0b0f19',
          color: '#fff',
          confirmButtonColor: '#00E5FF'
        });
      } else alert(`No other arms found for class level "${class_name}".`);
      return;
    }

    const ok = Swal
      ? (await Swal.fire({
          title: 'Copy Fee Structure?',
          text: `Copy all ${structItems.length} fee items from "${structClass}" to other arms: ${otherArms.join(', ')}? This will overwrite existing items on those arms with the same name.`,
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Yes, copy',
          confirmButtonColor: '#f59e0b',
          background: '#0b0f19',
          color: '#fff'
        })).isConfirmed
      : confirm(`Copy fee items from ${structClass} to: ${otherArms.join(', ')}?`);

    if (!ok) return;

    setLoadingStruct(true);
    try {
      for (const targetClass of otherArms) {
        for (const item of structItems) {
          await window.electronAPI.feeStructure.upsertItem({
            className: targetClass,
            itemName: item.item_name,
            term: item.term,
            amount: item.amount
          });
        }
      }
      if (Swal) {
        Swal.fire({
          title: 'Success',
          text: `Successfully copied fee structure to: ${otherArms.join(', ')}`,
          icon: 'success',
          background: '#0b0f19',
          color: '#fff',
          confirmButtonColor: '#00E5FF'
        });
      } else alert(`Successfully copied fee structure to: ${otherArms.join(', ')}`);
    } catch (err) {
      console.error('Failed to copy fee structure:', err);
      if (Swal) {
        Swal.fire({
          title: 'Error',
          text: 'An error occurred while copying fee structure.',
          icon: 'error',
          background: '#0b0f19',
          color: '#fff',
          confirmButtonColor: '#ef4444'
        });
      } else alert('An error occurred while copying fee structure.');
    } finally {
      setLoadingStruct(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // ROSTER LOAD
  // ═══════════════════════════════════════════════════════════════════════════
  const doLoadRoster = async (
    session: string, term: string, page: number, search: string, _filter: string
  ) => {
    if (!session || !term) {
      console.warn('[FinancialHub] doLoadRoster: missing session or term', { session, term });
      return;
    }
    if (!window.electronAPI?.fees?.getRoster) {
      console.error('[FinancialHub] fees.getRoster not available on window.electronAPI');
      return;
    }
    setLoading(true);
    setPendingEdits({});
    try {
      const res = await window.electronAPI.fees.getRoster({
        academic_session: session,
        term,
        limit:  PAGE_SIZE,
        offset: page * PAGE_SIZE,
        search: search || '',
      });
      if (res?.ok) {
        setRoster(res.data  || []);
        setTotalCount(res.total || 0);
      } else {
        console.error('[FinancialHub] getRoster error:', res?.error);
      }
      // Also load summary stats
      await loadDbSummary(session, term, search);
    } catch (err) {
      console.error('[FinancialHub] getRoster threw:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadDbSummary = async (session: string, term: string, search: string) => {
    if (!window.electronAPI?.fees?.getSummary) return;
    try {
      const res = await window.electronAPI.fees.getSummary({ academic_session: session, term, search });
      if (res?.ok) {
        setDbSummary(res.data);
      }
    } catch (err) {
      console.error('Error loading db summary:', err);
    }
  };

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const handler = setTimeout(() => {
      setSearchQuery(searchVal);
      setRosterPage(0);
      doLoadRoster(sessionRef.current, termRef.current, 0, searchVal, statusFilter);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchVal]);

  // Load matched students dynamically based on search
  useEffect(() => {
    const searchStudents = async () => {
      if (!adjStudentStr.trim() || !window.electronAPI?.getAllStudents) {
        setAdjMatchedStudents([]);
        return;
      }
      try {
        const res = await window.electronAPI.getAllStudents({
          search: adjStudentStr,
          class_name: adjClass || undefined,
          limit: 10,
          minimal: true
        });
        if (res?.ok) {
          setAdjMatchedStudents(res.data || []);
        }
      } catch (err) {
        console.error('Error searching students for adjustments:', err);
      }
    };

    const handler = setTimeout(searchStudents, 300);
    return () => clearTimeout(handler);
  }, [adjStudentStr, adjClass]);

  const handleLoad = () => {
    sessionRef.current = selectedSession;
    termRef.current    = selectedTerm;
    setRosterPage(0);
    doLoadRoster(selectedSession, selectedTerm, 0, searchQuery, statusFilter);
  };

  const handlePage = (p: number) => {
    setRosterPage(p);
    doLoadRoster(sessionRef.current, termRef.current, p, searchQuery, statusFilter);
  };

  // Inline edit (Gold)
  const handleInlineChange = (sid: string, field: string, val: string) => {
    setPendingEdits(prev => {
      const base = roster.find(r => r.student_id === sid) || { total_billed:0, total_paid:0, next_due_date:'' };
      const cur  = prev[sid] || { total_billed: base.total_billed, total_paid: base.total_paid, next_due_date: base.next_due_date };
      return { ...prev, [sid]: { ...cur, [field]: field === 'next_due_date' ? val : (Number(val) || 0) } };
    });
  };

  const handleSaveAll = async () => {
    const entries = Object.entries(pendingEdits);
    if (!entries.length || !window.electronAPI?.fees?.upsert) return;
    setLoading(true);
    try {
      const results = await Promise.all(
        entries.map(([sid, vals]) =>
          window.electronAPI.fees.upsert({
            student_id: sid,
            academic_session: sessionRef.current,
            term: termRef.current,
            ...vals,
          })
        )
      );
      const failed = results.filter(r => !r?.ok);
      if (failed.length) {
        showIndicator(`⚠️ ${failed.length} save(s) failed`, '#FF5252');
        if (Swal) {
          Swal.fire({
            title: 'Saves Partially Failed',
            text: `${failed.length} of ${entries.length} student updates could not be saved.`,
            icon: 'warning',
            background: '#0b0f19',
            color: '#fff',
            confirmButtonColor: '#ef4444'
          });
        }
      } else {
        showIndicator('✅ All changes saved');
        if (Swal) {
          Swal.fire({
            title: 'Changes Saved',
            text: 'All pending edits to the fee roster have been successfully saved.',
            icon: 'success',
            background: '#0b0f19',
            color: '#fff',
            confirmButtonColor: '#00E5FF'
          });
        }
        setPendingEdits({});
      }
      doLoadRoster(sessionRef.current, termRef.current, rosterPage, searchQuery, statusFilter);
    } catch (err) {
      showIndicator('❌ Error saving changes');
      if (Swal) {
        Swal.fire({
          title: 'Error',
          text: err.message || 'An unexpected error occurred while saving.',
          icon: 'error',
          background: '#0b0f19',
          color: '#fff',
          confirmButtonColor: '#ef4444'
        });
      }
    } finally { setLoading(false); }
  };

  // Database-level filtered stats summary
  const summaryText = dbSummary
    ? statusFilter === 'all'
      ? `${dbSummary.cleared}/${dbSummary.total} cleared · ₦${fmt(dbSummary.outstanding)} outstanding`
      : statusFilter === 'cleared'
        ? `${dbSummary.cleared}/${dbSummary.cleared} cleared · ₦0 outstanding`
        : statusFilter === 'partial'
          ? `0/${dbSummary.partial} cleared · ₦${fmt(dbSummary.outstanding)} outstanding`
          : `0/${dbSummary.unpaid} cleared · ₦${fmt(dbSummary.outstanding)} outstanding`
    : '';

  const unsavedCount = Object.keys(pendingEdits).length;

  // Server-side filtering is handled by getRoster (search + statusFilter params),
  // so filteredRoster is just the roster slice already returned by the backend.
  const filteredRoster = roster;

  // ═══════════════════════════════════════════════════════════════════════════
  // FEE STRUCTURE
  // ═══════════════════════════════════════════════════════════════════════════
  const loadStructure = useCallback(async () => {
    if (!structClass || !window.electronAPI?.feeStructure?.getAll) return;
    setLoadingStruct(true);
    try {
      const data = await window.electronAPI.feeStructure.getAll({ className: structClass });
      setStructItems(data || []);
    } catch (e) { console.error(e); } finally { setLoadingStruct(false); }
  }, [structClass]);

  useEffect(() => { if (activeTab === 'structure') loadStructure(); }, [activeTab, structClass]);

  const handleAddItem = async () => {
    if (!structClass || !newName.trim() || !newAmount) return;
    setAddingItem(true);
    try {
      await window.electronAPI.feeStructure.upsertItem({ className:structClass, itemName:newName.trim(), term:newTerm, amount:Number(newAmount)||0 });
      setNewName(''); setNewAmount('');
      loadStructure();
    } finally { setAddingItem(false); }
  };

  const handleDeleteItem = async (id: number) => {
    const ok = Swal
      ? (await Swal.fire({
          title: 'Delete Fee Item?',
          text: 'Are you sure you want to delete this fee item?',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Yes, Delete',
          confirmButtonColor: '#ef4444',
          background: '#0b0f19',
          color: '#fff'
        })).isConfirmed
      : confirm('Delete this fee item?');
    if (!ok) return;
    try {
      await window.electronAPI.feeStructure?.deleteItem(id);
      loadStructure();
      showIndicator('✅ Fee item deleted');
    } catch (err) {
      if (Swal) {
        Swal.fire({
          title: 'Error',
          text: err.message || 'Failed to delete fee item',
          icon: 'error',
          background: '#0b0f19',
          color: '#fff',
          confirmButtonColor: '#ef4444'
        });
      } else {
        alert(err.message || 'Failed to delete fee item');
      }
    }
  };

  const handleApplyToClass = async () => {
    if (!structClass || !sessionRef.current || !termRef.current) return;
    const term = structTerm === 'All Terms' ? termRef.current : structTerm;
    const ok   = Swal
      ? (await Swal.fire({
          title: 'Apply Fee Structure?',
          text: `Bill ALL students in ${structClass} for ${term}?`,
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Yes, Apply',
          confirmButtonColor: '#f59e0b',
          background: '#0b0f19',
          color: '#fff'
        })).isConfirmed
      : confirm(`Apply to ${structClass}?`);
    if (!ok) return;
    setApplyingFs(true);
    try {
      const res = await window.electronAPI.feeStructure.applyToClass({ className:structClass, academicSession:sessionRef.current, term });
      if (res?.ok) {
        showIndicator(`✅ Billed ₦${fmt(res.totalBilled)} to ${res.count} students`);
        if (Swal) {
          Swal.fire({
            title: 'Billing Applied',
            text: `Successfully billed ₦${fmt(res.totalBilled)} to ${res.count} students.`,
            icon: 'success',
            background: '#0b0f19',
            color: '#fff',
            confirmButtonColor: '#00E5FF'
          });
        }
      } else {
        showIndicator('❌ Billing failed');
        if (Swal) {
          Swal.fire({
            title: 'Billing Failed',
            text: res?.error || 'Failed to apply fee structure.',
            icon: 'error',
            background: '#0b0f19',
            color: '#fff',
            confirmButtonColor: '#ef4444'
          });
        }
      }
    } catch (err) {
      showIndicator('❌ Billing error');
      if (Swal) {
        Swal.fire({
          title: 'Billing Error',
          text: err.message || 'An unexpected error occurred.',
          icon: 'error',
          background: '#0b0f19',
          color: '#fff',
          confirmButtonColor: '#ef4444'
        });
      }
    } finally { setApplyingFs(false); }
  };

  const structFiltered = structItems.filter(i => structTerm === 'All Terms' || i.term === structTerm || i.term === 'All Terms');
  const structTotal    = structFiltered.reduce((s, i) => s + i.amount, 0);

  // ═══════════════════════════════════════════════════════════════════════════
  // ADJUSTMENTS
  // ═══════════════════════════════════════════════════════════════════════════
  const loadAdjustments = useCallback(async () => {
    if (!sessionRef.current || !termRef.current || !window.electronAPI?.feeStructure?.getAdjustments) return;
    setLoadingAdj(true);
    try {
      const data = await window.electronAPI.feeStructure.getAdjustments({ academicSession:sessionRef.current, term:termRef.current });
      setAdjustments(data || []);
    } finally { setLoadingAdj(false); }
  }, []);

  useEffect(() => { if (activeTab === 'adjustments') loadAdjustments(); }, [activeTab]);

  const handleSubmitAdj = async (e: React.FormEvent) => {
    e.preventDefault();
    const sid = adjStudentId || adjStudentStr.split(' ')[0].trim();
    if (!sid || !adjAmount) return;
    setApplyingAdj(true);
    try {
      const res = await window.electronAPI.feeStructure.addAdjustment({
        studentId:sid, academicSession:sessionRef.current, term:termRef.current,
        adjustmentType:adjType, description:adjDesc.trim(), amount:Number(adjAmount)||0,
      });
      if (res?.ok) {
        setIsAdjOpen(false);
        setAdjStudentStr(''); setAdjStudentId(''); setAdjAmount(''); setAdjDesc('');
        showIndicator('✅ Adjustment applied');
        if (Swal) {
          Swal.fire({
            title: 'Adjustment Applied',
            text: 'Fee adjustment has been applied successfully.',
            icon: 'success',
            background: '#0b0f19',
            color: '#fff',
            confirmButtonColor: '#00E5FF'
          });
        }
        loadAdjustments();
      } else {
        showIndicator('❌ Adjustment failed');
        if (Swal) {
          Swal.fire({
            title: 'Adjustment Failed',
            text: res?.error || 'Failed to apply adjustment.',
            icon: 'error',
            background: '#0b0f19',
            color: '#fff',
            confirmButtonColor: '#ef4444'
          });
        }
      }
    } catch (err) {
      showIndicator('❌ Adjustment error');
      if (Swal) {
        Swal.fire({
          title: 'Adjustment Error',
          text: err.message || 'An unexpected error occurred.',
          icon: 'error',
          background: '#0b0f19',
          color: '#fff',
          confirmButtonColor: '#ef4444'
        });
      }
    } finally { setApplyingAdj(false); }
  };

  const handleDeleteAdj = async (id: number) => {
    const ok = Swal
      ? (await Swal.fire({
          title: 'Delete Adjustment?',
          text: "Delete this adjustment? It won't auto-reverse the student's bill.",
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Yes, Delete',
          confirmButtonColor: '#ef4444',
          background: '#0b0f19',
          color: '#fff'
        })).isConfirmed
      : confirm("Delete this adjustment? It won't auto-reverse the student's bill.");
    if (!ok) return;
    try {
      await window.electronAPI.feeStructure?.deleteAdjustment(id);
      showIndicator('✅ Adjustment deleted');
      loadAdjustments();
    } catch (err) {
      if (Swal) {
        Swal.fire({
          title: 'Error',
          text: err.message || 'Failed to delete adjustment.',
          icon: 'error',
          background: '#0b0f19',
          color: '#fff',
          confirmButtonColor: '#ef4444'
        });
      } else {
        alert(err.message || 'Failed to delete adjustment.');
      }
    }
  };



  // ═══════════════════════════════════════════════════════════════════════════
  // RECEIPTS
  // ═══════════════════════════════════════════════════════════════════════════
  const loadReceipts = useCallback(async () => {
    if (!window.electronAPI?.receipts?.getPending) return;
    try {
      const res = await window.electronAPI.receipts.getPending();
      if (res?.ok) { setReceipts(res.data||[]); setReceiptBadge(res.data?.length||0); }
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { if (activeTab === 'receipts') loadReceipts(); }, [activeTab]);

  const openApprove = (r: Receipt) => {
    setApproveR(r);
    setApproveAmt(r.extracted_amount ? String(r.extracted_amount) : '');
    setApproveRef(r.extracted_reference || '');
    setApproveTerm(r.term || termRef.current);
    setApproveSession(r.academic_session || sessionRef.current);
    setApproveNote(''); setApproveMethod('transfer');
  };

  const handleApproveSubmit = async () => {
    if (!approveR || !approveAmt) return;
    const amt = parseFloat(approveAmt);
    if (!amt || isNaN(amt)) {
      if (Swal) {
        Swal.fire({
          title: 'Validation Error',
          text: 'Please enter a valid payment amount.',
          icon: 'error',
          background: '#0b0f19',
          color: '#fff',
          confirmButtonColor: '#00E5FF'
        });
      } else {
        alert('Enter the payment amount.');
      }
      return;
    }
    setApprovingR(true);
    try {
      const res = await window.electronAPI.receipts.approve({ receiptId:approveR.id, amount:amt, method:approveMethod, reference:approveRef.trim(), note:approveNote.trim(), term:approveTerm, session:approveSession });
      if (res?.ok) {
        setApproveR(null);
        showIndicator('✅ Receipt approved & recorded');
        if (Swal) {
          Swal.fire({
            title: 'Receipt Approved',
            text: 'Payment receipt has been approved and transaction recorded successfully.',
            icon: 'success',
            background: '#0b0f19',
            color: '#fff',
            confirmButtonColor: '#00E5FF'
          });
        }
        loadReceipts();
      } else {
        if (Swal) {
          Swal.fire({
            title: 'Approval Failed',
            text: res?.error || 'Unknown error occurred.',
            icon: 'error',
            background: '#0b0f19',
            color: '#fff',
            confirmButtonColor: '#ef4444'
          });
        } else {
          alert('Error: '+(res?.error||'Unknown'));
        }
      }
    } catch (err) {
      if (Swal) {
        Swal.fire({
          title: 'Approval Error',
          text: err.message || 'An unexpected error occurred.',
          icon: 'error',
          background: '#0b0f19',
          color: '#fff',
          confirmButtonColor: '#ef4444'
        });
      } else {
        alert('Error: '+err.message);
      }
    } finally { setApprovingR(false); }
  };

  const handleRejectSubmit = async () => {
    if (!rejectR) return;
    setRejectingR(true);
    try {
      const res = await window.electronAPI.receipts.reject({ receiptId:rejectR.id, reason:rejectReason.trim() });
      if (res?.ok) {
        setRejectR(null); setRejectReason('');
        showIndicator('❌ Receipt rejected');
        if (Swal) {
          Swal.fire({
            title: 'Receipt Rejected',
            text: 'The payment receipt was rejected.',
            icon: 'info',
            background: '#0b0f19',
            color: '#fff',
            confirmButtonColor: '#00E5FF'
          });
        }
        loadReceipts();
      } else {
        if (Swal) {
          Swal.fire({
            title: 'Rejection Failed',
            text: res?.error || 'Unknown error occurred.',
            icon: 'error',
            background: '#0b0f19',
            color: '#fff',
            confirmButtonColor: '#ef4444'
          });
        } else {
          alert('Error: '+(res?.error||'Unknown'));
        }
      }
    } catch (err) {
      if (Swal) {
        Swal.fire({
          title: 'Rejection Error',
          text: err.message || 'An unexpected error occurred.',
          icon: 'error',
          background: '#0b0f19',
          color: '#fff',
          confirmButtonColor: '#ef4444'
        });
      } else {
        alert('Error: '+err.message);
      }
    } finally { setRejectingR(false); }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // SETTINGS PANEL
  // ═══════════════════════════════════════════════════════════════════════════
  const handleOpenSettings = async () => {
    if (!window.electronAPI?.fees?.getSettings) return;
    try {
      const res = await window.electronAPI.fees.getSettings();
      const s   = res?.ok ? (res.data||{}) : {};
      setReminder1(s.reminder_date_1||'');
      setReminder2(s.reminder_date_2||'');
      setBankAccounts(s.bank_accounts?.length ? s.bank_accounts : [{ bank:'',number:'',name:'' }]);
      setActiveBankAccountId(s.active_bank_account_id || null);
      setInstallPlans(s.installment_plans?.length ? s.installment_plans : [{ label:'',percent:0 }]);
      const thresh = Number(s.fee_gate_threshold)||0;
      setGateEnabled(s.fee_gate_enabled !== false);
      setGateMode(thresh===0 && s.fee_gate_mode==='fixed' ? 'any' : (s.fee_gate_mode||'fixed'));
      setGateThreshold(thresh ? String(thresh) : '');
      setShieldEnabled(!!s.fee_shield_enabled);
      setShieldMode(s.fee_shield_mode||'warn');
      setSettingsOpen(true);
    } catch (e) { console.error(e); }
  };

  const handleSaveSettings = async () => {
    if (!window.electronAPI?.fees?.saveSettings) return;

    // Validate bank accounts
    for (const acc of bankAccounts) {
      if (acc.paystack_verified) {
        if (!acc.bank_code || acc.number.length !== 10 || !acc.name || acc.name === 'Resolving...' || acc.name === 'Verification failed') {
          showIndicator('❌ Please resolve all Paystack accounts correctly');
          if (Swal) {
            Swal.fire({
              title: 'Validation Error',
              text: 'Please resolve all Paystack accounts correctly before saving settings.',
              icon: 'error',
              background: '#0b0f19',
              color: '#fff',
              confirmButtonColor: '#ef4444'
            });
          }
          return;
        }
      } else {
        // Manual validation: if any field is touched, all must be valid
        if (acc.bank.trim() || acc.number.trim() || acc.name.trim()) {
          if (!acc.bank.trim() || acc.number.length !== 10 || !acc.name.trim()) {
            showIndicator('❌ Manual accounts must have name, 10-digit number & bank name');
            if (Swal) {
              Swal.fire({
                title: 'Validation Error',
                text: 'Manual settlement accounts must have a name, bank name, and a 10-digit account number.',
                icon: 'error',
                background: '#0b0f19',
                color: '#fff',
                confirmButtonColor: '#ef4444'
              });
            }
            return;
          }
        }
      }
    }

    setSavingSettings(true);
    try {
      const patch: any = {
        reminder_date_1: reminder1,
        reminder_date_2: reminder2,
        bank_accounts:   bankAccounts.filter(a => a.bank.trim() && a.number.trim()),
        active_bank_account_id: activeBankAccountId,
        installment_plans: installPlans.filter(i => i.label.trim() && i.percent > 0),
        fee_gate_enabled:   gateEnabled,
        fee_gate_mode:      gateMode === 'any' ? 'fixed' : gateMode,
        fee_gate_threshold: gateMode === 'any' ? 0 : (Number(gateThreshold)||0),
      };
      if (isDiamond) { patch.fee_shield_enabled = shieldEnabled; patch.fee_shield_mode = shieldMode; }
      const res = await window.electronAPI.fees.saveSettings(patch);
      if (res?.ok) {
        setSettingsOpen(false);
        showIndicator('✅ Settings saved');
        if (Swal) {
          Swal.fire({
            title: 'Settings Saved',
            text: 'Financial settings and settlement bank accounts have been saved successfully.',
            icon: 'success',
            background: '#0b0f19',
            color: '#fff',
            confirmButtonColor: '#00E5FF'
          });
        }
      } else {
        showIndicator(`❌ ${res?.error || 'Failed to save settings'}`);
        if (Swal) {
          Swal.fire({
            title: 'Error Saving Settings',
            text: res?.error || 'Failed to save settings.',
            icon: 'error',
            background: '#0b0f19',
            color: '#fff',
            confirmButtonColor: '#ef4444'
          });
        }
      }
    } catch (err) {
      showIndicator('❌ Save settings error');
      if (Swal) {
        Swal.fire({
          title: 'Error',
          text: err.message || 'An unexpected error occurred.',
          icon: 'error',
          background: '#0b0f19',
          color: '#fff',
          confirmButtonColor: '#ef4444'
        });
      }
    } finally { setSavingSettings(false); }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // DIAMOND: Record Payment
  // ═══════════════════════════════════════════════════════════════════════════
  const handlePaymentSubmit = async () => {
    if (!payStudent || !payAmount || Number(payAmount)<=0) return;
    setRecordingPay(true);
    try {
      const res = await window.electronAPI.fees.recordPayment({
        student_id:payStudent.id, academic_session:sessionRef.current, term:termRef.current,
        amount:Number(payAmount), payment_method:payMethod, reference_number:payRef.trim(), note:payNote.trim(),
      });
      if (res?.ok) {
        setPayStudent(null);
        showIndicator('✅ Payment recorded');
        if (Swal) {
          Swal.fire({
            title: 'Payment Recorded',
            text: `Successfully recorded payment of ₦${fmt(Number(payAmount))} for ${payStudent.name}.`,
            icon: 'success',
            background: '#0b0f19',
            color: '#fff',
            confirmButtonColor: '#00E5FF'
          });
        }
        doLoadRoster(sessionRef.current,termRef.current,rosterPage,searchQuery,statusFilter);
      } else {
        showIndicator('❌ Payment record failed');
        if (Swal) {
          Swal.fire({
            title: 'Recording Failed',
            text: res?.error || 'Failed to record fee payment.',
            icon: 'error',
            background: '#0b0f19',
            color: '#fff',
            confirmButtonColor: '#ef4444'
          });
        }
      }
    } catch (err) {
      showIndicator('❌ Payment recording error');
      if (Swal) {
        Swal.fire({
          title: 'Error',
          text: err.message || 'An unexpected error occurred.',
          icon: 'error',
          background: '#0b0f19',
          color: '#fff',
          confirmButtonColor: '#ef4444'
        });
      }
    } finally { setRecordingPay(false); }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // DIAMOND: Ledger
  // ═══════════════════════════════════════════════════════════════════════════
  const openLedger = async (sid: string, name: string) => {
    setLedgerStudent({ id:sid, name });
    setLedgerTx([]); setLoadingLedger(true);
    try {
      const res = await window.electronAPI.fees.getTransactions({ student_id:sid, academic_session:sessionRef.current, term:termRef.current });
      if (res?.ok) setLedgerTx(res.data||[]);
    } finally { setLoadingLedger(false); }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // FEE PULSE
  // ═══════════════════════════════════════════════════════════════════════════
  const handleTriggerPulse = async () => {
    const ok = Swal
      ? (await Swal.fire({
          title: 'Trigger Fee Reminders?',
          text: 'Send WhatsApp reminders to ALL parents with outstanding balances?',
          icon: 'info',
          showCancelButton: true,
          confirmButtonColor: '#f59e0b',
          confirmButtonText: '🚀 Yes, Send',
          background: '#0b0f19',
          color: '#fff'
        })).isConfirmed
      : confirm('Send outstanding fee reminders?');
    if (!ok) return;
    setDispatchPulse(true);
    window.electronAPI?.send('trigger-fee-reminders');
    window.electronAPI?.on?.('fee-reminders-sent', (data: any) => {
      setDispatchPulse(false);
      if (Swal) {
        Swal.fire({
          title: 'Pulse Dispatched',
          text: `Sent reminders to ${data.count} parents.`,
          icon: 'success',
          background: '#0b0f19',
          color: '#fff',
          confirmButtonColor: '#00E5FF'
        });
      }
    });
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden', position:'relative' }}>

      {/* ── VIEW HEADER (V1 exact) ── */}
      <div className="view-header">
        <div>
          <h2 className="view-title">💳 Financial Hub</h2>
          <p className="view-sub" id="fees-subtitle">
            {isDiamond
              ? 'Full financial ledger — record payments, view transaction history, and enforce Fee Shield.'
              : 'Track student fee balances and automate reminders via Nexus Pulse.'}
          </p>
        </div>
        <div style={{ display:'flex', gap:'10px', alignItems:'center' }}>
          {indicator && (
            <span id="fees-save-indicator" style={{ fontSize:'12px', color:indicator.color, transition:'opacity 0.3s' }}>
              {indicator.text}
            </span>
          )}
          {/* Search input — V1 places it in the view-header via NexusUI.injectSearch */}
          <div style={{ display:'flex', alignItems:'center', gap:'6px', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'8px', padding:'5px 10px', height:'32px' }}>
            <span style={{ fontSize:'13px', color:'var(--text-dim)' }}>🔍</span>
            <input
              type="text"
              value={searchVal}
              onChange={e => setSearchVal(e.target.value)}
              placeholder="Search students by name or ID..."
              style={{ background:'none', border:'none', color:'var(--text-main)', fontSize:'12px', width:'200px', outline:'none' }}
            />
          </div>
          <button
            className="primary-btn"
            onClick={() => (window as any).showModuleSetupGuide?.('fees')}
            style={{ padding:'7px 16px', fontSize:'12px', background:'rgba(0,229,255,0.1)', border:'1px solid rgba(0,229,255,0.3)', color:'#00e5ff', boxShadow:'none' }}
          >
            💡 Setup Guide
          </button>
          {isGoldPlus && (
            <button
              id="btn-trigger-fee-pulse"
              onClick={handleTriggerPulse}
              disabled={dispatchPulse}
              className="primary-btn"
              style={{ padding:'7px 16px', fontSize:'12px', background:'rgba(212,175,55,0.15)', border:'1px solid rgba(212,175,55,0.4)', color:'var(--gold)', boxShadow:'none' }}
            >
              {dispatchPulse ? '⌛ Sending...' : '🚀 Trigger Fee Pulse'}
            </button>
          )}
          <button
            id="btn-fees-settings"
            onClick={handleOpenSettings}
            title="Financial Hub Settings"
            className="small-btn"
            style={{ fontSize:'16px', padding:'6px 10px', background:'rgba(255,255,255,0.06)', borderColor:'var(--glass-border)' }}
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* ── TAB RAIL (V1 exact) ── */}
      <div style={{ display:'flex', gap:'4px', padding:'0 20px', borderBottom:'1px solid var(--glass-border)', flexShrink:0 }}>
        {(['roster','structure','adjustments'] as const).map(tab => {
          const labels = { roster:'📋 Fee Roster', structure:'🏗️ Fee Structure', adjustments:'🎓 Adjustments' };
          return (
            <button
              key={tab}
              id={`fees-tab-btn-${tab}`}
              className={`fees-tab-btn${activeTab===tab?' active':''}`}
              onClick={() => setActiveTab(tab)}
            >
              {labels[tab]}
            </button>
          );
        })}
        <button
          id="fees-tab-btn-receipts"
          className={`fees-tab-btn${activeTab==='receipts'?' active':''}`}
          onClick={() => setActiveTab('receipts')}
          style={{ position:'relative' }}
        >
          📄 Receipts
          {receiptBadge > 0 && (
            <span id="receipts-badge" style={{ display:'inline-block', background:'#ff4444', color:'#fff', borderRadius:'50%', fontSize:'10px', fontWeight:700, padding:'1px 5px', position:'absolute', top:'4px', right:'4px', lineHeight:1.4 }}>
              {receiptBadge}
            </span>
          )}
        </button>
        <button
          id="fees-tab-btn-import"
          className={`fees-tab-btn${activeTab==='import'?' active':''}`}
          onClick={() => setActiveTab('import')}
        >
          📥 Bulk Import
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          TAB PANELS
      ══════════════════════════════════════════════════════════════════════ */}
      <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>

        {/* ══ TAB: FEE ROSTER ══ */}
        {activeTab === 'roster' && (
          <div id="fees-tab-roster" style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>

            {/* Term Context Bar — V1 inline style override of ph-config-strip */}
            <div className="ph-config-strip" style={{ display:'flex', gap:'14px', alignItems:'center', flexWrap:'wrap', padding:'14px 20px', flexShrink:0, background:'transparent', border:'none', borderRadius:0, marginBottom:0 }}>
              <div className="ph-config-group">
                <Lbl>Session</Lbl>
                <select id="fees-session-select" value={selectedSession} onChange={e => { setSelectedSession(e.target.value); sessionRef.current = e.target.value; }}
                  className="modern-input" style={{ width:'130px', fontSize:'12px' }}>
                  {sessions.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="ph-config-group">
                <Lbl>Term</Lbl>
                <select id="fees-term-select" value={selectedTerm} onChange={e => { setSelectedTerm(e.target.value); termRef.current = e.target.value; }}
                  className="modern-input" style={{ width:'140px', fontSize:'12px' }}>
                  <option value="First Term">First Term</option>
                  <option value="Second Term">Second Term</option>
                  <option value="Third Term">Third Term</option>
                </select>
              </div>
              <div className="ph-config-group">
                <Lbl>Filter</Lbl>
                <select id="fees-status-filter" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                  className="modern-input" style={{ width:'130px', fontSize:'12px' }}>
                  <option value="all">All Students</option>
                  <option value="unpaid">Unpaid Only</option>
                  <option value="partial">Partial Only</option>
                  <option value="cleared">Cleared Only</option>
                </select>
              </div>
              <div style={{ marginLeft:'auto', display:'flex', gap:'10px', alignItems:'center' }}>
                <span id="fees-summary-pill" style={{ fontSize:'12px', background:'rgba(0,0,0,0.25)', border:'1px solid var(--glass-border)', borderRadius:'20px', padding:'4px 14px', color:'var(--text-dim)', whiteSpace:'nowrap' }}>
                  {summaryText}
                </span>
                <button id="btn-fees-load" onClick={handleLoad} disabled={loading} className="primary-btn" style={{ padding:'7px 18px', fontSize:'12px' }}>
                  {loading ? '⌛ Loading...' : 'Load'}
                </button>
              </div>
            </div>

            {/* Fee Roster Table — V1 exact */}
            <div className="table-container" style={{ flex:1, overflowY:'auto' }}>
              <table className="data-table" id="fees-table">
                <thead>
                  <tr>
                    <th style={{ width:'32px' }}>#</th>
                    <th>Student Name</th>
                    <th>Class</th>
                    <th style={{ textAlign:'right' }}>Total Billed (₦)</th>
                    <th style={{ textAlign:'right' }}>Amount Paid (₦)</th>
                    <th style={{ textAlign:'right' }}>Balance (₦)</th>
                    <th style={{ textAlign:'center' }}>Status</th>
                    <th style={{ textAlign:'center' }}>Due Date</th>
                    {isDiamond && <th id="fees-th-actions" style={{ textAlign:'center' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody id="fees-tbody">
                  {loading ? (
                    <tr><td colSpan={isDiamond?9:8} style={{ textAlign:'center', padding:'40px', color:'var(--text-dim)' }}>Loading…</td></tr>
                  ) : filteredRoster.length === 0 ? (
                    <tr><td colSpan={isDiamond?9:8} style={{ textAlign:'center', padding:'50px', color:'var(--text-dim)' }}>
                      {roster.length === 0
                        ? <>Select a session and term, then click <strong>Load</strong>.</>
                        : 'No students match the selected filter.'}
                    </td></tr>
                  ) : filteredRoster.map((row, i) => {
                    const pend   = pendingEdits[row.student_id] as any;
                    const billed = pend?.total_billed !== undefined ? pend.total_billed : row.total_billed;
                    const paid   = pend?.total_paid   !== undefined ? pend.total_paid   : row.total_paid;
                    const bal    = (billed as number) - (paid as number);
                    const due    = pend?.next_due_date !== undefined ? pend.next_due_date : row.next_due_date;
                    // Re-derive status from live values (pending edits change it)
                    const st: 'cleared'|'partial'|'unpaid' = bal <= 0 ? 'cleared' : (paid as number) > 0 ? 'partial' : 'unpaid';
                    const sc = STATUS_CONFIG[st];
                    return (
                      <tr key={row.student_id} data-id={row.student_id}>
                        <td style={{ color:'var(--text-dim)', fontSize:'12px' }}>{rosterPage*PAGE_SIZE+i+1}</td>
                        <td style={{ fontWeight:500 }}>{row.name}</td>
                        <td style={{ fontSize:'12px', color:'var(--text-dim)' }}>{row.class_name}</td>
                        {/* Total Billed */}
                        {isDiamond
                          ? <td style={{ textAlign:'right', fontFamily:'var(--font-mono)', fontSize:'13px' }}>₦{fmt(billed)}</td>
                          : <td style={{ textAlign:'right' }}><input type="number" className="fee-inline-input" value={billed as number} min={0} onChange={e => handleInlineChange(row.student_id,'total_billed',e.target.value)} style={{ width:'100%', maxWidth:'110px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'6px', color:'#fff', padding:'4px 8px', textAlign:'right', fontFamily:'var(--font-mono)', fontSize:'12px' }} /></td>}
                        {/* Amount Paid */}
                        {isDiamond
                          ? <td style={{ textAlign:'right', fontFamily:'var(--font-mono)', fontSize:'13px', color:'#4CAF50' }}>₦{fmt(paid)}</td>
                          : <td style={{ textAlign:'right' }}><input type="number" className="fee-inline-input" value={paid as number} min={0} onChange={e => handleInlineChange(row.student_id,'total_paid',e.target.value)} style={{ width:'100%', maxWidth:'110px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'6px', color:'#fff', padding:'4px 8px', textAlign:'right', fontFamily:'var(--font-mono)', fontSize:'12px' }} /></td>}
                        {/* Balance */}
                        <td style={{ textAlign:'right', fontFamily:'var(--font-mono)', fontSize:'13px', color: bal>0 ? '#FF5252' : '#4CAF50' }}>₦{fmt(bal)}</td>
                        {/* Status */}
                        <td style={{ textAlign:'center' }}>
                          <span style={{ display:'inline-block', padding:'3px 10px', borderRadius:'12px', fontSize:'11px', fontWeight:600, background:sc.bg, color:sc.color }}>{sc.label}</span>
                        </td>
                        {/* Due Date */}
                        {isDiamond
                          ? <td style={{ textAlign:'center', fontSize:'12px' }}>{fmtDate(due as string)}</td>
                          : <td style={{ textAlign:'center' }}><input type="date" className="fee-inline-input" value={(due as string)||''} onChange={e => handleInlineChange(row.student_id,'next_due_date',e.target.value)} style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'6px', color:'#fff', padding:'4px 8px', fontSize:'11px', fontFamily:'var(--font-mono)' }} /></td>}
                        {/* Diamond actions */}
                        {isDiamond && (
                          <td style={{ textAlign:'center', whiteSpace:'nowrap' }}>
                            <button onClick={() => { setPayStudent({id:row.student_id,name:row.name}); setPayAmount(''); setPayRef(''); setPayNote(''); setPayMethod('cash'); }} className="small-btn btn-record-payment" style={{ fontSize:'11px', padding:'4px 10px', marginRight:'4px', background:'rgba(0,229,255,0.08)', color:'var(--accent)', borderColor:'rgba(0,229,255,0.3)' }}>+Pay</button>
                            <button onClick={() => openLedger(row.student_id, row.name)} className="small-btn btn-view-ledger" style={{ fontSize:'11px', padding:'4px 10px', background:'rgba(255,255,255,0.05)', color:'var(--text-dim)', borderColor:'var(--glass-border)' }}>Ledger</button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Gold: Save bar / Pagination — V1: hidden when no edits, pagination inside */}
            <div id="fees-save-bar" style={{ display: unsavedCount>0 ? 'flex' : totalCount>PAGE_SIZE ? 'flex' : 'none', padding:'14px 20px', borderTop:'1px solid var(--glass-border)', background:'rgba(0,0,0,0.2)', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
              {unsavedCount > 0 ? (
                <>
                  <span id="fees-pending-count" style={{ fontSize:'12px', color:'var(--text-dim)' }}>{unsavedCount} unsaved change{unsavedCount!==1?'s':''}</span>
                  <div style={{ display:'flex', gap:'10px' }}>
                    <button id="btn-fees-discard" className="secondary-btn" style={{ fontSize:'12px', padding:'7px 16px' }}
                      onClick={() => { setPendingEdits({}); doLoadRoster(sessionRef.current,termRef.current,rosterPage,searchQuery,statusFilter); }}>
                      Discard
                    </button>
                    <button id="btn-fees-save-all" onClick={handleSaveAll} className="primary-btn" style={{ fontSize:'12px', padding:'7px 18px', background:'linear-gradient(135deg,#b8860b,#ffd700)', color:'#000', border:'none', boxShadow:'none' }}>
                      💾 Save All
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span style={{ fontSize:'12px', color:'var(--text-dim)' }}>
                    {totalCount > 0 ? `Showing ${rosterPage*PAGE_SIZE+1}–${Math.min((rosterPage+1)*PAGE_SIZE,totalCount)} of ${totalCount} students` : ''}
                  </span>
                  <div id="fees-pagination" style={{ display:'flex', gap:'8px' }}>
                    <button className="small-btn" style={{ fontSize:'12px' }} disabled={rosterPage===0} onClick={() => handlePage(rosterPage-1)}>← Prev</button>
                    <button className="small-btn" style={{ fontSize:'12px' }} disabled={(rosterPage+1)*PAGE_SIZE>=totalCount} onClick={() => handlePage(rosterPage+1)}>Next →</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ══ TAB: FEE STRUCTURE ══ */}
        {activeTab === 'structure' && (
          <div id="fees-tab-structure" style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
            {/* Filter strip */}
            <div style={{ display:'flex', gap:'12px', alignItems:'center', padding:'16px 20px', borderBottom:'1px solid var(--glass-border)', flexShrink:0, flexWrap:'wrap' }}>
              <div className="ph-config-group">
                <Lbl>Class</Lbl>
                <Combobox
                  options={fullList}
                  value={structClass}
                  onChange={setStructClass}
                  style={{ width:'160px' }}
                />
              </div>
              <div className="ph-config-group">
                <Lbl>Applies To</Lbl>
                <select id="fs-term-filter" value={structTerm} onChange={e => setStructTerm(e.target.value)} className="modern-input" style={{ width:'140px', fontSize:'12px' }}>
                  <option value="All Terms">All Terms</option>
                  <option value="First Term">First Term</option>
                  <option value="Second Term">Second Term</option>
                  <option value="Third Term">Third Term</option>
                </select>
              </div>
              <div style={{ marginLeft:'auto', display:'flex', gap:'8px' }}>
                <button
                  id="btn-fs-copy-arms"
                  onClick={handleCopyToAllArms}
                  disabled={loadingStruct || !structClass || !structItems.length}
                  className="primary-btn"
                  style={{ padding:'7px 16px', fontSize:'12px', background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.15)' }}
                >
                  📋 Copy to all arms of {splitClass(structClass, configs).class_name}
                </button>
                <button id="btn-fs-load" onClick={loadStructure} disabled={loadingStruct} className="primary-btn" style={{ padding:'7px 16px', fontSize:'12px' }}>
                  {loadingStruct ? '⌛' : 'Load'}
                </button>
                <button id="btn-fs-apply" onClick={handleApplyToClass} disabled={applyingFs} className="primary-btn" style={{ padding:'7px 16px', fontSize:'12px', background:'linear-gradient(135deg,#1A237E,#00E5FF)', border:'none' }}>
                  {applyingFs ? '⌛ Applying...' : '⚡ Apply to Class'}
                </button>
              </div>
            </div>
            {/* Table */}
            <div className="table-container" style={{ flex:1, overflowY:'auto' }}>
              <table className="data-table" id="fs-table">
                <thead><tr>
                  <th>Fee Item</th>
                  <th style={{ width:'160px' }}>Applies To</th>
                  <th style={{ textAlign:'right', width:'140px' }}>Amount (₦)</th>
                  <th style={{ width:'80px', textAlign:'center' }}>Action</th>
                </tr></thead>
                <tbody id="fs-tbody">
                  {loadingStruct ? (
                    <tr><td colSpan={4} style={{ textAlign:'center', padding:'30px', color:'var(--text-dim)' }}>Loading...</td></tr>
                  ) : structItems.length === 0 ? (
                    <tr><td colSpan={4} style={{ textAlign:'center', padding:'40px', color:'var(--text-dim)' }}>Select a class and click Load.</td></tr>
                  ) : structItems.map(item => (
                    <tr key={item.id}>
                      <td style={{ fontWeight:500 }}>{item.item_name}</td>
                      <td style={{ fontSize:'12px', color:'var(--text-dim)' }}>{item.term}</td>
                      <td style={{ textAlign:'right', fontFamily:'var(--font-mono)', fontSize:'13px' }}>₦{fmt(item.amount)}</td>
                      <td style={{ textAlign:'center' }}>
                        <button className="small-btn btn-fs-del" onClick={() => handleDeleteItem(item.id)} style={{ color:'#ff6b6b', borderColor:'rgba(255,107,107,0.2)' }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td style={{ padding:'10px 12px' }}><input type="text" id="fs-new-name" placeholder="e.g. Tuition Fee" value={newName} onChange={e => setNewName(e.target.value)} className="modern-input" style={{ width:'100%', fontSize:'12px' }} /></td>
                    <td style={{ padding:'10px 12px' }}><select id="fs-new-term" value={newTerm} onChange={e => setNewTerm(e.target.value)} className="modern-input" style={{ width:'100%', fontSize:'12px' }}><option value="All Terms">All Terms</option><option value="First Term">First Term</option><option value="Second Term">Second Term</option><option value="Third Term">Third Term</option></select></td>
                    <td style={{ padding:'10px 12px' }}><input type="number" id="fs-new-amount" placeholder="e.g. 80000" min={0} value={newAmount} onChange={e => setNewAmount(e.target.value)} className="modern-input" style={{ width:'100%', textAlign:'right', fontSize:'12px' }} /></td>
                    <td style={{ textAlign:'center', padding:'10px 12px' }}><button id="btn-fs-add-item" onClick={handleAddItem} disabled={addingItem||!newName.trim()||!newAmount} className="primary-btn" style={{ padding:'5px 12px', fontSize:'12px' }}>+ Add</button></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 20px', borderTop:'1px solid var(--glass-border)', flexShrink:0, background:'rgba(0,0,0,0.15)' }}>
              <span id="fs-class-count" style={{ fontSize:'12px', color:'var(--text-dim)' }}>{structClass ? `${structItems.length} item${structItems.length!==1?'s':''} for ${structClass}` : ''}</span>
              <span id="fs-total-display" style={{ fontSize:'15px', fontWeight:600 }}>Total ({structTerm}): ₦{fmt(structTotal)}</span>
            </div>
          </div>
        )}

        {/* ══ TAB: ADJUSTMENTS ══ */}
        {activeTab === 'adjustments' && (
          <div id="fees-tab-adjustments" style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
            <div style={{ display:'flex', gap:'12px', alignItems:'center', padding:'16px 20px', borderBottom:'1px solid var(--glass-border)', flexShrink:0, flexWrap:'wrap' }}>
              <span style={{ fontSize:'13px', fontWeight:500 }}>Fee Adjustments — Scholarships, Waivers &amp; Grants</span>
              <button id="btn-adj-add" onClick={() => { setAdjStudentStr(''); setAdjStudentId(''); setAdjAmount(''); setAdjDesc(''); setIsAdjOpen(true); }} className="primary-btn" style={{ marginLeft:'auto', padding:'7px 16px', fontSize:'12px' }}>+ New Adjustment</button>
            </div>
            <div className="table-container" style={{ flex:1, overflowY:'auto' }}>
              <table className="data-table" id="adj-table">
                <thead><tr>
                  <th>Student</th><th>Class</th><th>Type</th><th>Description</th>
                  <th style={{ textAlign:'right' }}>Amount (₦)</th><th>Approved By</th><th style={{ textAlign:'center' }}>Action</th>
                </tr></thead>
                <tbody id="adj-tbody">
                  {loadingAdj ? (
                    <tr><td colSpan={7} style={{ textAlign:'center', padding:'40px', color:'var(--text-dim)' }}>Loading...</td></tr>
                  ) : adjustments.length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign:'center', padding:'40px', color:'var(--text-dim)' }}>No adjustments this term.</td></tr>
                  ) : adjustments.map(adj => (
                    <tr key={adj.id}>
                      <td style={{ fontWeight:500 }}>{adj.student_name}</td>
                      <td style={{ fontSize:'12px', color:'var(--text-dim)' }}>{adj.class_name}</td>
                      <td style={{ fontSize:'12px' }}>{ADJ_EMOJI[adj.adjustment_type]||'🏷️'} {adj.adjustment_type.replace('_',' ')}</td>
                      <td style={{ fontSize:'12px', color:'var(--text-dim)' }}>{adj.description||'—'}</td>
                      <td style={{ textAlign:'right', fontFamily:'var(--font-mono)', fontSize:'13px', color:'#4CAF50' }}>₦{fmt(adj.amount)}</td>
                      <td style={{ fontSize:'11px', color:'var(--text-dim)' }}>{adj.approved_by}</td>
                      <td style={{ textAlign:'center' }}>
                        <button className="small-btn btn-adj-del" onClick={() => handleDeleteAdj(adj.id)} style={{ color:'#ff6b6b', borderColor:'rgba(255,107,107,0.2)' }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══ TAB: RECEIPTS ══ */}
        {activeTab === 'receipts' && (
          <div id="fees-tab-receipts" style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
            <div style={{ padding:'16px 20px 8px', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid var(--glass-border)', flexShrink:0 }}>
              <div>
                <div style={{ fontWeight:600, fontSize:'15px' }}>📄 Payment Receipts</div>
                <div style={{ fontSize:'12px', color:'var(--text-dim)', marginTop:'2px' }}>Review and approve parent-submitted proof of payment</div>
              </div>
              <button onClick={loadReceipts} className="small-btn" style={{ fontSize:'12px' }}>🔄 Refresh</button>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'0 20px 20px' }}>
              {receipts.length === 0 ? (
                <div id="receipts-empty" style={{ textAlign:'center', padding:'60px 20px', color:'var(--text-dim)' }}>
                  <div style={{ fontSize:'40px', marginBottom:'12px' }}>✅</div>
                  <div style={{ fontSize:'14px', fontWeight:600 }}>All caught up!</div>
                  <div style={{ fontSize:'12px', marginTop:'4px' }}>No pending payment receipts to review.</div>
                </div>
              ) : (
                <table className="data-table" id="receipts-table">
                  <thead><tr>
                    <th>Student</th><th>Via</th><th>Amount</th><th>Reference</th>
                    <th>Payer Name</th><th>Match</th><th>Submitted</th><th>Actions</th>
                  </tr></thead>
                  <tbody id="receipts-tbody">
                    {receipts.map(r => {
                      const pct  = r.name_match_score!==null ? Math.round(r.name_match_score*100) : null;
                      const mClr = pct!==null&&pct>=80?'#4CAF50':pct!==null&&pct>=50?'#FFB300':'#ff4444';
                      const mLbl = pct!==null&&pct>=80?'🟢':pct!==null&&pct>=50?'🟡':'🔴';
                      const hasImg = r.file_type?.startsWith('image/');
                      const hasPdf = r.file_type==='application/pdf'&&r.pdf_raw_text;
                      return (
                        <tr key={r.id}>
                          <td><div style={{ fontWeight:600 }}>{r.student_name}</div><div style={{ fontSize:'11px', color:'var(--text-dim)' }}>{r.class_name}</div></td>
                          <td>{r.submitted_via==='whatsapp' ? <span style={{ color:'#25D366',fontSize:'11px' }}>📱 WhatsApp</span> : <span style={{ color:'var(--accent)',fontSize:'11px' }}>🌐 Portal</span>}</td>
                          <td style={{ fontWeight:600 }}>{r.extracted_amount?`₦${fmt(r.extracted_amount)}`:'—'}</td>
                          <td style={{ fontSize:'11px', color:'var(--text-dim)' }}>{r.extracted_reference||'—'}</td>
                          <td style={{ fontSize:'11px' }}>{r.extracted_payer_name||'—'}</td>
                          <td>{pct!==null?<span style={{ color:mClr,fontSize:'11px' }} title={`${pct}% match`}>{mLbl} {pct}%</span>:<span style={{ color:'var(--text-dim)',fontSize:'11px' }}>—</span>}</td>
                          <td style={{ fontSize:'11px', color:'var(--text-dim)' }}>{r.created_at?new Date(r.created_at).toLocaleDateString('en-NG'):'—'}</td>
                          <td style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
                            {hasImg && <button className="tbl-action-btn" style={{ color:'#00e5ff',borderColor:'rgba(0,229,255,0.3)' }} onClick={() => setLightbox({ type:'image', src:`data:${r.file_type};base64,${r.file_data_b64}` })}>👁️ View</button>}
                            {hasPdf && <button className="tbl-action-btn" style={{ color:'#00e5ff',borderColor:'rgba(0,229,255,0.3)' }} onClick={() => setLightbox({ type:'pdf', src:r.pdf_raw_text||'' })}>📄 View</button>}
                            <button className="tbl-action-btn" style={{ color:'#4CAF50',borderColor:'rgba(76,175,80,0.3)' }} onClick={() => openApprove(r)}>✅ Approve</button>
                            <button className="tbl-action-btn" onClick={() => { setRejectR(r); setRejectReason(''); }}>❌ Reject</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── Bulk Import Panel ────────────────────────────────────────────── */}
        {activeTab === 'import' && (
          <div id="fees-tab-import" style={{ flex:1, overflowY:'auto', padding:'24px 28px' }}>
            <div style={{ marginBottom:'20px' }}>
              <div style={{ fontWeight:700, fontSize:'16px', marginBottom:'4px' }}>📥 Bulk Fee Import</div>
              <div style={{ fontSize:'12px', color:'var(--text-dim)' }}>
                Download a template, fill it in, then upload to bulk-import fee data. All imports run in a transaction — partial failures are rejected.
              </div>
            </div>

            {/* Helper to render one import card */}
            {(
              [
                {
                  key:   'structure' as const,
                  title: '🏗️ Fee Structure',
                  desc:  'Define billing line items per class and term. Upserts existing rows.',
                  cols:  'Class_Name | Item_Name | Amount | Term',
                  example: 'JSS 1 Gold | Tuition | 35000 | First Term',
                  tplName: 'Nexus_FeeStructure_Template.csv',
                  tplContent: 'Class_Name,Item_Name,Amount,Term\nJSS 1 Gold,Tuition,35000,First Term\nJSS 1 Gold,PTA Levy,5000,All Terms\n',
                },
                {
                  key:   'payment' as const,
                  title: '💰 Fee Payments',
                  desc:  'Record bulk payments. Updates the fee ledger and student balance.',
                  cols:  'Student_ID | Academic_Session | Term | Amount_Paid | Payment_Method | Reference_Number* | Payment_Date* | Recorded_By*',
                  example: 'STU001 | 2025/2026 | First Term | 30000 | cash |  | 2025-09-01 | Bursar',
                  tplName: 'Nexus_FeePayment_Template.csv',
                  tplContent: 'Student_ID,Academic_Session,Term,Amount_Paid,Payment_Method,Reference_Number,Payment_Date,Recorded_By\nSTU001,2025/2026,First Term,30000,cash,,2025-09-01,Bursar\n',
                },
                {
                  key:   'adjustment' as const,
                  title: '🎓 Fee Adjustments',
                  desc:  'Apply scholarships, waivers, and discounts in bulk.',
                  cols:  'Student_ID | Academic_Session | Term | Adjustment_Type | Amount | Description* | Approved_By*',
                  example: 'STU002 | 2025/2026 | First Term | scholarship | 15000 | 50% Tuition Waiver | Principal',
                  tplName: 'Nexus_FeeAdjustment_Template.csv',
                  tplContent: 'Student_ID,Academic_Session,Term,Adjustment_Type,Amount,Description,Approved_By\nSTU002,2025/2026,First Term,scholarship,15000,50% Tuition Waiver,Principal\n',
                },
              ] as const
            ).map(card => {
              const status = csvImportStatus[card.key];
              const downloadTpl = () => {
                const blob = new Blob([card.tplContent], { type: 'text/csv' });
                const url  = URL.createObjectURL(blob);
                const a    = document.createElement('a');
                a.href = url; a.download = card.tplName; a.click();
                URL.revokeObjectURL(url);
              };
              return (
                <div key={card.key} style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.09)',
                  borderRadius: '10px',
                  padding: '18px 20px',
                  marginBottom: '16px',
                }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'10px' }}>
                    <div>
                      <div style={{ fontWeight:600, fontSize:'14px', marginBottom:'3px' }}>{card.title}</div>
                      <div style={{ fontSize:'12px', color:'var(--text-dim)' }}>{card.desc}</div>
                    </div>
                    <button
                      onClick={downloadTpl}
                      style={{ fontSize:'12px', padding:'5px 14px', borderRadius:'6px', cursor:'pointer',
                        background:'rgba(0,229,255,0.08)', border:'1px solid rgba(0,229,255,0.25)',
                        color:'#00e5ff', whiteSpace:'nowrap', flexShrink:0, marginLeft:'16px' }}
                    >
                      ⬇️ Download Template
                    </button>
                  </div>

                  <div style={{ fontSize:'11px', color:'var(--text-dim)', marginBottom:'8px', fontFamily:'monospace',
                    background:'rgba(0,0,0,0.2)', borderRadius:'5px', padding:'6px 10px' }}>
                    <strong>Columns:</strong> {card.cols}<br />
                    <strong>Example:</strong> {card.example}
                    <span style={{ marginLeft:'8px', color:'rgba(255,255,255,0.3)', fontSize:'10px' }}>* optional</span>
                  </div>

                  <div style={{ display:'flex', alignItems:'center', gap:'12px', flexWrap:'wrap' }}>
                    <button
                      onClick={() => handleFeeCSV(card.key)}
                      disabled={status.loading}
                      style={{ fontSize:'13px', padding:'7px 18px', borderRadius:'7px', cursor:'pointer',
                        background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.15)',
                        color:'var(--text)', opacity: status.loading ? 0.6 : 1 }}
                    >
                      {status.loading ? '⌛ Importing…' : '📂 Choose CSV & Import'}
                    </button>
                    {status.result && (
                      <span style={{ fontSize:'12px', color: status.result.startsWith('✅') ? '#4CAF50' : '#ff5252' }}>
                        {status.result}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            <p style={{ fontSize:'11px', color:'var(--text-dim)', marginTop:'8px' }}>
              ⚠️ Use pipe <code>|</code> only for multi-value fields. Adjustment_Type must be one of: <code>scholarship</code>, <code>waiver</code>, <code>owner_grant</code>, <code>bursary</code>, <code>discount</code>. Payment_Method must be: <code>cash</code>, <code>transfer</code>, <code>pos</code>, or <code>bank_teller</code>.
            </p>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SETTINGS PANEL (V1 exact structure — position:absolute/fixed slide-in)
      ══════════════════════════════════════════════════════════════════════ */}
      {settingsOpen && (
        <>
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:99 }} onClick={() => setSettingsOpen(false)} />
          <div id="fees-settings-panel" style={{ position:'fixed', right:0, top:0, bottom:0, width:'420px', background:'#0d1235', borderLeft:'1px solid var(--glass-border)', zIndex:100, display:'flex', flexDirection:'column', boxShadow:'-10px 0 40px rgba(0,0,0,0.7)' }}>
            {/* Header */}
            <div style={{ padding:'20px', borderBottom:'1px solid var(--glass-border)', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
              <h3 style={{ margin:0, fontSize:'16px' }}>⚙️ Financial Hub Settings</h3>
              <button id="btn-fees-settings-close" onClick={() => setSettingsOpen(false)} style={{ background:'none', border:'none', color:'var(--text-dim)', fontSize:'24px', cursor:'pointer', lineHeight:1 }}>&times;</button>
            </div>
            {/* Scrollable body */}
            <div style={{ padding:'20px', flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:'16px' }}>

              {/* Nexus Pulse Reminders */}
              <div className="card" style={{ padding:'16px', background:'rgba(0,229,255,0.04)', border:'1px solid rgba(0,229,255,0.15)' }}>
                <p style={{ fontSize:'11px', color:'var(--accent)', textTransform:'uppercase', letterSpacing:'1px', fontWeight:700, marginBottom:'10px' }}>🤖 Nexus Pulse — Automated Fee Reminders</p>
                <p style={{ fontSize:'11px', color:'var(--text-dim)', marginBottom:'14px', lineHeight:1.6 }}>Set two dates per term when the bot automatically sends fee reminders to parents with outstanding balances.</p>
                <div style={{ display:'flex', gap:'12px', flexWrap:'wrap' }}>
                  <div style={{ flex:1, minWidth:'140px' }}>
                    <Lbl>First Reminder Date</Lbl>
                    <input type="date" id="fees-reminder-1" value={reminder1} onChange={e => setReminder1(e.target.value)} className="modern-input" style={{ width:'100%', fontSize:'12px' }} />
                  </div>
                  <div style={{ flex:1, minWidth:'140px' }}>
                    <Lbl>Second Reminder Date</Lbl>
                    <input type="date" id="fees-reminder-2" value={reminder2} onChange={e => setReminder2(e.target.value)} className="modern-input" style={{ width:'100%', fontSize:'12px' }} />
                  </div>
                </div>
              </div>

              {/* Settlement Accounts */}
              <div className="card" style={{ padding:'16px', background:'rgba(255,255,255,0.02)', border:'1px solid var(--glass-border)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
                  <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
                    <p style={{ fontSize:'11px', color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'1px', fontWeight:700, margin:0 }}>🏦 Settlement Accounts</p>
                    {bankAccounts.some(a => a.paystack_verified && a.subaccount_code) && (
                      <span style={{ fontSize:'9px', background:'rgba(76,175,80,0.12)', color:'#4CAF50', padding:'2px 6px', borderRadius:'4px', fontWeight:600 }}>Paystack Connected ✅</span>
                    )}
                  </div>
                  <button 
                    id="btn-fees-add-account" 
                    onClick={() => {
                      if (bankAccounts.length >= 3) return;
                      setBankAccounts(p => [...p,{bank:'',number:'',name:'',paystack_verified:false}]);
                    }} 
                    disabled={bankAccounts.length >= 3}
                    className="small-btn" 
                    style={{ padding:'4px 8px', fontSize:'10px', opacity: bankAccounts.length >= 3 ? 0.5 : 1, cursor: bankAccounts.length >= 3 ? 'not-allowed' : 'pointer' }}
                    title={bankAccounts.length >= 3 ? "Maximum 3 accounts reached" : ""}
                  >
                    {bankAccounts.length >= 3 ? "Max 3 Accounts" : "+ Add Bank"}
                  </button>
                </div>
                
                <div id="fees-accounts-list" style={{ display:'flex', flexDirection:'column', gap:'12px', marginBottom:'8px' }}>
                  {bankAccounts.map((acc,i) => (
                    <div key={i} style={{ display:'flex', flexDirection:'column', gap:'6px', padding:'10px', background:'rgba(0,0,0,0.2)', borderRadius:'6px', border:'1px solid rgba(255,255,255,0.04)' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <div style={{ display:'flex', gap:'12px', alignItems:'center' }}>
                          <label style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'10px', color:'var(--text-dim)', cursor:'pointer' }}>
                            <input 
                              type="checkbox" 
                              checked={!!acc.paystack_verified} 
                              onChange={e => {
                                const c = [...bankAccounts];
                                c[i].paystack_verified = e.target.checked;
                                c[i].bank = '';
                                c[i].number = '';
                                c[i].name = '';
                                c[i].bank_code = null;
                                c[i].subaccount_code = null;
                                setBankAccounts(c);
                              }} 
                            />
                            Verify with Paystack
                          </label>
                          <label style={{ display:'flex', alignItems:'center', gap:'4px', fontSize:'10px', color: activeBankAccountId === acc.id ? '#4CAF50' : 'var(--text-dim)', cursor: acc.id ? 'pointer' : 'not-allowed', opacity: acc.id ? 1 : 0.5 }}>
                            <input 
                              type="radio" 
                              name="active_bank_account"
                              checked={activeBankAccountId !== null && activeBankAccountId === acc.id}
                              disabled={!acc.id}
                              onChange={() => {
                                if (acc.id) {
                                  setActiveBankAccountId(acc.id);
                                }
                              }} 
                              title={!acc.id ? "Save settings first to enable this account" : ""}
                            />
                            Active Collection
                          </label>
                        </div>
                        <button 
                          onClick={() => setBankAccounts(p => p.filter((_,j) => j!==i))} 
                          className="small-btn" 
                          style={{ color:'#ff6b6b', borderColor:'rgba(255,107,107,0.2)', padding:'2px 6px', fontSize:'9px' }}
                        >
                          Remove
                        </button>
                      </div>

                      {acc.paystack_verified ? (
                        <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
                          <PaystackBankSelect 
                            value={acc.bank_code || ''} 
                            onChange={(bankName, bankCode) => {
                              const c = [...bankAccounts];
                              c[i].bank = bankName;
                              c[i].bank_code = bankCode;
                              c[i].name = '';
                              setBankAccounts(c);
                            }} 
                          />
                          <input 
                            type="text" 
                            placeholder="Account No." 
                            value={acc.number} 
                            maxLength={10}
                            onChange={async e => {
                              const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                              const c = [...bankAccounts];
                              c[i].number = val;
                              setBankAccounts(c);
                              
                              if (val.length === 10 && c[i].bank_code) {
                                c[i].name = 'Resolving...';
                                setBankAccounts([...c]);
                                try {
                                  const res = await window.electronAPI.fees.resolveAccount({
                                    accountNumber: val,
                                    bankCode: c[i].bank_code
                                  });
                                  if (res && res.account_name) {
                                    const updated = [...bankAccounts];
                                    updated[i].name = res.account_name;
                                    setBankAccounts(updated);
                                  } else {
                                    const updated = [...bankAccounts];
                                    updated[i].name = 'Verification failed';
                                    setBankAccounts(updated);
                                  }
                                } catch (err) {
                                  const updated = [...bankAccounts];
                                  updated[i].name = 'Verification failed';
                                  setBankAccounts(updated);
                                }
                              }
                            }} 
                            className="modern-input" 
                            style={{ flex:1, fontSize:'11px', padding:'6px 10px' }} 
                          />
                          <input 
                            type="text" 
                            placeholder="Account Name" 
                            value={acc.name} 
                            disabled 
                            className="modern-input" 
                            style={{ flex:1, fontSize:'11px', padding:'6px 10px', background:'rgba(255,255,255,0.03)', color: acc.name === 'Verification failed' ? '#ff6b6b' : acc.name === 'Resolving...' ? 'var(--text-dim)' : '#4CAF50', fontWeight: 600 }} 
                          />
                        </div>
                      ) : (
                        <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
                          <input 
                            type="text" 
                            placeholder="Bank Name" 
                            value={acc.bank} 
                            onChange={e => {
                              const c = [...bankAccounts];
                              c[i].bank = e.target.value;
                              setBankAccounts(c);
                            }} 
                            className="modern-input" 
                            style={{ flex:1, fontSize:'11px', padding:'6px 10px' }} 
                          />
                          <input 
                            type="text" 
                            placeholder="Account No." 
                            value={acc.number} 
                            maxLength={10}
                            onChange={e => {
                              const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                              const c = [...bankAccounts];
                              c[i].number = val;
                              setBankAccounts(c);
                            }} 
                            className="modern-input" 
                            style={{ flex:1, fontSize:'11px', padding:'6px 10px' }} 
                          />
                          <input 
                            type="text" 
                            placeholder="Account Name" 
                            value={acc.name} 
                            onChange={e => {
                              const c = [...bankAccounts];
                              c[i].name = e.target.value;
                              setBankAccounts(c);
                            }} 
                            className="modern-input" 
                            style={{ flex:1, fontSize:'11px', padding:'6px 10px' }} 
                          />
                        </div>
                      )}
                      
                      {acc.number && acc.number.length !== 10 && (
                        <span style={{ fontSize:'9px', color:'#ff6b6b' }}>⚠️ Account number must be exactly 10 digits</span>
                      )}
                      {!acc.paystack_verified && acc.number.length === 10 && (!acc.bank.trim() || !acc.name.trim()) && (
                        <span style={{ fontSize:'9px', color:'#e67e22' }}>⚠️ Bank name and Account name cannot be empty</span>
                      )}
                    </div>
                  ))}
                </div>
                <p style={{ fontSize:'10px', color:'var(--text-dim)', margin:0 }}>Shown to parents on WhatsApp when they initiate a payment.</p>
              </div>

              {/* Installment Plans */}
              <div className="card" style={{ padding:'16px', background:'rgba(255,255,255,0.02)', border:'1px solid var(--glass-border)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
                  <p style={{ fontSize:'11px', color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'1px', fontWeight:700, margin:0 }}>💳 Installment Plans</p>
                  <button id="btn-fees-add-installment" onClick={() => setInstallPlans(p => [...p,{label:'',percent:0}])} className="small-btn" style={{ padding:'4px 8px', fontSize:'10px' }}>+ Add Milestone</button>
                </div>
                <div id="fees-installments-list" style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                  {installPlans.map((inst,i) => (
                    <div key={i} style={{ display:'flex', gap:'8px', alignItems:'center' }}>
                      <input type="text" placeholder="Milestone (e.g. 1st Installment)" value={inst.label} onChange={e => { const c=[...installPlans]; c[i].label=e.target.value; setInstallPlans(c); }} className="modern-input" style={{ flex:2, fontSize:'11px', padding:'6px 10px' }} />
                      <input type="number" placeholder="%" value={inst.percent||''} min={1} max={100} onChange={e => { const c=[...installPlans]; c[i].percent=parseInt(e.target.value)||0; setInstallPlans(c); }} className="modern-input" style={{ flex:1, fontSize:'11px', padding:'6px 10px' }} />
                      <span style={{ fontSize:'11px', color:'var(--text-dim)' }}>%</span>
                      <button onClick={() => setInstallPlans(p => p.filter((_,j) => j!==i))} className="small-btn" style={{ color:'#ff6b6b', borderColor:'rgba(255,107,107,0.2)', padding:'4px 8px' }}>×</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Result Access Gate */}
              <div className="card" style={{ padding:'16px', background:'rgba(255,80,80,0.04)', border:'1px solid rgba(255,80,80,0.2)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'4px' }}>
                  <p style={{ fontSize:'11px', color:'#ff8080', textTransform:'uppercase', letterSpacing:'1px', fontWeight:700, margin:0 }}>🔒 Result Access Gate</p>
                  <span style={{ fontSize:'10px', fontWeight:700, color:'#f59e0b', padding:'2px 7px', background:'rgba(245,158,11,0.1)', borderRadius:'4px' }}>Gold+</span>
                </div>
                <p style={{ fontSize:'11px', color:'var(--text-dim)', marginBottom:'14px', lineHeight:1.6 }}>Withhold academic results for students with outstanding fee balances.</p>
                <label style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'14px', cursor:'pointer' }}>
                  <span style={{ fontSize:'13px' }}>Enable Result Gate</span>
                  <input type="checkbox" id="fee-gate-enabled" checked={gateEnabled} onChange={e => setGateEnabled(e.target.checked)} style={{ transform:'scale(1.3)', accentColor:'#ff8080' }} />
                </label>
                {gateEnabled && (
                  <div id="fee-gate-config-group" style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                    <div>
                      <Lbl>Gate Mode</Lbl>
                      <select id="fee-gate-mode" value={gateMode} onChange={e => setGateMode(e.target.value as any)} className="modern-input" style={{ width:'100%', fontSize:'12px' }}>
                        <option value="any">🔴 Any positive balance (₦1+)</option>
                        <option value="fixed">💰 Fixed ₦ threshold</option>
                        <option value="percent">📊 Percentage of billed</option>
                      </select>
                    </div>
                    {gateMode !== 'any' && (
                      <div id="fee-gate-threshold-group">
                        <Lbl>{gateMode==='percent'?'Threshold (% of billed)':'Threshold Amount (₦)'}</Lbl>
                        <input type="number" id="fee-gate-threshold" placeholder={gateMode==='percent'?'e.g. 50':'e.g. 5000'} value={gateThreshold} onChange={e => setGateThreshold(e.target.value)} className="modern-input" min={0} style={{ width:'100%', fontSize:'12px' }} />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Fee Shield (Diamond) */}
              {isDiamond && (
                <div id="fees-shield-section" className="card" style={{ padding:'16px', background:'rgba(212,175,55,0.06)', border:'1px solid rgba(212,175,55,0.2)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'4px' }}>
                    <p style={{ fontSize:'11px', color:'var(--gold)', textTransform:'uppercase', letterSpacing:'1px', fontWeight:700, margin:0 }}>💎 Fee Shield — PDF Enforcement</p>
                    <span style={{ fontSize:'10px', fontWeight:700, color:'#00e5ff', padding:'2px 7px', background:'rgba(0,229,255,0.1)', borderRadius:'4px' }}>Diamond</span>
                  </div>
                  <p style={{ fontSize:'11px', color:'var(--text-dim)', marginBottom:'14px', lineHeight:1.6 }}>Control what happens when a student has outstanding fees at report card generation.</p>
                  <label style={{ display:'flex', alignItems:'center', gap:'8px', cursor:'pointer', fontSize:'12px', color:'var(--text-dim)', marginBottom:'12px' }}>
                    <input type="checkbox" id="fees-shield-enabled" checked={shieldEnabled} onChange={e => setShieldEnabled(e.target.checked)} style={{ width:'14px', height:'14px', accentColor:'var(--gold)' }} />
                    <span>Enable Fee Shield enforcement</span>
                  </label>
                  {shieldEnabled && (
                    <div id="fees-shield-mode-group">
                      <Lbl>Enforcement Mode</Lbl>
                      <select id="fees-shield-mode" value={shieldMode} onChange={e => setShieldMode(e.target.value as any)} className="modern-input" style={{ width:'100%', fontSize:'12px' }}>
                        <option value="warn">⚠️ Warning Prompt Only</option>
                        <option value="watermark">🖋️ Watermark PDF ("OUTSTANDING BALANCE")</option>
                        <option value="block">🚫 Block PDF Generation Entirely</option>
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* Save footer */}
            <div style={{ padding:'16px 20px', borderTop:'1px solid var(--glass-border)', flexShrink:0 }}>
              <button id="btn-fees-settings-save" onClick={handleSaveSettings} disabled={savingSettings} className="primary-btn" style={{ width:'100%', justifyContent:'center', background:'linear-gradient(135deg,#b8860b,#ffd700)', color:'#000', border:'none', boxShadow:'none' }}>
                {savingSettings ? 'Saving…' : 'Save Settings'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL: New Adjustment
      ══════════════════════════════════════════════════════════════════════ */}
      {isAdjOpen && (
        <div id="modal-adj" style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.72)', backdropFilter:'blur(8px)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'#0d1640', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'18px', padding:'32px 36px', width:'540px', maxWidth:'94vw', boxShadow:'0 24px 80px rgba(0,0,0,0.7)' }}>

            {/* Header */}
            <div style={{ marginBottom:'24px' }}>
              <h3 style={{ margin:'0 0 6px', fontSize:'22px', fontWeight:700, color:'#fff', display:'flex', alignItems:'center', gap:'10px' }}>
                💰 New Fee Adjustment
              </h3>
              <p style={{ margin:0, fontSize:'13px', color:'var(--text-dim)', lineHeight:1.5 }}>
                Create a new fee adjustment for scholarships, fines, or other fees.
              </p>
            </div>

            <form onSubmit={handleSubmitAdj}>
              <div style={{ display:'flex', flexDirection:'column', gap:'18px' }}>

                {/* Row 1: Class Filter + Student Search */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px' }}>
                  <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                    <label style={{ fontSize:'11px', fontWeight:700, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.6px' }}>Class Filter</label>
                    <Combobox
                      options={['All Classes', ...fullList]}
                      value={adjClass || 'All Classes'}
                      onChange={val => {
                        const v = val === 'All Classes' ? '' : val;
                        setAdjClass(v);
                        setAdjStudentStr('');
                        setAdjStudentId('');
                      }}
                      placeholder="All Classes"
                      style={{ width:'100%' }}
                    />
                  </div>

                  <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                    <label style={{ fontSize:'11px', fontWeight:700, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.6px' }}>Student (Search)</label>
                    <div style={{ position:'relative' }}>
                      <span style={{ position:'absolute', left:'12px', top:'50%', transform:'translateY(-50%)', fontSize:'13px', color:'var(--text-dim)', pointerEvents:'none', zIndex:1 }}>🔍</span>
                      <input
                        type="text"
                        id="adj-student-select"
                        list="adj-students-datalist"
                        value={adjStudentStr}
                        onChange={e => { setAdjStudentStr(e.target.value); const m=adjMatchedStudents.find(s=>s.name===e.target.value||s.id===e.target.value); if(m) setAdjStudentId(m.id); else setAdjStudentId(''); }}
                        placeholder="Type name or ID..."
                        className="modern-input"
                        style={{ width:'100%', paddingLeft:'34px', fontSize:'13px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:'10px', color:'#fff', height:'42px', boxSizing:'border-box' }}
                      />
                      <datalist id="adj-students-datalist">
                        {adjMatchedStudents.map(s => <option key={s.id} value={s.id}>{s.name} ({s.class_name})</option>)}
                      </datalist>
                    </div>
                  </div>
                </div>

                {/* Row 2: Type + Amount */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px' }}>
                  <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                    <label style={{ fontSize:'11px', fontWeight:700, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.6px' }}>Type</label>
                    <select
                      id="adj-type"
                      value={adjType}
                      onChange={e => setAdjType(e.target.value)}
                      className="modern-input"
                      style={{ width:'100%', fontSize:'13px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:'10px', color:'#fff', height:'42px' }}
                    >
                      <option value="scholarship">🎓 Scholarship</option>
                      <option value="waiver">✋ Waiver</option>
                      <option value="owner_grant">🏫 Owner Grant</option>
                      <option value="bursary">💼 Bursary</option>
                      <option value="discount">🏷️ Discount</option>
                    </select>
                  </div>

                  <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                    <label style={{ fontSize:'11px', fontWeight:700, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.6px' }}>Amount (₦)</label>
                    <input
                      type="number"
                      id="adj-amount"
                      placeholder="e.g. 20000"
                      min={1}
                      value={adjAmount}
                      onChange={e => setAdjAmount(e.target.value)}
                      className="modern-input"
                      style={{ width:'100%', fontSize:'13px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:'10px', color:'#fff', height:'42px', boxSizing:'border-box' }}
                    />
                  </div>
                </div>

                {/* Row 3: Description */}
                <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                  <label style={{ fontSize:'11px', fontWeight:700, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.6px' }}>Description</label>
                  <input
                    type="text"
                    id="adj-description"
                    placeholder="e.g. 50% merit scholarship"
                    value={adjDesc}
                    onChange={e => setAdjDesc(e.target.value)}
                    className="modern-input"
                    style={{ width:'100%', fontSize:'13px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:'10px', color:'#fff', height:'42px', boxSizing:'border-box' }}
                  />
                </div>
              </div>

              {/* Divider */}
              <div style={{ borderTop:'1px solid rgba(255,255,255,0.08)', margin:'28px 0 20px' }} />

              {/* Buttons */}
              <div style={{ display:'flex', gap:'12px', justifyContent:'flex-end', alignItems:'center' }}>
                <button
                  type="button"
                  id="btn-adj-cancel"
                  onClick={() => setIsAdjOpen(false)}
                  style={{
                    background:'transparent',
                    border:'1px solid rgba(255,255,255,0.18)',
                    borderRadius:'10px',
                    color:'#fff',
                    fontSize:'14px',
                    fontWeight:600,
                    padding:'10px 24px',
                    cursor:'pointer',
                    transition:'background 0.2s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background='rgba(255,255,255,0.07)')}
                  onMouseLeave={e => (e.currentTarget.style.background='transparent')}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="btn-adj-submit"
                  disabled={applyingAdj || !adjAmount}
                  style={{
                    background:'linear-gradient(135deg, #0ea5e9, #00e5ff)',
                    border:'none',
                    borderRadius:'10px',
                    color:'#000',
                    fontSize:'14px',
                    fontWeight:700,
                    padding:'10px 28px',
                    cursor: applyingAdj||!adjAmount ? 'not-allowed' : 'pointer',
                    opacity: applyingAdj||!adjAmount ? 0.55 : 1,
                    transition:'opacity 0.2s, transform 0.15s',
                    display:'inline-flex',
                    alignItems:'center',
                    gap:'6px',
                    boxShadow:'0 4px 18px rgba(0,229,255,0.3)',
                  }}
                >
                  {applyingAdj ? '⌛ Applying...' : 'Apply Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL: Record Payment (Diamond)
      ══════════════════════════════════════════════════════════════════════ */}
      {payStudent && (
        <div id="modal-record-payment" style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', backdropFilter:'blur(6px)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'var(--bg-panel)', border:'1px solid var(--glass-border)', borderRadius:'16px', padding:'28px 32px', width:'440px', maxWidth:'92vw' }}>
            <h3 style={{ marginBottom:'4px', fontSize:'16px' }}>Record Payment</h3>
            <p id="payment-modal-student-name" style={{ fontSize:'12px', color:'var(--text-dim)', marginBottom:'20px' }}>Student: {payStudent.name}</p>
            <input type="hidden" id="payment-student-id" value={payStudent.id} />
            <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
              <div><Lbl>Amount Paid (₦)</Lbl><input type="number" id="payment-amount" placeholder="e.g. 50000" min={1} value={payAmount} onChange={e => setPayAmount(e.target.value)} className="modern-input" style={{ width:'100%' }} /></div>
              <div><Lbl>Payment Method</Lbl><select id="payment-method" value={payMethod} onChange={e => setPayMethod(e.target.value)} className="modern-input" style={{ width:'100%' }}><option value="cash">💵 Cash</option><option value="transfer">🏦 Bank Transfer</option><option value="pos">💳 POS</option><option value="bank_teller">🧾 Bank Teller</option></select></div>
              <div><Lbl>Reference / Teller No. <span style={{ color:'var(--text-dim)', fontWeight:'normal', textTransform:'none' }}>(optional)</span></Lbl><input type="text" id="payment-reference" placeholder="e.g. TXN12345678" value={payRef} onChange={e => setPayRef(e.target.value)} className="modern-input" style={{ width:'100%' }} /></div>
              <div><Lbl>Note <span style={{ color:'var(--text-dim)', fontWeight:'normal', textTransform:'none' }}>(optional)</span></Lbl><input type="text" id="payment-note" placeholder="e.g. Part payment" value={payNote} onChange={e => setPayNote(e.target.value)} className="modern-input" style={{ width:'100%' }} /></div>
            </div>
            <div style={{ display:'flex', gap:'10px', marginTop:'22px', justifyContent:'flex-end' }}>
              <button id="btn-payment-cancel" className="secondary-btn" onClick={() => setPayStudent(null)}>Cancel</button>
              <button id="btn-payment-submit" onClick={handlePaymentSubmit} disabled={recordingPay||!payAmount||Number(payAmount)<=0} className="primary-btn" style={{ background:'linear-gradient(135deg,#b8860b,#ffd700)', color:'#000', border:'none', boxShadow:'none' }}>
                {recordingPay ? 'Recording…' : 'Record Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL: Ledger (Diamond)
      ══════════════════════════════════════════════════════════════════════ */}
      {ledgerStudent && (
        <div id="modal-ledger" style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', backdropFilter:'blur(6px)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={() => setLedgerStudent(null)}>
          <div style={{ background:'var(--bg-panel)', border:'1px solid var(--glass-border)', borderRadius:'16px', padding:'28px 32px', width:'580px', maxWidth:'94vw', maxHeight:'80vh', display:'flex', flexDirection:'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' }}>
              <div>
                <h3 style={{ fontSize:'16px', marginBottom:'2px' }}>Payment History</h3>
                <p id="ledger-modal-student-name" style={{ fontSize:'12px', color:'var(--text-dim)', margin:0 }}>{ledgerStudent.name}</p>
              </div>
              <button id="btn-ledger-close" onClick={() => setLedgerStudent(null)} style={{ background:'none', border:'none', color:'var(--text-dim)', fontSize:'20px', cursor:'pointer' }}>✕</button>
            </div>
            <div style={{ overflowY:'auto', flex:1 }}>
              <table className="data-table" id="ledger-table">
                <thead><tr><th>Date</th><th style={{ textAlign:'right' }}>Amount (₦)</th><th>Method</th><th>Reference</th><th>Note</th></tr></thead>
                <tbody id="ledger-tbody">
                  {loadingLedger ? (
                    <tr><td colSpan={5} style={{ textAlign:'center', padding:'30px', color:'var(--text-dim)' }}>Loading…</td></tr>
                  ) : ledgerTx.length === 0 ? (
                    <tr><td colSpan={5} style={{ textAlign:'center', padding:'30px', color:'var(--text-dim)' }}>No transactions recorded.</td></tr>
                  ) : ledgerTx.map((tx,i) => (
                    <tr key={i}>
                      <td style={{ fontSize:'12px', whiteSpace:'nowrap' }}>{fmtDate(tx.created_at)}</td>
                      <td style={{ textAlign:'right', fontFamily:'var(--font-mono)', color:'#4CAF50' }}>₦{fmt(tx.amount)}</td>
                      <td style={{ fontSize:'12px' }}>{PAY_LABELS[tx.payment_method]||tx.payment_method}</td>
                      <td style={{ fontSize:'12px', fontFamily:'var(--font-mono)', color:'var(--text-dim)' }}>{tx.reference_number||'—'}</td>
                      <td style={{ fontSize:'12px', color:'var(--text-dim)' }}>{tx.note||'—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL: Approve Receipt
      ══════════════════════════════════════════════════════════════════════ */}
      {approveR && (
        <div id="modal-receipt-approve" style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', backdropFilter:'blur(6px)', zIndex:1500, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'var(--bg-panel)', border:'1px solid var(--glass-border)', borderRadius:'16px', padding:'28px 32px', width:'500px', maxWidth:'94vw' }}>
            <h3 style={{ marginBottom:'4px', fontSize:'16px' }}>✅ Approve Receipt</h3>
            <p id="receipt-approve-subtitle" style={{ fontSize:'12px', color:'var(--text-dim)', marginBottom:'16px' }}>
              {approveR.student_name} · {approveR.class_name} · via {approveR.submitted_via}
            </p>
            <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
                <div><label style={{ fontSize:'11px', color:'var(--text-dim)' }}>Amount (₦)</label><input type="number" id="receipt-approve-amount" placeholder="e.g. 25000" value={approveAmt} onChange={e => setApproveAmt(e.target.value)} className="modern-input" style={{ marginTop:'4px', width:'100%' }} /></div>
                <div><label style={{ fontSize:'11px', color:'var(--text-dim)' }}>Payment Method</label><select id="receipt-approve-method" value={approveMethod} onChange={e => setApproveMethod(e.target.value)} className="modern-input" style={{ marginTop:'4px', width:'100%' }}><option value="transfer">Bank Transfer</option><option value="pos">POS</option><option value="cash">Cash</option><option value="bank_teller">Bank Teller</option></select></div>
              </div>
              <div><label style={{ fontSize:'11px', color:'var(--text-dim)' }}>Reference Number</label><input id="receipt-approve-ref" placeholder="e.g. FT25ABC1234567" value={approveRef} onChange={e => setApproveRef(e.target.value)} className="modern-input" style={{ marginTop:'4px', width:'100%' }} /></div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
                <div><label style={{ fontSize:'11px', color:'var(--text-dim)' }}>Term</label><select id="receipt-approve-term" value={approveTerm} onChange={e => setApproveTerm(e.target.value)} className="modern-input" style={{ marginTop:'4px', width:'100%' }}><option>First Term</option><option>Second Term</option><option>Third Term</option></select></div>
                <div><label style={{ fontSize:'11px', color:'var(--text-dim)' }}>Session</label><input id="receipt-approve-session" placeholder="e.g. 2024/2025" value={approveSession} onChange={e => setApproveSession(e.target.value)} className="modern-input" style={{ marginTop:'4px', width:'100%' }} /></div>
              </div>
              <div><label style={{ fontSize:'11px', color:'var(--text-dim)' }}>Note (optional)</label><input id="receipt-approve-note" placeholder="e.g. Verified via receipt #12" value={approveNote} onChange={e => setApproveNote(e.target.value)} className="modern-input" style={{ marginTop:'4px', width:'100%' }} /></div>
              {approveR.pdf_raw_text && (
                <div id="receipt-pdf-helper">
                  <label style={{ fontSize:'11px', color:'var(--text-dim)' }}>📋 Extracted Receipt Text (click to copy)</label>
                  <textarea id="receipt-pdf-text" readOnly rows={5} value={approveR.pdf_raw_text} onClick={() => navigator.clipboard.writeText(approveR.pdf_raw_text||'')} className="modern-input" title="Click to copy" style={{ marginTop:'4px', fontSize:'11px', lineHeight:1.5, cursor:'pointer', fontFamily:'monospace', resize:'none', width:'100%' }} />
                </div>
              )}
            </div>
            <div style={{ display:'flex', gap:'10px', marginTop:'20px', justifyContent:'flex-end' }}>
              <button className="small-btn" onClick={() => setApproveR(null)}>Cancel</button>
              <button id="receipt-approve-btn" onClick={handleApproveSubmit} disabled={approvingR} className="primary-btn" style={{ background:'linear-gradient(135deg,rgba(0,229,255,0.13),rgba(0,188,212,0.13))', borderColor:'rgba(0,229,255,0.35)' }}>
                {approvingR ? 'Saving…' : '✅ Approve & Record'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL: Reject Receipt
      ══════════════════════════════════════════════════════════════════════ */}
      {rejectR && (
        <div id="modal-receipt-reject" style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', backdropFilter:'blur(6px)', zIndex:1500, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'var(--bg-panel)', border:'1px solid var(--glass-border)', borderRadius:'16px', padding:'28px 32px', width:'440px', maxWidth:'94vw' }}>
            <h3 style={{ marginBottom:'16px', fontSize:'16px' }}>❌ Reject Receipt</h3>
            <div>
              <label style={{ fontSize:'11px', color:'var(--text-dim)' }}>Reason for rejection</label>
              <textarea id="receipt-reject-reason" rows={3} placeholder="e.g. Receipt is unclear, wrong amount..." value={rejectReason} onChange={e => setRejectReason(e.target.value)} className="modern-input" style={{ marginTop:'4px', resize:'none', width:'100%' }} />
            </div>
            <div style={{ display:'flex', gap:'10px', marginTop:'20px', justifyContent:'flex-end' }}>
              <button className="small-btn" onClick={() => setRejectR(null)}>Cancel</button>
              <button id="receipt-reject-btn" onClick={handleRejectSubmit} disabled={rejectingR} className="primary-btn" style={{ background:'linear-gradient(135deg,rgba(255,68,68,0.13),rgba(204,0,0,0.13))', borderColor:'rgba(255,68,68,0.35)' }}>
                {rejectingR ? 'Saving…' : '❌ Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          LIGHTBOX
      ══════════════════════════════════════════════════════════════════════ */}
      {lightbox && (
        <div id="receipt-lightbox" style={{ display:'flex', position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:2000, alignItems:'center', justifyContent:'center' }} onClick={() => setLightbox(null)}>
          <div style={{ maxWidth:'90vw', maxHeight:'90vh', position:'relative' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setLightbox(null)} style={{ position:'absolute', top:'-36px', right:0, background:'none', border:'none', color:'#fff', fontSize:'24px', cursor:'pointer' }}>✕</button>
            {lightbox.type === 'image'
              ? <img id="receipt-lightbox-img" src={lightbox.src} style={{ maxWidth:'85vw', maxHeight:'85vh', borderRadius:'8px' }} alt="Receipt" />
              : <pre id="receipt-lightbox-text" style={{ maxWidth:'85vw', maxHeight:'85vh', overflow:'auto', background:'#0a0e2e', border:'1px solid var(--glass-border)', borderRadius:'8px', padding:'16px', fontSize:'13px', lineHeight:1.6, color:'#e0e0e0', whiteSpace:'pre-wrap' }}>{lightbox.src}</pre>}
          </div>
        </div>
      )}

    </div>
  );
}
