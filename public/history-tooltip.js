const round = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function changeTable(events, columns) {
  const table = element('table', 'history-change-table');
  const head = element('thead');
  const headings = element('tr');
  for (const label of columns) {
    const cell = element('th', '', label);
    cell.scope = 'col';
    headings.append(cell);
  }
  head.append(headings);
  const body = element('tbody');
  for (const event of events) {
    const row = element('tr');
    const title = element('th', '', event.title);
    title.scope = 'row';
    row.append(title);
    if (columns.length === 3) row.append(element('td', 'history-change-before', event.before));
    row.append(element('td', 'history-change-after', event.after));
    body.append(row);
  }
  table.append(head, body);
  return table;
}

export function renderHistoryTooltip(tooltip, { subject, score, previousScore, capturedAt, dateLabel, events, onClose }) {
  tooltip.replaceChildren();
  const header = element('div', 'history-tooltip-header');
  const context = element('div');
  context.append(element('strong', 'history-tooltip-subject', subject));
  const date = element('time', '', dateLabel);
  date.dateTime = capturedAt;
  context.append(date);
  const close = element('button', 'history-tooltip-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', '关闭成绩变化详情');
  close.addEventListener('click', onClose);
  header.append(context, close);

  const summary = element('div', 'history-tooltip-summary');
  const quote = element('div', 'history-tooltip-quote');
  quote.append(element('span', 'history-tooltip-label', '本次总评'), element('strong', '', `${round(score)}%`));
  const comparison = element('div', 'history-tooltip-comparison');
  if (Number.isFinite(previousScore)) {
    const delta = round(score - previousScore);
    const direction = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
    comparison.append(
      element('strong', 'history-tooltip-delta', `${direction} ${Math.abs(delta)} 个百分点`),
      element('span', 'history-tooltip-previous', `上次总评 ${round(previousScore)}%`)
    );
  } else {
    comparison.append(element('span', 'history-tooltip-previous', '首个记录，无上次总评'));
  }
  summary.append(quote, comparison);
  const changes = element('div', 'history-tooltip-changes');
  const sections = [
    { type: 'added', title: '新增成绩', icon: '+', columns: ['作业', '成绩'] },
    { type: 'score', title: '成绩修改', icon: '↻', columns: ['作业', '原成绩', '新成绩'] },
    { type: 'points', title: '得分修改', icon: '↻', columns: ['作业', '原得分', '新得分'] },
    { type: 'weight', title: '权重调整', icon: '⇄', columns: ['作业', '原权重', '新权重'] },
    { type: 'removed', title: '移除成绩', icon: '−', columns: ['作业', '原成绩'] }
  ];
  for (const section of sections) {
    const items = events.filter((event) => event.type === section.type);
    if (!items.length) continue;
    const block = element('section', 'history-change-section');
    block.dataset.type = section.type;
    const heading = element('h3', 'history-change-heading');
    const icon = element('span', 'history-change-icon', section.icon);
    icon.setAttribute('aria-hidden', 'true');
    heading.append(icon, element('span', '', section.title), element('span', 'history-change-count', `${items.length} 项`));
    block.append(heading);
    if (section.type === 'weight') block.append(element('p', 'history-weight-hint', '权重 = 这项成绩在总评中的占比'));
    block.append(changeTable(items, section.columns));
    changes.append(block);
  }
  for (const event of events.filter((event) => event.type === 'note')) {
    changes.append(element('p', 'history-tooltip-note', event.text));
  }
  tooltip.append(header, summary, changes);
}
