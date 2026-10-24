import { diffGradeSnapshots } from './grade-changes.js';

const round = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
function numericOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function sanitizeSnapshot(snapshot) {
  return {
    capturedAt: String(snapshot?.capturedAt || new Date().toISOString()),
    grades: Array.isArray(snapshot?.grades) ? snapshot.grades.map((grade) => ({
      subject: String(grade.subject || '').trim(),
      score: numericOrNull(grade.score),
      assignments: Array.isArray(grade.assignments) ? grade.assignments.map((item) => ({
        id: String(item.id || '').trim(),
        categoryId: String(item.categoryId || '').trim(),
        category: String(item.category || '').trim() || String(item.title || '').trim() || '未命名作业',
        title: String(item.title || '').trim(),
        earned: numericOrNull(item.earned),
        possible: numericOrNull(item.possible),
        // Preserve exact marks for perfect-grade celebrations.
        scorePercent: Number(item.scorePercent),
        itemWeight: Number(item.itemWeight) || 0
      })).filter((item) => Number.isFinite(item.scorePercent)) : []
    })).filter((grade) => grade.subject && (grade.score !== null || grade.assignments.length)) : []
  };
}

export function historyPoints(snapshots, subject) {
  const points = [];
  let previousGrade;
  for (const snapshot of snapshots) {
    const grade = snapshot.grades.find((item) => item.subject === subject);
    if (!grade || !Number.isFinite(grade.score)) continue;
    // Assignment changes still matter when the course total stays the same.
    if (!previousGrade || diffGradeSnapshots([previousGrade], [grade]).length) {
      points.push({ snapshot, score: grade.score });
      previousGrade = grade;
    }
  }
  return points;
}

function pointsLabel(item) {
  if (item.earned !== null && item.possible !== null) return `${round(item.earned)} / ${round(item.possible)}`;
  return item.earned !== null ? String(round(item.earned)) : '--';
}

export function historyEventsForPoint(points, index, subject) {
  const current = points[index]?.snapshot;
  const previous = points[index - 1]?.snapshot;
  if (!current) return [];
  if (!previous) return [{ type: 'note', text: '建立历史基准' }];
  const currentGrade = current.grades.find((grade) => grade.subject === subject);
  const previousGrade = previous.grades.find((grade) => grade.subject === subject);
  if (!currentGrade || !previousGrade) return [{ type: 'note', text: '科目开始出现在历史记录中' }];

  const events = [];
  for (const change of diffGradeSnapshots([previousGrade], [currentGrade])) {
    const { oldItem, newItem } = change;
    const item = newItem || oldItem;
    if (!item) continue;
    const title = item.title || item.category || '未命名成绩';
    const before = oldItem ? `${round(oldItem.scorePercent)}%` : '';
    const after = newItem ? `${round(newItem.scorePercent)}%` : '';
    switch (change.type) {
      case 'assignment-added':
        events.push({ type: 'added', title, after, text: `新增「${title}」：${after}` });
        break;
      case 'assignment-removed':
        events.push({ type: 'removed', title, after: before, text: `移除「${title}」` });
        break;
      case 'assignment-score':
        events.push({ type: 'score', title, before, after, text: `「${title}」改分：${before} → ${after}` });
        break;
      case 'assignment-points': {
        const before = pointsLabel(oldItem);
        const after = pointsLabel(newItem);
        events.push({ type: 'points', title, before, after, text: `「${title}」得分更新：${before} → ${after}` });
        break;
      }
      case 'assignment-weight': {
        const before = `${round(oldItem.itemWeight)}%`;
        const after = `${round(newItem.itemWeight)}%`;
        events.push({ type: 'weight', title, before, after, text: `「${title}」权重更新：${before} → ${after}` });
        break;
      }
    }
  }
  return events.length ? events : [{ type: 'note', text: '本次快照没有可识别的作业事件' }];
}
