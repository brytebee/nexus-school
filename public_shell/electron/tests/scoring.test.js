import { describe, it, expect } from 'vitest';
const { aggregateScores } = require('../src/lib/scoring.js');

describe('scoring engine', () => {
  it('aggregates total, average, and percentages correctly', () => {
    const subjects = [
      { name: 'Math', score: 80 },
      { name: 'English', score: 70 },
      { name: 'Physics', score: 90 }
    ];
    const results = aggregateScores(subjects, 100);
    expect(results.totalScore).toBe(240);
    expect(results.numGraded).toBe(3);
    expect(results.avgScore).toBe('80.0');
    expect(results.avgPercent).toBe(80);
  });

  it('skips empty, null, or undefined scores in totals and average calculation', () => {
    const subjects = [
      { name: 'Math', score: 80 },
      { name: 'English', score: null },
      { name: 'Chemistry', score: '' },
      { name: 'Physics', score: 90 }
    ];
    const results = aggregateScores(subjects, 100);
    expect(results.totalScore).toBe(170);
    expect(results.numGraded).toBe(2);
    expect(results.avgScore).toBe('85.0');
  });

  it('returns placeholder string average and zero percent when no subjects are graded', () => {
    const subjects = [
      { name: 'Math', score: null }
    ];
    const results = aggregateScores(subjects, 100);
    expect(results.totalScore).toBe(0);
    expect(results.numGraded).toBe(0);
    expect(results.avgScore).toBe('—');
    expect(results.avgPercent).toBe(0);
  });
});
