import test from 'node:test';
import assert from 'node:assert/strict';

import { extractGradebookButtons, parseGradebookSummary } from '../functions/_lib/webtess.js';

test('assignments without upstream IDs do not use unstable row numbers as IDs', () => {
  const parsed = parseGradebookSummary(gradebookTable('Math', '85', [
    { column: 'Week 1', description: 'Homework', weight: '10', mark: '8', possible: '10', percent: '80' },
    { column: 'Week 2', description: 'Homework', weight: '10', mark: '9', possible: '10', percent: '90' }
  ]));
  assert.deepEqual(parsed.assignments.map((item) => item.id), ['', '']);
});

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

test('extracts the first course name from its own row inside the parent layout table', () => {
  const parentPage = `
    <table>
      <tr>
        <td>2027301</td>
        <td>Canada Qingdao Secondary School</td>
        <td>
          <table>
            <tr>
              <td><button onclick="getGradebookByStudent('1,2,3,120014')">120014</button></td>
              <td>Comparative Cultures 12</td><td>12A</td><td>Sydney Bamara</td>
            </tr>
            <tr>
              <td><button onclick="getGradebookByStudent('1,2,4,120008')">120008</button></td>
              <td>Economics 12</td><td>12D</td><td>Ryan Stotesbury</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;

  assert.deepEqual(extractGradebookButtons(parentPage).map((course) => course.subject), [
    'Comparative Cultures 12',
    'Economics 12'
  ]);
});

test('extracts dataset parameters from the current WebTESS course buttons', () => {
  const html = `<table><tr><td>School</td><td><table>
    <tr class="tableRow1 p-crsrow">
      <td><div><input type="button" name="grdbuttons" data-personid="101" data-masid="201"
        data-crsid="301" data-crsnum="01234" onClick="getGradebookByStudent(this);" value="01234"></div></td>
      <td>Example Math</td><td>12A</td><td>Teacher</td>
    </tr>
    <tr><td colspan="25"><div id="pubmarks201"><table></table></div></td></tr>
    <tr><td><input data-crsnum='5678' data-crsid='302' data-masid='202' data-personid='101'
      onclick='return getGradebookByStudent ( this );'></td><td>Example English</td></tr>
  </table></td></tr></table>`;
  assert.deepEqual(extractGradebookButtons(html), [
    { subject: 'Example Math', stid: '101', masid: '201', crsid: '301', crsnum: '01234' },
    { subject: 'Example English', stid: '101', masid: '202', crsid: '302', crsnum: '5678' }
  ]);
});

test('reads mixed legacy and dataset buttons without duplicating requests or accepting incomplete data', () => {
  const html = `<table>
    <tr><td><input data-personid=101 data-masid=201 data-crsid=301 data-crsnum=1234
      onclick="getGradebookByStudent(this);"></td><td>Math</td></tr>
    <tr><td><button onclick="getGradebookByStudent('101,201,301,1234')">1234</button></td><td>Math</td></tr>
    <tr><td><button onclick="getGradebookByStudent ( &quot;101,202,302,5678&quot; )">5678</button></td><td>English</td></tr>
    <tr><td><input data-personid=101 data-masid=203 data-crsid=303 onclick="getGradebookByStudent(this);"></td><td>Incomplete</td></tr>
    <tr><td><input data-personid=101 data-masid=204 data-crsid=304 data-crsnum=9012 onclick="getAssessByClass(this);"></td><td>Unrelated</td></tr>
  </table>`;
  assert.deepEqual(extractGradebookButtons(html).map(({ subject, crsnum }) => ({ subject, crsnum })), [
    { subject: 'Math', crsnum: '1234' }, { subject: 'English', crsnum: '5678' }
  ]);
});

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

test('reads published averages and assignments from a gradebook nested in a layout row', () => {
  const nestedGradebook = `
    <table>
      <tr>
        <td>Canada Qingdao Secondary School</td>
        <td>${gradebookTable('Q1 Gradebook (1st 9 week)', '100.00', [
          { column: 'W1 Reflection', description: '...', weight: '6.67', mark: '8', possible: '8', percent: '100' }
        ])}</td>
      </tr>
    </table>`;
  const parsed = parseGradebookSummary(nestedGradebook);

  assert.equal(parsed.subject, 'Q1 Gradebook (1st 9 week)');
  assert.equal(parsed.score, 100);
  assert.equal(parsed.assignments.length, 1);
  assert.equal(parsed.assignments[0].category, 'W1 Reflection');
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

test('reads a published legacy average split across response lines', () => {
  const response = `12003
    Precalculus 12
    999
    Main spreadsheet
    91.21
<pubmark>\t1\t0\t2\t12\t0\t0\t28.57%\t86%\t...\tTranforing Test\t14`;
  const parsed = parseGradebookSummary(response);

  assert.equal(parsed.subject, 'Precalculus 12');
  assert.equal(parsed.score, 91.21);
  assert.equal(parsed.assignments.length, 1);
});

test('reads legacy averages from custom gradebook names', () => {
  const fixtures = [
    ['12008 Economics 12 801 Q1 Gradebook (1st 9 week) 100.00', 100],
    ['12013 English Studies 12 802 English Studies 12B 100.00', 100]
  ];

  for (const [summary, expected] of fixtures) {
    const parsed = parseGradebookSummary(`${summary}\n<pubmark>\t1\t0\t2\t8\t0\t0\t6.67%\t100%\t...\tW1 Reflection\t8`);
    assert.equal(parsed.score, expected);
    assert.equal(parsed.assignments.length, 1);
  }
});

test('does not invent a legacy average when a custom gradebook total is unpublished', () => {
  const response = `12014 Comparative Cultures 12 803 Q1 Gradebook (1st 9 week) ---
<pubmark>\t1\t0\t2\t1\t0\t0\t10%\t100%\t...\tNames, Language and Identitiy\t1`;
  const parsed = parseGradebookSummary(response);

  assert.equal(parsed.score, null);
  assert.equal(parsed.assignments.length, 1);
});
