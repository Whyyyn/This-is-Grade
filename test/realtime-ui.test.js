import test from 'node:test';
import assert from 'node:assert/strict';
import { createRealtimeController, realtimeRequirements, registerPushWorker } from '../public/realtime-ui.js';
import { onRequestGet, onRequestDelete } from '../functions/api/realtime.js';

const readyInputs = () => ({ supported: true, permission: 'default', email: 'student@example.com', password: 'secret', inviteCode: 'invite' });
const readyStatus = () => ({ configured: true, enrolled: false, enabled: false });
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function fixture(overrides = {}) {
  const inputs = readyInputs();
  const frames = [];
  const calls = [];
  const controller = createRealtimeController({
    getInputs: () => inputs,
    render: (frame) => frames.push(frame),
    readStatus: async () => readyStatus(),
    enable: async () => { calls.push('enable'); return { slot: 2 }; },
    disable: async () => { calls.push('disable'); },
    ...overrides
  });
  return { controller, inputs, frames, calls, view: () => frames.at(-1) };
}

test('push setup waits for an active worker after registration completes', async () => {
  const ready = deferred();
  const registration = { active: {} };
  let completed = false;
  const operation = registerPushWorker({
    register: async (path) => { assert.equal(path, '/sw.js'); return { active: null }; },
    ready: ready.promise
  }).then((result) => { completed = true; return result; });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(completed, false);
  ready.resolve(registration);
  assert.equal(await operation, registration);
});

test('worker initialization reports a timeout or registration failure instead of hanging setup', async () => {
  await assert.rejects(registerPushWorker({ register: async () => ({}), ready: new Promise(() => {}) }, 5), /初始化超时/);
  await assert.rejects(registerPushWorker({ register: async () => { throw new Error('Registration failed'); } }), /Registration failed/);
});

test('blocks new enrollment for every locally checkable prerequisite', () => {
  const state = { ...readyStatus(), known: true, loading: false };
  const inputs = readyInputs();
  assert.deepEqual(realtimeRequirements(state, inputs), []);
  for (const patch of [{ supported: false }, { permission: 'denied' }, { email: 'broken@' }, { email: 'a b@example.com' }, { password: ' ' }, { inviteCode: ' ' }]) {
    assert.ok(realtimeRequirements(state, { ...inputs, ...patch }).length > 0, JSON.stringify(patch));
  }
  for (const patch of [{ loading: true }, { known: false }, { configured: false }, { cleanupRequired: true }]) {
    assert.ok(realtimeRequirements({ ...state, ...patch }, inputs).length > 0, JSON.stringify(patch));
  }
  assert.equal(realtimeRequirements({ ...state, enrolled: true }, { ...inputs, inviteCode: '' }).length, 0);
});

test('checking status and editing fields never requests enrollment, and empty invite disables checking', async () => {
  const f = fixture();
  f.inputs.inviteCode = '';
  await f.controller.load();
  assert.equal(f.view().toggleDisabled, true);
  await f.controller.setEnabled(true);
  assert.deepEqual(f.calls, []);
  f.inputs.inviteCode = 'invite';
  f.controller.updatePrerequisites();
  assert.equal(f.view().toggleDisabled, false);
  assert.deepEqual(f.calls, []);
});

test('shows immediate progress, ignores duplicate clicks, and only checks after enable succeeds', async () => {
  const operation = deferred();
  let calls = 0;
  const f = fixture({ enable: () => { calls++; return operation.promise; } });
  await f.controller.load();
  const pending = f.controller.setEnabled(true);
  assert.equal(f.view().busy, 'enable');
  assert.equal(f.view().enabled, false);
  assert.equal(f.view().toggleDisabled, true);
  assert.match(f.view().message, /正在启用/);
  await f.controller.setEnabled(true);
  await f.controller.load();
  assert.equal(calls, 1);
  operation.resolve({ slot: 2 });
  await pending;
  assert.equal(f.view().enabled, true);
  assert.equal(f.view().tone, 'ok');
  assert.equal(f.view().toggleDisabled, false);
});

test('failed enabling stays unchecked and requires cleanup if rollback was incomplete', async () => {
  const f = fixture({ enable: async () => { throw Object.assign(new Error('邀请码无效，清理失败'), { cleanupRequired: true }); } });
  await f.controller.load();
  await f.controller.setEnabled(true);
  assert.equal(f.view().enabled, false);
  assert.equal(f.view().tone, 'bad');
  assert.match(f.view().message, /邀请码无效/);
  assert.equal(f.view().toggleDisabled, true);
  assert.equal(f.view().canCleanup, true);
  await f.controller.setEnabled(false);
  assert.equal(f.view().cleanupRequired, false);
  assert.equal(f.view().canEnable, true);
});

test('active notifications can be disabled with missing credentials and revoked permission', async () => {
  const operation = deferred();
  const f = fixture({ readStatus: async () => ({ ...readyStatus(), enrolled: true, enabled: true, slot: 1 }), disable: () => operation.promise });
  Object.assign(f.inputs, { email: '', password: '', inviteCode: '', supported: false, permission: 'denied' });
  await f.controller.load();
  assert.equal(f.view().enabled, true);
  assert.equal(f.view().toggleDisabled, false);
  assert.equal(f.view().canCleanup, true);
  const pending = f.controller.setEnabled(false);
  assert.match(f.view().message, /正在关闭/);
  assert.equal(f.view().enabled, true);
  operation.resolve();
  await pending;
  assert.equal(f.view().enabled, false);
  assert.equal(f.view().enrolled, false);
});

test('paused accounts recover without an invite and can be removed when service config is unavailable', async () => {
  const f = fixture({ readStatus: async () => ({ ...readyStatus(), enrolled: true, slot: 2 }) });
  f.inputs.inviteCode = '';
  await f.controller.load();
  assert.match(f.view().message, /已暂停/);
  assert.equal(f.view().canEnable, true);
  await f.controller.setEnabled(true);
  assert.equal(f.view().enabled, true);
  const paused = fixture({ readStatus: async () => ({ configured: false, enrolled: true, enabled: false, slot: 2 }) });
  await paused.controller.load();
  assert.equal(paused.view().canEnable, false);
  assert.equal(paused.view().canCleanup, true);
  await paused.controller.setEnabled(false);
  assert.deepEqual(paused.calls, ['disable']);
});

test('status errors can be retried, and stale reads cannot overwrite a completed cleanup', async () => {
  let count = 0;
  const late = deferred();
  const f = fixture({ readStatus: async () => {
    count++;
    if (count === 1) throw new Error('网络故障');
    if (count === 2) return { ...readyStatus(), enrolled: true, enabled: true, slot: 2 };
    return late.promise;
  } });
  await f.controller.load();
  assert.equal(f.view().toggleDisabled, true);
  assert.match(f.view().message, /网络故障/);
  await f.controller.load();
  assert.equal(f.view().enabled, true);
  const reading = f.controller.load();
  await f.controller.setEnabled(false);
  late.resolve({ ...readyStatus(), enrolled: true, enabled: true, slot: 2 });
  await reading;
  assert.equal(f.view().enabled, false);
  assert.equal(f.view().enrolled, false);
});

test('local cleanup failure does not claim the server is still enabled after server removal', async () => {
  const f = fixture({
    readStatus: async () => ({ ...readyStatus(), enrolled: true, enabled: true, slot: 2 }),
    disable: async () => { throw Object.assign(new Error('浏览器清理失败'), { serverRemoved: true }); }
  });
  await f.controller.load();
  await f.controller.setEnabled(false);
  assert.equal(f.view().enabled, false);
  assert.equal(f.view().enrolled, false);
  assert.equal(f.view().canCleanup, true);
  assert.equal(f.view().toggleDisabled, true);
});

function apiContext({ env = {}, body, failSql = '', missingTable = '' } = {}) {
  const statements = [];
  return {
    statements,
    env: {
      DB: { prepare(sql) { return { bind() { return this; }, async first() { if (missingTable && sql.includes(missingTable)) throw new Error('no such table'); return null; }, async run() { statements.push(sql); if (sql.includes(failSql) && failSql) throw new Error('DB unavailable'); } }; } },
      WEBTESS_CREDENTIALS_KEY: 'a'.repeat(32),
      BETA_INVITE_CODES: 'a,b,c,d,e',
      VAPID_PUBLIC_KEY: 'B'.repeat(87),
      ...env
    },
    request: new Request('https://grades.example/api/realtime', body ? { method: 'DELETE', body: JSON.stringify(body) } : {})
  };
}

test('server preflight requires all Pages configuration but never exposes invite codes or credentials', async () => {
  const good = await (await onRequestGet(apiContext())).json();
  assert.equal(good.configured, true);
  assert.equal(good.publicKey.length, 87);
  assert.equal('BETA_INVITE_CODES' in good, false);
  for (const env of [{ WEBTESS_CREDENTIALS_KEY: 'short' }, { BETA_INVITE_CODES: 'a,b,c,d' }, { BETA_INVITE_CODES: 'a,a,b,c,d' }, { VAPID_PUBLIC_KEY: '' }]) {
    assert.equal((await (await onRequestGet(apiContext({ env }))).json()).configured, false);
  }
});

test('new devices cannot start setup while either notification database table is missing', async () => {
  for (const missingTable of ['realtime_beta_accounts', 'push_subscriptions']) {
    const response = await onRequestGet(apiContext({ missingTable }));
    assert.equal(response.status, 500);
    assert.match((await response.json()).error, /尚未迁移/);
  }
});

test('cleanup removes both server records, while failed recovery can preserve the invite slot', async () => {
  const deviceId = '1234567890-1234567890';
  const normal = apiContext({ body: { deviceId } });
  assert.equal((await onRequestDelete(normal)).status, 200);
  assert.match(normal.statements[0], /DELETE FROM realtime_beta_accounts/);
  assert.match(normal.statements[1], /DELETE FROM push_subscriptions/);
  const preserve = apiContext({ body: { deviceId, preserveEnrollment: true } });
  assert.equal((await onRequestDelete(preserve)).status, 200);
  assert.match(preserve.statements[0], /UPDATE realtime_beta_accounts SET enabled = 0/);
  assert.match(preserve.statements[1], /DELETE FROM push_subscriptions/);
  const failure = apiContext({ body: { deviceId }, failSql: 'realtime_beta_accounts' });
  assert.equal((await onRequestDelete(failure)).status, 500);
  assert.equal(failure.statements.length, 1);
});

test('a failed cleanup retry retains its lock until cleanup actually succeeds', async () => {
  const f = fixture({
    enable: async () => { throw Object.assign(new Error('Rollback incomplete'), { cleanupRequired: true }); },
    disable: async () => { throw new Error('Network unavailable'); }
  });
  await f.controller.load();
  await f.controller.setEnabled(true);
  await f.controller.setEnabled(false);
  assert.equal(f.view().cleanupRequired, true);
  assert.equal(f.view().canEnable, false);
  assert.equal(f.view().canCleanup, true);
});
