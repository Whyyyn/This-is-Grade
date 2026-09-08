import { scrapeGradesWithSession } from '../_lib/webtess.js';
import {
  compactGradeSnapshot,
  requireRealtimeSecret,
  resolveInviteSlot,
  sealRealtimeState
} from '../_lib/realtime.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

export async function onRequestOptions() {
  return new Response(null, { headers: JSON_HEADERS });
}

export async function onRequestGet(context) {
  try {
    assertSameOrigin(context.request);
    const db = requireDb(context.env);
    const rawDeviceId = new URL(context.request.url).searchParams.get('deviceId');
    const deviceId = rawDeviceId ? validateDeviceId(rawDeviceId) : '';
    const row = deviceId ? await db.prepare(
      `SELECT slot, enabled, consecutive_failures, last_error_code, last_checked_at, last_success_at
       FROM realtime_beta_accounts WHERE device_id = ? LIMIT 1`
    ).bind(deviceId).first() : null;
    return json({
      configured: Boolean(context.env?.WEBTESS_CREDENTIALS_KEY && context.env?.BETA_INVITE_CODES),
      enrolled: Boolean(row),
      enabled: row?.enabled === 1,
      slot: row?.slot || null,
      consecutiveFailures: row?.consecutive_failures || 0,
      errorCode: row?.last_error_code || '',
      lastCheckedAt: row?.last_checked_at || null,
      lastSuccessAt: row?.last_success_at || null,
      schedule: '每天 06:00–24:00，每 5 分钟'
    });
  } catch (error) {
    return json({ error: safeError(error) }, error.status || 500);
  }
}

export async function onRequestPost(context) {
  try {
    assertSameOrigin(context.request);
    const db = requireDb(context.env);
    const secret = requireRealtimeSecret(context.env);
    const body = await readJson(context.request);
    const deviceId = validateDeviceId(body?.deviceId);
    const email = validateEmail(body?.email);
    const password = validatePassword(body?.password);
    const timezone = validateTimezone(body?.timezone);
    const existing = await db.prepare(
      'SELECT slot, device_id FROM realtime_beta_accounts WHERE device_id = ? LIMIT 1'
    ).bind(deviceId).first();

    let slot = Number(existing?.slot || 0);
    if (!slot) {
      slot = resolveInviteSlot(body?.inviteCode, context.env?.BETA_INVITE_CODES);
      const claimed = await db.prepare(
        'SELECT device_id FROM realtime_beta_accounts WHERE slot = ? LIMIT 1'
      ).bind(slot).first();
      if (claimed && claimed.device_id !== deviceId) {
        throw Object.assign(new Error('这个邀请码已经被使用。'), { status: 409 });
      }
    }

    const subscription = await db.prepare(
      'SELECT device_id FROM push_subscriptions WHERE device_id = ? AND enabled = 1 LIMIT 1'
    ).bind(deviceId).first();
    if (!subscription) throw Object.assign(new Error('浏览器通知订阅尚未建立，请重新启用即时通知。'), { status: 409 });

    let scraped;
    try {
      scraped = await scrapeGradesWithSession({ email, password });
    } catch {
      throw Object.assign(new Error('WebTESS 登录失败，请检查邮箱和密码。'), { status: 400 });
    }
    const sealed = await sealRealtimeState({
      version: 1,
      email,
      password,
      sessionCookie: scraped.sessionCookie,
      snapshot: compactGradeSnapshot(scraped.grades)
    }, secret, deviceId);
    const now = new Date().toISOString();

    if (existing) {
      await db.prepare(
        `UPDATE realtime_beta_accounts SET
           timezone = ?, state_iv = ?, state_ciphertext = ?, enabled = 1,
           consecutive_failures = 0, last_error_code = NULL,
           last_checked_at = ?, last_success_at = ?, updated_at = ?
         WHERE device_id = ? AND slot = ?`
      ).bind(timezone, sealed.iv, sealed.ciphertext, now, now, now, deviceId, slot).run();
    } else {
      try {
        await db.prepare(
          `INSERT INTO realtime_beta_accounts
           (slot, device_id, timezone, state_iv, state_ciphertext, enabled,
            consecutive_failures, last_error_code, last_checked_at, last_success_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 1, 0, NULL, ?, ?, ?, ?)`
        ).bind(slot, deviceId, timezone, sealed.iv, sealed.ciphertext, now, now, now, now).run();
      } catch (error) {
        if (/unique|constraint/i.test(error.message || '')) {
          throw Object.assign(new Error('这个邀请码已经被使用。'), { status: 409 });
        }
        throw error;
      }
    }

    return json({ ok: true, enabled: true, slot, updatedAt: now });
  } catch (error) {
    return json({ error: safeError(error) }, error.status || 500);
  }
}

export async function onRequestDelete(context) {
  try {
    assertSameOrigin(context.request);
    const db = requireDb(context.env);
    const body = await readJson(context.request);
    const deviceId = validateDeviceId(body?.deviceId);
    await db.prepare('DELETE FROM realtime_beta_accounts WHERE device_id = ?').bind(deviceId).run();
    return json({ ok: true });
  } catch (error) {
    return json({ error: safeError(error) }, error.status || 500);
  }
}

function validateDeviceId(value) {
  const id = String(value || '');
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(id)) badRequest('无效的设备标识。');
  return id;
}

function validateEmail(value) {
  const email = String(value || '').trim().slice(0, 254);
  if (!email || !email.includes('@')) badRequest('请输入有效的 WebTESS 邮箱。');
  return email;
}

function validatePassword(value) {
  const password = String(value || '').trim();
  if (!password || password.length > 512) badRequest('请输入 WebTESS 密码。');
  return password;
}

function validateTimezone(value) {
  const timezone = String(value || '').slice(0, 80);
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
  } catch {
    badRequest('无效的时区。');
  }
  return timezone;
}

function requireDb(env) {
  if (!env?.DB) throw Object.assign(new Error('Realtime database is not configured.'), { status: 500 });
  return env.DB;
}

function assertSameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) {
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }
}

async function readJson(request) {
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > 32_000) badRequest('请求内容过大。');
  try {
    return await request.json();
  } catch {
    badRequest('请求格式无效。');
  }
}

function badRequest(message) {
  throw Object.assign(new Error(message), { status: 400 });
}

function safeError(error) {
  if ([400, 403, 409].includes(error.status)) return error.message;
  if (/no such table/i.test(error.message || '')) return '即时通知数据库尚未迁移。';
  if (/credentials|invitation codes/i.test(error.message || '')) return '即时通知服务尚未配置完成。';
  return '即时通知暂时不可用，请稍后重试。';
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}
