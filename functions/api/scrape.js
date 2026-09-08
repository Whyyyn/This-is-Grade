import { scrapeGradesWithSession } from '../_lib/webtess.js';
import { createUserSession } from '../_lib/auth.js';
import { compactGradeSnapshot, requireRealtimeSecret, sealRealtimeState } from '../_lib/realtime.js';

const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const email = String(body.email || '').trim();
    const password = String(body.password || '');
    const scraped = await scrapeGradesWithSession({
      email,
      password,
      url: String(body.url || 'https://harts.systems/webtess/parent.jsp')
    });
    const grades = scraped.grades;
    await refreshRealtimeAccount(context, body.realtimeDeviceId, email, password, scraped).catch(() => null);
    const extraHeaders = {};
    try {
      const session = await createUserSession(email, context.env, context.request);
      extraHeaders['Set-Cookie'] = session.cookie;
    } catch {
      extraHeaders['X-History-Disabled'] = 'missing-session-secret';
    }
    return json(grades, 200, extraHeaders);
  } catch (error) {
    return json({ error: safeError(error) }, error.status || 500);
  }
}

async function refreshRealtimeAccount(context, rawDeviceId, email, password, scraped) {
  const deviceId = String(rawDeviceId || '');
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(deviceId) || !context.env?.DB) return;
  const existing = await context.env.DB.prepare(
    'SELECT device_id FROM realtime_beta_accounts WHERE device_id = ? AND enabled = 1 LIMIT 1'
  ).bind(deviceId).first();
  if (!existing) return;
  const secret = requireRealtimeSecret(context.env);
  const sealed = await sealRealtimeState({
    version: 1,
    email,
    password,
    sessionCookie: scraped.sessionCookie,
    snapshot: compactGradeSnapshot(scraped.grades)
  }, secret, deviceId);
  const now = new Date().toISOString();
  await context.env.DB.prepare(
    `UPDATE realtime_beta_accounts SET state_iv = ?, state_ciphertext = ?,
       consecutive_failures = 0, last_error_code = NULL, last_checked_at = ?,
       last_success_at = ?, updated_at = ? WHERE device_id = ?`
  ).bind(sealed.iv, sealed.ciphertext, now, now, now, deviceId).run();
}

export async function onRequestGet() {
  return json({ error: 'Use POST /api/scrape.' }, 405);
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...jsonHeaders, ...corsHeaders(), ...extraHeaders }
  });
}

function safeError(error) {
  return '抓取失败，请检查 WebTESS 登录信息后重试。';
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization'
  };
}
