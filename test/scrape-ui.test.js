import test from 'node:test';
import assert from 'node:assert/strict';
import { createScrapeController } from '../public/scrape-ui.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const inputs = { email: 'student@example.com', password: 'secret' };
const result = { grades: [{ subject: 'Math', score: 85 }] };
function fixture(overrides = {}) {
  const calls = [];
  const controller = createScrapeController({
    scrape: async () => { calls.push('scrape'); return result; },
    updateGrades: (grades) => calls.push(['grades', grades]),
    updateHistory: async () => { calls.push('history'); },
    saveCredential: async () => 'saved',
    onStart: () => calls.push('start'),
    onSuccess: () => calls.push('success'),
    onNotice: (notice) => calls.push(['notice', notice]),
    onError: (error) => calls.push(['error', error.message]),
    onBusy: (busy) => calls.push(['busy', busy]),
    ...overrides
  });
  return { controller, calls };
}

test('duplicate submissions are ignored through both scraping and history saving', async () => {
  const request = deferred();
  const history = deferred();
  let requests = 0;
  const f = fixture({ scrape: () => { requests++; return request.promise; }, updateHistory: () => history.promise });
  const pending = f.controller.submit(inputs);
  await f.controller.submit({ ...inputs, email: 'other@example.com' });
  assert.equal(requests, 1);
  request.resolve(result);
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(f.calls.some((call) => Array.isArray(call) && call[0] === 'grades'));
  await f.controller.submit(inputs);
  assert.equal(requests, 1);
  assert.deepEqual(f.calls.filter((call) => Array.isArray(call) && call[0] === 'busy'), [['busy', true]]);
  history.resolve();
  await pending;
  await f.controller.submit(inputs);
  assert.equal(requests, 2);
  assert.deepEqual(f.calls.at(-1), ['busy', false]);
});

test('request failure releases controls without updating grades or history', async () => {
  const f = fixture({ scrape: async () => { throw new Error('WebTESS unavailable'); } });
  await f.controller.submit(inputs);
  assert.ok(f.calls.some((call) => Array.isArray(call) && call[0] === 'error'));
  assert.equal(f.calls.includes('history'), false);
  assert.equal(f.calls.some((call) => Array.isArray(call) && call[0] === 'grades'), false);
  assert.deepEqual(f.calls.at(-1), ['busy', false]);
});

test('timed-out requests are aborted and late responses cannot replace a successful retry', async () => {
  const slow = deferred();
  let signal;
  let requests = 0;
  const f = fixture({
    timeoutMs: 5,
    scrape: (_, requestSignal) => { signal = requestSignal; return ++requests === 1 ? slow.promise : result; }
  });
  await f.controller.submit(inputs);
  assert.equal(signal.aborted, true);
  assert.ok(f.calls.some((call) => Array.isArray(call) && call[0] === 'error' && /超时/.test(call[1])));
  await f.controller.submit(inputs);
  slow.resolve({ grades: [{ subject: 'Old result', score: 1 }] });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(f.calls.filter((call) => Array.isArray(call) && call[0] === 'grades'), [['grades', result.grades]]);
});

test('password-manager delays never block history and stale notices never replace a later attempt', async () => {
  const credential = deferred();
  let saves = 0;
  const f = fixture({ saveCredential: () => ++saves === 1 ? credential.promise : Promise.resolve('saved') });
  await f.controller.submit(inputs);
  assert.ok(f.calls.includes('history'));
  assert.deepEqual(f.calls.at(-1), ['busy', false]);
  await f.controller.submit(inputs);
  credential.resolve('failed');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.calls.some((call) => Array.isArray(call) && call[0] === 'notice'), false);
});

test('credential-store rejection is reported without failing the scrape', async () => {
  const f = fixture({ saveCredential: async () => { throw new Error('Browser declined'); } });
  await f.controller.submit(inputs);
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(f.calls.includes('success'));
  assert.ok(f.calls.includes('history'));
  assert.ok(f.calls.some((call) => Array.isArray(call) && call[0] === 'notice' && call[1] === 'failed'));
  assert.equal(f.calls.some((call) => Array.isArray(call) && call[0] === 'error'), false);
});

test('a history failure releases controls so another refresh can run', async () => {
  const f = fixture({ updateHistory: async () => { throw new Error('History unavailable'); } });
  await f.controller.submit(inputs);
  assert.ok(f.calls.some((call) => Array.isArray(call) && call[0] === 'error' && call[1] === 'History unavailable'));
  assert.deepEqual(f.calls.at(-1), ['busy', false]);
  await f.controller.submit(inputs);
  assert.equal(f.calls.filter((call) => call === 'scrape').length, 2);
});
