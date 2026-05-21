const state = {
  grades: [],
  selected: new Set(loadPinnedSubjects())
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

function roundCourseScore(value) {
  return Math.round(Number(value) + Number.EPSILON);
}

function averageDetails(values) {
  if (values.length !== 4) return null;
  const roundedScores = values.map(roundCourseScore);
  const rawAverage = values.reduce((sum, value) => sum + Number(value), 0) / values.length;
  const roundedAverageValue = Math.round(roundedScores.reduce((sum, value) => sum + value, 0) / roundedScores.length);
  return { rounded: roundedAverageValue, raw: rawAverage, roundedScores };
}

function roundedAverage(values) {
  return averageDetails(values)?.rounded ?? null;
}

function setStatus(text, tone = '') {
  els.status.textContent = text;
  els.status.dataset.tone = tone;
}

async function loadSavedCredential() {
  const rememberedEmail = localStorage.getItem('webtess-email');
  if (rememberedEmail && !els.email.value) els.email.value = rememberedEmail;
  if (!('credentials' in navigator) || !window.PasswordCredential) return;
  try {
    const credential = await navigator.credentials.get({ password: true, mediation: 'optional' });
    if (credential?.id && !els.email.value) els.email.value = credential.id;
    if (credential?.password && !els.password.value) els.password.value = credential.password;
  } catch {
    // Some browsers intentionally block programmatic password access.
  }
}

async function storeCredential() {
  const email = els.email.value.trim();
  const password = els.password.value;
  if (email) localStorage.setItem('webtess-email', email);
  if (!email || !password || !('credentials' in navigator) || !window.PasswordCredential) return;
  try {
    const credential = new PasswordCredential({ id: email, password, name: email });
    await navigator.credentials.store(credential);
  } catch {
    // Browser password managers may decline to save credentials for security reasons.
  }
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
  if (!state.selected.size) {
    state.selected = new Set(state.grades.slice(0, 4).map((grade) => grade.subject));
    savePinnedSubjects();
  }
  render();
}


function normalizeAssignments(assignments) {
  return assignments.map((item, index) => ({
    id: String(item.id || index + 1),
    categoryId: String(item.categoryId || 'unknown'),
    category: normalizeCategory(item.category, item.title),
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

function normalizeCategory(category, title = '') {
  const text = String(category || '').trim();
  if (!text || /^column\s*\d+$/i.test(text)) return inferCategoryFromTitle(title) || '未分类';
  return text;
}

function inferCategoryFromTitle(title) {
  const normalized = String(title || '').toLowerCase();
  const categories = [
    ['Test', /\b(test|exam|assessment|unit)\b/i],
    ['Quiz', /\bquiz\b/i],
    ['Homework', /\b(homework|hw|journal|worksheet|reading assignment|classnote)\b/i],
    ['Classwork', /\b(class work|classwork|notes|participation|outline|understand)\b/i],
    ['Project', /\b(project|presentation|video|poster|program|psa)\b/i],
    ['Writing', /\b(essay|paragraph|poem|writing|composition|reading comprehension)\b/i],
    ['Lab', /\b(lab|experiment)\b/i]
  ];
  const found = categories.find(([, pattern]) => pattern.test(normalized));
  return found ? found[0] : '';
}

function loadPinnedSubjects() {
  try {
    const value = JSON.parse(localStorage.getItem('pinned-subjects') || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function savePinnedSubjects() {
  localStorage.setItem('pinned-subjects', JSON.stringify([...state.selected]));
}

function render() {
  els.gradeCount.textContent = `${state.selected.size || 0} / ${state.grades.length} 展示`;
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
    button.textContent = `${state.selected.has(grade.subject) ? '展示' : '隐藏'} · ${grade.subject} ${roundCourseScore(grade.score)}`;
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
  savePinnedSubjects();
  render();
}

function renderAverage() {
  const selectedGrades = state.grades.filter((grade) => state.selected.has(grade.subject));
  els.selectionCount.textContent = selectedGrades.length + ' / 4';
  const details = averageDetails(selectedGrades.map((grade) => grade.score));
  if (!details) {
    els.averageValue.textContent = '--';
    els.averageFormula.textContent = selectedGrades.length ? '还需要选择四科' : '选择四科后计算';
    return;
  }
  const rounded = selectedGrades.map((grade) => grade.subject + ' ' + roundCourseScore(grade.score));
  els.averageValue.textContent = details.rounded;
  els.averageFormula.textContent = rounded.join(' + ') + ' -> ' + details.rounded + '; 未四舍五入均分 ' + roundHundredths(details.raw);
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
  els.predictedCourse.textContent = String(roundCourseScore(prediction.score));
  const selectedGrades = state.grades.filter((item) => state.selected.has(item.subject));
  const oldAverage = roundedAverage(selectedGrades.map((item) => item.score));
  const predictedValues = selectedGrades.map((item) => item.subject === grade.subject ? prediction.score : item.score);
  const newAverage = roundedAverage(predictedValues);
  els.predictedAverage.textContent = newAverage === null ? '--' : String(newAverage);
  const delta = roundHundredths(prediction.score - grade.score);
  const oldDetails = averageDetails(selectedGrades.map((item) => item.score));
  const newDetails = averageDetails(predictedValues);
  const averageText = !oldDetails || !newDetails ? '选四科后显示均分变化' : '均分 ' + oldDetails.rounded + ' -> ' + newDetails.rounded + '，未四舍五入 ' + roundHundredths(oldDetails.raw) + ' -> ' + roundHundredths(newDetails.raw);
  els.predictionDelta.textContent = grade.subject + ': ' + roundCourseScore(grade.score) + ' -> ' + roundCourseScore(prediction.score) + ' (' + (delta >= 0 ? '+' : '') + delta + '); ' + averageText;
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
  const featured = state.grades.filter((grade) => state.selected.has(grade.subject));
  const collapsed = state.grades.filter((grade) => !state.selected.has(grade.subject));

  const featuredWrap = document.createElement('div');
  featuredWrap.className = 'featured-courses';
  for (const grade of featured) {
    featuredWrap.append(createCourseCard(grade, true));
  }
  els.chart.append(featuredWrap);

  const details = document.createElement('details');
  details.className = 'collapsed-courses';
  const summary = document.createElement('summary');
  summary.textContent = '其他课程 ' + collapsed.length + ' 门';
  details.append(summary);
  const smallWrap = document.createElement('div');
  smallWrap.className = 'mini-courses';
  for (const grade of collapsed) {
    smallWrap.append(createCourseCard(grade, false));
  }
  details.append(smallWrap);
  els.chart.append(details);
}

function createCourseCard(grade, featured) {
  const card = document.createElement('article');
  card.className = featured ? 'course-card featured' : 'course-card compact-course';
  const title = document.createElement('h3');
  title.textContent = grade.subject;
  const score = document.createElement('strong');
  score.textContent = roundCourseScore(grade.score);
  const meta = document.createElement('p');
  meta.textContent = '原始 ' + roundHundredths(grade.score) + ' · 小成绩 ' + (grade.assignments || []).length + ' 项';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'course-toggle';
  button.textContent = featured ? '缩小' : '展示';
  button.addEventListener('click', () => toggleSubject(grade.subject));
  card.append(title, score, meta, button);
  return card;
}

function renderTable() {
  els.gradeRows.innerHTML = '';
  for (const grade of state.grades) {
    const row = document.createElement('tr');
    appendCell(row, grade.subject);
    appendCell(row, roundHundredths(grade.score));
    appendCell(row, roundCourseScore(grade.score));
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
    await storeCredential();
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

loadSavedCredential();

loadGrades().catch(() => {
  updateGrades(fallbackGrades);
  setStatus('示例已载入', 'ok');
});
