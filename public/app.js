const state = {
  grades: [],
  selected: new Set()
};

const fallbackGrades = [
  { subject: 'English', score: 86.4, raw: 'English 86.4' },
  { subject: 'Mathematics', score: 91.6, raw: 'Mathematics 91.6' },
  { subject: 'Chemistry', score: 78.8, raw: 'Chemistry 78.8' },
  { subject: 'Physics', score: 84.2, raw: 'Physics 84.2' },
  { subject: 'Biology', score: 88.9, raw: 'Biology 88.9' }
];

const els = {
  form: document.querySelector('#scrapeForm'),
  email: document.querySelector('#email'),
  password: document.querySelector('#password'),
  url: document.querySelector('#url'),
  status: document.querySelector('#status'),
  subjectPicker: document.querySelector('#subjectPicker'),
  selectionCount: document.querySelector('#selectionCount'),
  averageValue: document.querySelector('#averageValue'),
  averageFormula: document.querySelector('#averageFormula'),
  chart: document.querySelector('#chart'),
  gradeCount: document.querySelector('#gradeCount'),
  gradeRows: document.querySelector('#gradeRows'),
  refreshButton: document.querySelector('#refreshButton'),
  sampleButton: document.querySelector('#sampleButton'),
  exportButton: document.querySelector('#exportButton'),
  predictionCourse: document.querySelector('#predictionCourse'),
  predictionCategory: document.querySelector('#predictionCategory'),
  predictionScore: document.querySelector('#predictionScore'),
  predictedCourse: document.querySelector('#predictedCourse'),
  predictedAverage: document.querySelector('#predictedAverage'),
  predictionDelta: document.querySelector('#predictionDelta')
};

function roundTenths(value) {
  return Math.round((Number(value) + Number.EPSILON) * 10) / 10;
}

function roundedAverage(values) {
  if (values.length !== 4) return null;
  const prepared = values.map(roundTenths);
  return Math.round(prepared.reduce((sum, value) => sum + value, 0) / prepared.length);
}

function setStatus(text, tone = '') {
  els.status.textContent = text;
  els.status.dataset.tone = tone;
}

async function loadGrades(source = '/api/grades') {
  setStatus('载入中');
  const response = await fetch(source);
  if (!response.ok) throw new Error('成绩载入失败');
  const grades = await response.json();
  updateGrades(grades);
  setStatus('已载入', 'ok');
}

function updateGrades(grades) {
  state.grades = grades
    .map((grade) => ({
      subject: String(grade.subject || '').trim(),
      score: Number(grade.score),
      raw: grade.raw || '',
      assignments: normalizeAssignments(grade.assignments || [])
    }))
    .filter((grade) => grade.subject && Number.isFinite(grade.score))
    .sort((a, b) => b.score - a.score);
  state.selected = new Set([...state.selected].filter((subject) => state.grades.some((grade) => grade.subject === subject)));
  render();
}


function normalizeAssignments(assignments) {
  return assignments.map((item, index) => ({
    id: String(item.id || index + 1),
    categoryId: String(item.categoryId || 'unknown'),
    category: String(item.category || item.categoryId || 'Column').trim(),
    title: String(item.title || 'Item ' + (index + 1)).trim(),
    earned: numericOrNull(item.earned),
    possible: numericOrNull(item.possible),
    itemWeight: Number(item.itemWeight) || 0,
    scorePercent: Number(item.scorePercent),
    contribution: Number(item.contribution) || 0
  })).filter((item) => Number.isFinite(item.scorePercent));
}

function numericOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function render() {
  els.gradeCount.textContent = `${state.grades.length} 科`;
  renderPicker();
  renderAverage();
  renderPredictionControls();
  renderPrediction();
  renderChart();
  renderTable();
}

function renderPicker() {
  els.subjectPicker.innerHTML = '';
  for (const grade of state.grades) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'subject-chip';
    button.dataset.active = state.selected.has(grade.subject);
    button.textContent = `${grade.subject} ${roundTenths(grade.score)}`;
    button.addEventListener('click', () => toggleSubject(grade.subject));
    els.subjectPicker.append(button);
  }
}

function toggleSubject(subject) {
  if (state.selected.has(subject)) {
    state.selected.delete(subject);
  } else {
    if (state.selected.size >= 4) {
      const [first] = state.selected;
      state.selected.delete(first);
    }
    state.selected.add(subject);
  }
  render();
}

function renderAverage() {
  const selectedGrades = state.grades.filter((grade) => state.selected.has(grade.subject));
  els.selectionCount.textContent = `${selectedGrades.length} / 4`;
  const average = roundedAverage(selectedGrades.map((grade) => grade.score));
  if (average === null) {
    els.averageValue.textContent = '--';
    els.averageFormula.textContent = selectedGrades.length ? '还需要选择四科' : '选择四科后计算';
    return;
  }
  const rounded = selectedGrades.map((grade) => `${grade.subject} ${roundTenths(grade.score)}`);
  els.averageValue.textContent = average;
  els.averageFormula.textContent = `${rounded.join(' + ')} → ${average}`;
}


function renderPredictionControls() {
  if (!els.predictionCourse) return;
  const currentSubject = els.predictionCourse.value || state.predictionSubject || state.grades[0]?.subject || '';
  els.predictionCourse.innerHTML = '';
  for (const grade of state.grades) {
    const option = document.createElement('option');
    option.value = grade.subject;
    option.textContent = grade.subject;
    els.predictionCourse.append(option);
  }
  state.predictionSubject = state.grades.some((grade) => grade.subject === currentSubject) ? currentSubject : state.grades[0]?.subject || '';
  els.predictionCourse.value = state.predictionSubject;

  const grade = getPredictionGrade();
  const categories = getCategories(grade);
  const currentCategory = els.predictionCategory.value || state.predictionCategory || categories[0]?.key || '';
  els.predictionCategory.innerHTML = '';
  for (const category of categories) {
    const option = document.createElement('option');
    option.value = category.key;
    option.textContent = category.name + ' (' + roundHundredths(category.weight) + '%)';
    els.predictionCategory.append(option);
  }
  state.predictionCategory = categories.some((category) => category.key === currentCategory) ? currentCategory : categories[0]?.key || '';
  els.predictionCategory.value = state.predictionCategory;
}

function renderPrediction() {
  if (!els.predictedCourse) return;
  const grade = getPredictionGrade();
  const newScore = Number(els.predictionScore?.value || 100);
  const prediction = predictCourseScore(grade, state.predictionCategory, newScore);
  if (!grade || !prediction) {
    els.predictedCourse.textContent = '--';
    els.predictedAverage.textContent = '--';
    els.predictionDelta.textContent = '暂无可预测栏目';
    return;
  }
  els.predictedCourse.textContent = String(roundTenths(prediction.score));
  const selectedGrades = state.grades.filter((item) => state.selected.has(item.subject));
  const oldAverage = roundedAverage(selectedGrades.map((item) => item.score));
  const predictedValues = selectedGrades.map((item) => item.subject === grade.subject ? prediction.score : item.score);
  const newAverage = roundedAverage(predictedValues);
  els.predictedAverage.textContent = newAverage === null ? '--' : String(newAverage);
  const delta = roundHundredths(prediction.score - grade.score);
  const averageText = oldAverage === null || newAverage === null ? '选四科后显示均分变化' : '均分 ' + oldAverage + ' -> ' + newAverage;
  els.predictionDelta.textContent = grade.subject + ': ' + roundTenths(grade.score) + ' -> ' + roundTenths(prediction.score) + ' (' + (delta >= 0 ? '+' : '') + delta + '); ' + averageText;
}

function getPredictionGrade() {
  return state.grades.find((grade) => grade.subject === state.predictionSubject) || state.grades[0] || null;
}

function getCategories(grade) {
  if (!grade) return [];
  const groups = new Map();
  for (const item of grade.assignments || []) {
    const key = item.categoryId + '|' + item.category;
    if (!groups.has(key)) groups.set(key, { key, name: item.category, items: [], weight: 0 });
    const group = groups.get(key);
    group.items.push(item);
    group.weight += item.itemWeight;
  }
  return [...groups.values()].sort((a, b) => b.weight - a.weight);
}

function predictCourseScore(grade, categoryKey, newScore) {
  if (!grade || !Number.isFinite(newScore)) return null;
  const category = getCategories(grade).find((item) => item.key === categoryKey);
  if (!category || !category.items.length) return null;
  const currentAverage = category.items.reduce((sum, item) => sum + item.scorePercent, 0) / category.items.length;
  const nextAverage = (category.items.reduce((sum, item) => sum + item.scorePercent, 0) + newScore) / (category.items.length + 1);
  const delta = category.weight * (nextAverage - currentAverage) / 100;
  return { score: Math.max(0, grade.score + delta), delta, category };
}

function roundHundredths(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function renderChart() {
  els.chart.innerHTML = '';
  const max = Math.max(100, ...state.grades.map((grade) => grade.score));
  for (const grade of state.grades) {
    const row = document.createElement('div');
    row.className = 'bar-row';
    const label = document.createElement('span');
    label.className = 'bar-label';
    label.textContent = grade.subject;
    const track = document.createElement('div');
    track.className = 'bar-track';
    const fill = document.createElement('div');
    fill.className = 'bar-fill';
    fill.style.width = `${Math.max(2, (grade.score / max) * 100)}%`;
    const score = document.createElement('span');
    score.className = 'bar-score';
    score.textContent = roundTenths(grade.score);
    track.append(fill, score);
    row.append(label, track);
    els.chart.append(row);
  }
}

function renderTable() {
  els.gradeRows.innerHTML = '';
  for (const grade of state.grades) {
    const row = document.createElement('tr');
    appendCell(row, grade.subject);
    appendCell(row, roundHundredths(grade.score));
    appendCell(row, roundTenths(grade.score));
    appendCell(row, (grade.assignments || []).length + ' 项');
    const detailRow = document.createElement('tr');
    detailRow.className = 'detail-row';
    const detailCell = document.createElement('td');
    detailCell.colSpan = 4;
    detailCell.append(renderAssignmentDetails(grade));
    detailRow.append(detailCell);
    els.gradeRows.append(row, detailRow);
  }
}

function appendCell(row, value) {
  const cell = document.createElement('td');
  cell.textContent = value;
  row.append(cell);
}

function renderAssignmentDetails(grade) {
  const wrapper = document.createElement('details');
  wrapper.className = 'course-details';
  const summary = document.createElement('summary');
  summary.textContent = '展开 ' + grade.subject + ' 的小成绩';
  wrapper.append(summary);
  if (!grade.assignments.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-detail';
    empty.textContent = '没有小成绩明细';
    wrapper.append(empty);
    return wrapper;
  }
  const tableWrap = document.createElement('div');
  tableWrap.className = 'table-wrap nested';
  const table = document.createElement('table');
  table.className = 'assignment-table';
  table.innerHTML = '<thead><tr><th>栏目</th><th>项目</th><th>得分</th><th>百分比</th><th>权重</th></tr></thead>';
  const body = document.createElement('tbody');
  for (const item of grade.assignments) {
    const row = document.createElement('tr');
    appendCell(row, item.category);
    appendCell(row, item.title);
    appendCell(row, formatPoints(item));
    appendCell(row, roundHundredths(item.scorePercent) + '%');
    appendCell(row, roundHundredths(item.itemWeight) + '%');
    body.append(row);
  }
  table.append(body);
  tableWrap.append(table);
  wrapper.append(tableWrap);
  return wrapper;
}

function formatPoints(item) {
  if (item.earned !== null && item.possible !== null) return roundHundredths(item.earned) + ' / ' + roundHundredths(item.possible);
  if (item.earned !== null) return String(roundHundredths(item.earned));
  return '--';
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

els.password.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    els.form.requestSubmit();
  }
});

els.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus('抓取中');
  try {
    const response = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: els.email.value.trim(),
        password: els.password.value,
        url: els.url.value.trim()
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '抓取失败');
    updateGrades(data);
    setStatus('抓取完成', 'ok');
  } catch (error) {
    setStatus(error.message, 'bad');
  }
});

els.predictionCourse?.addEventListener('change', () => {
  state.predictionSubject = els.predictionCourse.value;
  state.predictionCategory = '';
  render();
});
els.predictionCategory?.addEventListener('change', () => {
  state.predictionCategory = els.predictionCategory.value;
  renderPrediction();
});
els.predictionScore?.addEventListener('input', renderPrediction);
els.refreshButton.addEventListener('click', () => loadGrades().catch((error) => setStatus(error.message, 'bad')));
els.sampleButton.addEventListener('click', () => {
  updateGrades(fallbackGrades);
  setStatus('示例已载入', 'ok');
});
els.exportButton.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state.grades, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'webtess-grades.json';
  anchor.click();
  URL.revokeObjectURL(url);
});

loadGrades().catch(() => {
  updateGrades(fallbackGrades);
  setStatus('示例已载入', 'ok');
});
