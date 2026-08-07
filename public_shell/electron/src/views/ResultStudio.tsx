import React, { useState, useEffect } from "react";
import { useLicense } from "../hooks/useLicense";
import { useClassArms } from "../hooks/useClassArms";
import { useTermConfig } from "../hooks/useTermConfig";
import { Combobox } from "../components/Combobox";

interface StudentResult {
  id: string;
  name: string;
  class_name: string;
  class_arm?: string;
  subjects?: any[];
  total_score?: number;
  average?: number;
  remark?: string;
  principal_remark?: string;
  days_attended?: number;
  total_days?: number;
  fee_status?: string;   // 'cleared' | 'owing' — dynamically computed by query-results handler
  feeStatus?: string;    // alias used by generate-reports handler
}

// Map template IDs → PNG preview filenames (mirrors printhub.js updateTemplatePreview)
const TEMPLATE_IMG_MAP: Record<string, string> = {
  clean_slate: "classic",
  class_photo: "classic",
  prestige: "prestige",
  azure: "azure",
  royal: "royal",
  monarch: "monarch",
  sovereign: "sovereign",
  sterling: "sterling",
  apex: "apex",
};

const PAID_TEMPLATES = [
  "prestige",
  "azure",
  "royal",
  "monarch",
  "sovereign",
  "sterling",
  "apex",
];

export function ResultStudio() {
  const { license } = useLicense();
  const { fullList } = useClassArms();
  const { session: globalSession, term: globalTerm, termsList, sessionsList } = useTermConfig();
  const tier = license?.tier || "Silver";
  const isActivated = license?.is_activated ?? false;

  const isTemplateLocked = (tpl: string) => {
    if (tpl === "clean_slate" || tpl === "class_photo") return false;
    if (tier === "Standalone") return true;
    if (tier === "Silver")
      return ["royal", "monarch", "sovereign", "sterling", "apex"].includes(
        tpl,
      );
    if (tier === "Gold") return ["sovereign", "sterling", "apex"].includes(tpl);
    return false;
  };

  // Form selections
  const [reportType, setReportType] = useState(
    () => sessionStorage.getItem("rs_report_type") || "terminal",
  );
  const [scope, setScope] = useState("all");
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedSession, setSelectedSession] = useState("");
  const [selectedTerm, setSelectedTerm] = useState("");
  const [template, setTemplate] = useState("clean_slate");
  const [format, setFormat] = useState<"pdf" | "html" | "image">("pdf");
  const [useBrandColors, setUseBrandColors] = useState(true);

  // Metadata dropdown options
  const [subjects, setSubjects] = useState<string[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [imgError, setImgError] = useState(false);

  // Results Querying state
  const [queryResults, setQueryResults] = useState<StudentResult[]>([]);
  const [queryMessage, setQueryMessage] = useState("");
  const [previewActive, setPreviewActive] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);

  // Report Generation State
  const [generating, setGenerating] = useState(false);
  const [genStatus, setGenStatus] = useState("");
  const [generatedPath, setGeneratedPath] = useState("");
  const [lastImagePath, setLastImagePath] = useState<string | null>(null);

  // Bulk Remarks Modal State
  const [isRemarksOpen, setIsRemarksOpen] = useState(false);
  const [remarksData, setRemarksData] = useState<StudentResult[]>([]);
  const [remarksSaveStatus, setRemarksSaveStatus] = useState("");
  const [currentTerm, setCurrentTerm] = useState("First Term");
  const [skipZeroGradesState, setSkipZeroGradesState] = useState(true);
  const [skipUngradedState, setSkipUngradedState] = useState(true);

  // ── Phase 10: ILS state ────────────────────────────────────────────
  const [ilsClassType, setIlsClassType] = useState<'STANDARD_NIGERIAN' | 'ILS'>('STANDARD_NIGERIAN');
  const [ilsPacCount, setIlsPacCount] = useState<number>(12);
  const [ilsPacLabels, setIlsPacLabels] = useState<string[]>([]);
  const [ilsSkipZeroPacs, setIlsSkipZeroPacs] = useState(true);
  const [ilsSkipP1Unstarted, setIlsSkipP1Unstarted] = useState(false);
  const [ilsSelectedStudent, setIlsSelectedStudent] = useState('');
  const [ilsSelectedSubject, setIlsSelectedSubject] = useState('');
  const [ilsPacScores, setIlsPacScores] = useState<Record<number, string>>({});
  const [ilsVerseCount, setIlsVerseCount] = useState('');
  const [ilsSaving, setIlsSaving] = useState(false);
  const [ilsMsg, setIlsMsg] = useState('');
  const [ilsStudentSummary, setIlsStudentSummary] = useState<any[]>([]);

  const skipZeroGrades = skipZeroGradesState;
  const skipUngraded = skipUngradedState;

  const setSkipZeroGrades = (val: boolean) => {
    setSkipZeroGradesState(val);
    setSkipUngradedState(val);
  };

  const setSkipUngraded = (val: boolean) => {
    setSkipZeroGradesState(val);
    setSkipUngradedState(val);
  };

  /**
   * getFilteredStudents — single source of truth for the active preview/action filter.
   * - ILS classes: applies ilsSkipZeroPacs and ilsSkipP1Unstarted.
   * - Standard classes: applies the skipZeroGrades toggle.
   * All three action handlers (generate, dispatch, publish) call this.
   */
  const getFilteredStudents = (): any[] => {
    if (ilsClassType === 'ILS') {
      return queryResults.filter((s: any) => {
        const ilSubs: any[] = s.il_subjects || [];
        // Filter 1: skip students with zero graded PACs
        if (ilsSkipZeroPacs) {
          const totalGraded = ilSubs.reduce((acc: number, sub: any) => acc + (sub.packs_completed || 0), 0);
          if (totalGraded === 0) return false;
        }
        // Filter 2: skip students where Pack 1 has not been graded in any subject
        if (ilsSkipP1Unstarted) {
          const hasAnyP1 = ilSubs.some((sub: any) => {
            const packs = sub.packs || {};
            return packs[1] !== undefined && packs[1] !== null;
          });
          if (!hasAnyP1) return false;
        }
        return true;
      });
    }
    // Standard: honour skipZeroGrades (but never drop ILS students by average)
    if (skipZeroGrades || skipUngraded) {
      return queryResults.filter((s: any) =>
        (s.average ?? 0) > 0 || Array.isArray(s.il_subjects) || s.curriculum_type === 'ILS'
      );
    }
    return queryResults;
  };

  // Computed brand colors from theme
  const [brandPrimary, setBrandPrimary] = useState("#1A237E");
  const [brandSecondary, setBrandSecondary] = useState("#00E5FF");

  // S8-4 & S8-5: Dispatch and Publish state
  const [sendWA, setSendWA] = useState(true);
  const [sendEmail, setSendEmail] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchStatus, setDispatchStatus] = useState("");

  const [publishingPortal, setPublishingPortal] = useState(false);
  const [publishProgress, setPublishProgress] = useState("");
  const [publishStatus, setPublishStatus] = useState("");

  // Listen to IPC portal publish progress updates
  useEffect(() => {
    if ((window as any).electronAPI?.results?.onPublishProgress) {
      (window as any).electronAPI.results.onPublishProgress((progress: any) => {
        setPublishProgress(progress.message || "");
      });
    }
  }, []);

  // Reset img error when template changes
  useEffect(() => {
    setImgError(false);
  }, [template]);

  // Listen to IPC report-generation status updates
  useEffect(() => {
    if (window.electronAPI?.on) {
      window.electronAPI.on("report-generation:status", (status: any) => {
        if (status && status.text) {
          setGenStatus(status.text);
        }
      });
    }
  }, []);

  // Load configs & metadata
  const fetchMetadata = async () => {
    if (!window.electronAPI) return;
    setLoading(true);
    try {
      const identity = await window.electronAPI.getIdentity();
      if (identity?.themePrimary) setBrandPrimary(identity.themePrimary);
      if (identity?.themeSecondary) setBrandSecondary(identity.themeSecondary);

      if (tier === "Silver" || tier === "Standalone") setScope("all");

      const cfg = await window.electronAPI.getTermConfig();
      if (cfg?.template) {
        setTemplate(
          isTemplateLocked(cfg.template) ? "clean_slate" : cfg.template,
        );
      }
      if (cfg?.term) setCurrentTerm(cfg.term);

      const meta = await window.electronAPI.getUniqueMetadata();
      if (meta) {
        setSubjects(meta.subjects || []);
      }

      const tchRes = await window.electronAPI.getAllTeachers({
        limit: 500,
        minimal: true,
      });
      setTeachers(tchRes?.data || []);

      const studRes = await window.electronAPI.getAllStudents({
        limit: 5000,
        minimal: true,
      });
      setStudents(studRes?.data || []);
    } catch (err) {
      console.error("Error fetching Result Studio metadata:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetadata();
  }, []);

  // Phase 10: when selectedClass changes and scope=class, check ILS type
  useEffect(() => {
    if (scope !== 'class' || !selectedClass) {
      setIlsClassType('STANDARD_NIGERIAN');
      return;
    }
    const api = (window as any).electronAPI;
    if (api?.ils?.getClassType) {
      api.ils.getClassType(selectedClass).then((res: any) => {
        setIlsClassType(res?.ok ? (res.type || 'STANDARD_NIGERIAN') : 'STANDARD_NIGERIAN');
        setIlsPacCount(res?.pacCount || 12);
        setIlsPacLabels(Array.isArray(res?.pacLabels) ? res.pacLabels : []);
        setIlsSelectedStudent('');
        setIlsSelectedSubject('');
        setIlsPacScores({});
        setIlsVerseCount('');
        setIlsMsg('');
        setIlsStudentSummary([]);
      }).catch(() => setIlsClassType('STANDARD_NIGERIAN'));
    }
  }, [selectedClass, scope]);

  useEffect(() => {
    // Clear rs_report_type so it doesn't persist across fresh navigations
    sessionStorage.removeItem("rs_report_type");
  }, []);

  const handleScopeChange = (newScope: string) => {
    if (tier === "Silver" || tier === "Standalone") {
      setScope("all");
      return;
    }
    setScope(newScope);
  };

  // Perform results preview query
  const handlePreview = async () => {
    if (!window.electronAPI?.queryResults) return;
    setQueryMessage("⏳ Querying results...");
    setQueryResults([]);
    setPreviewActive(true);

    try {
      const session = selectedSession || globalSession || "2025/2026";
      const term = selectedTerm || globalTerm || "First Term";
      setCurrentTerm(term);

      const resp = await window.electronAPI.queryResults({
        scope,
        session,
        term,
        class_name: selectedClass,
        teacher_id: selectedTeacherId,
        subject: selectedSubject,
        student_id: selectedStudentId,
      });

      if (resp.ok) {
        setQueryResults(resp.results || []);
        setQueryMessage(
          `${resp.results?.length || 0} student(s) · ${session}, ${term}`,
        );
        setIsPreviewModalOpen(true);
      } else {
        setQueryMessage("❌ Query failed: " + resp.error);
      }
    } catch (err: any) {
      setQueryMessage("❌ Error: " + err.message);
    }
  };

  // Fee Clearance pre-flight audit — ALWAYS runs when owing students are present.
  // The admin sees a modal listing cleared vs owing students and chooses:
  //   - Proceed with cleared-only  → returns cleared[]
  //   - Cancel                     → returns null (action aborted)
  // fee_shield_enabled setting only controls whether the modal CAN be dismissed
  // with the full list (warn mode) or must filter (block mode).
  const auditFeeClearanceAndConfirm = async (students: any[], actionLabel: string): Promise<any[] | null> => {
    // Separate cleared from owing using BOTH field aliases for safety
    const cleared = students.filter((s: any) =>
      s.fee_status === 'cleared' || s.feeStatus === 'cleared'
    );
    const owing = students.filter((s: any) =>
      s.fee_status !== 'cleared' && s.feeStatus !== 'cleared'
    );

    // If nobody is owing, proceed immediately — no modal needed
    if (owing.length === 0) return students;

    // Build a compact list of owing students to show the admin (max 8 names, then "… and N more")
    const owingNames = owing.slice(0, 8).map((s: any) => `• ${s.name} (${s.class_name || ''})`).join('<br/>');
    const moreCount = owing.length > 8 ? `<br/><em style="color:#94a3b8">… and ${owing.length - 8} more</em>` : '';

    const Swal = (window as any).Swal;
    if (!Swal) {
      // No SweetAlert: fall back to native confirm
      const proceed = window.confirm(
        `Fee Clearance Audit — ${actionLabel}\n\n` +
        `✅ Cleared: ${cleared.length}\n⛔ Outstanding: ${owing.length}\n\n` +
        (cleared.length > 0
          ? `Proceed with ${cleared.length} cleared student(s) only?`
          : 'All students have outstanding balances. Cancel to review.')
      );
      return (proceed && cleared.length > 0) ? cleared : null;
    }

    const result = await Swal.fire({
      title: '🛡️ Fee Clearance Audit',
      html: `
        <div style="text-align:left;font-size:13px;line-height:1.6">
          <p style="margin:0 0 10px;color:#94a3b8">
            The following student(s) have <strong style="color:#f87171">outstanding fee balances</strong>.
            Only cleared students will be included in <strong>${actionLabel}</strong>.
          </p>
          <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);
                      padding:10px 14px;border-radius:8px;color:#fca5a5;margin-bottom:10px;max-height:160px;overflow-y:auto">
            <strong>⛔ Outstanding (${owing.length}):</strong><br/>${owingNames}${moreCount}
          </div>
          <div style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);
                      padding:8px 14px;border-radius:8px;color:#34d399">
            ✅ <strong>Cleared &amp; ready:</strong> ${cleared.length} student(s)
          </div>
          ${cleared.length === 0 ? '<p style="margin:10px 0 0;font-size:12px;color:#f87171">⚠️ No cleared students — cannot proceed. Settle fees first.</p>' : ''}
        </div>
      `,
      icon: cleared.length > 0 ? 'warning' : 'error',
      background: '#0b0f19',
      color: '#fff',
      showCancelButton: true,
      confirmButtonColor: cleared.length > 0 ? '#10b981' : '#ef4444',
      cancelButtonColor: '#64748b',
      confirmButtonText: cleared.length > 0
        ? `✅ Proceed with ${cleared.length} Cleared Student${cleared.length !== 1 ? 's' : ''}`
        : '❌ Cannot Proceed',
      cancelButtonText: 'Cancel',
      allowOutsideClick: false,
      allowEscapeKey: false,
    });

    if (result.isConfirmed && cleared.length > 0) return cleared;
    return null;
  };

  // S8-4: Dispatch Results via WhatsApp/Email (Gold/Diamond)
  const handleDispatch = async () => {
    if (!queryResults.length || !(window as any).electronAPI?.results?.dispatch) return;
    let targetStudents = getFilteredStudents();

    if (!targetStudents.length) {
      setDispatchStatus("⚠️ No students to dispatch — all are filtered out by the active preview filters.");
      return;
    }

    const audited = await auditFeeClearanceAndConfirm(targetStudents, "Dispatching Results");
    if (!audited || !audited.length) return;
    targetStudents = audited;

    setDispatching(true);
    setDispatchStatus("⏳ Dispatching to " + targetStudents.length + " student(s)…");
    try {
      const term = selectedTerm || globalTerm || "First Term";
      const session = selectedSession || globalSession || "2025/2026";
      const channels = [];
      if (sendWA) channels.push("whatsapp");
      if (sendEmail) channels.push("email");

      const res = await (window as any).electronAPI.results.dispatch({
        scope,
        studentIds: targetStudents.map((s: any) => s.id),
        studentId: scope === "student" ? selectedStudentId : null,
        className: scope === "class" ? selectedClass : null,
        term,
        academicSession: session,
        templateId: template,
        channels
      });

      if (res?.ok) {
        const parts = [];
        if (res.dispatched) parts.push(res.dispatched + " sent");
        if (res.queued)     parts.push(res.queued + " queued (email pending SMTP setup)");
        if (res.skipped)    parts.push(res.skipped + " skipped");

        let statusMsg = parts.length ? "✅ Done — " + parts.join(" · ") : "";

        // Surface any per-channel availability warnings
        if (res.warnings?.length) {
          const warnStr = "⚠️ " + res.warnings.join(" · ");
          statusMsg = statusMsg ? statusMsg + "\n" + warnStr : warnStr;
        }

        if (!statusMsg) statusMsg = "⚠️ 0 delivered — check that parent phone/email are set and Nexus Pulse is connected";
        setDispatchStatus(statusMsg);
      } else {
        setDispatchStatus("❌ " + (res?.error || "Dispatch failed"));
      }
    } catch (err: any) {
      setDispatchStatus("❌ Error: " + err.message);
    } finally {
      setDispatching(false);
    }
  };

  // S8-5: Publish Results to parent portal
  const handlePublishToPortal = async () => {
    if (!queryResults.length || !(window as any).electronAPI?.results?.publish) return;
    let targetStudents = getFilteredStudents();

    if (!targetStudents.length) {
      setPublishStatus("⚠️ No students to publish — all are filtered out by the active preview filters.");
      return;
    }

    const audited = await auditFeeClearanceAndConfirm(targetStudents, "Publishing to Portal");
    if (!audited || !audited.length) return;
    targetStudents = audited;

    setPublishingPortal(true);
    setPublishProgress("Generating PDFs…");
    setPublishStatus("");
    try {
      const term = selectedTerm || globalTerm || "First Term";
      const session = selectedSession || globalSession || "2025/2026";

      const res = await (window as any).electronAPI.results.publish({
        term,
        academicSession: session,
        studentIds: targetStudents.map((s: any) => s.id)
      });

      if (res?.ok) {
        setPublishStatus("✅ Published " + (res.published || 0) + " results successfully!");
      } else {
        setPublishStatus("❌ Failed: " + (res?.error || "Unknown error"));
      }
    } catch (err: any) {
      setPublishStatus("❌ Error: " + err.message);
    } finally {
      setPublishingPortal(false);
      setPublishProgress("");
    }
  };

  // Generate Reports
  const handleGenerate = async () => {
    if (!queryResults.length || !window.electronAPI?.generateReports) return;
    let studentsToGenerate = getFilteredStudents();

    if (!studentsToGenerate.length) {
      setGenStatus(
        "⚠️ No students to generate — all are filtered out by the active preview filters.",
      );
      return;
    }

    const audited = await auditFeeClearanceAndConfirm(studentsToGenerate, "Generating Reports");
    if (!audited || !audited.length) return;
    studentsToGenerate = audited;

    setGenerating(true);
    setGenStatus("⏳ Generating reports...");
    setGeneratedPath("");
    setLastImagePath(null);
    (window as any).isReportGenerating = true;

    try {
      const identity = await window.electronAPI.getIdentity();
      const cfg = await window.electronAPI.getTermConfig();
      const session = selectedSession || globalSession || "2025/2026";
      const term = selectedTerm || globalTerm || "First Term";
      const termConfig = {
        ...cfg,
        academic_session: session,
        term: term,
      };

      const res = await window.electronAPI.generateReports({
        identity,
        students: studentsToGenerate,
        termConfig,
        reportType,
        templateId: template,
        format,
        subject: selectedSubject,
        useSchoolColors: useBrandColors,
        scope,
        selectedClass,
        selectedTeacherName: teachers.find((t) => t.id === selectedTeacherId)?.name,
        selectedStudentName: scope === "student" && studentsToGenerate.length > 0 ? studentsToGenerate[0].name : undefined,
      });

      if (res && res.success) {
        const fmtLabel: Record<string, string> = {
          pdf: "PDF",
          html: "HTML file",
          image: "PNG image",
        };
        const label = fmtLabel[format] || format;
        setGenStatus(`✅ ${label} saved to Desktop/NexusReports/`);
        setGeneratedPath(res.path || "");
        if (format === "image") setLastImagePath(res.path || null);
      } else {
        setGenStatus("❌ Generation failed.");
      }
    } catch (err: any) {
      setGenStatus("❌ Error: " + err.message);
    } finally {
      setGenerating(false);
      (window as any).isReportGenerating = false;
    }
  };

  // Copy PNG image to clipboard
  const handleCopyImage = async () => {
    if (!lastImagePath || !window.electronAPI?.copyResultImage) return;
    try {
      const res = await window.electronAPI.copyResultImage({
        imagePath: lastImagePath,
      });
      if (res.ok) setGenStatus("📋 Image copied to clipboard!");
      else setGenStatus("❌ Copy failed: " + res.error);
    } catch (err: any) {
      setGenStatus("❌ Copy error: " + err.message);
    }
  };

  // Open Bulk Remarks Modal
  const handleOpenBulkRemarks = async () => {
    if (!queryResults.length) {
      alert("Please click 'Preview' first to load a scope of students.");
      return;
    }
    setIsRemarksOpen(true);
    setRemarksSaveStatus("");
    try {
      // Use the shared filter helper so ILS checkboxes are respected
      const sourceList = getFilteredStudents();
      const mapped = sourceList.map((student) => ({
        ...student,
        days_attended:
          student.attendance?.days_attended ?? student.days_attended ?? 0,
        total_days: student.attendance?.total_days ?? student.total_days ?? 0,
        remark: student.remark || "",
        principal_remark: student.principal_remark || "",
      }));
      setRemarksData(mapped);
    } catch (err) {
      console.error("Failed opening bulk remarks:", err);
    }
  };

  const handleAutoFillRemarks = () => {
    const isEndTerm =
      currentTerm.toLowerCase().includes("third") ||
      currentTerm.toLowerCase().includes("3rd");
    const isILS = ilsClassType === 'ILS';

    setRemarksData((prev) =>
      prev.map((student) => {
        let remark = student.remark;
        let princ = student.principal_remark;
        const avgRaw = parseFloat(student.average);
        const hasILSData = isILS && Array.isArray((student as any).il_subjects);
        const hasGrades = hasILSData || !isNaN(avgRaw);
        const avg = !isNaN(avgRaw) ? avgRaw : 0;

        if (!remark) {
          if (!hasGrades) {
            remark = "No academic records for this term.";
          } else if (isILS) {
            // ILS-flavored teacher remarks based on PAC average
            if (avg >= 85)
              remark = "An excellent PAC performance. Keep excelling!";
            else if (avg >= 70)
              remark = "A commendable PAC record. Keep pushing higher.";
            else
              remark = "More diligence is required in PAC completion. Work harder.";
          } else {
            remark = "An impressive performance. Keep it up.";
            if (avg < 50)
              remark = "Work harder next term to improve your grades.";
            else if (avg < 70)
              remark = "A good result, but there is room for more effort.";
          }
        }
        if (!princ) {
          if (!hasGrades) {
            princ = "No academic records.";
          } else if (isILS) {
            // ILS-flavored manager remarks
            if (avg >= 85)
              princ = "Outstanding dedication to the ILS curriculum. Well done!";
            else if (avg >= 70)
              princ = "A satisfactory ILS term. Continue to strive for mastery.";
            else if (isEndTerm)
              princ = "Greater commitment to the PAC programme is required next session.";
            else
              princ = "Consistent effort in PAC studies will yield better results.";
          } else if (isEndTerm) {
            princ = "Promoted to next class.";
            if (avg < 40) princ = "To repeat the class.";
          } else {
            princ = "An encouraging performance this term. Keep it up.";
            if (avg < 40)
              princ = "A poor result. Strive to perform better next term.";
            else if (avg < 70)
              princ = "A satisfactory term result. Strive for higher grades.";
          }
        }
        return { ...student, remark, principal_remark: princ };
      }),
    );
  };

  const handleSaveBulkRemarks = async () => {
    if (!window.electronAPI?.saveBulkRemarks) return;
    setRemarksSaveStatus("⏳ Saving remarks...");
    try {
      const cfg = await window.electronAPI.getTermConfig();
      const session = cfg?.academic_session || "2025/2026";
      const term = cfg?.term || "First Term";
      const payload = remarksData.map((s) => ({
        student_id: s.id,
        session,
        term,
        remark: s.remark,
        principal_remark: s.principal_remark,
        days_attended: Number(s.days_attended) || 0,
        total_days: Number(s.total_days) || 0,
      }));
      const res = await window.electronAPI.saveBulkRemarks(payload);
      if (res.ok) {
        setRemarksSaveStatus("✅ All remarks saved successfully!");
        setQueryResults((prev) =>
          prev.map((s) => {
            const updated = remarksData.find((x) => x.id === s.id);
            if (updated) {
              return {
                ...s,
                remark: updated.remark,
                principal_remark: updated.principal_remark,
                attendance: {
                  ...s.attendance,
                  days_attended: updated.days_attended,
                  total_days: updated.total_days,
                },
                days_attended: updated.days_attended,
                total_days: updated.total_days,
              };
            }
            return s;
          })
        );
        setTimeout(() => setIsRemarksOpen(false), 1200);
      } else {
        setRemarksSaveStatus("❌ Error: " + res.error);
      }
    } catch (err: any) {
      setRemarksSaveStatus("❌ Error: " + err.message);
    }
  };

  // Template preview image src (mirrors v1 printhub.js updateTemplatePreview)
  const templateImgSrc = `../node_modules/@nexus/engine/assets/templates/${TEMPLATE_IMG_MAP[template] || "classic"}.png`;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* ── View Header ── */}
      <div className="view-header" style={{ flexShrink: 0 }}>
        <div>
          <h2 className="view-title">📊 Result Studio</h2>
          <p className="view-sub">
            Generate, preview and export result cards in any format.
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          {genStatus && (
            <span
              style={{
                fontSize: "12px",
                color: genStatus.startsWith("✅")
                  ? "var(--accent)"
                  : genStatus.startsWith("❌")
                    ? "var(--danger)"
                    : "var(--text-dim)",
              }}
            >
              {genStatus}
            </span>
          )}
          {(tier === "Silver" || tier === "Standalone") && (
            <div
              style={{
                background: "rgba(255,200,0,0.08)",
                border: "1px solid rgba(255,200,0,0.22)",
                borderRadius: "8px",
                padding: "7px 14px",
                fontSize: "11px",
                color: "rgba(255,200,0,0.85)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span>⭐</span>
              <span>
                <strong>
                  {tier === "Standalone" ? "Standalone Pack" : "Silver Plan"}
                </strong>{" "}
                — Scope locked to <em>Entire School</em>. Upgrade to Gold for
                granular reports.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Main Body: 35/65 Split — fills all remaining height ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "35% 65%",
          flex: 1,
          overflow: "hidden",
          background: "rgba(255,255,255,0.015)",
          borderTop: "1px solid var(--glass-border)",
        }}
      >
        {/* ═══ LEFT COLUMN: Controls + Action Buttons ═══ */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            borderRight: "1px solid var(--glass-border)",
            overflow: "hidden",
          }}
        >
          {/* Scrollable controls area */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "22px 20px",
              display: "flex",
              flexDirection: "column",
              gap: "18px",
            }}
          >
            {/* Template */}
            <div className="ph-config-group">
              <label className="ph-label">Template</label>
              <select
                id="rs-template"
                className="modern-input"
                style={{ width: "100%", fontSize: "11px" }}
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                disabled={reportType === "portal_card"}
              >
                <option value="clean_slate">🎨 Classic (Free)</option>
                <option value="class_photo">📷 Class Photo (Free)</option>
                <option
                  value="prestige"
                  disabled={isTemplateLocked("prestige")}
                >
                  {isTemplateLocked("prestige") ? "🔒 " : ""}⭐ Prestige
                  (Silver)
                </option>
                <option value="azure" disabled={isTemplateLocked("azure")}>
                  {isTemplateLocked("azure") ? "🔒 " : ""}⭐ Azure Edge (Silver)
                </option>
                <option value="royal" disabled={isTemplateLocked("royal")}>
                  {isTemplateLocked("royal") ? "🔒 " : ""}⭐⭐ Royal (Gold)
                </option>
                <option value="monarch" disabled={isTemplateLocked("monarch")}>
                  {isTemplateLocked("monarch") ? "🔒 " : ""}⭐⭐ Monarch (Gold)
                </option>
                <option
                  value="sovereign"
                  disabled={isTemplateLocked("sovereign")}
                >
                  {isTemplateLocked("sovereign") ? "🔒 " : ""}💎 Sovereign
                  (Diamond)
                </option>
                <option
                  value="sterling"
                  disabled={isTemplateLocked("sterling")}
                >
                  {isTemplateLocked("sterling") ? "🔒 " : ""}💎 Sterling
                  (Diamond)
                </option>
                <option value="apex" disabled={isTemplateLocked("apex")}>
                  {isTemplateLocked("apex") ? "🔒 " : ""}💎 Apex (Diamond)
                </option>
              </select>
            </div>

            {/* Brand color toggle — Silver+ only for paid templates */}
            {PAID_TEMPLATES.includes(template) &&
              reportType !== "portal_card" && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    background: "rgba(0,229,255,0.06)",
                    border: "1px solid rgba(0,229,255,0.18)",
                    borderRadius: "8px",
                    padding: "7px 12px",
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      cursor: "pointer",
                      fontSize: "11.5px",
                      color: "var(--text-dim)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={useBrandColors}
                      onChange={(e) => setUseBrandColors(e.target.checked)}
                      style={{
                        width: "14px",
                        height: "14px",
                        accentColor: "var(--accent)",
                      }}
                    />
                    <span>Use school brand colors</span>
                  </label>
                  {useBrandColors && (
                    <div
                      style={{
                        display: "flex",
                        gap: "6px",
                        alignItems: "center",
                      }}
                    >
                      <div
                        style={{
                          width: "20px",
                          height: "20px",
                          borderRadius: "4px",
                          border: "1px solid rgba(255,255,255,0.15)",
                          background: brandPrimary,
                        }}
                      />
                      <div
                        style={{
                          width: "20px",
                          height: "20px",
                          borderRadius: "4px",
                          border: "1px solid rgba(255,255,255,0.15)",
                          background: brandSecondary,
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

            {/* Output Format */}
            <div className="ph-config-group">
              <label className="ph-label">Output Format</label>
              <select
                className="modern-input"
                style={{ width: "100%" }}
                value={format}
                onChange={(e) => setFormat(e.target.value)}
              >
                <option value="pdf">📄 PDF</option>
                <option value="html">🌐 HTML File</option>
                <option value="image">🖼️ Image (PNG)</option>
              </select>
            </div>

            {/* Report Type */}
            <div className="ph-config-group">
              <label className="ph-label">Report Type</label>
              <select
                className="modern-input"
                style={{ width: "100%" }}
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
              >
                <option value="terminal">📄 Terminal Report Cards</option>
                <option value="broadsheet">📋 Master Broadsheet</option>
                <option value="portal_card">
                  🔐 Parent Portal Access Cards
                </option>
              </select>
            </div>

            {/* Scope */}
            <div className="ph-config-group">
              <label
                className="ph-label"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                Scope
                {(tier === "Silver" || tier === "Standalone") && (
                  <span
                    style={{
                      fontSize: "10px",
                      color: "#ffd700",
                      background: "rgba(212,175,55,0.12)",
                      border: "1px solid rgba(212,175,55,0.3)",
                      padding: "1px 6px",
                      borderRadius: "10px",
                      textTransform: "uppercase",
                      fontWeight: 800,
                    }}
                  >
                    🔒 Gated to Entire School
                  </span>
                )}
              </label>
              <select
                className="modern-input"
                style={{
                  width: "100%",
                  opacity: tier === "Silver" || tier === "Standalone" ? 0.7 : 1,
                  cursor:
                    tier === "Silver" || tier === "Standalone"
                      ? "not-allowed"
                      : "default",
                  borderColor:
                    tier === "Silver" || tier === "Standalone"
                      ? "rgba(212, 175, 55, 0.2)"
                      : undefined,
                }}
                value={scope}
                onChange={(e) => handleScopeChange(e.target.value)}
                disabled={tier === "Silver" || tier === "Standalone"}
              >
                <option value="all">🏫 Entire School</option>
                <option
                  value="class"
                  disabled={tier === "Silver" || tier === "Standalone"}
                >
                  {tier === "Silver" || tier === "Standalone" ? "🔒 " : ""}🏷️ By
                  Class
                </option>
                <option
                  value="teacher"
                  disabled={tier === "Silver" || tier === "Standalone"}
                >
                  {tier === "Silver" || tier === "Standalone" ? "🔒 " : ""}👩‍🏫 By
                  Teacher
                </option>
                <option
                  value="subject"
                  disabled={tier === "Silver" || tier === "Standalone"}
                >
                  {tier === "Silver" || tier === "Standalone" ? "🔒 " : ""}📚 By
                  Subject
                </option>
                <option
                  value="student"
                  disabled={tier === "Silver" || tier === "Standalone"}
                >
                  {tier === "Silver" || tier === "Standalone" ? "🔒 " : ""}👤
                  Single Student
                </option>
              </select>
              {(tier === "Silver" || tier === "Standalone") && (
                <div
                  style={{
                    fontSize: "11px",
                    color: "var(--text-dim)",
                    marginTop: "4px",
                    lineHeight: "1.4",
                  }}
                >
                  Scope filtering requires a <strong>Gold Plan</strong> or
                  higher.
                </div>
              )}
            </div>

            {/* Conditional scope pickers */}
            {scope === "class" && (
              <div className="ph-config-group">
                <label className="ph-label">Class</label>
                <Combobox
                  options={fullList}
                  value={selectedClass}
                  onChange={setSelectedClass}
                  placeholder="Select Class..."
                />
              </div>
            )}
            {scope === "teacher" && (
              <div className="ph-config-group">
                <label className="ph-label">Teacher</label>
                <select
                  className="modern-input"
                  style={{ width: "100%" }}
                  value={selectedTeacherId}
                  onChange={(e) => setSelectedTeacherId(e.target.value)}
                >
                  <option value="">— Select —</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {scope === "subject" && (
              <div className="ph-config-group">
                <label className="ph-label">Subject</label>
                <select
                  className="modern-input"
                  style={{ width: "100%" }}
                  value={selectedSubject}
                  onChange={(e) => setSelectedSubject(e.target.value)}
                >
                  <option value="">— Select —</option>
                  {subjects.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {scope === "student" && (
              <div className="ph-config-group">
                <label className="ph-label">Student</label>
                <select
                  className="modern-input"
                  style={{ width: "100%" }}
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                >
                  <option value="">— Select —</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.class_name}{s.class_arm ? ` ${s.class_arm}` : ''})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* ── Phase 10: ILS Score Entry Panel ────────────────────── */}
            {scope === 'class' && ilsClassType === 'ILS' && (
              <div style={{ marginTop: '16px', border: '1px solid rgba(0,229,255,0.25)', borderRadius: '10px', overflow: 'hidden' }}>
                <div style={{ background: 'rgba(0,229,255,0.08)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#00E5FF' }}>📚 ILS PAC Score Entry</span>
                  <span style={{ fontSize: '10px', color: '#94a3b8', marginLeft: 'auto' }}>Pass ≥ 85</span>
                </div>
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {/* Student selector */}
                  <div>
                    <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Student</label>
                    <select
                      id="ils-student-select"
                      className="modern-input"
                      style={{ width: '100%' }}
                      value={ilsSelectedStudent}
                      onChange={async (e) => {
                        const sid = e.target.value;
                        setIlsSelectedStudent(sid);
                        setIlsPacScores({});
                        setIlsVerseCount('');
                        setIlsMsg('');
                        if (sid) {
                          const api = (window as any).electronAPI;
                          const [pvRes, vRes] = await Promise.all([
                            api?.ils?.getPacScores(sid),
                            api?.ils?.getVerseCount(sid),
                          ]);
                          const scoreMap: Record<number, string> = {};
                          (pvRes?.scores || []).forEach((r: any) => {
                            if (r.subject === ilsSelectedSubject) scoreMap[r.pack_number] = String(r.score);
                          });
                          setIlsPacScores(scoreMap);
                          setIlsVerseCount(String(vRes?.verse_count || ''));
                          // Build per-subject summary for this student
                          setIlsStudentSummary(pvRes?.subjects || []);
                        }
                      }}
                    >
                      <option value="">— Select student —</option>
                      {students
                        .filter((s: any) => {
                          const cn = selectedClass.trim();
                          const fullName = s.class_arm ? `${s.class_name} ${s.class_arm}` : s.class_name;
                          return fullName?.trim() === cn || s.class_name?.trim() === cn;
                        })
                        .map((s: any) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>
                  </div>

                  {/* Subject selector */}
                  {ilsSelectedStudent && (
                    <div>
                      <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Subject</label>
                      <select
                        id="ils-subject-select"
                        className="modern-input"
                        style={{ width: '100%' }}
                        value={ilsSelectedSubject}
                        onChange={async (e) => {
                          const sub = e.target.value;
                          setIlsSelectedSubject(sub);
                          setIlsMsg('');
                          if (ilsSelectedStudent && sub) {
                            const api = (window as any).electronAPI;
                            const pvRes = await api?.ils?.getPacScores(ilsSelectedStudent);
                            const scoreMap: Record<number, string> = {};
                            (pvRes?.scores || []).forEach((r: any) => {
                              if (r.subject === sub) scoreMap[r.pack_number] = String(r.score);
                            });
                            setIlsPacScores(scoreMap);
                            setIlsStudentSummary(pvRes?.subjects || []);
                          }
                        }}
                      >
                        <option value="">— Select subject —</option>
                        {subjects.map((s: string) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  )}

                  {/* PAC score grid */}
                  {ilsSelectedStudent && ilsSelectedSubject && (
                    <div>
                      <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>Pack Scores (1–{ilsPacCount})</label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                        {Array.from({ length: ilsPacCount }, (_, i) => i + 1).map(pack => {
                          const val = ilsPacScores[pack] ?? '';
                          const num = parseFloat(val);
                          const isPassed = val !== '' && !isNaN(num) && num >= 85;
                          const isFailed = val !== '' && !isNaN(num) && num < 85;
                          return (
                            <div key={pack} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <label style={{ fontSize: '10px', color: '#64748b', width: '42px', flexShrink: 0 }}>{ilsPacLabels[pack - 1]?.trim() || `P${pack}`}</label>
                              <input
                                id={`ils-pack-${pack}-input`}
                                type="number"
                                min={0} max={100} step={1}
                                placeholder="—"
                                value={val}
                                onChange={(e) => setIlsPacScores(prev => ({ ...prev, [pack]: e.target.value }))}
                                style={{
                                  flex: 1, padding: '5px 8px', borderRadius: '6px', fontSize: '12px',
                                  background: isPassed ? 'rgba(16,185,129,0.1)' : isFailed ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.05)',
                                  border: `1px solid ${isPassed ? '#10b981' : isFailed ? '#ef4444' : 'rgba(255,255,255,0.1)'}`,
                                  color: '#f8fafc', outline: 'none',
                                }}
                              />
                              {isPassed && <span style={{ fontSize: '10px', color: '#10b981' }}>✓</span>}
                              {isFailed && <span style={{ fontSize: '10px', color: '#ef4444' }}>✗</span>}
                            </div>
                          );
                        })}
                      </div>

                      {/* Save PAC scores */}
                      <button
                        id="ils-save-pac-btn"
                        disabled={ilsSaving}
                        onClick={async () => {
                          if (!ilsSelectedStudent || !ilsSelectedSubject) return;
                          setIlsSaving(true); setIlsMsg('');
                          try {
                            const api = (window as any).electronAPI;
                            const entries = Object.entries(ilsPacScores).filter(([, v]) => v !== '');
                            for (const [pack, score] of entries) {
                              await api?.ils?.insertPacScore({ studentId: ilsSelectedStudent, subject: ilsSelectedSubject, packNumber: parseInt(pack), score: parseFloat(score as string) });
                            }
                            // Refresh summary
                            const pvRes = await api?.ils?.getPacScores(ilsSelectedStudent);
                            setIlsStudentSummary(pvRes?.subjects || []);
                            setIlsMsg('✅ Saved');
                          } catch (err: any) {
                            setIlsMsg(`❌ ${err?.message || 'Save failed'}`);
                          } finally {
                            setIlsSaving(false);
                            setTimeout(() => setIlsMsg(''), 3000);
                          }
                        }}
                        style={{ marginTop: '8px', width: '100%', padding: '8px', borderRadius: '7px', fontWeight: 700, fontSize: '12px', cursor: ilsSaving ? 'not-allowed' : 'pointer', background: 'rgba(0,229,255,0.15)', border: '1px solid rgba(0,229,255,0.35)', color: '#00E5FF', transition: 'all 0.2s' }}
                      >
                        {ilsSaving ? '⏳ Saving…' : '💾 Save PAC Scores'}
                      </button>
                      {ilsMsg && <span style={{ fontSize: '11px', color: ilsMsg.startsWith('✅') ? '#10b981' : '#ef4444' }}>{ilsMsg}</span>}
                    </div>
                  )}

                  {/* Verse count */}
                  {ilsSelectedStudent && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                      <label style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap' }}>📖 Bible Verse Memory</label>
                      <input
                        id="ils-verse-count-input"
                        type="number" min={0} step={1}
                        placeholder="0"
                        value={ilsVerseCount}
                        onChange={(e) => setIlsVerseCount(e.target.value)}
                        style={{ flex: 1, padding: '5px 8px', borderRadius: '6px', fontSize: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', outline: 'none' }}
                      />
                      <button
                        id="ils-save-verse-btn"
                        onClick={async () => {
                          const api = (window as any).electronAPI;
                          const res = await api?.ils?.setVerseCount(ilsSelectedStudent, parseInt(ilsVerseCount) || 0);
                          setIlsMsg(res?.ok ? '✅ Verse count saved' : `❌ ${res?.error}`);
                          setTimeout(() => setIlsMsg(''), 2500);
                        }}
                        style={{ padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.35)', color: '#a78bfa' }}
                      >
                        Save
                      </button>
                    </div>
                  )}

                  {/* Per-subject summary for the selected student */}
                  {ilsStudentSummary.length > 0 && (
                    <div style={{ marginTop: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: '7px', overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                        <thead>
                          <tr style={{ background: 'rgba(0,229,255,0.08)' }}>
                            <th style={{ padding: '6px 10px', textAlign: 'left', color: '#94a3b8' }}>Subject</th>
                            <th style={{ padding: '6px', textAlign: 'right', color: '#94a3b8' }}>Done</th>
                            <th style={{ padding: '6px', textAlign: 'right', color: '#94a3b8' }}>Hundreds</th>
                            <th style={{ padding: '6px 10px', textAlign: 'right', color: '#94a3b8' }}>Avg</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ilsStudentSummary.map((sub: any) => (
                            <tr key={sub.subject} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                              <td style={{ padding: '6px 10px', color: '#f8fafc' }}>{sub.subject}</td>
                              <td style={{ padding: '6px', textAlign: 'right', color: sub.packs_completed >= 10 ? '#10b981' : '#f59e0b' }}>{sub.packs_completed}/10</td>
                              <td style={{ padding: '6px', textAlign: 'right', color: '#00E5FF' }}>{sub.total_hundreds}</td>
                              <td style={{ padding: '6px 10px', textAlign: 'right', color: '#f8fafc' }}>{sub.average}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Session & Term Selection */}
            <div className="ph-config-group" style={{ marginTop: "8px" }}>
              <label className="ph-label">Academic Session</label>
              <select
                className="modern-input"
                style={{ width: "100%" }}
                value={selectedSession}
                onChange={(e) => setSelectedSession(e.target.value)}
              >
                {sessionsList.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="ph-config-group">
              <label className="ph-label">Academic Term</label>
              <select
                className="modern-input"
                style={{ width: "100%" }}
                value={selectedTerm}
                onChange={(e) => setSelectedTerm(e.target.value)}
              >
                {termsList.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Action Buttons (pinned to bottom of left panel) ── */}
          <div
            style={{
              padding: "16px 20px",
              borderTop: "1px solid var(--glass-border)",
              background: "rgba(0,0,0,0.15)",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                className="ph-type-btn active"
                onClick={handlePreview}
                id="rs-preview-btn"
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: "10px 12px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "12px",
                  gap: "6px",
                }}
              >
                🔍 Preview
              </button>
              <button
                className="primary-btn"
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: "10px 12px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "12px",
                  gap: "6px",
                  animation: "none",
                }}
                id="rs-generate-btn"
                onClick={handleGenerate}
                disabled={!queryResults.length || generating || !isActivated}
                title={!isActivated ? "School activation required to generate reports." : ""}
              >
                {generating ? "⏳ Generating…" : !isActivated ? "🔒 Activation Required" : "📄 Generate & Save"}
              </button>
            </div>

            {queryResults.length > 0 && (
              <div
                style={{ display: "flex", flexDirection: "column", gap: "6px" }}
              >
                {/* Skip-ungraded filter */}
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "11px",
                    color: "var(--text-dim)",
                    cursor: "pointer",
                    padding: "6px 10px",
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid var(--glass-border)",
                    borderRadius: "var(--radius-sm)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={skipUngraded}
                    onChange={(e) => setSkipUngraded(e.target.checked)}
                    style={{
                      accentColor: "var(--accent)",
                      width: "14px",
                      height: "14px",
                    }}
                  />
                  <span>Skip students with 0 grades in report</span>
                  {skipUngraded && (
                    <span
                      style={{
                        marginLeft: "auto",
                        color: "var(--accent)",
                        fontWeight: 700,
                      }}
                    >
                      ({queryResults.filter((s) => (s.average ?? 0) > 0).length}{" "}
                      / {queryResults.length})
                    </span>
                  )}
                </label>

                <button
                  onClick={handleOpenBulkRemarks}
                  style={{
                    padding: "8px 16px",
                    fontSize: "12px",
                    background: "rgba(255,255,255,0.05)",
                    color: "#fff",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: "8px",
                    cursor: "pointer",
                    width: "100%",
                  }}
                >
                  ✏️ Edit Bulk Remarks & Attendance
                </button>
              </div>
            )}

            {lastImagePath && format === "image" && (
              <button
                onClick={handleCopyImage}
                style={{
                  padding: "8px 16px",
                  fontSize: "12px",
                  background: "rgba(0,229,255,0.1)",
                  color: "#00e5ff",
                  border: "1px solid rgba(0,229,255,0.3)",
                  borderRadius: "8px",
                  cursor: "pointer",
                  width: "100%",
                }}
              >
                📋 Copy Image to Clipboard
              </button>
            )}

            {generatedPath && (
              <span
                style={{
                  fontSize: "10px",
                  color: "var(--text-dim)",
                  wordBreak: "break-all",
                }}
              >
                {generatedPath}
              </span>
            )}
          </div>
        </div>

        {/* ═══ RIGHT COLUMN: Template Preview + Results Table ═══ */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Template Preview Section */}
          <div
            style={{
              flex: previewActive ? "0 0 auto" : "1",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "12px",
              padding: "24px 28px",
              background: "rgba(0,0,0,0.18)",
              overflowY: "auto",
              maxHeight: previewActive ? "380px" : undefined,
            }}
          >
            <span
              className="ph-label"
              style={{
                fontSize: "10px",
                textTransform: "uppercase",
                letterSpacing: "1.5px",
                opacity: 0.55,
                flexShrink: 0,
                alignSelf: "center",
              }}
            >
              📋 Template Preview
            </span>
            <div
              style={{
                width: "100%",
                maxWidth: "460px",
                aspectRatio: "1 / 1.414",
                background: "rgba(255,255,255,0.04)",
                borderRadius: "8px",
                border: imgError
                  ? "1px dashed rgba(255,255,255,0.15)"
                  : "1px solid rgba(255,255,255,0.06)",
                overflow: "hidden",
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 12px 48px rgba(0,0,0,0.55)",
                flexShrink: 0,
              }}
            >
              {imgError ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "8px",
                    color: "rgba(255,255,255,0.3)",
                  }}
                >
                  <span style={{ fontSize: "28px" }}>🖼️</span>
                  <span
                    style={{
                      fontSize: "10px",
                      textAlign: "center",
                      lineHeight: 1.4,
                    }}
                  >
                    Preview image
                    <br />
                    not yet available
                  </span>
                </div>
              ) : (
                <img
                  src={templateImgSrc}
                  alt={`${template} template preview`}
                  onError={() => setImgError(true)}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    objectPosition: "top center",
                    display: "block",
                    borderRadius: "3px",
                  }}
                />
              )}
            </div>
            <span
              style={{
                fontSize: "10px",
                color: "var(--text-dim)",
                textAlign: "center",
                lineHeight: 1.6,
                flexShrink: 0,
                opacity: 0.7,
              }}
            >
              Preview updates instantly · Scroll to view details
            </span>
          </div>

          {/* Preview Roster Table — appears below the preview when active */}
          {previewActive && (
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                borderTop: "1px solid var(--glass-border)",
              }}
            >
              <div
                style={{
                  padding: "14px 20px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span
                  id="rs-preview-label"
                  style={{ fontSize: "12px", color: "var(--text-dim)" }}
                >
                  {queryMessage}
                </span>
              </div>

              {/* WhatsApp/Email Dispatch Card (Gold+) */}
              {tier !== "Silver" && tier !== "Standalone" && queryResults.length > 0 && (
                <div
                  className="card"
                  style={{
                    padding: "16px 20px",
                    background: "rgba(0, 229, 255, 0.03)",
                    border: "1px solid rgba(0, 229, 255, 0.15)",
                    margin: "0 20px 16px",
                    flexShrink: 0,
                  }}
                >
                  <p style={{ fontSize: "11px", color: "var(--accent)", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700, margin: "0 0 12px 0" }}>
                    📤 Send Results to Parents (Nexus Pulse)
                  </p>
                  <div style={{ display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "12px" }}>
                      <input type="checkbox" checked={sendWA} onChange={e => setSendWA(e.target.checked)} style={{ width: "14px", height: "14px", accentColor: "var(--accent)" }} />
                      <span>WhatsApp PDF Attachment 💬</span>
                    </label>

                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "12px" }}>
                      <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} style={{ width: "14px", height: "14px", accentColor: "var(--accent)" }} />
                      <span>Email PDF Attachment 📧</span>
                    </label>

                    <button
                      className="primary-btn"
                      onClick={handleDispatch}
                      disabled={dispatching || (!sendWA && !sendEmail)}
                      style={{ padding: "6px 14px", fontSize: "12px", background: "var(--accent)", color: "#000", border: "none", animation: "none", boxShadow: "none" }}
                    >
                      {dispatching ? "⚡ Sending…" : "⚡ Dispatch Results"}
                    </button>
                    {dispatchStatus && (
                      <span style={{ fontSize: "12px", color: "var(--text-dim)" }}>{dispatchStatus}</span>
                    )}
                  </div>
                </div>
              )}

              {/* S8-5: Publish to Parent Portal Card */}
              {queryResults.length > 0 && (
                <div
                  className="card"
                  style={{
                    padding: "16px 20px",
                    background: "rgba(0, 229, 255, 0.02)",
                    border: "1px solid rgba(0, 229, 255, 0.1)",
                    margin: "0 20px 16px",
                    flexShrink: 0,
                  }}
                >
                  <p style={{ fontSize: "11px", color: "var(--accent)", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700, margin: "0 0 12px 0" }}>
                    🌐 E-Portal Result Publishing
                  </p>
                  <p style={{ fontSize: "11px", color: "var(--text-dim)", margin: "0 0 12px 0", lineHeight: 1.5 }}>
                    Publish this term's results to the parent web portal. This generates and uploads report card PDFs automatically.
                  </p>
                  <div style={{ display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
                    <button
                      className="primary-btn"
                      onClick={handlePublishToPortal}
                      disabled={publishingPortal}
                      style={{ padding: "6px 14px", fontSize: "12px", animation: "none", boxShadow: "none" }}
                    >
                      {publishingPortal ? `⧗ ${publishProgress || "Publishing…"}` : "🌐 Publish to Portal"}
                    </button>
                    {publishStatus && (
                      <span style={{ fontSize: "12px", color: "var(--text-dim)" }}>{publishStatus}</span>
                    )}
                  </div>
                </div>
              )}

               <div
                 className="table-container"
                 id="rs-preview-container"
                 style={{ margin: "0 0 16px" }}
               >
                 <table className="data-table">
                   <thead>
                     <tr>
                       <th>#</th>
                       <th>Student Name</th>
                       <th>Class</th>
                       <th>Subjects Recorded</th>
                       <th>Total Score</th>
                       <th>Average</th>
                       <th>Fee Status</th>
                     </tr>
                   </thead>
                   <tbody>
                     {queryResults.length === 0 ? (
                       <tr>
                         <td
                           colSpan={7}
                           style={{
                             textAlign: "center",
                             padding: "30px",
                             color: "var(--text-dim)",
                           }}
                         >
                           {queryMessage.includes("Querying")
                             ? "⏳ Loading…"
                             : "No results found. Ensure grades have been synced from teacher devices."}
                         </td>
                       </tr>
                     ) : (
                       (skipUngraded
                         ? queryResults.filter((s) => (s.average ?? 0) > 0)
                         : queryResults
                       ).map((s, i) => {
                         const isOwing = s.fee_status === 'owing' || s.feeStatus === 'owing';
                         return (
                           <tr key={s.id} style={isOwing ? { background: 'rgba(239,68,68,0.06)' } : undefined}>
                             <td>{i + 1}</td>
                             <td>
                               <strong>{s.name}</strong>
                             </td>
                             <td>{s.class_name}{s.class_arm ? ` ${s.class_arm}` : ''}</td>
                             <td>
                               {s.subjects?.filter((x: any) => x.score !== null)
                                 .length || 0}{" "}
                               graded
                             </td>
                             <td>
                               {s.total_score != null && !isNaN(Number(s.total_score))
                                 ? Number(s.total_score).toFixed(2)
                                 : "—"}
                             </td>
                             <td>{s.average ?? "—"}</td>
                             <td>
                               <span style={{
                                 display: 'inline-block',
                                 padding: '2px 8px',
                                 borderRadius: '9999px',
                                 fontSize: '11px',
                                 fontWeight: 600,
                                 background: isOwing ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
                                 color: isOwing ? '#f87171' : '#34d399',
                                 border: `1px solid ${isOwing ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
                               }}>
                                 {isOwing ? '⛔ Owing' : '✅ Cleared'}
                               </span>
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
         </div>
       </div>


      {/* ── Bulk Remarks Modal ── */}
      {isRemarksOpen && (
        <div
          style={
            {
              position: "fixed",
              inset: 0,
              zIndex: 2000,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0, 0, 0, 0.75)",
              backdropFilter: "blur(8px)",
              userSelect: "none",
              WebkitAppRegion: "no-drag",
            } as React.CSSProperties
          }
        >
          <div
            style={{
              background: "var(--bg-dark)",
              border: "1px solid var(--glass-border)",
              borderRadius: "var(--radius-xl)",
              width: "90%",
              maxWidth: "950px",
              height: "82vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5)",
            }}
          >
            {/* Modal Header — fixed, not part of scrollable area */}
            <div
              style={{
                padding: "14px 20px",
                borderBottom: "1px solid var(--glass-border)",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                background: "rgba(0,0,0,0.2)",
                flexShrink: 0,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3
                  style={{
                    margin: 0,
                    fontSize: "13px",
                    fontWeight: 700,
                    color: "var(--text-main)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  ✏️ Bulk Remarks & Attendance Ledger
                </h3>
                <p
                  style={{
                    margin: "3px 0 0",
                    fontSize: "11px",
                    color: "var(--text-dim)",
                  }}
                >
                  Input student remarks and attendance days directly for this
                  report batch.
                </p>
              </div>
              <button
                onClick={handleAutoFillRemarks}
                className="secondary-btn"
                style={{
                  padding: "5px 11px",
                  fontSize: "11px",
                  borderRadius: "var(--radius-sm)",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                ⚡ Auto-Fill Remarks
              </button>
              <button
                onClick={() => setIsRemarksOpen(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-dim)",
                  cursor: "pointer",
                  fontSize: "18px",
                  display: "flex",
                  alignItems: "center",
                  flexShrink: 0,
                  padding: "0 4px",
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
              {remarksSaveStatus && (
                <div
                  style={{
                    marginBottom: "14px",
                    background: "rgba(0, 229, 255, 0.1)",
                    border: "1px solid rgba(0, 229, 255, 0.25)",
                    borderRadius: "var(--radius-sm)",
                    padding: "10px 16px",
                    fontSize: "12px",
                    color: "var(--accent)",
                  }}
                >
                  {remarksSaveStatus}
                </div>
              )}
              <div className="table-container" style={{ margin: 0 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Student Details</th>
                      {tier !== "Standalone" && tier !== "Silver" && (
                        <th style={{ width: "150px" }}>Term Attendance</th>
                      )}
                      <th>Class Teacher's Remarks</th>
                      <th>{ilsClassType === 'ILS' ? "Section Manager's Remarks" : "Principal's Remarks"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {remarksData.map((student, idx) => (
                      <tr key={student.id}>
                        <td>
                          <div style={{ fontWeight: "bold" }}>
                            {student.name}
                          </div>
                          <div
                            style={{
                              fontSize: "10px",
                              color: "var(--text-dim)",
                              fontFamily: "var(--font-mono)",
                            }}
                          >
                            {student.class_name}{student.class_arm ? ` ${student.class_arm}` : ''} · {ilsClassType === 'ILS' ? 'ILS Avg' : 'Avg'}: {student.average ?? '—'}
                            {ilsClassType === 'ILS' ? '' : '%'}
                          </div>
                        </td>
                        {tier !== "Standalone" && tier !== "Silver" && (
                          <td>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                              }}
                            >
                              <input
                                type="number"
                                value={student.days_attended || 0}
                                onChange={(e) =>
                                  setRemarksData((prev) =>
                                    prev.map((s, i) =>
                                      i === idx
                                        ? {
                                            ...s,
                                            days_attended:
                                              parseInt(e.target.value) || 0,
                                          }
                                        : s,
                                    ),
                                  )
                                }
                                className="modern-input"
                                style={{
                                  width: "52px",
                                  textAlign: "center",
                                  fontSize: "12px",
                                  padding: "4px 6px",
                                }}
                              />
                              <span style={{ color: "var(--text-dim)" }}>
                                /
                              </span>
                              <input
                                type="number"
                                value={student.total_days || 0}
                                onChange={(e) =>
                                  setRemarksData((prev) =>
                                    prev.map((s, i) =>
                                      i === idx
                                        ? {
                                            ...s,
                                            total_days:
                                              parseInt(e.target.value) || 0,
                                          }
                                        : s,
                                    ),
                                  )
                                }
                                className="modern-input"
                                style={{
                                  width: "52px",
                                  textAlign: "center",
                                  fontSize: "12px",
                                  padding: "4px 6px",
                                }}
                              />
                            </div>
                        </td>
                        )}
                        <td>
                          <textarea
                            value={student.remark || ""}
                            onChange={(e) =>
                              setRemarksData((prev) =>
                                prev.map((s, i) =>
                                  i === idx
                                    ? { ...s, remark: e.target.value }
                                    : s,
                                ),
                              )
                            }
                            className="modern-input"
                            style={{
                              width: "100%",
                              height: "56px",
                              resize: "vertical",
                              fontSize: "12px",
                              padding: "6px 10px",
                            }}
                            placeholder="Teacher remarks..."
                          />
                        </td>
                        <td>
                          <textarea
                            value={student.principal_remark || ""}
                            onChange={(e) =>
                              setRemarksData((prev) =>
                                prev.map((s, i) =>
                                  i === idx
                                    ? { ...s, principal_remark: e.target.value }
                                    : s,
                                ),
                              )
                            }
                            className="modern-input"
                            style={{
                              width: "100%",
                              height: "56px",
                              resize: "vertical",
                              fontSize: "12px",
                              padding: "6px 10px",
                            }}
                            placeholder="Principal remarks..."
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: "16px 24px",
                borderTop: "1px solid var(--glass-border)",
                background: "rgba(0, 0, 0, 0.15)",
                flexShrink: 0,
                display: "flex",
                justifyContent: "flex-end",
                gap: "8px",
              }}
            >
              <button
                onClick={() => setIsRemarksOpen(false)}
                className="secondary-btn"
              >
                Close
              </button>
              <button onClick={handleSaveBulkRemarks} className="primary-btn">
                Save All Remarks
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Fullscreen Report Card Preview Modal ── */}
      {isPreviewModalOpen && (() => {
        const isILSPreview = ilsClassType === 'ILS';
        const previewResults = (() => {
          if (isILSPreview) {
            return queryResults.filter((s) => {
              const ilSubs: any[] = (s as any).il_subjects || [];
              const totalGraded = ilSubs.reduce((acc: number, sub: any) => acc + (sub.packs_completed || 0), 0);
              // Filter 1: skip students with zero graded PACs
              if (ilsSkipZeroPacs && totalGraded === 0) return false;
              // Filter 2: skip students where Pack 1 has not been graded in any subject
              if (ilsSkipP1Unstarted) {
                const hasAnyP1 = ilSubs.some((sub: any) => {
                  const packs = sub.packs || {};
                  return packs[1] !== undefined && packs[1] !== null;
                });
                if (!hasAnyP1) return false;
              }
              return true;
            });
          }
          // Standard students: use existing skipZeroGrades logic
          return skipZeroGrades
            ? queryResults.filter((s) => (s.average ?? 0) > 0)
            : queryResults;
        })();
        return (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0, 0, 0, 0.85)",
            backdropFilter: "blur(10px)",
            display: "flex",
            flexDirection: "column",
            padding: "24px",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "16px",
              paddingBottom: "12px",
              borderBottom: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: "18px", color: "#fff", fontWeight: 700 }}>
                🔍 Report Card Preview — {queryMessage}
              </h3>
              <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "var(--text-dim)" }}>
                Template: <strong style={{ color: "#00E5FF" }}>{template}</strong> · Scope: <strong style={{ color: "#00E5FF" }}>{scope}</strong>
                {' '}·{' '}
                <span style={{ color: skipZeroGrades ? '#10b981' : 'var(--text-dim)' }}>
                  {previewResults.length} of {queryResults.length} student(s)
                </span>
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {/* ── ILS-specific filters ── */}
              {ilsClassType === 'ILS' ? (
                <>
                  <label
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      fontSize: '12px', color: '#fff', cursor: 'pointer',
                      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                      padding: '5px 10px', borderRadius: '6px', userSelect: 'none'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={ilsSkipZeroPacs}
                      onChange={(e) => setIlsSkipZeroPacs(e.target.checked)}
                      style={{ accentColor: '#10b981' }}
                    />
                    Skip 0-graded PAC students
                  </label>
                  <label
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      fontSize: '12px', color: '#fff', cursor: 'pointer',
                      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                      padding: '5px 10px', borderRadius: '6px', userSelect: 'none'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={ilsSkipP1Unstarted}
                      onChange={(e) => setIlsSkipP1Unstarted(e.target.checked)}
                      style={{ accentColor: '#f59e0b' }}
                    />
                    Skip students with Pack 1 &lt; N grading
                  </label>
                </>
              ) : (
                /* ── Standard filter ── */
                <label
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    fontSize: '12px', color: '#fff', cursor: 'pointer',
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                    padding: '5px 10px', borderRadius: '6px', userSelect: 'none'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={skipZeroGrades}
                    onChange={(e) => setSkipZeroGrades(e.target.checked)}
                    style={{ accentColor: '#00E5FF' }}
                  />
                  Skip students with zero grades
                </label>
              )}
              <button
                onClick={() => setIsPreviewModalOpen(false)}
                className="secondary-btn"
                style={{ padding: "8px 16px", fontSize: "13px", cursor: "pointer" }}
              >
                ✕ Close Preview
              </button>
            </div>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: "auto",
              display: "grid",
              gridTemplateColumns: "1fr 400px",
              gap: "20px",
              background: "rgba(13, 18, 53, 0.6)",
              borderRadius: "12px",
              padding: "20px",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {/* Template Card Visual Preview */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.3)", borderRadius: "8px", padding: "16px" }}>
              <img
                src={templateImgSrc}
                alt="Report Card Template Preview"
                style={{ maxWidth: "100%", maxHeight: "550px", borderRadius: "8px", boxShadow: "0 10px 30px rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
            </div>

            {/* Queried Student Roster & Scores */}
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", overflowY: "auto" }}>
              <h4 style={{ margin: 0, fontSize: "14px", color: "#fff" }}>
                Queried Students ({previewResults.length}{previewResults.length !== queryResults.length ? ` / ${queryResults.length} total` : ''})
              </h4>
              {previewResults.length !== queryResults.length && (
                <p style={{ margin: '0 0 4px', fontSize: '11px', color: '#f59e0b', fontStyle: 'italic' }}>
                  ⚠️ {queryResults.length - previewResults.length} student(s) hidden by active filters.
                </p>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {previewResults.slice(0, 50).map((s, idx) => {
                  const isOwing = (s as any).fee_status === 'owing' || (s as any).feeStatus === 'owing';
                  return (
                    <div key={s.id || idx} style={{
                      background: isOwing ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.04)',
                      borderRadius: '6px', padding: '10px 12px', fontSize: '12px',
                      border: `1px solid ${isOwing ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.06)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
                    }}>
                      <div>
                        <div style={{ fontWeight: 600, color: '#fff' }}>{s.name}</div>
                        <div style={{ color: 'var(--text-dim)', fontSize: '11px', marginTop: '2px' }}>
                          {Array.isArray((s as any).il_subjects) || (s as any).curriculum_type === 'ILS' ? (() => {
                            const ilSubs = (s as any).il_subjects || [];
                            const subCount = ilSubs.length;
                            const totalGradedPacks = ilSubs.reduce((acc: number, sub: any) => acc + (sub.packs_completed || 0), 0);
                            const pacCap = (s as any).pac_count || ilsPacCount || 12;
                            const totalPossible = subCount * pacCap;
                            return `Class: ${s.class_name} · Subjects: ${subCount} · PACs: ${totalGradedPacks} / ${totalPossible}`;
                          })() : (
                            `Class: ${s.class_name} ${(s as any).class_arm || ''} · Score: ${(s as any).total_score ?? '—'} · Avg: ${s.average ? `${s.average}%` : '—'}`
                          )}
                        </div>
                      </div>
                      <span style={{
                        flexShrink: 0, padding: '2px 8px', borderRadius: '9999px', fontSize: '10px',
                        fontWeight: 600,
                        background: isOwing ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
                        color: isOwing ? '#f87171' : '#34d399',
                        border: `1px solid ${isOwing ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
                      }}>
                        {isOwing ? '⛔ Owing' : '✅ Cleared'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginTop: "16px", flexWrap: "wrap", background: "rgba(0,0,0,0.3)", padding: "12px 16px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#fff", cursor: "pointer" }}>
                <input type="checkbox" checked={sendWA} onChange={(e) => setSendWA(e.target.checked)} />
                💬 WhatsApp
              </label>
              <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#fff", cursor: "pointer" }}>
                <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
                📧 Email
              </label>
              <button
                onClick={handleDispatch}
                disabled={dispatching || (!sendWA && !sendEmail) || !isActivated}
                title={!isActivated ? "School activation required to dispatch results." : ""}
                className="secondary-btn"
                style={{ padding: "6px 14px", fontSize: "12px", cursor: isActivated ? "pointer" : "not-allowed" }}
              >
                {dispatching ? "⚡ Sending…" : "⚡ Dispatch Results"}
              </button>
              <button
                onClick={handlePublishToPortal}
                disabled={publishingPortal || !isActivated}
                title={!isActivated ? "School activation required to publish to portal." : ""}
                className="secondary-btn"
                style={{ padding: "6px 14px", fontSize: "12px", cursor: isActivated ? "pointer" : "not-allowed" }}
              >
                {publishingPortal ? "☁️ Publishing…" : "☁️ Publish to Portal"}
              </button>
              {(dispatchStatus || publishStatus || publishProgress) && (
                <span style={{ fontSize: "11px", color: "#00E5FF" }}>
                  {dispatchStatus || publishStatus || publishProgress}
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => setIsPreviewModalOpen(false)} className="secondary-btn" style={{ padding: "8px 16px" }}>
                Close
              </button>
              <button
                onClick={() => { setIsPreviewModalOpen(false); handleGenerate(); }}
                disabled={!isActivated}
                title={!isActivated ? "School activation required to generate reports." : ""}
                className="primary-btn"
                style={{ padding: "8px 20px", opacity: isActivated ? 1 : 0.5, cursor: isActivated ? "pointer" : "not-allowed" }}
              >
                {isActivated ? "⚡ Generate Reports PDF" : "🔒 Activation Required"}
              </button>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}

export default ResultStudio;
