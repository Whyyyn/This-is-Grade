import test from 'node:test';
import assert from 'node:assert/strict';
import { diffGradeSnapshots } from '../public/grade-changes.js';
import { sanitizeSnapshot, historyPoints, historyEventsForPoint } from '../public/grade-history.js';
import { compactGradeSnapshot, createGradeChangePayload, diffGradeSnapshots as realtimeDiff } from '../functions/_lib/realtime.js';

const assignment = (id, overrides = {}) => ({
  id, category: 'Homework', title: 'Week 1', scorePercent: 80, earned: 8, possible: 10, itemWeight: 10, ...overrides
});
const course = (assignments, overrides = {}) => ({ subject: 'Math', score: 85, assignments, ...overrides });
const snapshot = (grade, capturedAt = '2026-10-24T01:00:00Z') => sanitizeSnapshot({ capturedAt, grades: [grade] });

test('a corrected mark on either same-named assignment survives history storage and appears in tooltips', () => {
  const before = snapshot(course([assignment('a'), assignment('b', { scorePercent: 90 })]));
  const after = snapshot(course([assignment('a', { scorePercent: 70 }), assignment('b', { scorePercent: 90 })]));
  assert.equal(after.grades[0].assignments[0].id, 'a');
  const changes = diffGradeSnapshots(before.grades, after.grades);
  assert.deepEqual(changes.map((event) => event.type), ['assignment-score']);
  assert.equal(changes[0].newItem.id, 'a');
  const points = historyPoints([before, after], 'Math');
  assert.equal(points.length, 2); // The overall grade stayed at 85.
  assert.match(historyEventsForPoint(points, 1, 'Math')[0].text, /80% → 70%/);
});

test('renaming or reordering assignments with real IDs does not create additions or removals', () => {
  const before = [course([assignment('a'), assignment('b')])];
  const after = [course([assignment('b'), assignment('a', { title: 'Corrected title' })])];
  assert.deepEqual(diffGradeSnapshots(before, after), []);
});

test('different real IDs remain distinct even when all displayed fields match', () => {
  const changes = diffGradeSnapshots([course([assignment('a')])], [course([assignment('b')])]);
  assert.deepEqual(changes.map((event) => event.type), ['assignment-added', 'assignment-removed']);
});

test('old history without IDs matches current assignments without inventing new grades', () => {
  const old = snapshot(course([assignment('', { scorePercent: 90 }), assignment('')]));
  const current = snapshot(course([assignment('a'), assignment('b', { scorePercent: 90 })]));
  assert.deepEqual(diffGradeSnapshots(old.grades, current.grades), []);
  const corrected = snapshot(course([assignment('a', { scorePercent: 70 }), assignment('b', { scorePercent: 90 })]));
  assert.deepEqual(diffGradeSnapshots(old.grades, corrected.grades).map((change) => change.type), ['assignment-score']);
});

test('repeated text-only rows preserve multiplicity and ignore reorder-only changes', () => {
  const before = [course([assignment(''), assignment('', { scorePercent: 90 })])];
  assert.deepEqual(diffGradeSnapshots(before, [course([assignment('', { scorePercent: 90 }), assignment('')])]), []);
  const changes = diffGradeSnapshots(before, [course([assignment('')])]);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].type, 'assignment-removed');
  assert.equal(changes[0].before, 90);
});

test('text matching keeps punctuation boundaries and normalizes case and spacing', () => {
  const before = [course([assignment('', { title: 'A-B' })])];
  assert.deepEqual(diffGradeSnapshots(before, [course([assignment('', { title: ' a-b ' })])]), []);
  assert.equal(diffGradeSnapshots(before, [course([assignment('', { title: 'AB' })])]).length, 2);
});

test('browser and worker use the same engine for removals, points, and weights', () => {
  assert.equal(diffGradeSnapshots, realtimeDiff);
  const before = [course([assignment('a'), assignment('b')])];
  const after = [course([assignment('a', { earned: 16, possible: 20, itemWeight: 15 })])];
  const changes = realtimeDiff(compactGradeSnapshot(before), compactGradeSnapshot(after));
  assert.deepEqual(changes.map((event) => event.type), ['assignment-points', 'assignment-weight', 'assignment-removed']);
  const body = createGradeChangePayload(changes).body;
  assert.match(body, /得分 8 \/ 10 → 16 \/ 20/);
  assert.match(body, /权重 10% → 15%/);
  assert.match(body, /另有 1 项变化/);
  assert.match(createGradeChangePayload(changes.slice(-1)).body, /已移除/);
});

test('old realtime snapshots establish a weight baseline without false weight alerts', () => {
  const oldItem = assignment('a');
  delete oldItem.itemWeight;
  assert.deepEqual(realtimeDiff(compactGradeSnapshot([course([oldItem])]), compactGradeSnapshot([course([assignment('a')])])), []);
});

test('unpublished totals differ from zero and are never described as a new course', () => {
  const before = [course([assignment('a')], { score: null })];
  const after = [course([assignment('a')], { score: 0 })];
  const [change] = diffGradeSnapshots(before, after);
  assert.equal(change.type, 'course-score');
  assert.match(createGradeChangePayload([change]).body, /— → 0%/);
  assert.doesNotMatch(createGradeChangePayload([change]).body, /新增/);
});

test('course removals and all events beyond the former twelve-event cap are retained', () => {
  const changes = diffGradeSnapshots([course([])], []);
  assert.equal(changes[0].type, 'course-removed');
  assert.match(createGradeChangePayload(changes).body, /已移除/);
  const many = diffGradeSnapshots([course([])], [course(Array.from({ length: 20 }, (_, index) => assignment(String(index + 1))))]);
  assert.equal(many.length, 20);
  assert.match(createGradeChangePayload(many).body, /另有 18 项变化/);
});

test('history keeps exact perfect-grade marks and ignores redundant snapshots', () => {
  const first = snapshot(course([assignment('a', { scorePercent: 99.999 })]));
  assert.equal(first.grades[0].assignments[0].scorePercent, 99.999);
  assert.equal(historyPoints([first, structuredClone(first)], 'Math').length, 1);
});
