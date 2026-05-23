// Attendance Aggregation logic - extracted from report-compiler.js

function computeAttendanceScore(daysAttended, totalDays, weight) {
  const tDays = Number(totalDays) || 0;
  const aDays = Number(daysAttended) || 0;
  const w = Number(weight) || 0;
  if (tDays <= 0 || w <= 0) return 0;
  return Math.round((aDays / tDays) * w);
}

module.exports = { computeAttendanceScore };
