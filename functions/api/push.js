const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

export async function onRequestGet(context) {
  return json({
    configured: Boolean(context.env?.VAPID_PUBLIC_KEY),
    publicKey: String(context.env?.VAPID_PUBLIC_KEY || '')
  });
}

export async function onRequestPost(context) {
  try {
    assertSameOrigin(context.request);
    const db = requireDb(context.env);
    const body = await readJson(context.request);
    const record = validatePushRecord(body);
    const now = new Date().toISOString();
    let progressJson = record.progress === null ? '' : JSON.stringify(record.progress);
    const progressUpdate = record.progress === null ? '' : ', progress_json = excluded.progress_json';

    if (!progressJson) {
      const existing = await db.prepare(
        'SELECT progress_json FROM push_subscriptions WHERE endpoint = ? LIMIT 1'
      ).bind(record.endpoint).first();
      progressJson = String(existing?.progress_json || '[]');
    }

    await db.prepare(
      'DELETE FROM push_subscriptions WHERE endpoint = ? AND device_id <> ?'
    ).bind(record.endpoint, record.deviceId).run();

    await db.prepare(
      `INSERT INTO push_subscriptions
       (device_id, endpoint, p256dh, auth, timezone, notify_time, weekdays_only,
        progress_json, enabled, last_sent_local_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, ?, ?)
       ON CONFLICT(device_id) DO UPDATE SET
         endpoint = excluded.endpoint,
         p256dh = excluded.p256dh,
         auth = excluded.auth,
         timezone = excluded.timezone,
         notify_time = excluded.notify_time,
         weekdays_only = excluded.weekdays_only,
         enabled = 1,
         updated_at = excluded.updated_at${progressUpdate}`
    ).bind(
      record.deviceId,
      record.endpoint,
      record.p256dh,
      record.auth,
      record.timezone,
      record.notifyTime,
      record.weekdaysOnly ? 1 : 0,
      progressJson,
      now,
      now
    ).run();

    return json({ ok: true, updatedAt: now });
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
    await db.prepare('DELETE FROM realtime_beta_accounts WHERE device_id = ?').bind(deviceId).run().catch(() => null);
    await db.prepare('DELETE FROM push_subscriptions WHERE device_id = ?').bind(deviceId).run();
    return json({ ok: true });
  } catch (error) {
    return json({ error: safeError(error) }, error.status || 500);
  }
}

function validatePushRecord(body) {
  const subscription = body?.subscription || {};
  const keys = subscription.keys || {};
  const endpoint = String(subscription.endpoint || '');
  if (!isHttpsUrl(endpoint) || endpoint.length > 2048) badRequest('无效的推送订阅地址。');
  const p256dh = validateBase64Url(keys.p256dh, 'p256dh');
  const auth = validateBase64Url(keys.auth, 'auth');
  const timezone = validateTimezone(body?.timezone);
  const notifyTime = validateNotifyTime(body?.notifyTime);
  return {
    deviceId: validateDeviceId(body?.deviceId),
    endpoint,
    p256dh,
    auth,
    timezone,
    notifyTime,
    weekdaysOnly: body?.weekdaysOnly !== false,
    progress: validateProgress(body?.progress)
  };
}

function validateProgress(value) {
  if (value === undefined) return null;
  if (!Array.isArray(value)) badRequest('无效的核心素养进度。');
  return value.slice(0, 16).map((item) => {
    const subject = String(item?.subject || '').trim().slice(0, 80);
    const source = String(item?.source || '').trim().slice(0, 100);
    const endDate = String(item?.endDate || '');
    if (!subject || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) badRequest('无效的核心素养进度。');
    return {
      subject,
      source,
      endDate,
      current: boundedNumber(item?.current, 0, 100),
      expected: boundedNumber(item?.expected, 0, 100),
      difference: boundedNumber(item?.difference, -100, 100)
    };
  });
}

function validateDeviceId(value) {
  const id = String(value || '');
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(id)) badRequest('无效的设备标识。');
  return id;
}

function validateBase64Url(value, label) {
  const text = String(value || '');
  if (!/^[A-Za-z0-9_-]{8,512}$/.test(text)) badRequest(`无效的 ${label} 密钥。`);
  return text;
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

function validateNotifyTime(value) {
  const time = String(value || '');
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59 || Number(match[2]) % 5 !== 0) {
    badRequest('提醒时间必须精确到 5 分钟。');
  }
  return time;
}

function boundedNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) badRequest('无效的分数数据。');
  return Math.round(number * 100) / 100;
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

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function requireDb(env) {
  if (!env?.DB) throw Object.assign(new Error('Push database is not configured.'), { status: 500 });
  return env.DB;
}

function badRequest(message) {
  throw Object.assign(new Error(message), { status: 400 });
}

function safeError(error) {
  if (error.status === 400) return error.message;
  if (error.status === 403) return '请求来源无效。';
  if (/no such table/i.test(error.message || '')) return '推送数据库尚未迁移。';
  return '推送服务暂时不可用。';
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}
