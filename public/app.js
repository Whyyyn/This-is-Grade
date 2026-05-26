const state = {
  grades: [],
  selected: new Set(loadPinnedSubjects()),
  urlPinned: loadUrlPinnedSubjects()
};

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
  gradeRows: document.querySelector('#gradeRows'),
  refreshButton: document.querySelector('#refreshButton'),
  exportButton: document.querySelector('#exportButton'),
  copyLayoutButton: document.querySelector('#copyLayoutButton'),
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
  state.urlPinned = loadUrlPinnedSubjects();
  const preferredSubjects = state.urlPinned.length ? state.urlPinned : [...state.selected];
  state.selected = new Set(resolvePinnedSubjects(preferredSubjects, state.grades).slice(0, 4));
  if (!state.selected.size) {
    state.selected = new Set(state.grades.slice(0, 4).map((grade) => grade.subject));
    if (!state.urlPinned.length) savePinnedSubjects();
  }
  render();
}

function resolvePinnedSubjects(subjects, grades) {
  const exact = new Map(grades.map((grade) => [grade.subject, grade.subject]));
  const normalized = new Map(grades.map((grade) => [normalizeSubjectKey(grade.subject), grade.subject]));
  const resolved = [];
  for (const subject of subjects) {
    const match = exact.get(subject) || normalized.get(normalizeSubjectKey(subject));
    if (match && !resolved.includes(match)) resolved.push(match);
  }
  return resolved;
}

function normalizeSubjectKey(subject) {
  return String(subject || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '');
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

function loadUrlPinnedSubjects() {
  const fromUrl = new URLSearchParams(window.location.search).get('show');
  if (!fromUrl) return [];
  const decoded = decodeSubjectList(fromUrl);
  return decoded.slice(0, 4);
}

function loadPinnedSubjects() {
  const fromUrl = loadUrlPinnedSubjects();
  if (fromUrl.length) return fromUrl;
  try {
    const value = JSON.parse(localStorage.getItem('pinned-subjects') || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function encodeSubjectList(subjects) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(subjects))));
}

function decodeSubjectList(value) {
  try {
    const json = decodeURIComponent(escape(atob(value)));
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {
    try {
      return value.split('|').map(decodeURIComponent).filter(Boolean);
    } catch {
      return [];
    }
  }
  return [];
}

function savePinnedSubjects() {
  const subjects = [...state.selected].slice(0, 4);
  state.urlPinned = subjects;
  try {
    localStorage.setItem('pinned-subjects', JSON.stringify(subjects));
  } catch {
    // Safari may block localStorage in stricter privacy modes.
  }
  const next = new URL(window.location.href);
  if (subjects.length) {
    next.searchParams.set('show', encodeSubjectList(subjects));
  } else {
    next.searchParams.delete('show');
  }
  window.history.replaceState({}, '', next);
}

function copyLayoutLink() {
  savePinnedSubjects();
  const link = window.location.href;
  navigator.clipboard?.writeText(link).then(() => {
    setStatus('布局链接已复制', 'ok');
  }).catch(() => {
    window.prompt('复制这个链接', link);
  });
}

function render() {
  renderPicker();
  renderAverage();
  renderPredictionControls();
  renderPrediction();
  renderTable();
}

function renderPicker() {
  els.subjectPicker.innerHTML = '';
  if (!state.grades.length) {
    const empty = document.createElement('p');
    empty.className = 'muted inline-empty';
    empty.textContent = '抓取成绩后可以选择要放大的四门课。';
    els.subjectPicker.append(empty);
    return;
  }
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

function renderTable() {
  els.gradeRows.innerHTML = '';
  const selectedGrades = state.grades.filter((grade) => state.selected.has(grade.subject));
  if (!selectedGrades.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 6;
    cell.className = 'empty-detail';
    cell.textContent = state.grades.length ? '选择展示的四门课后，这里会显示对应小成绩。' : '抓取成绩后显示小成绩明细。';
    row.append(cell);
    els.gradeRows.append(row);
    return;
  }

  for (const grade of selectedGrades) {
    if (!grade.assignments.length) {
      const row = document.createElement('tr');
      appendCell(row, grade.subject + ' · ' + roundCourseScore(grade.score), 'subject-cell');
      appendCell(row, '总分');
      appendCell(row, '暂无小成绩明细');
      appendCell(row, '--');
      appendCell(row, roundHundredths(grade.score) + '%');
      appendCell(row, '--');
      els.gradeRows.append(row);
      continue;
    }

    for (const [index, item] of grade.assignments.entries()) {
      const row = document.createElement('tr');
      appendCell(row, index === 0 ? grade.subject + ' · ' + roundCourseScore(grade.score) : '', 'subject-cell');
      appendCell(row, item.category);
      appendCell(row, item.title);
      appendCell(row, formatPoints(item));
      appendCell(row, roundHundredths(item.scorePercent) + '%');
      appendCell(row, roundHundredths(item.itemWeight) + '%');
      els.gradeRows.append(row);
    }
  }
}

function appendCell(row, value, className = '') {
  const cell = document.createElement('td');
  if (className) cell.className = className;
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
els.copyLayoutButton?.addEventListener('click', copyLayoutLink);
els.refreshButton.addEventListener('click', () => {
  if (els.email.value.trim() && els.password.value) {
    els.form.requestSubmit();
  } else {
    setStatus('请输入邮箱和密码后抓取', 'bad');
  }
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

render();
