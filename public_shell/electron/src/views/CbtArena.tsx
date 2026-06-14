import React, { useState, useEffect, useRef } from 'react';
import { generateSessionsList } from '../lib/sessions';
import { 
  BookOpen, Upload, Search, FileText, Trash2, Edit2, Database, Settings, HelpCircle, 
  QrCode, CheckCircle, XCircle, ShieldAlert, Plus, ArrowLeft, RefreshCw, Key, Info, Play
} from 'lucide-react';
import { useSudoAuth } from '../context/SudoAuthContext';

interface CbtArenaProps {
  onOpenHelp?: () => void;
}

export function CbtArena({ onOpenHelp }: CbtArenaProps) {
  const { requireSudo } = useSudoAuth();
  const [activeTab, setActiveTab] = useState<'banks' | 'deploy' | 'live' | 'clearance' | 'about'>('banks');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [passMark, setPassMark] = useState(50);
  const [academicSession, setAcademicSession] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [tokenBalance, setTokenBalance] = useState('Loading...');
  
  // Settings Panel File Upload Progress States
  const [nexpackUploading, setNexpackUploading] = useState(false);
  const [nexpackProgress, setNexpackProgress] = useState(0);
  const [nexpackStatus, setNexpackStatus] = useState('Decrypting...');
  
  // Banks Tab States
  const [banksList, setBanksList] = useState<any[]>([]);
  const [isLoadingBanks, setIsLoadingBanks] = useState(false);
  
  // Question Studio Sub-View States
  const [studioMode, setStudioMode] = useState<'list' | 'studio'>('list');
  const [selectedBank, setSelectedBank] = useState<any | null>(null);
  const [studioQuestions, setStudioQuestions] = useState<any[]>([]);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
  
  // Deploy Tab States
  const [deployTitle, setDeployTitle] = useState('');
  const [deployBankId, setDeployBankId] = useState('');
  const [deployClassLevel, setDeployClassLevel] = useState('');
  const [deployClassArm, setDeployClassArm] = useState('');
  const [deployTerm, setDeployTerm] = useState('');
  const [deployPcCount, setDeployPcCount] = useState(30);
  const [deployExamType, setDeployExamType] = useState('internal');
  const [deployDuration, setDeployDuration] = useState(60);
  const [deployCount, setDeployCount] = useState(50);
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleOptions, setShuffleOptions] = useState(true);
  const [enableCalculator, setEnableCalculator] = useState(false);
  const [enforceKiosk, setEnforceKiosk] = useState(true);
  const [releasePolicy, setReleasePolicy] = useState('immediate');
  const [isPromotional, setIsPromotional] = useState(false);

  // System settings for deploy form
  const [classHierarchy, setClassHierarchy] = useState<string[]>([]);
  const [classArms, setClassArms] = useState<string[]>([]);
  const [availableTerms, setAvailableTerms] = useState<string[]>(['First', 'Second', 'Third']);
  
  // Deploy external candidate state
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvStatus, setCsvStatus] = useState('');

  // Live Tab States
  const [liveExams, setLiveExams] = useState<any[]>([]);
  const [isLoadingLiveExams, setIsLoadingLiveExams] = useState(false);
  const [selectedLiveExam, setSelectedLiveExam] = useState<any | null>(null);
  const [liveBatches, setLiveBatches] = useState<any[]>([]);
  const [liveTokens, setLiveTokens] = useState<any[]>([]);
  
  // Exam Clearance Tab States (Copied from ExamClearance.tsx)
  const [scanData, setScanData] = useState('');
  const [clearanceResult, setClearanceResult] = useState<{status: 'cleared' | 'blocked' | 'error', message: string} | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const scannerInputRef = useRef<HTMLInputElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scholarInputRef = useRef<HTMLInputElement>(null);
  const csvImportRef = useRef<HTMLInputElement>(null);

  // Add Question modal (tabbed React modal)
  const [showAddQModal, setShowAddQModal] = useState(false);
  const [addQTab, setAddQTab] = useState<'manual' | 'import'>('manual');
  const [manualQ, setManualQ] = useState({ question_text: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_option: 'A', marks: 1 });
  const [csvPreviewRows, setCsvPreviewRows] = useState<any[]>([]);
  const [csvParseError, setCsvParseError] = useState('');
  const [isImportingCsv, setIsImportingCsv] = useState(false);

  // Edit Question modal (native React modal)
  const [showEditQModal, setShowEditQModal] = useState(false);
  const [editQ, setEditQ] = useState<any | null>(null);

  // Edit Bank modal (native React modal)
  const [showEditBankModal, setShowEditBankModal] = useState(false);
  const [editBankData, setEditBankData] = useState<any | null>(null);

  const Swal = (window as any).Swal;

  // Load Balance & Banks list on mount
  useEffect(() => {
    refreshBalance();
    loadBanks();
  }, []);

  // Sync tab loading hook
  useEffect(() => {
    if (activeTab === 'banks') {
      loadBanks();
    } else if (activeTab === 'deploy') {
      loadDeploySettings();
    } else if (activeTab === 'live') {
      loadLiveExams();
    } else if (activeTab === 'clearance') {
      setTimeout(() => scannerInputRef.current?.focus(), 100);
    }
  }, [activeTab]);

  // Dynamic refresh for live invigilation panel
  useEffect(() => {
    let interval: any;
    if (activeTab === 'live' && selectedLiveExam) {
      refreshLiveDashboard(selectedLiveExam.id);
      interval = setInterval(() => {
        refreshLiveDashboard(selectedLiveExam.id);
      }, 5000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeTab, selectedLiveExam]);

  // Balance lookup
  const refreshBalance = async () => {
    if (!window.electronAPI) return;
    try {
      const data = await window.electronAPI.cbt.getExternalBalance();
      if (data) {
        setTokenBalance(`${data.remaining} / ${data.allowance}`);
      }
    } catch (e) {
      console.error("Failed to load external CBT balance", e);
    }
  };

  const handleAddTokens = async () => {
    if (!Swal) return;
    const { value: key } = await Swal.fire({
      title: 'Add Expansion Key',
      input: 'text',
      inputPlaceholder: 'NXT-500-...',
      inputLabel: 'Enter your 24-character Expansion Key from the Cloud Portal:',
      showCancelButton: true,
    });

    if (!key) return;

    try {
      const res = await window.electronAPI.cbt.addExpansionKey({ key });
      if (res.success) {
        Swal.fire({
          title: 'Success!',
          text: `Successfully added ${res.added} External CBT Tokens!`,
          icon: 'success',
        });
        refreshBalance();
      } else {
        Swal.fire({
          title: 'Error',
          text: res.error || 'Failed to add expansion key.',
          icon: 'error',
        });
      }
    } catch (e: any) {
      Swal.fire({
        title: 'Error',
        text: e.message,
        icon: 'error',
      });
    }
  };

  // Banks CRUD
  const loadBanks = async () => {
    setIsLoadingBanks(true);
    try {
      const data = await window.electronAPI.cbt.getBanks();
      setBanksList(data || []);
    } catch (e) {
      console.error("Failed to load banks", e);
    } finally {
      setIsLoadingBanks(false);
    }
  };

  const handleCreateBank = async () => {
    if (!Swal) return;
    const { value: formValues } = await Swal.fire({
      title: 'Create Question Bank',
      background: '#0b0f19',
      color: '#fff',
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#374151',
      html: `
        <div style="text-align:left; display:flex; flex-direction:column; gap:16px; margin-top:8px;">
          <div class="form-group">
            <label style="font-size:12px; font-weight:600; color:var(--text-dim); margin-bottom:6px; display:block;">Bank Name</label>
            <input id="swal-create-bank-name" class="modern-input" placeholder="e.g. JSS3 Mock Exam" style="width:100%; box-sizing:border-box;">
          </div>
          <div class="form-group">
            <label style="font-size:12px; font-weight:600; color:var(--text-dim); margin-bottom:6px; display:block;">Category</label>
            <input id="swal-create-bank-cat" class="modern-input" placeholder="e.g. Mathematics" style="width:100%; box-sizing:border-box;">
          </div>
          <div class="form-group">
            <label style="font-size:12px; font-weight:600; color:var(--text-dim); margin-bottom:6px; display:block;">Description</label>
            <textarea id="swal-create-bank-desc" class="modern-input" placeholder="Brief description of the bank contents..." rows="3" style="width:100%; box-sizing:border-box; resize:vertical; font-family:inherit;"></textarea>
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      preConfirm: () => [
          (document.getElementById('swal-create-bank-name') as HTMLInputElement).value.trim(),
          (document.getElementById('swal-create-bank-cat') as HTMLInputElement).value.trim(),
          (document.getElementById('swal-create-bank-desc') as HTMLTextAreaElement).value.trim()
      ]
    });

    if (formValues && formValues[0]) {
      const name = formValues[0];
      const category = formValues[1] || "General";
      const description = formValues[2] || "";
      try {
        await window.electronAPI.cbt.createBank({ name, description, category });
        loadBanks();
      } catch (err: any) {
        Swal.fire({
          title: "Error",
          text: err.message,
          icon: "error",
          background: '#0b0f19',
          color: '#fff',
          confirmButtonColor: '#ef4444'
        });
      }
    }
  };

  const handleEditBank = (e: React.MouseEvent, bank: any) => {
    e.stopPropagation();
    setEditBankData({
      id: bank.id,
      name: bank.name || '',
      category: bank.class_category || bank.category || '',
      description: bank.description || ''
    });
    setShowEditBankModal(true);
  };

  const handleEditBankSubmit = async () => {
    if (!editBankData) return;
    if (!editBankData.name.trim()) {
      Swal?.fire({ title: 'Validation', text: 'Bank name is required.', icon: 'warning', background: '#0b0f19', color: '#fff' });
      return;
    }
    try {
      await window.electronAPI.cbt.updateBank({
        bank_id: editBankData.id,
        name: editBankData.name.trim(),
        category: editBankData.category.trim() || 'General',
        description: editBankData.description.trim()
      });
      setShowEditBankModal(false);
      loadBanks();
      Swal?.fire({ title: 'Saved!', icon: 'success', timer: 1200, showConfirmButton: false, background: '#0b0f19', color: '#fff' });
    } catch (err: any) {
      Swal?.fire({ title: 'Error', text: err.message, icon: 'error', background: '#0b0f19', color: '#fff', confirmButtonColor: '#ef4444' });
    }
  };

  const handleDeleteBank = async (e: React.MouseEvent, bank: any) => {
    e.stopPropagation();
    requireSudo(async () => {
      try {
        await window.electronAPI.cbt.deleteBank({ bank_id: bank.id });
        loadBanks();
        Swal.fire({
          title: "Deleted",
          text: `"${bank.name}" has been deleted.`,
          icon: "success",
          background: '#0b0f19',
          color: '#fff',
          timer: 1500,
          showConfirmButton: false
        });
      } catch (err: any) {
        Swal.fire({
          title: "Error",
          text: err.message,
          icon: "error",
          background: '#0b0f19',
          color: '#fff',
          confirmButtonColor: '#ef4444'
        });
      }
    }, 'Delete Question Bank', `You are about to permanently delete the question bank "${bank.name}". Enter your admin PIN to confirm.`);
  };

  // Question Studio Loading
  const openBankStudio = async (bank: any) => {
    setSelectedBank(bank);
    setStudioMode('studio');
    refreshQuestions(bank.id);
  };

  const refreshQuestions = async (bankId: number) => {
    setIsLoadingQuestions(true);
    try {
      const qs = await window.electronAPI.cbt.getQuestions(bankId);
      setStudioQuestions(qs || []);
    } catch (e) {
      console.error("Failed to load questions", e);
    } finally {
      setIsLoadingQuestions(false);
    }
  };

  const loadSystemSettings = async () => {
    if (!window.electronAPI?.cbt?.getSystemSettings) return;
    try {
      const settings = await window.electronAPI.cbt.getSystemSettings();
      setPassMark(parseInt(settings.pass_mark_threshold) || 50);
      setAcademicSession(settings.current_academic_session || '');
    } catch (err) {
      console.error("Failed to load CBT system settings", err);
    }
  };

  const loadDeploySettings = async () => {
    if (!window.electronAPI?.cbt?.getSystemSettings) return;
    try {
      const settings = await window.electronAPI.cbt.getSystemSettings();
      setAcademicSession(settings.current_academic_session || '');
      // Parse class_hierarchy (array of level strings, e.g. ["JSS1","JSS2",...,"SS3"])
      if (settings.class_hierarchy) {
        const hierarchy = typeof settings.class_hierarchy === 'string'
          ? JSON.parse(settings.class_hierarchy)
          : settings.class_hierarchy;
        setClassHierarchy(Array.isArray(hierarchy) ? hierarchy : []);
      }
      // Parse class_arms (array of arm strings, e.g. ["A","B","C"])
      if (settings.class_arms) {
        const arms = typeof settings.class_arms === 'string'
          ? JSON.parse(settings.class_arms)
          : settings.class_arms;
        setClassArms(Array.isArray(arms) ? arms : []);
      }
      // Parse terms
      if (settings.terms) {
        const terms = typeof settings.terms === 'string'
          ? JSON.parse(settings.terms)
          : settings.terms;
        const termList = Array.isArray(terms) ? terms : ['First', 'Second', 'Third'];
        setAvailableTerms(termList);
        if (!deployTerm && termList.length > 0) setDeployTerm(termList[0]);
      }
    } catch (err) {
      console.error("Failed to load deploy settings", err);
    }
  };

  const handleSaveSettings = async () => {
    if (!window.electronAPI?.cbt?.saveSystemSetting) return;
    setSavingSettings(true);
    try {
      await window.electronAPI.cbt.saveSystemSetting({ key: 'pass_mark_threshold', value: passMark.toString() });
      await window.electronAPI.cbt.saveSystemSetting({ key: 'current_academic_session', value: academicSession.trim() });
      setIsSettingsOpen(false);
      Swal.fire({
        title: 'Success!',
        text: 'CBT Settings saved successfully.',
        icon: 'success',
        timer: 1500,
        showConfirmButton: false,
        background: '#0b0f19',
        color: '#fff'
      });
    } catch (err: any) {
      Swal.fire("Error", err.message, "error");
    } finally {
      setSavingSettings(false);
    }
  };

  // Download a pre-filled CSV template for bulk question import
  const handleDownloadCsvTemplate = () => {
    const headers = ['question_text', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_option', 'marks'];
    const samples = [
      [
        'What is the capital city of Nigeria?',
        'Lagos', 'Abuja', 'Kano', 'Port Harcourt',
        'B', '1'
      ],
      [
        'Which planet is closest to the Sun?',
        'Venus', 'Earth', 'Mercury', 'Mars',
        'C', '1'
      ],
      [
        'What is 12 × 12?',
        '124', '144', '114', '134',
        'B', '2'
      ]
    ];
    const csvRows = [headers, ...samples]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvRows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'nexus_question_import_template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Open the tabbed Add Question React modal
  const handleAddQuestion = () => {
    if (!selectedBank) return;
    setManualQ({ question_text: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_option: 'A', marks: 1 });
    setCsvPreviewRows([]);
    setCsvParseError('');
    setAddQTab('manual');
    setShowAddQModal(true);
  };

  // Submit single manual question
  const handleManualAddSubmit = async () => {
    if (!selectedBank) return;
    if (!manualQ.question_text.trim()) { alert('Question text is required.'); return; }
    if (!manualQ.option_a.trim() || !manualQ.option_b.trim()) { alert('At least options A and B are required.'); return; }
    try {
      await window.electronAPI.cbt.addQuestion({ bank_id: selectedBank.id, ...manualQ });
      await refreshQuestions(selectedBank.id);
      setShowAddQModal(false);
      Swal?.fire({ title: 'Added!', icon: 'success', timer: 1200, showConfirmButton: false, background: '#0b0f19', color: '#fff' });
    } catch (e: any) {
      alert('Error: ' + e.message);
    }
  };

  const handleEditQuestion = (q: any) => {
    setEditQ({ ...q });
    setShowEditQModal(true);
  };

  const handleManualEditSubmit = async () => {
    if (!selectedBank || !editQ) return;
    if (!editQ.question_text?.trim()) {
      Swal.fire({
        title: 'Validation',
        text: 'Question text is required.',
        icon: 'warning',
        background: '#0b0f19',
        color: '#fff'
      });
      return;
    }
    if (!editQ.option_a?.trim() || !editQ.option_b?.trim()) {
      Swal.fire({
        title: 'Validation',
        text: 'At least options A and B are required.',
        icon: 'warning',
        background: '#0b0f19',
        color: '#fff'
      });
      return;
    }
    try {
      await window.electronAPI.cbt.updateQuestion({
        id: editQ.id,
        question_text: editQ.question_text.trim(),
        option_a: editQ.option_a.trim(),
        option_b: editQ.option_b.trim(),
        option_c: (editQ.option_c || '').trim(),
        option_d: (editQ.option_d || '').trim(),
        correct_option: editQ.correct_option.toUpperCase(),
        marks: editQ.marks
      });
      await refreshQuestions(selectedBank.id);
      setShowEditQModal(false);
      Swal?.fire({ title: 'Saved!', icon: 'success', timer: 1200, showConfirmButton: false, background: '#0b0f19', color: '#fff' });
    } catch (e: any) {
      Swal.fire('Error', e.message, 'error');
    }
  };

  const handleDeleteQuestion = async (q: any) => {
    requireSudo(async () => {
      try {
        await window.electronAPI.cbt.deleteQuestion({ question_id: q.id });
        if (selectedBank) refreshQuestions(selectedBank.id);
        Swal.fire({
          title: "Deleted",
          text: "Question has been removed.",
          icon: "success",
          background: '#0b0f19',
          color: '#fff',
          timer: 1200,
          showConfirmButton: false
        });
      } catch (err: any) {
        Swal.fire({
          title: "Error",
          text: err.message,
          icon: "error",
          background: '#0b0f19',
          color: '#fff',
          confirmButtonColor: '#ef4444'
        });
      }
    }, 'Delete Question', `You are about to delete this question. Enter your admin PIN to confirm.`);
  };

  // Parse uploaded CSV and populate preview
  const parseQuestionCsv = (text: string) => {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return { rows: [], error: 'CSV must have a header row and at least one data row.' };
    const raw = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim().toLowerCase());
    const colMap: Record<string, number> = {};
    ['question_text','option_a','option_b','option_c','option_d','correct_option','marks'].forEach(col => {
      const idx = raw.indexOf(col);
      if (idx !== -1) colMap[col] = idx;
    });
    if (colMap['question_text'] === undefined || colMap['option_a'] === undefined || colMap['option_b'] === undefined || colMap['correct_option'] === undefined) {
      return { rows: [], error: 'CSV is missing required columns: question_text, option_a, option_b, correct_option.' };
    }
    const rows: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(c => c.replace(/^"|"$/g, '').trim());
      const qtext = cols[colMap['question_text']] || '';
      if (!qtext) continue;
      rows.push({
        question_text: qtext,
        option_a:      cols[colMap['option_a']] || '',
        option_b:      cols[colMap['option_b']] || '',
        option_c:      colMap['option_c'] !== undefined ? cols[colMap['option_c']] || '' : '',
        option_d:      colMap['option_d'] !== undefined ? cols[colMap['option_d']] || '' : '',
        correct_option: (cols[colMap['correct_option']] || 'A').toUpperCase(),
        marks:          parseInt(colMap['marks'] !== undefined ? cols[colMap['marks']] : '1') || 1,
      });
    }
    return { rows, error: '' };
  };

  const handleCsvFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvParseError('');
    setCsvPreviewRows([]);
    const text = await file.text();
    const { rows, error } = parseQuestionCsv(text);
    if (error) { setCsvParseError(error); return; }
    setCsvPreviewRows(rows);
    if (csvImportRef.current) csvImportRef.current.value = '';
  };

  const handleCsvImportConfirm = async () => {
    if (!selectedBank || csvPreviewRows.length === 0) return;
    setIsImportingCsv(true);
    try {
      await window.electronAPI.cbt.bulkImport({ bank_id: selectedBank.id, questions: csvPreviewRows });
      await refreshQuestions(selectedBank.id);
      setShowAddQModal(false);
      setCsvPreviewRows([]);
      Swal?.fire({ title: `✅ ${csvPreviewRows.length} Questions Imported!`, icon: 'success', timer: 2000, showConfirmButton: false, background: '#0b0f19', color: '#fff' });
    } catch (e: any) {
      alert('Import failed: ' + e.message);
    } finally {
      setIsImportingCsv(false);
    }
  };

  // Scholar Document Ingestion
  const handleScholarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedBank || !Swal) return;
    
    // File size guard
    if (file.size > 15 * 1024 * 1024) {
      Swal.fire({ title: 'File Too Large', text: `Your file is ${(file.size/1024/1024).toFixed(1)}MB. Maximum allowed is 15MB.`, icon: 'warning', background: '#0b0f19', color: '#fff' });
      return;
    }

    Swal.fire({ 
      title: '🧠 Nexus Scholar Extracting…', 
      html: `<p style="color:rgba(255,255,255,0.6);">Reading <strong>${file.name}</strong> and detecting MCQ patterns…</p>`, 
      allowOutsideClick: false, 
      showConfirmButton: false, 
      background: '#0b0f19', 
      color: '#fff', 
      didOpen: () => Swal.showLoading() 
    });

    try {
      (window as any)._nexusBusy = true;
      const arrayBuffer = await file.arrayBuffer();
      const fileData = Array.from(new Uint8Array(arrayBuffer));
      const result = await window.electronAPI.cbt.scholarExtract({ fileData, fileName: file.name });
      (window as any)._nexusBusy = false;

      if (!result.ok) { 
        Swal.fire({ title: 'Extraction Failed', text: result.error, icon: 'error', background: '#0b0f19', color: '#fff' }); 
        return; 
      }
      if (!result.questions || !result.questions.length) { 
        Swal.fire({ title: 'No Questions Found', text: 'Scholar could not detect MCQ patterns in this document. Ensure the file contains numbered questions with A/B/C/D options.', icon: 'info', background: '#0b0f19', color: '#fff' }); 
        return; 
      }

      const methodNote = result.method === 'gemini' ? ' <span style="font-size:10px;color:#818cf8;">✨ Gemini AI</span>' : ' <span style="font-size:10px;color:rgba(255,255,255,0.3);">regex</span>';
      const diagCount = result.questions.filter((q: any) => q.has_diagram).length;
      const mathCount = result.questions.filter((q: any) => q.math_heavy).length;
      const flagNote = (diagCount || mathCount) ? `<p style="font-size:11px;color:#f59e0b;margin-top:6px;">⚠️ ${diagCount} diagram-dependent, ${mathCount} math-heavy — review before publishing.</p>` : '';

      const { isConfirmed } = await Swal.fire({
        title: `Found ${result.totalExtracted} Questions` + methodNote,
        html: `<p style="color:rgba(255,255,255,0.6);margin-bottom:12px;">From <strong>${file.name}</strong> (${result.fileSizeKB}KB). Preview of first 3:</p>
          <div style="text-align:left;max-height:200px;overflow-y:auto;font-size:12px;">${result.questions.slice(0,3).map((q: any, i: number)=>`<div style="margin-bottom:8px;padding:8px;background:rgba(255,255,255,0.05);border-radius:6px;"><strong>${i+1}. ${q.question_text.substring(0,80)}${q.question_text.length>80?'…':''}</strong><br><span style="color:rgba(255,255,255,0.5);">A: ${q.option_a} | B: ${q.option_b}</span></div>`).join('')}</div>${flagNote}`,
        background: '#0b0f19', color: '#fff',
        confirmButtonColor: '#10b981', confirmButtonText: `✅ Import All ${result.totalExtracted}`,
        showCancelButton: true, cancelButtonText: 'Cancel', width: 520
      });

      if (!isConfirmed) return;

      (window as any)._nexusBusy = true;
      Swal.fire({ title: 'Importing…', allowOutsideClick: false, showConfirmButton: false, background: '#0b0f19', color: '#fff', didOpen: () => Swal.showLoading() });
      await window.electronAPI.cbt.bulkImport({ bank_id: selectedBank.id, questions: result.questions });
      (window as any)._nexusBusy = false;
      await refreshQuestions(selectedBank.id);
      Swal.fire({ title: `✅ ${result.totalExtracted} Questions Imported!`, text: `Your question bank now has these questions ready for deployment.`, icon: 'success', background: '#0b0f19', color: '#fff', timer: 2500, showConfirmButton: false });
    } catch (err: any) {
      (window as any)._nexusBusy = false;
      Swal.fire('Error', err.message, 'error');
    } finally {
      if (scholarInputRef.current) scholarInputRef.current.value = '';
    }
  };

  // Premium update installer (.nexpack)
  const handleNexpackUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !Swal) return;

    setNexpackUploading(true);
    setNexpackStatus('Decrypting & Validating...');
    setNexpackProgress(20);

    // Simulate validation UX
    await new Promise(r => setTimeout(r, 600));
    setNexpackProgress(60);
    setNexpackStatus('Importing Database...');

    try {
      const res = await window.electronAPI.cbt.installNexPack({ filePath: (file as any).path });
      setNexpackProgress(100);
      setNexpackStatus('Complete!');
      
      setTimeout(() => {
        setNexpackUploading(false);
        setIsSettingsOpen(false);
        if (res.success) {
          Swal.fire({ title: 'Premium Pack Installed!', html: `Imported <b>${res.imported}</b> new questions.<br>Skipped ${res.skipped} existing.`, icon: 'success' });
          loadBanks();
        } else {
          Swal.fire("Error", res.error, "error");
        }
      }, 800);
    } catch (err: any) {
      setNexpackUploading(false);
      Swal.fire("Error", err.message, "error");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // CSV Drag and Drop candidate list uploader
  const handleCsvDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleCsvDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.endsWith('.csv')) {
      setCsvFile(file);
      setCsvStatus(`Loaded: ${file.name}`);
    } else {
      setCsvStatus('File must be a candidate CSV');
    }
  };

  // CSV parser for external candidate ingestion
  const parseCsv = async (file: File) => {
    const text = await file.text();
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (lines.length <= 1) return [];
    
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"_-]/g, ''));
    const candidates: any[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
      if (cols.length === 0 || !cols[0]) continue;
      
      let name = '';
      let phone = '';
      let targetClass = '';
      
      const firstNameIdx = headers.indexOf('firstname');
      const lastNameIdx = headers.indexOf('lastname');
      const nameIdx = headers.indexOf('name');
      const phoneIdx = headers.indexOf('phone') !== -1 ? headers.indexOf('phone') : headers.indexOf('guardianphone');
      const classIdx = headers.indexOf('class') !== -1 ? headers.indexOf('class') : headers.indexOf('targetclass');
      
      if (nameIdx !== -1 && cols[nameIdx]) {
        name = cols[nameIdx];
      } else if (firstNameIdx !== -1 && lastNameIdx !== -1 && cols[firstNameIdx]) {
        name = `${cols[firstNameIdx]} ${cols[lastNameIdx]}`.trim();
      } else {
        name = cols[0];
      }
      
      if (phoneIdx !== -1 && cols[phoneIdx]) {
        phone = cols[phoneIdx];
      }
      
      if (classIdx !== -1 && cols[classIdx]) {
        targetClass = cols[classIdx];
      }
      
      candidates.push({
        name,
        guardian_phone: phone || '',
        dob_year: 2010,
        dob_month: 1,
        dob_day: 1,
        exam_year: new Date().getFullYear(),
        exam_month: new Date().getMonth() + 1,
        exam_day: new Date().getDate(),
        target_class: targetClass || (deployClassLevel ? `${deployClassLevel} ${deployClassArm}`.trim() : 'General'),
        subjects: 'General'
      });
    }
    return candidates;
  };

  // Deploying Exam template
  const handleDeployExam = async () => {
    const deployClassName = deployClassLevel
      ? (deployClassArm ? `${deployClassLevel} ${deployClassArm}` : deployClassLevel)
      : '';
    if (!deployTitle || !deployBankId || !deployClassLevel) {
      if (Swal) {
        Swal.fire({
          title: 'Required Fields Missing',
          text: "Please fill all required fields (Title, Question Bank, Class Level).",
          icon: 'warning',
          background: '#0b0f19',
          color: '#fff',
          confirmButtonColor: '#f59e0b'
        });
      } else {
        alert("Please fill all required fields (Title, Question Bank, Class Level).");
      }
      return;
    }

    let candidates: any[] = [];
    if (deployExamType === 'external') {
      if (!csvFile) {
        if (Swal) {
          Swal.fire({
            title: 'Candidate CSV Required',
            text: "Please upload a Candidate CSV for external exams.",
            icon: 'warning',
            background: '#0b0f19',
            color: '#fff',
            confirmButtonColor: '#f59e0b'
          });
        } else {
          alert("Please upload a Candidate CSV for external exams.");
        }
        return;
      }
      try {
        candidates = await parseCsv(csvFile);
        if (candidates.length === 0) {
          if (Swal) {
            Swal.fire({
              title: 'Empty Candidate List',
              text: "No valid candidates found in the CSV file.",
              icon: 'warning',
              background: '#0b0f19',
              color: '#fff',
              confirmButtonColor: '#f59e0b'
            });
          } else {
            alert("No valid candidates found in the CSV file.");
          }
          return;
        }
      } catch (err: any) {
        if (Swal) {
          Swal.fire({
            title: 'CSV Parse Error',
            text: "Failed to parse candidate CSV: " + err.message,
            icon: 'error',
            background: '#0b0f19',
            color: '#fff',
            confirmButtonColor: '#ef4444'
          });
        } else {
          alert("Failed to parse candidate CSV: " + err.message);
        }
        return;
      }
    }

    const payload = {
      title: deployTitle,
      bank_id: parseInt(deployBankId),
      class_name: deployClassName,
      class_level: deployClassLevel,
      class_arm: deployClassArm || null,
      academic_session: academicSession || '2025/2026',
      term: deployTerm || availableTerms[0] || 'First',
      pc_count: deployPcCount,
      question_count: deployCount,
      duration_minutes: deployDuration,
      exam_type: deployExamType,
      is_promotional: isPromotional,
      shuffle_questions: shuffleQuestions,
      shuffle_options: shuffleOptions,
      result_release_policy: releasePolicy,
      security_profile: {
        calculator: enableCalculator,
        kiosk: enforceKiosk
      }
    };

    try {
      const res = await window.electronAPI.cbt.deployExam(payload);
      if (res.success) {
        const examId = res.id;

        if (deployExamType === 'external') {
          // Import external candidates
          const importRes = await window.electronAPI.cbt.importExternalCandidates(candidates);
          if (importRes.success && importRes.ids && importRes.ids.length > 0) {
            // Generate tokens for the imported candidates
            await window.electronAPI.cbt.generateTokens({
              exam_id: examId,
              batch_id: null,
              is_external: true,
              target_ids: importRes.ids
            });
          }
        }

        if (Swal) {
          Swal.fire({ icon:'success', title:'Exam Deployed!', text:'Switching to Live Command Center.', timer:1500, showConfirmButton:false, background:'#0b0f19', color:'#fff' });
        } else {
          alert('Exam Deployed Successfully!');
        }
        
        // Reset deploy form
        setDeployTitle('');
        setDeployClassLevel('');
        setDeployClassArm('');
        setCsvFile(null);
        setCsvStatus('');

        // Switch to live invigilation tab
        setTimeout(() => setActiveTab('live'), 1600);
      } else {
        if (Swal) Swal.fire({ title: 'Error', text: res.error || 'Deploy failed.', icon: 'error', background: '#0b0f19', color: '#fff', confirmButtonColor: '#ef4444' });
        else alert('Error: ' + (res.error || 'Deploy failed.'));
      }
    } catch (e: any) {
      if (Swal) Swal.fire({ title: 'Error', text: e.message, icon: 'error', background: '#0b0f19', color: '#fff', confirmButtonColor: '#ef4444' });
      else alert('Error: ' + e.message);
    }
  };

  // Live Dashboard Actions
  const loadLiveExams = async () => {
    setIsLoadingLiveExams(true);
    try {
      const exams = await window.electronAPI.cbt.getExams();
      setLiveExams(exams || []);
    } catch (e) {
      console.error("Failed to load active exams", e);
    } finally {
      setIsLoadingLiveExams(false);
    }
  };

  const handleSelectLiveExam = async (ex: any) => {
    setSelectedLiveExam(ex);
    refreshLiveDashboard(ex.id);
  };

  const handleDeleteExam = async (e: React.MouseEvent, exam: any) => {
    e.stopPropagation();
    requireSudo(async () => {
      try {
        await window.electronAPI.cbt.deleteExam({ exam_id: exam.id });
        if (selectedLiveExam?.id === exam.id) {
          setSelectedLiveExam(null);
        }
        loadLiveExams();
        Swal.fire({
          title: "Deleted",
          text: `Exam "${exam.title}" has been deleted.`,
          icon: "success",
          background: '#0b0f19',
          color: '#fff',
          timer: 1500,
          showConfirmButton: false
        });
      } catch (err: any) {
        Swal.fire({
          title: "Error",
          text: err.message,
          icon: "error",
          background: '#0b0f19',
          color: '#fff',
          confirmButtonColor: '#ef4444'
        });
      }
    }, 'Delete Deployed Exam', `Permanently delete exam "${exam.title}"? This will invalidate and delete all generated candidate tokens and answers.`);
  };

  const refreshLiveDashboard = async (examId: number) => {
    try {
      const batches = await window.electronAPI.cbt.getBatches(examId);
      setLiveBatches(batches || []);

      const tokens = await window.electronAPI.cbt.getTokens(examId);
      setLiveTokens(tokens || []);
    } catch (e) {
      console.error("Failed to refresh live invigilation dashboard", e);
    }
  };

  const handleOpenBatch = async () => {
    if (!selectedLiveExam || !Swal) return;
    
    const { value: formValues } = await Swal.fire({
      title: 'Open New Batch',
      html:
        '<div style="text-align: left; padding: 10px; font-size: 14px;">' +
          '<label style="display: block; margin-bottom: 6px; color: var(--text-dim);">Batch Name *</label>' +
          '<input id="swal-batch-name" type="text" class="swal2-input" placeholder="e.g. Batch A" style="margin: 0 0 15px 0; width: 100%; box-sizing: border-box;" />' +
          '<label style="display: block; margin-bottom: 6px; color: var(--text-dim);">Date *</label>' +
          '<input id="swal-batch-date" type="date" class="swal2-input" style="margin: 0 0 15px 0; width: 100%; box-sizing: border-box; color-scheme: dark;" />' +
          '<label style="display: block; margin-bottom: 6px; color: var(--text-dim);">Start Time *</label>' +
          '<input id="swal-batch-start" type="time" class="swal2-input" style="margin: 0 0 15px 0; width: 100%; box-sizing: border-box; color-scheme: dark;" />' +
          '<label style="display: block; margin-bottom: 6px; color: var(--text-dim);">End Time *</label>' +
          '<input id="swal-batch-end" type="time" class="swal2-input" style="margin: 0 0 15px 0; width: 100%; box-sizing: border-box; color-scheme: dark;" />' +
        '</div>',
      focusConfirm: false,
      showCancelButton: true,
      background: '#0b0f19',
      color: '#fff',
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#ef4444',
      didOpen: () => {
        // Prefill default date with today
        const todayStr = new Date().toISOString().split('T')[0];
        const dateInput = document.getElementById('swal-batch-date') as HTMLInputElement;
        if (dateInput) dateInput.value = todayStr;
        
        const startInput = document.getElementById('swal-batch-start') as HTMLInputElement;
        const endInput = document.getElementById('swal-batch-end') as HTMLInputElement;
        
        const duration = selectedLiveExam.duration_minutes || 60;
        
        const updateEndTime = () => {
          if (startInput && startInput.value) {
            const parts = startInput.value.split(':');
            if (parts.length === 2) {
              const hours = parseInt(parts[0], 10);
              const minutes = parseInt(parts[1], 10);
              if (!isNaN(hours) && !isNaN(minutes)) {
                const totalMinutes = hours * 60 + minutes + Number(duration);
                const endHours = Math.floor(totalMinutes / 60) % 24;
                const endMinutes = totalMinutes % 60;
                const pad = (n: number) => String(n).padStart(2, '0');
                if (endInput) endInput.value = `${pad(endHours)}:${pad(endMinutes)}`;
              }
            }
          }
        };
        
        if (startInput) {
          startInput.addEventListener('change', updateEndTime);
        }
      },
      preConfirm: () => {
        const name = (document.getElementById('swal-batch-name') as HTMLInputElement).value;
        const date = (document.getElementById('swal-batch-date') as HTMLInputElement).value;
        const start = (document.getElementById('swal-batch-start') as HTMLInputElement).value;
        const end = (document.getElementById('swal-batch-end') as HTMLInputElement).value;
        
        if (!name || !date || !start || !end) {
          Swal.showValidationMessage('Please fill all required fields');
          return false;
        }
        
        return { name, date, start, end };
      }
    });

    if (!formValues) return;

    try {
      await window.electronAPI.cbt.createBatch({ 
        exam_id: selectedLiveExam.id, 
        name: formValues.name, 
        exam_date: formValues.date,
        start_time: formValues.start, 
        end_time: formValues.end
      });
      refreshLiveDashboard(selectedLiveExam.id);
    } catch(err: any) { 
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

  const handleDispatchPulseNotifications = async () => {
    if (!selectedLiveExam || !Swal) return;
    
    const { value: formValues } = await Swal.fire({
      title: '📢 Nexus Pulse Broadcast',
      html:
        '<div style="text-align: left; padding: 10px; font-size: 14px;">' +
          '<p style="margin-bottom: 15px; color: var(--text-dim);">Select who you would like to broadcast the exam schedule to. Messages will be queued in Nexus Pulse.</p>' +
          '<label style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px; cursor: pointer; color: #fff;">' +
            '<input id="swal-notify-parents" type="checkbox" checked style="width: 18px; height: 18px;" />' +
            '<div>' +
              '<strong>Notify Parents/Guardians</strong>' +
              '<div style="font-size: 11px; color: var(--text-dim); margin-top: 2px;">Sends exam date, batch assignment, and candidate access token.</div>' +
            '</div>' +
          '</label>' +
          '<label style="display: flex; align-items: center; gap: 10px; cursor: pointer; color: #fff;">' +
            '<input id="swal-notify-teachers" type="checkbox" checked style="width: 18px; height: 18px;" />' +
            '<div>' +
              '<strong>Notify Teachers/Invigilators</strong>' +
              '<div style="font-size: 11px; color: var(--text-dim); margin-top: 2px;">Sends invigilation duty alert for this exam.</div>' +
            '</div>' +
          '</label>' +
        '</div>',
      focusConfirm: false,
      showCancelButton: true,
      background: '#0b0f19',
      color: '#fff',
      confirmButtonColor: '#818cf8',
      confirmButtonText: 'Queue Broadcasts 🚀',
      preConfirm: () => {
        return {
          notifyParents: (document.getElementById('swal-notify-parents') as HTMLInputElement).checked,
          notifyTeachers: (document.getElementById('swal-notify-teachers') as HTMLInputElement).checked
        }
      }
    });

    if (!formValues) return;

    if (!formValues.notifyParents && !formValues.notifyTeachers) {
      Swal.fire({
        title: 'Cancelled',
        text: 'No notification targets selected.',
        icon: 'info',
        background: '#0b0f19',
        color: '#fff',
        confirmButtonColor: '#3085d6'
      });
      return;
    }

    try {
      Swal.fire({
        title: 'Queueing Messages...',
        text: 'Please wait while messages are compiled and added to the Pulse queue.',
        allowOutsideClick: false,
        background: '#0b0f19',
        color: '#fff',
        didOpen: () => {
          Swal.showLoading();
        }
      });

      const res = await window.electronAPI.cbt.dispatchPulseNotifications({
        exam_id: selectedLiveExam.id,
        notify_parents: formValues.notifyParents,
        notify_teachers: formValues.notifyTeachers
      });

      if (res.success) {
        let successMsg = '';
        if (formValues.notifyParents && formValues.notifyTeachers) {
          successMsg = `Queued ${res.parentsCount} parent message(s) and ${res.teachersCount} teacher message(s).`;
        } else if (formValues.notifyParents) {
          successMsg = `Queued ${res.parentsCount} parent message(s).`;
        } else {
          successMsg = `Queued ${res.teachersCount} teacher message(s).`;
        }

        Swal.fire({
          title: 'Pulse Broadcast Queued',
          text: successMsg + ' Nexus Pulse will dispatch these messages sequentially in the background.',
          icon: 'success',
          background: '#0b0f19',
          color: '#fff',
          confirmButtonColor: '#10b981'
        });
      }
    } catch (e: any) {
      Swal.fire({
        title: 'Error',
        text: `Failed to queue messages: ${e.message}`,
        icon: 'error',
        background: '#0b0f19',
        color: '#fff',
        confirmButtonColor: '#ef4444'
      });
    }
  };

  const handleGenerateTokens = async () => {
    try {
      if (selectedLiveExam.exam_type === 'external') {
        Swal.fire({
          title: 'Info',
          text: "Tokens are generated automatically during External candidate CSV deployment.",
          icon: 'info',
          background: '#0b0f19',
          color: '#fff',
          confirmButtonColor: '#3085d6'
        });
        return;
      }

      // Use the dedicated IPC that handles optional class_arm gracefully.
      const examClassName  = selectedLiveExam.class_name  || '';
      const examClassArm   = selectedLiveExam.class_arm   || null;
      // Back-compat: if class_arm not stored on exam, use regex to split composite names (e.g. "JSS1A" → level "JSS1", arm "A")
      const matchArm = examClassName.trim().match(/^([A-Za-z\s]+[0-9]+)\s*([A-Za-z])$/);
      const resolvedLevel = matchArm ? matchArm[1].trim() : examClassName.trim();
      const resolvedArm   = examClassArm || (matchArm ? matchArm[2] : null);

      const classStudents = await window.electronAPI.cbt.getStudentsForClass({
        class_name: resolvedLevel,
        class_arm:  resolvedArm || 'all'
      });

      if (!classStudents || classStudents.length === 0) {
        Swal.fire({
          title: 'No Students Found',
          html: `No students found for <strong>${examClassName}</strong>.<br><small style="color:rgba(255,255,255,0.5)">Check the Student Ledger — ensure students have the correct Class Level${resolvedArm ? ' and Arm' : ''} set.</small>`,
          icon: 'warning',
          background: '#0b0f19',
          color: '#fff',
          confirmButtonColor: '#f59e0b'
        });
        return;
      }

      // ── Resolve which batch to assign tokens to ──────────────────────────────
      // If batches already exist, auto-assign (1 batch) or prompt the admin to pick (multiple).
      let resolvedBatchId: number | null = null;
      let resolvedBatchName = '';
      if (liveBatches.length === 1) {
        resolvedBatchId = liveBatches[0].id;
        resolvedBatchName = liveBatches[0].name;
      } else if (liveBatches.length > 1) {
        const inputOptions: Record<string, string> = {};
        liveBatches.forEach((b: any) => { inputOptions[b.id] = `${b.name} (${b.status})`; });
        const { value: pickedId } = await Swal.fire({
          title: 'Select Batch',
          text: 'Assign generated tokens to which batch?',
          input: 'select',
          inputOptions,
          inputPlaceholder: 'Choose a batch…',
          showCancelButton: true,
          background: '#0b0f19',
          color: '#fff',
          confirmButtonColor: '#00e5ff',
        });
        if (!pickedId) return; // admin cancelled
        resolvedBatchId = Number(pickedId);
        const matchedBatch = liveBatches.find((b: any) => b.id === resolvedBatchId);
        resolvedBatchName = matchedBatch ? matchedBatch.name : `Batch #${resolvedBatchId}`;
      } else {
        Swal.fire({
          title: 'No Batches Found',
          text: 'Please create a batch first before generating tokens.',
          icon: 'warning',
          background: '#0b0f19',
          color: '#fff',
          confirmButtonColor: '#f59e0b'
        });
        return;
      }

      // ── PC-Aware batch slicing ──────────────────────────────────────────────
      const pcCount = selectedLiveExam.pc_count || 30;
      const alreadyTokenizedIds = liveTokens.map((t: any) => t.student_id).filter(Boolean);
      const unassignedPool = classStudents.filter((s: any) => !alreadyTokenizedIds.includes(s.id));

      if (unassignedPool.length === 0) {
        Swal.fire({
          title: 'All Students Assigned',
          text: `All ${classStudents.length} students in this class already have exam tokens.`,
          icon: 'info',
          background: '#0b0f19',
          color: '#fff',
          confirmButtonColor: '#3085d6'
        });
        return;
      }

      // Shuffle using Fisher-Yates
      const shuffled = [...unassignedPool];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      // Slice the unassigned pool to seat limit
      const batchSlice = shuffled.slice(0, pcCount);
      const remainingCount = unassignedPool.length - batchSlice.length;

      const confirmText = `This will generate ${batchSlice.length} tokens for "${resolvedBatchName}" ` +
        `(${pcCount} PCs available). ` +
        `${remainingCount} student(s) will remain unassigned after this batch. Proceed?`;

      const { isConfirmed } = await Swal.fire({
        title: 'Confirm Token Generation',
        text: confirmText,
        icon: 'question',
        showCancelButton: true,
        background: '#0b0f19',
        color: '#fff',
        confirmButtonColor: '#10b981',
        cancelButtonColor: '#d33'
      });

      if (!isConfirmed) return;

      const studentIds = batchSlice.map((s: any) => s.id);

      const genRes = await window.electronAPI.cbt.generateTokens({
        exam_id: selectedLiveExam.id,
        batch_id: resolvedBatchId,
        is_external: false,
        target_ids: studentIds
      });

      if (genRes.success) {
        Swal.fire({
          title: 'Tokens Generated',
          text: `Successfully generated ${genRes.generated} candidate token${genRes.generated !== 1 ? 's' : ''} for "${examClassName}"!`,
          icon: 'success',
          background: '#0b0f19',
          color: '#fff',
          confirmButtonColor: '#10b981'
        });
        refreshLiveDashboard(selectedLiveExam.id);
      } else {
        Swal.fire({
          title: 'Error',
          text: `Error generating tokens: ${genRes.error || 'Unknown error'}`,
          icon: 'error',
          background: '#0b0f19',
          color: '#fff',
          confirmButtonColor: '#ef4444'
        });
      }
    } catch (e: any) {
      Swal.fire({
        title: 'Error',
        text: `Error generating tokens: ${e.message}`,
        icon: 'error',
        background: '#0b0f19',
        color: '#fff',
        confirmButtonColor: '#ef4444'
      });
    }
  };

  // Finalize exam logic
  const handleFinalizeExam = async () => {
    if (!selectedLiveExam || !Swal) return;

    if (!selectedLiveExam.is_promotional) {
      // Standard Finalization
      const { isConfirmed } = await Swal.fire({
        title: 'Finalize Exam?',
        text: 'This will lock the exam and dispatch results to Nexus Pulse WhatsApp.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Finalize & Dispatch',
        background: '#0b0f19', color: '#fff',
        confirmButtonColor: '#f59e0b'
      });
      if (isConfirmed) {
        Swal.fire({
          title: 'Success!',
          text: 'Exam finalized and results queued for WhatsApp dispatch.',
          icon: 'success',
          background: '#0b0f19', color: '#fff',
          confirmButtonColor: '#10b981'
        });
      }
      return;
    }

    // Promotional Overrides Dashboard Modal flow
    try {
      const sysSettings = await window.electronAPI.cbt.getSystemSettings();
      const passMark = sysSettings.pass_mark_threshold || 50;
      const tokens = await window.electronAPI.cbt.getTokens(selectedLiveExam.id);
      
      const attemptedTokens = tokens.filter((t: any) => t.status === 'completed' || t.status === 'active');
      
      let tbodyHtml = '';
      attemptedTokens.forEach((t: any) => {
        const score = t.score || 0;
        const passed = score >= passMark;
        
        tbodyHtml += `
          <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
            <td style="padding:10px; text-align: left;">${t.candidate_name || 'Unknown'}</td>
            <td style="text-align: left;">${t.class_name || '-'}</td>
            <td style="font-weight:bold; text-align: left; color:${passed ? '#10b981' : '#ef4444'};">${score}%</td>
            <td style="text-align: left;">
              <select class="promo-toggle swal-custom-select" data-token-id="${t.id}" data-student-id="${t.student_id}" style="padding:4px 8px; font-size:11px; border-radius: 6px; border: 1px solid ${passed ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}; background:${passed ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'}; color:${passed ? '#10b981' : '#ef4444'};">
                <option value="promote" ${passed ? 'selected' : ''}>Promote</option>
                <option value="hold_back" ${!passed ? 'selected' : ''}>Hold Back</option>
              </select>
            </td>
          </tr>
        `;
      });

      if (!tbodyHtml) {
        tbodyHtml = `<tr><td colspan="4" style="text-align:center; padding:20px;">No candidates have completed this exam yet.</td></tr>`;
      }

      const html = `
        <div style="text-align:left; font-size:13px;">
          <div style="background:rgba(255,215,0,0.1); padding:10px; border-radius:8px; margin-bottom:15px; border:1px solid rgba(255,215,0,0.3); color:#ffd700;">
            <strong>Promotional Exam Review</strong><br/>
            Global Pass Mark: ${passMark}%
          </div>
          <table style="width:100%; border-collapse:collapse;">
            <thead>
              <tr style="color:rgba(255,255,255,0.6); border-bottom:1px solid rgba(255,255,255,0.1); text-align: left;">
                <th style="padding:10px; text-align: left;">Student</th>
                <th style="text-align: left;">Current Class</th>
                <th style="text-align: left;">Score</th>
                <th style="text-align: left;">Action (Override)</th>
              </tr>
            </thead>
            <tbody>${tbodyHtml}</tbody>
          </table>
        </div>
      `;

      const { value: overrides, isConfirmed } = await Swal.fire({
        title: 'Promotion Review Dashboard',
        html: html,
        width: '600px',
        showCancelButton: true,
        confirmButtonText: 'Execute Promotions',
        confirmButtonColor: '#10b981',
        background: '#0b0f19', color: '#fff',
        preConfirm: () => {
          const selects = document.querySelectorAll('.promo-toggle');
          const finalOverrides: any[] = [];
          selects.forEach(s => {
            finalOverrides.push({
              token_id: s.getAttribute('data-token-id'),
              student_id: s.getAttribute('data-student-id'),
              action: (s as HTMLSelectElement).value
            });
          });
          return finalOverrides;
        }
      });

      if (isConfirmed && overrides) {
        await window.electronAPI.cbt.finalizePromotionalExam({ exam_id: selectedLiveExam.id, overrides });
        Swal.fire("Promotions Executed!", "The student ledger has been updated successfully.", "success");
      }
    } catch(e: any) {
      Swal.fire("Error", e.message, "error");
    }
  };

  // Exam Clearance Scanner tab handler
  const handleClearanceScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanData.trim()) return;
    
    setIsScanning(true);
    setClearanceResult(null);
    
    try {
      const res = await window.electronAPI.fees.getTransactions({
        student_id: scanData.trim(),
        academic_session: '2025/2026',
        term: 'First Term'
      });
      
      if (res.ok) {
        const transactions = res.data;
        const lastTx = transactions.length > 0 ? transactions[0] : null;
        
        if (lastTx && lastTx.status === 'cleared') {
           setClearanceResult({ status: 'cleared', message: 'Cleared for Examination' });
        } else {
           setClearanceResult({ status: 'blocked', message: 'Outstanding Debt - Blocked' });
        }
      } else {
        setClearanceResult({ status: 'blocked', message: 'No Financial Record Found' });
      }
    } catch (err) {
      setClearanceResult({ status: 'error', message: 'System Verification Failed' });
    } finally {
      setIsScanning(false);
      setScanData('');
      scannerInputRef.current?.focus();
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden p-8 relative">
      {/* View Header */}
      <div className="flex justify-between items-start mb-8 select-none shrink-0">
        <div>
          <h2 className="view-title" style={{ background: 'linear-gradient(135deg, #FFD700, #FDB931)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            CBT Arena 💎
          </h2>
          <p className="view-sub">Advanced Computer Based Testing Engine &amp; Admissions Pipeline.</p>
        </div>
        
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button 
            onClick={() => (window as any).showModuleSetupGuide?.('cbt')}
            className="primary-btn" 
            style={{ padding: '7px 16px', fontSize: '12px', background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.3)', color: '#00e5ff', boxShadow: 'none' }}
          >
            💡 Setup Guide
          </button>
          
          <div id="cbt-external-balance-display" style={{ background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.3)', padding: '6px 12px', borderRadius: '20px', fontSize: '12px', color: '#FFD700', fontWeight: 'bold' }}>
            Token Balance: <span id="cbt-balance-count">{tokenBalance}</span>
          </div>
          
          <button 
            onClick={handleAddTokens}
            id="btn-cbt-buy-tokens"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', color: 'var(--text-dim)', padding: '6px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}
          >
            Add Tokens 🔑
          </button>
          
          <button 
            onClick={() => { loadSystemSettings(); setIsSettingsOpen(true); }}
            className="small-btn" 
            title="CBT Settings" 
            style={{ fontSize: '16px', padding: '6px 10px', background: 'rgba(255,255,255,0.06)', borderColor: 'var(--glass-border)', cursor: 'pointer' }}
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* CBT Tab Navigation */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }} className="select-none shrink-0">
        {[
          { id: 'banks', label: 'Question Banks', icon: '📚' },
          { id: 'deploy', label: 'Deploy Exam', icon: '🚀' },
          { id: 'live', label: 'Live Invigilation', icon: '📡' },
          { id: 'clearance', label: 'Exam Clearance', icon: '🎫' },
          { id: 'about', label: 'About', icon: 'ℹ️' }
        ].map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as any);
                setStudioMode('list');
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: isActive ? '#fff' : 'var(--text-dim)',
                cursor: 'pointer',
                fontSize: '14px',
                padding: '5px 10px',
                borderRadius: '4px',
                fontWeight: isActive ? '600' : '400',
              }}
              className="ph-tab"
            >
              {tab.icon} {tab.label}
            </button>
          );
        })}
      </div>

      {/* Main Workspace Container */}
      <div className="flex-1 overflow-y-auto min-h-0 relative select-none pt-2">
        
        {/* TAB 1: QUESTION BANKS */}
        {activeTab === 'banks' && (
          <div className="h-full">
            {studioMode === 'list' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                {/* Section Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <h3 style={{ fontSize: 'var(--text-h2)', fontWeight: 700, margin: '0', color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
                        Question Bank Library
                      </h3>
                      {!isLoadingBanks && banksList.length > 0 && (
                        <span style={{ fontSize: '11px', fontWeight: 700, background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.2)', color: 'var(--accent)', padding: '2px 10px', borderRadius: '20px' }}>
                          {banksList.length} Bank{banksList.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <p style={{ margin: '4px 0 0', fontSize: 'var(--text-body)', color: 'var(--text-dim)', lineHeight: 'var(--lh-body)' }}>
                      Click any bank to open its Question Studio and manage questions.
                    </p>
                  </div>
                  <button 
                    onClick={handleCreateBank}
                    className="primary-btn"
                    id="btn-create-bank"
                  >
                    + Create New Bank
                  </button>
                </div>

                {isLoadingBanks ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '60px 20px', border: '1px dashed var(--glass-border)', borderRadius: 'var(--radius-lg)' }}>
                    <div className="bar-container"><div className="bar-fill" /></div>
                    <span style={{ color: 'var(--text-dim)', fontSize: '13px' }}>Loading Question Banks…</span>
                  </div>
                ) : banksList.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', padding: '70px 20px', border: '1px dashed var(--glass-border)', borderRadius: 'var(--radius-lg)', background: 'rgba(0,0,0,0.1)' }}>
                    <span style={{ fontSize: '40px' }}>📚</span>
                    <div style={{ textAlign: 'center' }}>
                      <h4 style={{ color: 'var(--text-main)', fontSize: '15px', fontWeight: 700, margin: '0 0 6px' }}>No Question Banks Yet</h4>
                      <p style={{ color: 'var(--text-dim)', fontSize: '12px', margin: 0, lineHeight: 1.7 }}>Create your first bank to start building your question library.</p>
                    </div>
                    <button onClick={handleCreateBank} className="primary-btn" style={{ marginTop: '4px' }}>+ Create New Bank</button>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--grid-gap)' }}>
                    {banksList.map(b => (
                      <div 
                        key={b.id} 
                        onClick={() => openBankStudio(b)}
                        style={{
                          background: 'linear-gradient(145deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))',
                          backdropFilter: 'blur(24px)',
                          border: '1px solid var(--glass-border)',
                          borderRadius: 'var(--radius-lg)',
                          padding: 'var(--card-pad-sm)',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          gap: '14px',
                          transition: 'border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease',
                          minHeight: '148px',
                        }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent)';
                          (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-3px)';
                          (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 28px rgba(0,229,255,0.10)';
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--glass-border)';
                          (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
                          (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                            <span style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '15px', lineHeight: 1.3 }}>{b.name}</span>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                              {b.is_premium && (
                                <span style={{ fontSize: '10px', background: 'rgba(255,193,7,0.1)', border: '1px solid rgba(255,193,7,0.3)', color: '#FFC107', fontWeight: 700, padding: '2px 7px', borderRadius: '8px', whiteSpace: 'nowrap' }}>🔒 PREMIUM</span>
                              )}
                              <button 
                                onClick={(e) => handleEditBank(e, b)}
                                style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                                title="Edit Bank"
                              >
                                <Edit2 size={13} style={{ transition: 'color 0.2s' }} onMouseEnter={e => (e.target as any).style.color = 'var(--accent)'} onMouseLeave={e => (e.target as any).style.color = 'var(--text-dim)'} />
                              </button>
                              <button 
                                onClick={(e) => handleDeleteBank(e, b)}
                                style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                                title="Delete Bank"
                              >
                                <Trash2 size={13} style={{ transition: 'color 0.2s' }} onMouseEnter={e => (e.target as any).style.color = '#ef4444'} onMouseLeave={e => (e.target as any).style.color = 'var(--text-dim)'} />
                              </button>
                            </div>
                          </div>
                          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {b.description || 'No description provided'}
                          </p>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, background: 'rgba(140,158,255,0.1)', border: '1px solid rgba(140,158,255,0.2)', color: 'var(--accent-indigo)', padding: '3px 10px', borderRadius: '12px' }}>
                            {b.class_category || b.category || 'General'}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                            Click to edit questions ➔
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Question Studio View */
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-border)', paddingBottom: '16px' }}>
                  <div>
                    <button 
                      onClick={() => setStudioMode('list')}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-dim)',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: 0,
                        marginBottom: '8px',
                        transition: 'color 0.2s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.color = 'var(--text-main)'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--text-dim)'}
                    >
                      <ArrowLeft size={14} /> Back to Banks
                    </button>
                    <h3 className="view-title" style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
                      {selectedBank?.name} — Question Studio
                    </h3>
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button 
                      onClick={handleAddQuestion}
                      className="primary-btn"
                      style={{ padding: '8px 16px', fontSize: '12px' }}
                    >
                      <Plus size={16} /> Add Question
                    </button>
                    
                    <button 
                      onClick={() => scholarInputRef.current?.click()}
                      className="secondary-btn"
                      style={{
                        padding: '8px 16px',
                        fontSize: '12px',
                        borderColor: 'rgba(140, 158, 255, 0.35)',
                        color: 'var(--accent-indigo)'
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = 'rgba(140, 158, 255, 0.08)';
                        e.currentTarget.style.borderColor = 'var(--accent-indigo)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.borderColor = 'rgba(140, 158, 255, 0.35)';
                      }}
                    >
                      Upload via Nexus Scholar 🪄
                    </button>
                    <input 
                      type="file" 
                      ref={scholarInputRef} 
                      onChange={handleScholarUpload} 
                      accept=".pdf,.docx,.txt" 
                      style={{ display: 'none' }}
                    />
                  </div>
                </div>

                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-dim)' }}>
                  {studioQuestions.length} question{studioQuestions.length !== 1 ? 's' : ''} in this bank
                </div>

                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', minHeight: 0 }}>
                  {isLoadingQuestions ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>Loading questions…</div>
                  ) : studioQuestions.length === 0 ? (
                    <div style={{
                      background: 'rgba(0, 0, 0, 0.15)',
                      border: '1px dashed var(--glass-border)',
                      borderRadius: 'var(--radius-lg)',
                      padding: '40px 24px',
                      textAlign: 'center',
                      color: 'var(--text-dim)',
                      maxWidth: '500px',
                      margin: '40px auto',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '12px'
                    }}>
                      <span style={{ fontSize: '36px' }}>📝</span>
                      <h4 style={{ color: 'var(--text-main)', fontSize: '15px', fontWeight: 700, margin: 0 }}>No questions yet</h4>
                      <p style={{ fontSize: '12px', color: 'var(--text-dim)', margin: 0, lineHeight: 1.6 }}>
                        Use <strong style={{ color: 'var(--accent)' }}>+ Add Question</strong> or <strong style={{ color: 'var(--accent-indigo)' }}>Upload via Nexus Scholar</strong> to populate this bank.
                      </p>
                    </div>
                  ) : (
                    studioQuestions.map((q, idx) => (
                      <div 
                        key={q.id} 
                        className="glass"
                        style={{
                          padding: '24px',
                          borderRadius: 'var(--radius-lg)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '16px',
                          transition: 'transform 0.2s, border-color 0.2s, box-shadow 0.2s'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.borderColor = 'rgba(140, 158, 255, 0.35)';
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.boxShadow = '0 8px 30px rgba(140, 158, 255, 0.06)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.borderColor = 'var(--glass-border)';
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', flex: 1, lineHeight: 1.6 }}>
                            <span style={{ color: 'var(--text-dim)', marginRight: '8px' }}>{idx + 1}.</span>
                            {q.question_text}
                          </div>
                          <span style={{
                            flexShrink: 0,
                            fontSize: '11px',
                            fontWeight: 700,
                            background: 'rgba(0, 230, 118, 0.08)',
                            border: '1px solid rgba(0, 230, 118, 0.25)',
                            color: 'var(--accent-green)',
                            padding: '4px 10px',
                            borderRadius: '20px'
                          }}>
                            {q.marks || 1} MK
                          </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                          {['a', 'b', 'c', 'd'].map(letter => {
                            const isCorrect = q.correct_option?.toUpperCase() === letter.toUpperCase();
                            return (
                              <div 
                                key={letter}
                                style={{
                                  fontSize: '12.5px',
                                  padding: '12px 16px',
                                  borderRadius: 'var(--radius-sm)',
                                  border: isCorrect ? '1px solid rgba(0, 230, 118, 0.35)' : '1px solid var(--glass-border)',
                                  background: isCorrect ? 'rgba(0, 230, 118, 0.08)' : 'rgba(0,0,0,0.15)',
                                  color: isCorrect ? 'var(--accent-green)' : 'var(--text-dim)',
                                  fontWeight: isCorrect ? 700 : 500,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px'
                                }}
                              >
                                <span style={{ 
                                  textTransform: 'uppercase', 
                                  fontWeight: 800,
                                  color: isCorrect ? 'var(--accent-green)' : 'var(--accent)'
                                }}>{letter}.</span>
                                <span style={{ color: isCorrect ? '#fff' : 'inherit' }}>
                                  {q['option_' + letter] || '—'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px dashed var(--glass-border)', paddingTop: '12px', marginTop: '4px' }}>
                          <button 
                            onClick={() => handleEditQuestion(q)}
                            className="secondary-btn"
                            style={{ padding: '4px 10px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Edit2 size={12} /> Edit
                          </button>
                          <button 
                            onClick={() => handleDeleteQuestion(q)}
                            className="secondary-btn"
                            style={{ padding: '4px 10px', fontSize: '11px', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.25)', display: 'flex', alignItems: 'center', gap: '4px' }}
                            onMouseEnter={e => {
                              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)';
                              e.currentTarget.style.borderColor = '#ef4444';
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.background = 'transparent';
                              e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.25)';
                            }}
                          >
                            <Trash2 size={12} /> Delete
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: DEPLOY EXAM */}
        {activeTab === 'deploy' && (
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '20px', display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
            {/* Left: Form Area */}
            <div style={{ flex: 2 }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#fff', marginBottom: '20px', margin: '0 0 20px 0' }}>Deploy New Exam</h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
                <div>
                  <label className="ph-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>Exam Title</label>
                  <input 
                    type="text" 
                    value={deployTitle}
                    onChange={(e) => setDeployTitle(e.target.value)}
                    placeholder="e.g. 2026 Entrance Exam"
                    className="modern-input"
                    style={{ width: '100%' }}
                  />
                </div>
                
                <div>
                  <label className="ph-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>Question Bank</label>
                  <select 
                    value={deployBankId}
                    onChange={(e) => setDeployBankId(e.target.value)}
                    className="modern-input"
                    style={{ width: '100%', background: '#0d1235', color: '#fff' }}
                  >
                    <option value="" style={{ background: '#0d1235', color: '#fff' }}>-- Select Bank --</option>
                    {banksList.map(b => (
                      <option key={b.id} value={b.id} style={{ background: '#0d1235', color: '#fff' }}>{b.name} ({b.class_category || b.category || 'General'})</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="ph-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>Class Level</label>
                  {classHierarchy.length > 0 ? (
                    <select
                      value={deployClassLevel}
                      onChange={(e) => setDeployClassLevel(e.target.value)}
                      className="modern-input"
                      style={{ width: '100%', background: '#0d1235', color: '#fff' }}
                    >
                      <option value="" style={{ background: '#0d1235', color: '#fff' }}>-- Select Level --</option>
                      {classHierarchy.map(level => (
                        <option key={level} value={level} style={{ background: '#0d1235', color: '#fff' }}>{level}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={deployClassLevel}
                      onChange={(e) => setDeployClassLevel(e.target.value)}
                      placeholder="e.g. JSS1 (configure in Settings)"
                      className="modern-input"
                      style={{ width: '100%' }}
                    />
                  )}
                </div>

                <div>
                  <label className="ph-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>Class Arm <span style={{ fontWeight: 400, textTransform: 'none', fontSize: '10px', opacity: 0.6 }}>(optional)</span></label>
                  {classArms.length > 0 ? (
                    <select
                      value={deployClassArm}
                      onChange={(e) => setDeployClassArm(e.target.value)}
                      className="modern-input"
                      style={{ width: '100%', background: '#0d1235', color: '#fff' }}
                    >
                      <option value="" style={{ background: '#0d1235', color: '#fff' }}>-- All Arms --</option>
                      {classArms.map(arm => (
                        <option key={arm} value={arm} style={{ background: '#0d1235', color: '#fff' }}>{arm}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={deployClassArm}
                      onChange={(e) => setDeployClassArm(e.target.value)}
                      placeholder="e.g. A (configure Arms in Settings)"
                      className="modern-input"
                      style={{ width: '100%' }}
                    />
                  )}
                </div>

                <div>
                  <label className="ph-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>Academic Session</label>
                  <input
                    type="text"
                    value={academicSession || 'Not set — configure in Settings'}
                    readOnly
                    className="modern-input"
                    style={{ width: '100%', opacity: 0.6, cursor: 'default' }}
                  />
                </div>

                <div>
                  <label className="ph-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>Term</label>
                  <select
                    value={deployTerm}
                    onChange={(e) => setDeployTerm(e.target.value)}
                    className="modern-input"
                    style={{ width: '100%', background: '#0d1235', color: '#fff' }}
                  >
                    {availableTerms.map(t => (
                      <option key={t} value={t} style={{ background: '#0d1235', color: '#fff' }}>{t} Term</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="ph-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>Exam Type</label>
                  <select 
                    value={deployExamType}
                    onChange={(e) => setDeployExamType(e.target.value)}
                    className="modern-input"
                    style={{ width: '100%', background: '#0d1235', color: '#fff' }}
                  >
                    <option value="internal" style={{ background: '#0d1235', color: '#fff' }}>Internal (Auto-sync to Ledger)</option>
                    <option value="external" style={{ background: '#0d1235', color: '#fff' }}>External (Admissions/Mock)</option>
                  </select>
                </div>
                


                <div>
                  <label className="ph-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>Duration (Minutes)</label>
                  <input 
                    type="number" 
                    value={deployDuration}
                    onChange={(e) => setDeployDuration(parseInt(e.target.value) || 0)}
                    className="modern-input"
                    style={{ width: '100%' }}
                  />
                </div>
                
                <div>
                  <label className="ph-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>Question Count</label>
                  <input 
                    type="number" 
                    value={deployCount}
                    onChange={(e) => setDeployCount(parseInt(e.target.value) || 0)}
                    className="modern-input"
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label className="ph-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>Functional PCs <span style={{ fontWeight: 400, textTransform: 'none', fontSize: '10px', opacity: 0.6 }}>(for batch sizing)</span></label>
                  <input 
                    type="number" 
                    value={deployPcCount}
                    onChange={(e) => setDeployPcCount(parseInt(e.target.value) || 1)}
                    min={1}
                    className="modern-input"
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              <h4 style={{ fontSize: '13px', color: 'var(--text-dim)', marginBottom: '10px', marginTop: 0, fontWeight: 500 }}>Advanced Security Toggles</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px', background: 'rgba(0,0,0,0.2)', padding: '15px', borderRadius: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#fff', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={shuffleQuestions}
                    onChange={(e) => setShuffleQuestions(e.target.checked)}
                  /> Shuffle Questions
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#fff', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={shuffleOptions}
                    onChange={(e) => setShuffleOptions(e.target.checked)}
                  /> Shuffle Options
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#fff', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={enableCalculator}
                    onChange={(e) => setEnableCalculator(e.target.checked)}
                  /> Enable Calculator (Opt-in)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#fff', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={enforceKiosk}
                    onChange={(e) => setEnforceKiosk(e.target.checked)}
                  /> Enforce Kiosk Mode (Tab Lock)
                </label>
              </div>

              <h4 style={{ fontSize: '13px', color: 'var(--text-dim)', marginBottom: '10px', marginTop: 0, fontWeight: 500 }}>Release Policy</h4>
              <select 
                value={releasePolicy}
                onChange={(e) => setReleasePolicy(e.target.value)}
                className="modern-input"
                style={{ width: '100%', marginBottom: '20px', background: '#0d1235', color: '#fff' }}
              >
                <option value="immediate" style={{ background: '#0d1235', color: '#fff' }}>Immediate Dispatch (Pulse WhatsApp)</option>
                <option value="delayed_1h" style={{ background: '#0d1235', color: '#fff' }}>Delay 1 Hour (Audit Window)</option>
                <option value="delayed_24h" style={{ background: '#0d1235', color: '#fff' }}>Delay 24 Hours</option>
                <option value="manual" style={{ background: '#0d1235', color: '#fff' }}>Manual Audit Mode (Hold Results)</option>
              </select>

              <h4 style={{ fontSize: '13px', color: 'var(--text-dim)', marginBottom: '10px', marginTop: 0, fontWeight: 500 }}>Progression Logic</h4>
              <div style={{ background: 'rgba(16, 185, 129, 0.05)', padding: '15px', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.2)', marginBottom: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#10b981', fontWeight: 'bold', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={isPromotional}
                    onChange={(e) => setIsPromotional(e.target.checked)}
                  /> Flag as Promotional Exam (Triggers Ledger Update)
                </label>
                <p style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '5px', margin: '5px 0 0 0' }}>Students passing this exam will be recommended for promotion to the next class in your Academic Pipeline hierarchy.</p>
              </div>

              <button 
                onClick={handleDeployExam}
                className="primary-btn"
                style={{ width: '100%', padding: '12px', fontSize: '15px', justifyContent: 'center' }}
              >
                Deploy to Command Center 🚀
              </button>
            </div>

            {/* Right Ingestion Panel (External Exams only) */}
            {deployExamType === 'external' && (
              <div style={{ flex: 1, background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.2)', padding: '20px', borderRadius: '12px' }}>
                <h4 style={{ color: '#818cf8', margin: '0 0 10px 0', fontSize: '14px', fontWeight: 600 }}>External Ingestion</h4>
                <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '15px', lineHeight: 1.4 }}>External exams require a CSV of candidates to generate cryptographic tokens.</p>
                
                <input 
                  type="file" 
                  accept=".csv" 
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setCsvFile(file);
                      setCsvStatus(`Loaded: ${file.name}`);
                    }
                  }}
                  style={{ display: 'none' }}
                  id="csv-file-input"
                />
                
                <div 
                  onDragOver={handleCsvDragOver}
                  onDrop={handleCsvDrop}
                  onClick={() => document.getElementById('csv-file-input')?.click()}
                  style={{ border: '2px dashed rgba(99,102,241,0.3)', borderRadius: '8px', padding: '20px', textAlign: 'center', cursor: 'pointer', marginBottom: '10px' }}
                >
                  <span style={{ fontSize: '24px', display: 'block', marginBottom: '5px' }}>📥</span>
                  <div style={{ fontSize: '12px', color: '#fff', fontWeight: 600 }}>Drop Candidate CSV</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '4px' }}>or click to browse</div>
                </div>
                {csvStatus && (
                  <div style={{ fontSize: '11px', color: csvFile ? '#10b981' : '#ef4444', textAlign: 'center', marginTop: '10px', fontWeight: 'bold' }}>{csvStatus}</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: LIVE INVIGILATION */}
        {activeTab === 'live' && (
          <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
            {/* Left: Deployed Exams List */}
            <div style={{ flex: 1, background: 'var(--bg-panel)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '20px', flexShrink: 0 }}>
              <h3 style={{ fontSize: '16px', color: '#fff', margin: '0 0 15px 0', fontWeight: 600 }}>Deployed Exams</h3>
              
              {isLoadingLiveExams ? (
                <div style={{ fontSize: '12px', color: 'var(--text-dim)', textAlign: 'center', padding: '20px 0' }}>Loading Active Exams...</div>
              ) : liveExams.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-dim)', textAlign: 'center', padding: '20px 0' }}>No deployed exams found.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {liveExams.map(ex => {
                    const isSelected = selectedLiveExam?.id === ex.id;
                    const badgeColor = ex.exam_type === 'external' ? '#ef4444' : '#10b981';
                    return (
                      <div
                        key={ex.id}
                        onClick={() => handleSelectLiveExam(ex)}
                        style={{
                          padding: '15px',
                          border: '1px solid var(--glass-border)',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          background: isSelected ? 'rgba(0,229,255,0.1)' : 'transparent',
                          borderColor: isSelected ? '#00e5ff' : 'var(--glass-border)',
                          boxShadow: isSelected ? '0 0 10px rgba(0,229,255,0.15)' : 'none'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', alignItems: 'flex-start' }}>
                          <strong style={{ color: '#fff', fontSize: '13px', flex: 1, marginRight: '8px' }}>{ex.title}</strong>
                          <div style={{ display: 'flex', gap: '5px', alignItems: 'center', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                            {ex.is_promotional && (
                              <span style={{ fontSize: '10px', color: '#10b981', background: 'rgba(16,185,129,0.1)', padding: '2px 6px', borderRadius: '12px', fontWeight: 'bold' }}>PROMOTIONAL</span>
                            )}
                            <span style={{ fontSize: '10px', color: badgeColor, border: `1px solid ${badgeColor}`, padding: '2px 6px', borderRadius: '12px', textTransform: 'uppercase', fontWeight: 'bold' }}>{ex.exam_type}</span>
                            <button
                              onClick={(e) => handleDeleteExam(e, ex)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#ef4444',
                                cursor: 'pointer',
                                padding: '2px',
                                display: 'flex',
                                alignItems: 'center'
                              }}
                              title="Delete Exam"
                            >
                              <Trash2 size={13} style={{ transition: 'color 0.2s' }} onMouseEnter={e => (e.target as any).style.color = '#f87171'} onMouseLeave={e => (e.target as any).style.color = '#ef4444'} />
                            </button>
                          </div>
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                          Class: {ex.class_name} | Qs: {ex.question_count} | Dur: {ex.duration_minutes}m
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right: Active Command Center Panel */}
            <div id="live-dashboard-pane" style={{ flex: 2, background: 'var(--bg-panel)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '20px', minHeight: '400px', display: selectedLiveExam ? 'block' : 'none' }}>
              {selectedLiveExam && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Dashboard Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-border)', paddingBottom: '15px', marginBottom: '15px' }}>
                    <h3 style={{ fontSize: '16px', color: '#fff', margin: 0, fontWeight: 600 }}>{selectedLiveExam.title}</h3>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button 
                        onClick={handleDispatchPulseNotifications}
                        className="primary-btn"
                        style={{ background: 'transparent', border: '1px solid #818cf8', color: '#818cf8', padding: '6px 12px', fontSize: '12px', boxShadow: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <span>📢</span> Notify Pulse
                      </button>
                      <button 
                        onClick={handleOpenBatch}
                        className="primary-btn"
                        style={{ background: 'transparent', border: '1px solid #10b981', color: '#10b981', padding: '6px 12px', fontSize: '12px', boxShadow: 'none' }}
                      >
                        + Open New Batch
                      </button>
                      <button 
                        onClick={handleFinalizeExam}
                        className="primary-btn"
                        style={{ background: '#f59e0b', color: '#000', border: 'none', padding: '6px 12px', fontSize: '12px', boxShadow: 'none' }}
                      >
                        Finalize Exam & Publish
                      </button>
                    </div>
                  </div>

                  {/* Batches Workspace list */}
                  <div style={{ marginBottom: '20px' }}>
                    <h4 style={{ fontSize: '13px', color: 'var(--text-dim)', marginBottom: '10px', marginTop: 0 }}>Active Batches</h4>
                    {liveBatches.length === 0 ? (
                      <div style={{ fontSize: '12px', color: 'var(--text-dim)', fontStyle: 'italic' }}>No batches created for this exam yet.</div>
                    ) : (
                      <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '10px' }}>
                        {liveBatches.map(b => {
                          const isActive = b.status === 'active';
                          const timeStr = b.start_time ? `${b.start_time} - ${b.end_time || ''}` : '';
                          const dateStr = b.exam_date || '';
                          return (
                            <div 
                              key={b.id}
                              style={{
                                minWidth: '140px',
                                padding: '12px 16px',
                                border: isActive ? '1px solid #10b981' : '1px solid var(--glass-border)',
                                borderRadius: '10px',
                                textAlign: 'center',
                                background: isActive ? 'rgba(16,185,129,0.05)' : 'rgba(0,0,0,0.1)',
                                flexShrink: 0
                              }}
                            >
                              <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#fff' }}>{b.name}</div>
                              {dateStr && (
                                <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '4px' }}>
                                  {dateStr}
                                </div>
                              )}
                              <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '2px' }}>
                                {timeStr}
                              </div>
                              <div style={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', marginTop: '8px', color: isActive ? '#10b981' : 'var(--text-dim)' }}>
                                {b.status}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Candidates table */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h4 style={{ fontSize: '13px', color: 'var(--text-dim)', margin: 0 }}>Candidate Tokens</h4>
                      <button 
                        onClick={handleGenerateTokens}
                        style={{ background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--text-dim)', borderRadius: '4px', cursor: 'pointer', padding: '4px 8px', fontSize: '12px' }}
                      >
                        Generate Missing Tokens
                      </button>
                    </div>

                    <table style={{ width: '100%', textAlign: 'left', fontSize: '13px', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-dim)' }}>
                          <th style={{ padding: '10px' }}>Candidate</th>
                          <th>Class/Target</th>
                          <th>Token</th>
                          <th>Batch</th>
                          <th>Status</th>
                          <th style={{ textAlign: 'right' }}>Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {liveTokens.length === 0 ? (
                          <tr>
                            <td colSpan={6} style={{ padding: '20px 10px', textAlign: 'center', color: 'var(--text-dim)', fontStyle: 'italic' }}>No candidates assigned.</td>
                          </tr>
                        ) : (
                          liveTokens.map(t => {
                            const statusColor = t.status === 'unused' ? 'var(--text-dim)' : (t.status === 'active' ? '#60a5fa' : '#34d399');
                            return (
                              <tr key={t.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <td style={{ padding: '10px', color: '#fff', fontWeight: 'semibold' }}>{t.candidate_name || 'Unknown'}</td>
                                <td style={{ color: 'var(--text-dim)' }}>{t.class_name || '-'}</td>
                                <td style={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#f59e0b' }}>{t.token}</td>
                                <td style={{ color: 'var(--text-dim)' }}>{t.batch_name || 'Unassigned'}</td>
                                <td style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '11px', color: statusColor }}>{t.status}</td>
                                <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#fff' }}>{t.score !== null ? `${t.score}%` : '-'}</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            
            {/* Show selection placeholder if no exam selected */}
            {!selectedLiveExam && (
              <div style={{ flex: 2, background: 'var(--bg-panel)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '400px', textAlign: 'center' }}>
                <span style={{ fontSize: '40px', marginBottom: '10px' }}>📡</span>
                <h4 style={{ color: '#fff', fontSize: '15px', margin: '0 0 5px 0' }}>No Exam Selected</h4>
                <p style={{ fontSize: '12px', color: 'var(--text-dim)', maxWidth: '300px', margin: '0 auto' }}>Select a deployed exam from the list on the left to monitor live invigilation.</p>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: EXAM CLEARANCE */}
        {activeTab === 'clearance' && (
          <div style={{ maxWidth: '600px', margin: '0 auto', background: 'var(--bg-panel)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '30px', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '12px', background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFD700', marginBottom: '20px' }}>
              <QrCode size={32} />
            </div>
            
            <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: 'bold', marginBottom: '8px', textAlign: 'center' }}>Exam Clearance Scanner</h2>
            <p style={{ color: 'var(--text-dim)', fontSize: '13px', textAlign: 'center', lineHeight: '1.6', marginBottom: '24px', maxWidth: '400px' }}>
              Scan the student's Portal Access Card or enter their ID manually to verify financial clearance for the current term examinations.
            </p>

            <form onSubmit={handleClearanceScan} style={{ width: '100%', maxWidth: '400px', marginBottom: '20px' }}>
              <div style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center' }}>
                <Search style={{ position: 'absolute', left: '14px', color: 'var(--text-dim)' }} size={20} />
                <input 
                  ref={scannerInputRef}
                  type="text" 
                  value={scanData}
                  onChange={(e) => setScanData(e.target.value)}
                  placeholder="Scan QR or enter Student ID..."
                  className="modern-input"
                  style={{ width: '100%', paddingLeft: '44px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: '#fff' }}
                  disabled={isScanning}
                />
              </div>
              <div style={{ marginTop: '10px', fontSize: '11px', textAlign: 'center', color: 'var(--text-dim)' }}>
                Waiting for scanner input...
              </div>
            </form>

            {/* Scan Result Frame */}
            {clearanceResult && (
              <div style={{
                width: '100%',
                maxWidth: '400px',
                padding: '20px',
                borderRadius: '12px',
                border: '1px solid',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                background: clearanceResult.status === 'cleared' ? 'rgba(16,185,129,0.06)' : 
                            clearanceResult.status === 'blocked' ? 'rgba(239,68,68,0.06)' : 
                            'rgba(245,158,11,0.06)',
                borderColor: clearanceResult.status === 'cleared' ? 'rgba(16,185,129,0.3)' : 
                             clearanceResult.status === 'blocked' ? 'rgba(239,68,68,0.3)' : 
                             'rgba(245,158,11,0.3)'
              }}>
                {clearanceResult.status === 'cleared' && <CheckCircle size={48} className="text-emerald-400 mb-4" />}
                {clearanceResult.status === 'blocked' && <ShieldAlert size={48} className="text-red-400 mb-4" />}
                {clearanceResult.status === 'error' && <XCircle size={48} className="text-amber-400 mb-4" />}
                
                <h3 style={{
                  fontSize: '18px',
                  fontWeight: 'bold',
                  marginTop: '10px',
                  color: clearanceResult.status === 'cleared' ? '#10b981' : 
                         clearanceResult.status === 'blocked' ? '#ef4444' : 
                         '#f59e0b'
                }}>
                  {clearanceResult.status === 'cleared' ? 'CLEARED' : 
                   clearanceResult.status === 'blocked' ? 'ACCESS BLOCKED' : 
                   'SYSTEM ERROR'}
                </h3>
                <p style={{ color: 'var(--text-dim)', marginTop: '6px', fontSize: '12px', textAlign: 'center', fontWeight: '500', lineHeight: '1.4' }}>{clearanceResult.message}</p>
              </div>
            )}
          </div>
        )}

        {/* TAB 5: ABOUT */}
        {activeTab === 'about' && (
          <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
            <div id="nexpack-doc-content" style={{ background: 'rgba(255,255,255,0.03)', padding: '30px', borderRadius: '12px', border: '1px solid var(--glass-border)', lineHeight: '1.6', color: 'var(--text-dim)' }}>
              <h1 style={{ color: '#FFD700', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px', fontSize: '22px', fontWeight: 'bold', margin: '0 0 15px 0' }}>
                NexPack — Premium Content System
              </h1>
              
              <h2 style={{ color: '#fff', marginTop: '20px', fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>Overview</h2>
              <p style={{ marginBottom: '15px' }}>The NexPack system allows Nexus School OS to seamlessly import bulk premium question banks (such as JAMB, WAEC, or NECO past papers) securely. These premium packs are distributed as encrypted <code>.nexpack</code> files.</p>
              <p style={{ marginBottom: '10px' }}>Once installed, NexPack banks are treated specially by the system:</p>
              <ul style={{ listStyleType: 'disc', paddingLeft: '20px', marginBottom: '20px' }}>
                <li style={{ marginBottom: '8px' }}><strong>Locked Interface</strong>: To prevent content leaking, the Question Bank library will only display a 5-question preview.</li>
                <li style={{ marginBottom: '8px' }}><strong>Export Disabled</strong>: The 'Export to CSV' and 'Print' functions are fully blocked for premium banks.</li>
                <li style={{ marginBottom: '8px' }}><strong>Full Exam Access</strong>: Despite the UI restrictions, the Nexus CBT engine has full access to the premium bank and can construct exams, shuffle questions, and grade students normally.</li>
              </ul>

              <h2 style={{ color: '#fff', marginTop: '30px', fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>1. How to Install a Premium Pack</h2>
              <ol style={{ listStyleType: 'decimal', paddingLeft: '20px', marginBottom: '20px' }}>
                <li style={{ marginBottom: '8px' }}>Open <strong>Nexus School OS</strong> and navigate to the <strong>CBT Arena</strong> (💎).</li>
                <li style={{ marginBottom: '8px' }}>Click the <strong>Settings (⚙️)</strong> icon in the top right of the CBT header.</li>
                <li style={{ marginBottom: '8px' }}>In the sliding panel, locate the <strong>"Install Premium Pack (.nexpack)"</strong> section.</li>
                <li style={{ marginBottom: '8px' }}>Click <strong>Select .nexpack File</strong> and browse to the <code>.nexpack</code> file you received.</li>
                <li style={{ marginBottom: '8px' }}>The system will decrypt, verify, and import the questions. You will see a progress bar indicating the import status.</li>
                <li style={{ marginBottom: '8px' }}>Once complete, your new premium bank will appear in the <strong>Question Banks</strong> list with a 🔒 badge.</li>
              </ol>

              <h2 style={{ color: '#fff', marginTop: '30px', fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>2. Managing Annual Updates</h2>
              <p style={{ marginBottom: '15px' }}>Exams like WAEC and JAMB release new questions annually. Installing an update pack works exactly the same way as the initial install.</p>
              <p style={{ marginBottom: '10px' }}>The Nexus engine uses <strong>Smart Upsert Technology</strong>:</p>
              <ul style={{ listStyleType: 'disc', paddingLeft: '20px', marginBottom: '20px' }}>
                <li style={{ marginBottom: '8px' }}>It mathematically identifies questions you already have.</li>
                <li style={{ marginBottom: '8px' }}>It safely ignores duplicates.</li>
                <li style={{ marginBottom: '8px' }}>It seamlessly appends only the new questions to your existing premium bank.</li>
                <li style={{ marginBottom: '8px' }}>Your existing live exams remain unbroken.</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* ── Add Question Tabbed Modal ── */}
      {showAddQModal && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setShowAddQModal(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)', zIndex: 200 }}
          />
          {/* Modal Card */}
          <div style={{
            position: 'fixed', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '640px', maxWidth: '95vw',
            background: '#0d1235',
            border: '1px solid var(--glass-border)',
            borderRadius: '16px',
            boxShadow: '0 24px 80px rgba(0,0,0,0.8)',
            zIndex: 201,
            display: 'flex', flexDirection: 'column',
            maxHeight: '90vh',
          }}>
            {/* Header */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-main)' }}>Add Question</h3>
                <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-dim)' }}>{selectedBank?.name}</p>
              </div>
              <button onClick={() => setShowAddQModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '22px', cursor: 'pointer', lineHeight: 1 }}>&times;</button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '4px', padding: '12px 24px 0', borderBottom: '1px solid var(--glass-border)', flexShrink: 0 }}>
              {(['manual', 'import'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setAddQTab(t)}
                  style={{
                    background: 'none', border: 'none',
                    padding: '8px 16px', fontSize: '13px', cursor: 'pointer', fontWeight: addQTab === t ? 700 : 400,
                    color: addQTab === t ? 'var(--text-main)' : 'var(--text-dim)',
                    borderBottom: addQTab === t ? '2px solid var(--accent)' : '2px solid transparent',
                    marginBottom: '-1px', transition: 'color 0.15s'
                  }}
                >
                  {t === 'manual' ? '✏️ Manual Entry' : '📥 Import CSV'}
                </button>
              ))}
            </div>

            {/* Tab Body */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>

              {/* ── MANUAL ENTRY TAB ── */}
              {addQTab === 'manual' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>Question Text</label>
                    <textarea
                      value={manualQ.question_text}
                      onChange={e => setManualQ(q => ({ ...q, question_text: e.target.value }))}
                      rows={3}
                      placeholder="Type the question here…"
                      className="modern-input"
                      style={{ width: '100%', resize: 'vertical', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {(['a','b','c','d'] as const).map(opt => (
                      <div key={opt}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>Option {opt.toUpperCase()}</label>
                        <input
                          value={(manualQ as any)[`option_${opt}`]}
                          onChange={e => setManualQ(q => ({ ...q, [`option_${opt}`]: e.target.value }))}
                          placeholder={`Option ${opt.toUpperCase()}`}
                          className="modern-input"
                          style={{ width: '100%', boxSizing: 'border-box' }}
                        />
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>Correct Answer</label>
                      <select
                        value={manualQ.correct_option}
                        onChange={e => setManualQ(q => ({ ...q, correct_option: e.target.value }))}
                        className="modern-input"
                        style={{ width: '100%', background: '#0d1235', color: '#fff', boxSizing: 'border-box' }}
                      >
                        {['A','B','C','D'].map(o => <option key={o} value={o} style={{ background: '#0d1235' }}>{o}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>Marks</label>
                      <input
                        type="number" min={1} max={20}
                        value={manualQ.marks}
                        onChange={e => setManualQ(q => ({ ...q, marks: parseInt(e.target.value) || 1 }))}
                        className="modern-input"
                        style={{ width: '100%', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ── IMPORT CSV TAB ── */}
              {addQTab === 'import' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.15)', borderRadius: '8px', padding: '12px 14px', fontSize: '11.5px', color: 'var(--text-dim)', lineHeight: 1.8 }}>
                    <span style={{ color: 'var(--accent)', fontWeight: 700 }}>Required columns:</span>{' '}
                    <code style={{ color: '#ffd700' }}>question_text</code>,{' '}
                    <code>option_a</code>, <code>option_b</code>, <code>option_c</code>, <code>option_d</code>,{' '}
                    <code style={{ color: '#10b981' }}>correct_option</code> (A/B/C/D),{' '}
                    <code style={{ color: '#818cf8' }}>marks</code>.
                    {' '}<span
                      onClick={handleDownloadCsvTemplate}
                      style={{ color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline', fontWeight: 600 }}
                    >Download template ↗</span>
                  </div>

                  <input ref={csvImportRef} type="file" accept=".csv" onChange={handleCsvFileChange} style={{ display: 'none' }} />
                  <button
                    onClick={() => csvImportRef.current?.click()}
                    style={{
                      border: '2px dashed rgba(0,229,255,0.3)', borderRadius: '10px',
                      background: 'transparent', cursor: 'pointer',
                      padding: '20px', textAlign: 'center', color: 'var(--text-dim)',
                      fontSize: '13px', transition: 'border-color 0.2s, color 0.2s'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--text-main)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,229,255,0.3)'; e.currentTarget.style.color = 'var(--text-dim)'; }}
                  >
                    <div style={{ fontSize: '28px', marginBottom: '6px' }}>📂</div>
                    <div style={{ fontWeight: 600 }}>Click to choose a CSV file</div>
                    <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.6 }}>Use the template from CBT Settings for the correct format</div>
                  </button>

                  {csvParseError && (
                    <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '10px 14px', color: '#ef4444', fontSize: '12px' }}>
                      ⚠️ {csvParseError}
                    </div>
                  )}

                  {csvPreviewRows.length > 0 && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-dim)' }}>
                          Preview — <span style={{ color: '#10b981' }}>{csvPreviewRows.length} question{csvPreviewRows.length !== 1 ? 's' : ''} detected</span>
                        </span>
                        <span onClick={() => { setCsvPreviewRows([]); }} style={{ fontSize: '11px', color: 'var(--text-dim)', cursor: 'pointer', textDecoration: 'underline' }}>Clear</span>
                      </div>
                      <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid var(--glass-border)', borderRadius: '8px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                          <thead>
                            <tr style={{ background: 'rgba(0,0,0,0.3)', color: 'var(--text-dim)', textAlign: 'left' }}>
                              <th style={{ padding: '8px 10px', fontWeight: 600 }}>#</th>
                              <th style={{ padding: '8px 10px', fontWeight: 600 }}>Question</th>
                              <th style={{ padding: '8px 10px', fontWeight: 600 }}>✓</th>
                              <th style={{ padding: '8px 10px', fontWeight: 600 }}>Mk</th>
                            </tr>
                          </thead>
                          <tbody>
                            {csvPreviewRows.map((row, i) => (
                              <tr key={i} style={{ borderTop: '1px solid var(--glass-border)', color: 'var(--text-main)' }}>
                                <td style={{ padding: '8px 10px', color: 'var(--text-dim)' }}>{i + 1}</td>
                                <td style={{ padding: '8px 10px', maxWidth: '320px' }}>
                                  <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '320px' }}>{row.question_text}</div>
                                  <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '2px' }}>
                                    A: {row.option_a} · B: {row.option_b}{row.option_c ? ` · C: ${row.option_c}` : ''}
                                  </div>
                                </td>
                                <td style={{ padding: '8px 10px', color: '#10b981', fontWeight: 700 }}>{row.correct_option}</td>
                                <td style={{ padding: '8px 10px', color: 'var(--text-dim)' }}>{row.marks}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--glass-border)', display: 'flex', gap: '10px', justifyContent: 'flex-end', flexShrink: 0 }}>
              <button onClick={() => setShowAddQModal(false)} className="secondary-btn" style={{ padding: '9px 20px', fontSize: '13px' }}>Cancel</button>
              {addQTab === 'manual' ? (
                <button onClick={handleManualAddSubmit} className="primary-btn" style={{ padding: '9px 22px', fontSize: '13px' }}>
                  <Plus size={14} /> Add Question
                </button>
              ) : (
                <button
                  onClick={handleCsvImportConfirm}
                  disabled={csvPreviewRows.length === 0 || isImportingCsv}
                  className="primary-btn"
                  style={{ padding: '9px 22px', fontSize: '13px', opacity: csvPreviewRows.length === 0 ? 0.4 : 1 }}
                >
                  {isImportingCsv ? 'Importing…' : `Import ${csvPreviewRows.length > 0 ? csvPreviewRows.length + ' ' : ''}Question${csvPreviewRows.length !== 1 ? 's' : ''}`}
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Edit Bank Modal ── */}
      {showEditBankModal && editBankData && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setShowEditBankModal(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)', zIndex: 200 }}
          />
          {/* Modal Card */}
          <div style={{
            position: 'fixed', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '560px', maxWidth: '95vw',
            background: '#0d1235',
            border: '1px solid var(--glass-border)',
            borderRadius: '16px',
            boxShadow: '0 24px 80px rgba(0,0,0,0.8)',
            zIndex: 201,
            display: 'flex', flexDirection: 'column',
            maxHeight: '90vh',
          }}>
            {/* Header */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-main)' }}>Edit Question Bank</h3>
                <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-dim)' }}>Update the bank name, category or description</p>
              </div>
              <button onClick={() => setShowEditBankModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '22px', cursor: 'pointer', lineHeight: 1 }}>&times;</button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>Bank Name</label>
                  <input
                    value={editBankData.name}
                    onChange={e => setEditBankData((b: any) => ({ ...b, name: e.target.value }))}
                    placeholder="e.g. JSS3 Mathematics Mock Exam"
                    className="modern-input"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                    autoFocus
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>Category / Subject</label>
                  <input
                    value={editBankData.category}
                    onChange={e => setEditBankData((b: any) => ({ ...b, category: e.target.value }))}
                    placeholder="e.g. Mathematics"
                    className="modern-input"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>Description</label>
                  <textarea
                    value={editBankData.description}
                    onChange={e => setEditBankData((b: any) => ({ ...b, description: e.target.value }))}
                    rows={3}
                    placeholder="Brief description of this question bank…"
                    className="modern-input"
                    style={{ width: '100%', resize: 'vertical', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--glass-border)', display: 'flex', gap: '10px', justifyContent: 'flex-end', flexShrink: 0 }}>
              <button onClick={() => setShowEditBankModal(false)} className="secondary-btn" style={{ padding: '9px 20px', fontSize: '13px' }}>Cancel</button>
              <button onClick={handleEditBankSubmit} className="primary-btn" style={{ padding: '9px 22px', fontSize: '13px' }}>
                Save Changes
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Edit Question Modal ── */}
      {showEditQModal && editQ && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setShowEditQModal(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)', zIndex: 200 }}
          />
          {/* Modal Card */}
          <div style={{
            position: 'fixed', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '640px', maxWidth: '95vw',
            background: '#0d1235',
            border: '1px solid var(--glass-border)',
            borderRadius: '16px',
            boxShadow: '0 24px 80px rgba(0,0,0,0.8)',
            zIndex: 201,
            display: 'flex', flexDirection: 'column',
            maxHeight: '90vh',
          }}>
            {/* Header */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-main)' }}>Edit Question</h3>
                <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-dim)' }}>{selectedBank?.name}</p>
              </div>
              <button onClick={() => setShowEditQModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '22px', cursor: 'pointer', lineHeight: 1 }}>&times;</button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>Question Text</label>
                  <textarea
                    value={editQ.question_text || ''}
                    onChange={e => setEditQ(q => ({ ...q, question_text: e.target.value }))}
                    rows={3}
                    placeholder="Type the question here…"
                    className="modern-input"
                    style={{ width: '100%', resize: 'vertical', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {(['a','b','c','d'] as const).map(opt => (
                    <div key={opt}>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>Option {opt.toUpperCase()}</label>
                      <input
                        value={(editQ as any)[`option_${opt}`] || ''}
                        onChange={e => setEditQ(q => ({ ...q, [`option_${opt}`]: e.target.value }))}
                        placeholder={`Option ${opt.toUpperCase()}`}
                        className="modern-input"
                        style={{ width: '100%', boxSizing: 'border-box' }}
                      />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>Correct Answer</label>
                    <select
                      value={editQ.correct_option || 'A'}
                      onChange={e => setEditQ(q => ({ ...q, correct_option: e.target.value }))}
                      className="modern-input"
                      style={{ width: '100%', background: '#0d1235', color: '#fff', boxSizing: 'border-box' }}
                    >
                      {['A','B','C','D'].map(o => <option key={o} value={o} style={{ background: '#0d1235' }}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>Marks</label>
                    <input
                      type="number" min={1} max={20}
                      value={editQ.marks || 1}
                      onChange={e => setEditQ(q => ({ ...q, marks: parseInt(e.target.value) || 1 }))}
                      className="modern-input"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--glass-border)', display: 'flex', gap: '10px', justifyContent: 'flex-end', flexShrink: 0 }}>
              <button onClick={() => setShowEditQModal(false)} className="secondary-btn" style={{ padding: '9px 20px', fontSize: '13px' }}>Cancel</button>
              <button onClick={handleManualEditSubmit} className="primary-btn" style={{ padding: '9px 22px', fontSize: '13px' }}>
                Save Changes
              </button>
            </div>
          </div>
        </>
      )}

      {/* CBT Sliding Drawer settings Panel (Slide-in) */}
      {isSettingsOpen && (
        <div 
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(4px)', zIndex:99 }} 
          onClick={() => setIsSettingsOpen(false)} 
        />
      )}
      <div 
        id="cbt-settings-panel" 
        style={{
          position: 'fixed',
          right: isSettingsOpen ? 0 : '-430px',
          top: 0,
          bottom: 0,
          width: '420px',
          background: '#0d1235',
          borderLeft: '1px solid var(--glass-border)',
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-10px 0 40px rgba(0,0,0,0.7)',
          transition: 'right 0.32s cubic-bezier(0.4, 0, 0.2, 1)',
          boxSizing: 'border-box'
        }}
      >
        <div style={{ padding: '20px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, background: 'rgba(0,0,0,0.15)' }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            ⚙️ CBT Settings
          </h3>
          <button 
            onClick={() => setIsSettingsOpen(false)}
            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '24px', cursor: 'pointer', lineHeight: 1 }}
          >
            &times;
          </button>
        </div>
        
        <div style={{ padding: '20px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* CBT Academic Configuration Card (Cyan Accent Card) */}
          <div className="card" style={{ padding: '16px', background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.15)', borderRadius: 'var(--radius-lg)' }}>
            <p style={{ fontSize: '11px', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700, margin: '0 0 10px 0' }}>
              🎓 CBT Academic Configuration
            </p>
            <p style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '14px', lineHeight: 1.6 }}>
              Configure the minimum passing grade for student promotions and set the active academic session.
            </p>
            <div style={{ display: 'flex', gap: '12px', flexDirection: 'column' }}>
              <div>
                <label className="ph-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>Pass Mark Threshold (%)</label>
                <input 
                  type="number" 
                  value={passMark} 
                  onChange={e => setPassMark(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))} 
                  className="modern-input" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  placeholder="e.g. 50"
                  min="0"
                  max="100"
                />
              </div>
              <div>
                <label className="ph-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>Current Academic Session</label>
                <select 
                  value={academicSession} 
                  onChange={e => setAcademicSession(e.target.value)} 
                  className="modern-input" 
                  style={{ width: '100%', fontSize: '12px' }} 
                >
                  <option value="">-- Select Session --</option>
                  {generateSessionsList().map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Question Import CSV Template Card */}
          <div className="card" style={{ padding: '16px', background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <span style={{ fontSize: '18px' }}>📥</span>
              <p style={{ fontSize: '11px', color: '#10b981', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700, margin: 0 }}>
                Question Import Template
              </p>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '14px', lineHeight: 1.7 }}>
              Download this CSV template to bulk-import questions into any Question Bank. Fill in each row and upload via the <strong style={{ color: 'var(--accent-indigo)' }}>Nexus Scholar</strong> button inside a bank.
            </p>
            <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: '6px', padding: '10px 12px', marginBottom: '14px', fontSize: '10.5px', color: 'var(--text-dim)', lineHeight: 1.8, fontFamily: 'monospace' }}>
              <span style={{ color: '#10b981', fontWeight: 700 }}>Columns:</span>{' '}
              question_text, option_a, option_b,{' '}
              option_c, option_d,{' '}
              <span style={{ color: '#ffd700' }}>correct_option</span>{' '}(A/B/C/D),{' '}
              <span style={{ color: '#818cf8' }}>marks</span>{' '}(default 1)
            </div>
            <button
              id="btn-download-csv-template"
              onClick={handleDownloadCsvTemplate}
              className="primary-btn"
              style={{ width: '100%', justifyContent: 'center', background: 'linear-gradient(135deg, #059669, #10b981)', color: '#fff', border: 'none', boxShadow: 'none' }}
            >
              ⬇ Download CSV Template
            </button>
          </div>

          {/* Install Premium Pack Card (Gold Card Style) */}
          <div className="card" style={{ padding: '16px', background: 'rgba(255,215,0,0.04)', border: '1px solid rgba(255,215,0,0.2)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <span style={{ fontSize: '18px' }}>💎</span>
              <p style={{ fontSize: '11px', color: 'var(--accent-gold)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700, margin: 0 }}>
                Premium NexPack System
              </p>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '14px', lineHeight: 1.6 }}>
              Install an encrypted .nexpack file to securely load premium questions like WAEC/JAMB past papers.
            </p>
            
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleNexpackUpload} 
              accept=".nexpack" 
              style={{ display: 'none' }} 
            />
            
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="primary-btn"
              style={{ width: '100%', justifyContent: 'center', background: 'linear-gradient(135deg,#b8860b,#ffd700)', color: '#000', border: 'none', boxShadow: 'none' }}
            >
              Select .nexpack File
            </button>
            
            {/* Progress Bar Frame */}
            {nexpackUploading && (
              <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-dim)', fontWeight: 'bold' }}>
                  <span>{nexpackStatus}</span>
                  <span>{nexpackProgress}%</span>
                </div>
                <div style={{ width: '100%', height: '6px', background: 'rgba(0,0,0,0.35)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div 
                    style={{ height: '100%', width: `${nexpackProgress}%`, background: 'linear-gradient(90deg, #10b981, #34d399)', transition: 'width 0.2s' }} 
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Save footer */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--glass-border)', flexShrink: 0 }}>
          <button 
            id="btn-cbt-settings-save" 
            onClick={handleSaveSettings} 
            disabled={savingSettings} 
            className="primary-btn" 
            style={{ width: '100%', justifyContent: 'center', background: 'linear-gradient(135deg,#b8860b,#ffd700)', color: '#000', border: 'none', boxShadow: 'none' }}
          >
            {savingSettings ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
