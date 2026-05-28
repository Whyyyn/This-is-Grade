const SESSION_COOKIE = 'grade_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

export async function createUserSession(email, env, request) {
  const secret = getSessionSecret(env);
  const userId = await sha256Hex(secret + ':' + normalizeEmail(email));
  const payload = base64UrlEncode(JSON.stringify({
    u: userId,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS
  }));
  const signature = await hmacSha256(payload, secret);
  return {
    userId,
    cookie: `${SESSION_COOKIE}=${payload}.${signature}; HttpOnly; ${isHttps(request) ? 'Secure; ' : ''}SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}`
  };
}

export async function requireUserSession(request, env) {
  const secret = getSessionSecret(env);
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) throw Object.assign(new Error('Unauthorized'), { status: 401 });

  const [payload, signature] = token.split('.');
  if (!payload || !signature) throw Object.assign(new Error('Unauthorized'), { status: 401 });
  const expected = await hmacSha256(payload, secret);
  if (!timingSafeEqual(signature, expected)) throw Object.assign(new Error('Unauthorized'), { status: 401 });

  let data;
  try {
    data = JSON.parse(base64UrlDecode(payload));
  } catch {
    throw Object.assign(new Error('Unauthorized'), { status: 401 });
  }
  if (!data?.u || data.exp < Math.floor(Date.now() / 1000)) {
    throw Object.assign(new Error('Unauthorized'), { status: 401 });
  }
  return { userId: String(data.u) };
}

function getSessionSecret(env) {
  const secret = env?.SESSION_SECRET;
  if (!secret || String(secret).length < 24) {
    throw Object.assign(new Error('Server session secret is not configured.'), { status: 500 });
  }
  return String(secret);
}

function isHttps(request) {
  try {
    return new URL(request?.url || '').protocol === 'https:';
  } catch {
    return true;
  }
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return '';
}

async function hmacSha256(value, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function base64UrlEncode(value) {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlEncodeBytes(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return [...binary].map((char) => String.fromCharCode(char.charCodeAt(0))).join('');
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index++) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return mismatch === 0;
}
