/* =====================================================================
 * 응시 안내(체험) — 인적사항 작성 완료 후, 실제 시험을 시작하기 전에
 * OMR 탭 · 문항 이동 · 필기 도구 사용법을 아주 쉬운 연습 문제 두 개로
 * 직접 체험해 보게 한다. 진짜 QUESTIONS/Store 상태는 전혀 건드리지 않는
 * 독립된 화면이라, 여기서 무엇을 하든 실제 답안에는 영향이 없다.
 * ===================================================================== */

const Tutorial = (() => {

  const TUT_QUESTIONS = [
    { no: 1, text: '$2^{2}\\times 2^{3}$의 값을 구하시오.', answer: 32 },
    { no: 2, text: '$3^{2}+4^{2}$의 값을 구하시오.', answer: 25 }
  ];

  let cur = 1;                                    // 현재 보고 있는 연습 문항 번호
  const answers = { 1: [null, null, null], 2: [null, null, null] };   // 백 · 십 · 일
  const strokesMap = { 1: [], 2: [] };
  const answered = { 1: false, 2: false };
  let penTool = 'pen';               // pen | eraser
  let omrTool = 'pen';               // pen | white
  let fingerDraw = false;            // 기본 꺼짐 — 켜지 않으면 손(손바닥 등)이 스쳐도 그려지지 않는다

  let paperScroll, paper, inner, canvas, ink, eraserCursor, mounted = false;
  let loadedFor = null;              // 캔버스에 현재 올라와 있는 연습 문항 번호
  let omrRoot, guideBound = false;
  let step = 0;
  let finishResolve = null;
  let rt = null;

  const STEPS = [
    {
      title: '① 문제 읽기 · 필기',
      body: '문제지에는 펜으로 직접 풀이를 적을 수 있습니다. 아래 연습 문제 위에 펜으로 자유롭게 써 보세요. ' +
            '잘못 썼다면 <b>획 지우개</b>를 고른 뒤 지우고 싶은 획을 다시 누르면 지워집니다. ' +
            '<b>손가락 필기</b>는 기본적으로 꺼져 있어 손이 스쳐도 그려지지 않습니다 — 스타일러스가 없어 손가락으로 써야 할 때만 켜세요.',
      spot: ['#tutPaperScroll', '.screen#screenTutorial .tools']
    },
    {
      title: '② 문항 이동',
      body: '실제 시험은 문항이 여러 개입니다. ◀ ▶ 버튼으로 옆 문항으로 옮겨 다니거나, 가운데 <b>번호 버튼</b>을 누르면 ' +
            '문항 목록이 열려 원하는 문항으로 바로 건너뛰거나 <b>현재 문항 필기 지우기</b>도 한 번에 할 수 있습니다. ' +
            '▶ 로 2번까지 가 본 뒤, 번호 버튼을 눌러 목록에서 다시 1번으로 이동해 보세요.',
      spot: ['.screen#screenTutorial .topbar__group--center']
    },
    {
      title: '③ OMR 답안지에 마킹하기',
      body: '오른쪽 귀퉁이의 <b>OMR</b> 탭을 눌러 답안지를 열어 보세요. 예시 1번의 정답 <b>32</b>는 십의 자리에 3, ' +
            '일의 자리에 2를(백의 자리는 비워 둠), 예시 2번의 정답 <b>25</b>는 십의 자리에 2, 일의 자리에 5를 표기하면 됩니다. ' +
            '실제 시험은 화면에 마킹된 것만 채점되므로, 풀이는 필기로 남기고 답은 반드시 OMR에 표기해야 합니다.',
      spot: ['#tutOmrTab']
    }
  ];

  /* ---------------- 문제지 · 필기 ---------------- */

  function questionHtml(q) {
    return '' +
      '<div class="qmeta">' +
        '<span class="qmeta__author">연습 문항</span>' +
        '<span class="qmeta__pt">3점 · 단답형</span>' +
      '</div>' +
      '<div class="qtext" id="tutQtext">' +
        '<p class="qp"><span class="qnum">예시 ' + q.no + '.</span> ' + q.text + '</p>' +
      '</div>' +
      '<div class="workline"><span>이 아래는 필기 공간입니다</span></div>';
  }

  function relayout() {
    if (!mounted) return;
    const minH = paperScroll.clientHeight - 2;
    const need = inner.offsetHeight + 200;
    paper.style.height = Math.max(minH, need) + 'px';
    const w = paper.clientWidth, h = paper.clientHeight;
    const size = ink.size();
    if (Math.abs(size.w - w) > 0.5 || Math.abs(size.h - h) > 0.5) ink.resizeTo(w, h);
  }

  function saveStrokes() {
    if (!ink || loadedFor == null) return;
    strokesMap[loadedFor] = ink.dump();
  }

  /* ---------- 지우개 범위 표시 ---------- */
  function showEraserCursor(e) {
    if (!eraserCursor || penTool !== 'erase-area') { hideEraserCursor(); return; }
    const r = canvas.getBoundingClientRect();
    eraserCursor.style.left = (e.clientX - r.left) + 'px';
    eraserCursor.style.top = (e.clientY - r.top) + 'px';
    eraserCursor.hidden = false;
  }
  function hideEraserCursor() {
    if (eraserCursor) eraserCursor.hidden = true;
  }

  function updateUndoRedo() {
    if (!ink) return;
    const bu = U.el('#tutUndo'), br = U.el('#tutRedo');
    if (bu) bu.disabled = !ink.canUndo();
    if (br) br.disabled = !ink.canRedo();
  }

  function updateNavUI() {
    U.el('#tutQpickNo').textContent = cur;
    U.el('#tutPrev').disabled = (cur === 1);
    U.el('#tutNext').disabled = (cur === TUT_QUESTIONS.length);
    U.el('#tutQpickNo').classList.toggle('is-marked', digitsValue(cur) != null);
    paintQlist();
  }

  /* 가운데 번호 버튼을 누르면 열리는 문항 목록. 실제 시험의 #qlist 와 같은
     구성으로, 번호를 눌러 바로 그 문항으로 건너뛰거나 현재 문항 필기를
     한 번에 지울 수 있다는 것을 함께 보여 준다. */
  function paintQlist() {
    const grid = U.el('#tutQlistGrid');
    if (!grid) return;
    if (!grid.childElementCount) {
      grid.innerHTML = TUT_QUESTIONS.map(q =>
        '<button type="button" class="qchip" data-no="' + q.no + '">' +
          '<span class="qchip__no">' + q.no + '</span><span class="qchip__pt">예시</span></button>').join('');
      grid.addEventListener('click', e => {
        const b = e.target.closest('.qchip');
        if (!b) return;
        show(+b.dataset.no);
        U.el('#tutQlist').hidden = true;
      });
    }
    U.els('.qchip', grid).forEach(b => {
      const no = +b.dataset.no;
      b.classList.toggle('is-done', digitsValue(no) != null);
      b.classList.toggle('is-cur', no === cur);
    });
  }

  function show(no) {
    if (no < 1) no = 1;
    if (no > TUT_QUESTIONS.length) no = TUT_QUESTIONS.length;
    saveStrokes();
    cur = no;
    const q = TUT_QUESTIONS[cur - 1];
    inner.innerHTML = questionHtml(q);
    U.typeset(U.el('#tutQtext', inner));
    paperScroll.scrollTop = 0;
    relayout();
    ink.load(strokesMap[cur] || []);
    loadedFor = cur;
    updateUndoRedo();
    requestAnimationFrame(() => {                 // 웹폰트가 늦게 붙는 경우를 대비한 재계산
      const before = paper.style.height;
      relayout();
      if (paper.style.height !== before) { ink.load(strokesMap[cur] || []); updateUndoRedo(); }
    });
    updateNavUI();
  }

  function bindPointer() {
    const pt = e => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    // 실제 시험 화면(js/exam.js)과 같은 규칙 — 펜·마우스는 항상 그리고,
    // 손가락(touch)은 손가락 필기를 켰을 때만 그린다. 꺼져 있으면 손이
    // 스쳐도 무시되어(스크롤 등 기본 동작만 남는다) 오작동을 막는다.
    const canDraw = e => e.pointerType === 'pen' || e.pointerType === 'mouse' || (fingerDraw && e.pointerType === 'touch');
    let drawing = false;

    // Excalidraw 의 실제 수정을 그대로 옮긴 것(PR #4705, onTapStart, 커밋 7049e2a).
    // 그리기 로직이 있는 pointerdown 이 아니라, 별도로 붙인 이 touchstart 리스너
    // 맨 첫 줄에서만 preventDefault() 를 불러야 iOS Scribble 을 실제로 이긴다.
    canvas.addEventListener('touchstart', e => {
      // fix for Apple Pencil Scribble
      e.preventDefault();
    }, { passive: false });

    canvas.addEventListener('pointerdown', e => {
      if (!canDraw(e)) return;
      drawing = true;
      const [x, y] = pt(e);
      if (penTool === 'eraser') ink.eraseAt(x, y);
      else ink.begin(x, y, e.pressure || 0.5, penTool === 'erase-area' ? 'erase' : undefined);
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
    }, { passive: false });
    canvas.addEventListener('pointermove', e => {
      e.preventDefault();
      if (!drawing) return;
      if (penTool === 'eraser') {
        const [x, y] = pt(e);
        ink.eraseAt(x, y);
      } else {
        U.penEvents(e).forEach(ev => { const [x, y] = pt(ev); ink.extend(x, y, ev.pressure || 0.5); });
      }
    }, { passive: false });
    const stop = () => {
      if (!drawing) return;
      drawing = false;
      if (penTool !== 'eraser') ink.end();
      saveStrokes();
      updateUndoRedo();
    };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
    canvas.addEventListener('pointerleave', stop);
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  function setPenTool(t) {
    penTool = t;
    U.el('#tutToolPen').classList.toggle('is-on', t === 'pen');
    U.el('#tutToolEraserArea').classList.toggle('is-on', t === 'erase-area');
    U.el('#tutToolEraser').classList.toggle('is-on', t === 'eraser');
    paper.classList.toggle('is-erasing', t === 'eraser' || t === 'erase-area');
    if (t !== 'erase-area') hideEraserCursor();
  }

  function setFingerDraw(on) {
    fingerDraw = on;
    // 글자를 바꾸면 버튼 폭이 달라져 옆 버튼이 밀리므로 라벨은 그대로 두고
    // 켜짐 여부는 채움(is-on) 색으로만 표시한다.
    U.el('#tutToolFinger').classList.toggle('is-on', on);
  }

  function mountPaper() {
    if (mounted) return;
    mounted = true;
    paperScroll = U.el('#tutPaperScroll');
    paper = U.el('#tutPaper');
    inner = U.el('#tutPaperInner');
    canvas = U.el('#tutInkCanvas');
    ink = createInk(canvas);
    eraserCursor = U.el('#tutEraserCursor');
    if (eraserCursor) eraserCursor.style.width = eraserCursor.style.height = ink.eraseWidth + 'px';
    canvas.addEventListener('pointermove', showEraserCursor);
    canvas.addEventListener('pointerdown', showEraserCursor);
    canvas.addEventListener('pointerleave', hideEraserCursor);
    canvas.addEventListener('pointercancel', hideEraserCursor);
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(relayout, 160); });
    bindPointer();
    U.el('#tutToolPen').addEventListener('click', () => setPenTool('pen'));
    U.el('#tutToolEraserArea').addEventListener('click', () => setPenTool('erase-area'));
    U.el('#tutToolEraser').addEventListener('click', () => setPenTool('eraser'));
    U.el('#tutToolFinger').addEventListener('click', () => setFingerDraw(!fingerDraw));
    setFingerDraw(false);
    U.el('#tutUndo').addEventListener('click', () => {
      if (!ink.undo()) return;
      saveStrokes(); updateUndoRedo();
    });
    U.el('#tutRedo').addEventListener('click', () => {
      if (!ink.redo()) return;
      saveStrokes(); updateUndoRedo();
    });
    updateUndoRedo();
    U.el('#tutPrev').addEventListener('click', () => show(cur - 1));
    U.el('#tutNext').addEventListener('click', () => show(cur + 1));
    U.el('#tutQpickBtn').addEventListener('click', () => {
      const p = U.el('#tutQlist');
      p.hidden = !p.hidden;
      if (!p.hidden) paintQlist();
    });
    U.el('#tutClearInk').addEventListener('click', async () => {
      const ok = await U.modal({
        title: '필기 지우기',
        body: '<p>현재 문항(예시 ' + cur + '번)의 필기를 모두 지웁니다. 되돌릴 수 없습니다.</p>',
        buttons: [{ label: '취소', value: false }, { label: '지우기', value: true, kind: 'danger' }]
      });
      if (ok) { ink.clear(); saveStrokes(); updateUndoRedo(); U.toast('필기를 지웠습니다.'); }
    });
    setPenTool('pen');
  }

  /* ---------------- 연습용 OMR ---------------- */

  function bubble(qNo, slot, val) {
    return '<button type="button" class="bub" data-q="' + qNo + '" data-slot="' + slot + '" data-v="' + val + '"><span>' + val + '</span></button>';
  }

  function ansColumnHtml(q) {
    let rows = '';
    for (let d = 0; d <= 9; d++) {
      const hun = d === 0 ? '<span class="dcell dcell--blank"></span>' : '<span class="dcell">' + bubble(q.no, 0, d) + '</span>';
      const ten = '<span class="dcell">' + bubble(q.no, 1, d) + '</span>';
      const one = '<span class="dcell">' + bubble(q.no, 2, d) + '</span>';
      rows += '<div class="drow">' + hun + ten + one + '</div>';
    }
    return '<div class="qcol" id="tutQcol' + q.no + '">' +
      '<div class="qcol__hd">예시 ' + q.no + '</div>' +
      '<div class="qcol__sub"><span>백</span><span>십</span><span>일</span></div>' +
      '<div class="qcol__body">' + rows + '</div></div>';
  }

  function digitsValue(no) {
    const d = answers[no];
    const first = d.findIndex(x => x != null);
    if (first < 0) return null;
    let n = 0;
    for (let i = first; i < d.length; i++) n = n * 10 + (d[i] == null ? 0 : d[i]);
    return n;
  }

  function paintOmr() {
    omrRoot.querySelectorAll('.bub').forEach(b => {
      const no = +b.dataset.q, slot = +b.dataset.slot, v = +b.dataset.v;
      b.classList.toggle('is-on', answers[no][slot] === v);
    });
    TUT_QUESTIONS.forEach(q => {
      const col = U.el('#tutQcol' + q.no);
      const val = digitsValue(q.no);
      if (col) col.classList.toggle('is-filled', val != null);
      if (!answered[q.no] && val === q.answer) {
        answered[q.no] = true;
        U.toast('예시 ' + q.no + '번을 정답과 같은 값으로 표기했습니다. 이렇게 표기하면 됩니다!', 2600);
      }
    });
    paintQlist();
  }

  function setOmrTool(t) {
    omrTool = t;
    omrRoot.classList.toggle('is-white', t === 'white');
    U.el('#tutOmrToolPen').classList.toggle('is-on', t === 'pen');
    U.el('#tutOmrToolWhite').classList.toggle('is-on', t === 'white');
  }

  function openOmr(open) {
    const ov = U.el('#tutOmrOverlay');
    ov.classList.toggle('is-open', open);
    ov.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  function mountOmr() {
    const host = U.el('#tutOmrHost');
    if (host.childElementCount) { omrRoot = U.el('#tutOmrRoot'); return; }
    host.innerHTML =
      '<div class="omr tut-omr" id="tutOmrRoot">' +
        '<div class="omr__ans">' +
          '<div class="omr__ansHd">답 란 (연습)</div>' +
          '<div class="tut-ansgrid">' + TUT_QUESTIONS.map(ansColumnHtml).join('') + '</div>' +
        '</div>' +
      '</div>';
    omrRoot = U.el('#tutOmrRoot');
    omrRoot.addEventListener('click', e => {
      const btn = e.target.closest('.bub');
      if (!btn) return;
      const no = +btn.dataset.q, slot = +btn.dataset.slot, v = +btn.dataset.v;
      answers[no][slot] = (omrTool === 'white') ? (answers[no][slot] === v ? null : answers[no][slot]) : v;
      paintOmr();
    });
    U.el('#tutOmrTab').addEventListener('click', () => openOmr(true));
    U.el('#tutOmrClose').addEventListener('click', () => openOmr(false));
    U.el('#tutOmrToolPen').addEventListener('click', () => setOmrTool('pen'));
    U.el('#tutOmrToolWhite').addEventListener('click', () => setOmrTool('white'));
    paintOmr();
  }

  /* ---------------- 단계 안내 ---------------- */

  function clearSpot() {
    U.els('.tut-spot').forEach(n => n.classList.remove('tut-spot'));
  }

  function renderStep() {
    clearSpot();
    const s = STEPS[step];
    s.spot.forEach(sel => {
      const n = U.el(sel);
      if (n) n.classList.add('tut-spot');
    });
    U.el('#tutGuideStep').textContent = (step + 1) + ' / ' + STEPS.length;
    U.el('#tutGuideTitle').textContent = s.title;
    U.el('#tutGuideBody').innerHTML = s.body;
    U.el('#tutBack').hidden = (step === 0);
    const nextBtn = U.el('#tutNextBtn');
    nextBtn.textContent = (step === STEPS.length - 1) ? '완료 · 시험 시작' : '다음';
    if (step === STEPS.length - 1) openOmr(false);
  }

  function bindGuide() {
    if (guideBound) return;
    guideBound = true;
    U.el('#tutBack').addEventListener('click', () => { if (step > 0) { step--; renderStep(); } });
    U.el('#tutNextBtn').addEventListener('click', () => {
      if (step < STEPS.length - 1) { step++; renderStep(); }
      else finish();
    });
  }

  function finish() {
    clearSpot();
    openOmr(false);
    if (finishResolve) { const r = finishResolve; finishResolve = null; r(); }
  }

  /* ---------------- 진입 ---------------- */

  function activate() {
    U.els('.screen').forEach(sc => sc.classList.toggle('is-active', sc.id === 'screenTutorial'));
    window.scrollTo(0, 0);
    Viewport.sync('screenTutorial');
  }

  /* 인적사항 작성을 마친 뒤 호출한다. 반환된 프로미스는 사용자가 마지막
     단계에서 '완료 · 시험 시작'을 눌러야만 resolve 되며, 그 전까지는
     실제 시험(타이머·문항)이 전혀 시작되지 않는다. */
  function run() {
    return new Promise(resolve => {
      finishResolve = resolve;
      cur = 1;
      TUT_QUESTIONS.forEach(q => { answers[q.no] = [null, null, null]; strokesMap[q.no] = []; answered[q.no] = false; });
      mountPaper();
      mountOmr();
      bindGuide();
      step = 0;
      activate();
      renderStep();
      show(1);
    });
  }

  return { run };
})();
