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
  const roundedTotal = totalScore % 1 === 0 ? totalScore : Number(totalScore.toFixed(2));
  const numGraded = gradedSubs.length;
  const denominator = (maxSubjects && maxSubjects > 0) ? maxSubjects : numGraded;
  const avgScore = numGraded > 0 ? (roundedTotal / denominator).toFixed(2) : "—";
  const avgPercent = (numGraded > 0 && totalMaxScore > 0)
    ? Math.round((roundedTotal / (denominator * totalMaxScore)) * 100) : 0;

  return {
    totalScore: roundedTotal,
    numGraded,
    avgScore,
    avgPercent
  };
}

module.exports = { aggregateScores };
