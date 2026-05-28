const state = {
  grades: [],
  selected: new Set(loadPinnedSubjects()),
  urlPinned: loadUrlPinnedSubjects(),
  detailSubject: '',
  revealedChanges: new Set(),
  latestChanges: []
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
  detailTabs: document.querySelector('#detailTabs'),
  gradeRows: document.querySelector('#gradeRows'),
  assignmentChart: document.querySelector('#assignmentChart'),
  refreshButton: document.querySelector('#refreshButton'),
  themeToggleButton: document.querySelector('#themeToggleButton'),
  exportButton: document.querySelector('#exportButton'),
  copyLayoutButton: document.querySelector('#copyLayoutButton'),
  historyStatus: document.querySelector('#historyStatus'),
  historyChart: document.querySelector('#historyChart'),
  historyExportButton: document.querySelector('#historyExportButton'),
  historyDeleteButton: document.querySelector('#historyDeleteButton'),
  revealModal: document.querySelector('#revealModal'),
  revealList: document.querySelector('#revealList'),
  revealAllButton: document.querySelector('#revealAllButton'),
  revealCloseButton: document.querySelector('#revealCloseButton'),
  predictionCourse: document.querySelector('#predictionCourse'),
  predictionCategory: document.querySelector('#predictionCategory'),
  predictionScore: document.querySelector('#predictionScore'),
  predictedCourse: document.querySelector('#predictedCourse'),
  predictedAverage: document.querySelector('#predictedAverage'),
  predictionDelta: document.querySelector('#predictionDelta')
};

applyTheme(loadTheme());

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

function loadTheme() {
  const fromUrl = new URLSearchParams(window.location.search).get('theme');
  if (fromUrl === 'light' || fromUrl === 'dark') return fromUrl;
  try {
    const saved = localStorage.getItem('grade-theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Ignore storage failures in strict privacy modes.
  }
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function applyTheme(theme, writeUrl = true) {
  const nextTheme = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = nextTheme;
  if (els.themeToggleButton) {
    els.themeToggleButton.querySelector('span').textContent = nextTheme === 'light' ? '☾' : '☀';
    els.themeToggleButton.title = nextTheme === 'light' ? '切换到暗色主题' : '切换到亮色主题';
    els.themeToggleButton.setAttribute('aria-label', els.themeToggleButton.title);
  }
  try {
    localStorage.setItem('grade-theme', nextTheme);
  } catch {
    // Ignore storage failures in strict privacy modes.
  }
  if (!writeUrl) return;
  const next = new URL(window.location.href);
  next.searchParams.set('theme', nextTheme);
  window.history.replaceState({}, '', next);
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  applyTheme(current === 'light' ? 'dark' : 'light');
}

function updateGrades(grades) {
  state.grades = grades
    .map((grade) => ({
      subject: String(grade.subject || '').trim(),
      score: Number(grade.score),
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
  ensureDetailSubject();
  renderPicker();
  renderAverage();
  renderDetailTabs();
  renderPredictionControls();
  renderPrediction();
  renderTable();
  renderAssignmentChart();
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
  if (!state.selected.has(state.detailSubject)) state.detailSubject = '';
  render();
}

function getSelectedGrades() {
  return state.grades.filter((grade) => state.selected.has(grade.subject));
}

function ensureDetailSubject() {
  const selectedGrades = getSelectedGrades();
  if (selectedGrades.some((grade) => grade.subject === state.detailSubject)) return;
  state.detailSubject = selectedGrades[0]?.subject || '';
}

function setDetailSubject(subject) {
  if (state.detailSubject === subject) return;
  state.detailSubject = subject;
  renderDetailTabs();
  renderTable();
  renderAssignmentChart();
}

function renderAverage() {
  const selectedGrades = getSelectedGrades();
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

function renderDetailTabs() {
  if (!els.detailTabs) return;
  els.detailTabs.innerHTML = '';
  const selectedGrades = getSelectedGrades();
  if (!selectedGrades.length) {
    const empty = document.createElement('p');
    empty.className = 'muted inline-empty';
    empty.textContent = '左侧选择展示的科目后，这里会出现四个切换标签。';
    els.detailTabs.append(empty);
    return;
  }
  for (const grade of selectedGrades) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'detail-tab';
    button.dataset.active = grade.subject === state.detailSubject;
    button.textContent = grade.subject + ' · ' + roundCourseScore(grade.score);
    button.setAttribute('aria-pressed', grade.subject === state.detailSubject ? 'true' : 'false');
    button.addEventListener('mouseenter', () => setDetailSubject(grade.subject));
    button.addEventListener('focus', () => setDetailSubject(grade.subject));
    button.addEventListener('click', () => setDetailSubject(grade.subject));
    els.detailTabs.append(button);
  }
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
  const selectedGrades = getSelectedGrades();
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
  const selectedGrades = getSelectedGrades();
  const grade = selectedGrades.find((item) => item.subject === state.detailSubject);
  if (!grade) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 6;
    cell.className = 'empty-detail';
    cell.textContent = state.grades.length ? '选择展示的四门课后，这里会显示对应小成绩。' : '抓取成绩后显示小成绩明细。';
    row.append(cell);
    els.gradeRows.append(row);
    return;
  }

  const totalRow = document.createElement('tr');
  totalRow.className = 'total-row';
  appendCell(totalRow, grade.subject, 'subject-cell');
  appendCell(totalRow, '总分');
  appendCell(totalRow, '当前课程总成绩');
  appendCell(totalRow, String(roundCourseScore(grade.score)), 'total-score');
  appendCell(totalRow, roundHundredths(grade.score) + '%');
  appendCell(totalRow, '100%');
  els.gradeRows.append(totalRow);

  if (!grade.assignments.length) {
    const row = document.createElement('tr');
    appendCell(row, '');
    appendCell(row, '小成绩');
    appendCell(row, '暂无小成绩明细');
    appendCell(row, '--');
    appendCell(row, '--');
    appendCell(row, '--');
    els.gradeRows.append(row);
    return;
  }

  for (const item of grade.assignments) {
    const row = document.createElement('tr');
    appendCell(row, '');
    appendCell(row, item.category);
    appendCell(row, item.title);
    appendCell(row, formatPoints(item));
    appendCell(row, roundHundredths(item.scorePercent) + '%');
    appendCell(row, roundHundredths(item.itemWeight) + '%');
    els.gradeRows.append(row);
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

function renderAssignmentChart() {
  if (!els.assignmentChart) return;
  els.assignmentChart.innerHTML = '';
  const grade = getSelectedGrades().find((item) => item.subject === state.detailSubject);
  if (!grade) {
    els.assignmentChart.append(createChartEmpty('选择展示科目后显示作业权重图。'));
    return;
  }
  if (!grade.assignments.length) {
    els.assignmentChart.append(createChartEmpty('这个科目没有可绘制的小成绩。'));
    return;
  }

  const items = buildChartItems(grade.assignments);
  const chart = document.createElement('div');
  chart.className = 'donut-layout';
  const detail = document.createElement('p');
  detail.className = 'chart-detail muted';
  const showItemDetail = (item) => {
    detail.textContent = item.title + ' | weight ' + roundHundredths(item.displayWeight) + '% | score ' + roundHundredths(item.scorePercent) + '% | ' + formatPoints(item.assignment);
    for (const node of chart.querySelectorAll('[data-chart-item]')) {
      node.dataset.active = node.dataset.chartItem === item.id ? 'true' : 'false';
    }
  };
  chart.append(createDonutSvg(items, showItemDetail));

  const legend = document.createElement('div');
  legend.className = 'donut-legend';
  for (const item of items) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'legend-item';
    row.dataset.chartItem = item.id;
    row.dataset.active = 'false';
    row.title = item.title + ' · 占比 ' + roundHundredths(item.displayWeight) + '% · 实得 ' + roundHundredths(item.scorePercent) + '%';
    row.innerHTML =
      '<span class="legend-swatch" style="--swatch:' + item.color + '"></span>' +
      '<span class="legend-text"><strong>' + escapeHtml(item.title) + '</strong><small>' +
      roundHundredths(item.displayWeight) + '% · ' + roundHundredths(item.scorePercent) + '% · ' + escapeHtml(formatPoints(item.assignment)) +
      '</small></span>';
    row.addEventListener('mouseenter', () => showItemDetail(item));
    row.addEventListener('focus', () => showItemDetail(item));
    row.addEventListener('click', () => showItemDetail(item));
    legend.append(row);
  }
  chart.append(legend);
  chart.append(detail);
  if (items[0]) showItemDetail(items[0]);
  els.assignmentChart.append(chart);
}

function createChartEmpty(text) {
  const empty = document.createElement('p');
  empty.className = 'muted chart-empty';
  empty.textContent = text;
  return empty;
}

function buildChartItems(assignments) {
  const colors = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6'];
  const positiveWeights = assignments.map((item) => Math.max(0, Number(item.itemWeight) || 0));
  const hasWeights = positiveWeights.some((weight) => weight > 0);
  const weights = hasWeights ? positiveWeights : assignments.map(() => 1);
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  return assignments.map((item, index) => {
    const weight = weights[index];
    return {
      id: 'assignment-' + index,
      assignment: item,
      title: item.title,
      displayWeight: hasWeights ? weight : 100 / assignments.length,
      share: weight / total,
      scorePercent: Number(item.scorePercent) || 0,
      color: colors[index % colors.length],
      patternId: 'lossPattern' + index
    };
  });
}

function createDonutSvg(items, onActivate) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 240 240');
  svg.setAttribute('role', 'img');
  svg.classList.add('donut');

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  for (const item of items) {
    const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
    pattern.setAttribute('id', item.patternId);
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');
    pattern.setAttribute('width', '8');
    pattern.setAttribute('height', '8');
    const base = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    base.setAttribute('width', '8');
    base.setAttribute('height', '8');
    base.setAttribute('fill', item.color);
    base.setAttribute('opacity', '0.28');
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.setAttribute('d', 'M-2 8 L8 -2 M2 10 L10 2');
    line.setAttribute('stroke', item.color);
    line.setAttribute('stroke-width', '2');
    pattern.append(base, line);
    defs.append(pattern);
  }
  svg.append(defs);

  let cursor = -90;
  for (const item of items) {
    const span = item.share * 360;
    const earnedSpan = span * clamp(item.scorePercent / 100, 0, 1);
    const lostSpan = Math.max(0, span - earnedSpan);
    if (earnedSpan > 0.1) svg.append(createArcPath(120, 120, 98, 58, cursor, cursor + earnedSpan, item.color, item, onActivate));
    if (lostSpan > 0.1) svg.append(createArcPath(120, 120, 98, 58, cursor + earnedSpan, cursor + span, 'url(#' + item.patternId + ')', item, onActivate));
    cursor += span;
  }

  const center = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  center.setAttribute('x', '120');
  center.setAttribute('y', '116');
  center.setAttribute('text-anchor', 'middle');
  center.classList.add('donut-center');
  center.textContent = '权重';
  const sub = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  sub.setAttribute('x', '120');
  sub.setAttribute('y', '138');
  sub.setAttribute('text-anchor', 'middle');
  sub.classList.add('donut-sub');
  sub.textContent = '实得 / 未满';
  svg.append(center, sub);
  return svg;
}

function createArcPath(cx, cy, outerRadius, innerRadius, startAngle, endAngle, fill, item, onActivate) {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const safeEndAngle = endAngle - startAngle >= 359.99 ? startAngle + 359.99 : endAngle;
  path.setAttribute('d', donutSegmentPath(cx, cy, outerRadius, innerRadius, startAngle, safeEndAngle));
  path.setAttribute('fill', fill);
  path.setAttribute('tabindex', '0');
  path.setAttribute('data-chart-item', item.id);
  path.setAttribute('data-active', 'false');
  path.setAttribute('aria-label', item.title + ', weight ' + roundHundredths(item.displayWeight) + '%, score ' + roundHundredths(item.scorePercent) + '%');
  path.classList.add('donut-segment');
  const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
  title.textContent = item.title + ' · 占比 ' + roundHundredths(item.displayWeight) + '% · 实得 ' + roundHundredths(item.scorePercent) + '%';
  path.append(title);
  if (onActivate) {
    path.addEventListener('mouseenter', () => onActivate(item));
    path.addEventListener('focus', () => onActivate(item));
    path.addEventListener('click', () => onActivate(item));
  }
  return path;
}

function donutSegmentPath(cx, cy, outerRadius, innerRadius, startAngle, endAngle) {
  const startOuter = polarToCartesian(cx, cy, outerRadius, endAngle);
  const endOuter = polarToCartesian(cx, cy, outerRadius, startAngle);
  const startInner = polarToCartesian(cx, cy, innerRadius, startAngle);
  const endInner = polarToCartesian(cx, cy, innerRadius, endAngle);
  const largeArc = endAngle - startAngle <= 180 ? '0' : '1';
  return [
    'M', startOuter.x, startOuter.y,
    'A', outerRadius, outerRadius, 0, largeArc, 0, endOuter.x, endOuter.y,
    'L', startInner.x, startInner.y,
    'A', innerRadius, innerRadius, 0, largeArc, 1, endInner.x, endInner.y,
    'Z'
  ].join(' ');
}

function polarToCartesian(cx, cy, radius, angleInDegrees) {
  const angleInRadians = angleInDegrees * Math.PI / 180;
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians)
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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

function setHistoryStatus(text, tone = '') {
  if (!els.historyStatus) return;
  els.historyStatus.textContent = text;
  els.historyStatus.dataset.tone = tone;
}

async function handleEncryptedHistory(email, password) {
  if (!email || !password || !state.grades.length) return;
  if (!crypto?.subtle) {
    setHistoryStatus('浏览器不支持加密历史', 'bad');
    return;
  }
  try {
    const records = await fetchEncryptedHistory();
    const snapshot = createHistorySnapshot();
    if (!records.length) {
      const salt = randomBase64(16);
      const key = await deriveKey(email, password, salt);
      await saveEncryptedSnapshot(await encryptSnapshot(snapshot, key, salt));
      setHistoryStatus('已建立历史基准', 'ok');
      renderHistoryChart([snapshot]);
      return;
    }

    const key = await deriveKey(email, password, records[0].salt);
    const latest = await decryptSnapshot(records.at(-1), key);
    const changes = compareSnapshots(latest, snapshot);
    const decrypted = await decryptHistoryRecords(records, email, password);
    if (!changes.length) {
      setHistoryStatus('没有发现新成绩变化', 'ok');
      renderHistoryChart(decrypted);
      return;
    }

    await saveEncryptedSnapshot(await encryptSnapshot(snapshot, key, records[0].salt));
    setHistoryStatus('发现新成绩变化', 'ok');
    renderHistoryChart([...decrypted, snapshot]);
    showRevealModal(changes, latest, snapshot);
  } catch (error) {
    if (error.name === 'OperationError') {
      setHistoryStatus('无法解密历史，WebTESS 密码可能已改变。', 'bad');
      if (els.historyChart) els.historyChart.innerHTML = '<p class="muted chart-empty">无法解密历史，请检查 WebTESS 密码。</p>';
      return;
    }
    setHistoryStatus(error.message || '历史功能暂时不可用', 'bad');
  }
}

async function fetchEncryptedHistory() {
  const response = await fetch('/api/history?limit=120', { credentials: 'same-origin' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '历史功能暂时不可用');
  return Array.isArray(data.snapshots) ? data.snapshots : [];
}

async function saveEncryptedSnapshot(record) {
  const response = await fetch('/api/history', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '历史保存失败');
  return data;
}

async function deleteEncryptedHistory() {
  const response = await fetch('/api/history', { method: 'DELETE', credentials: 'same-origin' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '删除失败');
}

async function decryptHistoryRecords(records, email, password) {
  const snapshots = [];
  const keys = new Map();
  for (const record of records) {
    if (!keys.has(record.salt)) keys.set(record.salt, await deriveKey(email, password, record.salt));
    snapshots.push(await decryptSnapshot(record, keys.get(record.salt)));
  }
  return snapshots.sort((a, b) => new Date(a.capturedAt) - new Date(b.capturedAt));
}

async function deriveKey(email, password, saltBase64) {
  const passphrase = normalizeEmail(email) + '\n' + password;
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: base64ToBytes(saltBase64), iterations: 310000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptSnapshot(snapshot, key, salt) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(snapshot))
  );
  return {
    salt,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    schema_version: 1
  };
}

async function decryptSnapshot(record, key) {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(record.iv) },
    key,
    base64ToBytes(record.ciphertext)
  );
  const snapshot = JSON.parse(new TextDecoder().decode(plaintext));
  return sanitizeSnapshot(snapshot);
}

function createHistorySnapshot() {
  return sanitizeSnapshot({
    capturedAt: new Date().toISOString(),
    grades: state.grades.map((grade) => ({
      subject: grade.subject,
      score: roundHundredths(grade.score),
      assignments: grade.assignments.map((item) => ({
        category: item.category,
        title: item.title,
        earned: item.earned,
        possible: item.possible,
        scorePercent: roundHundredths(item.scorePercent),
        itemWeight: roundHundredths(item.itemWeight)
      }))
    }))
  });
}

function sanitizeSnapshot(snapshot) {
  return {
    capturedAt: String(snapshot?.capturedAt || new Date().toISOString()),
    grades: Array.isArray(snapshot?.grades) ? snapshot.grades.map((grade) => ({
      subject: String(grade.subject || '').trim(),
      score: Number(grade.score),
      assignments: Array.isArray(grade.assignments) ? grade.assignments.map((item) => ({
        category: String(item.category || '').trim() || '未分类',
        title: String(item.title || '').trim() || 'Item',
        earned: numericOrNull(item.earned),
        possible: numericOrNull(item.possible),
        scorePercent: Number(item.scorePercent),
        itemWeight: Number(item.itemWeight) || 0
      })).filter((item) => Number.isFinite(item.scorePercent)) : []
    })).filter((grade) => grade.subject && Number.isFinite(grade.score)) : []
  };
}

function compareSnapshots(oldSnapshot, newSnapshot) {
  const changes = [];
  const oldCourses = new Map(oldSnapshot.grades.map((grade) => [grade.subject, grade]));
  const selectedSubjects = [...state.selected];
  const oldAverage = averageForSubjects(oldSnapshot, selectedSubjects);
  const newAverage = averageForSubjects(newSnapshot, selectedSubjects);
  for (const newCourse of newSnapshot.grades) {
    const oldCourse = oldCourses.get(newCourse.subject);
    if (!oldCourse) continue;
    const courseDelta = roundHundredths(newCourse.score - oldCourse.score);
    if (Math.abs(courseDelta) >= 0.01) {
      changes.push(createChange('course-score', newCourse.subject, '科目总分变化', oldCourse, newCourse, null, null, oldAverage, newAverage));
    }
    const oldAssignments = new Map(oldCourse.assignments.map((item) => [assignmentKey(item), item]));
    for (const item of newCourse.assignments) {
      const oldItem = oldAssignments.get(assignmentKey(item));
      if (!oldItem) {
        changes.push(createChange('new-assignment', newCourse.subject, item.title, oldCourse, newCourse, null, item, oldAverage, newAverage));
        continue;
      }
      if (Math.abs((item.scorePercent || 0) - (oldItem.scorePercent || 0)) >= 0.01) {
        changes.push(createChange('assignment-score', newCourse.subject, item.title, oldCourse, newCourse, oldItem, item, oldAverage, newAverage));
      } else if (Math.abs((item.itemWeight || 0) - (oldItem.itemWeight || 0)) >= 0.01) {
        changes.push(createChange('assignment-weight', newCourse.subject, item.title, oldCourse, newCourse, oldItem, item, oldAverage, newAverage));
      }
    }
  }
  return changes;
}

function createChange(type, subject, title, oldCourse, newCourse, oldItem, newItem, oldAverage, newAverage) {
  return { type, subject, title, oldCourse, newCourse, oldItem, newItem, oldAverage, newAverage };
}

function assignmentKey(item) {
  return normalizeSubjectKey((item.category || '') + '|' + (item.title || ''));
}

function averageForSubjects(snapshot, subjects) {
  if (subjects.length !== 4) return null;
  const values = subjects.map((subject) => snapshot.grades.find((grade) => grade.subject === subject)?.score);
  if (values.some((value) => !Number.isFinite(value))) return null;
  return averageDetails(values);
}

function showRevealModal(changes) {
  state.latestChanges = changes;
  state.revealedChanges = new Set();
  renderRevealList();
  if (els.revealModal) els.revealModal.hidden = false;
}

function renderRevealList() {
  if (!els.revealList) return;
  els.revealList.innerHTML = '';
  state.latestChanges.forEach((change, index) => {
    const item = document.createElement('article');
    item.className = 'reveal-item';
    const summary = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = change.subject;
    const hint = document.createElement('p');
    hint.className = 'muted inline-empty';
    hint.textContent = change.title || describeChangeType(change.type);
    summary.append(title, hint);
    const button = document.createElement('button');
    button.className = 'ghost compact';
    button.type = 'button';
    button.textContent = state.revealedChanges.has(index) ? '已揭晓' : '点击揭晓';
    button.addEventListener('click', () => {
      state.revealedChanges.add(index);
      renderRevealList();
    });
    item.append(summary, button);
    if (state.revealedChanges.has(index)) {
      const secret = document.createElement('p');
      secret.className = 'reveal-secret muted';
      secret.textContent = revealText(change);
      item.append(secret);
    }
    els.revealList.append(item);
  });
}

function revealText(change) {
  const pieces = [];
  if (change.newItem) {
    if (change.oldItem) {
      pieces.push('旧分数 ' + roundHundredths(change.oldItem.scorePercent) + '%，新分数 ' + roundHundredths(change.newItem.scorePercent) + '%');
      pieces.push('旧权重 ' + roundHundredths(change.oldItem.itemWeight) + '%，新权重 ' + roundHundredths(change.newItem.itemWeight) + '%');
    } else {
      pieces.push('新增作业：' + roundHundredths(change.newItem.scorePercent) + '%，权重 ' + roundHundredths(change.newItem.itemWeight) + '%');
    }
  }
  pieces.push('科目总分 ' + roundHundredths(change.oldCourse.score) + '% -> ' + roundHundredths(change.newCourse.score) + '%');
  if (change.oldAverage && change.newAverage) {
    pieces.push('四科均分 ' + change.oldAverage.rounded + ' -> ' + change.newAverage.rounded + '，未四舍五入 ' + roundHundredths(change.oldAverage.raw) + ' -> ' + roundHundredths(change.newAverage.raw));
  }
  return pieces.join('；');
}

function describeChangeType(type) {
  return {
    'course-score': '科目总分变化',
    'new-assignment': '新增作业',
    'assignment-score': '作业分数变化',
    'assignment-weight': '作业权重变化'
  }[type] || '成绩变化';
}

function renderHistoryChart(snapshots) {
  if (!els.historyChart) return;
  if (!snapshots.length) {
    els.historyChart.innerHTML = '<p class="muted chart-empty">暂无历史记录。</p>';
    return;
  }
  const subjects = [...new Set(snapshots.flatMap((snapshot) => snapshot.grades.map((grade) => grade.subject)))];
  const width = 900;
  const height = 260;
  const padding = 34;
  const maxScore = Math.max(105, ...snapshots.flatMap((snapshot) => snapshot.grades.map((grade) => grade.score)));
  const colors = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];
  const xFor = (index) => padding + (snapshots.length === 1 ? 0.5 : index / (snapshots.length - 1)) * (width - padding * 2);
  const yFor = (score) => height - padding - (score / maxScore) * (height - padding * 2);
  const lines = subjects.map((subject, subjectIndex) => {
    const points = snapshots.map((snapshot, index) => {
      const grade = snapshot.grades.find((item) => item.subject === subject);
      return grade ? { x: xFor(index), y: yFor(grade.score), score: grade.score } : null;
    }).filter(Boolean);
    if (!points.length) return '';
    const path = points.map((point, index) => (index ? 'L' : 'M') + point.x + ' ' + point.y).join(' ');
    const color = colors[subjectIndex % colors.length];
    const dots = points.map((point) => `<circle class="history-point" cx="${point.x}" cy="${point.y}" r="3.5" fill="${color}"><title>${escapeHtml(subject)} ${roundHundredths(point.score)}%</title></circle>`).join('');
    return `<path class="history-line" d="${path}" stroke="${color}"></path>${dots}<text class="history-label" x="${points.at(-1).x + 6}" y="${points.at(-1).y + 4}">${escapeHtml(subject.slice(0, 22))}</text>`;
  }).join('');
  els.historyChart.innerHTML = `
    <svg class="history-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="成绩历史折线图">
      <line class="history-axis" x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}"></line>
      <line class="history-axis" x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}"></line>
      <line class="history-grid" x1="${padding}" y1="${yFor(100)}" x2="${width - padding}" y2="${yFor(100)}"></line>
      <text class="history-label" x="8" y="${yFor(100) + 4}">100</text>
      ${lines}
    </svg>`;
}

async function exportEncryptedBackup() {
  const records = await fetchEncryptedHistory();
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), snapshots: records }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'encrypted-grade-history.json';
  anchor.click();
  URL.revokeObjectURL(url);
}

function randomBase64(length) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return bytesToBase64(bytes);
}

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
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
  const email = els.email.value.trim();
  const password = els.password.value;
  try {
    const response = await fetch('/api/scrape', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        url: els.url.value.trim()
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '抓取失败');
    updateGrades(data);
    setStatus('抓取完成', 'ok');
    if (response.headers.get('X-History-Disabled')) {
      setHistoryStatus('历史功能需要配置 SESSION_SECRET', 'bad');
    } else {
      await handleEncryptedHistory(email, password);
    }
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
els.themeToggleButton?.addEventListener('click', toggleTheme);
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

els.historyExportButton?.addEventListener('click', async () => {
  try {
    await exportEncryptedBackup();
    setHistoryStatus('已导出密文备份', 'ok');
  } catch (error) {
    setHistoryStatus(error.message || '导出失败', 'bad');
  }
});

els.historyDeleteButton?.addEventListener('click', async () => {
  if (!window.confirm('确定删除所有加密历史记录吗？这个操作不能恢复。')) return;
  try {
    await deleteEncryptedHistory();
    if (els.historyChart) els.historyChart.innerHTML = '<p class="muted chart-empty">历史记录已删除。</p>';
    setHistoryStatus('历史已删除', 'ok');
  } catch (error) {
    setHistoryStatus(error.message || '删除失败', 'bad');
  }
});

els.revealCloseButton?.addEventListener('click', () => {
  if (els.revealModal) els.revealModal.hidden = true;
});

els.revealAllButton?.addEventListener('click', () => {
  state.latestChanges.forEach((_, index) => state.revealedChanges.add(index));
  renderRevealList();
});

render();
