import React, { useState, useEffect } from "react";
import { useLicense } from "../hooks/useLicense";
import { useClassArms } from "../hooks/useClassArms";
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
  const tier = license?.tier || "Silver";
  const [loading, setLoading] = useState(false);

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
  const [format, setFormat] = useState("pdf");
  const [template, setTemplate] = useState("clean_slate");
  const [useBrandColors, setUseBrandColors] = useState(false);
  const [imgError, setImgError] = useState(false);

  // Pickers metadata lists
  const [selectedClass, setSelectedClass] = useState("");
  const [teachers, setTeachers] = useState<{ id: string; name: string }[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [selectedSubject, setSelectedSubject] = useState("");
  const [students, setStudents] = useState<
    { id: string; name: string; class_name: string; class_arm?: string }[]
  >([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");

  // Results Querying state
  const [queryResults, setQueryResults] = useState<StudentResult[]>([]);
  const [queryMessage, setQueryMessage] = useState("");
  const [previewActive, setPreviewActive] = useState(false);

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

  // Report filter options
  const [skipUngraded, setSkipUngraded] = useState(false);

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
      const cfg = await window.electronAPI.getTermConfig();
      const session = cfg?.academic_session || "2025/2026";
      const term = cfg?.term || "First Term";
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
      } else {
        setQueryMessage("❌ Query failed: " + resp.error);
      }
    } catch (err: any) {
      setQueryMessage("❌ Error: " + err.message);
    }
  };

  // S8-4: Dispatch Results via WhatsApp/Email (Gold/Diamond)
  const handleDispatch = async () => {
    if (!queryResults.length || !(window as any).electronAPI?.results?.dispatch) return;
    setDispatching(true);
    setDispatchStatus("⏳ Dispatching to " + queryResults.length + " student(s)…");
    try {
      const cfg = await window.electronAPI.getTermConfig();
      const term = cfg?.term || "First Term";
      const session = cfg?.academic_session || "2024/2025";
      const channels = [];
      if (sendWA) channels.push("whatsapp");
      if (sendEmail) channels.push("email");

      const res = await (window as any).electronAPI.results.dispatch({
        scope,
        studentId: scope === "student" ? selectedStudentId : null,
        className: scope === "class" ? selectedClass : null,
        term,
        academicSession: session,
        channels
      });

      if (res?.ok) {
        const parts = [];
        if (res.dispatched) parts.push(res.dispatched + " sent");
        if (res.queued)     parts.push(res.queued + " queued (email)");
        if (res.skipped)    parts.push(res.skipped + " skipped");
        setDispatchStatus("✅ Done — " + parts.join(" · "));
      } else {
        setDispatchStatus("❌ Dispatch failed: " + (res?.error || "Unknown error"));
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
    setPublishingPortal(true);
    setPublishProgress("Generating PDFs…");
    setPublishStatus("");
    try {
      const cfg = await window.electronAPI.getTermConfig();
      const term = cfg?.term || "First Term";
      const session = cfg?.academic_session || "2024/2025";

      const res = await (window as any).electronAPI.results.publish({
        term,
        academicSession: session
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
    setGenerating(true);
    setGenStatus("⏳ Generating reports...");
    setGeneratedPath("");
    setLastImagePath(null);
    (window as any).isReportGenerating = true;

    try {
      const identity = await window.electronAPI.getIdentity();
      const cfg = await window.electronAPI.getTermConfig();

      // Apply the admin-controlled skip-ungraded filter before generating
      const studentsToGenerate = skipUngraded
        ? queryResults.filter((s) => (s.average ?? 0) > 0)
        : queryResults;

      if (!studentsToGenerate.length) {
        setGenStatus(
          "⚠️ No students to generate — all are ungraded and skip-ungraded is enabled.",
        );
        setGenerating(false);
        return;
      }

      const res = await window.electronAPI.generateReports({
        identity,
        students: studentsToGenerate,
        termConfig: cfg,
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
      const sourceList = skipUngraded
        ? queryResults.filter((s) => (s.average ?? 0) > 0)
        : queryResults;
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

    setRemarksData((prev) =>
      prev.map((student) => {
        let remark = student.remark;
        let princ = student.principal_remark;
        const avgRaw = parseFloat(student.average);
        const hasGrades = !isNaN(avgRaw);
        const avg = hasGrades ? avgRaw : 0;

        if (!remark) {
          if (!hasGrades) {
            remark = "No academic records for this term.";
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
                disabled={!queryResults.length || generating}
              >
                {generating ? "⏳ Generating…" : "📄 Generate & Save"}
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
                      {publishingPortal ? `⏳ ${publishProgress || "Publishing…"}` : "🌐 Publish to Portal"}
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
                    </tr>
                  </thead>
                  <tbody>
                    {queryResults.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
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
                      ).map((s, i) => (
                        <tr key={s.id}>
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
                        </tr>
                      ))
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
                      <th>Principal's Remarks</th>
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
                            {student.class_name}{student.class_arm ? ` ${student.class_arm}` : ''} · Avg: {student.average ?? '—'}
                            %
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
    </div>
  );
}

export default ResultStudio;
