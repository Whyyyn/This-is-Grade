import webpush from 'web-push';
import { scrapeGradesWithSession } from '../functions/_lib/webtess.js';
import {
  compactGradeSnapshot,
  createGradeChangePayload,
  diffGradeSnapshots,
  isRealtimeCheckDue,
  openRealtimeState,
  requireRealtimeSecret,
  sealRealtimeState
} from '../functions/_lib/realtime.js';

export default {
  async scheduled(controller, env) {
    await runRealtimeChecks(env, new Date(controller.scheduledTime));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return Response.json({ ok: true, configured: hasVapidConfig(env) });
    }
    if (url.pathname === '/test-scheduled' && env.ALLOW_TEST_ENDPOINT === 'true') {
      return Response.json({ realtime: await runRealtimeChecks(env, new Date()) });
    }
    return new Response('Not found', { status: 404 });
  }
};

export async function runRealtimeChecks(env, now = new Date()) {
  requireEnvironment(env);
  const secret = requireRealtimeSecret(env);
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  const query = await env.DB.prepare(
    `SELECT b.slot, b.device_id, b.timezone, b.state_iv, b.state_ciphertext,
            b.consecutive_failures, p.endpoint, p.p256dh, p.auth
     FROM realtime_beta_accounts b
     JOIN push_subscriptions p ON p.device_id = b.device_id AND p.enabled = 1
     WHERE b.enabled = 1
     ORDER BY b.slot
     LIMIT 5`
  ).all();
  const due = (query.results || []).filter((row) => isRealtimeCheckDue(row, now));
  const results = [];
  for (const row of due) results.push(await checkRealtimeAccount(env.DB, row, secret, now));
  return {
    checked: results.length,
    changed: results.filter((result) => result === 'changed').length,
    unchanged: results.filter((result) => result === 'unchanged').length,
    failed: results.filter((result) => result === 'failed').length,
    paused: results.filter((result) => result === 'paused').length
  };
}

async function checkRealtimeAccount(db, row, secret, now) {
  const checkedAt = now.toISOString();
  try {
    const state = await openRealtimeState(row, secret, row.device_id);
    const scraped = await scrapeGradesWithSession({
      email: state.email,
      password: state.password,
      sessionCookie: state.sessionCookie || ''
    });
    const snapshot = compactGradeSnapshot(scraped.grades);
    const changes = diffGradeSnapshots(state.snapshot || [], snapshot);

    if (changes.length) {
      const pushResult = await sendRealtimeNotification(db, row, createGradeChangePayload(changes));
      if (pushResult === 'removed') return 'paused';
    }

    const sealed = await sealRealtimeState({
      ...state,
      sessionCookie: scraped.sessionCookie,
      snapshot
    }, secret, row.device_id);
    await db.prepare(
      `UPDATE realtime_beta_accounts SET
         state_iv = ?, state_ciphertext = ?, consecutive_failures = 0,
         last_error_code = NULL, last_checked_at = ?, last_success_at = ?, updated_at = ?
       WHERE device_id = ?`
    ).bind(sealed.iv, sealed.ciphertext, checkedAt, checkedAt, checkedAt, row.device_id).run();
    return changes.length ? 'changed' : 'unchanged';
  } catch (error) {
    const failures = Number(row.consecutive_failures || 0) + 1;
    const shouldPause = failures >= 3;
    await db.prepare(
      `UPDATE realtime_beta_accounts SET
         consecutive_failures = ?, last_error_code = ?, last_checked_at = ?,
         enabled = ?, updated_at = ? WHERE device_id = ?`
    ).bind(failures, classifyRealtimeError(error), checkedAt, shouldPause ? 0 : 1, checkedAt, row.device_id).run();
    if (shouldPause) {
      await sendRealtimeNotification(db, row, {
        title: '即时成绩通知已暂停',
        body: 'WebTESS 连续三次登录或抓取失败。请打开 This is Grade，重新抓取并启用即时通知。',
        tag: 'realtime-paused',
        url: '/'
      }).catch(() => null);
      return 'paused';
    }
    return 'failed';
  }
}

async function sendRealtimeNotification(db, row, payload) {
  try {
    await webpush.sendNotification({
      endpoint: row.endpoint,
      keys: { p256dh: row.p256dh, auth: row.auth }
    }, JSON.stringify(payload), {
      TTL: 60 * 60 * 24,
      urgency: 'high',
      topic: String(payload.tag || 'grade-change').slice(0, 32)
    });
    return 'sent';
  } catch (error) {
    if ([404, 410].includes(Number(error?.statusCode))) {
      await db.batch([
        db.prepare('DELETE FROM realtime_beta_accounts WHERE device_id = ?').bind(row.device_id),
        db.prepare('DELETE FROM push_subscriptions WHERE device_id = ?').bind(row.device_id)
      ]);
      return 'removed';
    }
    throw error;
  }
}

function classifyRealtimeError(error) {
  const text = String(error?.message || '').toLowerCase();
  if (text.includes('no gradebook') || text.includes('logged in')) return 'login_or_session';
  if (text.includes('decrypt') || text.includes('operationerror')) return 'encrypted_state';
  return 'fetch_failed';
}

function hasVapidConfig(env) {
  return Boolean(env?.VAPID_SUBJECT && env?.VAPID_PUBLIC_KEY && env?.VAPID_PRIVATE_KEY);
}

function requireEnvironment(env) {
  if (!env?.DB) throw new Error('DB binding is required.');
  if (!hasVapidConfig(env)) throw new Error('VAPID_SUBJECT, VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are required.');
}
