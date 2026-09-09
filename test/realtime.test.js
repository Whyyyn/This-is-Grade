import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compactGradeSnapshot,
  createGradeChangePayload,
  diffGradeSnapshots,
  isRealtimeCheckDue,
  openRealtimeState,
  resolveInviteSlot,
  sealRealtimeState
} from '../functions/_lib/realtime.js';

test('maps one of five configured invitation codes to a fixed slot', () => {
  const codes = 'alpha,beta,gamma,delta,epsilon';
  assert.equal(resolveInviteSlot('gamma', codes), 3);
  assert.throws(() => resolveInviteSlot('wrong', codes), /邀请码无效/);
});

test('runs a slot every five minutes between 06:00 and midnight, including weekends', () => {
  const weekendMorning = new Date('2026-09-06T00:15:00Z'); // 08:15 in Shanghai
  const slot = Math.floor(weekendMorning.getTime() / 60_000) % 5 + 1;
  assert.equal(isRealtimeCheckDue({ slot, timezone: 'Asia/Shanghai' }, weekendMorning), true);
  assert.equal(isRealtimeCheckDue({ slot: slot === 5 ? 1 : slot + 1, timezone: 'Asia/Shanghai' }, weekendMorning), false);

  const beforeWindow = new Date('2026-09-05T21:30:00Z'); // 05:30 in Shanghai
  const earlySlot = Math.floor(beforeWindow.getTime() / 60_000) % 5 + 1;
  assert.equal(isRealtimeCheckDue({ slot: earlySlot, timezone: 'Asia/Shanghai' }, beforeWindow), false);

  const lastMinute = new Date('2026-09-06T15:59:00Z'); // 23:59 in Shanghai
  const lastSlot = Math.floor(lastMinute.getTime() / 60_000) % 5 + 1;
  assert.equal(isRealtimeCheckDue({ slot: lastSlot, timezone: 'Asia/Shanghai' }, lastMinute), true);

  const midnight = new Date('2026-09-06T16:00:00Z'); // 00:00 in Shanghai
  const midnightSlot = Math.floor(midnight.getTime() / 60_000) % 5 + 1;
  assert.equal(isRealtimeCheckDue({ slot: midnightSlot, timezone: 'Asia/Shanghai' }, midnight), false);
});

test('encrypts the realtime state and binds it to the device id', async () => {
  const secret = 'a-local-test-secret-that-is-longer-than-thirty-two-characters';
  const state = { email: 'student@example.com', password: 'secret', sessionCookie: 'session', snapshot: [] };
  const sealed = await sealRealtimeState(state, secret, 'device-123');
  const opened = await openRealtimeState({ state_iv: sealed.iv, state_ciphertext: sealed.ciphertext }, secret, 'device-123');
  assert.deepEqual(opened, state);
  await assert.rejects(
    openRealtimeState({ state_iv: sealed.iv, state_ciphertext: sealed.ciphertext }, secret, 'another-device')
  );
});

test('detects course and assignment score changes and builds a concise push', () => {
  const previous = compactGradeSnapshot([{
    subject: 'Precalculus',
    score: 80,
    assignments: [{ id: '1', category: 'Learning Behaviours', scorePercent: 32 }]
  }]);
  const current = compactGradeSnapshot([{
    subject: 'Precalculus',
    score: 82,
    assignments: [{ id: '1', category: 'Learning Behaviours', scorePercent: 36 }]
  }]);
  const changes = diffGradeSnapshots(previous, current);
  assert.equal(changes.length, 2);
  const payload = createGradeChangePayload(changes);
  assert.equal(payload.title, 'WebTESS 成绩更新');
  assert.match(payload.body, /80% → 82%/);
  assert.match(payload.body, /32% → 36%/);
});

test('keeps assignment-only courses while their overall average is unpublished', () => {
  const previous = compactGradeSnapshot([{
    subject: 'English Studies 12',
    score: null,
    assignments: [{ id: 'quiz-1', category: 'Olympians Quiz', scorePercent: 100 }]
  }]);
  const current = compactGradeSnapshot([{
    subject: 'English Studies 12',
    score: null,
    assignments: [
      { id: 'quiz-1', category: 'Olympians Quiz', scorePercent: 100 },
      { id: 'week-1', category: 'Week 1', scorePercent: 100 }
    ]
  }]);

  assert.equal(previous.length, 1);
  assert.equal(previous[0].score, null);
  assert.equal(diffGradeSnapshots(previous, current).at(0)?.type, 'assignment-added');
});
