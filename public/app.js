const state = {
  grades: [],
  selected: new Set(loadPinnedSubjects()),
  urlPinned: loadUrlPinnedSubjects(),
  detailSubject: '',
  revealedChanges: new Set(),
  latestChanges: [],
  historySnapshots: [],
  historyLiveSnapshots: [],
  historySubject: '',
  historyIsDemo: false,
  historyTooltipPinned: false,
  historyTooltipPoint: -1,
  historyTooltipHideTimer: null
};

const els = {
  form: document.querySelector('#scrapeForm'),
  email: document.querySelector('#email'),
  password: document.querySelector('#password'),
  status: document.querySelector('#status'),
  subjectPicker: document.querySelector('#subjectPicker'),
  selectionCount: document.querySelector('#selectionCount'),
  averageValue: document.querySelector('#averageValue'),
  averageFormula: document.querySelector('#averageFormula'),
  detailTabs: document.querySelector('#detailTabs'),
  gradeRows: document.querySelector('#gradeRows'),
  assignmentChart: document.querySelector('#assignmentChart'),
  refreshButton: document.querySelector('#refreshButton'),
  settingsButton: document.querySelector('#settingsButton'),
  settingsModal: document.querySelector('#settingsModal'),
  settingsCloseButton: document.querySelector('#settingsCloseButton'),
  themeOptions: [...document.querySelectorAll('input[name="theme"]')],
  marketModeOptions: [...document.querySelectorAll('input[name="market-mode"]')],
  exportButton: document.querySelector('#exportButton'),
  copyLayoutButton: document.querySelector('#copyLayoutButton'),
  historyStatus: document.querySelector('#historyStatus'),
  historySubjectSelect: document.querySelector('#historySubjectSelect'),
  historySummary: document.querySelector('#historySummary'),
  historyChart: document.querySelector('#historyChart'),
  historyTooltip: document.querySelector('#historyTooltip'),
  historyExportButton: document.querySelector('#historyExportButton'),
  historyDeleteButton: document.querySelector('#historyDeleteButton'),
  loadExampleHistoryButton: document.querySelector('#loadExampleHistoryButton'),
  exitExampleHistoryButton: document.querySelector('#exitExampleHistoryButton'),
  revealModal: document.querySelector('#revealModal'),
  revealList: document.querySelector('#revealList'),
  revealAllButton: document.querySelector('#revealAllButton'),
  revealCloseButton: document.querySelector('#revealCloseButton'),
  predictionCourse: document.querySelector('#predictionCourse'),
  predictionCategory: document.querySelector('#predictionCategory'),
  predictionScore: document.querySelector('#predictionScore'),
  predictedCourse: document.querySelector('#predictedCourse'),
  predictedAverage: document.querySelector('#predictedAverage'),
  predictionDelta: document.querySelector('#predictionDelta'),
  changelogCard: document.querySelector('#changelogCard'),
  changelogList: document.querySelector('#changelogList'),
  changelogBuild: document.querySelector('#changelogBuild')
};

const CHANGELOG_API = 'https://api.github.com/repos/Whyyyn/This-is-Grade/commits?sha=main&per_page=100';
const CHANGELOG_URL = 'https://github.com/Whyyyn/This-is-Grade/commits/main/';
let changelogLoaded = false;

applyTheme(loadTheme(), false);
applyMarketMode(loadMarketMode());

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
  if (isThemeChoice(fromUrl)) return fromUrl;
  try {
    const saved = localStorage.getItem('grade-theme');
    if (isThemeChoice(saved)) return saved;
  } catch {
    // Ignore storage failures in strict privacy modes.
  }
  return 'system';
}

function applyTheme(theme, writeUrl = true) {
  const nextChoice = isThemeChoice(theme) ? theme : 'system';
  const resolvedTheme = nextChoice === 'system'
    ? (window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : nextChoice;
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.dataset.themeChoice = nextChoice;
  for (const option of els.themeOptions) option.checked = option.value === nextChoice;
  try {
    localStorage.setItem('grade-theme', nextChoice);
  } catch {
    // Ignore storage failures in strict privacy modes.
  }
  if (!writeUrl) return;
  const next = new URL(window.location.href);
  next.searchParams.set('theme', nextChoice);
  window.history.replaceState({}, '', next);
}

function isThemeChoice(value) {
  return ['system', 'light', 'dark', 'webtess', 'hacker'].includes(value);
}

function loadMarketMode() {
  try {
    const saved = localStorage.getItem('grade-market-mode');
    if (isMarketMode(saved)) return saved;
  } catch {
    // Ignore storage failures in strict privacy modes.
  }
  return 'a-share';
}

function applyMarketMode(mode) {
  const nextMode = isMarketMode(mode) ? mode : 'a-share';
  document.documentElement.dataset.marketMode = nextMode;
  for (const option of els.marketModeOptions) option.checked = option.value === nextMode;
  try {
    localStorage.setItem('grade-market-mode', nextMode);
  } catch {
    // Ignore storage failures in strict privacy modes.
  }
}

function isMarketMode(value) {
  return ['a-share', 'international'].includes(value);
}

function openSettings() {
  if (!els.settingsModal) return;
  els.settingsModal.hidden = false;
  els.settingsCloseButton?.focus();
}

function closeSettings() {
  if (!els.settingsModal) return;
  els.settingsModal.hidden = true;
  els.settingsButton?.focus();
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
  return assignments.map((item, index) => {
    const sourceAssignment = String(item.category || '').trim();
    const sourceDescription = String(item.title || '').trim();
    return {
      id: String(item.id || index + 1),
      categoryId: String(item.categoryId || 'unknown'),
      category: sourceAssignment || sourceDescription || '未命名作业',
      title: sourceAssignment ? sourceDescription : '',
      earned: numericOrNull(item.earned),
      possible: numericOrNull(item.possible),
      itemWeight: Number(item.itemWeight) || 0,
      scorePercent: Number(item.scorePercent),
      contribution: Number(item.contribution) || 0
    };
  }).filter((item) => Number.isFinite(item.scorePercent));
}

function numericOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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

async function loadBrowserCredential() {
  if (!('credentials' in navigator) || !window.PasswordCredential) return;
  try {
    const credential = await navigator.credentials.get({ password: true, mediation: 'optional' });
    if (credential?.id && !els.email.value) els.email.value = credential.id;
    if (credential?.password && !els.password.value) els.password.value = credential.password;
  } catch {
    // Browser password managers can decline programmatic access.
  }
}

async function storeBrowserCredential(email, password) {
  if (!email || !password || !('credentials' in navigator) || !window.PasswordCredential) return;
  try {
    const credential = new PasswordCredential({ id: email, password, name: email });
    await navigator.credentials.store(credential);
  } catch {
    // Saving remains controlled by the browser and the user.
  }
}

function setupHumanTranslations() {
  for (const node of document.querySelectorAll('[data-human-text]')) {
    const originalText = node.textContent;
    const humanText = node.dataset.humanText;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'human-toggle';
    button.textContent = '翻译成：人话';
    button.addEventListener('click', () => {
      const showingHuman = node.dataset.showingHuman === 'true';
      node.textContent = showingHuman ? originalText : humanText;
      node.dataset.showingHuman = showingHuman ? 'false' : 'true';
      button.textContent = showingHuman ? '翻译成：人话' : '切回：官方话';
    });
    node.insertAdjacentElement('afterend', button);
  }
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
    const selected = state.selected.has(grade.subject);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'subject-chip';
    button.dataset.active = selected;
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    button.setAttribute('aria-label', `${selected ? '已选' : '未选'} · ${grade.subject} ${roundCourseScore(grade.score)}`);
    button.textContent = `${grade.subject} ${roundCourseScore(grade.score)}`;
    button.addEventListener('click', () => toggleSubject(grade.subject));
    els.subjectPicker.append(button);
  }
}

function toggleSubject(subject) {
  if (state.selected.has(subject)) {
    state.selected.delete(subject);
  } else {
    if (state.selected.size >= 4) {
      setStatus('最多选择四科，先取消一科再选择新的', 'bad');
      return;
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
  updateDetailTabSelection();
  renderTable();
  renderAssignmentChart();
}

function updateDetailTabSelection() {
  if (!els.detailTabs) return;
  const selectedGrades = getSelectedGrades();
  const activeIndex = Math.max(0, selectedGrades.findIndex((grade) => grade.subject === state.detailSubject));
  els.detailTabs.style.setProperty('--detail-index', String(activeIndex));
  for (const button of els.detailTabs.querySelectorAll('.detail-tab')) {
    const active = Number(button.dataset.index) === activeIndex;
    button.dataset.active = String(active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
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
  els.detailTabs.style.setProperty('--detail-count', String(Math.max(selectedGrades.length, 1)));
  if (!selectedGrades.length) {
    els.detailTabs.style.setProperty('--detail-index', '0');
    const empty = document.createElement('p');
    empty.className = 'muted inline-empty';
    empty.textContent = '左侧选择展示的科目后，这里会出现四个切换标签。';
    els.detailTabs.append(empty);
    return;
  }
  const activeIndex = Math.max(0, selectedGrades.findIndex((grade) => grade.subject === state.detailSubject));
  els.detailTabs.style.setProperty('--detail-index', String(activeIndex));
  for (const [index, grade] of selectedGrades.entries()) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'detail-tab';
    button.dataset.index = String(index);
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
  els.predictionCourse.disabled = !state.grades.length;
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
  els.predictionCategory.disabled = !categories.length;
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
    els.predictionDelta.textContent = '暂无可预测作业';
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
    cell.colSpan = 5;
    cell.className = 'empty-detail';
    cell.textContent = state.grades.length ? '选择展示的四门课后，这里会显示对应小成绩。' : '抓取成绩后显示小成绩明细。';
    row.append(cell);
    els.gradeRows.append(row);
    return;
  }

  if (!grade.assignments.length) {
    const row = document.createElement('tr');
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
    appendCell(row, item.category);
    appendCell(row, item.title || '—');
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
  table.innerHTML = '<thead><tr><th>作业</th><th>描述</th><th>得分</th><th>百分比</th><th>权重</th></tr></thead>';
  const body = document.createElement('tbody');
  for (const item of grade.assignments) {
    const row = document.createElement('tr');
    appendCell(row, item.category);
    appendCell(row, item.title || '—');
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
    const description = item.description ? ' · ' + item.description : '';
    detail.textContent = item.title + description + ' | weight ' + roundHundredths(item.displayWeight) + '% | score ' + roundHundredths(item.scorePercent) + '% | ' + formatPoints(item.assignment);
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
    row.title = item.title + (item.description ? ' · ' + item.description : '') + ' · 占比 ' + roundHundredths(item.displayWeight) + '% · 实得 ' + roundHundredths(item.scorePercent) + '%';
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
      title: item.category || item.title || '未命名作业',
      description: item.title || '',
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
    const hasGradeChanges = hasSnapshotGradeChanges(latest, snapshot);
    if (!hasGradeChanges) {
      setHistoryStatus('没有发现成绩变化', 'ok');
      renderHistoryChart(decrypted);
      return;
    }

    await saveEncryptedSnapshot(await encryptSnapshot(snapshot, key, records[0].salt));
    renderHistoryChart([...decrypted, snapshot]);
    if (!changes.length) {
      setHistoryStatus('成绩有变化，没有新增/删去成绩', 'ok');
      return;
    }
    setHistoryStatus('发现新增/删去成绩', 'ok');
    showRevealModal(changes, latest, snapshot);
  } catch (error) {
    if (error.name === 'OperationError') {
      setHistoryStatus('历史解不开，密码和第一次建立历史时不完全一样。', 'bad');
      if (els.historyChart) els.historyChart.innerHTML = '<p class="muted chart-empty">成绩已正常抓取，但历史记录解不开。可能是第一次输入密码时多了空格、换了密码，或这个浏览器里已有旧历史。可以删除所有历史后重新抓取建立新基准。</p>';
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
  const passphrase = normalizeEmail(email) + '\n' + normalizePasswordForHistory(password);
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
        category: String(item.category || '').trim() || String(item.title || '').trim() || '未命名作业',
        title: String(item.title || '').trim(),
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
    const oldAssignments = new Map(oldCourse.assignments.map((item) => [assignmentKey(item), item]));
    const newAssignments = new Map(newCourse.assignments.map((item) => [assignmentKey(item), item]));
    for (const item of newCourse.assignments) {
      const oldItem = oldAssignments.get(assignmentKey(item));
      if (!oldItem) {
        changes.push(createChange('new-assignment', newCourse.subject, item.category || item.title, oldCourse, newCourse, null, item, oldAverage, newAverage));
      }
    }
    for (const item of oldCourse.assignments) {
      if (!newAssignments.has(assignmentKey(item))) {
        changes.push(createChange('deleted-assignment', newCourse.subject, item.category || item.title, oldCourse, newCourse, item, null, oldAverage, newAverage));
      }
    }
  }
  return changes;
}

function hasSnapshotGradeChanges(oldSnapshot, newSnapshot) {
  const oldCourses = new Map(oldSnapshot.grades.map((grade) => [grade.subject, grade]));
  const newCourses = new Map(newSnapshot.grades.map((grade) => [grade.subject, grade]));
  if (oldCourses.size !== newCourses.size) return true;
  for (const [subject, newCourse] of newCourses) {
    const oldCourse = oldCourses.get(subject);
    if (!oldCourse) return true;
    if (Math.abs((newCourse.score || 0) - (oldCourse.score || 0)) >= 0.01) return true;
    const oldAssignments = new Map(oldCourse.assignments.map((item) => [assignmentKey(item), item]));
    const newAssignments = new Map(newCourse.assignments.map((item) => [assignmentKey(item), item]));
    if (oldAssignments.size !== newAssignments.size) return true;
    for (const [key, newItem] of newAssignments) {
      const oldItem = oldAssignments.get(key);
      if (!oldItem) return true;
      if (Math.abs((newItem.scorePercent || 0) - (oldItem.scorePercent || 0)) >= 0.01) return true;
      if (Math.abs((newItem.itemWeight || 0) - (oldItem.itemWeight || 0)) >= 0.01) return true;
      if (valueChanged(newItem.earned, oldItem.earned)) return true;
      if (valueChanged(newItem.possible, oldItem.possible)) return true;
    }
  }
  return false;
}

function valueChanged(nextValue, previousValue) {
  if (nextValue === null || previousValue === null) return nextValue !== previousValue;
  return Math.abs(Number(nextValue) - Number(previousValue)) >= 0.01;
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
    hint.textContent = describeChangeType(change.type) + ' · ' + (change.title || '未命名成绩');
    summary.append(title, hint);
    const badge = document.createElement('span');
    badge.className = 'reveal-badge';
    badge.textContent = change.type === 'deleted-assignment' ? '删去' : '新增';
    item.append(summary, badge);

    const details = document.createElement('details');
    details.className = 'reveal-details';
    details.open = state.revealedChanges.has(index);
    const detailsSummary = document.createElement('summary');
    detailsSummary.textContent = '查看引起的变化';
    const secret = document.createElement('p');
    secret.className = 'reveal-secret muted';
    secret.textContent = revealText(change);
    details.append(detailsSummary, secret);
    details.addEventListener('toggle', () => {
      if (details.open) state.revealedChanges.add(index);
      else state.revealedChanges.delete(index);
    });
    item.append(details);
    els.revealList.append(item);
  });
}

function revealText(change) {
  const pieces = [];
  if (change.type === 'new-assignment' && change.newItem) {
    pieces.push('新增成绩：' + roundHundredths(change.newItem.scorePercent) + '%，权重 ' + roundHundredths(change.newItem.itemWeight) + '%，得分 ' + formatSnapshotPoints(change.newItem));
  }
  if (change.type === 'deleted-assignment' && change.oldItem) {
    pieces.push('删去成绩：' + roundHundredths(change.oldItem.scorePercent) + '%，权重 ' + roundHundredths(change.oldItem.itemWeight) + '%，得分 ' + formatSnapshotPoints(change.oldItem));
  }
  pieces.push('科目总分 ' + roundHundredths(change.oldCourse.score) + '% -> ' + roundHundredths(change.newCourse.score) + '%');
  if (change.oldAverage && change.newAverage) {
    pieces.push('四科均分 ' + change.oldAverage.rounded + ' -> ' + change.newAverage.rounded + '，未四舍五入 ' + roundHundredths(change.oldAverage.raw) + ' -> ' + roundHundredths(change.newAverage.raw));
  }
  return pieces.join('；');
}

function describeChangeType(type) {
  return {
    'new-assignment': '新增成绩',
    'deleted-assignment': '删去成绩'
  }[type] || '成绩变化';
}

function formatSnapshotPoints(item) {
  if (item.earned !== null && item.possible !== null) return roundHundredths(item.earned) + ' / ' + roundHundredths(item.possible);
  if (item.earned !== null) return String(roundHundredths(item.earned));
  return '--';
}

function renderHistoryChart(snapshots = state.historySnapshots, options = {}) {
  if (!els.historyChart) return;
  hideHistoryTooltip(true);
  const receivedSnapshots = arguments.length > 0;
  if (receivedSnapshots) {
    state.historySnapshots = Array.isArray(snapshots) ? snapshots : [];
    state.historyIsDemo = options.demo === true;
    if (!state.historyIsDemo) state.historyLiveSnapshots = state.historySnapshots;
  }
  snapshots = state.historySnapshots;
  updateHistoryDemoControls();

  const subjects = historySubjects(snapshots);
  renderHistorySubjectOptions(subjects);
  if (!snapshots.length || !subjects.length) {
    els.historyChart.removeAttribute('data-tone');
    els.historyChart.innerHTML = '<p class="muted chart-empty">暂无历史记录。</p>';
    if (els.historySummary) els.historySummary.hidden = true;
    return;
  }

  if (!subjects.includes(state.historySubject)) state.historySubject = subjects[0];
  renderHistorySubjectOptions(subjects);
  const subject = state.historySubject;
  const points = [];
  for (const snapshot of snapshots) {
    const grade = snapshot.grades.find((item) => item.subject === subject);
    if (!grade) continue;
    const previousPoint = points.at(-1);
    if (!previousPoint || Math.abs(grade.score - previousPoint.score) >= 0.01) {
      points.push({ snapshot, score: grade.score });
    }
  }
  if (!points.length) return;
  const width = Math.max(920, points.length * 38 + 78);
  const height = 310;
  const plot = { left: 54, right: 24, top: 28, bottom: 46 };

  const scores = points.map((point) => point.score);
  let minScore = Math.floor((Math.min(...scores) - 3) / 5) * 5;
  let maxScore = Math.ceil((Math.max(...scores) + 3) / 5) * 5;
  minScore = Math.max(0, minScore);
  maxScore = Math.min(120, maxScore);
  if (maxScore - minScore < 10) {
    minScore = Math.max(0, minScore - 5);
    maxScore = Math.min(120, maxScore + 5);
  }
  const chartRange = Math.max(1, maxScore - minScore);
  const xFor = (index) => plot.left + (points.length === 1 ? 0.5 : index / (points.length - 1)) * (width - plot.left - plot.right);
  const yFor = (score) => height - plot.bottom - ((score - minScore) / chartRange) * (height - plot.top - plot.bottom);
  points.forEach((point, index) => {
    point.x = xFor(index);
    point.y = yFor(point.score);
  });

  const firstScore = points[0].score;
  const lastScore = points.at(-1).score;
  const periodDelta = roundHundredths(lastScore - firstScore);
  const tone = periodDelta > 0 ? 'gain' : periodDelta < 0 ? 'loss' : 'flat';
  els.historyChart.dataset.tone = tone;
  renderHistorySummary(points, periodDelta);

  const linePath = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  const areaPath = `${linePath} L ${points.at(-1).x} ${height - plot.bottom} L ${points[0].x} ${height - plot.bottom} Z`;
  const lineSegments = points.slice(1).map((point, index) => {
    const previousPoint = points[index];
    const delta = point.score - previousPoint.score;
    const segmentTone = delta > 0 ? 'gain' : delta < 0 ? 'loss' : 'flat';
    return `<path class="history-line" data-tone="${segmentTone}" d="M ${previousPoint.x} ${previousPoint.y} L ${point.x} ${point.y}"></path>`;
  }).join('');
  const gridLines = Array.from({ length: 5 }, (_, index) => {
    const score = maxScore - (chartRange * index / 4);
    const y = yFor(score);
    return `<line class="history-grid" x1="${plot.left}" y1="${y}" x2="${width - plot.right}" y2="${y}"></line><text class="history-label history-y-label" x="${plot.left - 10}" y="${y + 4}">${roundHundredths(score)}</text>`;
  }).join('');
  const labelIndexes = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  const dateLabels = labelIndexes.map((pointIndex) => {
    const point = points[pointIndex];
    return `<text class="history-label history-date-label" x="${point.x}" y="${height - 16}">${escapeHtml(formatHistoryDate(point.snapshot.capturedAt, false))}</text>`;
  }).join('');
  const pointSpacing = points.length > 1 ? Math.abs(points[1].x - points[0].x) : width - plot.left - plot.right;
  const eventHitWidth = clamp(pointSpacing * 0.72, 28, 68);
  const eventTargets = points.map((point, index) => {
    const events = historyEventsForPoint(points, index, subject);
    const pointDelta = index ? point.score - points[index - 1].score : 0;
    const pointTone = pointDelta > 0 ? 'gain' : pointDelta < 0 ? 'loss' : 'flat';
    const label = `${subject} ${roundHundredths(point.score)}%，${formatHistoryDate(point.snapshot.capturedAt, true)}，${events.join('；')}`;
    return `<g class="history-event-target" data-point-index="${index}" data-tone="${pointTone}" tabindex="0" role="button" aria-label="${escapeHtml(label)}">
      <rect class="history-event-hitbox" x="${point.x - eventHitWidth / 2}" y="${plot.top}" width="${eventHitWidth}" height="${height - plot.top - plot.bottom}"></rect>
      <line class="history-event-line" x1="${point.x}" y1="${plot.top}" x2="${point.x}" y2="${height - plot.bottom}"></line>
      <circle class="history-point" cx="${point.x}" cy="${point.y}" r="5"></circle>
    </g>`;
  }).join('');

  els.historyChart.innerHTML = `
    <svg class="history-svg" style="min-width: ${width}px" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(subject)}成绩历史走势">
      <defs>
        <linearGradient id="historyAreaGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="currentColor" stop-opacity="0.28"></stop>
          <stop offset="100%" stop-color="currentColor" stop-opacity="0"></stop>
        </linearGradient>
      </defs>
      ${gridLines}
      <path class="history-area" d="${areaPath}"></path>
      ${lineSegments}
      ${eventTargets}
      ${dateLabels}
    </svg>`;
  bindHistoryPointTooltips(points, subject);
}

function historySubjects(snapshots) {
  const subjects = [];
  const newestFirst = [...snapshots].reverse();
  for (const snapshot of newestFirst) {
    for (const grade of snapshot.grades) {
      if (!subjects.includes(grade.subject)) subjects.push(grade.subject);
    }
  }
  return subjects;
}

function renderHistorySubjectOptions(subjects) {
  if (!els.historySubjectSelect) return;
  els.historySubjectSelect.replaceChildren();
  if (!subjects.length) {
    const option = document.createElement('option');
    option.textContent = '抓取成绩后选择';
    els.historySubjectSelect.append(option);
    els.historySubjectSelect.disabled = true;
    return;
  }
  if (!subjects.includes(state.historySubject)) state.historySubject = subjects[0];
  for (const subject of subjects) {
    const option = document.createElement('option');
    option.value = subject;
    option.textContent = subject;
    option.selected = subject === state.historySubject;
    els.historySubjectSelect.append(option);
  }
  els.historySubjectSelect.disabled = false;
}

function renderHistorySummary(points, periodDelta) {
  if (!els.historySummary) return;
  const latest = points.at(-1);
  const previous = points.at(-2);
  const latestDelta = previous ? roundHundredths(latest.score - previous.score) : 0;
  els.historySummary.hidden = false;
  els.historySummary.dataset.tone = latestDelta > 0 ? 'gain' : latestDelta < 0 ? 'loss' : 'flat';
  els.historySummary.innerHTML = `
    <strong>${roundHundredths(latest.score)}%</strong>
    <span>${formatSignedScore(latestDelta)} 本次</span>
    <small>${formatSignedScore(periodDelta)} 区间 · ${points.length} 个节点</small>`;
}

function historyEventsForPoint(points, index, subject) {
  const current = points[index]?.snapshot;
  const previous = points[index - 1]?.snapshot;
  if (!current) return [];
  if (!previous) return ['建立历史基准'];
  const currentGrade = current.grades.find((grade) => grade.subject === subject);
  const previousGrade = previous.grades.find((grade) => grade.subject === subject);
  if (!currentGrade || !previousGrade) return ['科目开始出现在历史记录中'];

  const events = [];
  const oldAssignments = new Map(previousGrade.assignments.map((item) => [assignmentKey(item), item]));
  const newAssignments = new Map(currentGrade.assignments.map((item) => [assignmentKey(item), item]));
  for (const [key, item] of newAssignments) {
    const oldItem = oldAssignments.get(key);
    const title = historyAssignmentName(item);
    if (!oldItem) {
      events.push(`新增「${title}」：${roundHundredths(item.scorePercent)}%`);
      continue;
    }
    if (valueChanged(item.scorePercent, oldItem.scorePercent)) events.push(`「${title}」改分：${roundHundredths(oldItem.scorePercent)}% → ${roundHundredths(item.scorePercent)}%`);
    if (valueChanged(item.earned, oldItem.earned) || valueChanged(item.possible, oldItem.possible)) events.push(`「${title}」得分更新：${formatSnapshotPoints(oldItem)} → ${formatSnapshotPoints(item)}`);
    if (valueChanged(item.itemWeight, oldItem.itemWeight)) events.push(`「${title}」权重更新：${roundHundredths(oldItem.itemWeight)}% → ${roundHundredths(item.itemWeight)}%`);
  }
  for (const [key, item] of oldAssignments) {
    if (!newAssignments.has(key)) events.push(`移除「${historyAssignmentName(item)}」`);
  }
  return events.length ? events : ['本次快照没有可识别的作业事件'];
}

function historyAssignmentName(item) {
  return item.title || item.category || '未命名成绩';
}

function bindHistoryPointTooltips(points, subject) {
  const tooltip = els.historyTooltip;
  if (!tooltip) return;
  const show = (node, pointIndex) => {
    const point = points[pointIndex];
    const previousPoint = points[pointIndex - 1];
    const deltaValue = previousPoint ? roundHundredths(point.score - previousPoint.score) : 0;
    const tone = deltaValue > 0 ? 'gain' : deltaValue < 0 ? 'loss' : 'flat';
    const events = historyEventsForPoint(points, pointIndex, subject);
    const rect = node.getBoundingClientRect();
    tooltip.replaceChildren();
    tooltip.dataset.tone = tone;
    const quote = document.createElement('div');
    quote.className = 'history-tooltip-quote';
    const score = document.createElement('strong');
    score.textContent = `${roundHundredths(point.score)}%`;
    const delta = document.createElement('span');
    delta.className = 'history-tooltip-delta';
    delta.textContent = `${deltaValue === 0 ? '±0' : formatSignedScore(deltaValue)} 点`;
    quote.append(score, delta);
    const date = document.createElement('time');
    date.dateTime = point.snapshot.capturedAt;
    date.textContent = formatHistoryDate(point.snapshot.capturedAt, true);
    const list = document.createElement('ul');
    for (const event of events) {
      const item = document.createElement('li');
      item.textContent = event;
      list.append(item);
    }
    tooltip.append(quote, date, list);
    tooltip.style.visibility = 'hidden';
    tooltip.hidden = false;
    tooltip.style.transform = 'none';
    const tooltipWidth = tooltip.offsetWidth;
    const tooltipHeight = tooltip.offsetHeight;
    const left = clamp(rect.left + rect.width / 2 - tooltipWidth / 2, 12, Math.max(12, window.innerWidth - tooltipWidth - 12));
    const above = rect.top - tooltipHeight - 12;
    const below = rect.bottom + 12;
    const top = clamp(above >= 12 ? above : below, 12, Math.max(12, window.innerHeight - tooltipHeight - 12));
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.style.visibility = 'visible';
  };
  for (const node of els.historyChart.querySelectorAll('.history-event-target')) {
    const pointIndex = Number(node.dataset.pointIndex);
    const anchor = node.querySelector('.history-point') || node;
    node.addEventListener('pointerenter', (event) => {
      if (event.pointerType === 'mouse' && !state.historyTooltipPinned) {
        cancelHistoryTooltipHide();
        show(anchor, pointIndex);
      }
    });
    node.addEventListener('pointerleave', scheduleHistoryTooltipHide);
    node.addEventListener('focus', () => {
      if (!state.historyTooltipPinned) show(anchor, pointIndex);
    });
    node.addEventListener('blur', scheduleHistoryTooltipHide);
    node.addEventListener('click', (event) => {
      event.preventDefault();
      const isSamePinnedPoint = state.historyTooltipPinned && state.historyTooltipPoint === pointIndex;
      if (isSamePinnedPoint) {
        hideHistoryTooltip(true);
        return;
      }
      state.historyTooltipPinned = true;
      state.historyTooltipPoint = pointIndex;
      show(anchor, pointIndex);
    });
  }
}

function hideHistoryTooltip(force) {
  if (!els.historyTooltip || (!force && state.historyTooltipPinned)) return;
  cancelHistoryTooltipHide();
  els.historyTooltip.hidden = true;
  els.historyTooltip.style.visibility = '';
  if (force) {
    state.historyTooltipPinned = false;
    state.historyTooltipPoint = -1;
  }
}

function scheduleHistoryTooltipHide() {
  if (state.historyTooltipPinned) return;
  cancelHistoryTooltipHide();
  state.historyTooltipHideTimer = window.setTimeout(() => hideHistoryTooltip(false), 240);
}

function cancelHistoryTooltipHide() {
  if (state.historyTooltipHideTimer === null) return;
  window.clearTimeout(state.historyTooltipHideTimer);
  state.historyTooltipHideTimer = null;
}

function formatHistoryDate(value, includeTime) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未知时间';
  return new Intl.DateTimeFormat('zh-CN', includeTime
    ? { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { month: 'numeric', day: 'numeric' }
  ).format(date);
}

function formatSignedScore(value) {
  const number = roundHundredths(value);
  return `${number > 0 ? '+' : ''}${number}`;
}

function updateHistoryDemoControls() {
  if (els.loadExampleHistoryButton) els.loadExampleHistoryButton.hidden = state.historyIsDemo;
  if (els.exitExampleHistoryButton) els.exitExampleHistoryButton.hidden = !state.historyIsDemo;
}

function createExampleHistory() {
  const dayOffsets = [42, 35, 28, 21, 14, 9, 4, 0];
  const courses = [
    { subject: 'AP Calculus AB', scores: [84.2, 84.2, 85.4, 88.7, 88.7, 89.5, 92.1, 93.4], events: ['Limits Quiz', 'Derivative Check', 'Unit 2 Test', 'Related Rates', 'Curve Sketching', 'Optimization Quiz', 'Mock Exam', 'Final Review'] },
    { subject: 'English Literature', scores: [91.4, 91.4, 92.2, 93.1, 92.6, 92.6, 95.1, 94.7], events: ['Poetry Response', 'Close Reading', 'Hamlet Essay', 'Seminar', 'Timed Writing', 'Research Draft', 'Presentation', 'Final Essay'] },
    { subject: 'Physics', scores: [78.8, 81.3, 83.9, 83.9, 85.6, 87.4, 86.9, 89.2], events: ['Motion Lab', 'Kinematics Quiz', 'Forces Test', 'Friction Lab', 'Energy Quiz', 'Momentum Test', 'Waves Lab', 'Unit Exam'] },
    { subject: 'Economics', scores: [88.5, 89.2, 91.8, 91.8, 92.4, 93.7, 92.9, 94.1], events: ['Supply Quiz', 'Market Graphs', 'Elasticity Test', 'Policy Brief', 'GDP Quiz', 'Inflation Case', 'Trade Debate', 'Macro Exam'] }
  ];
  const now = new Date();
  return dayOffsets.map((daysAgo, snapshotIndex) => ({
    capturedAt: new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, 16, 30).toISOString(),
    grades: courses.map((course, courseIndex) => ({
      subject: course.subject,
      score: course.scores[snapshotIndex],
      assignments: course.events.slice(0, snapshotIndex + 1).filter((_, eventIndex) => !(courseIndex === 2 && snapshotIndex >= 6 && eventIndex === 1)).map((title, eventIndex) => {
        const baseScore = 76 + ((courseIndex * 11 + eventIndex * 7) % 23);
        const revisedScore = eventIndex === 0 && snapshotIndex >= 4 ? Math.min(100, baseScore + 7) : baseScore;
        return {
          category: `Unit ${Math.floor(eventIndex / 2) + 1}`,
          title,
          earned: revisedScore,
          possible: 100,
          scorePercent: revisedScore,
          itemWeight: 8 + (eventIndex % 3) * 2
        };
      })
    }))
  }));
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

function normalizePasswordForHistory(password) {
  return String(password || '').trim();
}

async function loadChangelog() {
  if (changelogLoaded || !els.changelogList) return;
  changelogLoaded = true;
  els.changelogList.replaceChildren(createChangelogMessage('正在读取 GitHub 历史…'));

  try {
    const response = await fetch(CHANGELOG_API, {
      headers: { Accept: 'application/vnd.github+json' }
    });
    if (!response.ok) throw new Error('GitHub request failed');
    const commits = await response.json();
    if (!Array.isArray(commits) || !commits.length) throw new Error('No commits returned');

    const fragment = document.createDocumentFragment();
    for (const item of commits) fragment.append(createChangelogItem(item));
    els.changelogList.replaceChildren(fragment);
    if (els.changelogBuild) {
      els.changelogBuild.firstChild.textContent = commits.length + ' commits · ' + String(commits[0].sha).slice(0, 7);
    }
  } catch {
    const message = createChangelogMessage('');
    const link = document.createElement('a');
    link.href = CHANGELOG_URL;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = '无法加载记录，在 GitHub 查看完整历史';
    message.append(link);
    els.changelogList.replaceChildren(message);
    changelogLoaded = false;
  }
}

function createChangelogItem(item) {
  const row = document.createElement('li');
  const dateValue = item.commit?.author?.date || item.commit?.committer?.date || '';
  const date = document.createElement('time');
  date.dateTime = dateValue;
  date.textContent = dateValue ? dateValue.slice(0, 10).replaceAll('-', '.') : 'Unknown';

  const content = document.createElement('div');
  const title = document.createElement('a');
  title.className = 'changelog-title';
  title.href = item.html_url || CHANGELOG_URL;
  title.target = '_blank';
  title.rel = 'noopener noreferrer';
  title.textContent = String(item.commit?.message || 'Untitled commit').split('\n')[0];

  const meta = document.createElement('p');
  meta.className = 'changelog-meta';
  const hash = document.createElement('code');
  hash.textContent = String(item.sha || '').slice(0, 7);
  meta.append(hash, document.createTextNode(' · ' + (item.commit?.author?.name || 'GitHub')));
  content.append(title, meta);
  row.append(date, content);
  return row;
}

function createChangelogMessage(text) {
  const row = document.createElement('li');
  row.className = 'changelog-loading';
  row.textContent = text;
  return row;
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
  const password = normalizePasswordForHistory(els.password.value);
  try {
    const response = await fetch('/api/scrape', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '抓取失败');
    updateGrades(data);
    await storeBrowserCredential(email, password);
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
els.historySubjectSelect?.addEventListener('change', () => {
  state.historySubject = els.historySubjectSelect.value;
  renderHistoryChart();
});
els.copyLayoutButton?.addEventListener('click', copyLayoutLink);
els.settingsButton?.addEventListener('click', openSettings);
els.settingsCloseButton?.addEventListener('click', closeSettings);
els.settingsModal?.addEventListener('click', (event) => {
  if (event.target === els.settingsModal) closeSettings();
});
for (const option of els.themeOptions) {
  option.addEventListener('change', () => {
    if (option.checked) applyTheme(option.value);
  });
}
for (const option of els.marketModeOptions) {
  option.addEventListener('change', () => {
    if (option.checked) applyMarketMode(option.value);
  });
}
els.loadExampleHistoryButton?.addEventListener('click', () => {
  renderHistoryChart(createExampleHistory(), { demo: true });
  setHistoryStatus('正在预览范例数据', 'ok');
  closeSettings();
  els.historyChart?.scrollIntoView({ behavior: 'smooth', block: 'center' });
});
els.exitExampleHistoryButton?.addEventListener('click', () => {
  renderHistoryChart(state.historyLiveSnapshots, { demo: false });
  setHistoryStatus(state.historyLiveSnapshots.length ? '已恢复真实历史' : '等待抓取', state.historyLiveSnapshots.length ? 'ok' : '');
  closeSettings();
});
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
  if (document.documentElement.dataset.themeChoice === 'system') applyTheme('system', false);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !els.settingsModal?.hidden) closeSettings();
  if (event.key === 'Escape') hideHistoryTooltip(true);
});
document.addEventListener('pointerdown', (event) => {
  if (!event.target.closest?.('.history-event-target, .history-tooltip')) hideHistoryTooltip(true);
});
window.addEventListener('resize', () => hideHistoryTooltip(true));
document.addEventListener('scroll', (event) => {
  if (event.target !== els.historyTooltip) hideHistoryTooltip(true);
}, true);
els.historyTooltip?.addEventListener('pointerenter', cancelHistoryTooltipHide);
els.historyTooltip?.addEventListener('pointerleave', scheduleHistoryTooltipHide);
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
    state.historySnapshots = [];
    state.historyLiveSnapshots = [];
    state.historyIsDemo = false;
    renderHistorySubjectOptions([]);
    updateHistoryDemoControls();
    if (els.historySummary) els.historySummary.hidden = true;
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

els.changelogCard?.addEventListener('toggle', () => {
  if (els.changelogCard.open) loadChangelog();
});

setupHumanTranslations();
loadBrowserCredential();

render();
