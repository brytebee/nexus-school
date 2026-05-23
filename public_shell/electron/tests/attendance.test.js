import { describe, it, expect } from 'vitest';
const { computeAttendanceScore } = require('../src/lib/attendance.js');

describe('attendance module', () => {
  it('correctly calculates weighted attendance percentage score', () => {
    // 80 out of 100 days attended, weight is 10 max points
    expect(computeAttendanceScore(80, 100, 10)).toBe(8);
    // 3 out of 4 days, weight is 5 max points
    expect(computeAttendanceScore(3, 4, 5)).toBe(4); // Math.round(3.75) = 4
  });

  it('handles division by zero and invalid weights gracefully returning 0', () => {
    expect(computeAttendanceScore(10, 0, 10)).toBe(0);
    expect(computeAttendanceScore(10, 100, 0)).toBe(0);
  });
});
