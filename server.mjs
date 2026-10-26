// 계약서 검토 · 내용증명 작성 앱 — 로컬 서버
// 외부 패키지 없이 Node 기본 기능만 쓴다. 계약서 본문은 이 PC 밖으로 나가지 않고,
// 법제처에는 "법령명·조문번호·판례 검색어"만 보낸다.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------ 설정 (.env) */
const envFile = path.join(here, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const OC = process.env.LAW_OC;
if (!OC || OC === '본인OC') {
  console.error('\n[설정 오류] .env 에 LAW_OC=<본인 법제처 OC> 를 적어야 합니다. README.md 의 "설치" 를 보세요.\n');
  process.exit(1);
}
const port = Number(process.env.PORT || 5188);
const TIMEOUT_MS = Number(process.env.LAW_TIMEOUT_MS || 30000);

/* --------------------------------------------------------- 법제처 OPEN API */
const BASE = 'https://www.law.go.kr/DRF';
const asArray = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const strip = (s) => String(s ?? '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/[ \t]+/g, ' ').trim();

async function callApi(file, params) {
  const url = new URL(`${BASE}/${file}`);
  url.searchParams.set('OC', OC);
  url.searchParams.set('type', 'JSON');
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') url.searchParams.set(k, String(v));
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  let buf;
  try {
    const res = await fetch(url, { signal: ac.signal });
    if (!res.ok) throw new Error(`법제처 응답 오류 HTTP ${res.status}`);
    buf = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? '법제처 응답이 늦어 중단했습니다. 잠시 후 다시 시도하세요.' : e.message);
  } finally {
    clearTimeout(timer);
  }
  // 법제처는 UTF-8 과 EUC-KR 을 섞어 보낸다
  for (const enc of ['utf-8', 'euc-kr']) {
    const text = new TextDecoder(enc).decode(buf);
    if (/사용자 정보 검증에 실패/.test(text)) {
      throw new Error('법제처 인증 실패: OC 가 승인되지 않았거나, open.law.go.kr 에 등록한 IP 가 이 PC 와 다릅니다.');
    }
    try { return JSON.parse(text); } catch { /* 다음 인코딩 */ }
  }
  throw new Error('법제처 응답을 읽지 못했습니다.');
}

const lawUrl = (name, article) =>
  `https://www.law.go.kr/법령/${name.trim().replace(/ /g, '%20')}${article ? `/제${article}조` : ''}`;

function joCode(article) {
  const m = String(article).trim().match(/^(\d+)\s*(?:의\s*(\d+))?$/);
  if (!m) throw new Error(`조문번호 형식이 아닙니다: "${article}" (예: 398, 428의2)`);
  return { jo: m[1].padStart(4, '0') + (m[2] ? m[2].padStart(2, '0') : '00'), no: m[1], branch: m[2] || '0' };
}

function collectText(node, out = []) {
  if (Array.isArray(node)) { node.forEach((n) => collectText(n, out)); return out; }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === 'string' && ['조문내용', '항내용', '호내용', '목내용'].includes(k)) { const t = strip(v); if (t) out.push(t); }
      else if (Array.isArray(v) && ['항내용', '호내용', '목내용'].includes(k)) v.forEach((x) => { const t = strip(x); if (t) out.push(t); });
      else collectText(v, out);
    }
  }
  return out;
}

const lawCache = new Map();
async function findLaw(name) {
  if (lawCache.has(name)) return lawCache.get(name);
  // "상법" 처럼 짧은 이름은 비슷한 법령이 많아 정확히 같은 이름만 받는다.
  // 첫 결과로 대신하면 엉뚱한 법령의 원문을 조용히 보여 주게 된다.
  const d = await callApi('lawSearch.do', { target: 'law', query: name, display: 100 });
  const rows = asArray(d?.LawSearch?.law).filter((r) => r && typeof r === 'object');
  const hit = rows.find((r) => strip(r['법령명한글']) === name.trim());
  if (!hit) {
    const near = rows.slice(0, 5).map((r) => strip(r['법령명한글'])).join(', ');
    throw new Error(`"${name}" 과 이름이 정확히 같은 법령이 없습니다.${near ? ` 비슷한 법령: ${near}` : ''}`);
  }
  lawCache.set(name, hit);
  return hit;
}

async function getArticle(name, article) {
  const law = await findLaw(name);
  const { jo, no, branch } = joCode(article);
  const d = await callApi('lawService.do', { target: 'law', MST: law['법령일련번호'], JO: jo });
  const units = asArray(d?.법령?.조문?.조문단위).filter((u) => u?.조문여부 !== '전문');
  const unit = units.find((u) => String(u?.조문번호) === no && String(u?.조문가지번호 ?? '0') === branch) || units[0];
  if (!unit) throw new Error(`${strip(law['법령명한글'])} 제${article}조를 받지 못했습니다.`);
  const lawName = strip(law['법령명한글']);
  return {
    law: lawName,
    article,
    title: strip(unit['조문제목']),
    effective: strip(law['시행일자']),
    text: collectText(unit).join('\n'),
    url: lawUrl(lawName, article),
  };
}

async function searchPrec(query) {
  const d = await callApi('lawSearch.do', { target: 'prec', query, display: 15 });
  return asArray(d?.PrecSearch?.prec).filter((r) => r && typeof r === 'object').map((r) => ({
    id: String(r['판례일련번호']),
    title: strip(r['사건명']),
    caseNo: strip(r['사건번호']),
    date: strip(r['선고일자']),
    court: strip(r['법원명']),
  }));
}

async function getPrec(id) {
  const d = await callApi('lawService.do', { target: 'prec', ID: id });
  const p = d?.PrecService ?? {};
  const pick = (k) => strip(String(p[k] ?? '').replace(/<br\s*\/?>/gi, '\n'));
  return {
    title: pick('사건명'), caseNo: pick('사건번호'), date: pick('선고일자'), court: pick('법원명'),
    issues: pick('판시사항'), summary: pick('판결요지'), refs: pick('참조조문'),
    url: `https://www.law.go.kr/precInfoP.do?precSeq=${encodeURIComponent(id)}`,
  };
}

/* ------------------------------------------------------- 파일에서 글 꺼내기 */
// .docx 는 zip 이다. 외부 패키지 없이 word/document.xml 만 풀어 글을 뽑는다.
function unzipEntry(buf, wanted) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('docx 파일 구조를 읽지 못했습니다.');
  let p = buf.readUInt32LE(eocd + 16);
  const count = buf.readUInt16LE(eocd + 10);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    if (name === wanted) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      return method === 8 ? zlib.inflateRawSync(data) : data;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error('docx 안에서 본문(word/document.xml)을 찾지 못했습니다.');
}

function docxText(buf) {
  const xml = unzipEntry(buf, 'word/document.xml').toString('utf8');
  return xml
    .replace(/<w:tab\/>/g, '\t').replace(/<w:br[^>]*\/>/g, '\n').replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n').trim();
}

function plainText(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); }
  catch { return new TextDecoder('euc-kr').decode(buf); }
}

/* -------------------------------------------------------------- HTTP 서버 */
const STATIC = { '/': 'index.html', '/index.html': 'index.html', '/rules.js': 'rules.js', '/app.js': 'app.js', '/style.css': 'style.css' };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};

const readBody = (req, limit = 15e6) => new Promise((ok, fail) => {
  const chunks = []; let size = 0;
  req.on('data', (d) => { size += d.length; if (size > limit) { fail(new Error('파일이 너무 큽니다(15MB 초과).')); req.destroy(); } else chunks.push(d); });
  req.on('end', () => ok(Buffer.concat(chunks)));
  req.on('error', fail);
});

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const q = (k) => (url.searchParams.get(k) || '').trim();

  if (url.pathname === '/api/status') {
    await findLaw('민법');
    return send(res, 200, { ok: true });
  }
  if (url.pathname === '/api/law') {
    if (!q('name') || !q('article')) return send(res, 400, { error: '법령명과 조문번호를 넣으세요.' });
    return send(res, 200, await getArticle(q('name'), q('article')));
  }
  if (url.pathname === '/api/prec') {
    if (!q('query')) return send(res, 400, { error: '검색어를 넣으세요.' });
    return send(res, 200, { items: await searchPrec(q('query')) });
  }
  if (url.pathname === '/api/prec/detail') {
    if (!/^\d+$/.test(q('id'))) return send(res, 400, { error: '판례 번호가 올바르지 않습니다.' });
    return send(res, 200, await getPrec(q('id')));
  }
  if (url.pathname === '/api/extract' && req.method === 'POST') {
    const name = decodeURIComponent(req.headers['x-filename'] || '').toLowerCase();
    const buf = await readBody(req);
    if (name.endsWith('.docx')) return send(res, 200, { text: docxText(buf) });
    if (name.endsWith('.txt') || name.endsWith('.md')) return send(res, 200, { text: plainText(buf) });
    return send(res, 400, { error: 'docx·txt 파일만 읽을 수 있습니다. 한글(hwp)·PDF 는 본문을 복사해 붙여넣으세요.' });
  }

  const file = STATIC[url.pathname];
  if (req.method === 'GET' && file) {
    return send(res, 200, fs.readFileSync(path.join(here, 'public', file), 'utf8'), TYPES[path.extname(file)]);
  }
  send(res, 404, { error: 'not found' });
}

http.createServer((req, res) => {
  handle(req, res).catch((e) => send(res, 500, { error: String(e?.message || e) }));
}).listen(port, '127.0.0.1', () => {
  console.log(`계약서 검토 · 내용증명 앱: http://localhost:${port}`);
  console.log('끄려면 이 창을 닫거나 Ctrl+C');
});
