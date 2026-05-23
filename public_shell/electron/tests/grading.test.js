import { describe, it, expect } from 'vitest';
const { getGradeInfo, defaultScale } = require('../src/lib/grading.js');

describe('grading engine', () => {
  it('returns empty grade when score is null, undefined, or empty string', () => {
    expect(getGradeInfo(null).grade).toBe('');
    expect(getGradeInfo(undefined).grade).toBe('');
    expect(getGradeInfo('').grade).toBe('');
  });

  it('correctly maps scores to default A1-F9 scale', () => {
    expect(getGradeInfo(95).grade).toBe('A1');
    expect(getGradeInfo(75).grade).toBe('A1');
    expect(getGradeInfo(74).grade).toBe('B2');
    expect(getGradeInfo(70).grade).toBe('B2');
    expect(getGradeInfo(69).grade).toBe('B3');
    expect(getGradeInfo(62).grade).toBe('C4');
    expect(getGradeInfo(57).grade).toBe('C5');
    expect(getGradeInfo(52).grade).toBe('C6');
    expect(getGradeInfo(48).grade).toBe('D7');
    expect(getGradeInfo(42).grade).toBe('E8');
    expect(getGradeInfo(35).grade).toBe('F9');
    expect(getGradeInfo(0).grade).toBe('F9');
  });

  it('applies color tags and style properties matching CSS specifications', () => {
    const a1Info = getGradeInfo(95);
    expect(a1Info.bg).toBe('#e8f5e9');
    expect(a1Info.color).toBe('#2e7d32');

    const f9Info = getGradeInfo(20);
    expect(f9Info.bg).toBe('#fde8e8');
    expect(f9Info.color).toBe('#c62828');
  });

  it('supports customized grading scales', () => {
    const customScale = [
      { min: 50, max: 100, grade: "PASS", remark: "Passed" },
      { min: 0,  max: 49,  grade: "FAIL", remark: "Failed" }
    ];
    expect(getGradeInfo(75, customScale).grade).toBe('PASS');
    expect(getGradeInfo(30, customScale).grade).toBe('FAIL');
  });
});
