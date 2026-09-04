import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateEffortProgress,
  isEffortColumn,
  sortEffortColumnsFirst
} from '../public/effort-progress.js';

test('detects supported effort column phrases despite spacing and case', () => {
  assert.equal(isEffortColumn({ category: 'CORE COMPETENCY' }), true);
  assert.equal(isEffortColumn({ title: 'Learning Behaviour / Habits' }), true);
  assert.equal(isEffortColumn({ category: 'Class-Dojo points' }), true);
  assert.equal(isEffortColumn({ category: 'Unit test' }), false);
});

test('detects the supplied Precalculus Learning Behaviours fixture', () => {
  const suppliedColumn = {
    category: 'Learning Behaviours',
    title: 'Learning behaviours & competencies from Class dojo',
    earned: 32,
    possible: 100,
    scorePercent: 32,
    itemWeight: 14.29
  };
  assert.equal(isEffortColumn(suppliedColumn), true);
  assert.equal(calculateEffortProgress('2026-11-05', suppliedColumn.scorePercent, new Date(2026, 8, 4)).currentMark, 32);
});

test('supports one independently detected competency column per subject', () => {
  const subjects = [
    { subject: 'Precalculus', assignments: [{ category: 'Learning Behaviours' }] },
    { subject: 'Physics', assignments: [{ category: 'Core Competency' }] }
  ];
  const detected = subjects.map((subject) => subject.assignments.filter(isEffortColumn));
  assert.deepEqual(detected.map((assignments) => assignments.length), [1, 1]);
});

test('moves matching columns first and preserves stable order', () => {
  const assignments = [
    { id: 'a', category: 'Quiz' },
    { id: 'b', category: 'Learning Behavior' },
    { id: 'c', category: 'Essay' },
    { id: 'd', category: 'Class Dojo' }
  ];
  assert.deepEqual(sortEffortColumnsFirst(assignments).map((item) => item.id), ['b', 'd', 'a', 'c']);
});

test('uses a 30-point baseline and reaches 100 over 45 weekdays', () => {
  const progress = calculateEffortProgress('2026-11-05', 65, new Date(2026, 9, 5));
  assert.equal(progress.totalSchoolDays, 45);
  assert.equal(progress.completedSchoolDays, 22);
  assert.equal(Math.round(progress.expectedMark * 100) / 100, 64.22);
  assert.equal(progress.calendarDaysLeft, 31);
});

test('clamps the schedule before and after the nine-week term', () => {
  const before = calculateEffortProgress('2026-11-05', 30, new Date(2026, 7, 1));
  const after = calculateEffortProgress('2026-11-05', 100, new Date(2026, 10, 8));
  assert.equal(before.expectedMark, 30);
  assert.equal(before.remainingSchoolDays, 45);
  assert.equal(after.expectedMark, 100);
  assert.equal(after.complete, true);
  assert.equal(after.dailyPointsNeeded, 0);
});
