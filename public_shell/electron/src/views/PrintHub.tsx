import React, { useState, useEffect } from "react";
import { useLicense } from "../hooks/useLicense";
import { generateSessionsList } from "../lib/sessions";
import { SetupGuardModal } from "../components/SetupGuardModal";

interface GradingComponent {
  key: string;
  label: string;
  max: number;
}

const sortGradingComponents = (comps: GradingComponent[]) => {
  return [...comps].sort((a, b) => {
    const aKey = (a.key || a.label || "").toLowerCase();
    const bKey = (b.key || b.label || "").toLowerCase();
    const isACaOrExam = aKey.startsWith("ca") || aKey.includes("exam");
    const isBCaOrExam = bKey.startsWith("ca") || bKey.includes("exam");
    if (isACaOrExam && !isBCaOrExam) return 1;
    if (!isACaOrExam && isBCaOrExam) return -1;
    if (isACaOrExam && isBCaOrExam) {
      const isAExam = aKey.includes("exam");
      const isBExam = bKey.includes("exam");
      if (isAExam && !isBExam) return 1;
      if (!isAExam && isBExam) return -1;
    }
    return aKey.localeCompare(bKey, undefined, { numeric: true, sensitivity: "base" });
  });
};

interface TermConfig {
  academic_session?: string;
  term?: string;
  resumption_date?: string;
  term_start_date?: string;
  term_end_date?: string;
  show_position?: boolean;
  show_domains?: boolean;
  show_attendance?: boolean;
  attendance_score_weight?: number;
  grading_scale?: string;
  template?: string;
}

interface StudentResult {
  id: string;
  name: string;
  class_name: string;
  subjects?: any[];
  total_score?: number;
  average?: number;
}

interface PrintHubProps {
  onTabChange: (tab: string) => void;
}

export function PrintHub({ onTabChange }: PrintHubProps) {
  const { license } = useLicense();
  const currentTier = license?.tier || "Silver";

  const isTemplateLocked = (tpl: string) => {
    if (tpl === 'clean_slate' || tpl === 'class_photo') return false;
    if (currentTier === 'Standalone') return true;
    if (currentTier === 'Silver') return ['royal', 'monarch', 'sovereign', 'sterling', 'apex'].includes(tpl);
    if (currentTier === 'Gold') return ['sovereign', 'sterling', 'apex'].includes(tpl);
    return false;
  };

  // Config States
  const [session, setSession] = useState("2025/2026");
  const [term, setTerm] = useState("First Term");
  const [resumptionDate, setResumptionDate] = useState("");
  const [termStartDate, setTermStartDate] = useState("");
  const [termEndDate, setTermEndDate] = useState("");
  const [showPosition, setShowPosition] = useState(true);
  const [setupGuardOpen, setSetupGuardOpen] = useState(false);
  const [setupGuardStep, setSetupGuardStep] = useState("");
  const [setupGuardMessage, setSetupGuardMessage] = useState("");
  const [showDomains, setShowDomains] = useState(true);
  const [showAttendance, setShowAttendance] = useState(true);
  const [includeAttendance, setIncludeAttendance] = useState(true);
  const [attendanceWeight, setAttendanceWeight] = useState(10);
  const [template, setTemplate] = useState("clean_slate");
  const [excludeUnregistered, setExcludeUnregistered] = useState(false);

  // Grading scale components
  const [components, setComponents] = useState<GradingComponent[]>([
    { key: "CA1", label: "C.A. 1", max: 10 },
    { key: "CA2", label: "C.A. 2", max: 10 },
    { key: "Exam", label: "Exam", max: 80 },
  ]);

  // Adding components fields
  const [newCompLabel, setNewCompLabel] = useState("");
  const [newCompMax, setNewCompMax] = useState<number | "">("");

  // Results Querying states
  const [reportType, setReportType] = useState<"terminal" | "broadsheet">(
    "terminal",
  );
  const [queryScope, setQueryScope] = useState("class");
  const [classes, setClasses] = useState<string[]>([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [teachers, setTeachers] = useState<{ id: string; name: string }[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [subjectInput, setSubjectInput] = useState("");
  const [students, setStudents] = useState<
    { id: string; name: string; class_name: string }[]
  >([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");

  // Query Results list
  const [queryResults, setQueryResults] = useState<StudentResult[]>([]);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryMessage, setQueryMessage] = useState("");
  const [saveStatus, setSaveStatus] = useState("");

  // Template preview mapping
  const templateImgMap: Record<string, string> = {
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

  const currentTemplateImg = templateImgMap[template] || "classic";
  // Use correct relative path for Vite build output (dist/renderer.html)
  const previewImgSrc = `../node_modules/@nexus/engine/assets/templates/${currentTemplateImg}.png`;

  // Total components score
  const hasAttendanceAccess = currentTier !== "Silver" && currentTier !== "Standalone";
  const totalScoreSum =
    components.reduce((acc, c) => acc + (c.max || 0), 0) +
    (includeAttendance && hasAttendanceAccess ? Number(attendanceWeight) || 0 : 0);

  // Load configs & pickers metadata
  useEffect(() => {
    const loadConfig = async () => {
      if (!window.electronAPI) return;
      try {
        const cfg = await window.electronAPI.getTermConfig();
        const hasAtt = currentTier !== "Silver" && currentTier !== "Standalone";
        if (cfg) {
          if (cfg.academic_session) setSession(cfg.academic_session);
          if (cfg.term) setTerm(cfg.term);
          if (cfg.resumption_date) setResumptionDate(cfg.resumption_date);
          if (cfg.term_start_date) setTermStartDate(cfg.term_start_date);
          if (cfg.term_end_date) setTermEndDate(cfg.term_end_date);
          if (cfg.show_position !== undefined)
            setShowPosition(
              cfg.show_position !== false && cfg.show_position !== 0,
            );
          if (cfg.show_domains !== undefined)
            setShowDomains(
              cfg.show_domains !== false && cfg.show_domains !== 0,
            );

          const dbAttWeight = cfg.attendance_score_weight !== undefined
            ? Number(cfg.attendance_score_weight)
            : 0;
          setAttendanceWeight(hasAtt ? (dbAttWeight || 10) : 0);

          const dbShowAtt = cfg.show_attendance !== undefined
            ? (cfg.show_attendance !== false && cfg.show_attendance !== 0)
            : true;
          setShowAttendance(hasAtt && dbShowAtt);

          const dbIncludeAtt = cfg.include_attendance_in_grades !== undefined
            ? (cfg.include_attendance_in_grades !== false && cfg.include_attendance_in_grades !== 0)
            : (dbAttWeight > 0);
          setIncludeAttendance(hasAtt && dbIncludeAtt);

          if (cfg.template) {
            setTemplate(isTemplateLocked(cfg.template) ? "clean_slate" : cfg.template);
          }

          // Unregistered courses exclusion flag
          setExcludeUnregistered(cfg.exclude_unregistered_from_totals === 1 || cfg.exclude_unregistered_from_totals === true);

          if (cfg.grading_scale) {
            const raw = JSON.parse(cfg.grading_scale);
            if (
              raw &&
              !Array.isArray(raw) &&
              raw.components &&
              raw.components.length
            ) {
              setComponents(sortGradingComponents(raw.components));
            } else {
              setComponents(hasAtt ? [
                { key: "CA1", label: "C.A. 1", max: 10 },
                { key: "CA2", label: "C.A. 2", max: 10 },
                { key: "Exam", label: "Exam", max: 70 },
              ] : [
                { key: "CA1", label: "C.A. 1", max: 10 },
                { key: "CA2", label: "C.A. 2", max: 10 },
                { key: "Exam", label: "Exam", max: 80 },
              ]);
            }
          } else {
            setComponents(hasAtt ? [
              { key: "CA1", label: "C.A. 1", max: 10 },
              { key: "CA2", label: "C.A. 2", max: 10 },
              { key: "Exam", label: "Exam", max: 70 },
            ] : [
              { key: "CA1", label: "C.A. 1", max: 10 },
              { key: "CA2", label: "C.A. 2", max: 10 },
              { key: "Exam", label: "Exam", max: 80 },
            ]);
          }
        } else {
          setAttendanceWeight(hasAtt ? 10 : 0);
          setIncludeAttendance(hasAtt);
          setComponents(hasAtt ? [
            { key: "CA1", label: "C.A. 1", max: 10 },
            { key: "CA2", label: "C.A. 2", max: 10 },
            { key: "Exam", label: "Exam", max: 70 },
          ] : [
            { key: "CA1", label: "C.A. 1", max: 10 },
            { key: "CA2", label: "C.A. 2", max: 10 },
            { key: "Exam", label: "Exam", max: 80 },
          ]);
        }

        // Get classes
        const studsRes = await window.electronAPI.getAllStudents({
          limit: 5000,
          minimal: true,
        });
        const allSts = studsRes?.data || [];
        setStudents(allSts);
        const uniqueClasses = Array.from(
          new Set(allSts.map((s: any) => s.class_name).filter(Boolean)),
        ).sort() as string[];
        setClasses(uniqueClasses);

        // Get teachers
        const tchRes = await window.electronAPI.getAllTeachers({
          limit: 500,
          minimal: true,
        });
        setTeachers(tchRes?.data || []);
      } catch (err) {
        console.error("Error loading Printhub config:", err);
      }
    };
    loadConfig();
  }, [currentTier]);

  const handleShowAttendanceHelp = () => {
    if (typeof (window as any).Swal !== "undefined") {
      (window as any).Swal.fire({
        title: "Attendance Configuration",
        html: `
          <div style="text-align: left; font-size: 13px; line-height: 1.6; color: #cbd5e1; font-family: sans-serif;">
            <p style="margin-bottom: 12px;">Nexus School OS supports two distinct options for managing attendance on report cards:</p>
            
            <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; margin-bottom: 12px; border-left: 4px solid #00e5ff;">
              <strong style="color: #00e5ff; font-size: 14px;">1. Show Attendance in Result</strong>
              <p style="margin: 4px 0 0 0;">When enabled, an <strong>Attendance</strong> column is rendered on the student's report sheet (or broadsheet) showing their computed attendance score/percentage. If unchecked, the attendance column is completely omitted.</p>
            </div>
            
            <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; border-left: 4px solid #10b981;">
              <strong style="color: #10b981; font-size: 14px;">2. Include Attendance in Grade Computation</strong>
              <p style="margin: 4px 0 0 0;">When enabled, the attendance score is added directly to the student's subject total (e.g., CA 1 + CA 2 + Exam + Attendance = 100%).</p>
              <p style="margin: 6px 0 0 0; font-style: italic; font-size: 11px; color: #94a3b8;">Note: If this option is disabled, the grading scale components alone (e.g. CA 1 + CA 2 + Exam) must sum to 100%, and attendance is treated as a standalone column that does not affect student averages or grades.</p>
            </div>
          </div>
        `,
        icon: "info",
        confirmButtonColor: "#00E5FF",
        background: "#0d1235",
        color: "#fff",
      });
    } else {
      alert("Show Attendance: Renders the attendance column on report cards.\nInclude Attendance: Adds the attendance score to the final subject grade calculation.");
    }
  };

  const handleShowUnregisteredHelp = () => {
    if (typeof (window as any).Swal !== "undefined") {
      (window as any).Swal.fire({
        title: "Unregistered Course",
        html: `
          <div style="text-align: left; font-size: 13px; line-height: 1.6; color: #cbd5e1; font-family: sans-serif;">
            <p style="margin-bottom: 12px;">A course is considered <strong style="color:#f59e0b;">unregistered</strong> when a grade or score has been recorded for a student in that subject, but the student was <em>never formally enrolled</em> in it via the student subject list.</p>

            <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; margin-bottom: 12px; border-left: 4px solid #f59e0b;">
              <strong style="color: #f59e0b; font-size: 14px;">Visual Indicator</strong>
              <p style="margin: 4px 0 0 0;">On every printed report, unregistered courses are automatically marked with an <strong style="color:#f59e0b;">Unreg.</strong> badge next to the subject name so the admin, teacher, and parent can immediately identify the anomaly.</p>
            </div>

            <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; margin-bottom: 12px; border-left: 4px solid #00e5ff;">
              <strong style="color: #00e5ff; font-size: 14px;">Exclude from Totals &amp; Average (this option)</strong>
              <p style="margin: 4px 0 0 0;">When <strong>checked</strong>: unregistered courses are still <em>displayed</em> on the report for full transparency, but their scores are <strong>not counted</strong> when calculating the student's total and average. This is useful when a teacher accidentally recorded a grade to the wrong student.</p>
              <p style="margin: 6px 0 0 0;">When <strong>unchecked</strong>: all recorded scores — whether the subject is registered or not — contribute to totals and averages, matching the previous behaviour.</p>
            </div>

            <p style="font-size: 11px; color: #94a3b8; font-style: italic;">To formally register a student for a subject, go to the student's profile and update their subject list.</p>
          </div>
        `,
        icon: "info",
        confirmButtonColor: "#f59e0b",
        background: "#0d1235",
        color: "#fff",
      });
    } else {
      alert("Unregistered courses are subjects where a score was recorded but the student was never formally enrolled. When this option is checked, those scores are shown on the report but excluded from the student's total and average.");
    }
  };

  const handleSaveConfig = async () => {
    if (totalScoreSum > 100) {
      if (typeof (window as any).Swal !== "undefined") {
        (window as any).Swal.fire({
          title: "Invalid Grading Breakdown",
          text: `The total points of the grading breakdown (${totalScoreSum}) cannot exceed 100.`,
          icon: "error",
          confirmButtonColor: "#00E5FF",
          background: "#0d1235",
          color: "#fff",
        });
      } else {
        alert(`Error: The total points of the grading breakdown (${totalScoreSum}) cannot exceed 100.`);
      }
      return;
    }

    if (!window.electronAPI?.saveTermConfig) return;
    try {
      setSaveStatus("⏳ Saving...");
      let existingScale = [];
      try {
        const existing = await window.electronAPI.getTermConfig();
        if (existing?.grading_scale) {
          const raw = JSON.parse(existing.grading_scale);
          if (raw && !Array.isArray(raw) && raw.scale)
            existingScale = raw.scale;
          else if (Array.isArray(raw)) existingScale = raw;
        }
      } catch (_) {}

      const hasAttendanceAccess = currentTier !== "Silver" && currentTier !== "Standalone";
      const config = {
        academic_session: session,
        term,
        resumption_date: resumptionDate,
        term_start_date: termStartDate,
        term_end_date: termEndDate,
        show_position: showPosition,
        show_domains: showDomains,
        show_attendance: hasAttendanceAccess ? (showAttendance ? 1 : 0) : 0,
        include_attendance_in_grades: hasAttendanceAccess ? (includeAttendance ? 1 : 0) : 0,
        attendance_score_weight: (hasAttendanceAccess && (includeAttendance || showAttendance)) ? attendanceWeight : 0,
        grading_scale: JSON.stringify({ scale: existingScale, components: sortGradingComponents(components) }),
        template,
        exclude_unregistered_from_totals: excludeUnregistered ? 1 : 0,
      };

      const res = await window.electronAPI.saveTermConfig(config);
      if (res?.ok) {
        setSaveStatus("✅ Saved successfully.");
        setTimeout(() => setSaveStatus(""), 2500);
      } else if (res?.error === 'SETUP_INCOMPLETE' || res?.step) {
        setSaveStatus("❌ Save failed: Setup incomplete.");
        setSetupGuardStep(res.step || 'students');
        setSetupGuardMessage(res.message || 'Setup step required before saving term configuration.');
        setSetupGuardOpen(true);
      } else {
        setSaveStatus("❌ Save failed: " + res.error);
      }
    } catch (err: any) {
      setSaveStatus("❌ Save error: " + err.message);
    }
  };

  const handleAddComponent = () => {
    const label = newCompLabel.trim();
    const max = Number(newCompMax);
    if (!label || !max || max <= 0) {
      alert("Enter a valid label and a positive score weight.");
      return;
    }
    const key = label.replace(/[^a-zA-Z0-9]/g, "_");
    if (components.some((c) => c.key.toLowerCase() === key.toLowerCase())) {
      alert("A component with a similar label already exists.");
      return;
    }

    setComponents((prev) => [...prev, { key, label, max }]);
    setNewCompLabel("");
    setNewCompMax("");
  };

  const handleRemoveComponent = (idx: number) => {
    setComponents((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleUpdateComponent = (
    idx: number,
    field: "label" | "max",
    value: any,
  ) => {
    setComponents((prev) =>
      prev.map((c, i) => {
        if (i !== idx) return c;
        if (field === "label") {
          return {
            ...c,
            label: value,
            key: value.replace(/[^a-zA-Z0-9]/g, "_"),
          };
        } else {
          return { ...c, max: Number(value) || 0 };
        }
      }),
    );
  };

  // Perform Query Preview
  const handleQueryPreview = async () => {
    if (!window.electronAPI?.queryResults) return;
    setQueryLoading(true);
    setQueryMessage("⏳ Querying results...");
    setQueryResults([]);

    try {
      const resp = await window.electronAPI.queryResults({
        scope: queryScope,
        session,
        term,
        class_name: selectedClass,
        teacher_id: selectedTeacherId,
        subject: subjectInput,
        student_id: selectedStudentId,
      });

      if (resp.ok) {
        setQueryResults(resp.results || []);
        setQueryMessage(
          `${resp.results?.length || 0} student(s) ready · ${session}, ${term}`,
        );
      } else {
        setQueryMessage("❌ Query failed: " + resp.error);
      }
    } catch (err: any) {
      setQueryMessage("❌ Error: " + err.message);
    } finally {
      setQueryLoading(false);
    }
  };

  const handleNavigateToResultStudio = () => {
    onTabChange("result-studio");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Header Bar */}
      <div
        className="view-header"
        style={{
          flexShrink: 0,
          justifyContent: "space-between",
          alignItems: "center",
          display: "flex",
          flexDirection: "row",
        }}
      >
        <div>
          <h2 className="view-title">🖨️ Print Hub</h2>
          <p className="view-sub">
            Establish term structures, promotion pass metrics, and query general
            broadsheets.
          </p>
        </div>

        {saveStatus && (
          <div
            style={{
              fontSize: "12px",
              color: saveStatus.includes("✅")
                ? "#00e5ff"
                : saveStatus.includes("❌")
                  ? "#ff6666"
                  : "var(--text-dim)",
              background: "rgba(0,0,0,0.25)",
              border: "1px solid var(--glass-border)",
              borderRadius: "8px",
              padding: "6px 12px",
              fontWeight: 600,
            }}
          >
            {saveStatus}
          </div>
        )}
      </div>

      {/* Split Design */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "20px",
          alignItems: "start",
        }}
      >
        {/* Left Column (Config) */}
        <div
          style={{
            flex: "2 1 600px",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
          }}
        >
          {/* Term Configuration Card */}
          <div
            style={{
              background: "var(--glass)",
              border: "1px solid var(--glass-border)",
              borderRadius: "var(--radius-lg)",
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderBottom: "1px solid var(--glass-border)",
                paddingBottom: "10px",
              }}
            >
              <h3
                style={{
                  fontSize: "12px",
                  fontWeight: "bold",
                  color: "#fff",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  margin: 0,
                }}
              >
                Term Configuration
              </h3>
              <button
                onClick={handleSaveConfig}
                className="primary-btn"
                style={{
                  padding: "6px 12px",
                  fontSize: "11px",
                  animation: "none",
                }}
              >
                Save Config
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: "16px",
              }}
            >
              <div className="ph-config-group">
                <label className="ph-label">Academic Session</label>
                <select
                  value={session}
                  onChange={(e) => setSession(e.target.value)}
                  className="modern-input"
                  style={{ width: "100%" }}
                >
                  {generateSessionsList().map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="ph-config-group">
                <label className="ph-label">Term</label>
                <select
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  className="modern-input"
                  style={{ width: "100%" }}
                >
                  <option value="First Term">First Term</option>
                  <option value="Second Term">Second Term</option>
                  <option value="Third Term">Third Term</option>
                </select>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: "16px",
              }}
            >
              <div className="ph-config-group">
                <label className="ph-label">Term Start Date</label>
                <input
                  type="date"
                  value={termStartDate}
                  onChange={(e) => setTermStartDate(e.target.value)}
                  className="modern-input"
                  style={{ width: "100%" }}
                />
              </div>

              <div className="ph-config-group">
                <label className="ph-label">Term End Date</label>
                <input
                  type="date"
                  value={termEndDate}
                  onChange={(e) => setTermEndDate(e.target.value)}
                  className="modern-input"
                  style={{ width: "100%" }}
                />
              </div>

              <div className="ph-config-group">
                <label className="ph-label">Resumption Date</label>
                <input
                  type="date"
                  value={resumptionDate}
                  onChange={(e) => setResumptionDate(e.target.value)}
                  className="modern-input"
                  style={{ width: "100%" }}
                />
              </div>
            </div>

            {/* Checklist options */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "16px",
                paddingTop: "8px",
              }}
            >
              <label
                className="ph-toggle"
                style={{ cursor: "pointer", userSelect: "none" }}
              >
                <input
                  type="checkbox"
                  checked={showPosition}
                  onChange={(e) => setShowPosition(e.target.checked)}
                  style={{ marginRight: "6px" }}
                />
                Show Positions in Broadsheet
              </label>

              <label
                className="ph-toggle"
                style={{ cursor: "pointer", userSelect: "none" }}
              >
                <input
                  type="checkbox"
                  checked={showDomains}
                  onChange={(e) => setShowDomains(e.target.checked)}
                  style={{ marginRight: "6px" }}
                />
                Show Affective/Psychomotor
              </label>

              {currentTier !== "Silver" && currentTier !== "Standalone" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "4px" }}>
                  <label
                    className="ph-toggle"
                    style={{ cursor: "pointer", userSelect: "none", display: "flex", alignItems: "center" }}
                  >
                    <input
                      type="checkbox"
                      checked={showAttendance}
                      onChange={(e) => {
                        const val = e.target.checked;
                        setShowAttendance(val);
                        if (!val) {
                          setIncludeAttendance(false);
                        }
                      }}
                      style={{ marginRight: "6px" }}
                    />
                    Show Attendance in Result
                    <span
                      style={{
                        marginLeft: "6px",
                        cursor: "pointer",
                        color: "#00e5ff",
                        fontSize: "11px",
                        borderBottom: "1px dashed #00e5ff"
                      }}
                      onClick={handleShowAttendanceHelp}
                    >
                      (What is this?)
                    </span>
                  </label>

                  <label
                    className="ph-toggle"
                    style={{
                      cursor: showAttendance ? "pointer" : "default",
                      userSelect: "none",
                      display: "flex",
                      alignItems: "center",
                      opacity: showAttendance ? 1 : 0.5
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={includeAttendance}
                      disabled={!showAttendance}
                      onChange={(e) => setIncludeAttendance(e.target.checked)}
                      style={{ marginRight: "6px" }}
                    />
                    Include Attendance in Grade Computation
                  </label>
                 </div>
              )}

              {/* Unregistered courses exclusion — available to all tiers */}
              <label
                className="ph-toggle"
                style={{ cursor: "pointer", userSelect: "none", display: "flex", alignItems: "center" }}
              >
                <input
                  type="checkbox"
                  checked={excludeUnregistered}
                  onChange={(e) => setExcludeUnregistered(e.target.checked)}
                  style={{ marginRight: "6px", accentColor: "#f59e0b" }}
                />
                Exclude unregistered courses from totals
                <span
                  style={{
                    marginLeft: "6px",
                    cursor: "pointer",
                    color: "#f59e0b",
                    fontSize: "11px",
                    borderBottom: "1px dashed #f59e0b"
                  }}
                  onClick={handleShowUnregisteredHelp}
                >
                  (What is this?)
                </span>
              </label>

            </div>
          </div>

          {/* Grading Breakdown Card */}
          <div
            style={{
              background: "var(--glass)",
              border: "1px solid var(--glass-border)",
              borderRadius: "var(--radius-lg)",
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderBottom: "1px solid var(--glass-border)",
                paddingBottom: "10px",
              }}
            >
              <h3
                style={{
                  fontSize: "12px",
                  fontWeight: "bold",
                  color: "#fff",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  margin: 0,
                }}
              >
                Grading Score Breakdown
              </h3>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: "bold",
                  padding: "3px 8px",
                  borderRadius: "4px",
                  color:
                    totalScoreSum === 100
                      ? "#4CAF50"
                      : totalScoreSum > 100
                        ? "#ff6666"
                        : "#ffd700",
                  background:
                    totalScoreSum === 100
                      ? "rgba(76,175,80,0.1)"
                      : totalScoreSum > 100
                        ? "rgba(255,68,68,0.1)"
                        : "rgba(255,215,0,0.1)",
                }}
              >
                Total: {totalScoreSum}/100 pts
              </span>
            </div>

            {/* List components */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                gap: "12px",
              }}
            >
              {components.map((comp, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid var(--glass-border)",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    fontSize: "12px",
                  }}
                >
                  <input
                    type="text"
                    value={comp.label}
                    onChange={(e) =>
                      handleUpdateComponent(idx, "label", e.target.value)
                    }
                    className="modern-input"
                    style={{
                      flex: 1,
                      background: "transparent",
                      border: "none",
                      borderBottom: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 0,
                      padding: "2px 0",
                      height: "auto",
                    }}
                  />
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={comp.max}
                    onChange={(e) =>
                      handleUpdateComponent(idx, "max", e.target.value)
                    }
                    className="modern-input"
                    style={{
                      width: "45px",
                      textAlign: "center",
                      background: "transparent",
                      border: "none",
                      borderBottom: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 0,
                      padding: "2px 0",
                      height: "auto",
                    }}
                  />
                  <span style={{ color: "var(--text-dim)", fontSize: "10px" }}>
                    pts
                  </span>
                  <button
                    onClick={() => handleRemoveComponent(idx)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#ff6666",
                      cursor: "pointer",
                      fontSize: "14px",
                      fontWeight: "bold",
                      padding: "0 4px",
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}

              {includeAttendance && currentTier !== "Silver" && currentTier !== "Standalone" && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid var(--glass-border)",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    fontSize: "12px",
                  }}
                >
                  <span style={{ flex: 1, fontWeight: 600, color: "#fff", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span>📅</span> Attendance
                  </span>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    value={attendanceWeight}
                    onChange={(e) =>
                      setAttendanceWeight(parseInt(e.target.value) || 0)
                    }
                    className="modern-input"
                    style={{
                      width: "45px",
                      textAlign: "center",
                      background: "transparent",
                      border: "none",
                      borderBottom: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 0,
                      padding: "2px 0",
                      height: "auto",
                    }}
                  />
                  <span style={{ color: "var(--text-dim)", fontSize: "10px" }}>
                    pts
                  </span>
                  <span style={{ width: "20px" }}></span>
                </div>
              )}
            </div>

            {/* Add component controls */}
            <div
              style={{
                display: "flex",
                gap: "10px",
                paddingTop: "8px",
                flexWrap: "wrap",
              }}
            >
              <input
                type="text"
                value={newCompLabel}
                onChange={(e) => setNewCompLabel(e.target.value)}
                placeholder="Label (e.g. C.A. 3)"
                className="modern-input"
                style={{ flex: 1, fontSize: "12px", height: "32px" }}
              />
              <input
                type="number"
                value={newCompMax}
                onChange={(e) =>
                  setNewCompMax(e.target.value ? parseInt(e.target.value) : "")
                }
                placeholder="Max Score"
                className="modern-input"
                style={{
                  width: "90px",
                  fontSize: "12px",
                  height: "32px",
                  textAlign: "center",
                }}
              />
              <button
                onClick={handleAddComponent}
                className="secondary-btn"
                style={{
                  height: "32px",
                  padding: "0 14px",
                  fontSize: "11px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                ➕ Add Component
              </button>
            </div>
          </div>

          {/* Gold Feature: Parent Portal Access */}
          {(currentTier === "Gold" || currentTier === "Diamond") && (
            <div
              style={{
                background: "rgba(0, 229, 255, 0.05)",
                border: "1px solid rgba(0, 229, 255, 0.15)",
                borderRadius: "12px",
                padding: "15px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: "4px",
              }}
            >
              <div>
                <h4
                  style={{
                    fontSize: "12px",
                    color: "#00e5ff",
                    margin: "0 0 4px",
                  }}
                >
                  🔐 Sovereign Portal
                </h4>
                <p
                  style={{
                    fontSize: "10px",
                    color: "var(--text-dim)",
                    margin: 0,
                  }}
                >
                  Print access cards for parents to view records via mobile.
                </p>
              </div>
              <button
                className="primary-btn"
                style={{
                  padding: "6px 12px",
                  fontSize: "11px",
                  background: "#00e5ff",
                  color: "#000",
                  animation: "none",
                }}
                onClick={() => {
                  sessionStorage.setItem("rs_report_type", "portal_card");
                  onTabChange("result-studio");
                }}
              >
                Print Cards
              </button>
            </div>
          )}
        </div>

        {/* Right Column (Template Preview) */}
        <div
          style={{
            flex: "1 1 300px",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
          }}
        >
          {/* Official Template Card */}
          <div
            style={{
              background: "var(--glass)",
              border: "1px solid var(--glass-border)",
              borderRadius: "var(--radius-lg)",
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{ display: "flex", flexDirection: "column", gap: "16px" }}
            >
              <h3
                style={{
                  fontSize: "12px",
                  fontWeight: "bold",
                  color: "#fff",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  margin: 0,
                  borderBottom: "1px solid var(--glass-border)",
                  paddingBottom: "10px",
                }}
              >
                Official Template
              </h3>

              <div className="ph-config-group">
                <label className="ph-label">Select Theme Profile</label>
                <select
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  className="modern-input"
                  style={{ width: "100%" }}
                >
                  <option value="clean_slate">🎨 Classic (Free)</option>
                  <option value="class_photo">📷 Class Photo (Free)</option>
                  <option value="prestige" disabled={isTemplateLocked('prestige')}>
                    {isTemplateLocked('prestige') ? '🔒 ' : ''}⭐ Prestige (Silver)
                  </option>
                  <option value="azure" disabled={isTemplateLocked('azure')}>
                    {isTemplateLocked('azure') ? '🔒 ' : ''}⭐ Azure Edge (Silver)
                  </option>
                  <option value="royal" disabled={isTemplateLocked('royal')}>
                    {isTemplateLocked('royal') ? '🔒 ' : ''}⭐⭐ Royal (Gold)
                  </option>
                  <option value="monarch" disabled={isTemplateLocked('monarch')}>
                    {isTemplateLocked('monarch') ? '🔒 ' : ''}⭐⭐ Monarch (Gold)
                  </option>
                  <option value="sovereign" disabled={isTemplateLocked('sovereign')}>
                    {isTemplateLocked('sovereign') ? '🔒 ' : ''}💎 Sovereign (Diamond)
                  </option>
                  <option value="sterling" disabled={isTemplateLocked('sterling')}>
                    {isTemplateLocked('sterling') ? '🔒 ' : ''}💎 Sterling (Diamond)
                  </option>
                  <option value="apex" disabled={isTemplateLocked('apex')}>
                    {isTemplateLocked('apex') ? '🔒 ' : ''}💎 Apex (Diamond)
                  </option>
                </select>
              </div>

              {/* Template image container */}
              <div
                style={{
                  width: "100%",
                  aspectRatio: "1 / 1.414",
                  border: "1px solid var(--glass-border)",
                  background: "rgba(0,0,0,0.2)",
                  borderRadius: "8px",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
                }}
              >
                <img
                  src={previewImgSrc}
                  alt="template preview"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    objectPosition: "top center",
                    display: "block",
                  }}
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                    const parent = e.currentTarget.parentElement;
                    if (parent) {
                      const overlay = document.createElement("div");
                      overlay.style.cssText =
                        "display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:8px;color:rgba(255,255,255,0.3);";
                      overlay.innerHTML =
                        '<span style="font-size:28px;">🖼️</span><span style="font-size:10px;text-align:center;line-height:1.4;">Preview image<br>not yet available</span>';
                      parent.appendChild(overlay);
                    }
                  }}
                />
              </div>
            </div>

            <button
              onClick={handleSaveConfig}
              className="primary-btn"
              style={{
                width: "100%",
                justifyContent: "center",
                padding: "10px 0",
                marginTop: "12px",
                animation: "none",
              }}
            >
              💾 Save Template Config
            </button>
          </div>
        </div>
      </div>

      {/* Query/Search/Broadsheet Generation Section */}
      <div
        style={{
          background: "var(--glass)",
          border: "1px solid var(--glass-border)",
          borderRadius: "var(--radius-lg)",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          marginTop: "20px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid var(--glass-border)",
            paddingBottom: "10px",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div
            style={{
              display: "flex",
              background: "rgba(0,0,0,0.2)",
              border: "1px solid var(--glass-border)",
              borderRadius: "8px",
              padding: "2px",
              fontSize: "12px",
            }}
          >
            <button
              onClick={() => setReportType("terminal")}
              className={
                reportType === "terminal" ? "ph-type-btn active" : "ph-type-btn"
              }
              style={{
                border: "none",
                borderRadius: "6px",
                padding: "6px 12px",
                fontSize: "11px",
                fontWeight: 600,
                cursor: "pointer",
                background:
                  reportType === "terminal"
                    ? "rgba(0, 229, 255, 0.15)"
                    : "transparent",
                color:
                  reportType === "terminal" ? "#00E5FF" : "var(--text-dim)",
              }}
            >
              📄 Terminal Reports
            </button>
            <button
              onClick={() => setReportType("broadsheet")}
              className={
                reportType === "broadsheet"
                  ? "ph-type-btn active"
                  : "ph-type-btn"
              }
              style={{
                border: "none",
                borderRadius: "6px",
                padding: "6px 12px",
                fontSize: "11px",
                fontWeight: 600,
                cursor: "pointer",
                background:
                  reportType === "broadsheet"
                    ? "rgba(0, 229, 255, 0.15)"
                    : "transparent",
                color:
                  reportType === "broadsheet" ? "#00E5FF" : "var(--text-dim)",
              }}
            >
              📊 Broadsheets
            </button>
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={handleQueryPreview}
              className="ph-type-btn"
              style={{
                padding: "8px 16px",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              🔍 Preview Scope
            </button>
            <button
              onClick={handleNavigateToResultStudio}
              className="primary-btn"
              style={{
                padding: "8px 16px",
                fontSize: "12px",
                animation: "none",
              }}
            >
              🎨 Configure in Result Studio
            </button>
          </div>
        </div>

        {/* Filters Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "16px",
          }}
        >
          <div className="ph-config-group">
            <label className="ph-label">Filter Scope</label>
            <select
              value={queryScope}
              onChange={(e) => setQueryScope(e.target.value)}
              className="modern-input"
              style={{ width: "100%" }}
            >
              <option value="class">By Class</option>
              <option value="teacher">By Teacher</option>
              <option value="student">By Student</option>
              {reportType === "broadsheet" && (
                <option value="subject">By Subject</option>
              )}
              <option value="all">Entire School</option>
            </select>
          </div>

          {queryScope === "class" && (
            <div className="ph-config-group">
              <label className="ph-label">Select Class</label>
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="modern-input"
                style={{ width: "100%" }}
              >
                <option value="">Select Class...</option>
                {classes.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}

          {queryScope === "teacher" && (
            <div className="ph-config-group">
              <label className="ph-label">Select Teacher</label>
              <select
                value={selectedTeacherId}
                onChange={(e) => setSelectedTeacherId(e.target.value)}
                className="modern-input"
                style={{ width: "100%" }}
              >
                <option value="">Select Teacher...</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {queryScope === "student" && (
            <div className="ph-config-group">
              <label className="ph-label">Select Student</label>
              <select
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="modern-input"
                style={{ width: "100%" }}
              >
                <option value="">Select Student...</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.class_name})
                  </option>
                ))}
              </select>
            </div>
          )}

          {(queryScope === "subject" || reportType === "broadsheet") && (
            <div className="ph-config-group">
              <label className="ph-label">Subject Code</label>
              <input
                type="text"
                value={subjectInput}
                onChange={(e) => setSubjectInput(e.target.value)}
                placeholder="e.g. Mathematics"
                className="modern-input"
                style={{ width: "100%" }}
              />
            </div>
          )}
        </div>

        {/* Results List */}
        {queryMessage && (
          <div
            style={{
              fontSize: "12px",
              color: "var(--accent)",
              fontWeight: 600,
              padding: "0 4px",
              marginTop: "8px",
            }}
          >
            {queryMessage}
          </div>
        )}

        {queryResults.length > 0 && (
          <div className="table-container" style={{ margin: "8px 0 0" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: "60px" }}>#</th>
                  <th>Student Name</th>
                  <th>Class</th>
                  <th style={{ textAlign: "center" }}>Subject Count</th>
                  <th style={{ textAlign: "center" }}>Total Score</th>
                  <th style={{ textAlign: "center" }}>Average</th>
                </tr>
              </thead>
              <tbody>
                {queryResults.map((row, idx) => (
                  <tr key={row.id}>
                    <td>{idx + 1}</td>
                    <td>
                      <strong>{row.name}</strong>
                    </td>
                    <td>{row.class_name}</td>
                    <td style={{ textAlign: "center" }}>
                      {row.subjects?.length || 0}
                    </td>
                    <td style={{ textAlign: "center", fontWeight: "bold" }}>
                      {row.total_score ?? "—"}
                    </td>
                    <td style={{ textAlign: "center", fontWeight: "bold" }}>
                      {row.average ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <SetupGuardModal
        isOpen={setupGuardOpen}
        onClose={() => setSetupGuardOpen(false)}
        step={setupGuardStep}
        message={setupGuardMessage}
      />
    </div>
  );
}

export default PrintHub;
