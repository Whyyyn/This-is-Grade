export const EFFORT_BASELINE = 30;
export const EFFORT_TARGET = 100;
export const TERM_CALENDAR_DAYS = 63;

const EFFORT_PHRASES = [
  'corecompetency',
  'corecompetencies',
  'learningbehavior',
  'learningbehaviour',
  'classdojo'
];

export function normalizeEffortText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '');
}

export function isEffortColumn(item) {
  const haystack = normalizeEffortText([
    item?.category,
    item?.title,
    item?.description
  ].filter(Boolean).join(' '));
  return EFFORT_PHRASES.some((phrase) => haystack.includes(phrase));
}

export function sortEffortColumnsFirst(assignments) {
  return assignments
    .map((assignment, index) => ({ assignment, index }))
    .sort((left, right) => {
      const effortOrder = Number(isEffortColumn(right.assignment)) - Number(isEffortColumn(left.assignment));
      return effortOrder || left.index - right.index;
    })
    .map(({ assignment }) => assignment);
}

export function defaultTermEndDate(today = new Date()) {
  return formatDateInput(addCalendarDays(startOfDay(today), TERM_CALENDAR_DAYS - 1));
}

export function calculateEffortProgress(endDateValue, currentMark, today = new Date()) {
  const end = parseDateInput(endDateValue);
  if (!end) return null;

  const start = addCalendarDays(end, -(TERM_CALENDAR_DAYS - 1));
  const currentDay = startOfDay(today);
  const scheduleDay = currentDay < start ? addCalendarDays(start, -1) : currentDay > end ? end : currentDay;
  const totalSchoolDays = countWeekdays(start, end);
  const completedSchoolDays = scheduleDay < start ? 0 : countWeekdays(start, scheduleDay);
  const expectedGain = (EFFORT_TARGET - EFFORT_BASELINE) * completedSchoolDays / totalSchoolDays;
  const expectedMark = EFFORT_BASELINE + expectedGain;
  const normalizedCurrentMark = clamp(Number(currentMark), 0, EFFORT_TARGET);
  const remainingStart = currentDay < start ? start : addCalendarDays(currentDay, 1);
  const remainingSchoolDays = currentDay >= end ? 0 : countWeekdays(remainingStart, end);
  const calendarDaysLeft = Math.max(0, Math.ceil((end.getTime() - currentDay.getTime()) / 86400000));
  const pointsLeft = Math.max(0, EFFORT_TARGET - normalizedCurrentMark);

  return {
    start,
    end,
    currentMark: normalizedCurrentMark,
    expectedMark: clamp(expectedMark, EFFORT_BASELINE, EFFORT_TARGET),
    expectedGain,
    totalSchoolDays,
    completedSchoolDays,
    remainingSchoolDays,
    calendarDaysLeft,
    pointsLeft,
    dailyPointsNeeded: remainingSchoolDays ? pointsLeft / remainingSchoolDays : pointsLeft ? null : 0,
    difference: normalizedCurrentMark - expectedMark,
    complete: currentDay >= end
  };
}

export function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateInput(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (date.getFullYear() !== Number(match[1]) || date.getMonth() !== Number(match[2]) - 1 || date.getDate() !== Number(match[3])) return null;
  return date;
}

function countWeekdays(start, end) {
  if (start > end) return 0;
  let total = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) total += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return total;
}

function startOfDay(value) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addCalendarDays(value, days) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
