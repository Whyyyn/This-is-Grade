const numericFields = ['scorePercent', 'earned', 'possible', 'itemWeight'];

function normalize(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function cents(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round((number + Number.EPSILON) * 100) : null;
}

function changed(before, after) {
  return cents(before) !== cents(after);
}

function textKey(item) {
  return JSON.stringify([normalize(item.category), normalize(item.title)]);
}

// IDs take precedence. Text matching also reads older history without IDs, and
// consumes each row once so repeated assignment names never collapse in a Map.
export function matchAssignments(previous = [], current = []) {
  const matchedBefore = new Set();
  const matchedAfter = new Map();

  function matchBy(key, eligible = () => true) {
    const buckets = new Map();
    previous.forEach((item, index) => {
      if (matchedBefore.has(index)) return;
      const value = key(item);
      if (!value) return;
      if (!buckets.has(value)) buckets.set(value, []);
      buckets.get(value).push(index);
    });
    current.forEach((item, index) => {
      if (matchedAfter.has(index)) return;
      const bucket = buckets.get(key(item));
      if (!bucket) return;
      const offset = bucket.findIndex((priorIndex) => eligible(previous[priorIndex], item));
      if (offset < 0) return;
      const [priorIndex] = bucket.splice(offset, 1);
      matchedBefore.add(priorIndex);
      matchedAfter.set(index, previous[priorIndex]);
    });
  }

  matchBy((item) => String(item.id || '').trim());
  const legacyMatch = (before, after) => !before.id || !after.id;
  // Preserve unchanged duplicates even if their order changed, before pairing
  // remaining text-only rows whose marks may have changed.
  matchBy((item) => JSON.stringify([textKey(item), ...numericFields.map((field) => cents(item[field]))]), legacyMatch);
  matchBy(textKey, legacyMatch);

  return {
    pairs: current.map((newItem, index) => ({ oldItem: matchedAfter.get(index) || null, newItem })),
    removed: previous.filter((_, index) => !matchedBefore.has(index))
  };
}

// Shared by the browser history and the background notification worker. Return
// the full change list; presentation layers decide how many events to display.
export function diffGradeSnapshots(previous = [], current = []) {
  const beforeCourses = new Map(previous.map((grade) => [normalize(grade.subject), grade]));
  const afterCourses = new Set(current.map((grade) => normalize(grade.subject)));
  const changes = [];
  for (const newCourse of current) {
    const oldCourse = beforeCourses.get(normalize(newCourse.subject));
    const base = { subject: newCourse.subject, oldCourse: oldCourse || null, newCourse };
    const add = (type, label, before, after, oldItem = null, newItem = null) => {
      changes.push({ ...base, type, label, before, after, oldItem, newItem });
    };
    if (!oldCourse) {
      add('course-added', '课程成绩', null, newCourse.score);
      continue;
    }
    if (changed(oldCourse.score, newCourse.score)) add('course-score', '总评', oldCourse.score, newCourse.score);
    const { pairs, removed } = matchAssignments(oldCourse.assignments, newCourse.assignments);
    for (const { oldItem, newItem } of pairs) {
      const label = newItem.category || newItem.title || '成绩项目';
      if (!oldItem) {
        add('assignment-added', label, null, newItem.scorePercent, null, newItem);
        continue;
      }
      if (changed(oldItem.scorePercent, newItem.scorePercent)) {
        add('assignment-score', label, oldItem.scorePercent, newItem.scorePercent, oldItem, newItem);
      }
      if (changed(oldItem.earned, newItem.earned) || changed(oldItem.possible, newItem.possible)) {
        add('assignment-points', label,
          { earned: oldItem.earned, possible: oldItem.possible },
          { earned: newItem.earned, possible: newItem.possible }, oldItem, newItem);
      }
      // Old realtime snapshots did not contain weights. Establish the baseline
      // on their next check instead of reporting every weight as newly changed.
      if (oldItem.itemWeight !== undefined && newItem.itemWeight !== undefined && changed(oldItem.itemWeight, newItem.itemWeight)) {
        add('assignment-weight', label, oldItem.itemWeight, newItem.itemWeight, oldItem, newItem);
      }
    }
    for (const oldItem of removed) {
      add('assignment-removed', oldItem.category || oldItem.title || '成绩项目', oldItem.scorePercent, null, oldItem);
    }
  }
  for (const oldCourse of previous) {
    if (!afterCourses.has(normalize(oldCourse.subject))) {
      changes.push({ type: 'course-removed', subject: oldCourse.subject, label: '课程成绩',
        before: oldCourse.score, after: null, oldCourse, newCourse: null, oldItem: null, newItem: null });
    }
  }
  return changes;
}
