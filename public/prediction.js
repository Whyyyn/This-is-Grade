export function getPredictionCategories(grade) {
  if (!grade) return [];
  const groups = new Map();
  for (const item of grade.assignments || []) {
    // Match the two-decimal weight shown in the assignment table.
    const itemWeight = Math.round((item.itemWeight + Number.EPSILON) * 100) / 100;
    const key = 'weight:' + itemWeight;
    if (!groups.has(key)) groups.set(key, { key, itemWeight, items: [], weight: 0 });
    const group = groups.get(key);
    group.items.push(item);
    group.weight += item.itemWeight;
  }
  return [...groups.values()].sort((a, b) => b.itemWeight - a.itemWeight);
}

export function predictCourseScore(grade, categoryKey, newScore) {
  if (!grade || !Number.isFinite(grade.score) || !Number.isFinite(newScore)) return null;
  const category = getPredictionCategories(grade).find((item) => item.key === categoryKey);
  if (!category || !category.items.length) return null;
  const currentAverage = category.items.reduce((sum, item) => sum + item.scorePercent, 0) / category.items.length;
  const nextAverage = (category.items.reduce((sum, item) => sum + item.scorePercent, 0) + newScore) / (category.items.length + 1);
  const delta = category.weight * (nextAverage - currentAverage) / 100;
  return { score: Math.max(0, grade.score + delta), delta, category };
}
