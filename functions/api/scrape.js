import { scrapeGrades } from '../_lib/webtess.js';
import { createUserSession } from '../_lib/auth.js';

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
    const grades = await scrapeGrades({
      email,
      password: String(body.password || ''),
      url: String(body.url || 'https://harts.systems/webtess/parent.jsp')
    });
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
