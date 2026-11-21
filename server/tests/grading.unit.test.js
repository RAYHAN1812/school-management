import { describe, expect, it } from 'vitest';
import { gradeFor, letterForGpa, overallResult, rankResults, subjectResult, validateGradeScale, DEFAULT_GRADE_SCALE } from '../src/utils/calculations.js';

describe('grade bands (spec table)', () => {
  it.each([
    [100, 'A+', 5], [80, 'A+', 5], [79.99, 'A', 4], [79.995, 'A', 4], [70, 'A', 4], [60, 'A-', 3.5],
    [50, 'B', 3], [40, 'C', 2], [33, 'D', 1], [32.99, 'F', 0], [0, 'F', 0],
  ])('%s%% → %s (%s)', (pct, grade, gp) => {
    expect(gradeFor(pct)).toMatchObject({ grade, gradePoint: gp });
  });
});

describe('subject result', () => {
  const exam = { fullMarks: 100, passMarks: 33 };

  it('adds components and grades the percentage', () => {
    expect(subjectResult({ written: 56, mcq: 25 }, exam)).toEqual({ total: 81, percentage: 81, grade: 'A+', gradePoint: 5, resultStatus: 'PASS' });
  });

  it('uses percentage of full marks when full marks are not 100', () => {
    expect(subjectResult({ written: 40 }, { fullMarks: 50, passMarks: 17 })).toMatchObject({ percentage: 80, grade: 'A+' });
  });

  it('fails below the pass mark even if the band would pass', () => {
    // 35% would be a D, but this exam's pass mark is 40.
    expect(subjectResult({ written: 35 }, { fullMarks: 100, passMarks: 40 })).toMatchObject({ grade: 'F', gradePoint: 0, resultStatus: 'FAIL' });
  });

  it('treats absence as F / ABSENT', () => {
    expect(subjectResult({ isAbsent: true }, exam)).toMatchObject({ total: 0, grade: 'F', resultStatus: 'ABSENT' });
  });
});

describe('GPA and overall result', () => {
  const pass = (gp, total = 80) => ({ gradePoint: gp, total, fullMarks: 100, resultStatus: 'PASS' });

  it('averages grade points to two decimals', () => {
    expect(overallResult([pass(5), pass(4), pass(3.5)])).toMatchObject({ gpa: 4.17, grade: 'A', result: 'PASS', totalMarks: 240, fullMarks: 300 });
  });

  it('gives GPA 0 and FAIL when any subject is failed or missed', () => {
    expect(overallResult([pass(5), { gradePoint: 0, total: 20, fullMarks: 100, resultStatus: 'FAIL' }])).toMatchObject({ gpa: 0, grade: 'F', result: 'FAIL' });
    expect(overallResult([pass(5), { gradePoint: 0, total: 0, fullMarks: 100, resultStatus: 'ABSENT' }])).toMatchObject({ result: 'FAIL' });
  });

  it('maps GPA to an overall letter', () => {
    expect(letterForGpa(5)).toBe('A+');
    expect(letterForGpa(4.99)).toBe('A');
    expect(letterForGpa(3.5)).toBe('A-');
    expect(letterForGpa(0.5)).toBe('F');
  });

  it('ranks by GPA then total, sharing positions on ties', () => {
    const ranked = rankResults([
      { id: 'a', gpa: 4.5, totalMarks: 300 },
      { id: 'b', gpa: 5, totalMarks: 320 },
      { id: 'c', gpa: 4.5, totalMarks: 300 },
      { id: 'd', gpa: 4.5, totalMarks: 310 },
    ]);
    expect(ranked.map((r) => [r.id, r.position])).toEqual([['b', 1], ['d', 2], ['a', 3], ['c', 3]]);
  });
});

describe('custom grading scale validation', () => {
  it('accepts the default scale', () => {
    expect(validateGradeScale(DEFAULT_GRADE_SCALE)).toEqual([]);
  });
  it('reports overlaps, gaps and missing coverage', () => {
    const problems = validateGradeScale([
      { grade: 'P', minPercent: 10, maxPercent: 60, gradePoint: 1 },
      { grade: 'Q', minPercent: 50, maxPercent: 90, gradePoint: 2 },
    ]);
    expect(problems.join(' ')).toMatch(/start at 0%/);
    expect(problems.join(' ')).toMatch(/reach 100%/);
    expect(problems.join(' ')).toMatch(/overlap/);
  });
});
