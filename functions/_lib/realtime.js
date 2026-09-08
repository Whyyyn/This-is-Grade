const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function sealRealtimeState(value, secret, deviceId) {
  const key = await encryptionKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({
    name: 'AES-GCM',
    iv,
    additionalData: encoder.encode(String(deviceId || ''))
  }, key, encoder.encode(JSON.stringify(value)));
  return {
    iv: base64UrlEncode(iv),
    ciphertext: base64UrlEncode(new Uint8Array(ciphertext))
  };
}

export async function openRealtimeState(record, secret, deviceId) {
  const key = await encryptionKey(secret);
  const plaintext = await crypto.subtle.decrypt({
    name: 'AES-GCM',
    iv: base64UrlDecode(record.state_iv),
    additionalData: encoder.encode(String(deviceId || ''))
  }, key, base64UrlDecode(record.state_ciphertext));
  return JSON.parse(decoder.decode(plaintext));
}

export function requireRealtimeSecret(env) {
  const secret = String(env?.WEBTESS_CREDENTIALS_KEY || '');
  if (secret.length < 32) {
    throw Object.assign(new Error('Realtime credential encryption is not configured.'), { status: 500 });
  }
  return secret;
}

export function resolveInviteSlot(value, configuredCodes) {
  const candidate = String(value || '').trim();
  const codes = String(configuredCodes || '').split(',').map((code) => code.trim()).filter(Boolean).slice(0, 5);
  if (codes.length !== 5) {
    throw Object.assign(new Error('Beta invitation codes are not configured.'), { status: 500 });
  }
  const index = codes.findIndex((code) => constantTimeEqual(code, candidate));
  if (index < 0) throw Object.assign(new Error('邀请码无效。'), { status: 403 });
  return index + 1;
}

export function compactGradeSnapshot(grades) {
  return (Array.isArray(grades) ? grades : []).slice(0, 16).map((grade) => ({
    subject: String(grade?.subject || '').trim().slice(0, 100),
    score: roundedNumber(grade?.score),
    assignments: (Array.isArray(grade?.assignments) ? grade.assignments : []).slice(0, 80).map((item) => ({
      id: String(item?.id || '').slice(0, 100),
      categoryId: String(item?.categoryId || '').slice(0, 100),
      category: String(item?.category || '').trim().slice(0, 160),
      title: String(item?.title || '').trim().slice(0, 240),
      earned: nullableRoundedNumber(item?.earned),
      possible: nullableRoundedNumber(item?.possible),
      scorePercent: roundedNumber(item?.scorePercent)
    }))
  })).filter((grade) => grade.subject && grade.score !== null);
}

export function diffGradeSnapshots(previous, current) {
  const beforeCourses = new Map((previous || []).map((grade) => [normalize(grade.subject), grade]));
  const changes = [];

  for (const grade of current || []) {
    const before = beforeCourses.get(normalize(grade.subject));
    if (!before) {
      changes.push({ type: 'course-added', subject: grade.subject, label: '课程成绩', before: null, after: grade.score });
      continue;
    }
    if (differentNumber(before.score, grade.score)) {
      changes.push({ type: 'course-score', subject: grade.subject, label: '总评', before: before.score, after: grade.score });
    }

    const beforeItems = new Map((before.assignments || []).map((item) => [assignmentKey(item), item]));
    for (const item of grade.assignments || []) {
      const prior = beforeItems.get(assignmentKey(item));
      const label = item.category || item.title || '成绩项目';
      if (!prior) {
        changes.push({ type: 'assignment-added', subject: grade.subject, label, before: null, after: item.scorePercent });
      } else if (differentNumber(prior.scorePercent, item.scorePercent)) {
        changes.push({ type: 'assignment-score', subject: grade.subject, label, before: prior.scorePercent, after: item.scorePercent });
      }
    }
  }
  return changes.slice(0, 12);
}

export function isRealtimeCheckDue(row, now = new Date()) {
  const local = localParts(now, row.timezone);
  if (!local) return false;
  if (local.hour < 6 || local.hour >= 24) return false;
  const minuteSlot = Math.floor(now.getTime() / 60_000) % 5 + 1;
  return Number(row.slot) === minuteSlot;
}

export function createGradeChangePayload(changes) {
  const shown = (changes || []).slice(0, 2);
  const body = shown.map((change) => {
    const prefix = `${change.subject} · ${change.label}`;
    if (change.before === null) return `${prefix}：新增 ${displayScore(change.after)}`;
    return `${prefix}：${displayScore(change.before)} → ${displayScore(change.after)}`;
  }).join('；');
  const remaining = Math.max(0, (changes || []).length - shown.length);
  return {
    title: 'WebTESS 成绩更新',
    body: `${body}${remaining ? `；另有 ${remaining} 项变化` : ''}`,
    tag: `grade-change-${Date.now()}`,
    url: '/'
  };
}

function assignmentKey(item) {
  const id = String(item?.id || '').trim();
  if (id) return `id:${id}`;
  return `text:${normalize(item?.category)}|${normalize(item?.title)}`;
}

function normalize(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function differentNumber(a, b) {
  if (a === null || b === null) return a !== b;
  return Math.abs(Number(a) - Number(b)) >= 0.005;
}

function roundedNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round((number + Number.EPSILON) * 100) / 100 : null;
}

function nullableRoundedNumber(value) {
  return value === null || value === undefined || value === '' ? null : roundedNumber(value);
}

function displayScore(value) {
  return value === null || value === undefined ? '—' : `${Math.round(Number(value) * 100) / 100}%`;
}

function localParts(date, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return { hour: Number(values.hour) };
  } catch {
    return null;
  }
}

async function encryptionKey(secret) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(String(secret)));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function constantTimeEqual(a, b) {
  const left = encoder.encode(String(a));
  const right = encoder.encode(String(b));
  let mismatch = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index++) mismatch |= (left[index] || 0) ^ (right[index] || 0);
  return mismatch === 0;
}

function base64UrlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const text = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(text + '='.repeat((4 - text.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
