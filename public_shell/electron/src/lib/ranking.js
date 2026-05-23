// Ranking Engine logic - extracted from report-compiler.js

function computeRankMap(studentList) {
  const classGroups = new Map();
  studentList.forEach(s => {
    const rawSubs = s.subjects || s.Records || [];
    const total   = rawSubs.reduce((acc, sub) => {
      const sc = sub.score ?? sub.Total ?? null;
      return (sc !== null && sc !== "" && sc !== undefined)
        ? acc + (Number(sc) || 0) : acc;
    }, 0);
    const cn = s.class_name || "__all__";
    if (!classGroups.has(cn)) classGroups.set(cn, []);
    classGroups.get(cn).push({ id: s.id, total });
  });

  const rankMap = new Map();
  classGroups.forEach(group => {
    const sorted = [...group].sort((a, b) => b.total - a.total);
    let currentRank = 1;
    sorted.forEach((entry, idx) => {
      if (idx > 0 && entry.total < sorted[idx - 1].total) currentRank = idx + 1;
      const suffix = currentRank === 1 ? "st"
        : currentRank === 2 ? "nd"
        : currentRank === 3 ? "rd" : "th";
      rankMap.set(entry.id, `${currentRank}${suffix}`);
    });
  });
  return rankMap;
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
        const suffix = currentRank === 1 ? "st"
          : currentRank === 2 ? "nd"
          : currentRank === 3 ? "rd" : "th";
        if (!rankMap.has(entry.id)) rankMap.set(entry.id, new Map());
        rankMap.get(entry.id).set(subjName, `${currentRank}${suffix}`);
      });
    });
  });
  return rankMap;
}

module.exports = { computeRankMap, computeSubjectRankMap };
