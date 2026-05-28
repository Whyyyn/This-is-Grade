const DEFAULT_URL = 'https://harts.systems/webtess/parent.jsp';
const LOGIN_URL = 'https://harts.systems/webtess/login';
const DETAIL_API_URL = 'https://harts.systems/webtess/gradebook';
const USER_AGENT = 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15';
const BASE_HEADERS = {
  'User-Agent': USER_AGENT,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache'
};

export async function scrapeGrades({ email, password, url = DEFAULT_URL }) {
  if (!email || !password) throw new Error('Missing WebTESS email or password.');
  const session = createCookieSession();
  const loginBody = new URLSearchParams({
    username: email,
    password,
    mobileBrowser: '0',
    browserWidth: '0',
    savebutton: 'Click to sign in'
  });

  let parentHtml = '';
  let courses = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    await session.request(LOGIN_URL, {
      method: 'POST',
      body: loginBody,
      headers: {
        ...BASE_HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://harts.systems',
        'Referer': 'https://harts.systems/webtess/parent.jsp'
      }
    });

    const parentResponse = await session.request(withCacheBust(url || DEFAULT_URL, attempt), {
      headers: {
        ...BASE_HEADERS,
        'Referer': LOGIN_URL
      }
    });
    parentHtml = await parentResponse.text();
    courses = extractGradebookButtons(parentHtml);
    if (courses.length) break;
    await sleep(250 * attempt);
  }

  if (!courses.length) {
    throw new Error('Logged in, but no gradebook courses were found. Try again in a few seconds.');
  }

  const results = await Promise.all(courses.map((course) => fetchCourseGrade(session, course)));
  const grades = results.filter((result) => result.score !== null);
  if (!grades.length) {
    throw new Error('Found WebTESS courses, but gradebook returned no scores.');
  }
  return dedupeGrades(grades);
}

function createCookieSession() {
  const cookies = new Map();
  return {
    async request(input, options = {}) {
      const headers = new Headers(options.headers || {});
      if (cookies.size) {
        headers.set('Cookie', [...cookies.entries()].map(([key, value]) => key + '=' + value).join('; '));
      }
      const response = await fetch(input, {
        ...options,
        headers,
        redirect: 'manual'
      });
      storeCookies(response.headers, cookies);
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (location) {
          return this.request(new URL(location, input).href, {
            method: 'GET',
            headers: options.headers
          });
        }
      }
      return response;
    }
  };
}


function withCacheBust(input, attempt) {
  const next = new URL(input);
  next.searchParams.set('_', String(Date.now()) + '-' + attempt);
  return next.href;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function compactSnippet(text) {
  return cleanHtml(text).slice(0, 180) || String(text || '').replace(/\s+/g, ' ').trim().slice(0, 180);
}

function storeCookies(headers, cookies) {
  const values = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : splitSetCookieHeader(headers.get('set-cookie'));
  for (const value of values) {
    const [pair] = value.split(';');
    const index = pair.indexOf('=');
    if (index > 0) cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
  }
}

function splitSetCookieHeader(header) {
  if (!header) return [];
  return header.split(/,(?=\s*[^;,=\s]+=[^;,]+)/);
}

function extractGradebookButtons(html) {
  const courses = [];
  const rowPattern = /<tr\b[^>]*>[\s\S]*?getGradebookByStudent\('([^']+)'\)[\s\S]*?<\/tr>/gi;
  let match;
  while ((match = rowPattern.exec(html))) {
    const rowHtml = match[0];
    const params = match[1].split(',').map((part) => part.trim());
    if (params.length < 4) continue;
    const cells = [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cleanHtml(cell[1]));
    courses.push({
      subject: cells[1] || cells.find(Boolean) || 'Course ' + params[3],
      stid: params[0],
      masid: params[1],
      crsid: params[2],
      crsnum: params[3]
    });
  }
  return courses;
}

async function fetchCourseGrade(session, course) {
  const params = new URLSearchParams({
    mode: 'get_published_marks_by_student',
    stid: course.stid,
    masid: course.masid,
    crsid: course.crsid,
    crsnum: course.crsnum
  });
  const response = await session.request(DETAIL_API_URL + '?' + params, {
    method: 'POST',
    headers: { ...BASE_HEADERS, 'Referer': DEFAULT_URL }
  });
  const text = await response.text();
  const parsed = parseGradebookSummary(text);
  if (parsed.score === null) {
    return { subject: course.subject, score: null, assignments: [], source: 'gradebook' };
  }
  return {
    subject: parsed.subject || course.subject,
    score: parsed.score,
    assignments: parsed.assignments,
    source: 'gradebook'
  };
}

function parseGradebookSummary(text) {
  const cleaned = cleanHtml(text);
  const mainSpreadsheet = cleaned.match(/^\s*\S+\s+(.+?)\s+\d+\s+Main spreadsheet\s+(\d{1,3}(?:\.\d+)?)/i);
  if (mainSpreadsheet) {
    const score = normalizeScore(mainSpreadsheet[2]);
    if (score !== null) {
      return {
        subject: mainSpreadsheet[1].trim(),
        score,
        assignments: parseAssignmentItems(cleaned.slice(mainSpreadsheet.index + mainSpreadsheet[0].length))
      };
    }
  }
  return { subject: '', score: parseGradebookScore(text), assignments: [] };
}

function parseAssignmentItems(text) {
  const itemPattern = /(\d+)\s+(\d+)\s+(\d+)\s+(-?\d+(?:\.\d+)?)\s+(\d+)\s+(\d+)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\s+/g;
  const matches = [...text.matchAll(itemPattern)];
  return matches.map((match, index) => {
    const tailStart = match.index + match[0].length;
    const tailEnd = index + 1 < matches.length ? matches[index + 1].index : text.length;
    const titleInfo = parseAssignmentTitle(text.slice(tailStart, tailEnd));
    const itemWeight = Number(match[7]);
    const scorePercent = Number(match[8]);
    const categoryId = match[5];
    return {
      id: match[1],
      categoryId,
      category: titleInfo.category || '未分类',
      title: titleInfo.title || 'Item ' + (index + 1),
      earned: Number(match[4]),
      possible: titleInfo.possible,
      itemWeight,
      scorePercent,
      contribution: roundTwo(itemWeight * scorePercent / 100)
    };
  }).filter((item) => Number.isFinite(item.scorePercent) && Number.isFinite(item.itemWeight));
}

function parseAssignmentTitle(text) {
  const parts = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  let possible = null;
  if (parts.length && /^-?\d+(?:\.\d+)?$/.test(parts.at(-1))) possible = Number(parts.pop());
  const title = parts.join(' ').trim();
  return { title, possible, category: inferCategory(title) };
}

function inferCategory(title) {
  const normalized = title.toLowerCase();
  const categories = [
    ['Test', /\b(test|exam|assessment|unit)\b/i],
    ['Quiz', /\bquiz\b/i],
    ['Homework', /\b(homework|hw|journal|worksheet|reading assignment|classnote)\b/i],
    ['Classwork', /\b(class work|classwork|notes|participation|outline|understand)\b/i],
    ['Project', /\b(project|presentation|video|poster|program|psa)\b/i],
    ['Writing', /\b(essay|paragraph|poem|writing|composition|reading comprehension)\b/i],
    ['Lab', /\b(lab|experiment)\b/i]
  ];
  const found = categories.find(([, pattern]) => pattern.test(normalized));
  return found ? found[0] : '';
}

function parseGradebookScore(text) {
  const patterns = [
    /<stavg>\s*([\d.]+)\s*<\/stavg>/i,
    /<avg>\s*([\d.]+)\s*<\/avg>/i,
    /<average>\s*([\d.]+)\s*<\/average>/i,
    /Main spreadsheet\s+(\d{1,3}(?:\.\d+)?)/i,
    /(?:stavg|average|avg|score|mark)["'\s:=]+([\d.]+)/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const score = normalizeScore(match[1]);
      if (score !== null) return score;
    }
  }
  return null;
}

function normalizeScore(value) {
  const score = Number(value);
  return Number.isFinite(score) && score >= 0 && score <= 120 ? score : null;
}

function roundTwo(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function cleanHtml(value) {
  return decodeHtmlEntities(String(value)
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function decodeHtmlEntities(value) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity) => {
    if (entity[0] === '#') {
      const code = entity[1]?.toLowerCase() === 'x' ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    }
    return named[entity.toLowerCase()] ?? _;
  });
}

function dedupeGrades(grades) {
  const seen = new Set();
  return grades.filter((grade) => {
    const key = grade.subject.toLowerCase() + '|' + grade.score;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => a.subject.localeCompare(b.subject));
}
