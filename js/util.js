/* =====================================================================
 * 공용 유틸리티
 * ===================================================================== */

const U = (() => {

  const el = (sel, root) => (root || document).querySelector(sel);
  const els = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function make(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  /* &nbsp; 는 살리고 나머지 &, <, > 만 이스케이프한다.
     ( 본문 수식에 <, > 가 그대로 들어 있기 때문에 반드시 필요 ) */
  const NB = 'NBSP';
  function esc(text) {
    return text
      .split('&nbsp;').join(NB)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .split(NB).join('&nbsp;');
  }

  /* 문제 본문 → HTML */
  function questionHtml(q) {
    const blocks = q.body.split(/\n[ \t]*\n/);
    const numTag = '<span class="qnum">' + q.no + '.</span>';
    let out = '';
    let numberPlaced = false;

    blocks.forEach(block => {
      const raw = block.replace(/\s+$/, '');
      if (!raw.trim()) return;
      const lines = raw.split('\n');
      const first = lines[0].trim();
      const trimmed = raw.trim();
      const isDisplay = trimmed.startsWith('$$') && trimmed.endsWith('$$');
      const isBox = /^〈[^〉]+〉$/.test(first);
      const isChoice = first.startsWith('①');

      if (isBox) {
        const title = esc(first);
        const items = lines.slice(1).map(l => '<div class="qbox__item">' + esc(l) + '</div>').join('');
        out += '<div class="qbox"><div class="qbox__hd">' + title + '</div>' + items + '</div>';
        return;
      }

      let inner = lines.map(esc).join('<br>');

      if (isDisplay) {
        if (!numberPlaced) { out += '<p class="qp qp--numonly">' + numTag + '</p>'; numberPlaced = true; }
        out += '<div class="qdisplay">' + inner + '</div>';
        return;
      }

      if (!numberPlaced) { inner = numTag + ' ' + inner; numberPlaced = true; }
      out += '<p class="' + (isChoice ? 'qchoice' : 'qp') + '">' + inner + '</p>';
    });

    return out.split('⟦REDACT⟧').join(REDACT_TAPE_HTML);
  }

  /* 이름 등을 가린 자리에 넣는 '검은 테이프' 연출 (글리치 + 전광판 마퀴) */
  const REDACT_TAPE_HTML =
    '<span class="redact-tape" aria-label="가려짐">' +
      '<span class="redact-tape__track">' +
        '<span class="redact-tape__seg">[REDACTED]</span>' +
        '<span class="redact-tape__seg">[REDACTED]</span>' +
      '</span>' +
    '</span>';

  /* KaTeX 렌더링 */
  function typeset(node) {
    if (typeof renderMathInElement !== 'function') return;
    try {
      renderMathInElement(node, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false }
        ],
        throwOnError: false,
        strict: false,
        trust: false
      });
    } catch (e) { /* 렌더 실패 시 원문 노출 */ }
  }

  /* mm:ss */
  function clock(ms) {
    if (ms < 0) ms = 0;
    const t = Math.ceil(ms / 1000);
    const m = Math.floor(t / 60), s = t % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function durationText(ms) {
    const t = Math.round(ms / 1000);
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    return (h ? h + '시간 ' : '') + m + '분 ' + s + '초';
  }

  const CIRCLED = ['', '①', '②', '③', '④', '⑤'];

  /* 동그라미 숫자를 유니코드 글리프(①⓪ 등) 대신 테두리로 직접 그려서 만든다.
     Pretendard 는 이 글리프들을 전부 갖고 있지 않아 숫자마다 서로 다른
     대체 글꼴로 렌더링되고, 그래서 특히 ⓪ 이 다른 숫자와 다르게 보인다. */
  function circ(n) { return '<i class="circ">' + n + '</i>'; }

  /* ---------- 점수 분포 막대그래프 ----------
     scores: 전체 응시자 점수 배열, mineScore: 본인 점수(없으면 null → 순위 없이 회색만)
     응시자 한 명당 막대 하나가 아니라 5점 단위 구간별 인원수(히스토그램)로 그린다.
     응시자가 아주 많아져도(수백~수천 명) 막대 개수가 늘지 않아 가로 스크롤 없이 항상 한눈에 들어온다. */
  function scoreChart(scores, mineScore) {
    const total = CONFIG.totalScore;
    const n = scores.length;
    if (!n) return '<p class="scorechart__empty">아직 집계된 결과가 없습니다.</p>';

    const bucketSize = 5;
    const numBuckets = Math.ceil((total + 1) / bucketSize);
    const counts = new Array(numBuckets).fill(0);
    scores.forEach(s => { counts[Math.min(numBuckets - 1, Math.floor(s / bucketSize))]++; });
    const maxCount = Math.max.apply(null, counts);

    const mineBucket = mineScore != null ? Math.min(numBuckets - 1, Math.floor(mineScore / bucketSize)) : -1;
    const bars = counts.map((c, i) => {
      const h = c ? Math.max(4, Math.round(c / maxCount * 100)) : 0;
      const lo = i * bucketSize, hi = Math.min(total, lo + bucketSize - 1);
      return '<div class="scorechart__bar' + (i === mineBucket ? ' is-mine' : '') + '" style="height:' + h + '%" title="' + lo + '~' + hi + '점 · ' + c + '명"></div>';
    }).join('');

    // 막대 아래 점수 범위 힌트(0점~만점 사이 5~6개 눈금만 표시해 막대와 겹치지 않게 한다)
    const tickCount = Math.min(5, numBuckets - 1);
    const tickIdx = new Set();
    for (let t = 0; t <= tickCount; t++) tickIdx.add(Math.round(t * (numBuckets - 1) / tickCount));
    const axis = counts.map((c, i) =>
      '<span class="scorechart__tick">' + (tickIdx.has(i) ? i * bucketSize + '점' : '') + '</span>'
    ).join('');

    let rank = '';
    if (mineScore != null) {
      const better = scores.filter(s => s > mineScore).length;
      const r = better + 1;
      const pct = Math.max(1, Math.round(r / n * 100));
      rank = '<p class="scorechart__rank">전체 <b>' + n + '명</b> 중 <b>' + r + '위</b> · 상위 <b>' + pct + '%</b></p>';
    }

    return '<div class="scorechart__bars">' + bars + '</div>' +
           '<div class="scorechart__axis">' + axis + '</div>' + rank;
  }

  /* ---------- 모달 ---------- */
  let modalResolve = null;
  function modal(opts) {
    const box = el('#modal');
    el('#modalTitle').textContent = opts.title || '';
    el('#modalBody').innerHTML = opts.body || '';
    const foot = el('#modalFoot');
    foot.innerHTML = '';
    (opts.buttons || [{ label: '확인', value: true, kind: 'primary' }]).forEach(b => {
      const btn = make('button', 'btn btn--' + (b.kind || 'ghost'), b.label);
      btn.type = 'button';
      btn.addEventListener('click', () => closeModal(b.value));
      foot.appendChild(btn);
    });
    box.classList.add('is-open');
    box.setAttribute('aria-hidden', 'false');
    return new Promise(res => { modalResolve = res; });
  }
  function closeModal(v) {
    const box = el('#modal');
    box.classList.remove('is-open');
    box.setAttribute('aria-hidden', 'true');
    if (modalResolve) { modalResolve(v); modalResolve = null; }
  }

  /* ---------- 토스트 ---------- */
  let toastTimer = null;
  function toast(msg, ms) {
    const t = el('#toast');
    t.textContent = msg;
    t.hidden = false;
    requestAnimationFrame(() => t.classList.add('is-on'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      t.classList.remove('is-on');
      setTimeout(() => { t.hidden = true; }, 260);
    }, ms || 2200);
  }

  return { el, els, make, esc, questionHtml, typeset, clock, durationText, CIRCLED, circ, scoreChart, modal, closeModal, toast };
})();
