import webpush from 'web-push';
import { calculateEffortProgress, isEffortColumn } from '../public/effort-progress.js';
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
    await sendDueNotifications(env, new Date(controller.scheduledTime));
    await runRealtimeChecks(env, new Date(controller.scheduledTime));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return Response.json({ ok: true, configured: hasVapidConfig(env) });
    }
    if (url.pathname === '/test-scheduled' && env.ALLOW_TEST_ENDPOINT === 'true') {
      const now = new Date();
      const reminders = await sendDueNotifications(env, now);
      const realtime = await runRealtimeChecks(env, now);
      return Response.json({ reminders, realtime });
    }
    return new Response('Not found', { status: 404 });
  }
};

export async function sendDueNotifications(env, now = new Date()) {
  requireEnvironment(env);
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);

  const query = await env.DB.prepare(
    `SELECT device_id, endpoint, p256dh, auth, timezone, notify_time,
            weekdays_only, progress_json, last_sent_local_date, updated_at
     FROM push_subscriptions
     WHERE enabled = 1
     ORDER BY updated_at DESC
     LIMIT 1000`
  ).all();

  const due = (query.results || []).filter((row) => isSubscriptionDue(row, now));
  const results = await Promise.allSettled(due.map((row) => sendOne(env.DB, row, now)));
  return {
    checked: (query.results || []).length,
    due: due.length,
    sent: results.filter((result) => result.status === 'fulfilled' && result.value === 'sent').length,
    removed: results.filter((result) => result.status === 'fulfilled' && result.value === 'removed').length,
    failed: results.filter((result) => result.status === 'rejected').length
  };
}

export async function runRealtimeChecks(env, now = new Date()) {
  requireEnvironment(env);
  const secret = requireRealtimeSecret(env);
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  const query = await env.DB.prepare(
    `SELECT b.slot, b.device_id, b.timezone, b.state_iv, b.state_ciphertext,
            b.consecutive_failures, p.endpoint, p.p256dh, p.auth, p.progress_json
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
    const progressJson = refreshEffortProgress(row.progress_json, scraped.grades);
    await db.batch([
      db.prepare(
        `UPDATE realtime_beta_accounts SET
           state_iv = ?, state_ciphertext = ?, consecutive_failures = 0,
           last_error_code = NULL, last_checked_at = ?, last_success_at = ?, updated_at = ?
         WHERE device_id = ?`
      ).bind(sealed.iv, sealed.ciphertext, checkedAt, checkedAt, checkedAt, row.device_id),
      db.prepare(
        'UPDATE push_subscriptions SET progress_json = ?, updated_at = ? WHERE device_id = ?'
      ).bind(progressJson, checkedAt, row.device_id)
    ]);
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

function refreshEffortProgress(progressJson, grades) {
  const saved = parseProgress(progressJson);
  return JSON.stringify(saved.map((item) => {
    const grade = (grades || []).find((candidate) => normalizeSubject(candidate.subject) === normalizeSubject(item.subject));
    const effort = grade?.assignments?.find(isEffortColumn);
    return effort && Number.isFinite(Number(effort.scorePercent))
      ? { ...item, current: roundTwo(Number(effort.scorePercent)) }
      : item;
  }));
}

function normalizeSubject(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, '');
}

function classifyRealtimeError(error) {
  const text = String(error?.message || '').toLowerCase();
  if (text.includes('no gradebook') || text.includes('logged in')) return 'login_or_session';
  if (text.includes('decrypt') || text.includes('operationerror')) return 'encrypted_state';
  return 'fetch_failed';
}

export function isSubscriptionDue(row, now) {
  const local = localParts(now, row.timezone);
  if (!local) return false;
  if (row.weekdays_only && ['Sat', 'Sun'].includes(local.weekday)) return false;
  if (local.time !== row.notify_time) return false;
  return row.last_sent_local_date !== local.date;
}

export function createNotificationPayload(row, now) {
  const local = localParts(now, row.timezone);
  const localToday = local ? new Date(`${local.date}T12:00:00Z`) : now;
  const saved = parseProgress(row.progress_json);
  const progress = saved
    .map((item) => {
      const calculated = calculateEffortProgress(item.endDate, item.current, localToday);
      return calculated ? {
        ...item,
        expected: roundTwo(calculated.expectedMark),
        difference: roundTwo(calculated.difference),
        complete: calculated.complete
      } : null;
    })
    .filter(Boolean)
    .filter((item) => !item.complete)
    .sort((a, b) => a.difference - b.difference);

  if (!progress.length) {
    return {
      title: '核心素养进度提醒',
      body: '打开 This is Grade 抓取一次成绩，即可更新今天的完整进度提醒。',
      tag: 'effort-progress',
      url: '/'
    };
  }

  const item = progress[0];
  const suffix = progress.length > 1 ? ` · 另有 ${progress.length - 1} 科` : '';
  const comparison = item.difference < 0
    ? `落后 ${roundTwo(Math.abs(item.difference))} 分`
    : item.difference > 0
      ? `领先 ${roundTwo(item.difference)} 分`
      : '已达到今日目标';
  return {
    title: item.difference < 0 ? '核心素养进度落后' : '核心素养进度正常',
    body: `${item.subject} 最近分数 ${roundTwo(item.current)}，今日应有 ${roundTwo(item.expected)}，${comparison}${suffix}。`,
    tag: 'effort-progress',
    url: '/'
  };
}

async function sendOne(db, row, now) {
  const subscription = {
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth }
  };
  try {
    await webpush.sendNotification(subscription, JSON.stringify(createNotificationPayload(row, now)), {
      TTL: 60 * 60 * 12,
      urgency: 'normal',
      topic: 'effort-progress'
    });
    const local = localParts(now, row.timezone);
    await db.prepare(
      'UPDATE push_subscriptions SET last_sent_local_date = ?, updated_at = updated_at WHERE device_id = ?'
    ).bind(local.date, row.device_id).run();
    return 'sent';
  } catch (error) {
    if ([404, 410].includes(Number(error?.statusCode))) {
      await db.prepare('DELETE FROM push_subscriptions WHERE device_id = ?').bind(row.device_id).run();
      return 'removed';
    }
    throw error;
  }
}

function localParts(date, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return {
      date: `${values.year}-${values.month}-${values.day}`,
      time: `${values.hour}:${values.minute}`,
      weekday: values.weekday
    };
  } catch {
    return null;
  }
}

function parseProgress(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function hasVapidConfig(env) {
  return Boolean(env?.VAPID_SUBJECT && env?.VAPID_PUBLIC_KEY && env?.VAPID_PRIVATE_KEY);
}

function requireEnvironment(env) {
  if (!env?.DB) throw new Error('DB binding is required.');
  if (!hasVapidConfig(env)) throw new Error('VAPID_SUBJECT, VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are required.');
}

function roundTwo(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}
