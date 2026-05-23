// Scoring Engine logic - extracted from inline logic of report-compiler.js

function aggregateScores(subjects, totalMaxScore = 100) {
  const gradedSubs = subjects.filter(sub => {
    const score = sub.score ?? sub.Total ?? null;
    return score !== null && score !== undefined && score !== "";
  });
  const totalScore = gradedSubs.reduce((acc, sub) => {
    const score = sub.score ?? sub.Total ?? 0;
    return acc + (Number(score) || 0);
  }, 0);
  const numGraded = gradedSubs.length;
  const avgScore = numGraded > 0 ? (totalScore / numGraded).toFixed(1) : "—";
  const avgPercent = (numGraded > 0 && totalMaxScore > 0)
    ? Math.round((totalScore / (numGraded * totalMaxScore)) * 100) : 0;

  return {
    totalScore,
    numGraded,
    avgScore,
    avgPercent
  };
}

module.exports = { aggregateScores };
