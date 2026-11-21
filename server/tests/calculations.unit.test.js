import { describe, expect, it } from 'vitest';
import { attendancePercentage, countStatuses, minutesToTime, overlaps, timeToMinutes } from '../src/utils/calculations.js';

describe('attendance percentage = present days / total school days × 100', () => {
  it('counts late as present', () => {
    expect(attendancePercentage({ present: 15, late: 3, absent: 2 })).toBe(90);
  });
  it('rounds to two decimals', () => {
    expect(attendancePercentage({ present: 2, absent: 1 })).toBe(66.67);
  });
  it('counts leave as a school day the student missed', () => {
    expect(attendancePercentage({ present: 9, leave: 1 })).toBe(90);
  });
  it('is null (not 0%) before any school day', () => {
    expect(attendancePercentage({})).toBeNull();
  });
  it('summarises raw records', () => {
    const records = ['PRESENT', 'PRESENT', 'LATE', 'ABSENT'].map((status) => ({ status }));
    expect(countStatuses(records)).toEqual({ present: 2, late: 1, absent: 1, leave: 0, total: 4, percentage: 75 });
  });
});

describe('timetable time helpers', () => {
  it('parses and formats 24-hour times', () => {
    expect(timeToMinutes('08:30')).toBe(510);
    expect(timeToMinutes('23:59')).toBe(1439);
    expect(timeToMinutes('24:00')).toBeNull();
    expect(timeToMinutes('8:30')).toBeNull();
    expect(minutesToTime(510)).toBe('08:30');
  });
  it('treats back-to-back periods as not overlapping', () => {
    expect(overlaps({ start: 480, end: 525 }, { start: 525, end: 570 })).toBe(false);
    expect(overlaps({ start: 480, end: 525 }, { start: 500, end: 540 })).toBe(true);
    expect(overlaps({ start: 480, end: 600 }, { start: 500, end: 540 })).toBe(true);
  });
});
