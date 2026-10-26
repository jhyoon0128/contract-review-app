// 계약서 검토 · 내용증명 화면 동작
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const today = () => { const d = new Date(); return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`; };
const fmtDate = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-').map(Number); return `${y}. ${m}. ${d}.`; };

async function api(path) {
  const r = await fetch(path);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

function download(name, content, type) {
  const blob = new Blob(['﻿' + content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ------------------------------------------------------------ 탭 · 테마 */
function showTab(t) {
  $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  $$('.view').forEach((v) => v.classList.toggle('on', v.id === `view-${t}`));
  store.set('tab', t);
}
$('#tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) showTab(b.dataset.tab); });

const applyTheme = (t) => { if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; };
applyTheme(store.get('theme', ''));
$('#themeBtn').onclick = () => {
  const now = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = now === 'dark' ? 'light' : 'dark'; applyTheme(next); store.set('theme', next);
};

/* ------------------------------------------------------- 법령 원문 상자 */
const lawCache = new Map();
async function lawBox(name, article) {
  const key = `${name}|${article}`;
  if (!lawCache.has(key)) lawCache.set(key, api(`/api/law?name=${encodeURIComponent(name)}&article=${encodeURIComponent(article)}`));
  try {
    const j = await lawCache.get(key);
    return `<div class="lawbox"><b>${esc(j.law)} 제${esc(j.article)}조${j.title ? `(${esc(j.title)})` : ''}</b> <span class="muted">현행 · 시행 ${esc(j.effective)}</span>\n${esc(j.text)}\n<a href="${esc(j.url)}" target="_blank" rel="noopener">법제처에서 보기 ↗</a></div>`;
  } catch (e) {
    lawCache.delete(key);
    return `<div class="lawbox err">원문을 가져오지 못했습니다: ${esc(e.message)}</div>`;
  }
}
const lawChips = (laws) => laws.map(([n, a, note]) =>
  `<button class="lawchip" data-law="${esc(n)}" data-art="${esc(a)}" title="${esc(note || '')}">${esc(n === '약관의 규제에 관한 법률' ? '약관법' : n)} 제${esc(a)}조${note ? ` · ${esc(note)}` : ''}</button>`).join('');

// 법령 칩을 누르면 바로 아래에 원문을 펼친다(다시 누르면 접힘)
document.addEventListener('click', async (e) => {
  const chip = e.target.closest('.lawchip');
  if (!chip) return;
  const holder = chip.closest('[data-lawholder]') || chip.parentElement;
  let box = holder.querySelector(':scope > .lawslot');
  if (!box) { box = document.createElement('div'); box.className = 'lawslot'; holder.appendChild(box); }
  if (chip.classList.contains('on')) { chip.classList.remove('on'); box.innerHTML = ''; return; }
  $$('.lawchip', holder).forEach((c) => c.classList.remove('on'));
  chip.classList.add('on');
  box.innerHTML = '<div class="lawbox"><span class="spinner"></span>법제처에서 가져오는 중…</div>';
  box.innerHTML = await lawBox(chip.dataset.law, chip.dataset.art);
});

/* ---------------------------------------------------------- ① 계약서 검토 */
const SAMPLE = `웹사이트 제작 용역 계약서 (예시 · 가상)

주식회사 가나(이하 "갑")와 다라디자인(이하 "을")은 다음과 같이 용역 계약을 체결한다.

제1조(목적) 이 계약은 갑의 회사 웹사이트 제작 용역에 관한 사항을 정함을 목적으로 한다.

제2조(대금 및 지급) ① 용역 대금은 금 삼천만원(30,000,000원, 부가가치세 별도)으로 한다.
② 갑은 최종 결과물 검수 완료 후 90일 이내에 대금을 지급한다.

제3조(계약의 변경) 갑은 업무상 필요한 경우 과업의 범위와 일정을 일방적으로 변경할 수 있으며, 을은 이에 이의를 제기할 수 없다.

제4조(지체상금) 을이 납기를 지체한 경우 지체일수 1일당 계약금액의 1천분의 5에 해당하는 지체상금을 갑에게 지급한다.

제5조(손해배상) 을은 이 계약과 관련하여 갑에게 발생한 직접·간접의 일체의 손해를 배상하여야 하며, 별도로 계약금액의 2배를 위약벌로 지급한다.

제6조(계약의 해지) 갑은 언제든지 서면 통보만으로 이 계약을 즉시 해지할 수 있다.

제7조(지식재산권) 이 계약에 따른 결과물 및 을이 기존에 보유한 디자인 소스 일체의 저작권은 계약 체결과 동시에 갑에게 귀속된다.

제8조(비밀유지) 을은 이 계약으로 알게 된 갑의 정보를 영구히 비밀로 유지한다.

제9조(계약기간 연장) 계약 만료 1개월 전까지 별도의 의사표시가 없는 한 동일한 조건으로 1년씩 자동 연장된다.

제10조(관할) 이 계약에 관한 분쟁은 갑의 본사 소재지를 관할하는 법원을 전속 관할로 한다.

2026년 10월 1일
갑: 주식회사 가나 대표이사 (인)
을: 다라디자인 대표 (인)`;

$('#sampleBtn').onclick = () => { $('#contract').value = SAMPLE; $('#reviewMsg').textContent = '예시 계약서를 넣었습니다. 검토 시작을 누르세요.'; };

$('#file').onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  $('#reviewMsg').innerHTML = '<span class="spinner"></span>파일을 읽는 중…';
  try {
    const r = await fetch('/api/extract', { method: 'POST', headers: { 'x-filename': encodeURIComponent(f.name) }, body: f });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error);
    $('#contract').value = j.text;
    $('#reviewMsg').textContent = `${f.name} 에서 ${j.text.length.toLocaleString()}자를 읽었습니다.`;
  } catch (err) { $('#reviewMsg').innerHTML = `<span class="err">${esc(err.message)}</span>`; }
};

function splitClauses(text) {
  const re = /^[ \t]*제\s*(\d+)\s*조(?:\s*의\s*(\d+))?\s*(?:[(（【\[]\s*([^)）】\]\n]{0,40}?)\s*[)）】\]])?/gm;
  const heads = [...text.matchAll(re)];
  if (!heads.length) {
    return text.split(/\n\s*\n/).map((t, i) => ({ title: `문단 ${i + 1}`, text: t.trim() })).filter((c) => c.text);
  }
  const out = [];
  const pre = text.slice(0, heads[0].index).trim();
  if (pre) out.push({ title: '머리말', text: pre });
  heads.forEach((m, i) => {
    const end = i + 1 < heads.length ? heads[i + 1].index : text.length;
    out.push({ title: `제${m[1]}조${m[2] ? `의${m[2]}` : ''}${m[3] ? `(${m[3].trim()})` : ''}`, text: text.slice(m.index, end).trim() });
  });
  return out;
}

function findHits(text, rule) {
  const ranges = [];
  for (const p of rule.patterns) {
    const g = new RegExp(p.source, p.flags.includes('g') ? p.flags : p.flags + 'g');
    for (const m of text.matchAll(g)) {
      if (rule.number && !(Number(m[rule.number.group]) > rule.number.gt)) continue;
      if (m[0]) ranges.push([m.index, m.index + m[0].length]);
    }
  }
  return ranges;
}

function highlight(text, ranges) {
  if (!ranges.length) return esc(text);
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of ranges) { const last = merged[merged.length - 1]; if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else merged.push([...r]); }
  let out = '', pos = 0;
  for (const [s, e] of merged) { out += esc(text.slice(pos, s)) + `<mark>${esc(text.slice(s, e))}</mark>`; pos = e; }
  return out + esc(text.slice(pos));
}

let review = null; // 마지막 검토 결과(보고서용)
const LEVELS = ['높음', '중간', '낮음'];

function runReview() {
  const text = $('#contract').value.trim();
  if (!text) { $('#reviewMsg').innerHTML = '<span class="err">계약서 본문을 넣어 주세요.</span>'; return; }
  const clauses = splitClauses(text).map((c) => {
    const ranges = [];
    const issues = [];
    for (const rule of window.CONTRACT_RULES) {
      const r = findHits(c.text, rule);
      if (r.length) { ranges.push(...r); issues.push({ rule, fix: rule.fix }); }
    }
    issues.sort((a, b) => LEVELS.indexOf(a.rule.level) - LEVELS.indexOf(b.rule.level));
    return { ...c, ranges, issues };
  });
  const missing = window.MISSING_CHECKS.filter((m) => !m.anyOf.some((p) => p.test(text)));
  const count = (lv) => clauses.reduce((n, c) => n + c.issues.filter((i) => i.rule.level === lv).length, 0);
  review = { clauses, missing, counts: { 높음: count('높음'), 중간: count('중간'), 낮음: count('낮음') }, date: today() };
  renderReview('all');
  $('#reviewMsg').textContent = `${clauses.length}개 조항을 살펴봤습니다.`;
}
$('#reviewBtn').onclick = runReview;

function renderReview(filter) {
  const { clauses, missing, counts } = review;
  const shown = clauses.filter((c) => c.issues.length && (filter === 'all' || c.issues.some((i) => i.rule.level === filter)));
  const clean = clauses.filter((c) => !c.issues.length).map((c) => c.title);
  const stat = (key, cls, n, label) => `<button class="stat ${cls}${filter === key ? ' on' : ''}" data-filter="${key}"><b>${n}</b><span>${label}</span></button>`;
  $('#reviewOut').innerHTML = `
    <div class="summary noprint">
      ${stat('all', '', counts.높음 + counts.중간 + counts.낮음, '전체 지적')}
      ${stat('높음', 'high', counts.높음, '위험 높음')}
      ${stat('중간', 'mid', counts.중간, '위험 중간')}
      ${stat('낮음', 'low', counts.낮음, '확인 필요')}
      ${stat('missing', '', missing.length, '빠진 조항')}
    </div>
    <div class="btns noprint" style="margin-bottom:14px">
      <button class="btn" id="repDoc">보고서 Word 저장</button>
      <button class="btn" id="repMd">보고서 텍스트(.md) 저장</button>
      <button class="btn" id="repPrint">인쇄</button>
    </div>
    ${filter === 'missing' || filter === 'all' ? missingHtml(missing) : ''}
    ${filter === 'missing' ? '' : shown.map(clauseHtml).join('') || '<div class="card muted">해당하는 지적이 없습니다.</div>'}
    ${filter === 'all' && clean.length ? `<div class="card muted">규칙에 걸리지 않은 조항: ${esc(clean.join(', '))}. 걸리지 않았다고 문제가 없다는 뜻은 아닙니다.</div>` : ''}`;
  $$('.stat', $('#reviewOut')).forEach((b) => (b.onclick = () => renderReview(b.dataset.filter)));
  $$('textarea[data-fix]', $('#reviewOut')).forEach((t) => (t.oninput = () => {
    const [ci, ii] = t.dataset.fix.split('-').map(Number); review.clauses[ci].issues[ii].fix = t.value;
  }));
  $$('[data-notice]', $('#reviewOut')).forEach((b) => (b.onclick = () => startNotice(b.dataset.notice, b.dataset.clause)));
  $('#repDoc').onclick = () => download(`계약서검토보고서_${review.date.replace(/\.\s?/g, '')}.doc`, reportHtml(), 'application/msword');
  $('#repMd').onclick = () => download(`계약서검토보고서_${review.date.replace(/\.\s?/g, '')}.md`, reportMd(), 'text/markdown');
  $('#repPrint').onclick = () => window.print();
}

function missingHtml(missing) {
  if (!missing.length) return '';
  return `<div class="clause"><div class="ch"><strong>빠진 조항 (계약서 전체에서 찾지 못함)</strong></div>` + missing.map((m) =>
    `<div class="issue"><h4><span class="lv 빠짐">빠짐</span>${esc(m.title)}</h4><p>${esc(m.why)}</p>
     <p><span class="k">넣을 문구 예시</span>${esc(m.fix)}</p></div>`).join('') + '</div>';
}

function clauseHtml(c) {
  const ci = review.clauses.indexOf(c);
  return `<div class="clause"><div class="ch"><strong>${esc(c.title)}</strong>${c.issues.map((i) => `<span class="lv ${i.rule.level}">${i.rule.level}</span>`).join('')}</div>
    <div class="orig">${highlight(c.text, c.ranges)}</div>
    ${c.issues.map((i, ii) => `<div class="issue" data-lawholder>
      <h4><span class="lv ${i.rule.level}">${i.rule.level}</span>${esc(i.rule.title)}</h4>
      <p><span class="k">왜</span>${esc(i.rule.why)}</p>
      <p><span class="k">확인할 점</span>${esc(i.rule.check)}</p>
      ${i.rule.laws.length ? `<div class="laws">${lawChips(i.rule.laws)}</div>` : ''}
      <div class="fixlabel"><span class="k">수정안 (고쳐 쓰세요)</span>
        ${i.rule.notice ? `<button class="btn small" data-notice="${i.rule.notice}" data-clause="${ci}">이 조항으로 내용증명 쓰기 →</button>` : ''}</div>
      <textarea rows="3" data-fix="${ci}-${ii}">${esc(i.fix)}</textarea>
    </div>`).join('')}</div>`;
}

const DISCLAIMER = '이 보고서는 규칙에 따라 검토할 조항을 표시한 것이며 법률 자문이 아닙니다. 표시되지 않은 조항도 문제가 될 수 있으므로, 중요한 계약은 전문가의 검토를 받으시기 바랍니다.';

function reportHtml() {
  const { clauses, missing, counts, date } = review;
  const lawList = (laws) => laws.map(([n, a, note]) => `${n} 제${a}조(${note})`).join(', ');
  const rows = clauses.filter((c) => c.issues.length).map((c) => c.issues.map((i) =>
    `<tr><td>${esc(c.title)}</td><td>${i.rule.level}</td><td><b>${esc(i.rule.title)}</b><br>${esc(i.rule.why)}<br><i>확인: ${esc(i.rule.check)}</i>
     ${i.rule.laws.length ? `<br>관련 법령: ${esc(lawList(i.rule.laws))}` : ''}</td><td>${esc(i.fix).replace(/\n/g, '<br>')}</td></tr>`).join('')).join('');
  return `<html><head><meta charset="utf-8"><style>body{font-family:'Malgun Gothic';font-size:10.5pt}table{border-collapse:collapse;width:100%}
    td,th{border:1px solid #888;padding:4px 6px;vertical-align:top}th{background:#eee}</style></head><body>
    <h1>계약서 검토 보고서</h1><p>검토일: ${date} · 위험 높음 ${counts.높음}건 · 중간 ${counts.중간}건 · 확인 필요 ${counts.낮음}건 · 빠진 조항 ${missing.length}건</p>
    <h2>조항별 검토</h2><table><tr><th style="width:14%">조항</th><th style="width:7%">위험</th><th>내용</th><th style="width:32%">수정안</th></tr>${rows}</table>
    ${missing.length ? `<h2>빠진 조항</h2><ul>${missing.map((m) => `<li><b>${esc(m.title)}</b>: ${esc(m.why)}<br>예시: ${esc(m.fix)}</li>`).join('')}</ul>` : ''}
    <p style="color:#666">${DISCLAIMER}</p></body></html>`;
}

function reportMd() {
  const { clauses, missing, counts, date } = review;
  let s = `# 계약서 검토 보고서\n\n검토일: ${date} · 위험 높음 ${counts.높음}건 · 중간 ${counts.중간}건 · 확인 필요 ${counts.낮음}건 · 빠진 조항 ${missing.length}건\n\n`;
  for (const c of clauses.filter((x) => x.issues.length)) {
    s += `## ${c.title}\n\n> ${c.text.replace(/\n/g, '\n> ')}\n\n`;
    for (const i of c.issues) {
      s += `### [${i.rule.level}] ${i.rule.title}\n- 왜: ${i.rule.why}\n- 확인할 점: ${i.rule.check}\n`;
      if (i.rule.laws.length) s += `- 관련 법령: ${i.rule.laws.map(([n, a, note]) => `${n} 제${a}조(${note})`).join(', ')}\n`;
      s += `- 수정안:\n\n  ${i.fix.replace(/\n/g, '\n  ')}\n\n`;
    }
  }
  if (missing.length) s += `## 빠진 조항\n\n${missing.map((m) => `- **${m.title}**: ${m.why}\n  - 예시: ${m.fix}`).join('\n')}\n\n`;
  return s + `---\n${DISCLAIMER}\n`;
}

/* ---------------------------------------------------------- ② 내용증명 */
const FIELD_DEFS = {
  contract: [['contractDate', '계약일', 'date'], ['contractName', '계약 이름', 'text', '웹사이트 제작 용역']],
  amount: [['amount', '금액 (예: 금 3,000만원)', 'text', '금 30,000,000원(금 삼천만원)']],
  dueOrig: [['dueOrig', '원래 지급 기일', 'date']],
  deadline: [['deadline', '이행 기한 (이날까지)', 'date']],
  account: [['account', '입금 계좌', 'text', '○○은행 000-0000-0000 (예금주 홍길동)']],
  duty: [['duty', '이행해야 할 의무', 'text', '최종 결과물 납품']],
  defect: [['defect', '하자 내용', 'text', '로그인 기능 오류(2026. 10. 5. 발견)']],
  endDate: [['endDate', '종료일 · 해지일', 'date']],
  reason: [['reason', '해지 근거', 'text', '계약서 제6조']],
  facts: [],
};
const notice = store.get('notice', { type: 'payment' });

function noticeFieldsHtml(tpl) {
  return tpl.fields.flatMap((f) => FIELD_DEFS[f]).map(([k, label, type, ph]) =>
    `<label class="f"><span>${label}</span><input type="${type}" data-n="${k}" placeholder="${esc(ph || '')}"></label>`).join('');
}

function bindNoticeInputs() {
  $$('[data-n]').forEach((el) => {
    if (notice[el.dataset.n] != null) el.value = notice[el.dataset.n];
    el.oninput = () => { notice[el.dataset.n] = el.value; saveNotice(); renderPaper(); };
  });
}
function saveNotice() {
  // 발신인 정보와 작성 중인 내용은 이 브라우저에만 남는다
  store.set('notice', notice);
}

function setType(type, keepSubject) {
  const tpl = window.NOTICE_TEMPLATES[type];
  notice.type = type;
  $('#nType').value = type;
  $('#nFields').innerHTML = noticeFieldsHtml(tpl);
  if (!keepSubject || !notice.subject) notice.subject = tpl.subject;
  $('#nLaws').innerHTML = `<span class="k muted" style="font-size:12px">근거 조문:</span> ${lawChips(tpl.laws)}`;
  $('#nLaws').setAttribute('data-lawholder', '');
  bindNoticeInputs();
  renderPaper();
}

function buildBody() {
  const tpl = window.NOTICE_TEMPLATES[notice.type];
  const v = { ...notice };
  for (const k of ['contractDate', 'dueOrig', 'deadline', 'endDate']) v[k] = fmtDate(notice[k]);
  notice.body = tpl.body(v).join('\n\n');
  $('#nBody').value = notice.body;
  saveNotice(); renderPaper();
}
$('#buildBtn').onclick = buildBody;
$('#nBody').oninput = () => { notice.body = $('#nBody').value; saveNotice(); renderPaper(); };
$('#nType').innerHTML = Object.entries(window.NOTICE_TEMPLATES).map(([k, t]) => `<option value="${k}">${t.label}</option>`).join('');
$('#nType').onchange = () => { setType($('#nType').value, false); buildBody(); };

function paragraphs() { return (notice.body || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean); }

function renderPaper() {
  const n = notice;
  $('#paper').innerHTML = `<h1>내용증명</h1>
    <table>
      <tr><td class="h" rowspan="2">수신인</td><td>성명 · 상호: ${esc(n.rName || '')}</td></tr><tr><td>주소: ${esc(n.rAddr || '')}</td></tr>
      <tr><td class="h" rowspan="2">발신인</td><td>성명 · 상호: ${esc(n.sName || '')}${n.sPhone ? ` (연락처: ${esc(n.sPhone)})` : ''}</td></tr><tr><td>주소: ${esc(n.sAddr || '')}</td></tr>
    </table>
    <div class="subj">제 목 : ${esc(n.subject || '')}</div>
    <p>1. 귀하의 건승을 기원합니다.</p>
    <ol start="2">${paragraphs().map((p) => `<li>${esc(p)}</li>`).join('')}</ol>
    <div class="date">${today()}</div>
    <div class="sign">위 발신인 &nbsp; ${esc(n.sName || '')} &nbsp; (서명 또는 인)</div>`;
  renderChecklist();
}

function renderChecklist() {
  const n = notice;
  const tpl = window.NOTICE_TEMPLATES[n.type];
  const items = [];
  const add = (state, text) => items.push([state, text]);
  const filled = (k) => (n[k] || '').trim();
  add(filled('sName') && filled('sAddr') ? 'ok' : 'bad', '발신인 성명과 주소');
  add(filled('rName') && filled('rAddr') ? 'ok' : 'bad', '수신인 성명과 주소 (등기부·사업자등록 기준으로 정확히)');
  add(filled('subject') ? 'ok' : 'bad', '제목');
  add(paragraphs().length ? 'ok' : 'bad', '본문 (본문 만들기를 누르세요)');
  if (/○/.test(n.body || '')) add('bad', '본문에 아직 채우지 않은 빈칸(○)이 있습니다');
  if (/적습니다\.\)|\((이행해야 할 의무|하자 내용[^)]*|해지 근거[^)]*)\)/.test(n.body || '')) add('bad', '본문에 안내 문구(괄호 속 "…적습니다")가 남아 있습니다. 사실관계를 채우거나 지우세요');
  if (tpl.fields.includes('deadline')) {
    if (!n.deadline) add('bad', '이행 기한 날짜를 정하세요');
    else {
      const days = Math.round((new Date(n.deadline) - new Date(new Date().toDateString())) / 86400000);
      if (days < 0) add('bad', '이행 기한이 이미 지난 날짜입니다');
      else if (days < 7) add('warn', `이행 기한이 ${days}일 뒤입니다. 상대가 이행할 수 있는 "상당한 기간"(보통 7~14일)을 주는 것이 안전합니다`);
      else add('ok', `이행 기한까지 ${days}일`);
    }
  }
  for (const [re, msg] of window.RISKY_WORDS) if (re.test(`${n.body || ''} ${n.facts || ''}`)) add('bad', msg);
  if (['payment', 'damages', 'deposit'].includes(n.type)) {
    add('info', '내용증명(최고)은 시효를 잠시 멈출 뿐입니다. 6개월 안에 지급명령·소송 등을 하지 않으면 효과가 없어집니다 (민법 제174조)');
  }
  const manual = [['m1', '날짜 · 금액을 계약서와 증빙(이체내역 · 메시지)과 대조했다'], ['m2', '계약서 · 증빙 사본을 따로 보관했다'], ['m3', '같은 문서 3부를 준비했다 (발신인 · 수신인 · 우체국)']];
  const icon = { ok: ['✓', 'ok-ic'], warn: ['!', 'warn-ic'], bad: ['✕', 'bad-ic'], info: ['i', 'muted'] };
  $('#checklist').innerHTML = items.map(([s, t]) => `<li><span class="ic ${icon[s][1]}">${icon[s][0]}</span><span>${esc(t)}</span></li>`).join('') +
    manual.map(([k, t]) => `<li><input type="checkbox" data-m="${k}" ${n[k] ? 'checked' : ''}><span>${esc(t)}</span></li>`).join('');
  $$('[data-m]').forEach((c) => (c.onchange = () => { notice[c.dataset.m] = c.checked; saveNotice(); }));
}

$('#printBtn').onclick = () => { document.body.classList.add('print-notice'); window.print(); document.body.classList.remove('print-notice'); };
$('#copyBtn').onclick = () => navigator.clipboard?.writeText($('#paper').innerText).then(() => { $('#copyBtn').textContent = '복사됨'; setTimeout(() => ($('#copyBtn').textContent = '본문 복사'), 1200); });
$('#docBtn').onclick = () => download(`내용증명_${(notice.subject || '').replace(/[\\/:*?"<>|]/g, '')}.doc`,
  `<html><head><meta charset="utf-8"><style>body{font-family:'Batang';font-size:11pt;line-height:1.8}table{border-collapse:collapse;width:100%}td{border:1px solid #555;padding:4px 8px}
   h1{text-align:center;letter-spacing:14pt}.date{text-align:center;margin-top:24pt}.sign{text-align:right}</style></head><body>${$('#paper').innerHTML}</body></html>`, 'application/msword');

// 검토 결과에서 넘어올 때: 계약 이름과 문제 조항을 사실관계에 미리 넣는다
function startNotice(type, clauseIdx) {
  const c = review?.clauses[Number(clauseIdx)];
  if (c && !notice.facts) notice.facts = `(관련 계약 조항) ${c.title}\n`;
  setType(type, false);
  buildBody();
  showTab('notice');
  window.scrollTo(0, 0);
}

/* -------------------------------------------------------- ③ 법령 · 판례 */
const LAW_NAMES = ['민법', '상법', '약관의 규제에 관한 법률', '하도급거래 공정화에 관한 법률', '민사소송법', '이자제한법', '저작권법',
  '주택임대차보호법', '상가건물 임대차보호법', '소송촉진 등에 관한 특례법', '근로기준법', '전자상거래 등에서의 소비자보호에 관한 법률'];
$('#lawList').innerHTML = LAW_NAMES.map((n) => `<option value="${esc(n)}">`).join('');
$('#lawBtn').onclick = async () => {
  $('#lawOut').innerHTML = '<div class="lawbox"><span class="spinner"></span>가져오는 중…</div>';
  $('#lawOut').innerHTML = await lawBox($('#lawName').value.trim(), $('#lawArt').value.trim());
};
$('#precBtn').onclick = async () => {
  const q = $('#precQ').value.trim(); if (!q) return;
  $('#precOut').innerHTML = '<p class="muted"><span class="spinner"></span>검색 중…</p>';
  try {
    const { items } = await api(`/api/prec?query=${encodeURIComponent(q)}`);
    $('#precOut').innerHTML = items.length ? items.map((p) => `<div class="list-item" data-prec="${esc(p.id)}"><b>${esc(p.title)}</b><br>
      <span class="muted">${esc(p.court)} ${esc(p.date)} ${esc(p.caseNo)}</span><div class="pd"></div></div>`).join('') : '<p class="muted">검색 결과가 없습니다. 더 짧은 키워드로 해 보세요.</p>';
  } catch (e) { $('#precOut').innerHTML = `<p class="err">${esc(e.message)}</p>`; }
};
$('#precOut').addEventListener('click', async (e) => {
  const item = e.target.closest('[data-prec]'); if (!item || e.target.closest('a')) return;
  const box = $('.pd', item);
  if (box.innerHTML) { box.innerHTML = ''; return; }
  box.innerHTML = '<div class="lawbox"><span class="spinner"></span>가져오는 중…</div>';
  try {
    const p = await api(`/api/prec/detail?id=${item.dataset.prec}`);
    box.innerHTML = `<div class="lawbox">${p.issues ? `<b>판시사항</b>\n${esc(p.issues)}\n\n` : ''}${p.summary ? `<b>판결요지</b>\n${esc(p.summary)}\n\n` : ''}${p.refs ? `<b>참조조문</b>\n${esc(p.refs)}\n\n` : ''}<a href="${esc(p.url)}" target="_blank" rel="noopener">법제처에서 전문 보기 ↗</a></div>`;
  } catch (err) { box.innerHTML = `<div class="lawbox err">${esc(err.message)}</div>`; }
});

/* ----------------------------------------------------------------- 시작 */
setType(notice.type || 'payment', true);
if (notice.body) $('#nBody').value = notice.body;
renderPaper();
showTab(store.get('tab', 'review'));
api('/api/status').then(() => { $('#dot').className = 'dot ok'; $('#statusText').textContent = '법제처 연결됨'; })
  .catch((e) => { $('#dot').className = 'dot bad'; $('#statusText').textContent = '법제처 연결 안 됨'; $('#statusText').title = e.message; });
