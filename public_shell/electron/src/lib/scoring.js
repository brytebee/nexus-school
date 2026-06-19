// Scoring Engine logic - extracted from inline logic of report-compiler.js

function aggregateScores(subjects, totalMaxScore = 100, maxSubjects = null) {
  const gradedSubs = subjects.filter(sub => {
    const score = sub.score ?? sub.Total ?? null;
    return score !== null && score !== undefined && score !== "";
  });
  const totalScore = gradedSubs.reduce((acc, sub) => {
    const score = sub.score ?? sub.Total ?? 0;
    return acc + (Number(score) || 0);
  }, 0);
  const numGraded = gradedSubs.length;
  const denominator = (maxSubjects && maxSubjects > 0) ? maxSubjects : numGraded;
  const avgScore = numGraded > 0 ? (totalScore / denominator).toFixed(1) : "—";
  const avgPercent = (numGraded > 0 && totalMaxScore > 0)
    ? Math.round((totalScore / (denominator * totalMaxScore)) * 100) : 0;

  return {
    totalScore,
    numGraded,
    avgScore,
    avgPercent
  };
}

module.exports = { aggregateScores };
