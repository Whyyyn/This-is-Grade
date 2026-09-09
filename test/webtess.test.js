import test from 'node:test';
import assert from 'node:assert/strict';

import { parseGradebookSummary } from '../functions/_lib/webtess.js';

function gradebookTable(summaryTitle, summaryMark, assignments) {
  const assignmentRows = assignments.map((item) => `
    <tr>
      <td></td><td>${item.column}</td><td>${item.description}</td>
      <td>${item.weight}%</td><td>${item.mark}</td><td>${item.possible}</td><td>${item.percent}%</td>
    </tr>`).join('');
  return `
    <table>
      <tr><th>Title</th><th>Column</th><th>Description</th><th>Overall value</th><th>Mark</th><th>Out of</th><th>Percent</th></tr>
      <tr><td>${summaryTitle}</td><td>Average</td><td></td><td></td><td>${summaryMark}</td><td></td><td></td></tr>
      ${assignmentRows}
    </table>`;
}

test('keeps assignments when a renamed gradebook has no published course average', () => {
  const parsed = parseGradebookSummary(gradebookTable('English Studies 12B', '', [
    { column: 'Week 1', description: 'Learning Behaviors and CC', weight: '4.44', mark: '5', possible: '5', percent: '100' },
    { column: 'Olympians Quiz', description: 'Sept. 7', weight: '60.00', mark: '12', possible: '12', percent: '100' }
  ]));

  assert.equal(parsed.subject, 'English Studies 12B');
  assert.equal(parsed.score, null);
  assert.equal(parsed.assignments.length, 2);
  assert.deepEqual(parsed.assignments.map((item) => item.scorePercent), [100, 100]);
});

test('does not mistake the first assignment mark for a blank Main spreadsheet average', () => {
  const parsed = parseGradebookSummary(gradebookTable('Main spreadsheet', '', [
    { column: 'Learning Behaviours', description: 'Learning behaviours & competencies from Class dojo', weight: '14.29', mark: '32', possible: '100', percent: '32' }
  ]));

  assert.equal(parsed.subject, '');
  assert.equal(parsed.score, null);
  assert.equal(parsed.assignments[0].earned, 32);
  assert.equal(parsed.assignments[0].scorePercent, 32);
});

test('reads a published average only from the summary row', () => {
  const parsed = parseGradebookSummary(gradebookTable('English Studies 12B', '98.4', [
    { column: 'Olympians Quiz', description: 'Sept. 7', weight: '60.00', mark: '12', possible: '12', percent: '100' }
  ]));

  assert.equal(parsed.subject, 'English Studies 12B');
  assert.equal(parsed.score, 98.4);
  assert.equal(parsed.assignments.length, 1);
});

test('legacy summary parsing cannot cross into a following assignment row', () => {
  const blankSummary = '12003 Precalculus 12 999 Main spreadsheet\n<pubmark>\t1\t0\t2\t32\t0\t0\t14.29%\t32%\tDescription\tLearning Behaviours\t100';
  const parsedBlank = parseGradebookSummary(blankSummary);
  assert.equal(parsedBlank.score, null);
  assert.equal(parsedBlank.assignments.length, 1);

  const publishedSummary = '12003 Precalculus 12 999 Main spreadsheet 87.6\n<pubmark>\t1\t0\t2\t32\t0\t0\t14.29%\t32%\tDescription\tLearning Behaviours\t100';
  const parsedPublished = parseGradebookSummary(publishedSummary);
  assert.equal(parsedPublished.subject, 'Precalculus 12');
  assert.equal(parsedPublished.score, 87.6);
});
