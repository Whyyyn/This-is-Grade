import test from 'node:test';
import assert from 'node:assert/strict';
import { getPredictionCategories, predictCourseScore } from '../public/prediction.js';

const assignment = (categoryId, category, itemWeight, scorePercent) => ({ categoryId, category, itemWeight, scorePercent });

test('merges separately named columns by weight and separates different weights with the same name', () => {
  const grade = { assignments: [
    assignment('1', 'Tranforing Test', 28.57, 80),
    assignment('2', 'Polynomial Test', 28.57, 90),
    assignment('3', 'Classnote/HW I', 7.14, 70),
    assignment('4', 'Classnote/HW I', 7.14, 80),
    assignment('5', 'Transformation proje', 7.14, 90),
    assignment('6', 'National Holiday Pro', 7.14, 100),
    assignment('7', 'Transformation proje', 5.95, 80),
    assignment('8', 'National Holiday Pro', 5.95, 90)
  ] };
  const groups = getPredictionCategories(grade);
  assert.deepEqual(groups.map((group) => [group.itemWeight, group.items.length]), [[28.57, 2], [7.14, 4], [5.95, 2]]);
  assert.deepEqual(groups.map((group) => Number(group.weight.toFixed(2))), [57.14, 28.56, 11.9]);
});

test('groups by displayed weight while keeping the original weights for prediction', () => {
  const grade = { assignments: [assignment('1', 'A', 7.140001, 80), assignment('2', 'B', 7.139999, 90)] };
  const [group] = getPredictionCategories(grade);
  assert.equal(group.items.length, 2);
  assert.equal(group.itemWeight, 7.14);
  assert.ok(Math.abs(group.weight - 14.28) < 1e-10);
});

test('prediction uses every assignment in the weight group and leaves other groups unchanged', () => {
  const grade = { score: 85, assignments: [
    assignment('1', 'First test', 28.57, 80),
    assignment('2', 'Second test', 28.57, 90),
    assignment('3', 'Homework', 7.14, 0)
  ] };
  const prediction = predictCourseScore(grade, 'weight:28.57', 100);
  // The two tests average 85, then 90 with the new score: +5 * 57.14%.
  assert.ok(Math.abs(prediction.score - 87.857) < 1e-10);
  assert.equal(prediction.category.items.length, 2);
  assert.equal(grade.score, 85);
  assert.equal(grade.assignments.length, 3);
});

test('prediction still requires a published total and a matching group', () => {
  assert.deepEqual(getPredictionCategories(null), []);
  assert.deepEqual(getPredictionCategories({}), []);
  assert.equal(predictCourseScore({ score: null }, 'weight:10', 100), null);
  assert.equal(predictCourseScore({ score: 85, assignments: [] }, 'weight:10', 100), null);
});
