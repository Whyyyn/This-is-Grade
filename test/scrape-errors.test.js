import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../functions/api/scrape.js';
import { scrapeGradesWithSession } from '../functions/_lib/webtess.js';

const coursePage = `<table><tr><td><button onclick="getGradebookByStudent('1,2,3,4')">4</button></td><td>Math</td></tr></table>`;
const loginPage = `<form name='webgenstart'><input type="password" name="password"></form>`;
const credentials = { email: 'student@example.com', password: 'private-password' };

async function requestGrades() {
  return onRequestPost({
    request: new Request('https://grade.example/api/scrape', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials)
    }),
    env: {}
  });
}

test('reports upstream HTTP failures without blaming credentials or exposing upstream content', async (t) => {
  for (const [status, expectedCode] of [[403, 'upstream_denied'], [429, 'upstream_rate_limited'], [503, 'upstream_http'], [525, 'upstream_http']]) {
    await t.test(String(status), async (t) => {
      t.mock.method(globalThis, 'fetch', async () => new Response('private-password student@example.com', { status }));
      const logs = t.mock.method(console, 'warn', () => {});
      const response = await requestGrades();
      const body = await response.json();
      assert.equal(body.code, expectedCode);
      assert.equal(response.status, status === 429 ? 503 : 502);
      assert.doesNotMatch(JSON.stringify(body) + JSON.stringify(logs.mock.calls), /private-password|student@example.com/);
      assert.equal(logs.mock.calls[0].arguments[1].upstreamStatus, status);
      assert.equal(logs.mock.calls[0].arguments[1].stage, 'login');
    });
  }
});

test('distinguishes network errors and timeouts without leaking the original exception', async (t) => {
  for (const [name, expectedCode, status] of [['TypeError', 'upstream_network', 502], ['TimeoutError', 'upstream_timeout', 504]]) {
    await t.test(name, async (t) => {
      t.mock.method(globalThis, 'fetch', async () => { throw Object.assign(new Error('private-password'), { name }); });
      const logs = t.mock.method(console, 'warn', () => {});
      const response = await requestGrades();
      const body = await response.json();
      assert.equal(body.code, expectedCode);
      assert.equal(response.status, status);
      assert.doesNotMatch(JSON.stringify(body) + JSON.stringify(logs.mock.calls), /private-password/);
    });
  }
});

test('bounds redirect loops and rejects redirects to another host before fetching it', async (t) => {
  for (const location of ['https://harts.systems/webtess/login', 'https://other.example/']) {
    await t.test(location, async (t) => {
      const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 302, headers: { location } }));
      await assert.rejects(scrapeGradesWithSession(credentials), { code: 'upstream_redirect' });
      assert.ok(fetch.mock.callCount() <= 6);
      assert.ok(fetch.mock.calls.every((call) => new URL(call.arguments[0]).hostname === 'harts.systems'));
    });
  }
});

test('recovers an expired saved session and retains cookies across login redirects', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.includes('/login')) {
      assert.equal(new Headers(options.headers).get('Cookie'), 'JSESSIONID=expired');
      return new Response(null, { status: 302, headers: { location: 'parent.jsp', 'Set-Cookie': 'JSESSIONID=fresh; Path=/webtess; HttpOnly' } });
    }
    const cookie = new Headers(options.headers).get('Cookie');
    if (url.includes('/gradebook')) {
      assert.equal(cookie, 'JSESSIONID=fresh');
      return new Response('<stavg>92.5</stavg>');
    }
    return new Response(cookie === 'JSESSIONID=expired' ? loginPage : coursePage);
  });
  const result = await scrapeGradesWithSession({ ...credentials, sessionCookie: 'JSESSIONID=expired' });
  assert.equal(result.sessionCookie, 'JSESSIONID=fresh');
  assert.equal(result.grades[0].score, 92.5);
  assert.equal(result.authenticatedWithPassword, true);
  assert.equal(fetch.mock.calls.filter((call) => call.arguments[0].endsWith('/login')).length, 1);
});

test('distinguishes a login page returned in place of a gradebook from missing marks', async (t) => {
  for (const [gradebook, code] of [[loginPage, 'login_required'], ['', 'marks_not_found']]) {
    await t.test(code, async (t) => {
      t.mock.method(globalThis, 'fetch', async (url) => new Response(url.includes('/gradebook') ? gradebook : coursePage));
      await assert.rejects(scrapeGradesWithSession(credentials), { code, stage: 'gradebook' });
    });
  }
});

test('does not expose unexpected server exception details', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const response = await onRequestPost({ request: { json: async () => { throw new Error('private-password'); } } });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: '查询服务暂时异常，请稍后重试。', code: 'internal_error' });
});

test('classifies a timeout while receiving the course page body', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => url.includes('/login')
    ? new Response('ok')
    : { ok: true, status: 200, headers: new Headers(), text: async () => { throw new DOMException('body timed out', 'AbortError'); } });
  await assert.rejects(scrapeGradesWithSession(credentials), { code: 'upstream_timeout', stage: 'courses' });
});
