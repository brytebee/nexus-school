// Ranking Engine logic - extracted from report-compiler.js

const scoringLib = require('./scoring');

// ── resolveMaxSubjects ────────────────────────────────────────────────────────
// maxSubjectsMap is keyed by hierarchy_class (e.g. "SS1"), but a student's
// class_name may include the arm (e.g. "SS1 Gold" or "SS1A"). This helper
// resolves the correct max_subjects value using longest-prefix matching,
// mirroring the same helper in report-compiler.js.
function resolveMaxSubjects(className, maxSubjectsMap) {
  if (!className || !maxSubjectsMap) return null;
  const normClassName = className.replace(/\s+/g, '').toUpperCase();
  // 1. Exact normalized match
  for (const key of Object.keys(maxSubjectsMap)) {
    if (normClassName === key.replace(/\s+/g, '').toUpperCase()) {
      return maxSubjectsMap[key];
    }
  }
  // 2. Longest-prefix match (most specific key first)
  const keys = Object.keys(maxSubjectsMap).sort((a, b) => {
    return b.replace(/\s+/g, '').length - a.replace(/\s+/g, '').length;
  });
  for (const key of keys) {
    const normKey = key.replace(/\s+/g, '').toUpperCase();
    if (normClassName.startsWith(normKey)) {
      const val = maxSubjectsMap[key];
      if (val != null && val > 0) return val;
    }
  }
  return null;
}

function computeRankMap(studentList, maxSubjectsMap = null) {
  const classGroups = new Map();
  studentList.forEach(s => {
    const cn = s.class_name || "__all__";
    // Prefer pre-computed average (already incorporates attendance weights + exclusions)
    let avg = 0;
    const precomputed = parseFloat(s.average);
    if (!isNaN(precomputed) && precomputed >= 0) {
      avg = precomputed;
    } else {
      const rawSubs = s.subjects || s.Records || [];
      const maxSubjects = resolveMaxSubjects(cn, maxSubjectsMap);
      const { avgScore } = scoringLib.aggregateScores(rawSubs, 100, maxSubjects);
      avg = avgScore === "—" ? 0 : (parseFloat(avgScore) || 0);
    }

    if (!classGroups.has(cn)) classGroups.set(cn, []);
    classGroups.get(cn).push({ id: s.id, average: avg });
  });

  const rankMap = new Map();
  classGroups.forEach(group => {
    const sorted = [...group].sort((a, b) => b.average - a.average);
    let currentRank = 1;
    sorted.forEach((entry, idx) => {
      if (idx > 0 && entry.average < sorted[idx - 1].average) currentRank = idx + 1;
      const suffix = (currentRank % 10 === 1 && currentRank % 100 !== 11) ? 'st'
        : (currentRank % 10 === 2 && currentRank % 100 !== 12) ? 'nd'
        : (currentRank % 10 === 3 && currentRank % 100 !== 13) ? 'rd' : 'th';
      rankMap.set(entry.id, `${currentRank}${suffix}`);
    });
  });
  return rankMap;
}

// ── computeCohortRankings ─────────────────────────────────────────────────────
// Builds a class-scoped position map for STANDARD_NIGERIAN students only.
// ILS students are skipped (position = null).
// Returns Map<studentId, positionString> e.g. "1st of 3", "2nd of 3"
function computeCohortRankings(students) {
  const classGroups = new Map();
  students.forEach(s => {
    if (s.curriculum_type === 'ILS') return; // ILS: unranked
    const cn = s.class_name || '__all__';
    if (!classGroups.has(cn)) classGroups.set(cn, []);
    const precomputed = parseFloat(s.average);
    const avg = (!isNaN(precomputed) && precomputed >= 0)
      ? precomputed
      : (s.subjects || []).reduce((acc, sub) => acc + (typeof sub.score === 'number' ? sub.score : 0), 0);
    classGroups.get(cn).push({ id: s.id, avg });
  });

  const positionMap = new Map();
  classGroups.forEach((group, cn) => {
    const classSize = group.length;
    const sorted = [...group].sort((a, b) => b.avg - a.avg);
    let currentRank = 1;
    sorted.forEach((item, idx) => {
      if (idx > 0 && item.avg < sorted[idx - 1].avg) currentRank = idx + 1;
      const suffix = (currentRank % 10 === 1 && currentRank % 100 !== 11) ? 'st'
        : (currentRank % 10 === 2 && currentRank % 100 !== 12) ? 'nd'
        : (currentRank % 10 === 3 && currentRank % 100 !== 13) ? 'rd' : 'th';
      positionMap.set(item.id, `${currentRank}${suffix} of ${classSize}`);
    });
  });
  return positionMap;
}

function computeSubjectRankMap(studentList) {
  const groups = new Map();
  studentList.forEach(s => {
    const cn = s.class_name || "__all__";
    if (!groups.has(cn)) groups.set(cn, new Map());
    const classMap = groups.get(cn);
    
    const rawSubs = s.subjects || s.Records || [];
    rawSubs.forEach(sub => {
      const subjName = sub.name || sub.subject || "Subject";
      const sc = sub.score ?? sub.Total ?? null;
      if (sc !== null && sc !== "" && sc !== undefined) {
        if (!classMap.has(subjName)) classMap.set(subjName, []);
        classMap.get(subjName).push({ id: s.id, score: Number(sc) || 0 });
      }
    });
  });

  const rankMap = new Map();
  groups.forEach(classMap => {
    classMap.forEach((studentsWithScore, subjName) => {
      const sorted = [...studentsWithScore].sort((a, b) => b.score - a.score);
      let currentRank = 1;
      sorted.forEach((entry, idx) => {
        if (idx > 0 && entry.score < sorted[idx - 1].score) currentRank = idx + 1;
        const suffix = (currentRank % 10 === 1 && currentRank % 100 !== 11) ? 'st'
          : (currentRank % 10 === 2 && currentRank % 100 !== 12) ? 'nd'
          : (currentRank % 10 === 3 && currentRank % 100 !== 13) ? 'rd' : 'th';
        if (!rankMap.has(entry.id)) rankMap.set(entry.id, new Map());
        rankMap.get(entry.id).set(subjName, `${currentRank}${suffix}`);
      });
    });
  });
  return rankMap;
}

module.exports = { computeRankMap, computeSubjectRankMap, computeCohortRankings };
