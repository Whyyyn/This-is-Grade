import test from 'node:test';
import assert from 'node:assert/strict';
import { storeBrowserCredential } from '../public/browser-credentials.js';

class Credential {
  constructor(values) { Object.assign(this, values); }
}

test('successful password saving uses the browser credential store', async () => {
  let saved;
  const result = await storeBrowserCredential('student@example.com', 'test-password', {
    Credential,
    credentials: { store: async (credential) => { saved = credential; } }
  });
  assert.equal(result, 'saved');
  assert.equal(saved.id, 'student@example.com');
  assert.equal(saved.password, 'test-password');
});

test('unsupported browsers and empty credentials skip saving', async () => {
  for (const [email, password, credentials, Constructor] of [
    ['student@example.com', 'test-password', {}, Credential],
    ['student@example.com', 'test-password', { store() { throw new Error('Must not save'); } }, null],
    ['', 'test-password', { store() { throw new Error('Must not save'); } }, Credential],
    ['student@example.com', '', { store() { throw new Error('Must not save'); } }, Credential]
  ]) {
    assert.equal(await storeBrowserCredential(email, password, { credentials, Credential: Constructor }), 'unsupported');
  }
});

test('browser refusal and synchronous errors do not throw into the scrape flow', async () => {
  for (const store of [
    () => { throw new Error('Browser declined'); },
    async () => { throw new Error('Browser declined'); }
  ]) {
    assert.equal(await storeBrowserCredential('student@example.com', 'test-password', {
      Credential, credentials: { store }
    }), 'failed');
  }
});

test('a password manager that never responds reaches the waiting limit', async () => {
  assert.equal(await storeBrowserCredential('student@example.com', 'test-password', {
    Credential,
    credentials: { store: () => new Promise(() => {}) },
    timeoutMs: 5
  }), 'timeout');
});

test('a late refusal after timeout is handled without an unhandled rejection', async () => {
  let reject;
  const result = await storeBrowserCredential('student@example.com', 'test-password', {
    Credential,
    credentials: { store: () => new Promise((resolve, no) => { reject = no; }) },
    timeoutMs: 5
  });
  assert.equal(result, 'timeout');
  reject(new Error('Late refusal'));
  await new Promise((resolve) => setImmediate(resolve));
});
