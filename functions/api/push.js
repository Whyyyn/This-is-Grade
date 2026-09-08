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
         enabled = 1,
         updated_at = excluded.updated_at`
    ).bind(
      record.deviceId,
      record.endpoint,
      record.p256dh,
      record.auth,
      record.timezone,
      '00:00',
      0,
      '[]',
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
  return {
    deviceId: validateDeviceId(body?.deviceId),
    endpoint,
    p256dh,
    auth,
    timezone
  };
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
