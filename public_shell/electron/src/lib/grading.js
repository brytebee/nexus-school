// Grading Engine logic - extracted from report-compiler.js
const defaultScale = [
  { min: 75, max: 100, grade: "A1", remark: "Excellent" },
  { min: 70, max: 74,  grade: "B2", remark: "Very Good" },
  { min: 65, max: 69,  grade: "B3", remark: "Good"      },
  { min: 60, max: 64,  grade: "C4", remark: "Credit"    },
  { min: 55, max: 59,  grade: "C5", remark: "Credit"    },
  { min: 50, max: 54,  grade: "C6", remark: "Credit"    },
  { min: 45, max: 49,  grade: "D7", remark: "Pass"      },
  { min: 40, max: 44,  grade: "E8", remark: "Pass"      },
  { min:  0, max: 39,  grade: "F9", remark: "Fail"      },
];

function getGradeInfo(score, scale = defaultScale) {
  if (score === null || score === undefined || score === "") {
    return { grade: "", remark: "", bg: "transparent", color: "inherit" };
  }
  const s     = Number(score) || 0;
  const entry = scale.find(e => s >= e.min && s <= e.max);
  if (!entry) return { grade: "F9", remark: "Fail", bg: "#fde8e8", color: "#c62828" };
  
  const colors = {
    A1: { bg: "#e8f5e9", color: "#2e7d32" }, B2: { bg: "#e3f2fd", color: "#1565c0" },
    B3: { bg: "#e3f2fd", color: "#1565c0" }, C4: { bg: "#fff8e1", color: "#f57f17" },
    C5: { bg: "#fff8e1", color: "#f57f17" }, C6: { bg: "#fff8e1", color: "#f57f17" },
    D7: { bg: "#fce4ec", color: "#c2185b" }, E8: { bg: "#fce4ec", color: "#c2185b" },
    F9: { bg: "#fde8e8", color: "#c62828" },
  };
  return { ...entry, ...(colors[entry.grade] || { bg: "#eee", color: "#333" }) };
}

module.exports = { getGradeInfo, defaultScale };
