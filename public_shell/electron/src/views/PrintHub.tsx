import React, { useState, useEffect } from "react";
import { useLicense } from "../hooks/useLicense";
import { generateSessionsList } from "../lib/sessions";

interface GradingComponent {
  key: string;
  label: string;
  max: number;
}

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
  const [showDomains, setShowDomains] = useState(true);
  const [showAttendance, setShowAttendance] = useState(true);
  const [attendanceWeight, setAttendanceWeight] = useState(10);
  const [template, setTemplate] = useState("clean_slate");

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
  const totalScoreSum =
    components.reduce((acc, c) => acc + (c.max || 0), 0) +
    (showAttendance ? Number(attendanceWeight) || 0 : 0);

  // Load configs & pickers metadata
  useEffect(() => {
    const loadConfig = async () => {
      if (!window.electronAPI) return;
      try {
        const cfg = await window.electronAPI.getTermConfig();
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
          if (cfg.show_attendance !== undefined)
            setShowAttendance(
              cfg.show_attendance !== false && cfg.show_attendance !== 0,
            );
          if (cfg.attendance_score_weight !== undefined)
            setAttendanceWeight(Number(cfg.attendance_score_weight) || 0);
          if (cfg.template) {
            setTemplate(isTemplateLocked(cfg.template) ? "clean_slate" : cfg.template);
          }

          if (cfg.grading_scale) {
            const raw = JSON.parse(cfg.grading_scale);
            if (
              raw &&
              !Array.isArray(raw) &&
              raw.components &&
              raw.components.length
            ) {
              setComponents(raw.components);
            }
          }
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
  }, []);

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

      const config = {
        academic_session: session,
        term,
        resumption_date: resumptionDate,
        term_start_date: termStartDate,
        term_end_date: termEndDate,
        show_position: showPosition,
        show_domains: showDomains,
        show_attendance: showAttendance,
        attendance_score_weight: attendanceWeight,
        grading_scale: JSON.stringify({ scale: existingScale, components }),
        template,
      };

      const res = await window.electronAPI.saveTermConfig(config);
      if (res.ok) {
        setSaveStatus("✅ Saved successfully.");
        setTimeout(() => setSaveStatus(""), 2500);
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
                <label
                  className="ph-toggle"
                  style={{ cursor: "pointer", userSelect: "none" }}
                >
                  <input
                    type="checkbox"
                    checked={showAttendance}
                    onChange={(e) => setShowAttendance(e.target.checked)}
                    style={{ marginRight: "6px" }}
                  />
                  Show Attendance Stats
                </label>
              )}
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

              {showAttendance && (
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
                    opacity: 0.8,
                  }}
                >
                  <span style={{ flex: 1, fontWeight: 600, color: "#fff" }}>
                    📅 Attendance Weight
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
    </div>
  );
}

export default PrintHub;
