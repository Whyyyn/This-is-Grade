import { requireUserSession } from '../_lib/auth.js';

const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestGet(context) {
  try {
    const { userId } = await requireUserSession(context.request, context.env);
    const db = requireDb(context.env);
    const url = new URL(context.request.url);
    const limit = clampInt(url.searchParams.get('limit'), 1, 200, 60);
    const result = await db.prepare(
      `SELECT id, created_at, salt, iv, ciphertext, schema_version
       FROM encrypted_grade_snapshots
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`
    ).bind(userId, limit).all();
    return json({ snapshots: (result.results || []).reverse() });
  } catch (error) {
    return json({ error: safeError(error) }, error.status || 500);
  }
}

export async function onRequestPost(context) {
  try {
    const { userId } = await requireUserSession(context.request, context.env);
    const db = requireDb(context.env);
    const body = await context.request.json();
    const record = validateEncryptedRecord(body);
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    await db.prepare(
      `INSERT INTO encrypted_grade_snapshots
       (id, user_id, created_at, salt, iv, ciphertext, schema_version)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, userId, createdAt, record.salt, record.iv, record.ciphertext, record.schema_version).run();
    return json({ id, created_at: createdAt });
  } catch (error) {
    return json({ error: safeError(error) }, error.status || 500);
  }
}

export async function onRequestDelete(context) {
  try {
    const { userId } = await requireUserSession(context.request, context.env);
    const db = requireDb(context.env);
    await db.prepare('DELETE FROM encrypted_grade_snapshots WHERE user_id = ?').bind(userId).run();
    return json({ ok: true });
  } catch (error) {
    return json({ error: safeError(error) }, error.status || 500);
  }
}

function requireDb(env) {
  if (!env?.DB) throw Object.assign(new Error('History database is not configured.'), { status: 500 });
  return env.DB;
}

function validateEncryptedRecord(body) {
  const record = {
    salt: String(body?.salt || ''),
    iv: String(body?.iv || ''),
    ciphertext: String(body?.ciphertext || ''),
    schema_version: Number(body?.schema_version || 1)
  };
  if (!isBase64(record.salt) || record.salt.length < 16) throw Object.assign(new Error('Invalid encrypted payload.'), { status: 400 });
  if (!isBase64(record.iv) || record.iv.length < 12) throw Object.assign(new Error('Invalid encrypted payload.'), { status: 400 });
  if (!isBase64(record.ciphertext) || record.ciphertext.length < 24) throw Object.assign(new Error('Invalid encrypted payload.'), { status: 400 });
  if (record.schema_version !== 1) throw Object.assign(new Error('Unsupported schema version.'), { status: 400 });
  return record;
}

function isBase64(value) {
  return /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function clampInt(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...jsonHeaders, ...corsHeaders() }
  });
}

function safeError(error) {
  if (error.status === 401) return '请先成功抓取一次成绩。';
  if (error.status === 400) return error.message;
  return '历史功能暂时不可用。';
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true'
  };
}
