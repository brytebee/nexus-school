import { describe, it, expect } from 'vitest';
const { computeRankMap, computeSubjectRankMap } = require('../src/lib/ranking.js');

describe('ranking engine', () => {
  describe('computeRankMap', () => {
    it('ranks students inside the same class with high scores first', () => {
      const students = [
        { id: 1, class_name: 'SS1', subjects: [{ score: 80 }, { score: 90 }] }, // 170 total
        { id: 2, class_name: 'SS1', subjects: [{ score: 70 }, { score: 60 }] }, // 130 total
      ];
      const ranks = computeRankMap(students);
      expect(ranks.get(1)).toBe('1st');
      expect(ranks.get(2)).toBe('2nd');
    });

    it('implements dense ranking for ties', () => {
      const students = [
        { id: 1, class_name: 'SS1', subjects: [{ score: 100 }] },
        { id: 2, class_name: 'SS1', subjects: [{ score: 100 }] },
        { id: 3, class_name: 'SS1', subjects: [{ score: 80 }] },
      ];
      const ranks = computeRankMap(students);
      expect(ranks.get(1)).toBe('1st');
      expect(ranks.get(2)).toBe('1st');
      expect(ranks.get(3)).toBe('3rd'); // dense rank: 1st, 1st, 3rd (skips 2nd)
    });

    it('isolates ranking groups per class_name', () => {
      const students = [
        { id: 1, class_name: 'JSS1', subjects: [{ score: 100 }] },
        { id: 2, class_name: 'JSS2', subjects: [{ score: 50 }] },
      ];
      const ranks = computeRankMap(students);
      expect(ranks.get(1)).toBe('1st');
      expect(ranks.get(2)).toBe('1st');
    });
  });

  describe('computeSubjectRankMap', () => {
    it('correctly compiles subject-specific ranks independently', () => {
      const students = [
        {
          id: 1,
          class_name: 'SS1',
          subjects: [
            { name: 'Math', score: 90 },
            { name: 'English', score: 50 }
          ]
        },
        {
          id: 2,
          class_name: 'SS1',
          subjects: [
            { name: 'Math', score: 80 },
            { name: 'English', score: 95 }
          ]
        }
      ];
      const subRanks = computeSubjectRankMap(students);
      expect(subRanks.get(1).get('Math')).toBe('1st');
      expect(subRanks.get(2).get('Math')).toBe('2nd');
      expect(subRanks.get(1).get('English')).toBe('2nd');
      expect(subRanks.get(2).get('English')).toBe('1st');
    });
  });
});
