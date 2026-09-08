import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotificationPayload, isSubscriptionDue } from '../workers/push-scheduler.js';

const baseRow = {
  timezone: 'Asia/Shanghai',
  notify_time: '18:00',
  weekdays_only: 1,
  last_sent_local_date: null,
  progress_json: JSON.stringify([{
    subject: 'Precalculus',
    source: 'Learning Behaviours',
    endDate: '2026-10-30',
    current: 32,
    expected: 0,
    difference: 0
  }])
};

test('sends at the stored local time even when the worker runs in UTC', () => {
  const mondayAtSixInShanghai = new Date('2026-09-07T10:00:00Z');
  assert.equal(isSubscriptionDue(baseRow, mondayAtSixInShanghai), true);
  assert.equal(isSubscriptionDue(baseRow, new Date('2026-09-07T10:05:00Z')), false);
});

test('does not duplicate a local-day notification or send on weekends', () => {
  const mondayAtSixInShanghai = new Date('2026-09-07T10:00:00Z');
  assert.equal(isSubscriptionDue({ ...baseRow, last_sent_local_date: '2026-09-07' }, mondayAtSixInShanghai), false);
  assert.equal(isSubscriptionDue(baseRow, new Date('2026-09-05T10:00:00Z')), false);
});

test('builds a fresh daily target from the saved score and term end date', () => {
  const payload = createNotificationPayload(baseRow, new Date('2026-09-07T10:00:00Z'));
  assert.equal(payload.title, '核心素养进度落后');
  assert.match(payload.body, /Precalculus 最近分数 32/);
  assert.match(payload.body, /今日应有/);
  assert.match(payload.body, /落后/);
});
