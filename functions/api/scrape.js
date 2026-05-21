import { scrapeGrades } from '../_lib/webtess.js';

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
    const grades = await scrapeGrades({
      email: String(body.email || '').trim(),
      password: String(body.password || ''),
      url: String(body.url || 'https://harts.systems/webtess/parent.jsp')
    });
    return json(grades);
  } catch (error) {
    return json({ error: error.message || 'Scrape failed' }, 500);
  }
}

export async function onRequestGet() {
  return json({ error: 'Use POST /api/scrape.' }, 405);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...jsonHeaders, ...corsHeaders() }
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization'
  };
}
